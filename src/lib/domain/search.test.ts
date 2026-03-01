import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseQuery, searchService } from './search.js';
import { createFolderId, createNoteId, type Note } from '$lib/types/note.js';

function note(overrides: Partial<Note> = {}): Note {
	return {
		id: createNoteId('note-default'),
		title: 'Default',
		content: '',
		folder: createFolderId('/'),
		tags: [],
		frontmatter: {},
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		deleted: false,
		deletedAt: null,
		pinned: false,
		pinnedAt: null,
		...overrides,
	};
}

describe('parseQuery', () => {
	it('parses operators and quoted phrases', () => {
		const parsed = parseQuery(
			'tag:session folder:/campaign type:character updated:>=2026-01-01 links:[[Sildar Hallwinter]] "goblin ambush" scout',
		);
		expect(parsed.tagFilters).toEqual(['session']);
		expect(parsed.folderFilters).toEqual(['/campaign']);
		expect(parsed.typeFilters).toEqual(['character']);
		expect(parsed.linkFilters).toEqual(['sildar hallwinter']);
		expect(parsed.updatedFilters).toHaveLength(1);
		expect(parsed.phrases).toEqual(['goblin ambush']);
		expect(parsed.terms).toEqual(['scout']);
	});

	it('supports untagged filter alias', () => {
		const parsed = parseQuery('tag:none');
		expect(parsed.hasTagNoneFilter).toBe(true);
	});
});

describe('searchService', () => {
	beforeEach(async () => {
		vi.useRealTimers();
		await searchService.buildIndex([]);
	});

	it('excludes deleted notes from indexed results', async () => {
		await searchService.buildIndex([
			note({ id: createNoteId('keep'), title: 'Goblin Cave', deleted: false }),
			note({ id: createNoteId('drop'), title: 'Goblin Ambush', deleted: true }),
		]);

		const results = searchService.search('goblin');
		expect(results).toHaveLength(1);
		expect(results[0]?.id).toBe('keep');
	});

	it('returns cached detailed results for repeated query', async () => {
		await searchService.buildIndex([note({ id: createNoteId('a'), title: 'Neverwinter' })]);

		const first = searchService.searchDetailed('never');
		const second = searchService.searchDetailed('never');
		expect(second).toBe(first);
	});

	it('supports incremental add and remove without full rebuild', async () => {
		await searchService.buildIndex([note({ id: createNoteId('a'), title: 'Phandalin' })]);
		searchService.addNote(note({ id: createNoteId('b'), title: 'Cragmaw Hideout' }));
		expect(searchService.search('cragmaw').map((entry) => entry.id)).toEqual(['b']);

		searchService.removeNote(createNoteId('b'));
		expect(searchService.search('cragmaw')).toEqual([]);
	});

	it('applies tag/folder/type/updated operators', async () => {
		await searchService.buildIndex([
			note({
				id: createNoteId('a'),
				title: 'Session Prep',
				content: 'Goblin scouts around Cragmaw.',
				tags: ['session'],
				folder: createFolderId('/campaign/planning'),
				frontmatter: { type: 'character' },
				updatedAt: '2026-01-15T00:00:00.000Z',
			}),
			note({
				id: createNoteId('b'),
				title: 'Lore Notes',
				tags: ['lore'],
				folder: createFolderId('/world'),
				frontmatter: { type: 'location' },
				updatedAt: '2025-11-01T00:00:00.000Z',
			}),
		]);

		const results = searchService.searchDetailed(
			'tag:session folder:/campaign type:character updated:>=2026-01-01 goblin',
		).results;
		expect(results.map((entry) => entry.id)).toEqual(['a']);
	});

	it('applies links operator against wikilink targets', async () => {
		await searchService.buildIndex([
			note({
				id: createNoteId('a'),
				title: 'Scene A',
				content: 'The party meets [[Sildar Hallwinter]] at the inn.',
			}),
			note({
				id: createNoteId('b'),
				title: 'Scene B',
				content: 'No character links here.',
			}),
		]);

		const results = searchService.searchDetailed('links:[[Sildar Hallwinter]]').results;
		expect(results.map((entry) => entry.id)).toEqual(['a']);
	});

	it('enforces exact quoted phrase match', async () => {
		await searchService.buildIndex([
			note({
				id: createNoteId('a'),
				title: 'Goblin Ambush',
				content: 'A goblin ambush starts at dusk.',
			}),
			note({ id: createNoteId('b'), title: 'Goblin Notes', content: 'Goblins often plan traps.' }),
		]);

		const results = searchService.searchDetailed('"goblin ambush"').results;
		expect(results.map((entry) => entry.id)).toEqual(['a']);
	});

	it('returns snippet and nearest heading anchor', async () => {
		await searchService.buildIndex([
			note({
				id: createNoteId('a'),
				title: 'Session 12',
				content:
					'# Arrival\nSome setup.\n\n## Goblin Ambush\nThe goblin ambush happens near the bridge.',
			}),
		]);

		const [first] = searchService.searchDetailed('"goblin ambush"').results;
		expect(first?.snippet.toLowerCase()).toContain('goblin ambush');
		expect(first?.anchor).toBe('goblin-ambush');
	});

	it('provides facet counts and telemetry metadata', async () => {
		await searchService.buildIndex([
			note({
				id: createNoteId('a'),
				title: 'A',
				tags: ['session'],
				folder: createFolderId('/campaign'),
			}),
			note({
				id: createNoteId('b'),
				title: 'B',
				tags: ['session', 'npc'],
				folder: createFolderId('/campaign'),
			}),
		]);
		const detailed = searchService.searchDetailed('session');
		expect(detailed.facets.tags.find((facet) => facet.value === 'session')?.count).toBe(2);
		expect(detailed.facets.folders.find((facet) => facet.value === '/campaign')?.count).toBe(2);
		expect(detailed.telemetry.budgetMs).toBeGreaterThan(0);
		expect(detailed.telemetry.sampleSize).toBeGreaterThan(0);
	});
});
