import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import { DiceExpressionError, rollDiceExpression } from '../../../src/lib/domain/dice.js';
import { errorResult, jsonResult } from '../shared/response.js';

export function registerRollDiceMacroTool(server: McpServer, storage: FileSystemAdapter): void {
	server.tool(
		'roll_dice_macro',
		'Roll a saved dice macro by id or label.',
		{
			macroId: z.string().min(1).optional(),
			label: z.string().min(1).optional(),
		},
		async ({ macroId, label }) => {
			if (!macroId && !label) {
				return errorResult('Either macroId or label is required.', {
					code: 'MCP_INVALID_INPUT',
					hint: 'Provide one macro identifier and retry.',
				});
			}
			const macros = await storage.getSetting('diceMacros');
			const normalizedLabel = label?.trim().toLowerCase();
			const macro = macros.find((entry) => {
				if (macroId && entry.id === macroId) return true;
				if (normalizedLabel && entry.label.toLowerCase() === normalizedLabel) return true;
				return false;
			});
			if (!macro) {
				return errorResult('Dice macro not found.', {
					code: 'MCP_NOT_FOUND',
					hint: 'Call get_dice_macros first to inspect available macro ids and labels.',
				});
			}
			try {
				const result = rollDiceExpression(macro.expression);
				return jsonResult({
					macro: {
						id: macro.id,
						label: macro.label,
						expression: macro.expression,
					},
					roll: result,
				});
			} catch (error) {
				const message =
					error instanceof DiceExpressionError
						? error.message
						: `Failed to roll macro "${macro.label}": ${String(error)}`;
				return errorResult(message, {
					code: 'MCP_INVALID_INPUT',
					hint: 'Update the macro expression in settings and retry.',
				});
			}
		},
	);
}
