// @vitest-environment node
/**
 * Unit tests for the A11Y-008 artifact-harness properties:
 *   AC1 — worker-isolated shard path derivation + merge step
 *   AC2 — deterministic fingerprints via dynamic-ID normalization
 *
 * Does NOT require a running browser or Playwright worker.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	mergeA11yShards,
	normalizeSelector,
	workerShardPath,
	type AxePolicyReport,
	type AxePolicyScan,
} from '../accessibility/axe-policy.js';

// ---------------------------------------------------------------------------
// AC2 — normalizeSelector: deterministic fingerprints despite dynamic IDs
// ---------------------------------------------------------------------------

describe('normalizeSelector — UUID normalization', () => {
	it('replaces a full lowercase UUID in a selector', () => {
		const raw = '#widget-550e8400-e29b-41d4-a716-446655440000';
		expect(normalizeSelector(raw)).toBe('#widget-<uuid>');
	});

	it('replaces a full uppercase UUID in a selector', () => {
		const raw = '#WIDGET-550E8400-E29B-41D4-A716-446655440000';
		expect(normalizeSelector(raw)).toBe('#WIDGET-<uuid>');
	});

	it('replaces multiple UUIDs in one selector', () => {
		const raw =
			'div[data-fixture="550e8400-e29b-41d4-a716-446655440000"] > span[data-id="6ba7b810-9dad-11d1-80b4-00c04fd430c8"]';
		const result = normalizeSelector(raw);
		expect(result).not.toContain('550e8400');
		expect(result).not.toContain('6ba7b810');
		expect(result).toContain('<uuid>');
	});

	it('leaves non-UUID content unchanged', () => {
		expect(normalizeSelector('button.primary')).toBe('button.primary');
		expect(normalizeSelector('#main-nav > ul > li')).toBe('#main-nav > ul > li');
	});
});

describe('normalizeSelector — Radix UI :rN: pattern', () => {
	it('replaces a :r5: Radix auto-id', () => {
		expect(normalizeSelector('#radix-:r5:')).toBe('#radix-<rid>');
	});

	it('replaces a multi-char Radix ID like :r1a:', () => {
		expect(normalizeSelector('[aria-labelledby=":r1a:"]')).toBe('[aria-labelledby="<rid>"]');
	});

	it('replaces multiple Radix IDs in one selector', () => {
		const raw = '[aria-owns=":r3:"] [aria-controls=":r0H:"]';
		const result = normalizeSelector(raw);
		expect(result).not.toContain(':r3:');
		expect(result).not.toContain(':r0H:');
		expect(result).toBe('[aria-owns="<rid>"] [aria-controls="<rid>"]');
	});
});

describe('normalizeSelector — long numeric sequences', () => {
	it('replaces a 6-digit number', () => {
		expect(normalizeSelector('#item-123456')).toBe('#item-<num>');
	});

	it('replaces a timestamp-style number (13 digits)', () => {
		expect(normalizeSelector('[data-ts="1718000000000"]')).toBe('[data-ts="<num>"]');
	});

	it('does NOT replace short numbers (5 digits or fewer)', () => {
		expect(normalizeSelector('#item-12345')).toBe('#item-12345');
		expect(normalizeSelector('div:nth-child(3)')).toBe('div:nth-child(3)');
	});
});

describe('normalizeSelector — combined patterns produce stable fingerprint', () => {
	it('same logical selector with different UUIDs → same normalized form', () => {
		const selectorA = 'div[data-id="550e8400-e29b-41d4-a716-446655440000"] .label';
		const selectorB = 'div[data-id="6ba7b810-9dad-11d1-80b4-00c04fd430c8"] .label';
		expect(normalizeSelector(selectorA)).toBe(normalizeSelector(selectorB));
	});

	it('same logical selector with different Radix IDs → same normalized form', () => {
		const selectorA = '#radix-:r5: button';
		const selectorB = '#radix-:r2b: button';
		expect(normalizeSelector(selectorA)).toBe(normalizeSelector(selectorB));
	});

	it('selectors differing by real content remain distinct after normalization', () => {
		expect(normalizeSelector('button.foo')).not.toBe(normalizeSelector('button.bar'));
	});
});

// ---------------------------------------------------------------------------
// AC1 — workerShardPath: per-worker isolated artifact paths
// ---------------------------------------------------------------------------

describe('workerShardPath', () => {
	it('appends .worker-N.json suffix for worker 0', () => {
		expect(workerShardPath('/tmp/a11y/report.json', 0)).toBe(
			'/tmp/a11y/report.json.worker-0.json',
		);
	});

	it('appends correct index for worker 3', () => {
		expect(workerShardPath('/tmp/a11y/report.json', 3)).toBe(
			'/tmp/a11y/report.json.worker-3.json',
		);
	});

	it('different worker indices produce different paths', () => {
		const base = '/tmp/report.json';
		expect(workerShardPath(base, 0)).not.toBe(workerShardPath(base, 1));
	});

	it('preserves the base path prefix unchanged', () => {
		const base = '/some/nested/path/a11y-report.json';
		const shard = workerShardPath(base, 2);
		expect(shard.startsWith(base)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// AC1 — mergeA11yShards: post-run merge combines all worker shards
// ---------------------------------------------------------------------------

function makeMinimalScan(
	overrides: Partial<AxePolicyScan> = {},
): AxePolicyScan {
	return {
		testId: 'test > id',
		route: '/',
		counts: { critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0 },
		criticalViolations: [],
		seriousViolations: [],
		moderateViolations: [],
		minorViolations: [],
		unknownViolations: [],
		expiredKnownViolations: [],
		...overrides,
	};
}

function makeMinimalReport(scans: AxePolicyScan[]): AxePolicyReport {
	return {
		version: 1,
		generatedAt: new Date().toISOString(),
		scans,
		violations: [],
		counts: { critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0 },
		expiredKnownViolations: [],
	};
}

let tmpDir: string;
beforeEach(async () => {
	tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'a11y-harness-test-'));
});
afterEach(async () => {
	await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('mergeA11yShards', () => {
	it('does nothing when no shard files exist', async () => {
		const outputPath = path.join(tmpDir, 'report.json');
		await mergeA11yShards(outputPath);
		// Output file should NOT be created (nothing to merge).
		await expect(fs.access(outputPath)).rejects.toThrow();
	});

	it('merges two worker shards into the output file', async () => {
		const outputPath = path.join(tmpDir, 'report.json');
		const scan0 = makeMinimalScan({ testId: 'worker-0-test', route: '/a' });
		const scan1 = makeMinimalScan({ testId: 'worker-1-test', route: '/b' });

		await fs.writeFile(
			workerShardPath(outputPath, 0),
			JSON.stringify(makeMinimalReport([scan0])),
			'utf8',
		);
		await fs.writeFile(
			workerShardPath(outputPath, 1),
			JSON.stringify(makeMinimalReport([scan1])),
			'utf8',
		);

		await mergeA11yShards(outputPath);

		const merged = JSON.parse(await fs.readFile(outputPath, 'utf8')) as AxePolicyReport;
		expect(merged.scans).toHaveLength(2);
		expect(merged.scans.map((s) => s.testId)).toContain('worker-0-test');
		expect(merged.scans.map((s) => s.testId)).toContain('worker-1-test');
	});

	it('merged counts reflect violations from all shards', async () => {
		const outputPath = path.join(tmpDir, 'report.json');

		const criticalViolation = {
			fingerprint: 'color-contrast::/:/button.cta',
			id: 'color-contrast',
			impact: 'critical' as const,
			route: '/',
			selector: 'button.cta',
			help: 'Elements must meet color contrast ratio thresholds',
			helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/color-contrast',
			known: false,
		};
		const scan0 = makeMinimalScan({
			counts: { critical: 1, serious: 0, moderate: 0, minor: 0, unknown: 0 },
			criticalViolations: [criticalViolation],
		});
		const shard0 = makeMinimalReport([scan0]);
		shard0.violations = [criticalViolation];
		shard0.counts.critical = 1;

		await fs.writeFile(
			workerShardPath(outputPath, 0),
			JSON.stringify(shard0),
			'utf8',
		);
		await fs.writeFile(
			workerShardPath(outputPath, 1),
			JSON.stringify(makeMinimalReport([])),
			'utf8',
		);

		await mergeA11yShards(outputPath);

		const merged = JSON.parse(await fs.readFile(outputPath, 'utf8')) as AxePolicyReport;
		// The merged report recomputes counts from all scans' violations arrays.
		expect(merged.counts.critical).toBe(1);
	});

	it('gracefully skips unreadable shard files', async () => {
		const outputPath = path.join(tmpDir, 'report.json');

		// Write a valid shard for worker 0.
		await fs.writeFile(
			workerShardPath(outputPath, 0),
			JSON.stringify(makeMinimalReport([makeMinimalScan({ testId: 'good-scan' })])),
			'utf8',
		);
		// Write corrupt JSON for worker 1.
		await fs.writeFile(workerShardPath(outputPath, 1), '{corrupt', 'utf8');

		await mergeA11yShards(outputPath);

		const merged = JSON.parse(await fs.readFile(outputPath, 'utf8')) as AxePolicyReport;
		// Only the valid shard's scan should appear.
		expect(merged.scans).toHaveLength(1);
		expect(merged.scans[0]?.testId).toBe('good-scan');
	});

	it('does not merge unrelated files in the output directory', async () => {
		const outputPath = path.join(tmpDir, 'report.json');

		// Write a valid shard.
		await fs.writeFile(
			workerShardPath(outputPath, 0),
			JSON.stringify(makeMinimalReport([makeMinimalScan({ testId: 'real-scan' })])),
			'utf8',
		);
		// Write an unrelated file with a similar name.
		await fs.writeFile(path.join(tmpDir, 'report.json.backup'), '{}', 'utf8');
		await fs.writeFile(path.join(tmpDir, 'other-report.json.worker-0.json'), '{}', 'utf8');

		await mergeA11yShards(outputPath);

		const merged = JSON.parse(await fs.readFile(outputPath, 'utf8')) as AxePolicyReport;
		expect(merged.scans).toHaveLength(1);
	});
});
