import { extractWikilinks, parseMarkdownNote, type ParsedWikilink } from './markdown';

/**
 * CONTENT-002 — PURE, DETERMINISTIC markdown editor support: VALIDATION, PREVIEW, and the WIKILINK
 * model the editor surfaces. Like {@link parseMarkdownNote} this never reads ambient state (no DOM, no
 * clock, no locale), so the same draft always validates and previews identically across devices and
 * across the desktop/compact profiles.
 *
 * The Processing Core owns the policy; the GUI renders the computed result and dispatches command
 * intents (Architecture Contract 1). VALIDATION fails closed: an editor that cannot parse its
 * frontmatter or that carries a malformed wikilink reports a blocking error rather than silently
 * writing ambiguous content. The actor-filtered wikilink SUGGESTION source lives in the content query
 * (`queries/content-search.ts`) so a suggestion can never name a note the editor may not see.
 */

export const CONTENT_EDITOR_SCHEMA_VERSION = 1 as const;

/** The severity of a single validation finding. `error` blocks save; `warning` is advisory. */
export type ValidationSeverity = 'error' | 'warning';

/** One validation finding against a markdown draft (frontmatter or wikilink shape). */
export interface MarkdownValidationIssue {
	severity: ValidationSeverity;
	/** A stable machine code so the GUI can localize/group the message. */
	code:
		| 'frontmatter-unterminated'
		| 'frontmatter-malformed-line'
		| 'wikilink-empty-target'
		| 'wikilink-unbalanced';
	message: string;
}

/** The result of validating a markdown draft. `valid` is false when any `error` issue is present. */
export interface MarkdownValidationResult {
	valid: boolean;
	issues: MarkdownValidationIssue[];
}

const FRONTMATTER_OPEN_PATTERN = /^---\r?\n/;
const FRONTMATTER_FULL_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
// A balanced `[[...]]`. Used only to count balance; the parser owns extraction.
const WIKILINK_OPEN = '[[';
const WIKILINK_CLOSE = ']]';
// A literally empty wikilink `[[]]` (the parser's extractor requires ≥1 inner char, so detect it here).
const EMPTY_WIKILINK_PATTERN = /\[\[\s*\]\]/;

/**
 * Validate a markdown draft (CONTENT-002 validation feedback). FAILS CLOSED: an OPENED-but-unterminated
 * frontmatter block, a frontmatter line that is neither a `key: value` nor a list item, an empty
 * wikilink target (`[[]]`), or unbalanced `[[`/`]]` markers each produce a finding. Frontmatter issues
 * and empty/unbalanced wikilinks are blocking errors; the draft is otherwise valid. Pure.
 */
export function validateMarkdownDraft(text: string): MarkdownValidationResult {
	const issues: MarkdownValidationIssue[] = [];

	if (FRONTMATTER_OPEN_PATTERN.test(text)) {
		const full = FRONTMATTER_FULL_PATTERN.exec(text);
		if (!full) {
			issues.push({
				severity: 'error',
				code: 'frontmatter-unterminated',
				message: 'The frontmatter block opens with `---` but is never closed with a matching `---`.',
			});
		} else {
			const block = full[1] ?? '';
			for (const rawLine of block.split(/\r?\n/)) {
				const line = rawLine.trim();
				if (line === '') continue;
				const isListItem = /^-\s+/.test(line);
				const isKeyValue = /^[A-Za-z0-9_][\w.-]*\s*:/.test(line);
				if (!isListItem && !isKeyValue) {
					issues.push({
						severity: 'error',
						code: 'frontmatter-malformed-line',
						message: `Frontmatter line is not a "key: value" property or list item: "${line}".`,
					});
				}
			}
		}
	}

	// Balance check: every `[[` must have a following `]]`.
	const opens = countOccurrences(text, WIKILINK_OPEN);
	const closes = countOccurrences(text, WIKILINK_CLOSE);
	if (opens !== closes) {
		issues.push({
			severity: 'error',
			code: 'wikilink-unbalanced',
			message: 'A wikilink is unbalanced: each `[[` must be closed by a matching `]]`.',
		});
	}

	// Empty-target wikilinks cannot resolve to a note. Two shapes:
	//   - a literally empty `[[]]` (the parser's extractor needs ≥1 inner char, so detect it directly), and
	//   - `[[|alias]]` / `[[#section]]` where a parsed link has an empty target.
	if (EMPTY_WIKILINK_PATTERN.test(text)) {
		issues.push({
			severity: 'error',
			code: 'wikilink-empty-target',
			message: 'A wikilink has no target note: "[[]]".',
		});
	}
	for (const link of extractWikilinks(text)) {
		if (link.target === '') {
			issues.push({
				severity: 'error',
				code: 'wikilink-empty-target',
				message: `A wikilink has no target note: "${link.raw}".`,
			});
		}
	}

	return { valid: !issues.some((issue) => issue.severity === 'error'), issues };
}

function countOccurrences(haystack: string, needle: string): number {
	let count = 0;
	let index = haystack.indexOf(needle);
	while (index !== -1) {
		count += 1;
		index = haystack.indexOf(needle, index + needle.length);
	}
	return count;
}

/** One rendered block in the deterministic preview model. */
export type PreviewBlock =
	| { kind: 'heading'; level: number; text: string }
	| { kind: 'paragraph'; text: string }
	| { kind: 'list-item'; text: string };

/** The computed preview of a markdown draft: its parsed body blocks, tags, and wikilinks. */
export interface MarkdownPreview {
	/** The body with any frontmatter block removed. */
	body: string;
	blocks: PreviewBlock[];
	tags: string[];
	wikilinks: ParsedWikilink[];
	hadFrontmatter: boolean;
}

const HEADING_PATTERN = /^(#{1,6})\s+(.*)$/;
const LIST_ITEM_PATTERN = /^[-*]\s+(.*)$/;

/**
 * Render a deterministic PREVIEW model of a markdown draft (CONTENT-002 preview). Reuses
 * {@link parseMarkdownNote} to strip frontmatter and surface tags/wikilinks, then segments the body into
 * a small, safe block model (headings, list items, paragraphs). It never emits raw HTML — the GUI maps
 * the block model to elements, so script/HTML injection cannot reach the rendered preview. Pure.
 */
export function renderMarkdownPreview(text: string): MarkdownPreview {
	const parsed = parseMarkdownNote(text);
	const blocks: PreviewBlock[] = [];
	for (const rawLine of parsed.body.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (line === '') continue;
		const heading = HEADING_PATTERN.exec(line);
		if (heading) {
			blocks.push({ kind: 'heading', level: heading[1]!.length, text: heading[2]!.trim() });
			continue;
		}
		const listItem = LIST_ITEM_PATTERN.exec(line);
		if (listItem) {
			blocks.push({ kind: 'list-item', text: listItem[1]!.trim() });
			continue;
		}
		blocks.push({ kind: 'paragraph', text: line });
	}
	return {
		body: parsed.body,
		blocks,
		tags: parsed.tags,
		wikilinks: parsed.wikilinks,
		hadFrontmatter: parsed.hadFrontmatter,
	};
}

/**
 * The partial wikilink the cursor sits inside, if any (CONTENT-002 wikilink assistance). Given the text
 * and a caret offset, returns the typed query between the most recent unclosed `[[` and the caret (e.g.
 * the user has typed `[[Bal`). Returns `null` when the caret is not inside an open wikilink. Pure — the
 * GUI passes its caret position; this never reads the DOM.
 */
export function activeWikilinkQuery(text: string, caret: number): string | null {
	const upto = text.slice(0, Math.max(0, Math.min(caret, text.length)));
	const open = upto.lastIndexOf(WIKILINK_OPEN);
	if (open === -1) return null;
	const between = upto.slice(open + WIKILINK_OPEN.length);
	// A closed link (`]]`) between the `[[` and the caret means we are no longer inside it.
	if (between.includes(WIKILINK_CLOSE)) return null;
	// A `#` or `|` ends the target portion the suggestion completes against.
	const target = between.split(/[#|]/, 1)[0] ?? '';
	return target;
}
