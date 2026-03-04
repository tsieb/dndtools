// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { registerGetSessionPrepBundleTool } from './get-session-prep-bundle.js';
import { parseToolEnvelope, type ToolResult } from '../shared/response.js';

type ToolHandler = (input: Record<string, unknown>) => Promise<ToolResult>;

class MockMcpServer {
	handler: ToolHandler | null = null;

	tool(
		_name: string,
		_description: string,
		_schema: Record<string, unknown>,
		handler: ToolHandler,
	): void {
		this.handler = handler;
	}
}

function payload(result: ToolResult): Record<string, unknown> {
	const envelope = parseToolEnvelope(result);
	if (!envelope || !envelope.ok) return {};
	return envelope.data as Record<string, unknown>;
}

describe('get_session_prep_bundle tool', () => {
	it('surfaces activeMap when a location is pinned in session context', async () => {
		const server = new MockMcpServer();
		registerGetSessionPrepBundleTool(
			server as never,
			{
				getIndexEntries: () => [
					{
						id: 'loc-note',
						title: 'Phandalin',
						folder: '/locations',
						tags: ['location'],
						createdAt: '2026-01-01T00:00:00.000Z',
						updatedAt: '2026-01-02T00:00:00.000Z',
						deleted: false,
						deletedAt: null,
					},
				],
				getAllLinksFromIndex: () => [],
				getAllNotes: async () => [
					{
						id: 'loc-note',
						title: 'Phandalin',
						content: 'Town overview',
						folder: '/locations',
						filePath: '/locations/phandalin.md',
						tags: ['location'],
						frontmatter: {},
						createdAt: '2026-01-01T00:00:00.000Z',
						updatedAt: '2026-01-02T00:00:00.000Z',
						deleted: false,
						deletedAt: null,
						pinned: false,
						pinnedAt: null,
						visibility: 'dm_only',
					},
				],
				getAllObjects: async () => [
					{
						id: 'map-1',
						type: 'map',
						name: 'Sword Coast Region',
						summary: '',
						tags: ['region'],
						visibility: 'dm_only',
						relationships: [],
						data: {
							filePath: '.vault/assets/maps/sword-coast.png',
							areaNoteId: 'loc-note',
							scale: {
								unitsPerGridSquare: 5,
								unitLabel: 'mi',
							},
						},
						createdAt: '2026-01-01T00:00:00.000Z',
						updatedAt: '2026-01-03T00:00:00.000Z',
					},
				],
				getSessionBoards: async () => [
					{
						id: 'board-1',
						name: 'Session Board',
						description: '',
						tiles: [],
						createdAt: '2026-01-01T00:00:00.000Z',
						updatedAt: '2026-01-04T00:00:00.000Z',
						sessionContext: {
							collapsed: false,
							items: [
								{
									noteId: 'loc-note',
									category: 'location',
									pinnedAt: '2026-01-04T00:00:00.000Z',
								},
							],
						},
					},
				],
				getSetting: async () => ({
					version: 1,
					months: [{ name: 'Month 1', days: 30 }],
					weekLength: 7,
					dayNames: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
					leapYearRules: [],
					eras: [{ name: 'Era', epochOffset: 0 }],
					moonCycles: [],
					currentDayOffset: 0,
				}),
			} as never,
		);

		const result = await server.handler?.({ boardLimit: 5, recentLimit: 5, staleAfterDays: 30 });
		expect(result).toBeTruthy();
		const data = payload(result as ToolResult);
		const activeMap = data.activeMap as Record<string, unknown> | null;

		expect(activeMap).toBeTruthy();
		expect(activeMap?.id).toBe('map-1');
		expect(activeMap?.areaNoteId).toBe('loc-note');
		expect(activeMap?.filePath).toBe('.vault/assets/maps/sword-coast.png');
	});
});
