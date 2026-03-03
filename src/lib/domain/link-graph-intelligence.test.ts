import { describe, expect, it } from 'vitest';
import { createFolderId, createNoteId, type Note } from '$lib/types/note.js';
import { nowISO } from '$lib/utils/date.js';
import { buildLinkGraphQualityReport } from './link-graph-intelligence.js';

function makeNote(
	id: string,
	title: string,
	content: string,
	frontmatter: Record<string, unknown> = {},
): Note {
	return {
		id: createNoteId(id),
		title,
		content,
		folder: createFolderId('/'),
		filePath: `${id}.md`,
		tags: [],
		frontmatter,
		visibility: 'dm_only',
		createdAt: nowISO(),
		updatedAt: nowISO(),
		deleted: false,
		deletedAt: null,
		pinned: false,
		pinnedAt: null,
	};
}

describe('buildLinkGraphQualityReport', () => {
	it('reports orphan notes, dead links, and centrality ranking', () => {
		const notes = [
			makeNote('a', 'Alpha', '[[Beta]] [[Missing]]'),
			makeNote('b', 'Beta', '[[Gamma]]'),
			makeNote('c', 'Gamma', ''),
			makeNote('d', 'Delta', ''),
		];

		const report = buildLinkGraphQualityReport({
			notes,
		});

		expect(report.orphanNoteIds).toEqual([createNoteId('d')]);
		expect(report.deadLinks).toMatchObject([
			{ sourceId: createNoteId('a'), targetLabel: 'Missing', count: 1 },
		]);
		expect(report.highCentrality[0]).toMatchObject({
			noteId: createNoteId('b'),
			inbound: 1,
			outbound: 1,
			degree: 2,
		});
		expect(report.highCentrality[0]?.betweenness).toBeGreaterThan(0);
		expect(report.totals).toMatchObject({
			totalLinks: 3,
			brokenLinks: 1,
			aliasMatchedLinks: 0,
			loops: 0,
		});
	});

	it('supports alias-aware dead-link detection', () => {
		const notes = [
			makeNote('city', 'Waterdeep', '', { aliases: ['City of Splendors'] }),
			makeNote('log', 'Session Log', 'Met in [[City of Splendors]]'),
		];

		const report = buildLinkGraphQualityReport({
			notes,
		});

		expect(report.deadLinks).toHaveLength(0);
		expect(report.totals.aliasMatchedLinks).toBe(1);
		expect(report.aliasMatchedLinks).toMatchObject([
			{
				sourceId: createNoteId('log'),
				targetId: createNoteId('city'),
				alias: 'City of Splendors',
				count: 1,
			},
		]);
	});

	it('reports link loops and cross-folder density with drilldown note ids', () => {
		const notes = [
			makeNote('a', 'Alpha', '[[Beta]] [[Beta]]', {}),
			makeNote('b', 'Beta', '[[Alpha]]', {}),
			makeNote('c', 'Gamma', '[[Alpha]]', {}),
		];
		notes[0]!.folder = createFolderId('/north');
		notes[1]!.folder = createFolderId('/south');
		notes[2]!.folder = createFolderId('/north');

		const report = buildLinkGraphQualityReport({ notes });
		expect(report.totals.totalLinks).toBe(4);
		expect(report.totals.loops).toBe(1);
		expect(report.loops).toMatchObject([
			{
				fromId: createNoteId('a'),
				toId: createNoteId('b'),
			},
		]);
		expect(report.crossFolderLinks).toMatchObject([
			{
				sourceId: createNoteId('a'),
				targetId: createNoteId('b'),
				count: 2,
			},
			{
				sourceId: createNoteId('b'),
				targetId: createNoteId('a'),
				count: 1,
			},
		]);
		expect(report.totals.crossFolderLinkDensity).toBe(0.75);
		expect(report.drilldown.loopNoteIds).toEqual([createNoteId('a'), createNoteId('b')]);
	});
});
