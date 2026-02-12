#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import path from 'node:path';
import { FileSystemAdapter } from './storage.js';
import { registerTools } from './tools.js';
import { registerResources } from './resources.js';

// Vault directory: first CLI arg, or DNDTOOLS_VAULT env var, or ./vault
const vaultDir = process.argv[2] ?? process.env.DNDTOOLS_VAULT ?? path.join(process.cwd(), 'vault');

const server = new McpServer({
	name: 'dndtools',
	version: '0.1.0',
});

const storage = new FileSystemAdapter(vaultDir);

// Register tools and resources
registerTools(server, storage);
registerResources(server, storage);

// Start
async function main(): Promise<void> {
	await storage.initialize();

	const transport = new StdioServerTransport();
	await server.connect(transport);

	// Graceful shutdown
	process.on('SIGINT', async () => {
		await storage.close();
		process.exit(0);
	});
	process.on('SIGTERM', async () => {
		await storage.close();
		process.exit(0);
	});
}

main().catch((err) => {
	console.error('MCP server failed to start:', err);
	process.exit(1);
});
