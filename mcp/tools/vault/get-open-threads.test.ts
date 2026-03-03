// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { registerGetOpenThreadsTool } from './get-open-threads.js';
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

function note(
	id: string,
	title: string,
	kind: string,
	data: Record<string, unknown>,
	tags: string[] = [],
): Record<string, unknown> {
	return {
		id,
		title,
		content: `${title} body`,
		folder: '/',
		filePath: `${id}.md`,
		tags,
		frontmatter: {
			dndtools: {
				object: {
					kind,
					summary: `${title} summary`,
					data,
				},
			},
		},
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-02T00:00:00.000Z',
		deleted: false,
		deletedAt: null,
		pinned: false,
		pinnedAt: null,
	};
}

function payload(result: ToolResult): Record<string, unknown> {
	const envelope = parseToolEnvelope(result);
	if (!envelope || !envelope.ok) return {};
	return envelope.data as Record<string, unknown>;
}

describe('get_open_threads tool', () => {
	it('returns open quest, NPC, and pending timeline threads', async () => {
		const server = new MockMcpServer();
		registerGetOpenThreadsTool(
			server as never,
			{
				getAllNotes: async () => [
					note('quest-open', 'Find Relic', 'quest', { status: 'active', objective: 'Get relic' }),
					note('quest-closed', 'Old Quest', 'quest', { status: 'resolved' }),
					note('npc-open', 'Captain Voss', 'npc', { disposition: 'unknown' }),
					note('timeline-open', 'Siege Begins', 'timeline_event', {
						worldDateOffset: 12,
						summary: 'War starts.',
						arcTag: 'warfront',
						resolutionStatus: 'pending_resolution',
					}),
				],
				getAllObjects: async () => [],
				getSetting: async () => ({ currentDayOffset: 0 }),
			} as never,
		);

		const result = await server.handler?.({ limitPerType: 10 });
		expect(result).toBeTruthy();
		const data = payload(result as ToolResult);
		const totals = data.totals as Record<string, number>;

		expect(totals.quests).toBe(1);
		expect(totals.npcs).toBe(1);
		expect(totals.timelineEvents).toBe(1);
	});

	it('supports includeKinds and arc filters', async () => {
		const server = new MockMcpServer();
		registerGetOpenThreadsTool(
			server as never,
			{
				getAllNotes: async () => [
					note('timeline-war', 'War Arc', 'timeline_event', {
						worldDateOffset: 2,
						arcTag: 'war',
						resolutionStatus: 'pending_resolution',
					}),
					note('timeline-intrigue', 'Intrigue Arc', 'timeline_event', {
						worldDateOffset: 3,
						arcTag: 'intrigue',
						resolutionStatus: 'pending_resolution',
					}),
				],
				getAllObjects: async () => [],
				getSetting: async () => ({ currentDayOffset: 0 }),
			} as never,
		);

		const result = await server.handler?.({
			includeKinds: ['timeline_events'],
			arcTag: 'war',
		});
		expect(result).toBeTruthy();
		const data = payload(result as ToolResult);
		const totals = data.totals as Record<string, number>;

		expect(totals.quests).toBe(0);
		expect(totals.npcs).toBe(0);
		expect(totals.timelineEvents).toBe(1);
	});
});
