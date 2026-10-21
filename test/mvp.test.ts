import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ImapFlow } from 'imapflow';
import { MailService, MAX_BYTES, parseMail } from '../src/mail.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createServer as createTcpServer } from 'node:net';

function fixture() {
  const calls: unknown[][] = [];
  const fake = {
    mailbox: { uidNext: 11, uidValidity: 123n },
    on() {}, async connect() {}, close() { calls.push(['close']); },
    async getMailboxLock(...args: unknown[]) { calls.push(['lock', ...args]); return { release() { calls.push(['release']); } }; },
    async search(...args: unknown[]) { calls.push(['search', ...args]); return [2, 10]; },
    async fetchAll(...args: unknown[]) { calls.push(['fetchAll', ...args]); return (args[0] as number[]).map(uid => ({ uid, size: 20 })); },
    async fetchOne(...args: unknown[]) { calls.push(['fetchOne', ...args]); return { size: 40, source: Buffer.from('Subject: test\r\n\r\nCode 123456 https://example.invalid/test') }; },
    async noop() {},
  };
  return { fake, calls, service: new MailService(() => fake as unknown as ImapFlow) };
}

test('search maps filters, bounds results, uses UIDs and read-only lock', async () => {
  const { service, calls } = fixture();
  const found = await service.search({ subject: 'test', from: 'fake@example.invalid', since: '2026-01-01T00:00:00Z' }, 1);
  assert.equal(found.total, 2);
  assert.equal(found.messages.length, 1);
  assert.deepEqual(calls.find(c => c[0] === 'lock'), ['lock', 'INBOX', { readOnly: true }]);
  assert.deepEqual(calls.find(c => c[0] === 'fetchAll')?.[1], [10]);
  const search = calls.find(c => c[0] === 'search')!;
  assert.deepEqual(search[1], { all: true, subject: 'test', from: 'fake@example.invalid', since: new Date('2026-01-01T00:00:00Z') });
  assert.deepEqual(search[2], { uid: true });
  assert.ok(calls.some(c => c[0] === 'release'));
});

test('read extracts synthetic codes/links and requests source without flag writes', async () => {
  const { service, calls } = fixture();
  const mail = await service.read(10, '123');
  assert.deepEqual(mail.codes, ['123456']);
  assert.deepEqual(mail.links, ['https://example.invalid/test']);
  assert.equal(mail.untrusted, true);
  assert.deepEqual(calls.filter(c => c[0] === 'fetchOne'), [
    ['fetchOne', 10, { size: true }, { uid: true }],
    ['fetchOne', 10, { source: { maxLength: MAX_BYTES + 1 } }, { uid: true }],
  ]);
});

test('read rejects stale UIDs, missing and oversized messages; closes on error', async () => {
  const { service, fake, calls } = fixture();
  await assert.rejects(service.read(10, '999'), /UIDVALIDITY/);
  fake.fetchOne = async () => ({ size: MAX_BYTES + 1, source: Buffer.alloc(0) });
  await assert.rejects(service.read(10, '123'), /Größenlimit/);
  fake.fetchOne = async () => false as never;
  await assert.rejects(service.read(10, '123'), /nicht gefunden/);
  assert.equal(calls.filter(c => c[0] === 'close').length, 3);
});

test('wait ignores old UIDs (including IMAP reversed range), returns timeout', async () => {
  const { service } = fixture();
  assert.deepEqual(await service.wait({}, 0), { timedOut: true, uids: [] });
});

test('wait polls and only returns matching newly arrived UIDs', async () => {
  const { service, fake } = fixture();
  let rounds = 0;
  fake.search = async () => ++rounds === 1 ? [10] : [10, 11];
  assert.deepEqual(await service.wait({ subject: 'test' }, 2000), { timedOut: false, uids: [11], uidValidity: '123' });
});

test('wait abort releases mailbox and closes connection', async () => {
  const { service, calls } = fixture();
  const controller = new AbortController();
  const pending = service.wait({}, 5000, controller.signal);
  setTimeout(() => controller.abort(), 10);
  await assert.rejects(pending);
  assert.ok(calls.some(c => c[0] === 'release'));
  assert.ok(calls.some(c => c[0] === 'close'));
});

test('MIME HTML-only input extracts links without fetching them', async () => {
  const parsed = await parseMail(Buffer.from('Content-Type: text/html; charset=utf-8\r\n\r\n<a href="https://example.invalid/verify">Code 876543</a>'));
  assert.ok(parsed.links.includes('https://example.invalid/verify'));
  assert.ok(parsed.codes.includes('876543'));
});

test('real IMAP wire uses EXAMINE and BODY.PEEK, never STORE or SELECT', async () => {
  const commands: string[] = [];
  const source = 'Subject: synthetic\r\n\r\nCode 123456';
  const sockets = new Set<import('node:net').Socket>();
  const tcp = createTcpServer(socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.write('* OK local synthetic IMAP fixture\r\n');
    let buffer = '';
    socket.on('data', chunk => {
      buffer += String(chunk);
      while (buffer.includes('\r\n')) {
        const end = buffer.indexOf('\r\n');
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        commands.push(line);
        const tag = line.split(' ')[0];
        if (/ CAPABILITY$/i.test(line)) socket.write('* CAPABILITY IMAP4rev1\r\n');
        else if (/ EXAMINE /i.test(line)) socket.write('* FLAGS (\\Seen)\r\n* 1 EXISTS\r\n* OK [UIDVALIDITY 123] valid\r\n* OK [UIDNEXT 11] next\r\n');
        else if (/UID FETCH/i.test(line)) {
          if (/BODY\.PEEK/i.test(line)) socket.write(`* 1 FETCH (UID 10 BODY[] {${Buffer.byteLength(source)}}\r\n${source})\r\n`);
          else socket.write(`* 1 FETCH (UID 10 RFC822.SIZE ${Buffer.byteLength(source)})\r\n`);
        }
        socket.write(`${tag} OK done\r\n`);
      }
    });
  });
  await new Promise<void>(resolve => tcp.listen(0, '127.0.0.1', resolve));
  const address = tcp.address() as import('node:net').AddressInfo;
  const service = new MailService(() => new ImapFlow({ host: '127.0.0.1', port: address.port,
    secure: false, doSTARTTLS: false, auth: { user: 'synthetic', pass: 'synthetic' },
    logger: false, disableAutoIdle: true }));
  try {
    assert.deepEqual((await service.read(10, '123')).codes, ['123456']);
    assert.ok(commands.some(c => / EXAMINE "?INBOX/i.test(c)));
    assert.ok(commands.some(c => /BODY\.PEEK\[\]/i.test(c)));
    assert.ok(!commands.some(c => /\b(SELECT|STORE|APPEND|EXPUNGE)\b/i.test(c)));
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve, reject) => tcp.close(error => error ? reject(error) : resolve()));
  }
});

test('stdio handshake, listing, tool calls and validation without credentials', async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: ['dist/index.js'], env: { PATH: process.env.PATH ?? '', ETHEREAL_AUTO_ACCOUNT: 'false' }, stderr: 'pipe' });
  const client = new Client({ name: 'mvp-test', version: '1' });
  let stderr = '';
  transport.stderr?.on('data', chunk => { stderr += String(chunk); });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    assert.equal(listed.tools.length, 4);
    for (const tool of listed.tools) assert.equal(tool.annotations?.destructiveHint, false);
    for (const [name, args] of [ ['search_messages', {}], ['read_message', { uid: 1, uidValidity: '123' }], ['wait_for_message', { timeoutMs: 0 }] ] as const) {
      assert.equal((await client.callTool({ name, arguments: args })).isError, true);
    }
    const invalid = await client.callTool({ name: 'wait_for_message', arguments: { timeoutMs: 60001 } });
    assert.equal(invalid.isError, true);
  } finally { await client.close(); }
  assert.equal(stderr, '');
});
