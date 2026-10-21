import { constants } from 'node:fs';
import { mkdir, open, rename, rm, lstat, chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';

const credentials = z.object({ user: z.string().min(1).max(320), pass: z.string().min(1).max(1000) });
export type Credentials = z.infer<typeof credentials>;
export class AccountError extends Error {}
export const smtp = { host: 'smtp.ethereal.email', port: 587, secure: false, requireTLS: true };
export const imap = { host: 'imap.ethereal.email', port: 993, secure: true };
export function configDirectory() {
  return process.env.ETHEREAL_CONFIG_DIR || join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'ethereal-mcp');
}

export async function provision(): Promise<Credentials> {
  try {
    const response = await fetch('https://api.nodemailer.com/user', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requestor: 'ethereal-mcp', version: '0.1.0' }),
      signal: AbortSignal.timeout(10000), redirect: 'error',
    });
    if (!response.ok) throw new Error();
    const data = await response.json();
    if (data.status !== 'success') throw new Error();
    return credentials.parse(data);
  } catch { throw new AccountError('Could not create an Ethereal account. Check network/API access or set ETHEREAL_USER and ETHEREAL_PASS.'); }
}

export class Accounts {
  private pending?: Promise<Credentials>;
  constructor(private directory = configDirectory(), private env: NodeJS.ProcessEnv = process.env,
    private create = provision) {}
  get(): Promise<Credentials> {
    if (this.env.ETHEREAL_USER || this.env.ETHEREAL_PASS) {
      const parsed = credentials.safeParse({ user: this.env.ETHEREAL_USER, pass: this.env.ETHEREAL_PASS });
      if (!parsed.success) return Promise.reject(new AccountError('ETHEREAL_USER and ETHEREAL_PASS must be set together.'));
      return Promise.resolve(parsed.data);
    }
    if (this.env.ETHEREAL_AUTO_ACCOUNT === 'false') return Promise.reject(new AccountError('Automatic account creation is disabled. Set ETHEREAL_USER and ETHEREAL_PASS.'));
    if (!this.pending) this.pending = this.load().catch(error => { this.pending = undefined; throw error; });
    return this.pending;
  }
  async info() {
    const account = await this.get();
    return { user: account.user, smtp, imap,
      credentialsFile: this.env.ETHEREAL_USER ? null : join(this.directory, 'account.json'),
      note: 'The password stays local. Configure your test application to send through Ethereal SMTP using this account; external inbound mail is not enabled. Use synthetic data only.' };
  }
  private async read(): Promise<Credentials | undefined> {
    let file;
    try {
      file = await open(join(this.directory, 'account.json'), constants.O_RDONLY | constants.O_NOFOLLOW);
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > 16384 || (stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid())) throw new Error();
      return credentials.parse(JSON.parse(await file.readFile('utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw new AccountError('Invalid or insecure account file. Check account.json (owner-only access, mode 600); the account will not be replaced automatically.');
    } finally { await file?.close(); }
  }
  private async load(): Promise<Credentials> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const stat = await lstat(this.directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (process.getuid && stat.uid !== process.getuid())) throw new AccountError('Insecure configuration directory.');
    await chmod(this.directory, 0o700);
    const existing = await this.read();
    if (existing) return existing;
    const lock = join(this.directory, '.create-lock');
    const deadline = Date.now() + 12000;
    while (true) {
      try { await mkdir(lock, { mode: 0o700 }); break; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const ready = await this.read();
        if (ready) return ready;
        if (Date.now() >= deadline) throw new AccountError('Account creation is locked. Wait for the other instance; after a crash, remove .create-lock manually when no account creation is running.');
        await sleep(100);
      }
    }
    const temporary = join(this.directory, `.account-${randomUUID()}`);
    try {
      const ready = await this.read();
      if (ready) return ready;
      const account = credentials.parse(await this.create());
      const file = await open(temporary, 'wx', 0o600);
      try { await file.writeFile(JSON.stringify({ ...account, smtp, imap }) + '\n'); await file.sync(); }
      finally { await file.close(); }
      await rename(temporary, join(this.directory, 'account.json'));
      return account;
    } finally { await rm(temporary, { force: true }); await rm(lock, { recursive: true, force: true }); }
  }
}
export const accounts = new Accounts();
