import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../storage.js';
import { registerListNotesTool } from './notes/list-notes.js';
import { registerReadNoteTool } from './notes/read-note.js';
import { registerCreateNoteTool } from './notes/create-note.js';
import { registerUpdateNoteTool } from './notes/update-note.js';
import { registerDeleteNoteTool } from './notes/delete-note.js';
import { registerRestoreNoteTool } from './notes/restore-note.js';
import { registerSearchNotesTool } from './search/search-notes.js';
import { registerGetBacklinksTool } from './search/get-backlinks.js';
import { registerGetTagsTool } from './search/get-tags.js';
import { registerGetVaultSummaryTool } from './vault/get-vault-summary.js';
import { registerGetFolderTreeTool } from './vault/get-folder-tree.js';
import { registerGetRecentActivityTool } from './vault/get-recent-activity.js';
import { registerGetLinkGraphTool } from './vault/get-link-graph.js';
import { registerVaultHealthCheckTool } from './vault/vault-health-check.js';
import { registerCreateSessionBoardTool } from './boards/create-session-board.js';
import { registerListSessionBoardsTool } from './boards/list-session-boards.js';
import { registerUpdateSessionBoardTool } from './boards/update-session-board.js';
import { registerDeleteSessionBoardTool } from './boards/delete-session-board.js';
import { registerSuggestRelatedBoardNotesTool } from './boards/suggest-related-board-notes.js';
import { registerCreateStatBlockObjectTool } from './objects/create-stat-block-object.js';
import { registerCreateCharacterObjectTool } from './objects/create-character-object.js';
import { registerCreateImageObjectTool } from './objects/create-image-object.js';
import { registerCreateCharacterSheetNoteTool } from './objects/create-character-sheet-note.js';
import { registerCreateStatBlockNoteTool } from './objects/create-stat-block-note.js';
import { registerListObjectsTool } from './objects/list-objects.js';
import { registerReadObjectTool } from './objects/read-object.js';
import { registerUpdateObjectTool } from './objects/update-object.js';
import { registerDeleteObjectTool } from './objects/delete-object.js';
import { registerEmbedObjectInNoteTool } from './objects/embed-object-in-note.js';
import { registerEmbedNoteInNoteTool } from './objects/embed-note-in-note.js';
import { registerImportImageNoteTool } from './objects/import-image-note.js';

export function registerTools(server: McpServer, storage: FileSystemAdapter): void {
	registerListNotesTool(server, storage);
	registerReadNoteTool(server, storage);
	registerCreateNoteTool(server, storage);
	registerUpdateNoteTool(server, storage);
	registerDeleteNoteTool(server, storage);
	registerRestoreNoteTool(server, storage);

	registerSearchNotesTool(server, storage);
	registerGetBacklinksTool(server, storage);
	registerGetTagsTool(server, storage);

	registerGetVaultSummaryTool(server, storage);
	registerGetFolderTreeTool(server, storage);
	registerGetRecentActivityTool(server, storage);
	registerGetLinkGraphTool(server, storage);
	registerVaultHealthCheckTool(server, storage);

	registerListSessionBoardsTool(server, storage);
	registerCreateSessionBoardTool(server, storage);
	registerUpdateSessionBoardTool(server, storage);
	registerDeleteSessionBoardTool(server, storage);
	registerSuggestRelatedBoardNotesTool(server, storage);

	registerCreateStatBlockObjectTool(server, storage);
	registerCreateCharacterObjectTool(server, storage);
	registerCreateImageObjectTool(server, storage);
	registerCreateCharacterSheetNoteTool(server, storage);
	registerCreateStatBlockNoteTool(server, storage);
	registerListObjectsTool(server, storage);
	registerReadObjectTool(server, storage);
	registerUpdateObjectTool(server, storage);
	registerDeleteObjectTool(server, storage);
	registerEmbedObjectInNoteTool(server, storage);
	registerEmbedNoteInNoteTool(server, storage);
	registerImportImageNoteTool(server, storage);
}
