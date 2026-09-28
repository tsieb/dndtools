import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseMarkdownNote } from '../src/state/markdown';

// The suite shares one module graph across files (`isolate: false`); counting parses needs a cache
// module wired to a counting parser, so each test loads its own copy.
const parse = vi.hoisted(() => ({ calls: 0 }));

async function loadCache() {
	vi.resetModules();
	vi.doMock('../src/state/markdown', async (importOriginal) => {
		const actual = await importOriginal<typeof import('../src/state/markdown')>();
		return {
			...actual,
			parseMarkdownNote: (text: string) => {
				parse.calls += 1;
				return actual.parseMarkdownNote(text);
			},
		};
	});
	return import('../src/queries/parsed-note-cache');
}

const NOTE =
	'---\naliases: [Keep]\ntags: [ruin]\n---\nSee [[Western Reaches]] and [[Hidden Outpost|the outpost]].';

describe('parseNoteCached (RC-ENG-3.2)', () => {
	beforeEach(() => {
		parse.calls = 0;
	});

	it('returns what parsing returns, as a fresh copy on every hit', async () => {
		const { parseNoteCached } = await loadCache();
		const first = parseNoteCached(NOTE);
		expect(first).toEqual(parseMarkdownNote(NOTE));
		first.wikilinks[0]!.target = 'Mutated';
		first.aliases.push('Mutated');
		const second = parseNoteCached(NOTE);
		expect(second).toEqual(parseMarkdownNote(NOTE));
		expect(second.wikilinks).not.toBe(first.wikilinks);
	});

	it('parses a text once until the cache is cleared', async () => {
		const { clearParsedNoteCache, parseNoteCached } = await loadCache();
		parseNoteCached(NOTE);
		parseNoteCached(NOTE);
		expect(parse.calls).toBe(1);
		clearParsedNoteCache();
		parseNoteCached(NOTE);
		expect(parse.calls).toBe(2);
	});
});
