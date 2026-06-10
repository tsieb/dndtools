/**
 * CONTENT-007 / CONTENT-008 — PURE, DETERMINISTIC Markdown + Obsidian parse/serialize.
 *
 * This is the determinism keystone for import/export, in the same spirit as `state/calendar.ts`: every
 * function here is a PURE function of its explicit inputs. It NEVER reads ambient state — no `Date`, no
 * host locale, no filesystem. The same archive text always parses to the same structured value, and the
 * same value always serializes to the same bytes-equivalent string, so a round-trip is stable and a
 * rejected/cancelled import leaves nothing partially parsed.
 *
 * What it preserves (CONTENT-007 / Architecture Contract 2 Obsidian source rules):
 *
 *   - FRONTMATTER PROPERTIES: arbitrary YAML-ish `key: value` front matter, kept as an open map. User
 *     properties are preserved verbatim and round-trip; DND Tools metadata must stay namespaced under
 *     `dndtools` (the import layer enforces that, this layer just preserves whatever is present).
 *   - ALIASES: the Obsidian `aliases` property (a list), surfaced as a first-class field.
 *   - TAGS: both the `tags` frontmatter property AND inline `#hashtags` in the body, merged + deduped.
 *   - LINKS: Obsidian `[[wikilinks]]` (with optional `#section` and `|alias`), extracted from the body.
 *
 * Parsing is TOLERANT and NON-THROWING: malformed front matter degrades to "no front matter" rather
 * than throwing, so one bad file can never abort an archive scan. Nothing here reaches storage; the
 * import/export reducers compose these pure functions.
 */

export const MARKDOWN_PARSE_SCHEMA_VERSION = 1 as const;

/** A single parsed Obsidian wikilink: `[[target#section|alias]]`. Section/alias are optional. */
export interface ParsedWikilink {
	/** The raw target note name/path as authored (never rewritten on parse — preserve source). */
	target: string;
	/** The `#section` heading anchor, when present. */
	section?: string;
	/** The `|alias` display text, when present. */
	alias?: string;
	/** The exact original `[[...]]` text, so a non-destructive round-trip can re-emit it verbatim. */
	raw: string;
}

/** A parsed markdown note: its front matter properties plus the extracted Obsidian metadata. */
export interface ParsedMarkdownNote {
	/** The note body with the front-matter block removed (leading/trailing blank lines trimmed). */
	body: string;
	/** Open front-matter map. Scalar values are strings; list values are string arrays. */
	properties: Record<string, string | string[]>;
	/** The `aliases` property as a list (empty when absent). */
	aliases: string[];
	/** Tags from the `tags` property AND inline `#hashtags`, merged + deduped, in stable order. */
	tags: string[];
	/** Obsidian `[[wikilinks]]` found in the body, in document order (duplicates preserved). */
	wikilinks: ParsedWikilink[];
	/** True when a `---` front-matter block was present and parsed. */
	hadFrontmatter: boolean;
}

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
// Inline `#tag` (letters/digits/`-`/`_`/`/`), not inside a word and not a `#` heading marker.
const INLINE_TAG_PATTERN = /(^|\s)#([A-Za-z][\w/-]*)/g;
// `[[target]]`, `[[target#section]]`, `[[target|alias]]`, `[[target#section|alias]]`.
const WIKILINK_PATTERN = /\[\[([^\]]+?)\]\]/g;

/** Split a YAML-ish inline list `[a, b]` or a bare scalar into a normalized list/scalar. */
function parseScalarOrList(raw: string): string | string[] {
	const trimmed = raw.trim();
	if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
		const inner = trimmed.slice(1, -1).trim();
		if (inner === '') return [];
		return inner
			.split(',')
			.map((entry) => stripQuotes(entry.trim()))
			.filter((entry) => entry.length > 0);
	}
	return stripQuotes(trimmed);
}

function stripQuotes(value: string): string {
	if (value.length >= 2) {
		const first = value[0];
		const last = value[value.length - 1];
		if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
			return value.slice(1, -1);
		}
	}
	return value;
}

/**
 * Parse a YAML-ish front-matter block (the text BETWEEN the `---` fences). Supports `key: value`
 * scalars, `key: [a, b]` inline lists, and `key:`-then-`- item` block lists. This is deliberately a
 * small, deterministic subset — not a full YAML engine — and degrades to an empty map on anything it
 * does not recognize rather than throwing.
 */
function parseFrontmatterBlock(block: string): Record<string, string | string[]> {
	const properties: Record<string, string | string[]> = {};
	const lines = block.split(/\r?\n/);
	let currentListKey: string | null = null;
	let currentList: string[] = [];

	const flushList = (): void => {
		if (currentListKey !== null) {
			properties[currentListKey] = currentList;
			currentListKey = null;
			currentList = [];
		}
	};

	for (const line of lines) {
		if (line.trim() === '') continue;
		const blockItem = /^\s*-\s+(.*)$/.exec(line);
		if (blockItem && currentListKey !== null) {
			currentList.push(stripQuotes(blockItem[1]!.trim()));
			continue;
		}
		const keyValue = /^([A-Za-z0-9_][\w.-]*)\s*:\s*(.*)$/.exec(line);
		if (!keyValue) {
			// Unrecognized line: end any open block list; ignore the line (tolerant).
			flushList();
			continue;
		}
		flushList();
		const key = keyValue[1]!;
		const rawValue = keyValue[2]!;
		if (rawValue.trim() === '') {
			// `key:` with nothing after it — start collecting a block list of following `- item` lines.
			currentListKey = key;
			currentList = [];
			continue;
		}
		properties[key] = parseScalarOrList(rawValue);
	}
	flushList();
	return properties;
}

function asList(value: string | string[] | undefined): string[] {
	if (value === undefined) return [];
	return Array.isArray(value) ? [...value] : value.trim() === '' ? [] : [value];
}

/** Deduplicate while preserving first-seen order. */
function dedupe(values: readonly string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const value of values) {
		if (!seen.has(value)) {
			seen.add(value);
			out.push(value);
		}
	}
	return out;
}

/** Extract inline `#hashtags` from a body, in document order. */
function extractInlineTags(body: string): string[] {
	const tags: string[] = [];
	for (const match of body.matchAll(INLINE_TAG_PATTERN)) {
		tags.push(match[2]!);
	}
	return tags;
}

/**
 * A parsed Markdown heading and its deterministic, URL-safe anchor slug. The anchor is what a note
 * deep link / search-result heading hash navigates to (SRCH-007 AC2): `/knowledge/<id>/#<anchor>`.
 */
export interface HeadingAnchor {
	/** The heading depth (1..6 == `#`..`######`). */
	level: number;
	/** The heading text as authored (trimmed, with the `#` markers stripped). */
	text: string;
	/** The deterministic slug used as the hash anchor (lowercased, spaces→`-`, punctuation dropped). */
	anchor: string;
}

// A Markdown ATX heading line: 1..6 leading `#`, a required space, then the heading text.
const HEADING_PATTERN = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

/**
 * Build a deterministic, URL-safe ANCHOR SLUG for a heading text (SRCH-007 AC2). Lowercases, replaces
 * runs of whitespace with a single `-`, drops characters that are not `[a-z0-9-]`, and collapses/strips
 * stray dashes. This is a PURE transform of the text — the same heading always yields the same anchor,
 * so a heading deep link is stable across fresh fixtures (SRCH-008). Returns `''` for an empty heading.
 */
export function slugifyHeading(text: string): string {
	return text
		.trim()
		.toLowerCase()
		.replace(/\s+/g, '-')
		.replace(/[^a-z0-9-]/g, '')
		.replace(/-+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/**
 * Extract the ATX HEADINGS from a note body, in document order, each with its deterministic anchor slug
 * (SRCH-007 AC2 hash/scroll target). Duplicate anchors are DISAMBIGUATED deterministically by appending
 * `-2`, `-3`, … (the GitHub/Obsidian convention) so two headings with the same text still address
 * distinct anchors. Pure: a function of the body text only — no clock, no locale — so the anchor set is
 * stable across fresh fixtures (SRCH-008). Fenced code blocks are skipped so a `#` inside a code fence is
 * never mistaken for a heading.
 */
export function headingAnchors(body: string): HeadingAnchor[] {
	const anchors: HeadingAnchor[] = [];
	const seen = new Map<string, number>();
	let inFence = false;
	for (const rawLine of body.split(/\r?\n/)) {
		const line = rawLine.trimEnd();
		if (/^\s*(```|~~~)/.test(line)) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;
		const match = HEADING_PATTERN.exec(line);
		if (!match) continue;
		const level = match[1]!.length;
		const text = match[2]!.trim();
		const base = slugifyHeading(text);
		if (base === '') continue;
		const count = seen.get(base) ?? 0;
		seen.set(base, count + 1);
		const anchor = count === 0 ? base : `${base}-${count + 1}`;
		anchors.push({ level, text, anchor });
	}
	return anchors;
}

/** Extract Obsidian `[[wikilinks]]` from a body, in document order (duplicates preserved). */
export function extractWikilinks(body: string): ParsedWikilink[] {
	const links: ParsedWikilink[] = [];
	for (const match of body.matchAll(WIKILINK_PATTERN)) {
		const raw = match[0]!;
		const inner = match[1]!;
		const [targetAndSection, alias] = splitOnce(inner, '|');
		const [target, section] = splitOnce(targetAndSection, '#');
		links.push({
			target: target.trim(),
			...(section !== undefined && section.trim() !== '' ? { section: section.trim() } : {}),
			...(alias !== undefined && alias.trim() !== '' ? { alias: alias.trim() } : {}),
			raw,
		});
	}
	return links;
}

/** Split a string on the FIRST occurrence of a separator. Returns `[head, tail?]`. */
function splitOnce(value: string, separator: string): [string, string | undefined] {
	const index = value.indexOf(separator);
	if (index === -1) return [value, undefined];
	return [value.slice(0, index), value.slice(index + separator.length)];
}

/**
 * Parse one markdown note's full text into structured, preserved metadata (CONTENT-007). Tolerant and
 * non-throwing: malformed/absent front matter yields an empty property map with `hadFrontmatter`
 * false, and the whole input becomes the body. Tags merge the `tags` property with inline `#hashtags`;
 * aliases come from the `aliases` property. Pure.
 */
export function parseMarkdownNote(text: string): ParsedMarkdownNote {
	const match = FRONTMATTER_PATTERN.exec(text);
	let properties: Record<string, string | string[]> = {};
	let body = text;
	let hadFrontmatter = false;
	if (match) {
		properties = parseFrontmatterBlock(match[1]!);
		body = text.slice(match[0].length);
		hadFrontmatter = true;
	}
	body = body.replace(/^\r?\n+/, '').replace(/\s+$/, '');

	const aliases = dedupe(asList(properties['aliases']));
	const tags = dedupe([...asList(properties['tags']), ...extractInlineTags(body)]);
	const wikilinks = extractWikilinks(body);

	return { body, properties, aliases, tags, wikilinks, hadFrontmatter };
}

/** Serialize one front-matter value back to its YAML-ish line form (scalar or inline list). */
function serializeValue(value: string | string[]): string {
	if (Array.isArray(value)) {
		return `[${value.join(', ')}]`;
	}
	return value;
}

/**
 * Serialize structured properties back to a `---` front matter block + body (CONTENT-008 portable
 * markdown). Keys are emitted in SORTED order so the output is DETERMINISTIC regardless of insertion
 * order — a stable, diff-friendly export. When there are no properties the front matter block is
 * omitted entirely. Pure: no clock, no locale.
 */
export function serializeMarkdownNote(
	properties: Record<string, string | string[]>,
	body: string,
): string {
	const keys = Object.keys(properties).sort();
	if (keys.length === 0) {
		return body.endsWith('\n') || body === '' ? body : `${body}\n`;
	}
	const lines = keys.map((key) => `${key}: ${serializeValue(properties[key]!)}`);
	const frontmatter = `---\n${lines.join('\n')}\n---\n`;
	if (body === '') return frontmatter;
	return `${frontmatter}\n${body}${body.endsWith('\n') ? '' : '\n'}`;
}
