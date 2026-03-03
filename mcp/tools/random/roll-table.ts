import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import {
	RandomTableError,
	buildRandomTableIndex,
	rollRandomTable,
} from '../../../src/lib/domain/random-tables.js';
import { errorResult, jsonResult } from '../shared/response.js';

export function registerRollTableTool(server: McpServer, storage: FileSystemAdapter): void {
	server.tool(
		'roll_table',
		'Roll a weighted random table from vault notes tagged random-table.',
		{
			name: z.string().min(1).max(120),
			includeSystem: z
				.boolean()
				.optional()
				.default(true)
				.describe('Include built-in read-only system tables in lookup.'),
			maxDepth: z
				.number()
				.int()
				.min(1)
				.max(10)
				.optional()
				.default(6)
				.describe('Maximum nested table-reference depth.'),
		},
		async ({ name, includeSystem, maxDepth }) => {
			try {
				const notes = await storage.getAllNotes({ includeDeleted: false });
				const index = buildRandomTableIndex({
					vaultNotes: notes.map((note) => ({
						id: String(note.id),
						title: note.title,
						content: note.content,
						tags: note.tags,
						folder: String(note.folder),
						updatedAt: note.updatedAt,
					})),
					includeSystem,
				});
				const roll = rollRandomTable(index, name, { maxDepth });
				return jsonResult({
					tableName: roll.tableName,
					result: roll.result,
					referencedTables: roll.referencedTables,
					trace: roll.trace,
					availableTableCount: index.tables.length,
					invalidTableCount: index.invalidSources.length,
				});
			} catch (error) {
				if (error instanceof RandomTableError && error.code === 'table_not_found') {
					return errorResult(error.message, {
						code: 'MCP_NOT_FOUND',
						hint: 'Create a note tagged random-table, or call with includeSystem=true.',
						details: error.details,
					});
				}
				if (
					error instanceof RandomTableError &&
					(error.code === 'max_depth_exceeded' || error.code === 'table_cycle_detected')
				) {
					return errorResult(error.message, {
						code: 'MCP_INVALID_INPUT',
						hint: 'Fix cyclic/nested table references or lower recursion depth.',
						details: error.details,
					});
				}
				if (error instanceof RandomTableError) {
					return errorResult(error.message, {
						code: 'MCP_INVALID_INPUT',
						hint: 'Validate random-table row formatting and reference syntax.',
						details: error.details,
					});
				}
				return errorResult(`Failed to roll random table: ${String(error)}`, {
					code: 'MCP_INTERNAL_ERROR',
					hint: 'Retry once. If failure persists, inspect vault table note formatting.',
				});
			}
		},
	);
}
