#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { accounts, AccountError } from './account.js';

try {
  if (process.argv.includes('--setup')) process.stdout.write(JSON.stringify(await accounts.info(), null, 2) + '\n');
  else await createServer().connect(new StdioServerTransport());
}
catch (error) { process.stderr.write((error instanceof AccountError ? error.message : 'MCP-Start fehlgeschlagen.') + '\n'); process.exitCode = 1; }
