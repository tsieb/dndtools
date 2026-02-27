import { describe, expect, it } from 'vitest';
import { createFolderId, createNoteId, type Note } from '$lib/types/note.js';
import { nowISO } from '$lib/utils/date.js';
import { buildLinkGraphQualityReport } from './link-graph-intelligence.js';
import { resolveLinkTargetId } from './link-resolution.js';

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
			resolveTitle: (title) =>
				resolveLinkTargetId(
					title,
					notes.map((note) => ({
						id: String(note.id),
						title: note.title,
						updatedAt: note.updatedAt,
						aliases: [],
					})),
				),
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
	});

	it('supports alias-aware dead-link detection', () => {
		const notes = [
			makeNote('city', 'Waterdeep', '', { aliases: ['City of Splendors'] }),
			makeNote('log', 'Session Log', 'Met in [[City of Splendors]]'),
		];

		const report = buildLinkGraphQualityReport({
			notes,
			resolveTitle: (title) =>
				resolveLinkTargetId(
					title,
					notes.map((note) => ({
						id: String(note.id),
						title: note.title,
						updatedAt: note.updatedAt,
						aliases: Array.isArray(note.frontmatter.aliases)
							? (note.frontmatter.aliases as string[])
							: [],
					})),
				),
		});

		expect(report.deadLinks).toHaveLength(0);
	});
});
