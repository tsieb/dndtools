import MiniSearch from 'minisearch';
import { describe, expect, it } from 'vitest';
import { createFolderId, createNoteId } from '$lib/types/note.js';
import {
	buildLinkGraphEntries,
	buildSerializedSearchIndex,
	parseNotesForIndex,
	SEARCH_INDEX_OPTIONS,
} from './operations.js';

function makeNote(id: string, title: string, deleted = false) {
	return {
		id: createNoteId(id),
		title,
		content: `# ${title}\n\nBody for ${title}`,
		folder: createFolderId('/'),
		filePath: `${title.toLowerCase()}.md`,
		tags: ['lore'],
		frontmatter: { type: 'npc' },
		visibility: 'dm_only' as const,
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		deleted,
		deletedAt: null,
		pinned: false,
		pinnedAt: null,
	};
}

describe('runtime worker operations', () => {
	it('parses note batches into searchable documents and skips deleted notes', () => {
		const parsed = parseNotesForIndex({
			notes: [makeNote('note-a', 'Alpha'), makeNote('note-b', 'Beta', true)],
		});
		expect(parsed.documents).toHaveLength(1);
		expect(parsed.documents[0]).toMatchObject({
			id: 'note-a',
			title: 'Alpha',
			tags: 'lore',
			type: 'npc',
		});
	});

	it('serializes a MiniSearch index that can be restored for queries', () => {
		const parsed = parseNotesForIndex({
			notes: [makeNote('note-a', 'Alpha'), makeNote('note-b', 'Gamma')],
		});
		const built = buildSerializedSearchIndex({ documents: parsed.documents });
		const index = MiniSearch.loadJSON(built.serializedIndex, SEARCH_INDEX_OPTIONS);
		const results = index.search('Alpha', { prefix: true });
		expect(results[0]?.id).toBe('note-a');
	});

	it('builds forward and backward adjacency entries for full graph rebuilds', () => {
		const graph = buildLinkGraphEntries({
			noteIds: ['a', 'b', 'c'],
			links: [
				{ sourceId: 'a', targetId: 'b' },
				{ sourceId: 'a', targetId: 'c' },
				{ sourceId: 'b', targetId: 'c' },
			],
		});

		expect(graph.forwardEntries).toContainEqual(['a', ['b', 'c']]);
		expect(graph.forwardEntries).toContainEqual(['b', ['c']]);
		expect(graph.forwardEntries).toContainEqual(['c', []]);
		expect(graph.backwardEntries).toContainEqual(['b', ['a']]);
		expect(graph.backwardEntries).toContainEqual(['c', ['a', 'b']]);
	});
});
