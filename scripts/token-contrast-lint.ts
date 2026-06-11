/**
 * Theme contrast validation (UX-VIS-012).
 *
 * Parses the per-theme colour tokens from the GM app stylesheet and verifies that every primary
 * foreground/background token pair meets its assigned WCAG 2.2 contrast level, for ALL five named
 * themes. The high-contrast theme is held to AAA (21:1 for primary text). Failures block release.
 *
 * Run via `pnpm tokens:contrast`. Self-contained (reads the CSS via fs) so it has no dependency on
 * the app package or a build step.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS_PATH = resolve(HERE, '..', 'apps', 'gm', 'src', 'routes', 'styles.css');

const NAMED_THEMES = ['tavern', 'parchment', 'dungeon', 'scholar', 'high-contrast'] as const;
type ThemeName = (typeof NAMED_THEMES)[number];

interface Pair {
	fg: string;
	bg: string;
	min: number;
	label: string;
}

/** Token pairs checked in every theme. `min` is the WCAG ratio floor for that pairing. */
function pairsForTheme(): Pair[] {
	const statusTextTokens = [
		'--color-status-success-text',
		'--color-status-warning-text',
		'--color-status-error-text',
		'--color-status-info-text',
	];
	const statusBaseTokens = [
		'--color-status-success',
		'--color-status-warning',
		'--color-status-error',
		'--color-status-info',
	];
	const pairs: Pair[] = [
		{ fg: '--color-text-primary', bg: '--color-bg', min: 7, label: 'primary text on page' },
		{ fg: '--color-text-primary', bg: '--color-surface', min: 4.5, label: 'primary text on surface' },
		{ fg: '--color-text-secondary', bg: '--color-bg', min: 4.5, label: 'secondary text on page' },
		{
			fg: '--color-text-secondary',
			bg: '--color-surface',
			min: 4.5,
			label: 'secondary text on surface',
		},
		{ fg: '--color-text-link', bg: '--color-surface', min: 4.5, label: 'link text on surface' },
		{ fg: '--color-accent', bg: '--color-bg', min: 4.5, label: 'accent text on page' },
		{ fg: '--color-accent', bg: '--color-surface', min: 4.5, label: 'accent text on surface' },
		{
			fg: '--color-accent-foreground',
			bg: '--color-accent',
			min: 4.5,
			label: 'label on accent fill',
		},
		{ fg: '--color-border-focus', bg: '--color-bg', min: 3, label: 'focus ring on page' },
		{ fg: '--color-border-focus', bg: '--color-surface', min: 3, label: 'focus ring on surface' },
		{ fg: '--color-dm-only-badge', bg: '--color-surface', min: 3, label: 'DM-only badge on surface' },
	];
	for (const token of statusTextTokens) {
		pairs.push({ fg: token, bg: '--color-surface', min: 4.5, label: `${token} on surface` });
	}
	for (const token of statusBaseTokens) {
		pairs.push({ fg: token, bg: '--color-surface', min: 3, label: `${token} fill on surface` });
	}
	return pairs;
}

function parseThemeTokens(css: string, theme: ThemeName): Map<string, string> {
	const escaped = theme.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
	const blockMatch = new RegExp(`\\[data-theme='${escaped}'\\]\\s*\\{([^}]*)\\}`).exec(css);
	if (!blockMatch) {
		throw new Error(`Theme block not found for "${theme}" in ${CSS_PATH}`);
	}
	const tokens = new Map<string, string>();
	for (const decl of blockMatch[1]!.split(';')) {
		const declMatch = /(--[a-z0-9-]+)\s*:\s*(.+)$/i.exec(decl.trim());
		if (declMatch) tokens.set(declMatch[1]!, declMatch[2]!.trim());
	}
	return tokens;
}

function parseHex(value: string): [number, number, number] | null {
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
	if (long) {
		return [parseInt(long[1]!, 16), parseInt(long[2]!, 16), parseInt(long[3]!, 16)];
	}
	return null;
}

function channelLuminance(channel: number): number {
	const c = channel / 255;
	return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
	return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

function contrastRatio(fg: [number, number, number], bg: [number, number, number]): number {
	const l1 = relativeLuminance(fg);
	const l2 = relativeLuminance(bg);
	const lighter = Math.max(l1, l2);
	const darker = Math.min(l1, l2);
	return (lighter + 0.05) / (darker + 0.05);
}

function main(): void {
	const css = readFileSync(CSS_PATH, 'utf8');
	const failures: string[] = [];
	let checks = 0;

	for (const theme of NAMED_THEMES) {
		const tokens = parseThemeTokens(css, theme);
		for (const pair of pairsForTheme()) {
			const fgValue = tokens.get(pair.fg);
			const bgValue = tokens.get(pair.bg);
			if (fgValue === undefined || bgValue === undefined) {
				failures.push(`[${theme}] missing token in pair ${pair.fg} / ${pair.bg}`);
				continue;
			}
			const fg = parseHex(fgValue);
			const bg = parseHex(bgValue);
			if (!fg || !bg) {
				// Non-hex (e.g. rgba) values are not contrast-checked here.
				continue;
			}
			checks += 1;
			const ratio = contrastRatio(fg, bg);
			if (ratio + 1e-9 < pair.min) {
				failures.push(
					`[${theme}] ${pair.label}: ${pair.fg} (${fgValue}) on ${pair.bg} (${bgValue}) = ${ratio.toFixed(2)}:1, need >= ${pair.min}:1`,
				);
			}
		}

		// AAA floor for the high-contrast theme primary text (UX-VIS-012 AC2).
		if (theme === 'high-contrast') {
			const fg = parseHex(tokens.get('--color-text-primary') ?? '');
			const bg = parseHex(tokens.get('--color-bg') ?? '');
			if (fg && bg) {
				checks += 1;
				const ratio = contrastRatio(fg, bg);
				if (ratio + 1e-9 < 21) {
					failures.push(
						`[high-contrast] primary text must reach 21:1 (AAA); got ${ratio.toFixed(2)}:1`,
					);
				}
			}
		}
	}

	if (failures.length > 0) {
		console.error(`Theme contrast validation FAILED (${failures.length} issue(s)):`);
		for (const failure of failures) console.error(`  - ${failure}`);
		process.exit(1);
	}
	console.log(
		`Theme contrast validation passed (${checks} pair checks across ${NAMED_THEMES.length} themes).`,
	);
}

main();
