// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * UX-VIS-009/010/011 CSS-token compliance. Treats `src/routes/styles.css` as the token source of
 * truth and enforces the acceptance criteria that live in CSS: icon size tokens, the motion
 * data-attribute contract (durations collapse to 0ms under reduced/none), the OS pre-resolution
 * fallback, and the three density token sets with their touch-target / focus-ring / icon-size values.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(resolve(HERE, '..', '..', 'src', 'routes', 'styles.css'), 'utf8');

const ROOT = CSS.slice(0, CSS.indexOf("[data-theme='tavern']"));

function block(selector: string): string {
	const escaped = selector.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
	const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(CSS);
	if (!match) throw new Error(`block missing: ${selector}`);
	return match[1]!;
}

function tokenValue(blockBody: string, token: string): string | undefined {
	const m = new RegExp(`${token}\\s*:\\s*([^;]+);`).exec(blockBody);
	return m?.[1]?.trim();
}

const DURATION_TOKENS = [
	'--duration-micro',
	'--duration-fast',
	'--duration-standard',
	'--duration-moderate',
	'--duration-slow',
	'--duration-crawl',
];

describe('UX-VIS-009 — icon size tokens', () => {
	it('defines the five named icon sizes in the invariant token layer', () => {
		expect(tokenValue(ROOT, '--icon-size-micro')).toBe('16px');
		expect(tokenValue(ROOT, '--icon-size-sm')).toBe('20px');
		expect(tokenValue(ROOT, '--icon-size-md')).toBe('24px');
		expect(tokenValue(ROOT, '--icon-size-lg')).toBe('32px');
		expect(tokenValue(ROOT, '--icon-size-xl')).toBe('48px');
	});

	it('pins the Lucide 2px stroke width as a token', () => {
		expect(tokenValue(ROOT, '--icon-stroke-width')).toBe('2');
	});
});

describe('UX-VIS-010 — motion contract', () => {
	it('zeroes every duration token under reduced / none (AC1)', () => {
		const body = block("[data-motion='reduced'],\n[data-motion='none']");
		for (const token of DURATION_TOKENS) {
			expect(tokenValue(body, token), token).toBe('0ms');
		}
	});

	it('keeps an OS pre-resolution fallback scoped to :root:not([data-motion])', () => {
		expect(CSS).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
		expect(CSS).toContain(':root:not([data-motion])');
	});

	it('still defines the spring easing reserved for dice / celebration (AC3)', () => {
		expect(tokenValue(ROOT, '--easing-spring')).toBeTruthy();
	});
});

describe('UX-VIS-011 — density token sets', () => {
	it('default (standard) sets a 32px visual target and 44px focus extent', () => {
		expect(tokenValue(ROOT, '--density-touch-target')).toBe('2rem'); // 32px
		expect(tokenValue(ROOT, '--density-focus-target')).toBe('2.75rem'); // 44px
		expect(tokenValue(ROOT, '--density-icon-size')).toBe('var(--icon-size-md)');
	});

	it('AC1: comfortable raises the touch target to 44px (>=44px on touch profiles)', () => {
		const body = block("[data-density='comfortable']");
		expect(tokenValue(body, '--density-touch-target')).toBe('2.75rem'); // 44px
		expect(tokenValue(body, '--density-nav-height')).toBe('3rem'); // 48px
		expect(tokenValue(body, '--density-button-height')).toBe('2.75rem');
	});

	it('AC2: compact keeps the focus ring at 40px even with a 28px visual target', () => {
		const body = block("[data-density='compact']");
		expect(tokenValue(body, '--density-touch-target')).toBe('1.75rem'); // 28px visual
		expect(tokenValue(body, '--density-focus-target')).toBe('2.5rem'); // 40px focus extent
		expect(tokenValue(body, '--density-icon-size')).toBe('var(--icon-size-sm)'); // 20px
	});
});
