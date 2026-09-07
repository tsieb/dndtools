// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { I18nProvider, useI18n } from '../../i18n';
import { renderMarkdown, type MarkdownRenderOptions } from './render';

/**
 * RC-KNW-1.1 — the rendered half of the shared markdown pipeline, in a real DOM. Three things are
 * proven here:
 *
 *   1. THE XSS CORPUS. Author-controlled HTML, event handlers and script URLs all come out as inert
 *      text or are dropped. This is the standing evidence for "one sanitized pipeline" (ADR-005).
 *   2. THE STRUCTURE SNAPSHOT. A representative note renders to a stable element outline, so a
 *      future change to the tokenizer that silently drops a table or a figure fails here.
 *   3. THE `[!Secret]` CONTRACT. A non-DM renderer never emits the secret's text into the DOM.
 */

let host: HTMLDivElement;
let root: Root;

function Harness({ md, opts }: { md: string; opts?: Partial<MarkdownRenderOptions> }) {
	const { t } = useI18n();
	return <div data-testid="body">{renderMarkdown(md, { t, ...opts })}</div>;
}

function render(md: string, opts?: Partial<MarkdownRenderOptions>): HTMLElement {
	act(() => {
		root.render(
			<I18nProvider>
				<Harness md={md} opts={opts} />
			</I18nProvider>,
		);
	});
	return host.querySelector('[data-testid="body"]') as HTMLElement;
}

/** The top-level element outline of a rendered body — what a structural snapshot asserts on. */
function outline(node: HTMLElement): string[] {
	return Array.from(node.children).map((element) => element.tagName.toLowerCase());
}

beforeEach(() => {
	host = document.createElement('div');
	document.body.appendChild(host);
	root = createRoot(host);
});

afterEach(() => {
	act(() => root.unmount());
	host.remove();
});

describe('RC-KNW-1.1 renderer — XSS corpus', () => {
	const CORPUS = [
		'<script>window.__pwned = 1</script>',
		'<img src=x onerror="window.__pwned = 1">',
		'<iframe src="https://evil.test"></iframe>',
		'<svg/onload=alert(1)>',
		'<a href="javascript:alert(1)">click</a>',
		'<style>body{display:none}</style>',
		'&lt;script&gt;alert(1)&lt;/script&gt;',
		'<div onmouseover="alert(1)">hover</div>',
		'[click](javascript:alert(1))',
		'![x](data:image/svg+xml;base64,PHN2Zy9vbmxvYWQ9YWxlcnQoMSk+)',
		'> [!Lore] <script>alert(1)</script>',
		'| <script>alert(1)</script> | b |\n| --- | --- |\n| c | d |',
	];

	it('never injects an element the author asked for, and never runs a handler', () => {
		for (const payload of CORPUS) {
			const body = render(payload);
			// No author-supplied element ever reaches the DOM — the payload is text, not markup.
			// (`svg` is excluded: the callout chrome renders a Lucide icon, which is ours, not the
			// author's — the attribute sweep below still proves no handler rode in on it.)
			for (const tag of ['script', 'iframe', 'style', 'object', 'embed', 'form']) {
				expect(body.querySelector(tag)).toBeNull();
			}
			for (const element of body.querySelectorAll('*')) {
				// No event handler survives, whatever the author wrote.
				for (const attribute of element.getAttributeNames()) {
					expect(attribute.startsWith('on')).toBe(false);
				}
				// Every URL that DID render passed the allow-list.
				const href = element.getAttribute('href');
				if (href !== null) expect(href).toMatch(/^(https?|mailto):/);
				const src = element.getAttribute('src');
				if (src !== null) expect(src).toMatch(/^https?:/);
			}
		}
		expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
	});

	it('renders author HTML as visible, inert prose rather than swallowing it', () => {
		const body = render('<script>alert(1)</script>');
		expect(body.textContent).toContain('<script>alert(1)</script>');
	});

	it('renders a refused link as its label, with no anchor at all', () => {
		const body = render('Read [the note](javascript:alert(1)) now');
		expect(body.querySelector('a')).toBeNull();
		expect(body.textContent).toContain('the note');
	});
});

describe('RC-KNW-1.1 renderer — structure', () => {
	const NOTE = [
		'# The Sunken Crypt',
		'',
		'A flooded stair, **carved** with a drowned crown.',
		'',
		'| Roll | Result |',
		'| --- | --- |',
		'| 1 | A bell |',
		'',
		'- Bring rope',
		'- Bring light',
		'',
		'> [!Warning] The tide',
		'> The stair floods at high tide.',
		'',
		'![Door](https://example.test/door.png)',
		'*Carved with a drowned crown*',
		'',
		'See [[Harbor Bell]] and [the coast](https://example.test).',
	].join('\n');

	it('renders the expected element outline (visual/structure snapshot)', () => {
		const body = render(NOTE);
		expect(outline(body)).toMatchInlineSnapshot(`
			[
			  "h2",
			  "p",
			  "div",
			  "ul",
			  "aside",
			  "figure",
			  "p",
			]
		`);
	});

	it('gives the table a sticky, scoped header inside a keyboard-reachable scroll region', () => {
		const body = render(NOTE);
		const region = body.querySelector('[role="group"]') as HTMLElement;
		expect(region.tabIndex).toBe(0);
		expect(region.getAttribute('aria-label')).toBeTruthy();
		const th = body.querySelector('th') as HTMLElement;
		expect(th.getAttribute('scope')).toBe('col');
		expect(th.style.position).toBe('sticky');
	});

	it('renders a figure with its caption and an external image', () => {
		const body = render(NOTE);
		const figure = body.querySelector('figure') as HTMLElement;
		expect(figure.querySelector('img')?.getAttribute('src')).toBe('https://example.test/door.png');
		expect(figure.querySelector('figcaption')?.textContent).toBe('Carved with a drowned crown');
	});

	it('styles an external link apart from a wikilink and opens it safely', () => {
		const body = render(NOTE, { resolveWikilink: () => () => {} });
		const anchor = body.querySelector('a') as HTMLAnchorElement;
		expect(anchor.getAttribute('target')).toBe('_blank');
		expect(anchor.getAttribute('rel')).toBe('noopener noreferrer');
		// The wikilink is a button — a keyboard-reachable control, not an anchor.
		const button = body.querySelector('button') as HTMLButtonElement;
		expect(button.textContent).toBe('Harbor Bell');
	});

	it('renders an unresolved wikilink as inert text, never a dead control', () => {
		const body = render('See [[Nowhere]].');
		expect(body.querySelector('button')).toBeNull();
		expect(body.textContent).toContain('Nowhere');
	});

	it('renders the empty-body line rather than nothing at all', () => {
		expect(render('   ').textContent?.trim()).not.toBe('');
	});

	it('resolves an asset image through the injected resolver', () => {
		const body = render('![Door](asset:img-1)', {
			renderAssetImage: (assetId, alt) => <span data-asset={assetId}>{alt}</span>,
		});
		expect(body.querySelector('[data-asset="img-1"]')?.textContent).toBe('Door');
	});
});

describe('RC-KNW-1.1 renderer — [!Secret] callouts', () => {
	const SECRET = '> [!Secret] The truth\n> The lich seeded the flood.';

	it('emits NO secret text at all for a non-DM reader', () => {
		const body = render(SECRET);
		expect(body.textContent).not.toContain('The lich seeded the flood.');
		expect(body.textContent).not.toContain('The truth');
		expect(body.innerHTML).not.toContain('lich');
		// It says plainly that something is withheld — no silent gap.
		expect(body.textContent).toContain('DM only');
	});

	it('gives the DM a keyboard-operable show/hide control, blurred until shown', () => {
		const body = render(SECRET, { isDm: true });
		const toggle = body.querySelector('button') as HTMLButtonElement;
		expect(toggle.getAttribute('aria-expanded')).toBe('false');
		const blurred = body.querySelector('[data-secret]') as HTMLElement;
		expect(blurred.getAttribute('data-secret')).toBe('blurred');
		expect(blurred.getAttribute('aria-hidden')).toBe('true');
		act(() => toggle.click());
		expect(body.querySelector('button')?.getAttribute('aria-expanded')).toBe('true');
		expect(body.querySelector('[data-secret]')?.getAttribute('data-secret')).toBe('shown');
		expect(body.textContent).toContain('The lich seeded the flood.');
	});

	it('leaves the other callout flavours visible to everyone', () => {
		const body = render('> [!Lore] Legend\n> They call it the Drowned King.');
		expect(body.textContent).toContain('They call it the Drowned King.');
		expect(body.textContent).toContain('Legend');
	});
});

/**
 * RC-SES-2.2 — an inline `[[roll:1d20+5]]` renders a real control, and the control is honest about
 * where the number went: into the session log, or nowhere.
 */
describe('RC-SES-2.2 renderer — inline rolls', () => {
	const NOTE = 'Squeeze through: [[roll:1d20+5|Acrobatics]].';

	it('renders a pressable control labelled with the author’s label', () => {
		const body = render(NOTE);
		const button = body.querySelector('button') as HTMLButtonElement;
		expect(button).not.toBeNull();
		expect(button.textContent).toContain('Acrobatics');
		// The bracket syntax itself never reaches the reader.
		expect(body.textContent).not.toContain('[[roll:');
	});

	it('falls back to the expression when the author gave no label', () => {
		const body = render('Roll [[roll:2d6]].');
		expect((body.querySelector('button') as HTMLButtonElement).textContent).toContain('2d6');
	});

	it('shows a result and says it was recorded when a session took the roll', async () => {
		const seen: { expression: string; seed: number; label?: string }[] = [];
		const body = render(NOTE, {
			logInlineRoll: (roll) => {
				seen.push(roll);
				return true;
			},
		});
		await act(async () => {
			(body.querySelector('button') as HTMLButtonElement).click();
		});
		expect(seen).toHaveLength(1);
		expect(seen[0]?.expression).toBe('1d20+5');
		expect(seen[0]?.label).toBe('Acrobatics');
		// The seed is drawn by the control and handed to the log, so both land on the same total.
		expect(Number.isInteger(seen[0]?.seed)).toBe(true);
		const chip = body.querySelector('[role="status"]') as HTMLElement;
		const total = Number.parseInt(chip.textContent ?? '', 10);
		expect(total).toBeGreaterThanOrEqual(6);
		expect(total).toBeLessThanOrEqual(25);
		expect(chip.textContent).toContain('Recorded in the session log.');
	});

	it('still rolls with no session, and says the result was not recorded', async () => {
		const body = render(NOTE);
		await act(async () => {
			(body.querySelector('button') as HTMLButtonElement).click();
		});
		const chip = body.querySelector('[role="status"]') as HTMLElement;
		expect(chip).not.toBeNull();
		expect(chip.textContent).toContain('not recorded');
	});

	it('refuses a malformed expression with an honest message instead of a number', async () => {
		const body = render('Roll [[roll:not-dice]].');
		await act(async () => {
			(body.querySelector('button') as HTMLButtonElement).click();
		});
		const chip = body.querySelector('[role="status"]') as HTMLElement;
		expect(chip.textContent).toContain('not a dice expression');
	});
});
