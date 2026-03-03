import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import { DiceExpressionError, rollDiceExpression } from '../../../src/lib/domain/dice.js';
import { errorResult, jsonResult } from '../shared/response.js';

export function registerRollDiceExpressionTool(
	server: McpServer,
	_storage: FileSystemAdapter,
): void {
	server.tool(
		'roll_dice_expression',
		'Evaluate a dice expression and return total with detailed roll breakdown.',
		{
			expression: z.string().min(1).max(200),
		},
		async ({ expression }) => {
			try {
				const result = rollDiceExpression(expression);
				return jsonResult(result);
			} catch (error) {
				const message =
					error instanceof DiceExpressionError
						? error.message
						: `Failed to evaluate dice expression: ${String(error)}`;
				return errorResult(message, {
					code: 'MCP_INVALID_INPUT',
					hint: 'Use expressions like 1d20+5, 4d6kh3, adv, dis.',
				});
			}
		},
	);
}
