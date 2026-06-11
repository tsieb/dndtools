/**
 * Non-text contrast gate — WCAG 1.4.11 + 2.4.13 (UX-A11Y-016).
 *
 * The v1/epic-2 token-contrast lint (`scripts/token-contrast-lint.ts`) enforces TEXT contrast
 * (1.4.3). This gate enforces the complementary NON-TEXT contrast contract that axe cannot check:
 * the visual presentation of focus indicators, selected-state boundaries, and status graphical
 * objects must reach >= 3:1 against adjacent colours, in every named theme, and the forced-colors
 * (OS high-contrast) fallback must remap the boundary/focus tokens to system colour keywords.
 *
 * Scope note (WCAG 1.4.11 boundary interpretation): a resting, purely decorative separator
 * (`--color-border`) is exempt when the component is identifiable by other means (fill + label +
 * a conformant focus indicator). This gate therefore enforces the STATE indicators that 1.4.11 /
 * 2.4.13 require — focus ring, selected boundary, status graphics — plus the focused-vs-unfocused
 * delta, rather than the decorative resting border. The resting-border shortfall in the dark
 * themes is tracked in `docs/development/ACCESSIBILITY.md` (V2 register) with a remediation owner.
 *
 * Run via `pnpm a11y:contrast`. Self-contained (reads the CSS via fs); no app/build dependency.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS_PATH = resolve(HERE, '..', 'apps', 'gm', 'src', 'routes', 'styles.css');

export const NAMED_THEMES = ['tavern', 'parchment', 'dungeon', 'scholar', 'high-contrast'] as const;
export type ThemeName = (typeof NAMED_THEMES)[number];

interface NonTextPair {
	fg: string;
	bg: string;
	min: number;
	label: string;
	/** Themes this pairing does not apply to (e.g. forced-colors-driven high-contrast). */
	skipThemes?: ThemeName[];
}

/**
 * Non-text contrast pairings checked in every named theme. `min` is the WCAG 1.4.11 / 2.4.13 floor
 * (3:1) for the visual presentation of UI components and graphical objects.
 */
export function nonTextPairs(): NonTextPair[] {
	const statusFills = [
		'--color-status-success',
		'--color-status-warning',
		'--color-status-error',
		'--color-status-info',
	];
	const pairs: NonTextPair[] = [
		// Focus indicators vs every adjacent surface (1.4.11 + 2.4.13 "against adjacent colours").
		{ fg: '--color-interactive-focus-ring', bg: '--color-bg', min: 3, label: 'focus ring on page' },
		{
			fg: '--color-interactive-focus-ring',
			bg: '--color-surface',
			min: 3,
			label: 'focus ring on surface',
		},
		{
			fg: '--color-interactive-focus-ring',
			bg: '--color-surface-raised',
			min: 3,
			label: 'focus ring on raised surface',
		},
		// Focused-vs-unfocused appearance delta (2.4.13 AC3). High-contrast relies on the
		// forced-colors system rendering, where ring/border are both near-white by design.
		{
			fg: '--color-interactive-focus-ring',
			bg: '--color-border',
			min: 3,
			label: 'focus ring vs unfocused border (focused-state delta)',
			skipThemes: ['high-contrast'],
		},
		// Selected / active component boundary (accent border on checked controls).
		{ fg: '--color-accent', bg: '--color-bg', min: 3, label: 'selected boundary on page' },
		{ fg: '--color-accent', bg: '--color-surface', min: 3, label: 'selected boundary on surface' },
		// DM-only graphical marker.
		{
			fg: '--color-dm-only-badge',
			bg: '--color-surface',
			min: 3,
			label: 'DM-only marker on surface',
		},
		{ fg: '--color-dm-only-badge', bg: '--color-bg', min: 3, label: 'DM-only marker on page' },
	];
	for (const token of statusFills) {
		pairs.push({ fg: token, bg: '--color-surface', min: 3, label: `${token} graphic on surface` });
		pairs.push({ fg: token, bg: '--color-bg', min: 3, label: `${token} graphic on page` });
	}
	return pairs;
}

/** Boundary/focus tokens that MUST fall back to a system colour keyword under forced-colors. */
export const FORCED_COLOR_TOKENS = [
	'--color-border',
	'--color-border-strong',
	'--color-border-focus',
	'--color-interactive-focus-ring',
] as const;

const SYSTEM_COLOR_KEYWORDS = [
	'Canvas',
	'CanvasText',
	'LinkText',
	'VisitedText',
	'ActiveText',
	'ButtonFace',
	'ButtonText',
	'ButtonBorder',
	'Field',
	'FieldText',
	'Highlight',
	'HighlightText',
	'SelectedItem',
	'SelectedItemText',
	'Mark',
	'MarkText',
	'GrayText',
	'AccentColor',
	'AccentColorText',
];

export function parseThemeTokens(css: string, theme: ThemeName): Map<string, string> {
	const escaped = theme.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
	const blockMatch = new RegExp(`\\[data-theme='${escaped}'\\]\\s*\\{([^}]*)\\}`).exec(css);
	if (!blockMatch) throw new Error(`Theme block not found for "${theme}" in ${CSS_PATH}`);
	const tokens = new Map<string, string>();
	for (const decl of blockMatch[1]!.split(';')) {
		const m = /(--[a-z0-9-]+)\s*:\s*(.+)$/i.exec(decl.trim());
		if (m) tokens.set(m[1]!, m[2]!.trim());
	}
	return tokens;
}

export function parseHex(value: string): [number, number, number] | null {
	const hex = value.trim();
	const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex);
	if (short) {
		return [
			parseInt(short[1]! + short[1]!, 16),
			parseInt(short[2]! + short[2]!, 16),
			parseInt(short[3]! + short[3]!, 16),
		];
	}
	const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
	if (long) return [parseInt(long[1]!, 16), parseInt(long[2]!, 16), parseInt(long[3]!, 16)];
	return null;
}

function channelLuminance(channel: number): number {
	const c = channel / 255;
	return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
	return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

export function contrastRatio(fg: [number, number, number], bg: [number, number, number]): number {
	const l1 = relativeLuminance(fg);
	const l2 = relativeLuminance(bg);
	return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export interface NonTextResult {
	checks: number;
	failures: string[];
}

/** Evaluate every non-text pairing for a single theme's resolved token map. Pure. */
export function evaluateThemePairs(theme: string, tokens: Map<string, string>): NonTextResult {
	const failures: string[] = [];
	let checks = 0;
	for (const pair of nonTextPairs()) {
		if (pair.skipThemes?.includes(theme as ThemeName)) continue;
		const fgValue = tokens.get(pair.fg);
		const bgValue = tokens.get(pair.bg);
		if (fgValue === undefined || bgValue === undefined) {
			failures.push(`[${theme}] missing token in pair ${pair.fg} / ${pair.bg}`);
			continue;
		}
		const fg = parseHex(fgValue);
		const bg = parseHex(bgValue);
		if (!fg || !bg) continue; // non-hex (rgba) values are not contrast-checked here
		checks += 1;
		const ratio = contrastRatio(fg, bg);
		if (ratio + 1e-9 < pair.min) {
			failures.push(
				`[${theme}] ${pair.label}: ${pair.fg} (${fgValue}) on ${pair.bg} (${bgValue}) = ` +
					`${ratio.toFixed(2)}:1, need >= ${pair.min}:1`,
			);
		}
	}
	return { checks, failures };
}

/** Evaluate every non-text pairing across every named theme. Pure — no I/O, no process exit. */
export function evaluateNonTextContrast(css: string): NonTextResult {
	const failures: string[] = [];
	let checks = 0;
	for (const theme of NAMED_THEMES) {
		const result = evaluateThemePairs(theme, parseThemeTokens(css, theme));
		checks += result.checks;
		failures.push(...result.failures);
	}
	return { checks, failures };
}

/** Verify the forced-colors (OS high-contrast) block remaps boundary/focus tokens to system colours. */
export function evaluateForcedColors(css: string): NonTextResult {
	const failures: string[] = [];
	const block = /@media\s*\(forced-colors:\s*active\)\s*\{([\s\S]*?)\n\}/.exec(css);
	if (!block) {
		return { checks: 0, failures: ['missing @media (forced-colors: active) fallback block'] };
	}
	const body = block[1]!;
	let checks = 0;
	for (const token of FORCED_COLOR_TOKENS) {
		checks += 1;
		const decl = new RegExp(`${token}\\s*:\\s*([^;]+);`).exec(body);
		if (!decl) {
			failures.push(`forced-colors: ${token} is not remapped`);
			continue;
		}
		const value = decl[1]!.trim();
		if (!SYSTEM_COLOR_KEYWORDS.some((kw) => new RegExp(`\\b${kw}\\b`).test(value))) {
			failures.push(`forced-colors: ${token} (${value}) does not use a system colour keyword`);
		}
	}
	return { checks, failures };
}

function main(): void {
	const css = readFileSync(CSS_PATH, 'utf8');
	const contrast = evaluateNonTextContrast(css);
	const forced = evaluateForcedColors(css);
	const failures = [...contrast.failures, ...forced.failures];
	if (failures.length > 0) {
		console.error(`Non-text contrast gate FAILED (${failures.length} issue(s)):`);
		for (const f of failures) console.error(`  - ${f}`);
		process.exit(1);
	}
	console.log(
		`Non-text contrast gate passed (${contrast.checks} pair checks across ${NAMED_THEMES.length} ` +
			`themes; ${forced.checks} forced-colors remap checks).`,
	);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main();
}
