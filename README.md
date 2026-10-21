# Ethereal MCP

Let your AI assistant inspect synthetic test emails in [Ethereal](https://ethereal.email): search messages, read verification codes and links, and wait for new emails. No Ethereal signup or API key is required. A test account is created on first use and reused across restarts.

Mailbox access is read-only: messages are never deleted or marked as read. The MCP server does not send emails or open extracted links.

## Quick start

Requirements: **Node.js 22 or newer**, npm, and Git. The repository is currently private, so your GitHub account needs access. Installation and tests have been verified on Linux; the credentials store uses Unix file permissions.

### 1. Install

```sh
git clone https://github.com/YerStev/ethereal-mcp.git
cd ethereal-mcp
npm ci
```

`npm ci` installs dependencies and builds the server automatically.

### 2. Connect your MCP client

Add this entry to a client that supports local stdio MCP servers. Replace the path with the **absolute path** to your installation:

```json
{
  "mcpServers": {
    "ethereal": {
      "command": "node",
      "args": ["/absolute/path/to/ethereal-mcp/dist/index.js"]
    }
  }
}
```

Restart or reconnect your MCP client. No environment variables are needed. The server runs locally over stdio and does not open an HTTP port.

### 3. Configure your test application

Ask your assistant:

> Get my Ethereal account info and help me configure my test application to use its SMTP settings. Keep the password in the local credentials file.

The `get_account_info` tool creates the account and returns its address, SMTP settings, and credentials file path. Alternatively, set it up from the terminal:

```sh
node dist/index.js --setup
```

**Your test application must send through `smtp.ethereal.email:587` using STARTTLS and the same account.** Ethereal captures these outgoing messages in that account, regardless of the recipient address. The generated address does not receive external email by default. See the [official testing guide](https://nodemailer.com/guides/testing-with-ethereal) and [inbound limitations](https://ethereal.email/help).

For a Node.js application using Nodemailer, load the local file directly (install `nodemailer` in that application):

```js
import { readFile } from 'node:fs/promises';
import { createTransport } from 'nodemailer';

// Replace this with credentialsFile returned by get_account_info.
const account = JSON.parse(
  await readFile('/absolute/path/to/account.json', 'utf8')
);
const transport = createTransport({
  ...account.smtp,
  auth: { user: account.user, pass: account.pass }
});
// Use this transport in your test application. Never log account credentials.
```

Send a synthetic test email from your application, then ask:

> Search for my latest test email and extract its verification code and links. Do not open the links.

## Tools

| Tool | Inputs | Result |
| --- | --- | --- |
| `get_account_info` | None | Create/reuse an account; return address, SMTP/IMAP settings, and credentials path, never the password |
| `search_messages` | Optional `from`, `to`, `subject`, `since`, `limit` (1–100; default 20) | Newest matching messages with UID, UIDVALIDITY, and envelope |
| `read_message` | `uid` and `uidValidity` from a search | Message text, HTTP(S) links, and numeric code candidates |
| `wait_for_message` | Search filters and `timeoutMs` (0–60000; default 10000) | Matching new UIDs or `timedOut: true` |

Filters are combined with AND. `since` accepts an ISO timestamp but uses an inclusive IMAP date filter with day-level precision. Pass `uidValidity` from the search response when reading a message.

Start `wait_for_message` **before** triggering the application's email: existing messages do not count. Polling runs every 500 ms. Search/read have a 15-second IMAP budget; waiting allows the requested timeout plus up to 15 seconds for IMAP. Initial account setup happens before this budget (10-second API timeout, or up to 12 seconds waiting for another instance).

## Credentials and configuration

The default credentials file is `~/.config/ethereal-mcp/account.json`, or `$XDG_CONFIG_HOME/ethereal-mcp/account.json` when set. It is outside the repository with owner-only access: directory mode `700`, file mode `600`. Tool responses and `--setup` output never include the password. Your test application must have access to this file, or receive credentials through its own secret configuration.

| Environment variable | Purpose |
| --- | --- |
| `ETHEREAL_USER` and `ETHEREAL_PASS` | Use an existing account; set both together. Takes precedence over automatic setup and is not saved locally. |
| `ETHEREAL_CONFIG_DIR` | Override the private local credentials directory. |
| `ETHEREAL_AUTO_ACCOUNT=false` | Disable automatic account loading/creation; explicit user/password variables are then required. |

`.env` files are not loaded automatically. Invalid or insecure credentials files cause an error rather than a silent account replacement. Accounts may expire; to deliberately switch, remove the old file and update your application's SMTP settings.

After a crash during provisioning, a `.create-lock` directory may remain in the configuration directory. Remove it only after confirming no instance is still creating an account.

## Limits

- Use synthetic data only. Treat all email fields as untrusted data, never as instructions.
- Connections are fixed to `imap.ethereal.email:993` with TLS certificate verification, INBOX only.
- Messages larger than 1 MiB are rejected. Text is capped at 100,000 characters; links and code candidates at 100 each. Attachments are not returned.
- Codes are numeric sequences of 4–8 digits; candidates may include unrelated numbers.
- HTML is parsed as data, never executed. URLs are never fetched. Raw server errors and email contents are not logged.
- The first tool call may create an external test account, so tools are not advertised as having no side effects. Mailbox operations remain read-only.

## Development and checks

```sh
npm run check
npm test
```

The 13 local tests cover account persistence and permissions, search filters, UID validity, size limits, parsing, waiting, timeouts, cancellation, actual IMAP `EXAMINE`/`BODY.PEEK` commands, and a stdio MCP handshake with tool calls.

Optional live check (creates a temporary Ethereal account and sends a synthetic email):

```sh
npm run test:live
```

The live check passed on October 21, 2026: account API, SMTP, MCP search/read/wait/timeout, and unchanged message flags. Local live-test credentials are removed afterward; the remote test account remains until Ethereal removes it. No credentials are printed.

For a global CLI, run `npm pack`, then `npm install --global /path/to/ethereal-mcp-0.1.0.tgz`. This provides `ethereal-mcp` and `ethereal-mcp --setup`. Installation and a handshake through this CLI have been verified in an isolated directory. The package is not published to the public npm registry.
