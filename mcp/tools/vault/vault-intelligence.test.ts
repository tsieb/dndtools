// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildVaultIntelligence } from './vault-intelligence.js';

function makeStorage() {
	return {
		getIndexEntries: () => [
			{
				id: 'note-1',
				title: 'Alpha',
				folder: '/',
				tags: [],
				createdAt: '2025-09-01T00:00:00.000Z',
				updatedAt: '2025-10-01T00:00:00.000Z',
				deleted: false,
				deletedAt: null,
			},
			{
				id: 'note-2',
				title: 'Beta',
				folder: '/campaign',
				tags: ['session'],
				createdAt: '2025-11-01T00:00:00.000Z',
				updatedAt: '2026-02-10T00:00:00.000Z',
				deleted: false,
				deletedAt: null,
			},
			{
				id: 'note-3',
				title: 'Gamma',
				folder: '/campaign',
				tags: ['session'],
				createdAt: '2025-10-05T00:00:00.000Z',
				updatedAt: '2025-11-15T00:00:00.000Z',
				deleted: false,
				deletedAt: null,
			},
			{
				id: 'note-4',
				title: 'Alpha',
				folder: '/campaign',
				tags: [],
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-02-16T00:00:00.000Z',
				deleted: false,
				deletedAt: null,
			},
		],
		getAllLinksFromIndex: () => [
			{ sourceId: 'note-2', targetId: 'note-3', displayText: 'Gamma', position: 0 },
		],
		getAllObjects: async () => [{ id: 'obj-1' }, { id: 'obj-2' }],
		getSessionBoards: async () => [{ id: 'board-1' }],
	};
}

describe('buildVaultIntelligence', () => {
	it('computes campaign health, stale notes, and coverage gaps', async () => {
		const insights = await buildVaultIntelligence(makeStorage() as never, {
			staleAfterDays: 30,
			maxExamples: 10,
			now: new Date('2026-02-18T00:00:00.000Z'),
		});

		expect(insights.totals.activeNotes).toBe(4);
		expect(insights.graphInsights.orphanCount).toBe(2);
		expect(insights.graphInsights.hubCount).toBe(0);
		expect(insights.metrics.orphanNotes).toBe(2);
		expect(insights.metrics.untaggedNotes).toBe(2);
		expect(insights.metrics.duplicateTitleGroups).toBe(1);
		expect(insights.metrics.staleNotes).toBe(2);
		expect(insights.coverageGaps.map((gap) => gap.key)).toEqual([
			'orphan_notes',
			'untagged_notes',
			'root_folder_notes',
			'duplicate_titles',
			'stale_notes',
		]);
		expect(insights.campaignHealth.status).toBe('needs_attention');
	});

	it('returns healthy status for an empty vault', async () => {
		const insights = await buildVaultIntelligence(
			{
				getIndexEntries: () => [],
				getAllLinksFromIndex: () => [],
				getAllObjects: async () => [],
				getSessionBoards: async () => [],
			} as never,
			{ now: new Date('2026-02-18T00:00:00.000Z') },
		);

		expect(insights.campaignHealth.status).toBe('healthy');
		expect(insights.campaignHealth.score).toBe(100);
		expect(insights.coverageGaps).toHaveLength(0);
		expect(insights.graphInsights).toMatchObject({
			orphanCount: 0,
			hubCount: 0,
		});
	});
});
