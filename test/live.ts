// Opt-in; ausschließlich künstliche Daten, keine Zugangsdaten/Antwortinhalte loggen.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createTransport } from 'nodemailer';
import { Accounts, smtp } from '../src/account.js';
import { clientFor } from '../src/mail.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const directory = await mkdtemp(join(tmpdir(), 'ethereal-live-'));
let client: Client | undefined;
try {
  const account = await new Accounts(directory, {}).get();
  const transport = new StdioClientTransport({ command: process.execPath, args: ['dist/index.js'],
    env: { PATH: process.env.PATH ?? '', ETHEREAL_CONFIG_DIR: directory }, stderr: 'pipe' });
  client = new Client({ name: 'ethereal-live-check', version: '1' });
  await client.connect(transport);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client!.callTool({ name, arguments: args });
    if (result.isError) throw new Error('tool failed');
    return JSON.parse((result.content as { text: string }[])[0].text);
  };
  const info = await call('get_account_info');
  if (info.user !== account.user || info.pass) throw new Error('account mismatch');
  const marker = `synthetic-${randomUUID()}`;
  const waiting = call('wait_for_message', { subject: marker, timeoutMs: 15000 });
  // Handler am Promise sofort registrieren, auch wenn SMTP fehlschlägt.
  const outcome = waiting.then(value => ({ value }), () => ({ value: null }));
  await new Promise(resolve => setTimeout(resolve, 2000));
  const sender = createTransport({ ...smtp, auth: account, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000, logger: false, debug: false });
  try { await sender.sendMail({ from: 'sender@example.invalid', to: 'recipient@example.invalid', subject: marker,
    text: 'Synthetic test only. Code 123456. https://example.invalid/verify' }); }
  finally { sender.close(); }
  const arrived = (await outcome).value;
  if (!arrived || arrived.timedOut || !arrived.uids.length) throw new Error('wait failed');
  const found = await call('search_messages', { subject: marker });
  if (found.total !== 1) throw new Error('search failed');
  const uid = found.messages[0].uid;
  const flags = async () => {
    const imap = clientFor(account); imap.on('error', () => {});
    try {
      await imap.connect(); const lock = await imap.getMailboxLock('INBOX', { readOnly: true });
      try { const message = await imap.fetchOne(uid, { flags: true }, { uid: true }); return message ? [...message.flags ?? []].sort().join(',') : null; }
      finally { lock.release(); }
    } finally { imap.close(); }
  };
  const before = await flags();
  const read = await call('read_message', { uid, uidValidity: found.uidValidity });
  if (!read.codes.includes('123456') || !read.links.includes('https://example.invalid/verify')) throw new Error('read failed');
  if (before !== await flags()) throw new Error('flags changed');
  if (!(await call('wait_for_message', { subject: marker, timeoutMs: 100 })).timedOut) throw new Error('timeout failed');
  process.stdout.write('Live-Test bestanden: API-Konto, stdio, SMTP-Testmail, Suche, Lesen, Warten, Timeout und unveränderte Flags.\n');
} catch {
  process.stderr.write('Live-Test fehlgeschlagen (Details aus Datenschutzgründen unterdrückt).\n');
  process.exitCode = 1;
} finally { await client?.close(); await rm(directory, { recursive: true, force: true }); }
