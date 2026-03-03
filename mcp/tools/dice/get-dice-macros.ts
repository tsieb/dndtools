import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import { jsonResult } from '../shared/response.js';

export function registerGetDiceMacrosTool(server: McpServer, storage: FileSystemAdapter): void {
	server.tool('get_dice_macros', 'List saved dice macros from vault settings.', {}, async () => {
		const macros = await storage.getSetting('diceMacros');
		return jsonResult(
			macros.map((macro) => ({
				id: macro.id,
				label: macro.label,
				expression: macro.expression,
				createdAt: macro.createdAt,
				updatedAt: macro.updatedAt,
			})),
		);
	});
}
