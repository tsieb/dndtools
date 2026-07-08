// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * UX-VIS design-token compliance (UX-VIS-001..008, 012, 013).
 *
 * These checks treat `src/routes/styles.css` as the single token source of truth and enforce the
 * acceptance criteria that are otherwise "grep" gates: complete theme matrix, no raw colour /
 * radius / spacing literals in component rules, typography + z-index tokenisation, forced-colors
 * mapping, brand-font discipline, and the headline contrast floors.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(resolve(HERE, '..', '..', 'src', 'routes', 'styles.css'), 'utf8');

const NAMED_THEMES = ['tavern', 'parchment', 'high-contrast'] as const;

const REQUIRED_COLOR_TOKENS = [
	'--color-bg',
	'--color-surface',
	'--color-surface-raised',
	'--color-surface-overlay',
	'--color-surface-sunken',
	'--color-surface-alt',
	'--color-border',
	'--color-border-strong',
	'--color-border-focus',
	'--color-text-primary',
	'--color-text-secondary',
	'--color-text-tertiary',
	'--color-text-inverse',
	'--color-text-link',
	'--color-text-link-visited',
	'--color-accent',
	'--color-accent-hover',
	'--color-accent-active',
	'--color-accent-subtle',
	'--color-accent-foreground',
	'--color-accent-border',
	'--color-status-success',
	'--color-status-success-text',
	'--color-status-success-subtle',
	'--color-status-warning',
	'--color-status-warning-text',
	'--color-status-warning-subtle',
	'--color-status-error',
	'--color-status-error-text',
	'--color-status-error-subtle',
	'--color-status-info',
	'--color-status-info-text',
	'--color-status-info-subtle',
	'--color-dm-only-badge',
	'--color-dm-only-subtle',
	'--color-hidden-content-stripe',
	'--color-interactive-hover',
	'--color-interactive-selected',
	'--color-interactive-focus-ring',
	'--color-interactive-disabled',
	'--color-interactive-disabled-bg',
	'--color-backdrop',
];

function themeBlock(theme: string): string {
	const escaped = theme.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
	const match = new RegExp(`\\[data-theme='${escaped}'\\]\\s*\\{([^}]*)\\}`).exec(CSS);
	if (!match) throw new Error(`theme block missing: ${theme}`);
	return match[1]!;
}

function parseTokens(block: string): Map<string, string> {
	const tokens = new Map<string, string>();
	for (const decl of block.split(';')) {
		const m = /(--[a-z0-9-]+)\s*:\s*(.+)$/i.exec(decl.trim());
		if (m) tokens.set(m[1]!, m[2]!.trim());
	}
	return tokens;
}

/** Everything after the section-4 marker is the token-consuming component layer. */
function componentLayer(): string {
	const idx = CSS.indexOf('4. COMPONENT RULES');
	expect(idx).toBeGreaterThan(0);
	return CSS.slice(idx);
}

function srgbToLinear(c: number): number {
	const v = c / 255;
	return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
function luminance(hex: string): number {
	const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)!;
	return (
		0.2126 * srgbToLinear(parseInt(m[1]!, 16)) +
		0.7152 * srgbToLinear(parseInt(m[2]!, 16)) +
		0.0722 * srgbToLinear(parseInt(m[3]!, 16))
	);
}
function ratio(a: string, b: string): number {
	const la = luminance(a);
	const lb = luminance(b);
	return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Declarations of a given property in the component layer, as raw value strings. */
function declarations(property: string): string[] {
	const layer = componentLayer();
	const re = new RegExp(`(?:^|[;{\\s])${property}\\s*:\\s*([^;{}]+);`, 'gi');
	return [...layer.matchAll(re)].map((m) => m[1]!.trim());
}

describe('UX-VIS design tokens — theme matrix', () => {
	it('defines all three named themes', () => {
		for (const theme of NAMED_THEMES) {
			expect(() => themeBlock(theme), theme).not.toThrow();
		}
	});

	it('every theme defines every semantic colour token with a non-empty value (UX-VIS-003)', () => {
		for (const theme of NAMED_THEMES) {
			const tokens = parseTokens(themeBlock(theme));
			for (const token of REQUIRED_COLOR_TOKENS) {
				const value = tokens.get(token);
				expect(value, `${theme} ${token}`).toBeTruthy();
			}
		}
	});

	it('tavern primary text reaches AAA on the page background (UX-VIS-002 AC2)', () => {
		const t = parseTokens(themeBlock('tavern'));
		expect(ratio(t.get('--color-text-primary')!, t.get('--color-bg')!)).toBeGreaterThanOrEqual(7);
	});

	it('high-contrast primary text reaches 21:1 (UX-VIS-012 AC2)', () => {
		const t = parseTokens(themeBlock('high-contrast'));
		expect(ratio(t.get('--color-text-primary')!, t.get('--color-bg')!)).toBeGreaterThanOrEqual(21);
	});

	it('maps tokens to system colour keywords under forced-colors (UX-VIS-001 AC3)', () => {
		const m = /@media \(forced-colors: active\)\s*\{([\s\S]*?)\n\t\}\n\}/.exec(CSS);
		expect(m, 'forced-colors block').toBeTruthy();
		const block = m![1]!;
		expect(block).toContain('Canvas');
		expect(block).toContain('CanvasText');
		expect(block).toContain('Highlight');
		// No hard-coded hex survives inside the forced-colors mapping.
		expect(block).not.toMatch(/#[0-9a-f]{3,8}\b/i);
	});
});

describe('UX-VIS design tokens — invariant token sets', () => {
	const root = CSS.slice(0, CSS.indexOf("[data-theme='tavern']"));
	it.each([
		['typography (UX-VIS-004)', ['--font-sans', '--font-display', '--text-base', '--text-xl']],
		['spacing (UX-VIS-005)', ['--space-0', '--space-2', '--space-4', '--space-0-5']],
		['radius (UX-VIS-006)', ['--radius-sm', '--radius-md', '--radius-lg', '--radius-full']],
		['elevation (UX-VIS-007)', ['--shadow-sm', '--shadow-md', '--shadow-lg']],
		['z-index (UX-VIS-008)', ['--z-modal', '--z-tooltip', '--z-command', '--z-dm-boundary']],
	])('defines %s tokens', (_label, tokens) => {
		for (const token of tokens as string[]) {
			expect(root, token).toContain(`${token}:`);
		}
	});
});

describe('UX-VIS design tokens — component layer is token-only', () => {
	it('uses no raw hex / rgb / hsl colour literals (UX-VIS-002 AC1)', () => {
		const layer = componentLayer();
		expect(layer).not.toMatch(/#[0-9a-f]{3,8}\b/i);
		expect(layer).not.toMatch(/\brgba?\(/i);
		expect(layer).not.toMatch(/\bhsla?\(/i);
	});

	it('uses only --radius-* tokens for border-radius (UX-VIS-006)', () => {
		for (const value of declarations('border-radius')) {
			expect(value, value).toMatch(/^var\(--radius-[a-z]+\)$/);
		}
	});

	it('uses only --z-* tokens for z-index (UX-VIS-008)', () => {
		for (const value of declarations('z-index')) {
			expect(value, value).toMatch(/^var\(--z-[a-z-]+\)$/);
		}
	});

	it('uses only --text-* tokens for font-size (UX-VIS-004)', () => {
		for (const value of declarations('font-size')) {
			expect(value, value).toMatch(/^var\(--text-[a-z0-9]+\)$/);
		}
	});

	it('reserves the display font for >= 24px headings (UX-VIS-004 AC3)', () => {
		const layer = componentLayer();
		const ruleRe = /\{[^}]*\}/g;
		for (const rule of layer.match(ruleRe) ?? []) {
			if (rule.includes('var(--font-display)')) {
				expect(rule, 'display font rule').toMatch(/font-size:\s*var\(--text-(xl|2xl|3xl)\)/);
			}
		}
	});

	it('uses only token / 0 / auto / responsive values for padding, margin, and gap (UX-VIS-005)', () => {
		const props = [
			'padding',
			'padding-top',
			'padding-right',
			'padding-bottom',
			'padding-left',
			'margin',
			'margin-top',
			'margin-right',
			'margin-bottom',
			'margin-left',
			'gap',
			'row-gap',
			'column-gap',
		];
		const allowedPart = (part: string): boolean => {
			if (part === '0' || part === '0px' || part === 'auto') return true;
			if (part.startsWith('var(')) return true;
			if (/^[\d.]+(?:%|vh|vw|vmin|vmax)$/.test(part)) return true;
			if (/^(?:min|max|calc|clamp)\(/.test(part)) return true;
			return false;
		};
		const offenders: string[] = [];
		for (const prop of props) {
			for (const value of declarations(prop)) {
				// Split top-level on whitespace (var(...) has no internal spaces in this file).
				for (const part of value.split(/\s+/)) {
					if (!allowedPart(part)) offenders.push(`${prop}: ${value}`);
				}
			}
		}
		expect(offenders).toEqual([]);
	});

	it('applies only brand font families and no textures (UX-VIS-013)', () => {
		for (const value of declarations('font-family')) {
			expect(value, value).toMatch(/^var\(--font-(sans|display|mono)\)$/);
		}
		// No raster/texture images on component surfaces (gradients on the body root are allowed).
		expect(componentLayer()).not.toMatch(/url\(/i);
	});
});
