import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../storage.js';
import { registerNoteResource } from './note.js';
import { registerVaultStructureResource } from './vault-structure.js';
import { registerVaultTagsResource } from './vault-tags.js';
import { registerResourceCatalog } from './resource-catalog.js';

export function registerResources(server: McpServer, storage: FileSystemAdapter): void {
	registerNoteResource(server, storage);
	registerVaultStructureResource(server, storage);
	registerVaultTagsResource(server, storage);
	registerResourceCatalog(server);
}
