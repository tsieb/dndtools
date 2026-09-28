import { afterEach, describe, expect, it, vi } from 'vitest';

const parse = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../src/state/markdown', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/state/markdown')>();
	return {
		...actual,
		parseMarkdownNote: (text: string) => {
			parse.calls += 1;
			return actual.parseMarkdownNote(text);
		},
	};
});

import { clearParsedNoteCache, parseNoteCached } from '../src/queries/parsed-note-cache';
import { parseMarkdownNote } from '../src/state/markdown';

const NOTE =
	'---\naliases: [Keep]\ntags: [ruin]\n---\nSee [[Western Reaches]] and [[Hidden Outpost|the outpost]].';

describe('parseNoteCached (RC-ENG-3.2)', () => {
	afterEach(() => {
		clearParsedNoteCache();
		parse.calls = 0;
	});

	it('returns what parsing returns, as a fresh copy on every hit', () => {
		const first = parseNoteCached(NOTE);
		expect(first).toEqual(parseMarkdownNote(NOTE));
		first.wikilinks[0]!.target = 'Mutated';
		first.aliases.push('Mutated');
		const second = parseNoteCached(NOTE);
		expect(second).toEqual(parseMarkdownNote(NOTE));
		expect(second.wikilinks).not.toBe(first.wikilinks);
	});

	it('parses a text once until the cache is cleared', () => {
		parseNoteCached(NOTE);
		parseNoteCached(NOTE);
		expect(parse.calls).toBe(1);
		clearParsedNoteCache();
		parseNoteCached(NOTE);
		expect(parse.calls).toBe(2);
	});
});
