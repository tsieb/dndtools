import { describe, expect, it } from 'vitest';
import {
	NEUTRALIZED_URL,
	isSafeMarkdownContent,
	isSafeUrl,
	isSafeRemoteMediaUrl,
	neutralizeMarkdownLinks,
	renderMarkdownPreview,
	safeUrl,
	sanitizeMarkdownContent,
	stripRawHtml,
} from '../src';

/**
 * SEC-003 — CONTENT SAFETY. Adversarial evidence that unsafe content is REMOVED or NEUTRALIZED before it
 * can enter a renderer DOM (AC1). Classic XSS vectors are each proven inert, while legitimate markdown and
 * wikilinks still render. The render path (`renderMarkdownPreview`) is exercised end-to-end so the proof
 * covers the surface the GUI actually consumes.
 */

// A whitespace/encoding-evasion `javascript:` URL: the scheme detector must collapse interleaved control
// characters before matching, so `java\tscript:` is recognized as the dangerous scheme.
const TAB = String.fromCharCode(9);

describe('SEC-003 content-safety — raw HTML / script is stripped to inert text (AC1)', () => {
	it('strips a `<script>` block so it cannot execute', () => {
		const safe = sanitizeMarkdownContent('Intro <script>alert(1)</script> outro');
		expect(safe).not.toContain('<script>');
		expect(safe).not.toContain('</script>');
		// The visible inner text survives; only its ability to BE a tag is removed.
		expect(safe).toContain('Intro');
		expect(safe).toContain('outro');
	});

	it('strips an `<img onerror=...>` event-handler vector', () => {
		const safe = sanitizeMarkdownContent('<img src=x onerror="alert(1)">');
		expect(safe).not.toContain('<img');
		expect(safe).not.toContain('onerror');
	});

	it('strips `<iframe>`, `<svg>`, and HTML comments', () => {
		expect(stripRawHtml('<iframe src="evil"></iframe>')).not.toContain('<iframe');
		expect(stripRawHtml('<svg onload=alert(1)>')).not.toContain('<svg');
		expect(stripRawHtml('<!-- <script>x</script> -->')).toBe('');
	});

	it('strips an HTML anchor whose href is `javascript:`', () => {
		const safe = sanitizeMarkdownContent('<a href="javascript:alert(1)">click</a>');
		expect(safe).not.toContain('<a');
		expect(safe).not.toContain('javascript:');
		expect(safe).toContain('click');
	});
});

describe('SEC-003 content-safety — dangerous URL schemes are neutralized (AC1)', () => {
	it('neutralizes a `javascript:` markdown link target, keeping the link text', () => {
		const safe = neutralizeMarkdownLinks('[click me](javascript:alert)');
		expect(safe).toBe(`[click me](${NEUTRALIZED_URL})`);
	});

	it('still neutralizes a `javascript:` target even when its argument contains a paren', () => {
		// The link-body match stops at the first `)`, but the captured target is still `javascript:…`, so the
		// scheme is detected and neutralized; the dangerous scheme never survives.
		const safe = neutralizeMarkdownLinks('[x](javascript:alert(1))');
		expect(safe).not.toContain('javascript:');
		expect(safe).toContain(NEUTRALIZED_URL);
	});

	it('neutralizes a `data:` markdown image target', () => {
		const safe = neutralizeMarkdownLinks('![x](data:text/html;base64,PHNjcmlwdD4=)');
		expect(safe).toBe(`![x](${NEUTRALIZED_URL})`);
	});

	it('neutralizes a `vbscript:` and a `file:` target', () => {
		expect(neutralizeMarkdownLinks('[a](vbscript:msgbox)')).toBe(`[a](${NEUTRALIZED_URL})`);
		expect(neutralizeMarkdownLinks('[a](file:///etc/passwd)')).toBe(`[a](${NEUTRALIZED_URL})`);
	});

	it('defeats whitespace/case evasion in the scheme (`JaVa\\tScRiPt:`)', () => {
		expect(isSafeUrl(`java${TAB}script:alert(1)`)).toBe(false);
		expect(isSafeUrl('JaVaScRiPt:alert(1)')).toBe(false);
		expect(safeUrl(`java${TAB}script:alert(1)`)).toBe(NEUTRALIZED_URL);
	});

	it('defeats HTML-entity-encoded scheme smuggling (decimal/hex numeric + &colon;)', () => {
		// `&#106;` = `j`, `&#x6a;` = `j` — both reconstruct `javascript:` after a single decode pass.
		expect(isSafeUrl('&#106;avascript:alert(1)')).toBe(false);
		expect(isSafeUrl('&#x6a;avascript:alert(1)')).toBe(false);
		// `&colon;` reconstructs the `:` so the whole token becomes the `javascript:` scheme.
		expect(isSafeUrl('javascript&colon;alert(1)')).toBe(false);
		expect(isSafeUrl('JAVASCRIPT&COLON;alert(1)')).toBe(false);
		// Entity-encoded data: URL is also neutralized.
		expect(isSafeUrl('&#100;ata:text/html,<script>1</script>')).toBe(false);
		expect(safeUrl('&#106;avascript:alert(1)')).toBe(NEUTRALIZED_URL);
		// A markdown link with an entity-smuggled scheme is neutralized end to end.
		expect(neutralizeMarkdownLinks('[x](&#106;avascript:alert)')).toBe(`[x](${NEUTRALIZED_URL})`);
	});

	it('does NOT over-decode: a double-encoded value that stays inert after one decode stays safe', () => {
		// `&amp;#106;avascript:` decodes (one pass) to the literal text `&#106;avascript:`, NOT `javascript:` —
		// it carries no live scheme, so treating it as a (relative) safe target matches renderer behavior.
		expect(isSafeUrl('&amp;#106;avascript:note')).toBe(true);
		// A legitimate query string with an ampersand is untouched.
		expect(isSafeUrl('https://example.com/?a=1&b=2')).toBe(true);
	});

	it('preserves SAFE link targets (http/https/mailto/relative/fragment/wikilink)', () => {
		expect(isSafeUrl('https://example.com')).toBe(true);
		expect(isSafeUrl('http://example.com/x')).toBe(true);
		expect(isSafeUrl('mailto:dm@example.com')).toBe(true);
		expect(isSafeUrl('./relative/note.md')).toBe(true);
		expect(isSafeUrl('#a-heading-anchor')).toBe(true);
		// A legitimate markdown link is untouched.
		expect(neutralizeMarkdownLinks('[home](https://example.com)')).toBe(
			'[home](https://example.com)',
		);
	});

	it('uses a stricter absolute, credential-free policy for fetched media', () => {
		expect(isSafeRemoteMediaUrl('https://cdn.example.test/scene.png')).toBe(true);
		expect(isSafeRemoteMediaUrl('http://localhost:4173/audio.mp3')).toBe(true);
		expect(isSafeRemoteMediaUrl('./scene.png')).toBe(false);
		expect(isSafeRemoteMediaUrl('mailto:dm@example.test')).toBe(false);
		expect(isSafeRemoteMediaUrl('https://user:secret@example.test/audio.mp3')).toBe(false);
	});
});

describe('SEC-003 content-safety — legitimate markdown / wikilinks still render', () => {
	it('does NOT break valid markdown structure or wikilinks', () => {
		const body = '# Heading\n\nA paragraph with a [[Bane#Worship|wikilink]] and **bold**.';
		const safe = sanitizeMarkdownContent(body);
		expect(safe).toContain('# Heading');
		expect(safe).toContain('[[Bane#Worship|wikilink]]');
		expect(safe).toContain('**bold**');
		// Already-safe content is unchanged (the predicate proves it).
		expect(isSafeMarkdownContent(body)).toBe(true);
	});

	it('sanitization is idempotent', () => {
		const once = sanitizeMarkdownContent('<script>x</script> [a](javascript:1)');
		expect(sanitizeMarkdownContent(once)).toBe(once);
	});
});

describe('SEC-003 content-safety — the RENDER path is safe end to end (AC1)', () => {
	it('a note containing `<script>` and a `javascript:` URL renders no executable content', () => {
		const preview = renderMarkdownPreview(
			'# Trap\n\n<script>alert(1)</script>\n\n[click](javascript:alert(2))',
		);
		// The sanitized preview body carries neither the script tag nor the dangerous scheme.
		expect(preview.body).not.toContain('<script>');
		expect(preview.body).not.toContain('javascript:');
		// No rendered block carries an executable tag or a dangerous scheme.
		for (const block of preview.blocks) {
			expect(block.text).not.toContain('<script>');
			expect(block.text).not.toContain('javascript:');
		}
		// The neutralized link sentinel is present (the link text was preserved, the target inert).
		const text = preview.blocks.map((b) => b.text).join('\n');
		expect(text).toContain(NEUTRALIZED_URL);
	});

	it('a benign note renders unchanged through the safe render path', () => {
		const preview = renderMarkdownPreview('# Lore\n\nThe keep stands. See [[Bane]].');
		expect(preview.blocks.some((b) => b.kind === 'heading' && b.text === 'Lore')).toBe(true);
		expect(preview.wikilinks.map((w) => w.target)).toContain('Bane');
	});
});
