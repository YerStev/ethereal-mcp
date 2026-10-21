import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, stat, rm, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Accounts, provision } from '../src/account.js';

test('automatic setup persists privately, reuses across instances, and hides password', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ethereal-unit-'));
  let created = 0;
  const create = async () => { created++; return { user: 'fake@ethereal.email', pass: 'synthetic-secret' }; };
  try {
    const first = new Accounts(directory, {}, create);
    const second = new Accounts(directory, {}, create);
    const [a, b] = await Promise.all([first.get(), second.get()]);
    assert.deepEqual(a, b);
    assert.equal(created, 1);
    assert.equal((await stat(join(directory, 'account.json'))).mode & 0o777, 0o600);
    assert.equal((await stat(directory)).mode & 0o777, 0o700);
    assert.equal(JSON.stringify(await first.info()).includes('synthetic-secret'), false);
    assert.equal((await new Accounts(directory, {}, create).get()).user, a.user);
    assert.equal(created, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('explicit credentials override cache; partial env fails without provisioning', async () => {
  const create = async () => { throw new Error('must not provision'); };
  assert.deepEqual(await new Accounts('/unused', { ETHEREAL_USER: 'test', ETHEREAL_PASS: 'synthetic' }, create).get(), { user: 'test', pass: 'synthetic' });
  await assert.rejects(new Accounts('/unused', { ETHEREAL_USER: 'test' }, create).get(), /together/);
  await assert.rejects(new Accounts('/unused', { ETHEREAL_AUTO_ACCOUNT: 'false' }, create).get(), /disabled/);
});

test('corrupt or insecure cache never silently replaces the account', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ethereal-unit-'));
  try {
    const file = join(directory, 'account.json');
    await writeFile(file, 'broken', { mode: 0o600 });
    const accounts = new Accounts(directory, {}, async () => { throw new Error('must not provision'); });
    await assert.rejects(accounts.get(), /Invalid/);
    await writeFile(file, JSON.stringify({ user: 'fake', pass: 'synthetic' }));
    await chmod(file, 0o644);
    await assert.rejects(accounts.get(), /insecure/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('API uses fixed HTTPS endpoint and rejects failures without exposing response', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'https://api.nodemailer.com/user');
      assert.equal(options?.method, 'POST');
      assert.equal(options?.redirect, 'error');
      return new Response(JSON.stringify({ status: 'success', user: 'fake', pass: 'synthetic' }));
    };
    assert.deepEqual(await provision(), { user: 'fake', pass: 'synthetic' });
    globalThis.fetch = async () => new Response('private server detail', { status: 429 });
    await assert.rejects(provision(), error => error instanceof Error && !error.message.includes('private server detail'));
  } finally { globalThis.fetch = original; }
});
