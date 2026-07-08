// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * UX-A11Y-009 / UX-A11Y-010 CSS contract. The focus-ring and touch-target tokens, the global
 * :focus-visible baseline, and the native-control sizing that resolves the inherited /session
 * target-size finding all live in `src/routes/styles.css`; this guards them against regression.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(resolve(HERE, '..', '..', 'src', 'routes', 'styles.css'), 'utf8');
const ROOT = CSS.slice(0, CSS.indexOf("[data-theme='tavern']"));

function tokenValue(body: string, token: string): string | undefined {
	const m = new RegExp(`${token}\\s*:\\s*([^;]+);`).exec(body);
	return m?.[1]?.trim();
}

describe('UX-A11Y-009 — focus ring tokens (WCAG 2.4.7 / 2.4.13)', () => {
	it('defines the 2px ring + 2px offset tokens aliasing the contrast-checked focus colour', () => {
		expect(tokenValue(ROOT, '--focus-ring-width')).toBe('2px');
		expect(tokenValue(ROOT, '--focus-ring-offset')).toBe('2px');
		expect(tokenValue(ROOT, '--focus-ring-color')).toBe('var(--color-interactive-focus-ring)');
	});

	it('applies a zero-specificity :focus-visible baseline that uses those tokens', () => {
		expect(CSS).toContain(':focus-visible');
		expect(CSS).toMatch(/outline:\s*var\(--focus-ring-width\)\s+solid\s+var\(--focus-ring-color\)/);
		expect(CSS).toMatch(/outline-offset:\s*var\(--focus-ring-offset\)/);
		// :where() keeps the baseline at zero specificity so components can override but not drop it.
		expect(CSS).toMatch(/:where\([\s\S]*?\):focus-visible/);
	});
});

describe('UX-A11Y-010 — touch-target tokens + native control sizing (WCAG 2.5.8)', () => {
	it('defines the 44px recommended target and the 24px hard floor', () => {
		expect(tokenValue(ROOT, '--touch-target-min')).toBe('2.75rem'); // 44px
		expect(tokenValue(ROOT, '--touch-target-floor')).toBe('1.5rem'); // 24px
	});

	it('sizes native checkboxes/radios to the 24px floor (resolves the /session finding)', () => {
		const m = /input\[type='checkbox'\],\s*input\[type='radio'\]\s*\{([^}]*)\}/.exec(CSS);
		expect(m, 'checkbox/radio sizing rule present').not.toBeNull();
		const body = m![1]!;
		expect(tokenValue(body, 'width')).toBe('var(--touch-target-floor)');
		expect(tokenValue(body, 'height')).toBe('var(--touch-target-floor)');
		expect(tokenValue(body, 'min-width')).toBe('var(--touch-target-floor)');
		expect(tokenValue(body, 'min-height')).toBe('var(--touch-target-floor)');
	});
});
