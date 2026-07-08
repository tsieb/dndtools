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
