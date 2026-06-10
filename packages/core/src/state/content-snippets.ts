import {
	renderMarkdownPreview,
	validateMarkdownDraft,
	type MarkdownPreview,
	type MarkdownValidationResult,
} from './content-editor';
import { normalizeVisibilityLevel, type VisibilityLevel } from '../permissions/visibility-filter';

/**
 * CONTENT-004 — REUSABLE SNIPPETS that CANNOT BYPASS note validation, visibility metadata, or markdown
 * sanitization (the SECURITY CRUX of this epic).
 *
 * A snippet is a small named chunk of reusable markdown. Inserting one is NOT a privileged path: it
 * produces ordinary note text that funnels through the EXISTING content pipeline — the SAME validator
 * ({@link validateMarkdownDraft}) and the SAME safe block-model renderer ({@link renderMarkdownPreview},
 * which never emits raw HTML, so script/HTML injection cannot reach the rendered output) that hand-typed
 * content uses. There is NO parallel validation/sanitization path here; this module composes the existing
 * one and proves the snippet cannot escape it.
 *
 * The three things a snippet MUST NOT be able to do, each enforced fail-closed:
 *
 *   1. SKIP VALIDATION — the text produced by inserting a snippet is run through `validateMarkdownDraft`,
 *      exactly as a hand-typed draft is. A snippet whose content would make the draft invalid makes the
 *      INSERTED draft equally invalid (it does not get a free pass). {@link insertSnippet} reports the
 *      validation result and the command layer refuses to write an invalid draft.
 *
 *   2. SMUGGLE UNSANITIZED MARKDOWN — the inserted text is rendered through `renderMarkdownPreview`. That
 *      renderer produces a SAFE block model (headings/paragraphs/list items) and never raw HTML, so a
 *      snippet containing `<script>` / raw HTML is sanitized to inert text exactly as the same content is
 *      when typed. {@link previewInsertedSnippet} returns the same safe model; nothing renders the raw
 *      snippet bytes directly.
 *
 *   3. WIDEN / OVERRIDE the note's VISIBILITY — a snippet carries NO visibility metadata of its own. An
 *      inserted snippet INHERITS the host note's visibility; {@link snippetCanInsertIntoVisibility} fails
 *      closed and a snippet can never raise the audience of the note it is inserted into.
 *
 * Pure data + pure functions: no GUI, no storage, no clock, no locale. The command layer composes this and
 * the durable write goes through the EXISTING `content.update-item` command (which re-validates fail-closed);
 * the GUI renders the computed render/preview/validation model and dispatches an intent, never touching
 * storage (Architecture Contract 1).
 */

export const CONTENT_SNIPPET_SCHEMA_VERSION = 1 as const;

/** A reusable snippet: a named chunk of markdown body content. It carries NO visibility of its own. */
export interface ContentSnippet {
	/** Stable snippet id. */
	id: string;
	/** Human display name. */
	name: string;
	/** A short non-leaking description. */
	description: string;
	/** The reusable markdown body fragment. Inserted verbatim into the host note text (then validated). */
	body: string;
}

/** Where in the host note text a snippet is inserted, relative to the caret offset. */
export type SnippetInsertPosition = 'before' | 'after' | 'at-caret';

/**
 * The result of inserting a snippet into a host note's body (CONTENT-004). It carries the resulting text,
 * the EXISTING-pipeline validation of that text, and a single fail-closed `valid` flag the command layer
 * gates the write on. Inserting NEVER skips validation: an inserted snippet that makes the draft invalid
 * yields `valid: false`, exactly as the same content typed by hand would.
 */
export interface SnippetInsertionResult {
	snippetId: string;
	/** The host body with the snippet inserted at the requested position. */
	text: string;
	/** The EXISTING markdown draft validation of the resulting text (frontmatter/wikilink). */
	validation: MarkdownValidationResult;
	/**
	 * FAIL CLOSED: true only when the resulting text passes the existing validator. The command layer
	 * commits ONLY when this is true — a snippet can never write content the validator rejects.
	 */
	valid: boolean;
}

/** Clamp a caret offset into `[0, length]`. */
function clampCaret(text: string, caret: number): number {
	if (!Number.isFinite(caret)) return text.length;
	return Math.max(0, Math.min(Math.trunc(caret), text.length));
}

/**
 * CONTENT-004 — insert a snippet's body into a host note body at a position, then VALIDATE the result
 * through the EXISTING validator. PURE + DETERMINISTIC.
 *
 * The snippet body is inserted verbatim (it is markdown, not a privileged payload); the resulting text is
 * what {@link validateMarkdownDraft} validates. The function does NOT sanitize, rewrite, or strip the
 * snippet on insert — sanitization is the RENDER step's job ({@link previewInsertedSnippet}) and is shared
 * with hand-typed content — so a snippet receives no special treatment in either direction: it is neither
 * trusted (it is validated + sanitized) nor specially mangled (it is plain note text).
 */
export function insertSnippet(
	hostBody: string,
	snippet: ContentSnippet,
	position: SnippetInsertPosition,
	caret = hostBody.length,
): SnippetInsertionResult {
	let text: string;
	switch (position) {
		case 'before':
			text = joinBlocks(snippet.body, hostBody);
			break;
		case 'after':
			text = joinBlocks(hostBody, snippet.body);
			break;
		case 'at-caret': {
			const at = clampCaret(hostBody, caret);
			text = hostBody.slice(0, at) + snippet.body + hostBody.slice(at);
			break;
		}
	}

	// Funnel the resulting text through the EXISTING validator — the snippet gets no free pass.
	const validation = validateMarkdownDraft(text);
	return { snippetId: snippet.id, text, validation, valid: validation.valid };
}

/** Join two markdown blocks with a single blank-line separator, avoiding doubled blank lines. */
function joinBlocks(first: string, second: string): string {
	if (first === '') return second;
	if (second === '') return first;
	return `${first.replace(/\s+$/, '')}\n\n${second.replace(/^\s+/, '')}`;
}

/**
 * CONTENT-004 — render the SAFE preview of a snippet (or of note text with a snippet inserted) through the
 * EXISTING block-model renderer. This is the SANITIZATION proof: {@link renderMarkdownPreview} produces a
 * heading/paragraph/list-item block model and NEVER raw HTML, so a snippet containing `<script>` or raw
 * HTML is reduced to inert text — IDENTICALLY to the same content typed by hand. Pure.
 */
export function previewInsertedSnippet(
	hostBody: string,
	snippet: ContentSnippet,
	position: SnippetInsertPosition,
	caret = hostBody.length,
): MarkdownPreview {
	const inserted = insertSnippet(hostBody, snippet, position, caret);
	return renderMarkdownPreview(inserted.text);
}

/**
 * The breadth of an audience for a visibility level — used ONLY to prove a snippet cannot WIDEN a note's
 * visibility. Higher rank = larger audience. `dm-only` (smallest) < `shared` (explicit delivery only) <
 * `player-visible` (all players). This ordering is deliberately conservative: `shared` is treated as
 * narrower than `player-visible` because it reaches only explicitly-delivered actors.
 */
const VISIBILITY_BREADTH: Record<VisibilityLevel, number> = {
	'dm-only': 0,
	shared: 1,
	'player-visible': 2,
};

/**
 * CONTENT-004 — the VISIBILITY GUARD. An inserted snippet INHERITS the host note's visibility and may NEVER
 * widen it. Returns true only when the requested resulting visibility is NARROWER THAN OR EQUAL TO the host
 * note's current visibility. A snippet that tries to make a `dm-only` note `player-visible` is refused
 * fail-closed. Both inputs are normalized through the SAME visibility model (an unknown value fails closed
 * to `dm-only`), so adversarial metadata cannot inject a wider level.
 *
 * In practice the insert command keeps the note's visibility UNCHANGED (a snippet carries none), so this is
 * the explicit, test-covered invariant that a snippet can never escape or override the note's visibility
 * metadata.
 */
export function snippetCanInsertIntoVisibility(
	hostVisibility: unknown,
	requestedResultingVisibility: unknown,
): boolean {
	const host = normalizeVisibilityLevel(hostVisibility);
	const requested = normalizeVisibilityLevel(requestedResultingVisibility);
	return VISIBILITY_BREADTH[requested] <= VISIBILITY_BREADTH[host];
}

/**
 * The visibility an inserted snippet results in: ALWAYS the host note's own (normalized) visibility. A
 * snippet carries no visibility, so insertion is visibility-preserving by construction. Exposed so the
 * command/GUI can show that the inserted content inherits — never widens — the note's visibility.
 */
export function inheritedSnippetVisibility(hostVisibility: unknown): VisibilityLevel {
	return normalizeVisibilityLevel(hostVisibility);
}

// --- CONTENT-004 — the built-in SNIPPET LIBRARY ---------------------------------------------------

/**
 * THE built-in reusable SNIPPETS (CONTENT-004): a small library the authoring UI offers for insert/reuse.
 * Authored once here as the data artifact a reviewer inspects. None carries visibility — every snippet
 * inherits the host note's visibility on insert (it can never widen it).
 *
 *   - `read-aloud` — a boxed read-aloud block.
 *   - `stat-line`  — a reusable inline stat line.
 *   - `secret-door` — a reusable lore stub.
 */
export const CONTENT_SNIPPET_LIBRARY: readonly ContentSnippet[] = Object.freeze([
	Object.freeze({
		id: 'read-aloud',
		name: 'Read-aloud box',
		description: 'A boxed passage to read aloud to players.',
		body: '> [!read-aloud]\n> Read this aloud:\n>\n> ',
	}),
	Object.freeze({
		id: 'stat-line',
		name: 'Stat line',
		description: 'A reusable inline ability-score stat line.',
		body: '**STR** 10 · **DEX** 10 · **CON** 10 · **INT** 10 · **WIS** 10 · **CHA** 10',
	}),
	Object.freeze({
		id: 'secret-door',
		name: 'Secret door note',
		description: 'A reusable secret-door lore stub.',
		body: '## Secret door\n\nA concealed door. DC 15 Investigation to spot.',
	}),
]) as readonly ContentSnippet[];

/** Resolve a built-in snippet by id, or `null` when the id is unknown. Pure. */
export function contentSnippet(snippetId: string): ContentSnippet | null {
	return CONTENT_SNIPPET_LIBRARY.find((snippet) => snippet.id === snippetId) ?? null;
}

/** A read-only summary row for one snippet, for the authoring UI's snippet list. Pure. */
export interface ContentSnippetSummary {
	id: string;
	name: string;
	description: string;
}

/** Summarize every built-in snippet, in declared order. Pure. */
export function listContentSnippets(): ContentSnippetSummary[] {
	return CONTENT_SNIPPET_LIBRARY.map((snippet) => ({
		id: snippet.id,
		name: snippet.name,
		description: snippet.description,
	}));
}
