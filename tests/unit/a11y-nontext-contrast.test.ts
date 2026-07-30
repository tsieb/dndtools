// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	contrastRatio,
	evaluateForcedColors,
	evaluateNonTextContrast,
	evaluateThemePairs,
	nonTextPairs,
	parseHex,
} from '../../scripts/a11y-nontext-contrast-lint.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(
	resolve(HERE, '..', '..', 'apps', 'gm-react', 'src', 'styles', 'tokens', 'colors.css'),
	'utf8',
);

describe('non-text contrast gate (UX-A11Y-016)', () => {
	it('the WCAG contrast formula matches the reference (black/white = 21:1)', () => {
		expect(contrastRatio(parseHex('#000000')!, parseHex('#ffffff')!)).toBeCloseTo(21, 1);
	});

	it('the real v2 stylesheet passes non-text contrast in every named theme', () => {
		const result = evaluateNonTextContrast(CSS);
		expect(result.failures).toEqual([]);
		expect(result.checks).toBeGreaterThan(0);
	});

	it('the forced-colors fallback remaps boundary/focus tokens to system colours (AC2)', () => {
		const result = evaluateForcedColors(CSS);
		expect(result.failures).toEqual([]);
		expect(result.checks).toBe(4);
	});

	it('flags a focus ring that drops below 3:1 against its background (negative probe)', () => {
		// A focus ring nearly identical to the page background must be reported as a failure;
		// this proves the gate is not vacuous.
		const tokens = new Map<string, string>([
			['--color-bg', '#111418'],
			['--color-surface', '#1c2128'],
			['--color-surface-raised', '#252c35'],
			['--color-border', '#2d3748'],
			['--color-accent', '#d4a76a'],
			['--color-interactive-focus-ring', '#141619'],
			['--color-dm-only-badge', '#9333ea'],
			['--color-status-success', '#22c55e'],
			['--color-status-warning', '#f59e0b'],
			['--color-status-error', '#ef4444'],
			['--color-status-info', '#38bdf8'],
		]);
		const result = evaluateThemePairs('tavern', tokens);
		expect(result.failures.some((f) => f.includes('focus ring'))).toBe(true);
	});

	it('covers focus indicators, selected boundary, status graphics, and DM marker', () => {
		const labels = nonTextPairs().map((p) => p.label);
		expect(labels.some((l) => l.includes('focus ring'))).toBe(true);
		expect(labels.some((l) => l.includes('selected boundary'))).toBe(true);
		expect(labels.some((l) => l.includes('status'))).toBe(true);
		expect(labels.some((l) => l.includes('DM-only'))).toBe(true);
	});
});

/**
 * Token DEFINEDNESS, which the contrast pairs above cannot catch: an undefined custom property makes
 * the whole `border: 1px solid var(--x)` shorthand invalid, so the border silently disappears rather
 * than looking wrong. And the map/layer tokens are the one family that is BOTH badge foreground (on
 * `--color-surface`) and canvas ink (on `--map-canvas-bg`), so they need a per-theme cut.
 */
describe('map/layer + status-border token coverage', () => {
	/** Custom properties declared inside one CSS block, by selector text. */
	function tokensIn(selector: string): Set<string> {
		const escaped = selector.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
		const block = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g');
		const found = new Set<string>();
		let match: RegExpExecArray | null;
		while ((match = block.exec(CSS))) {
			for (const decl of match[1]!.split(';')) {
				const m = /(--[a-z0-9-]+)\s*:/i.exec(decl.trim());
				if (m) found.add(m[1]!);
			}
		}
		return found;
	}

	const rootTokens = tokensIn(':root');
	const layerFamily = [...rootTokens].filter(
		(t) => t.startsWith('--layer-') || t === '--map-fog-fill' || t === '--map-canvas-bg' || t === '--map-grid-line',
	);

	it('finds the layer/map family in :root at all (guards the probe itself)', () => {
		expect(layerFamily.length).toBeGreaterThanOrEqual(13);
	});

	it('re-cuts every layer/map colour for parchment', () => {
		// The :root set is tuned for the dark themes; on parchment's near-white surface the same
		// values were light-on-light (~2:1, WCAG 1.4.3). Fog opacities are unitless, not colours.
		const parchment = tokensIn("[data-theme='parchment']");
		const missing = layerFamily.filter((t) => !parchment.has(t));
		expect(missing).toEqual([]);
	});

	it('remaps every layer/map colour under forced-colors', () => {
		// The map surface must obey a forced OS palette like the rest of the app (1.4.11 / 2.4.13).
		const forcedBlock = /@media\s*\(forced-colors:\s*active\)\s*\{([\s\S]*?)\n\}/.exec(CSS);
		expect(forcedBlock).not.toBeNull();
		const forced = new Set(
			[...forcedBlock![1]!.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]!),
		);
		const missing = layerFamily.filter((t) => !forced.has(t));
		expect(missing).toEqual([]);
	});

	it('defines every status border token that components already reference', () => {
		// 15 call sites across 5 files wrote `1px solid var(--color-status-*-border)` against tokens
		// that were never declared, so those containers rendered with no border at all.
		const declared = new Set([...rootTokens, ...tokensIn(':root,\n[data-theme]')]);
		for (const tone of ['success', 'warning', 'error', 'info']) {
			expect(declared.has(`--color-status-${tone}-border`)).toBe(true);
		}
	});
});
