import { parseMarkdownNote, type ParsedMarkdownNote } from '../state/markdown';

/**
 * RC-ENG-3.2 — a memo of {@link parseMarkdownNote} for the graph reads. Each command on the Graph screen
 * re-runs the visualization, health and cluster reads, and each of those parsed every visible note body
 * again (the wikilink candidate index twice per note); on a 2,000-note vault that re-parsing was most of
 * the read time.
 *
 * Keyed on the note TEXT alone, so a hit returns exactly what parsing that text returns: the cache holds
 * no actor, permission or visibility state, and every read keeps its own actor filtering. Every hit
 * returns fresh arrays and objects, so a caller mutating its result cannot change another's. Memory is
 * bounded by the total length of the cached texts; the oldest entries go first.
 */

const MAX_CACHED_CHARS = 16 * 1024 * 1024;

const cache = new Map<string, ParsedMarkdownNote>();
let cachedChars = 0;

function copyParsed(parsed: ParsedMarkdownNote): ParsedMarkdownNote {
	const properties: Record<string, string | string[]> = {};
	for (const [key, value] of Object.entries(parsed.properties)) {
		properties[key] = Array.isArray(value) ? [...value] : value;
	}
	return {
		body: parsed.body,
		properties,
		aliases: [...parsed.aliases],
		tags: [...parsed.tags],
		wikilinks: parsed.wikilinks.map((link) => ({ ...link })),
		hadFrontmatter: parsed.hadFrontmatter,
	};
}

/** {@link parseMarkdownNote}, memoized by the note text. Same result, fresh copy on every call. */
export function parseNoteCached(text: string): ParsedMarkdownNote {
	let parsed = cache.get(text);
	if (parsed === undefined) {
		parsed = parseMarkdownNote(text);
		if (text.length <= MAX_CACHED_CHARS) {
			cache.set(text, parsed);
			cachedChars += text.length;
			for (const key of cache.keys()) {
				if (cachedChars <= MAX_CACHED_CHARS) break;
				cache.delete(key);
				cachedChars -= key.length;
			}
		}
	}
	return copyParsed(parsed);
}
