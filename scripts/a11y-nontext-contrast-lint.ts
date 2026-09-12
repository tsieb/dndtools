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
 * Tile-type accents (`--color-tile-*`, RC-CAN-2.1) are graphical objects too: a tile header's accent
 * rail and type icon must reach 3:1 against every surface a tile can sit on. They are authored in
 * OKLCH, so this gate converts OKLCH to sRGB instead of skipping it, and a tile value that does not
 * resolve to one opaque, in-gamut colour is a failure rather than a silent skip.
 *
 * Run via `pnpm a11y:contrast`. Self-contained (reads the CSS via fs); no app/build dependency.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS_PATH = resolve(HERE, '..', 'apps', 'gm-react', 'src', 'styles', 'tokens', 'colors.css');

export const NAMED_THEMES = ['tavern', 'parchment', 'high-contrast'] as const;
export type ThemeName = (typeof NAMED_THEMES)[number];

interface NonTextPair {
	fg: string;
	bg: string;
	min: number;
	label: string;
	/** Themes this pairing does not apply to (e.g. forced-colors-driven high-contrast). */
	skipThemes?: ThemeName[];
	/** Fail instead of skipping when a value is not an opaque hex or in-gamut `oklch()` colour. */
	strict?: boolean;
}

/** Tile types that carry a semantic accent token, `--color-tile-<type>` (RC-CAN-2.1). */
export const TILE_TYPES = [
	'note',
	'combat',
	'encounter',
	'dice',
	'generator',
	'handout',
	'timer',
	'calendar',
	'map',
	'character',
	'audio',
	'reference',
] as const;

/** Every surface a tile accent paints against: page, panel, tile body, placeholder well. */
const TILE_SURFACES = [
	'--color-bg',
	'--color-surface',
	'--color-surface-raised',
	'--color-surface-sunken',
];

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
	for (const type of TILE_TYPES) {
		for (const bg of TILE_SURFACES) {
			pairs.push({
				fg: `--color-tile-${type}`,
				bg,
				min: 3,
				label: `${type} tile accent on ${bg}`,
				strict: true,
			});
		}
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

/** Tile accents must obey a forced OS palette too; tile identity then falls back to icon + label. */
export const FORCED_COLOR_TILE_TOKENS = TILE_TYPES.map((type) => `--color-tile-${type}`);

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

/**
 * A theme is spread over several `[data-theme='x']` blocks (core colours, the map/layer ramp, the
 * tile accents), so merge them all; a later block wins, as in the cascade.
 */
export function parseThemeTokens(css: string, theme: ThemeName): Map<string, string> {
	const escaped = theme.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
	const blocks = [
		...css.matchAll(new RegExp(`\\[data-theme='${escaped}'\\]\\s*\\{([^}]*)\\}`, 'g')),
	];
	if (blocks.length === 0) throw new Error(`Theme block not found for "${theme}" in ${CSS_PATH}`);
	const tokens = new Map<string, string>();
	for (const block of blocks) {
		for (const decl of block[1]!.split(';')) {
			const m = /(--[a-z0-9-]+)\s*:\s*(.+)$/i.exec(decl.trim());
			if (m) tokens.set(m[1]!, m[2]!.trim());
		}
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

/**
 * `oklch(L C H)` to 8-bit sRGB via OKLab (Ottosson's reference matrices). Returns null for a
 * translucent value (there is no single colour to measure) and for an out-of-gamut one: browsers
 * gamut-map those by reducing chroma, so a clamped conversion would measure a colour never painted.
 */
export function parseOklch(value: string): [number, number, number] | null {
	const m =
		/^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*(?:\/\s*([\d.]+)(%?)\s*)?\)$/i.exec(
			value.trim(),
		);
	if (!m) return null;
	if (m[5] !== undefined && Number(m[5]) / (m[6] ? 100 : 1) < 1) return null;
	const L = Number(m[1]) / (m[2] ? 100 : 1);
	const C = Number(m[3]);
	const hue = (Number(m[4]) * Math.PI) / 180;
	const a = C * Math.cos(hue);
	const b = C * Math.sin(hue);
	const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const mid = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
	const linear = [
		4.0767416621 * l - 3.3077115913 * mid + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * mid - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * mid + 1.707614701 * s,
	];
	if (linear.some((v) => v < -1e-4 || v > 1 + 1e-4)) return null;
	return linear.map((v) => {
		const c = Math.min(1, Math.max(0, v));
		return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
	}) as [number, number, number];
}

/** A token value as 8-bit sRGB: hex, or opaque in-gamut OKLCH. Anything else is null. */
export function parseColor(value: string): [number, number, number] | null {
	return parseHex(value) ?? parseOklch(value);
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
		const fg = parseColor(fgValue);
		const bg = parseColor(bgValue);
		if (!fg || !bg) {
			// Translucent (rgba) values are not contrast-checked here, except where a pair is strict.
			if (pair.strict) {
				const [token, value] = fg ? [pair.bg, bgValue] : [pair.fg, fgValue];
				failures.push(
					`[${theme}] ${pair.label}: ${token} (${value}) is not an opaque hex or in-gamut oklch() colour`,
				);
			}
			continue;
		}
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

/**
 * Verify the forced-colors (OS high-contrast) block remaps `tokens` (by default the boundary/focus
 * set) to system colours.
 */
export function evaluateForcedColors(
	css: string,
	tokens: readonly string[] = FORCED_COLOR_TOKENS,
): NonTextResult {
	const failures: string[] = [];
	const block = /@media\s*\(forced-colors:\s*active\)\s*\{([\s\S]*?)\n\}/.exec(css);
	if (!block) {
		return { checks: 0, failures: ['missing @media (forced-colors: active) fallback block'] };
	}
	const body = block[1]!;
	let checks = 0;
	for (const token of tokens) {
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
	const forcedTiles = evaluateForcedColors(css, FORCED_COLOR_TILE_TOKENS);
	const failures = [...contrast.failures, ...forced.failures, ...forcedTiles.failures];
	if (failures.length > 0) {
		console.error(`Non-text contrast gate FAILED (${failures.length} issue(s)):`);
		for (const f of failures) console.error(`  - ${f}`);
		process.exit(1);
	}
	console.log(
		`Non-text contrast gate passed (${contrast.checks} pair checks across ${NAMED_THEMES.length} ` +
			`themes; ${forced.checks + forcedTiles.checks} forced-colors remap checks).`,
	);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main();
}
