// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { registerGetDiceMacrosTool } from './get-dice-macros.js';
import { registerRollDiceExpressionTool } from './roll-dice-expression.js';
import { registerRollDiceMacroTool } from './roll-dice-macro.js';
import { parseToolEnvelope, type ToolResult } from '../shared/response.js';

type ToolHandler = (input: Record<string, unknown>) => Promise<ToolResult>;

class MockMcpServer {
	handlers = new Map<string, ToolHandler>();

	tool(
		name: string,
		_description: string,
		_schema: Record<string, unknown>,
		handler: ToolHandler,
	): void {
		this.handlers.set(name, handler);
	}
}

function dataOf<T>(result: ToolResult): T {
	const envelope = parseToolEnvelope(result);
	expect(envelope?.ok).toBe(true);
	if (!envelope || !envelope.ok) throw new Error('Expected successful envelope');
	return envelope.data as T;
}

function expectError(result: ToolResult, code: string, messageIncludes?: string): void {
	const envelope = parseToolEnvelope(result);
	expect(envelope?.ok).toBe(false);
	if (!envelope || envelope.ok) throw new Error('Expected error envelope');
	expect(envelope.error.code).toBe(code);
	if (messageIncludes) expect(envelope.error.message).toContain(messageIncludes);
}

describe('dice MCP tools', () => {
	it('get_dice_macros returns normalized macro metadata', async () => {
		const getSetting = vi.fn(async (key: string) => {
			if (key !== 'diceMacros') return [];
			return [
				{
					id: 'macro-1',
					label: 'Sneak Attack',
					expression: '1d20+7',
					createdAt: '2026-01-01T00:00:00.000Z',
					updatedAt: '2026-01-05T00:00:00.000Z',
					internalField: 'ignored',
				},
			];
		});
		const server = new MockMcpServer();
		registerGetDiceMacrosTool(
			server as never,
			{
				getSetting,
			} as never,
		);

		const handler = server.handlers.get('get_dice_macros');
		expect(handler).toBeTypeOf('function');
		const payload = dataOf<Array<Record<string, string>>>(await handler!({}));
		expect(payload).toEqual([
			{
				id: 'macro-1',
				label: 'Sneak Attack',
				expression: '1d20+7',
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-05T00:00:00.000Z',
			},
		]);
	});

	it('roll_dice_expression rejects malformed dice expressions', async () => {
		const server = new MockMcpServer();
		registerRollDiceExpressionTool(server as never, {} as never);

		const handler = server.handlers.get('roll_dice_expression');
		expect(handler).toBeTypeOf('function');
		const invalid = await handler!({ expression: 'not-a-roll' });
		expectError(invalid, 'MCP_INVALID_INPUT');
	});

	it('roll_dice_macro resolves macros by case-insensitive label', async () => {
		const server = new MockMcpServer();
		registerRollDiceMacroTool(
			server as never,
			{
				getSetting: vi.fn().mockResolvedValue([
					{
						id: 'macro-adv',
						label: 'Attack Roll',
						expression: '1d20+5',
					},
				]),
			} as never,
		);

		const handler = server.handlers.get('roll_dice_macro');
		expect(handler).toBeTypeOf('function');
		const result = await handler!({ label: 'attack roll' });
		const payload = dataOf<{
			macro: { id: string; label: string; expression: string };
			roll: { total: number };
		}>(result);
		expect(payload.macro).toEqual({
			id: 'macro-adv',
			label: 'Attack Roll',
			expression: '1d20+5',
		});
		expect(typeof payload.roll.total).toBe('number');
	});

	it('roll_dice_macro surfaces validation and lookup failures', async () => {
		const server = new MockMcpServer();
		registerRollDiceMacroTool(
			server as never,
			{
				getSetting: vi
					.fn()
					.mockResolvedValueOnce([])
					.mockResolvedValueOnce([
						{
							id: 'macro-bad',
							label: 'Broken Macro',
							expression: 'bad-expression',
						},
					]),
			} as never,
		);

		const handler = server.handlers.get('roll_dice_macro');
		expect(handler).toBeTypeOf('function');

		const missingIdentifier = await handler!({});
		expectError(missingIdentifier, 'MCP_INVALID_INPUT', 'Either macroId or label');

		const missingMacro = await handler!({ macroId: 'unknown' });
		expectError(missingMacro, 'MCP_NOT_FOUND', 'Dice macro not found');

		const invalidMacro = await handler!({ macroId: 'macro-bad' });
		expectError(invalidMacro, 'MCP_INVALID_INPUT');
	});
});
