/**
 * PERF-005 — BUNDLE + MEMORY BUDGETS with PATH-AWARE GATES (Vision lean CI; Feature Inventory I21
 * bundle/build performance). This is the BUNDLES + MEMORY half of the "bundles, memory, and AI/MCP
 * isolation" capability branch. It COMPOSES the PERF-001 budget registry + PERF-007 measurement
 * ({@link ./budget-registry}, {@link ./measurement}) rather than inventing a parallel sizing system:
 * a bundle-size budget and a memory-footprint budget are BOTH declared as ordinary
 * {@link PerformanceBudget}s (a `duration-ms` budget repurposed as a "bytes" ceiling — see
 * {@link BUNDLE_BUDGETS}), and observed sizes/footprints are graded by the SAME deterministic
 * {@link measureBudget}. There is exactly one measurement API in the codebase.
 *
 * It adds the two things PERF-005 needs ON TOP of generic sizing:
 *
 *   1. PATH-AWARE GATES (AC1). A platform feature is owned by a LOAD STRATEGY:
 *      `core` (always in the core bundle), `lazy` (split into a route/feature chunk loaded on demand),
 *      or `excluded` (built out entirely for a tier/platform that does not ship it). When a feature is
 *      disabled-by-tier or out-of-scope-for-platform, it MUST be `lazy` or `excluded` — shipping it in
 *      the `core` bundle is a BREACH ({@link analyzeBundleComposition}). This is the executable form of
 *      "unnecessary code is lazy-loaded or excluded where feasible": the AI/MCP subsystem in particular
 *      is declared `lazy` and OFF the core bundle (composing the MCP-001 default-off optionality), so a
 *      vault with MCP disabled (the default) pays ZERO core-bundle cost for it.
 *
 *   2. MEMORY DIAGNOSTICS (AC2). When a measured memory footprint EXCEEDS its budget, the diagnostic
 *      reports the MAJOR RETAINED OBJECT CATEGORIES sorted by retained bytes ({@link analyzeMemoryFootprint}),
 *      so a breach names WHERE the memory went, not just THAT it is over. It also flags UNBOUNDED GROWTH
 *      across a session: a category whose retained bytes grow monotonically past a bound is a breach even
 *      if a single snapshot is under budget (a cache that never evicts).
 *
 * FAIL CLOSED, EVERYWHERE. An unmeasured bundle/memory budget is `unknown` (un-proven), never a
 * confident pass — it inherits this directly from {@link measureBudget}. An oversized bundle is a
 * breach. Unbounded memory growth is a breach. A disabled feature shipped in the core bundle is a
 * breach. A budget id no registry owns is an `error`.
 *
 * Pure + deterministic: every size/footprint/snapshot is an EXPLICIT input. No DOM, no Node, no bundler
 * introspection, no `process.memoryUsage`, no clock, no entropy. Per ADR-014 the live build-stats and
 * heap-snapshot CAPTURE is deferred (the bundler/runtime feeds real numbers in later); this owns the
 * declared budgets + the deterministic gate that grades them, exactly as {@link measureBudget} takes
 * sample timings as explicit inputs.
 */

import type { PlatformProfileId } from '../state/widget-package-state';
import {
	type BudgetMetric,
	type PerformanceBudget,
} from './budget-registry';
import {
	measureBudget,
	type BudgetMeasurement,
} from './measurement';

// ---------------------------------------------------------------------------------------------------
// Bundle + memory budgets, declared in the SAME shape as every other PERF budget.
// ---------------------------------------------------------------------------------------------------

/**
 * The registry id of the CORE app bundle's size budget — the JS that must load before the shell is
 * interactive. A feature that is disabled-by-tier or out-of-scope must NOT inflate this (it is the
 * core-bundle gate's reference budget). Kept as a const so the registry, the gate, and tests share one
 * source of truth.
 */
export const CORE_BUNDLE_SIZE_BUDGET_ID = 'core-bundle-size' as const;

/** The registry id of the long-session retained-memory footprint budget (PERF-005 AC2). */
export const SESSION_MEMORY_FOOTPRINT_BUDGET_ID = 'session-memory-footprint' as const;

/**
 * The bundle + memory budgets, declared as ordinary {@link PerformanceBudget}s so they grade through
 * the SAME {@link measureBudget}. Both use the `duration-ms` metric KIND (a one-shot, lower-is-better
 * ceiling graded against the WORST observed value) with a `bytes` UNIT — a size/footprint is a
 * one-shot worst-case ceiling exactly like a one-shot duration, so the existing single-sample grading
 * fits without a new metric kind. Provisional per ADR-014 (no measured baseline yet), so each declares
 * dataset, device class, and a review date — never the ambiguous "fast enough".
 */
export const BUNDLE_BUDGETS: readonly PerformanceBudget[] = [
	{
		id: CORE_BUNDLE_SIZE_BUDGET_ID,
		workflow: 'Core app bundle size',
		owner: 'Platform',
		userFacingRisk:
			'A bloated core bundle delays first interactivity, especially on slim devices and slow links.',
		dataset: 'Production build of the core shell (excludes lazy route/feature chunks)',
		deviceClass: 'Desktop and slim reference profiles',
		// 1.5 MiB minified+gzipped core-bundle ceiling — a provisional lean target for the shell path.
		metric: { kind: 'duration-ms', direction: 'lower-is-better', target: 1_500_000, unit: 'bytes' },
		maturity: { kind: 'provisional', reviewDate: '2026-12-31' },
	},
	{
		id: SESSION_MEMORY_FOOTPRINT_BUDGET_ID,
		workflow: 'Long-session retained memory',
		owner: 'Platform',
		userFacingRisk:
			'Unbounded memory growth across a long session degrades the app and can crash a slim device.',
		dataset: 'A multi-hour session over a 1,000-note / 100-object / 20-map vault',
		deviceClass: 'Desktop and slim reference profiles',
		// 512 MiB retained-heap ceiling for a long session on the reference vault.
		metric: { kind: 'duration-ms', direction: 'lower-is-better', target: 512 * 1024 * 1024, unit: 'bytes' },
		maturity: { kind: 'provisional', reviewDate: '2026-12-31' },
	},
];

// ---------------------------------------------------------------------------------------------------
// PATH-AWARE GATE (PERF-005 AC1): a feature's load strategy + the core-bundle composition check.
// ---------------------------------------------------------------------------------------------------

/**
 * How a platform feature reaches the user:
 *
 *   - `core`     — always built into the core bundle; loads before the shell is interactive. Reserve
 *     this for the always-on critical path (the Scene shell, command dispatch, the actor-filtered
 *     query surfaces). A feature that is sometimes disabled must NOT be `core`.
 *   - `lazy`     — split into a separate route/feature chunk loaded on demand. The default for an
 *     optional, tier-gated, or rarely-used subsystem (the AI/MCP surface, audio mixing, the map editor).
 *     Its bytes do not count against the core-bundle budget.
 *   - `excluded` — built OUT entirely for a tier/platform that does not ship it (e.g. the MCP sidecar
 *     UI on a web profile that has no sidecar). Ships zero bytes.
 */
export type FeatureLoadStrategy = 'core' | 'lazy' | 'excluded';

/**
 * ONE platform feature's bundle ownership. `enabledByDefault` and the `disabledForProfiles` /
 * `outOfScopeForProfiles` sets describe WHEN the feature is inactive; `loadStrategy` describes HOW it
 * is bundled. The gate cross-checks the two: a feature that is inactive for the analyzed profile MUST
 * be `lazy` or `excluded`, never `core`.
 */
export interface FeatureBundleEntry {
	/** Stable feature id (e.g. `ai-mcp`, `audio-mixer`, `map-editor`, `scene-shell`). Non-empty. */
	readonly id: string;
	/** Human-facing label for diagnostics. Non-empty. */
	readonly label: string;
	/** How the feature is bundled (AC1). */
	readonly loadStrategy: FeatureLoadStrategy;
	/** Whether the feature is on by default in a fresh vault. An off-by-default feature must not be `core`. */
	readonly enabledByDefault: boolean;
	/** Profiles for which this feature is disabled-by-tier (it must be `lazy`/`excluded` there). */
	readonly disabledForProfiles?: readonly PlatformProfileId[];
	/** Profiles for which this feature is structurally out of scope (it should be `excluded` there). */
	readonly outOfScopeForProfiles?: readonly PlatformProfileId[];
}

/** Why a feature's bundle placement is a breach of the path-aware gate (PERF-005 AC1). */
export type BundleCompositionProblemKind =
	/** A feature that is disabled/out-of-scope for the profile is in the CORE bundle (must be lazy/excluded). */
	| 'disabled-feature-in-core'
	/** A feature that is OFF BY DEFAULT is in the CORE bundle (an off-by-default cost is paid by everyone). */
	| 'off-by-default-in-core'
	/** A feature out of scope for the profile is bundled (lazy) rather than EXCLUDED (ships dead bytes). */
	| 'out-of-scope-not-excluded';

export interface BundleCompositionProblem {
	readonly featureId: string;
	readonly kind: BundleCompositionProblemKind;
	readonly message: string;
}

/**
 * PERF-005 AC1 — analyze how features are bundled FOR A GIVEN PROFILE and return every path-aware gate
 * breach, FAILING CLOSED. A feature is "inactive" for the profile when it is off-by-default, disabled
 * for the profile, or out of scope for the profile. The rules:
 *
 *   - An INACTIVE feature in the `core` bundle is a breach (`disabled-feature-in-core` /
 *     `off-by-default-in-core`) — it must be lazy-loaded or excluded so users who never use it pay no
 *     core-bundle cost. This is the executable form of "unnecessary code is lazy-loaded or excluded".
 *   - A feature OUT OF SCOPE for the profile that is merely `lazy` (still shipped) rather than
 *     `excluded` is a breach (`out-of-scope-not-excluded`) — out-of-scope code should ship ZERO bytes.
 *
 * Returns every problem found, in feature order, so a report names all of them. Deterministic — the
 * profile and entries are explicit inputs. An entry with NO breach (an active `core` feature, or any
 * `lazy`/`excluded` feature that is allowed) contributes nothing.
 */
export function analyzeBundleComposition(
	entries: readonly FeatureBundleEntry[],
	profile: PlatformProfileId,
): BundleCompositionProblem[] {
	const problems: BundleCompositionProblem[] = [];

	for (const entry of entries) {
		const disabledForProfile = entry.disabledForProfiles?.includes(profile) ?? false;
		const outOfScopeForProfile = entry.outOfScopeForProfiles?.includes(profile) ?? false;
		const inactive = !entry.enabledByDefault || disabledForProfile || outOfScopeForProfile;

		// An out-of-scope feature should be EXCLUDED, not merely lazy: a lazy chunk still ships its bytes.
		if (outOfScopeForProfile && entry.loadStrategy === 'lazy') {
			problems.push({
				featureId: entry.id,
				kind: 'out-of-scope-not-excluded',
				message: `Feature "${entry.id}" (${entry.label}) is out of scope for the ${profile} profile but is bundled (lazy) rather than excluded; it must ship zero bytes (PERF-005 AC1).`,
			});
		}

		// The central gate: an inactive feature must never be in the core bundle.
		if (inactive && entry.loadStrategy === 'core') {
			const kind: BundleCompositionProblemKind = !entry.enabledByDefault
				? 'off-by-default-in-core'
				: 'disabled-feature-in-core';
			const why = !entry.enabledByDefault
				? 'is off by default'
				: outOfScopeForProfile
					? `is out of scope for the ${profile} profile`
					: `is disabled for the ${profile} profile`;
			problems.push({
				featureId: entry.id,
				kind,
				message: `Feature "${entry.id}" (${entry.label}) ${why} but ships in the CORE bundle; it must be lazy-loaded or excluded so it does not inflate the core path (PERF-005 AC1).`,
			});
		}
	}

	return problems;
}

/**
 * Grade an observed CORE bundle SIZE (in bytes) against the {@link CORE_BUNDLE_SIZE_BUDGET_ID} budget,
 * fail closed. A `null`/empty observation is `unknown` (un-proven), an oversized bundle is a `breach`,
 * exactly-at-ceiling passes. This is just {@link measureBudget} specialized to the core-bundle budget,
 * so the size grading is the SAME deterministic path as every other PERF measurement.
 *
 * `budgets` defaults to the canonical bundle budgets; pass a custom set to grade against a test budget.
 */
export function measureCoreBundleSize(
	sizeBytes: number | null,
	budgets: readonly PerformanceBudget[] = BUNDLE_BUDGETS,
): BudgetMeasurement {
	return measureBudget(
		CORE_BUNDLE_SIZE_BUDGET_ID,
		sizeBytes === null ? [] : [sizeBytes],
		budgets,
	);
}

// ---------------------------------------------------------------------------------------------------
// MEMORY DIAGNOSTICS (PERF-005 AC2): retained-category reporting + unbounded-growth detection.
// ---------------------------------------------------------------------------------------------------

/**
 * ONE retained-memory category in a heap snapshot — a major object category and how many bytes it
 * retains. Categories are coarse and STABLE (e.g. "Scene state", "Search index", "MCP staged
 * proposals", "Op-log"), so a breach report points at WHERE memory went without exposing any content
 * (a category label is metadata, never a note body or a hidden title — see PERF-009).
 */
export interface MemoryCategory {
	/** A coarse, stable category label (e.g. "Search index"). Carries no vault content. Non-empty. */
	readonly category: string;
	/** Retained bytes for the category in this snapshot. Non-negative. */
	readonly retainedBytes: number;
}

/** A single heap snapshot: its total retained bytes + the per-category breakdown. */
export interface MemorySnapshot {
	/** Total retained heap bytes at this snapshot. */
	readonly totalRetainedBytes: number;
	/** The major retained-object categories. The total need not equal their sum (uncategorized remainder). */
	readonly categories: readonly MemoryCategory[];
}

/**
 * The result of analyzing a memory footprint against its budget. It carries the {@link BudgetMeasurement}
 * verdict (pass / breach / unknown / error) PLUS, on a breach (or always, for diagnostics), the major
 * retained categories SORTED by retained bytes descending so the report names the biggest retainers
 * first (PERF-005 AC2). `topCategories` is empty when the snapshot has no categories.
 */
export interface MemoryFootprintAnalysis {
	readonly measurement: BudgetMeasurement;
	/** Major retained categories sorted by retained bytes (desc), ties broken by category name (asc). */
	readonly topCategories: readonly MemoryCategory[];
}

/** Sort categories by retained bytes (desc), breaking ties by name (asc) so the order is deterministic. */
function sortByRetainedBytes(categories: readonly MemoryCategory[]): MemoryCategory[] {
	return [...categories].sort((a, b) => {
		if (b.retainedBytes !== a.retainedBytes) return b.retainedBytes - a.retainedBytes;
		return a.category.localeCompare(b.category);
	});
}

/**
 * PERF-005 AC2 — analyze a memory SNAPSHOT against the {@link SESSION_MEMORY_FOOTPRINT_BUDGET_ID}
 * budget and, when it exceeds budget, report the MAJOR RETAINED OBJECT CATEGORIES sorted biggest-first.
 * Fail closed: a snapshot with a non-finite/negative total grades to `unknown` (un-proven), an
 * over-budget total is a `breach`, exactly-at-ceiling passes — inherited from {@link measureBudget}.
 *
 * The categories are ALWAYS sorted and returned (capped to `maxCategories`, default all) so a
 * diagnostic can show the breakdown whether or not the budget breached; the requirement only MANDATES
 * the breakdown on a breach, but reporting it always is strictly more useful and equally cheap.
 * Deterministic — the snapshot is an explicit input.
 */
export function analyzeMemoryFootprint(
	snapshot: MemorySnapshot,
	options?: { budgets?: readonly PerformanceBudget[]; maxCategories?: number },
): MemoryFootprintAnalysis {
	const budgets = options?.budgets ?? BUNDLE_BUDGETS;
	const measurement = measureBudget(
		SESSION_MEMORY_FOOTPRINT_BUDGET_ID,
		[snapshot.totalRetainedBytes],
		budgets,
	);
	const sorted = sortByRetainedBytes(snapshot.categories);
	const topCategories =
		options?.maxCategories !== undefined ? sorted.slice(0, Math.max(0, options.maxCategories)) : sorted;
	return { measurement, topCategories };
}

/** A category whose retained bytes grow monotonically and exceed the growth bound across a session. */
export interface UnboundedGrowthFinding {
	readonly category: string;
	/** Retained bytes in the FIRST snapshot. */
	readonly firstRetainedBytes: number;
	/** Retained bytes in the LAST snapshot. */
	readonly lastRetainedBytes: number;
	/** The net growth (last − first), which exceeded the bound. Positive. */
	readonly growthBytes: number;
}

/**
 * PERF-005 AC2 — detect UNBOUNDED MEMORY GROWTH across an ordered series of session snapshots, FAILING
 * CLOSED. A bounded cache settles: its retained bytes rise then PLATEAU or fall. An unbounded cache
 * (one that never evicts) grows MONOTONICALLY. A category is a finding when, across the series, it
 *
 *   - is present in the FIRST and LAST snapshot,
 *   - NEVER decreases between consecutive snapshots (monotonic non-decreasing — a real eviction would
 *     show a dip), AND
 *   - grows by MORE than `growthBoundBytes` net from first to last.
 *
 * A category that dips at any point (it evicted) is NOT a finding even if it nets positive — eviction
 * is the proof it is bounded. Requires at least two snapshots; fewer is "no growth observed" (returns
 * empty — there is nothing to compare, not a confident pass). Returns findings sorted by net growth
 * descending. Deterministic — the snapshots and the bound are explicit inputs.
 */
export function detectUnboundedMemoryGrowth(
	snapshots: readonly MemorySnapshot[],
	growthBoundBytes: number,
): UnboundedGrowthFinding[] {
	if (snapshots.length < 2) return [];

	const first = snapshots[0]!;
	const last = snapshots[snapshots.length - 1]!;
	const firstByCategory = new Map(first.categories.map((c) => [c.category, c.retainedBytes]));
	const lastByCategory = new Map(last.categories.map((c) => [c.category, c.retainedBytes]));

	const findings: UnboundedGrowthFinding[] = [];

	for (const [category, firstBytes] of firstByCategory) {
		const lastBytes = lastByCategory.get(category);
		if (lastBytes === undefined) continue; // gone by the last snapshot — it was released, not unbounded.

		// Walk consecutive snapshots: a single DECREASE proves the category evicts, so it is bounded.
		let monotonicNonDecreasing = true;
		let previous = firstBytes;
		for (let i = 1; i < snapshots.length; i += 1) {
			const current = byCategory(snapshots[i]!, category);
			if (current === null) {
				// The category vanished mid-series and reappeared — treat the gap as a release (bounded).
				monotonicNonDecreasing = false;
				break;
			}
			if (current < previous) {
				monotonicNonDecreasing = false;
				break;
			}
			previous = current;
		}

		const growthBytes = lastBytes - firstBytes;
		if (monotonicNonDecreasing && growthBytes > growthBoundBytes) {
			findings.push({
				category,
				firstRetainedBytes: firstBytes,
				lastRetainedBytes: lastBytes,
				growthBytes,
			});
		}
	}

	return findings.sort((a, b) => {
		if (b.growthBytes !== a.growthBytes) return b.growthBytes - a.growthBytes;
		return a.category.localeCompare(b.category);
	});
}

/** Retained bytes for a category in a snapshot, or `null` if the category is absent from it. */
function byCategory(snapshot: MemorySnapshot, category: string): number | null {
	const match = snapshot.categories.find((c) => c.category === category);
	return match ? match.retainedBytes : null;
}

/**
 * Validate the bundle/memory budgets share the registry's required shape. This is a thin wrapper so a
 * test (and a future gate runner) can assert the bundle budgets are well-formed without re-stating the
 * `BudgetMetric` rules — a bundle budget that is non-positive or zero-byte would be a configuration
 * error. Returns the ids that have an invalid (non-positive / non-finite) byte target.
 */
export function invalidBundleBudgetIds(
	budgets: readonly PerformanceBudget[] = BUNDLE_BUDGETS,
): string[] {
	return budgets
		.filter((b) => !isFiniteByteTarget(b.metric))
		.map((b) => b.id);
}

function isFiniteByteTarget(metric: BudgetMetric): boolean {
	return Number.isFinite(metric.target) && metric.target > 0;
}
