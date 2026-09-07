import {
	parseCalloutMarker,
	parseInlineRoll,
	slugifyHeading,
	type CalloutKind,
} from '@dndtools/core';

/**
 * RC-KNW-1.1 — THE markdown tokenizer. One pipeline for every prose surface in the app (Knowledge,
 * the public wiki reader, player-facing note bodies, widget note bodies), replacing the two
 * divergent line-at-a-time renderers that used to live inside `screens/knowledge/markdown.tsx` and
 * `screens/WikiReader.tsx`.
 *
 * This module is PURE and framework-free: markdown text in, a token tree out. It holds no JSX, no
 * DOM, no i18n and no styling, so it is directly testable and the React layer (`render.tsx`) has
 * nothing to decide except how a token looks.
 *
 * XSS STANCE (ADR-005 — one sanitized pipeline). Two layers, both here:
 *
 *   1. NO HTML EVER. There is no HTML pass-through token and no raw-HTML escape hatch, so
 *      `render.tsx` has nothing to hand to `dangerouslySetInnerHTML`. Every scrap of author text
 *      becomes a React text child, which React escapes. `<script>` in a note body is prose.
 *   2. URL ALLOW-LIST. `safeHref` and `safeImageSrc` accept only the schemes below. `javascript:`,
 *      `data:`, `vbscript:` and anything else are REJECTED — the link degrades to its own label as
 *      plain text rather than rendering an inert-looking control that a reader might trust.
 *
 * The callout grammar comes from `@dndtools/core` (`parseCalloutMarker`) so the renderer and the
 * core's `stripSecretCallouts` can never disagree about where a `[!Secret]` block begins and ends.
 */

/** Schemes a link may use. Everything else is refused and rendered as plain text. */
const SAFE_LINK_SCHEMES = ['http:', 'https:', 'mailto:'] as const;

/** The pseudo-scheme addressing a content-addressed asset in the local asset store. */
export const ASSET_SCHEME = 'asset:';

/**
 * True when a URL carries whitespace or a control character — the classic `java\nscript:`
 * obfuscation, which a naive `startsWith('javascript:')` check misses.
 */
function hasControlOrSpace(value: string): boolean {
	for (const char of value) {
		if (char.charCodeAt(0) <= 0x20) return true;
	}
	return false;
}

/**
 * Validate an external link target. Returns the href when it is safe to render as an `<a href>`, or
 * `null` when it is not. Relative/anchor links (`#section`, `./x`) are refused too: this renderer has
 * no base URL to resolve them against, and a silently wrong destination is worse than plain text.
 */
export function safeHref(raw: string): string | null {
	const trimmed = raw.trim();
	if (trimmed === '' || hasControlOrSpace(trimmed)) return null;
	const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed);
	if (!scheme) return null;
	return (SAFE_LINK_SCHEMES as readonly string[]).includes(`${scheme[1]!.toLowerCase()}:`)
		? trimmed
		: null;
}

/** An image source: either an `asset:<id>` reference or a plain `http(s)` URL. `null` when neither. */
export type ImageSource = { kind: 'asset'; assetId: string } | { kind: 'url'; url: string };

/**
 * Validate an image source. `asset:<id>` resolves through the app's asset store (the caller supplies
 * the resolver); `http(s)` URLs are allowed as-is. `data:` is refused even for images — an SVG data
 * URL is a script vector, and the note author is not always the reader.
 */
export function safeImageSrc(raw: string): ImageSource | null {
	const trimmed = raw.trim();
	if (trimmed === '' || hasControlOrSpace(trimmed)) return null;
	if (trimmed.toLowerCase().startsWith(ASSET_SCHEME)) {
		const assetId = trimmed.slice(ASSET_SCHEME.length).trim();
		// Content-addressed ids only: no path separators, no scheme smuggling.
		return /^[A-Za-z0-9._-]+$/.test(assetId) ? { kind: 'asset', assetId } : null;
	}
	const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed);
	if (!scheme) return null;
	const lowered = scheme[1]!.toLowerCase();
	return lowered === 'http' || lowered === 'https' ? { kind: 'url', url: trimmed } : null;
}

/* -------------------------------------------------------------------------------------------- */
/* Inline tokens                                                                                  */
/* -------------------------------------------------------------------------------------------- */

/** One inline run inside a paragraph, heading, list item, table cell or callout line. */
export type InlineToken =
	| { type: 'text'; text: string }
	| { type: 'strong'; text: string }
	| { type: 'em'; text: string }
	| { type: 'code'; text: string }
	/** An Obsidian `[[target#section|label]]`. Resolution is the caller's job (it is actor-scoped). */
	| { type: 'wikilink'; raw: string; target: string; section?: string; label: string }
	/**
	 * RC-SES-2.2 — an inline `[[roll:1d20+5|Stealth check]]`. Shares the bracket syntax with a
	 * wikilink, so the CORE's `parseInlineRoll` decides which of the two a run is; whether the roll
	 * reaches the session log or stays a local chip is the host surface's call, not the tokenizer's.
	 */
	| { type: 'roll'; raw: string; expression: string; label?: string }
	/** A `[label](href)` whose href passed {@link safeHref}. */
	| { type: 'link'; href: string; label: string }
	/** An inline `![alt](src)` whose src passed {@link safeImageSrc}. */
	| { type: 'image'; src: ImageSource; alt: string };

// One alternation per inline construct, in precedence order: code first (its content is literal),
// then image, link, wikilink, strong, em.
const INLINE_PATTERN =
	/(`[^`]+`|!\[[^\]]*\]\([^)\s]*\)|\[[^\]]+\]\([^)\s]*\)|\[\[[^\]]+\]\]|\*\*[^*]+\*\*|\*[^*\n]+\*|_[^_\n]+_)/g;

/** Split `[[Target#Section|Label]]` into its parts. Pure; the label falls back to the target. */
export function parseWikilinkToken(raw: string): {
	target: string;
	section?: string;
	label: string;
} {
	const inner = raw.slice(2, -2);
	const [addr, alias] = inner.split('|');
	const [target, section] = (addr ?? '').split('#');
	const trimmedTarget = (target ?? '').trim();
	const label = (alias ?? inner).trim();
	return {
		target: trimmedTarget,
		...(section?.trim() ? { section: section.trim() } : {}),
		label: label || trimmedTarget,
	};
}

function pushText(out: InlineToken[], text: string): void {
	if (text !== '') out.push({ type: 'text', text });
}

/**
 * Tokenize one line of inline markdown. Unrecognized syntax stays literal text — this renderer never
 * throws on malformed input, because a note body is user data and half the vault is hand-written.
 */
export function tokenizeInline(line: string): InlineToken[] {
	const out: InlineToken[] = [];
	for (const part of line.split(INLINE_PATTERN)) {
		if (part === '' || part === undefined) continue;
		if (part.startsWith('`') && part.endsWith('`') && part.length > 1) {
			out.push({ type: 'code', text: part.slice(1, -1) });
			continue;
		}
		if (part.startsWith('![')) {
			const match = /^!\[([^\]]*)\]\(([^)\s]*)\)$/.exec(part);
			const src = match ? safeImageSrc(match[2]!) : null;
			// A refused source degrades to the alt text — an honest, inert label.
			if (match && src) out.push({ type: 'image', src, alt: match[1]!.trim() });
			else if (match) pushText(out, match[1]! || part);
			else pushText(out, part);
			continue;
		}
		if (part.startsWith('[[')) {
			// A `[[roll:...]]` is a die, not a note link — the core owns that distinction.
			const roll = parseInlineRoll(part);
			if (roll) {
				out.push({
					type: 'roll',
					raw: part,
					expression: roll.expression,
					...(roll.label ? { label: roll.label } : {}),
				});
				continue;
			}
			out.push({ type: 'wikilink', raw: part, ...parseWikilinkToken(part) });
			continue;
		}
		if (part.startsWith('[')) {
			const match = /^\[([^\]]+)\]\(([^)\s]*)\)$/.exec(part);
			const href = match ? safeHref(match[2]!) : null;
			if (match && href) out.push({ type: 'link', href, label: match[1]! });
			else if (match) pushText(out, match[1]!);
			else pushText(out, part);
			continue;
		}
		if (part.startsWith('**') && part.endsWith('**') && part.length > 3) {
			out.push({ type: 'strong', text: part.slice(2, -2) });
			continue;
		}
		if (
			part.length > 2 &&
			((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_')))
		) {
			out.push({ type: 'em', text: part.slice(1, -1) });
			continue;
		}
		pushText(out, part);
	}
	return out;
}

/* -------------------------------------------------------------------------------------------- */
/* Block tokens                                                                                   */
/* -------------------------------------------------------------------------------------------- */

/** A table column's declared alignment, from the `:---:` delimiter row. */
export type ColumnAlign = 'left' | 'center' | 'right';

/** One block-level node. `callout` nests only leaf blocks, so the tree is at most two deep. */
export type MdBlock =
	| { type: 'heading'; level: number; anchor: string; inline: InlineToken[] }
	| { type: 'paragraph'; inline: InlineToken[] }
	| { type: 'list'; ordered: boolean; items: InlineToken[][] }
	| { type: 'quote'; lines: InlineToken[][] }
	| { type: 'callout'; kind: CalloutKind; title: string; blocks: MdBlock[] }
	| { type: 'table'; head: InlineToken[][]; align: ColumnAlign[]; rows: InlineToken[][][] }
	| { type: 'code'; text: string; lang: string }
	| { type: 'figure'; src: ImageSource; alt: string; caption: string }
	| { type: 'rule' };

const HEADING_LINE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const UNORDERED_ITEM = /^\s*[-*]\s+(.*)$/;
const ORDERED_ITEM = /^\s*\d+[.)]\s+(.*)$/;
const FENCE_LINE = /^\s*(?:```|~~~)\s*([A-Za-z0-9+#-]*)\s*$/;
const TABLE_DELIMITER = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
/** A line that is nothing but one image — rendered as a `<figure>`, not an inline image. */
const STANDALONE_IMAGE = /^!\[([^\]]*)\]\(([^)\s]*)\)\s*$/;
const THEMATIC_BREAK = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;

function splitRow(line: string): string[] {
	const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
	return trimmed.split('|').map((cell) => cell.trim());
}

function alignOf(cell: string): ColumnAlign {
	const t = cell.trim();
	if (t.startsWith(':') && t.endsWith(':')) return 'center';
	if (t.endsWith(':')) return 'right';
	return 'left';
}

/** True when this line and the next form a `| a | b |` header + `|---|---|` delimiter pair. */
function isTableStart(line: string, next: string | undefined): boolean {
	return (
		line.includes('|') && next !== undefined && next.includes('-') && TABLE_DELIMITER.test(next)
	);
}

/**
 * Parse a markdown body into block tokens. Anchors on headings come from the core's
 * {@link slugifyHeading}, so a rendered heading's `id` matches the anchor a search hit or a
 * `[[Note#Section]]` deep link addresses. Duplicate anchors are disambiguated `-2`, `-3`, … exactly
 * as the core's `headingAnchors` does, so the two can never drift.
 *
 * Total: any input produces blocks, none throws. Unrecognized syntax stays prose.
 */
export function parseBlocks(markdown: string): MdBlock[] {
	const lines = markdown.split(/\r?\n/);
	const blocks: MdBlock[] = [];
	const anchorCounts = new Map<string, number>();
	let i = 0;

	const nextAnchor = (text: string): string => {
		const base = slugifyHeading(text);
		if (base === '') return '';
		const count = anchorCounts.get(base) ?? 0;
		anchorCounts.set(base, count + 1);
		return count === 0 ? base : `${base}-${count + 1}`;
	};

	while (i < lines.length) {
		const line = lines[i]!;

		if (line.trim() === '') {
			i += 1;
			continue;
		}

		// Fenced code. An unterminated fence swallows the rest of the body rather than leaking the
		// fence marker into the prose — the same thing every markdown engine does.
		const fence = FENCE_LINE.exec(line);
		if (fence) {
			const body: string[] = [];
			i += 1;
			while (i < lines.length && !FENCE_LINE.test(lines[i]!)) {
				body.push(lines[i]!);
				i += 1;
			}
			i += 1;
			blocks.push({ type: 'code', text: body.join('\n'), lang: fence[1] ?? '' });
			continue;
		}

		if (THEMATIC_BREAK.test(line)) {
			blocks.push({ type: 'rule' });
			i += 1;
			continue;
		}

		const heading = HEADING_LINE.exec(line);
		if (heading) {
			const text = heading[2]!.trim();
			blocks.push({
				type: 'heading',
				level: heading[1]!.length,
				anchor: nextAnchor(text),
				inline: tokenizeInline(text),
			});
			i += 1;
			continue;
		}

		// Callout: a `> [!Kind]` marker plus its consecutive quoted lines, parsed as a nested body.
		const marker = parseCalloutMarker(line);
		if (marker) {
			const inner: string[] = [];
			i += 1;
			while (i < lines.length && lines[i]!.startsWith('>')) {
				inner.push(lines[i]!.replace(/^>\s?/, ''));
				i += 1;
			}
			blocks.push({ type: 'callout', ...marker, blocks: parseBlocks(inner.join('\n')) });
			continue;
		}

		if (line.startsWith('>')) {
			const quoted: InlineToken[][] = [];
			while (i < lines.length && lines[i]!.startsWith('>')) {
				quoted.push(tokenizeInline(lines[i]!.replace(/^>\s?/, '')));
				i += 1;
			}
			blocks.push({ type: 'quote', lines: quoted });
			continue;
		}

		if (isTableStart(line, lines[i + 1])) {
			const head = splitRow(line).map(tokenizeInline);
			const align = splitRow(lines[i + 1]!).map(alignOf);
			i += 2;
			const rows: InlineToken[][][] = [];
			while (i < lines.length && lines[i]!.includes('|') && lines[i]!.trim() !== '') {
				rows.push(splitRow(lines[i]!).map(tokenizeInline));
				i += 1;
			}
			blocks.push({ type: 'table', head, align, rows });
			continue;
		}

		const figure = STANDALONE_IMAGE.exec(line);
		const figureSrc = figure ? safeImageSrc(figure[2]!) : null;
		if (figure && figureSrc) {
			// An immediately following italic line is the caption — the convention every markdown
			// figure extension uses, and the only way to caption an image without HTML.
			const next = lines[i + 1]?.trim() ?? '';
			const captionMatch = /^[*_](.+)[*_]$/.exec(next);
			blocks.push({
				type: 'figure',
				src: figureSrc,
				alt: figure[1]!.trim(),
				caption: captionMatch ? captionMatch[1]!.trim() : '',
			});
			i += captionMatch ? 2 : 1;
			continue;
		}

		const ordered = ORDERED_ITEM.test(line);
		if (ordered || UNORDERED_ITEM.test(line)) {
			const items: InlineToken[][] = [];
			const pattern = ordered ? ORDERED_ITEM : UNORDERED_ITEM;
			while (i < lines.length) {
				const match = pattern.exec(lines[i]!);
				if (!match) break;
				items.push(tokenizeInline(match[1]!));
				i += 1;
			}
			blocks.push({ type: 'list', ordered, items });
			continue;
		}

		// Paragraph: consecutive plain lines joined with a space, so a hard-wrapped source paragraph
		// reads as one paragraph rather than one `<p>` per authored line.
		const paragraph: string[] = [];
		while (i < lines.length) {
			const candidate = lines[i]!;
			if (
				candidate.trim() === '' ||
				HEADING_LINE.test(candidate) ||
				candidate.startsWith('>') ||
				FENCE_LINE.test(candidate) ||
				THEMATIC_BREAK.test(candidate) ||
				UNORDERED_ITEM.test(candidate) ||
				ORDERED_ITEM.test(candidate) ||
				isTableStart(candidate, lines[i + 1])
			) {
				break;
			}
			paragraph.push(candidate.trim());
			i += 1;
		}
		if (paragraph.length > 0) {
			blocks.push({ type: 'paragraph', inline: tokenizeInline(paragraph.join(' ')) });
		} else {
			i += 1;
		}
	}

	return blocks;
}
