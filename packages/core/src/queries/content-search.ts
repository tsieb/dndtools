import type { PermissionState } from '../state/permission-state';
import type { VaultContentState } from '../state/content';
import { parseMarkdownNote } from '../state/markdown';
import { getContentItemsForActor, type ContentItemView } from './content-query';

/**
 * CONTENT-001 — ACTOR-FILTERED note SEARCH and the ACTOR-FILTERED WIKILINK suggestion source.
 *
 * Both compose {@link getContentItemsForActor}, which is the single visibility-and-tombstone choke-point:
 * it returns ONLY the live items the actor may see. Because search and suggestions are built on top of
 * that filtered set, a player can NEVER get a hit, snippet, title, or wikilink suggestion for a note
 * they cannot see — there is no separate index that could leak hidden content (CONTENT-001 AC3, AC4;
 * Cross-Contract Non-Negotiable 2). An unknown/unauthenticated actor gets an empty result (fail closed).
 *
 * Pure and deterministic: the same state + query + actor always returns the same ranked results. The
 * Processing Core owns the ranking; the GUI renders the result (Architecture Contract 1).
 */

/** A matched span inside a field, for highlighting. Offsets are into the searched (lowercased-compared) text. */
export interface SearchSnippet {
	/** Which field the snippet came from. */
	field: 'title' | 'body';
	/** A short window of surrounding text containing the match (plain text, frontmatter stripped). */
	text: string;
}

/** One actor-filtered search hit. The item is always one the actor may see. */
export interface ContentSearchHit {
	item: ContentItemView;
	/** A title-match outranks a body-only match; higher score sorts first. */
	score: number;
	/** Whether the query matched the title. */
	titleMatch: boolean;
	/** Up to one snippet of body context around the first body match (omitted for a title-only match). */
	snippet: SearchSnippet | null;
}

const SNIPPET_RADIUS = 30;

/** Build a plain-text body (frontmatter stripped) for searching/snippeting. */
function searchableBody(view: ContentItemView): string {
	// The body field is the authored markdown; strip any frontmatter block so a property never matches.
	return parseMarkdownNote(view.body).body;
}

function firstBodySnippet(body: string, needle: string): SearchSnippet | null {
	const index = body.toLowerCase().indexOf(needle);
	if (index === -1) return null;
	const start = Math.max(0, index - SNIPPET_RADIUS);
	const end = Math.min(body.length, index + needle.length + SNIPPET_RADIUS);
	const prefix = start > 0 ? '…' : '';
	const suffix = end < body.length ? '…' : '';
	return { field: 'body', text: `${prefix}${body.slice(start, end).trim()}${suffix}` };
}

/**
 * CONTENT-001 — search the actor's VISIBLE notes by title + body. Case-insensitive substring match. A
 * blank query returns all visible items (the unfiltered visible list). Results are ranked title-first
 * then by stable id, so ordering is deterministic across surfaces. A non-visible note can never appear
 * — search runs over the actor-filtered query, not raw state.
 */
export function searchContentForActor(
	content: VaultContentState,
	permissions: PermissionState,
	actorId: string,
	query: string,
): ContentSearchHit[] {
	const visible = getContentItemsForActor(content, permissions, actorId);
	const needle = query.trim().toLowerCase();
	if (needle === '') {
		return visible.map((item) => ({ item, score: 0, titleMatch: false, snippet: null }));
	}
	const hits: ContentSearchHit[] = [];
	for (const item of visible) {
		const titleMatch = item.title.toLowerCase().includes(needle);
		const body = searchableBody(item);
		const snippet = firstBodySnippet(body, needle);
		const bodyMatch = snippet !== null;
		if (!titleMatch && !bodyMatch) continue;
		hits.push({
			item,
			score: titleMatch ? 2 : 1,
			titleMatch,
			snippet: titleMatch ? null : snippet,
		});
	}
	return hits.sort((a, b) => (a.score === b.score ? a.item.id.localeCompare(b.item.id) : b.score - a.score));
}

/** One wikilink autocomplete suggestion: the target note's title (and id), all actor-visible. */
export interface WikilinkSuggestion {
	itemId: string;
	/** The note title — the text inserted into `[[...]]`. */
	title: string;
}

const MAX_WIKILINK_SUGGESTIONS = 10;

/**
 * CONTENT-002 — actor-filtered WIKILINK SUGGESTIONS. Returns visible NOTE titles whose title contains the
 * partial query (prefix-first ranking), capped to a small list. CRITICAL non-leak: suggestions are drawn
 * ONLY from the actor's visible items, so the editor is NEVER offered a `[[...]]` target for a note it
 * may not see (CONTENT-002 wikilink assistance, fail closed). A blank query returns the leading visible
 * notes so the editor has something to pick from. Pure + deterministic.
 */
export function suggestWikilinkTargetsForActor(
	content: VaultContentState,
	permissions: PermissionState,
	actorId: string,
	query: string,
): WikilinkSuggestion[] {
	const visible = getContentItemsForActor(content, permissions, actorId).filter(
		(item) => item.kind === 'note',
	);
	const needle = query.trim().toLowerCase();
	const ranked = visible
		.map((item) => {
			const title = item.title.toLowerCase();
			const matches = needle === '' || title.includes(needle);
			const prefix = needle !== '' && title.startsWith(needle);
			return { item, matches, rank: prefix ? 0 : 1 };
		})
		.filter((entry) => entry.matches)
		.sort((a, b) => (a.rank === b.rank ? a.item.title.localeCompare(b.item.title) : a.rank - b.rank))
		.slice(0, MAX_WIKILINK_SUGGESTIONS);
	return ranked.map((entry) => ({ itemId: entry.item.id, title: entry.item.title }));
}
