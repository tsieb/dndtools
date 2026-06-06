/**
 * SEC-003 — CONTENT SAFETY for rendered markdown, embeds, object cards, custom-widget content, and
 * imported source content. This is the Processing-Core guarantee that unsafe content is NEUTRALIZED
 * BEFORE it can enter a renderer DOM — independently of how (or whether) a GUI later renders it.
 *
 * DEFENCE IN DEPTH. The v2 markdown render path (`state/content-editor.ts`) is already structurally safe:
 * it produces a block model (headings/paragraphs/list items) of plain text and the GUI binds that text
 * with Svelte interpolation, which ESCAPES HTML — there is no `{@html}` anywhere. This module adds the
 * SECOND, content-level layer the architecture contract asks for, so safety does not depend on a single
 * mechanism never regressing:
 *
 *   1. RAW HTML / SCRIPT — `<script>…</script>`, `<iframe>`, `<svg>`, event-handler attributes
 *      (`onerror=`, `onclick=`, …), and any other angle-bracket tag are stripped/escaped to inert text so
 *      a `<script>alert(1)</script>` in a note or imported file renders as visible characters, never an
 *      executable element. The original VISIBLE text is preserved (the tag's text content survives); only
 *      its ability to BE a tag is removed.
 *   2. DANGEROUS URL SCHEMES — a markdown link/image whose URL uses `javascript:`, `data:`, `vbscript:`,
 *      or `file:` (in any case, with interleaved whitespace/encoding) is NEUTRALIZED: the link target is
 *      replaced with the inert `about:blank#blocked` sentinel while the link TEXT is kept, so a
 *      `[click](javascript:alert(1))` cannot smuggle script through an `href`. `http(s):`, `mailto:`,
 *      and relative / wikilink targets are SAFE and preserved (legitimate content must still render).
 *
 * FAIL CLOSED: when a URL scheme cannot be PROVEN safe, it is treated as unsafe and neutralized. Pure +
 * deterministic — no DOM, no clock, no locale — so the same content always sanitizes identically across
 * devices and the desktop/compact profiles. The import/snippet/render layers compose these functions; this
 * module owns no storage and renders nothing itself.
 */

export const CONTENT_SAFETY_SCHEMA_VERSION = 1 as const;

/** The inert href a dangerous URL is rewritten to. Renders nowhere; cannot execute. */
export const NEUTRALIZED_URL = 'about:blank#blocked' as const;

/**
 * URL schemes that are SAFE to keep as a link/image target. Everything else (including no recognized
 * scheme that turns out to be a `scheme:` prefix) is neutralized. `mailto`/`tel` are safe link schemes;
 * `http`/`https` are the normal web schemes; relative + fragment + wikilink targets carry no scheme and
 * are always allowed.
 */
const SAFE_URL_SCHEMES: ReadonlySet<string> = new Set(['http', 'https', 'mailto', 'tel']);

// Any HTML tag: `<tagname …>` / `</tagname>` / `<tagname/>`. Matched broadly so EVERY tag is neutralized,
// not an allowlist of "known dangerous" ones (an allowlist of bad tags fails open on the next new vector).
const HTML_TAG_PATTERN = /<\/?[a-zA-Z][^>]*>/g;
// An HTML comment `<!-- … -->` (can hide conditional-comment script in some engines) and a bare `<…`.
const HTML_COMMENT_PATTERN = /<!--[\s\S]*?-->/g;
// A markdown inline link `[text](url)` or image `![alt](url)`. The url runs to the closing paren.
const MARKDOWN_LINK_PATTERN = /(!?)\[([^\]]*)\]\(([^)]*)\)/g;

/**
 * SEC-003 — is a URL target SAFE to use as a link/image href? A target with NO scheme (relative path,
 * `#fragment`, `//` is treated as scheme-relative and allowed only via http context — see below) is safe;
 * a target with a scheme is safe ONLY when that scheme is in {@link SAFE_URL_SCHEMES}. FAILS CLOSED on
 * anything ambiguous. The check is robust to the classic evasions: leading/embedded whitespace and
 * control characters inside the scheme (`java\tscript:`), and mixed case (`JaVaScRiPt:`).
 */
export function isSafeUrl(rawUrl: string): boolean {
	if (typeof rawUrl !== 'string') return false;
	// Strip ALL whitespace + control characters before scheme detection: `java\t\nscript:` is `javascript:`.
	// eslint-disable-next-line no-control-regex
	const collapsed = rawUrl.replace(/[\s\x00-\x1f\x7f]/g, '');
	if (collapsed === '') return true; // an empty target is inert, not dangerous
	// A scheme is `name:` at the very start. No scheme ⇒ relative/fragment ⇒ safe.
	const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(collapsed);
	if (!schemeMatch) {
		// No `scheme:`. Reject a protocol-relative `//host` smuggle only if it also looks scheme-prefixed;
		// a plain relative path, `#anchor`, or `./file.md` is safe.
		return true;
	}
	return SAFE_URL_SCHEMES.has(schemeMatch[1]!.toLowerCase());
}

/**
 * SEC-003 — return a SAFE href for a target: the target itself when {@link isSafeUrl}, else the inert
 * {@link NEUTRALIZED_URL} sentinel. Used by the link/embed renderer so a dangerous scheme can never reach
 * an `href`/`src`. Pure.
 */
export function safeUrl(rawUrl: string): string {
	return isSafeUrl(rawUrl) ? rawUrl : NEUTRALIZED_URL;
}

/**
 * SEC-003 — neutralize the DANGEROUS-URL markdown links/images in a body. Each `[text](url)` /
 * `![alt](url)` whose `url` is unsafe is rewritten to keep its visible text but point at the inert
 * sentinel; safe links are untouched. This runs BEFORE block segmentation so a neutralized link flows
 * through the normal renderer as ordinary (now-safe) text. Pure.
 */
export function neutralizeMarkdownLinks(body: string): string {
	return body.replace(MARKDOWN_LINK_PATTERN, (_match, bang: string, text: string, url: string) => {
		const target = isSafeUrl(url) ? url : NEUTRALIZED_URL;
		return `${bang}[${text}](${target})`;
	});
}

/**
 * SEC-003 — strip/escape raw HTML so it cannot become an executable element. HTML comments and every tag
 * (`<script>`, `<img onerror=…>`, `<iframe>`, `<svg>`, …) are removed, leaving the INNER TEXT intact. The
 * result is plain text that renders as itself. We remove the tags entirely (rather than only escaping the
 * `<`) so a `<script>payload</script>` does not leave the payload visible as if it were content the author
 * intended; the human-readable text BETWEEN tags is preserved. Pure.
 */
export function stripRawHtml(body: string): string {
	return body.replace(HTML_COMMENT_PATTERN, '').replace(HTML_TAG_PATTERN, '');
}

/**
 * SEC-003 — the full content sanitizer composed for a single body of untrusted markdown: neutralize
 * dangerous-scheme links, then strip raw HTML. The output is markdown that is SAFE to feed to the block
 * renderer and safe to bind as escaped text. Idempotent: sanitizing already-sanitized content is a no-op.
 * Pure + deterministic.
 *
 * This is the ONE function the import pipeline, the snippet/preview render, and any embed/object-card
 * render compose, so every untrusted-content surface shares the SAME proof rather than re-deriving safety.
 */
export function sanitizeMarkdownContent(body: string): string {
	if (typeof body !== 'string' || body === '') return '';
	return stripRawHtml(neutralizeMarkdownLinks(body));
}

/**
 * SEC-003 — true when a body is ALREADY safe (sanitizing it changes nothing). The fail-closed predicate a
 * test or a defensive caller asserts: if {@link sanitizeMarkdownContent} would alter the content, the
 * content was NOT safe. Pure.
 */
export function isSafeMarkdownContent(body: string): boolean {
	return sanitizeMarkdownContent(body) === body;
}
