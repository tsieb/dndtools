// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
	RandomTableError,
	buildRandomTableIndex,
	findRollBlockTokens,
	formatRollBlock,
	getSystemRandomTableNotes,
	parseInlineTableCommand,
	parseRandomTableNote,
	replaceRollBlockAtIndex,
	rollRandomTable,
} from './random-tables.js';

function sequenceRandom(samples: number[]): () => number {
	let index = 0;
	return () => {
		const value = samples[index] ?? samples[samples.length - 1] ?? 0;
		index += 1;
		return value;
	};
}

describe('random tables domain', () => {
	it('parses weighted rows from random-table fences', () => {
		const parsed = parseRandomTableNote(
			{
				id: 'vault-table-1',
				title: 'Loot Table',
				folder: '/tables',
				tags: ['random-table', 'loot'],
				content: `---
tableName: Quick Loot
aliases:
  - loot
---

\`\`\`random-table
3 | 10 gp
5-6 | Potion of healing
\`\`\`
`,
			},
			'vault',
		);

		expect(parsed.table).toBeTruthy();
		expect(parsed.issues).toHaveLength(0);
		expect(parsed.table?.name).toBe('Quick Loot');
		expect(parsed.table?.aliases).toEqual(expect.arrayContaining(['Loot Table', 'loot']));
		expect(parsed.table?.rows).toEqual([
			{ weight: 3, result: '10 gp', line: 2 },
			{ weight: 2, result: 'Potion of healing', line: 3 },
		]);
	});

	it('reports parsing errors for malformed random-table notes', () => {
		const parsed = parseRandomTableNote(
			{
				id: 'bad-table',
				title: 'Broken',
				folder: '/tables',
				tags: ['random-table'],
				content: '```random-table\nno weight here\n```',
			},
			'vault',
		);

		expect(parsed.table).toBeNull();
		expect(parsed.issues.some((issue) => issue.severity === 'error')).toBe(true);
	});

	it('builds index with vault tables and system tables', () => {
		const index = buildRandomTableIndex({
			vaultNotes: [
				{
					id: 'vault-encounter',
					title: '5e Encounter Dungeon CR 0-4',
					folder: '/campaign/tables',
					tags: ['random-table'],
					content: '```random-table\n1 | Local vault override encounter\n```',
					updatedAt: '2026-03-01T00:00:00.000Z',
				},
			],
		});

		expect(index.tables.length).toBeGreaterThan(10);
		const match = index.byKey.get('5e encounter dungeon cr 0-4');
		expect(match?.[0]?.source).toBe('vault');
		expect(match?.[0]?.rows[0]?.result).toBe('Local vault override encounter');
	});

	it('rolls nested table references deterministically', () => {
		const index = buildRandomTableIndex({
			includeSystem: false,
			vaultNotes: [
				{
					id: 'root-table',
					title: 'Root',
					folder: '/tables',
					tags: ['random-table'],
					content: '```random-table\n1 | Plain Result\n1 | Nested {{table: Child}}\n```',
				},
				{
					id: 'child-table',
					title: 'Child',
					folder: '/tables',
					tags: ['random-table'],
					content: '```random-table\n1 | Child Result\n```',
				},
			],
		});

		const roll = rollRandomTable(index, 'Root', { random: sequenceRandom([0.99, 0.2]) });
		expect(roll.result).toBe('Nested Child Result');
		expect(roll.trace).toHaveLength(2);
		expect(roll.trace.map((entry) => entry.tableName)).toEqual(['Child', 'Root']);
		expect(roll.referencedTables).toEqual(['Child']);
	});

	it('detects cycles in nested table references', () => {
		const index = buildRandomTableIndex({
			includeSystem: false,
			vaultNotes: [
				{
					id: 'a',
					title: 'A',
					folder: '/tables',
					tags: ['random-table'],
					content: '```random-table\n1 | {{table: B}}\n```',
				},
				{
					id: 'b',
					title: 'B',
					folder: '/tables',
					tags: ['random-table'],
					content: '```random-table\n1 | {{table: A}}\n```',
				},
			],
		});

		expect(() => rollRandomTable(index, 'A', { random: () => 0.1 })).toThrowError(RandomTableError);
		try {
			rollRandomTable(index, 'A', { random: () => 0.1 });
		} catch (error) {
			expect(error).toBeInstanceOf(RandomTableError);
			expect((error as RandomTableError).code).toBe('table_cycle_detected');
		}
	});

	it('parses /table slash commands and replaces roll blocks by index', () => {
		expect(parseInlineTableCommand('/table Loot')).toBe('Loot');
		expect(parseInlineTableCommand('/table [Tavern Names]')).toBe('Tavern Names');
		expect(parseInlineTableCommand('/roll 1d20')).toBeNull();

		const block = formatRollBlock('Tavern Names');
		expect(block).toBe('{{roll: Tavern Names}}');

		const content = ['Before', '{{roll: First}}', 'middle', '{{roll: Second}}', 'After'].join('\n');
		const replaced = replaceRollBlockAtIndex(content, 1, 'Resolved result');
		expect(replaced).toContain('{{roll: First}}');
		expect(replaced).toContain('Resolved result');
		expect(replaced).not.toContain('{{roll: Second}}');

		const tokens = findRollBlockTokens(content);
		expect(tokens).toHaveLength(2);
		expect(tokens[1]?.tableName).toBe('Second');
		expect(tokens[1]?.matchIndex).toBe(1);
	});

	it('ships required system random-table categories', () => {
		const titles = getSystemRandomTableNotes().map((entry) => entry.title);
		expect(titles).toEqual(
			expect.arrayContaining([
				'5e Encounter Dungeon CR 0-4',
				'5e Encounter Wilderness CR 0-4',
				'5e Encounter Urban CR 0-4',
				'5e NPC Trait',
				'5e NPC Bond',
				'5e NPC Flaw',
				'5e NPC Ideal',
				'5e Treasure Hoard Tier 1',
				'5e Weather Temperate',
				'5e Dungeon Room Content',
				'5e Tavern Name',
			]),
		);
	});
});
