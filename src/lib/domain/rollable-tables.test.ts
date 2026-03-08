import { describe, expect, it } from 'vitest';
import type { Note } from '$lib/types/note.js';
import { createFolderId, createNoteId } from '$lib/types/note.js';
import { listRollableTables, rollRollableTable } from './rollable-tables.js';

function buildNote(input: {
	id: string;
	title: string;
	content: string;
	frontmatter?: Record<string, unknown>;
}): Note {
	return {
		id: createNoteId(input.id),
		title: input.title,
		content: input.content,
		folder: createFolderId('/tables'),
		filePath: `/tables/${input.id}.md`,
		tags: [],
		frontmatter: input.frontmatter ?? {},
		createdAt: '2026-03-07T00:00:00.000Z',
		updatedAt: '2026-03-07T00:00:00.000Z',
		deleted: false,
		deletedAt: null,
		visibility: 'dm_only',
		pinned: false,
		pinnedAt: null,
	};
}

describe('rollable tables domain', () => {
	it('extracts markdown tables from rollable frontmatter notes', () => {
		const notes = [
			buildNote({
				id: 'note-rollable',
				title: 'Dungeon Odds',
				frontmatter: { rollable: true },
				content: `# Any Heading

| Result | Weight |
| --- | --- |
| Goblins | 2 |
| Skeletons | 1 |
`,
			}),
		];

		const tables = listRollableTables(notes);
		expect(tables).toHaveLength(1);
		expect(tables[0]?.tableName).toBe('Any Heading');
		expect(tables[0]?.rowCount).toBe(2);
		expect(tables[0]?.weighted).toBe(true);
	});

	it('extracts tables when heading matches known category keywords', () => {
		const notes = [
			buildNote({
				id: 'note-weather',
				title: 'Road Notes',
				content: `# Weather
| Result |
| --- |
| Fog |
| Rain |
`,
			}),
		];

		const tables = listRollableTables(notes);
		expect(tables).toHaveLength(1);
		expect(tables[0]?.tableName).toBe('Weather');
		expect(tables[0]?.rows.map((row) => row.result)).toEqual(['Fog', 'Rain']);
	});

	it('ignores markdown tables when a note is not marked rollable', () => {
		const notes = [
			buildNote({
				id: 'note-plain',
				title: 'Reference',
				content: `# Inventory
| Item | Qty |
| --- | --- |
| Rope | 2 |
`,
			}),
		];

		expect(listRollableTables(notes)).toEqual([]);
	});

	it('rolls rows using configured weights', () => {
		const note = buildNote({
			id: 'note-loot',
			title: 'Loot',
			frontmatter: { rollable: true },
			content: `# Loot
| Result | Weight |
| --- | --- |
| Copper | 9 |
| Diamond | 1 |
`,
		});
		const table = listRollableTables([note])[0];
		expect(table).toBeTruthy();
		if (!table) return;

		const lowRoll = rollRollableTable(table, { random: () => 0.01 });
		const highRoll = rollRollableTable(table, { random: () => 0.95 });
		expect(lowRoll.result).toBe('Copper');
		expect(highRoll.result).toBe('Diamond');
	});
});
