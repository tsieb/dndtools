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
import { registerGetCampaignHealthTool } from './vault/get-campaign-health.js';
import { registerGetCoverageGapsTool } from './vault/get-coverage-gaps.js';
import { registerGetStaleNotesTool } from './vault/get-stale-notes.js';
import { registerGetFolderTreeTool } from './vault/get-folder-tree.js';
import { registerGetRecentActivityTool } from './vault/get-recent-activity.js';
import { registerGetLinkGraphTool } from './vault/get-link-graph.js';
import { registerGetCalendarEventsTool } from './vault/get-calendar-events.js';
import { registerVaultHealthCheckTool } from './vault/vault-health-check.js';
import { registerGetSessionPrepBundleTool } from './vault/get-session-prep-bundle.js';
import { registerGetRecapGenerationBundleTool } from './vault/get-recap-generation-bundle.js';
import { registerGetContinuityCheckBundleTool } from './vault/get-continuity-check-bundle.js';
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
import { createContractServer, type RegisterToolsOptions } from './shared/contract-server.js';

export function registerTools(
	server: McpServer,
	storage: FileSystemAdapter,
	options?: RegisterToolsOptions,
): void {
	const contractServer = createContractServer(server, storage, options);

	registerListNotesTool(contractServer, storage);
	registerReadNoteTool(contractServer, storage);
	registerCreateNoteTool(contractServer, storage);
	registerUpdateNoteTool(contractServer, storage);
	registerDeleteNoteTool(contractServer, storage);
	registerRestoreNoteTool(contractServer, storage);

	registerSearchNotesTool(contractServer, storage);
	registerGetBacklinksTool(contractServer, storage);
	registerGetTagsTool(contractServer, storage);

	registerGetVaultSummaryTool(contractServer, storage);
	registerGetCampaignHealthTool(contractServer, storage);
	registerGetCoverageGapsTool(contractServer, storage);
	registerGetStaleNotesTool(contractServer, storage);
	registerGetFolderTreeTool(contractServer, storage);
	registerGetRecentActivityTool(contractServer, storage);
	registerGetLinkGraphTool(contractServer, storage);
	registerGetCalendarEventsTool(contractServer, storage);
	registerVaultHealthCheckTool(contractServer, storage);
	registerGetSessionPrepBundleTool(contractServer, storage);
	registerGetRecapGenerationBundleTool(contractServer, storage);
	registerGetContinuityCheckBundleTool(contractServer, storage);

	registerListSessionBoardsTool(contractServer, storage);
	registerCreateSessionBoardTool(contractServer, storage);
	registerUpdateSessionBoardTool(contractServer, storage);
	registerDeleteSessionBoardTool(contractServer, storage);
	registerSuggestRelatedBoardNotesTool(contractServer, storage);

	registerCreateStatBlockObjectTool(contractServer, storage);
	registerCreateCharacterObjectTool(contractServer, storage);
	registerCreateImageObjectTool(contractServer, storage);
	registerCreateCharacterSheetNoteTool(contractServer, storage);
	registerCreateStatBlockNoteTool(contractServer, storage);
	registerListObjectsTool(contractServer, storage);
	registerReadObjectTool(contractServer, storage);
	registerUpdateObjectTool(contractServer, storage);
	registerDeleteObjectTool(contractServer, storage);
	registerEmbedObjectInNoteTool(contractServer, storage);
	registerEmbedNoteInNoteTool(contractServer, storage);
	registerImportImageNoteTool(contractServer, storage);
}
