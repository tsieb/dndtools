import { describe, expect, it } from 'vitest';
import {
	BUNDLE_BUDGETS,
	CORE_BUNDLE_SIZE_BUDGET_ID,
	SESSION_MEMORY_FOOTPRINT_BUDGET_ID,
	analyzeBundleComposition,
	analyzeMemoryFootprint,
	detectUnboundedMemoryGrowth,
	invalidBundleBudgetIds,
	measureCoreBundleSize,
	validateBudgetRegistry,
	type FeatureBundleEntry,
	type MemorySnapshot,
} from '../src/index';

const TODAY = '2026-06-05';

// A representative feature catalog. The AI/MCP subsystem is LAZY + off-by-default (composing MCP-001).
const FEATURES: FeatureBundleEntry[] = [
	{ id: 'scene-shell', label: 'Scene shell', loadStrategy: 'core', enabledByDefault: true },
	{ id: 'ai-mcp', label: 'AI / MCP subsystem', loadStrategy: 'lazy', enabledByDefault: false },
	{ id: 'audio-mixer', label: 'Audio mixer', loadStrategy: 'lazy', enabledByDefault: true },
	{
		id: 'mcp-sidecar-ui',
		label: 'MCP sidecar UI',
		loadStrategy: 'excluded',
		enabledByDefault: false,
		outOfScopeForProfiles: ['web', 'mobile'],
	},
];

describe('PERF-005 bundle/memory budgets — declared in the shared registry', () => {
	it('declares a core-bundle-size and a session-memory budget with positive byte targets', () => {
		const ids = new Set(BUNDLE_BUDGETS.map((b) => b.id));
		expect(ids.has(CORE_BUNDLE_SIZE_BUDGET_ID)).toBe(true);
		expect(ids.has(SESSION_MEMORY_FOOTPRINT_BUDGET_ID)).toBe(true);
		expect(invalidBundleBudgetIds()).toEqual([]);
	});

	it('the bundle budgets pass the canonical registry validator (owned + fully qualified)', () => {
		expect(validateBudgetRegistry({ budgets: BUNDLE_BUDGETS, today: TODAY })).toEqual([]);
	});
});

describe('PERF-005 AC1 — path-aware gate: disabled/out-of-scope code must not ship in the core bundle', () => {
	it('a well-formed catalog (AI/MCP lazy + off-by-default) has no breaches on web', () => {
		expect(analyzeBundleComposition(FEATURES, 'web')).toEqual([]);
	});

	it('an OFF-BY-DEFAULT feature placed in the CORE bundle is a breach (everyone pays its cost)', () => {
		const bad: FeatureBundleEntry[] = [
			{ id: 'ai-mcp', label: 'AI / MCP subsystem', loadStrategy: 'core', enabledByDefault: false },
		];
		const problems = analyzeBundleComposition(bad, 'web');
		expect(problems.map((p) => p.kind)).toContain('off-by-default-in-core');
		expect(problems[0]?.message).toContain('off by default');
	});

	it('a feature DISABLED for the analyzed profile but shipped in core is a breach', () => {
		const bad: FeatureBundleEntry[] = [
			{
				id: 'map-editor',
				label: 'Map editor',
				loadStrategy: 'core',
				enabledByDefault: true,
				disabledForProfiles: ['mobile'],
			},
		];
		expect(analyzeBundleComposition(bad, 'mobile').map((p) => p.kind)).toContain(
			'disabled-feature-in-core',
		);
		// On desktop (where it is NOT disabled) an enabled core feature is fine.
		expect(analyzeBundleComposition(bad, 'desktop')).toEqual([]);
	});

	it('an OUT-OF-SCOPE feature that is merely lazy (still shipped) rather than excluded is a breach', () => {
		const bad: FeatureBundleEntry[] = [
			{
				id: 'mcp-sidecar-ui',
				label: 'MCP sidecar UI',
				loadStrategy: 'lazy',
				enabledByDefault: false,
				outOfScopeForProfiles: ['web'],
			},
		];
		const kinds = analyzeBundleComposition(bad, 'web').map((p) => p.kind);
		expect(kinds).toContain('out-of-scope-not-excluded');
	});

	it('an EXCLUDED out-of-scope feature ships zero bytes and is not a breach', () => {
		expect(analyzeBundleComposition(FEATURES, 'web').filter((p) => p.featureId === 'mcp-sidecar-ui')).toEqual(
			[],
		);
	});

	it('is deterministic — identical catalog + profile yields identical problems', () => {
		const a = analyzeBundleComposition(FEATURES, 'mobile');
		const b = analyzeBundleComposition([...FEATURES], 'mobile');
		expect(a).toEqual(b);
	});
});

describe('PERF-005 measureCoreBundleSize — fail closed against the core-bundle budget', () => {
	it('a bundle under the ceiling PASSES', () => {
		const m = measureCoreBundleSize(1_000_000);
		expect(m.result).toBe('pass');
		expect(m.budget?.id).toBe(CORE_BUNDLE_SIZE_BUDGET_ID);
	});

	it('EXACTLY at the ceiling PASSES (inclusive)', () => {
		const m = measureCoreBundleSize(1_500_000);
		expect(m.result).toBe('pass');
		expect(m.marginToTarget).toBe(0);
	});

	it('an OVERSIZED bundle is a BREACH (PERF-005 adversarial edge)', () => {
		const m = measureCoreBundleSize(3_000_000);
		expect(m.result).toBe('breach');
		expect(m.observedValue).toBe(3_000_000);
	});

	it('an UNMEASURED bundle (null size) is UNKNOWN, never a confident pass (fail closed)', () => {
		const m = measureCoreBundleSize(null);
		expect(m.result).toBe('unknown');
		expect(m.observedValue).toBeNull();
	});
});

describe('PERF-005 AC2 — memory footprint reports the major retained categories on breach', () => {
	const overBudget: MemorySnapshot = {
		totalRetainedBytes: 700 * 1024 * 1024, // > 512 MiB ceiling
		categories: [
			{ category: 'Search index', retainedBytes: 300 * 1024 * 1024 },
			{ category: 'Scene state', retainedBytes: 100 * 1024 * 1024 },
			{ category: 'Op-log', retainedBytes: 250 * 1024 * 1024 },
		],
	};

	it('an over-budget snapshot is a BREACH and reports categories biggest-first', () => {
		const analysis = analyzeMemoryFootprint(overBudget);
		expect(analysis.measurement.result).toBe('breach');
		expect(analysis.topCategories.map((c) => c.category)).toEqual([
			'Search index',
			'Op-log',
			'Scene state',
		]);
	});

	it('caps the reported categories to maxCategories', () => {
		const analysis = analyzeMemoryFootprint(overBudget, { maxCategories: 1 });
		expect(analysis.topCategories.map((c) => c.category)).toEqual(['Search index']);
	});

	it('a within-budget snapshot PASSES (categories still reported for diagnostics)', () => {
		const ok: MemorySnapshot = {
			totalRetainedBytes: 100 * 1024 * 1024,
			categories: [{ category: 'Scene state', retainedBytes: 50 * 1024 * 1024 }],
		};
		const analysis = analyzeMemoryFootprint(ok);
		expect(analysis.measurement.result).toBe('pass');
		expect(analysis.topCategories).toHaveLength(1);
	});

	it('a non-finite/negative total is UNKNOWN (fail closed)', () => {
		const bad: MemorySnapshot = { totalRetainedBytes: -1, categories: [] };
		expect(analyzeMemoryFootprint(bad).measurement.result).toBe('unknown');
	});

	it('ties between categories break by name for a deterministic order', () => {
		const tied: MemorySnapshot = {
			totalRetainedBytes: 10,
			categories: [
				{ category: 'Zeta', retainedBytes: 5 },
				{ category: 'Alpha', retainedBytes: 5 },
			],
		};
		expect(analyzeMemoryFootprint(tied).topCategories.map((c) => c.category)).toEqual(['Alpha', 'Zeta']);
	});
});

describe('PERF-005 AC2 — unbounded memory growth detection (a cache that never evicts is a breach)', () => {
	const bound = 10 * 1024 * 1024; // a category may grow at most 10 MiB net before it is a finding.

	it('a MONOTONICALLY growing category past the bound is a BREACH finding (adversarial edge)', () => {
		const snapshots: MemorySnapshot[] = [
			{ totalRetainedBytes: 0, categories: [{ category: 'Search index', retainedBytes: 10 * 1024 * 1024 }] },
			{ totalRetainedBytes: 0, categories: [{ category: 'Search index', retainedBytes: 40 * 1024 * 1024 }] },
			{ totalRetainedBytes: 0, categories: [{ category: 'Search index', retainedBytes: 80 * 1024 * 1024 }] },
		];
		const findings = detectUnboundedMemoryGrowth(snapshots, bound);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.category).toBe('Search index');
		expect(findings[0]?.growthBytes).toBe(70 * 1024 * 1024);
	});

	it('a BOUNDED cache (it dips at some point — proof of eviction) is NOT a finding', () => {
		const snapshots: MemorySnapshot[] = [
			{ totalRetainedBytes: 0, categories: [{ category: 'Tile cache', retainedBytes: 10 * 1024 * 1024 }] },
			{ totalRetainedBytes: 0, categories: [{ category: 'Tile cache', retainedBytes: 80 * 1024 * 1024 }] },
			{ totalRetainedBytes: 0, categories: [{ category: 'Tile cache', retainedBytes: 30 * 1024 * 1024 }] }, // evicted
		];
		expect(detectUnboundedMemoryGrowth(snapshots, bound)).toEqual([]);
	});

	it('growth WITHIN the bound is not a finding', () => {
		const snapshots: MemorySnapshot[] = [
			{ totalRetainedBytes: 0, categories: [{ category: 'X', retainedBytes: 1 }] },
			{ totalRetainedBytes: 0, categories: [{ category: 'X', retainedBytes: 2 }] },
		];
		expect(detectUnboundedMemoryGrowth(snapshots, bound)).toEqual([]);
	});

	it('a category released by the last snapshot is not a finding (it was freed)', () => {
		const snapshots: MemorySnapshot[] = [
			{ totalRetainedBytes: 0, categories: [{ category: 'Temp', retainedBytes: 100 * 1024 * 1024 }] },
			{ totalRetainedBytes: 0, categories: [] },
		];
		expect(detectUnboundedMemoryGrowth(snapshots, bound)).toEqual([]);
	});

	it('fewer than two snapshots is "no growth observed" (empty — not a confident pass)', () => {
		expect(detectUnboundedMemoryGrowth([], bound)).toEqual([]);
		expect(
			detectUnboundedMemoryGrowth(
				[{ totalRetainedBytes: 0, categories: [{ category: 'X', retainedBytes: 1 }] }],
				bound,
			),
		).toEqual([]);
	});

	it('is deterministic and sorts findings by net growth descending', () => {
		const snapshots: MemorySnapshot[] = [
			{
				totalRetainedBytes: 0,
				categories: [
					{ category: 'Small leak', retainedBytes: 0 },
					{ category: 'Big leak', retainedBytes: 0 },
				],
			},
			{
				totalRetainedBytes: 0,
				categories: [
					{ category: 'Small leak', retainedBytes: 20 * 1024 * 1024 },
					{ category: 'Big leak', retainedBytes: 100 * 1024 * 1024 },
				],
			},
		];
		const findings = detectUnboundedMemoryGrowth(snapshots, bound);
		expect(findings.map((f) => f.category)).toEqual(['Big leak', 'Small leak']);
	});
});
