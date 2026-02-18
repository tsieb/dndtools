#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import path from 'node:path';
import { FileSystemAdapter } from './storage.js';
import { StagedMcpAdapter } from './staged-storage.js';
import { registerTools } from './tools.js';
import { registerResources } from './resources.js';

// Vault directory: first CLI arg, or DNDTOOLS_VAULT env var, or ./vault
const vaultDir = path.resolve(
	process.argv[2] ?? process.env.DNDTOOLS_VAULT ?? path.join(process.cwd(), 'vault'),
);

const server = new McpServer({
	name: 'dndtools',
	version: '0.2.0',
});

const runDirect = process.argv.includes('--direct') || process.env.DNDTOOLS_MCP_STAGED === '0';
const storage = runDirect ? new FileSystemAdapter(vaultDir) : new StagedMcpAdapter(vaultDir);

// Register tools and resources
registerTools(server, storage);
registerResources(server, storage);

// Start
async function main(): Promise<void> {
	await storage.initialize();

	const transport = new StdioServerTransport();
	await server.connect(transport);

	// Graceful shutdown
	const shutdown = async (): Promise<void> => {
		await storage.close();
		process.exit(0);
	};
	process.on('SIGINT', shutdown);
	process.on('SIGTERM', shutdown);
}

main().catch((err) => {
	console.error('MCP server failed to start:', err);
	process.exit(1);
});
