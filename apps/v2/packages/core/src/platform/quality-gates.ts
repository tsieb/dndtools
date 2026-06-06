/**
 * PLAT-010: the tiered, owned, time-bounded quality-gate registry.
 *
 * This is the DECLARED, structured source of truth for the repo's existing test/lint tiers
 * (critical / smoke / full / release). It does NOT rewrite the test runner — every tier maps
 * onto the package.json scripts that already exist (`test:critical`, `test:smoke`, `lint`,
 * `docs:validate`, `v2:check`, ...). What this module adds is the *contract* a release-quality
 * review needs and the repo previously lacked (defect `CLAUDE-INFRA-CI-GATES`):
 *
 *   - every gate has an OWNER, a REASON, and the user-facing DEFECT CLASS it protects (AC2);
 *   - every gate is bound to a configured TIME BUDGET that preserves developer feedback (AC3);
 *   - a path/tier rule SELECTS the relevant gate when a change touches platform code (AC1);
 *   - a REVIEW WINDOW lets quality review retire/narrow/re-justify a gate that stops earning
 *     its keep (AC4).
 *
 * The enforcement lives in `scripts/quality-gates.ts`, which fails CLOSED when a tier is
 * unowned, lacks a budget, references a missing package script, or exceeds its measured budget.
 * This module is pure (no DOM, no Node, no Svelte) so the registry and its validators are unit
 * testable in the core package.
 */

/** The gate tiers, fastest-feedback first. Mirrors the repo's existing critical→full→release. */
export type QualityGateTier = 'critical' | 'smoke' | 'full' | 'release';

/**
 * The user-facing defect class a gate exists to prevent. Every gate must name at least one so a
 * review can judge whether the gate still earns its place (AC2/AC4). Drawn from the v2 defect
 * register failure modes.
 */
export type DefectClass =
	| 'data-loss'
	| 'visibility-leak'
	| 'permission-bypass'
	| 'platform-regression'
	| 'accessibility-breakage'
	| 'boundary-violation'
	| 'planning-drift'
	| 'doc-count-drift';

/** A change-path matcher: a gate is selected for a change when one of its globs matches (AC1). */
export type PathGlob = string;

export interface QualityGate {
	readonly id: string;
	readonly tier: QualityGateTier;
	/** The package.json script the gate runs. Must exist, or enforcement fails closed. */
	readonly script: string;
	/** Accountable owner (team or role). Non-empty, or enforcement fails closed (AC2). */
	readonly owner: string;
	/** Why the gate exists. Non-empty (AC2). */
	readonly reason: string;
	/** User-facing defect classes this gate protects against. At least one (AC2). */
	readonly protects: readonly DefectClass[];
	/**
	 * Change paths that SELECT this gate. A change touching one of these globs must run this
	 * gate (AC1). Empty means the gate is unconditional for its tier (e.g. lint always runs).
	 */
	readonly selectsOnPaths: readonly PathGlob[];
	/**
	 * The last review date (ISO `YYYY-MM-DD`) confirming the gate still catches its defect
	 * class. A gate not reviewed within {@link REVIEW_WINDOW_DAYS} is flagged for re-justification
	 * (AC4).
	 */
	readonly lastReviewed: string;
}

export interface QualityGateTierBudget {
	readonly tier: QualityGateTier;
	/** Configured wall-clock budget in milliseconds. Exceeding it is a failure (AC3). */
	readonly budgetMs: number;
	/**
	 * An explicit, owned scope exception when a tier legitimately cannot meet the headline
	 * target (e.g. the three-minute smoke target). Null means no exception is claimed.
	 */
	readonly scopeException: string | null;
}

/** The headline smoke target from PLAT-010 AC3: the smoke path completes under three minutes. */
export const SMOKE_TARGET_MS = 3 * 60 * 1000;

/** A gate not reviewed within this many days is flagged for re-justification (AC4). */
export const REVIEW_WINDOW_DAYS = 180;

export const QUALITY_GATE_REGISTRY_VERSION = 1 as const;

/**
 * Configured per-tier time budgets. Critical and smoke are kept fast so the default developer
 * loop stays responsive; full/release trade speed for breadth and declare a scope exception.
 */
export const QUALITY_GATE_BUDGETS: readonly QualityGateTierBudget[] = [
	{ tier: 'critical', budgetMs: 60 * 1000, scopeException: null },
	{ tier: 'smoke', budgetMs: SMOKE_TARGET_MS, scopeException: null },
	{
		tier: 'full',
		budgetMs: 12 * 60 * 1000,
		scopeException:
			'Full suite runs the complete Vitest + boundary audit and intentionally exceeds the smoke target; it runs in CI / pre-release, not the inner dev loop.',
	},
	{
		tier: 'release',
		budgetMs: 20 * 60 * 1000,
		scopeException:
			'Release gate adds Playwright browser automation and platform support-status review; it is a pre-release gate, not a developer-feedback gate.',
	},
];

/**
 * The declared gate registry. Each entry maps a real package.json script to a tier, an owner, a
 * reason, the defect classes it protects, and the change paths that select it. The enforcing
 * script cross-checks every `script` against package.json and every `tier` against a budget.
 */
export const QUALITY_GATES: readonly QualityGate[] = [
	{
		id: 'v2-boundary-lint',
		tier: 'critical',
		script: 'v2:lint',
		owner: 'platform',
		reason:
			'Enforces the processing/display + v1-runtime + platform-primitive boundaries that the whole v2 architecture depends on.',
		protects: ['boundary-violation', 'visibility-leak'],
		selectsOnPaths: ['apps/v2/**'],
		lastReviewed: '2026-06-04',
	},
	{
		id: 'repo-boundary-audit',
		tier: 'critical',
		script: 'audit:repo',
		owner: 'platform',
		reason:
			'Keeps the repo boundary audit and CI guardrails wired so planning validation cannot be silently removed.',
		protects: ['boundary-violation', 'planning-drift'],
		selectsOnPaths: ['package.json', '.github/workflows/**', 'scripts/**', 'tests/unit/**'],
		lastReviewed: '2026-06-04',
	},
	{
		id: 'critical-tests',
		tier: 'critical',
		script: 'test:critical',
		owner: 'platform',
		reason:
			'Runs the storage adapter, session-state, navigation, and boundary tests that protect durable data and the IA contract on every change.',
		protects: ['data-loss', 'platform-regression'],
		selectsOnPaths: [],
		lastReviewed: '2026-06-04',
	},
	{
		id: 'smoke',
		tier: 'smoke',
		script: 'test:smoke',
		owner: 'platform',
		reason:
			'Parallel format + lint + typecheck + critical-tests pre-push smoke gate; the fast confidence signal before a push.',
		protects: ['platform-regression', 'accessibility-breakage'],
		selectsOnPaths: [],
		lastReviewed: '2026-06-04',
	},
	{
		id: 'v2-check',
		tier: 'full',
		script: 'v2:check',
		owner: 'platform',
		reason:
			'Full v2 gate: workpack validation + boundary lint + typecheck + the complete v2 unit suite.',
		protects: ['platform-regression', 'planning-drift', 'boundary-violation'],
		selectsOnPaths: ['apps/v2/**', 'docs/planning/v2/**'],
		lastReviewed: '2026-06-04',
	},
	{
		id: 'docs-validate',
		tier: 'full',
		script: 'docs:validate',
		owner: 'platform',
		reason:
			'Validates doc path references, schema-version sync, generated structure/count audits, and the v2 workpack — the generated-from-structured-sources contract (PLAT-015).',
		protects: ['doc-count-drift', 'planning-drift'],
		selectsOnPaths: ['docs/**', 'mcp/migrations.ts'],
		lastReviewed: '2026-06-04',
	},
	{
		id: 'v2-e2e',
		tier: 'release',
		script: 'v2:e2e',
		owner: 'platform',
		reason:
			'Playwright browser automation for visible v2 flows (Scene create/reload, navigation, platform profiles, onboarding) before a release.',
		protects: ['platform-regression', 'accessibility-breakage', 'visibility-leak'],
		selectsOnPaths: ['apps/v2/app/**'],
		lastReviewed: '2026-06-04',
	},
];

const BUDGET_BY_TIER: ReadonlyMap<QualityGateTier, QualityGateTierBudget> = new Map(
	QUALITY_GATE_BUDGETS.map((entry) => [entry.tier, entry]),
);

/** The budget for a tier, or `null` if the tier has no configured budget (a fail-closed signal). */
export function tierBudget(tier: QualityGateTier): QualityGateTierBudget | null {
	return BUDGET_BY_TIER.get(tier) ?? null;
}

const REGEX_SPECIAL = new Set('.+^${}()|[]\\'.split(''));

/**
 * Match one path against one glob. Supports `**` (any characters, including `/`, across
 * segments) and `*` (any characters within a single path segment). Used for the path/tier gate
 * selection (AC1).
 */
export function pathMatchesGlob(filePath: string, glob: PathGlob): boolean {
	const normalized = filePath.replace(/\\/g, '/');
	const source = glob.replace(/\\/g, '/');
	let pattern = '';
	for (let i = 0; i < source.length; i += 1) {
		const char = source[i]!;
		if (char === '*') {
			if (source[i + 1] === '*') {
				pattern += '.*'; // `**` → any characters across path segments
				i += 1;
			} else {
				pattern += '[^/]*'; // `*` → any characters within one segment
			}
		} else if (REGEX_SPECIAL.has(char)) {
			pattern += `\\${char}`;
		} else {
			pattern += char;
		}
	}
	return new RegExp(`^${pattern}$`).test(normalized);
}

/**
 * PLAT-010 AC1: select the gates a change must run, given the changed file paths. A gate is
 * selected when it is unconditional for its tier (`selectsOnPaths` empty) OR one of its globs
 * matches a changed path. Returned in registry order (fastest tier first).
 */
export function selectGatesForPaths(
	changedPaths: readonly string[],
	gates: readonly QualityGate[] = QUALITY_GATES,
): QualityGate[] {
	return gates.filter((gate) => {
		if (gate.selectsOnPaths.length === 0) return true;
		return gate.selectsOnPaths.some((glob) =>
			changedPaths.some((file) => pathMatchesGlob(file, glob)),
		);
	});
}

export type GateProblemKind =
	| 'missing-owner'
	| 'missing-reason'
	| 'no-defect-class'
	| 'unknown-script'
	| 'tier-without-budget'
	| 'budget-exceeded'
	| 'duplicate-id'
	| 'review-window-expired'
	| 'invalid-review-date'
	// PLAT-014 release block surfaced through the same gate runner (a Must-have command
	// unsupported on a profile without an allowed exception, or a missing reason/fallback).
	| 'support-status-violation'
	// CON-004 permission-sustainability block surfaced through the same gate runner (the
	// capability-set model drifted past its bound or offered an ungoverned/undocumented set).
	| 'permission-sustainability-violation'
	// CON-003 / CON-006 scope-boundary block surfaced through the same gate runner (a live registry
	// grew a new top-level platform/source/host-permission surface or an out-of-scope widget
	// distribution channel without an explicit scope/contract revision).
	| 'scope-constraint-violation';

export interface GateProblem {
	readonly gateId: string;
	readonly kind: GateProblemKind;
	readonly message: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function daysBetween(fromIso: string, toIso: string): number | null {
	const from = Date.parse(`${fromIso}T00:00:00Z`);
	const to = Date.parse(`${toIso}T00:00:00Z`);
	if (Number.isNaN(from) || Number.isNaN(to)) return null;
	return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

/**
 * Validate the gate registry against its structural contract: every gate is owned, justified,
 * names a defect class, references a known package script, and belongs to a tier that has a
 * configured budget; gate ids are unique; review dates are valid and within the review window
 * relative to `today`. Returns every problem so the enforcing script can fail closed (AC2/AC4).
 *
 * `availableScripts` is the set of package.json script names; an empty/undefined set skips the
 * script-existence check (used by pure unit tests that only assert the structural rules).
 */
export function validateGateRegistry(options: {
	gates?: readonly QualityGate[];
	budgets?: readonly QualityGateTierBudget[];
	availableScripts?: ReadonlySet<string>;
	today: string;
}): GateProblem[] {
	const gates = options.gates ?? QUALITY_GATES;
	const budgets = options.budgets ?? QUALITY_GATE_BUDGETS;
	const budgetTiers = new Set(budgets.map((entry) => entry.tier));
	const problems: GateProblem[] = [];
	const seen = new Set<string>();

	for (const gate of gates) {
		if (seen.has(gate.id)) {
			problems.push({
				gateId: gate.id,
				kind: 'duplicate-id',
				message: `Duplicate quality-gate id "${gate.id}".`,
			});
		}
		seen.add(gate.id);

		if (gate.owner.trim() === '') {
			problems.push({
				gateId: gate.id,
				kind: 'missing-owner',
				message: `Gate "${gate.id}" has no owner (PLAT-010 AC2).`,
			});
		}
		if (gate.reason.trim() === '') {
			problems.push({
				gateId: gate.id,
				kind: 'missing-reason',
				message: `Gate "${gate.id}" has no reason (PLAT-010 AC2).`,
			});
		}
		if (gate.protects.length === 0) {
			problems.push({
				gateId: gate.id,
				kind: 'no-defect-class',
				message: `Gate "${gate.id}" names no user-facing defect class (PLAT-010 AC2).`,
			});
		}
		if (!budgetTiers.has(gate.tier)) {
			problems.push({
				gateId: gate.id,
				kind: 'tier-without-budget',
				message: `Gate "${gate.id}" is in tier "${gate.tier}" which has no configured time budget (PLAT-010 AC3).`,
			});
		}
		if (options.availableScripts && !options.availableScripts.has(gate.script)) {
			problems.push({
				gateId: gate.id,
				kind: 'unknown-script',
				message: `Gate "${gate.id}" references package script "${gate.script}" that does not exist.`,
			});
		}
		if (!ISO_DATE.test(gate.lastReviewed)) {
			problems.push({
				gateId: gate.id,
				kind: 'invalid-review-date',
				message: `Gate "${gate.id}" has an invalid lastReviewed date "${gate.lastReviewed}" (want YYYY-MM-DD).`,
			});
		} else {
			const age = daysBetween(gate.lastReviewed, options.today);
			if (age === null) {
				problems.push({
					gateId: gate.id,
					kind: 'invalid-review-date',
					message: `Gate "${gate.id}" lastReviewed "${gate.lastReviewed}" could not be parsed.`,
				});
			} else if (age > REVIEW_WINDOW_DAYS) {
				problems.push({
					gateId: gate.id,
					kind: 'review-window-expired',
					message: `Gate "${gate.id}" was last reviewed ${age} days ago (> ${REVIEW_WINDOW_DAYS}); remove, narrow, or re-justify it (PLAT-010 AC4).`,
				});
			}
		}
	}

	return problems;
}

/**
 * PLAT-010 AC3: check measured durations against configured budgets. `measuredMsByTier` maps a
 * tier to its observed wall-clock duration. The tier's CONFIGURED budget is the hard ceiling —
 * exceeding it is always a violation, regardless of any scope exception. The scope exception only
 * explains why a tier is allowed a budget LARGER than the headline smoke target; it never lets a
 * tier blow past its own configured budget. Returns every offending tier so the enforcing script
 * fails closed.
 */
export function checkBudgets(
	measuredMsByTier: Readonly<Record<string, number>>,
	budgets: readonly QualityGateTierBudget[] = QUALITY_GATE_BUDGETS,
): GateProblem[] {
	const problems: GateProblem[] = [];
	for (const budget of budgets) {
		const measured = measuredMsByTier[budget.tier];
		if (measured === undefined) continue;
		if (measured > budget.budgetMs) {
			const exceptionNote =
				budget.scopeException === null
					? ''
					: ' (scope exception explains the larger-than-smoke budget but does not waive it)';
			problems.push({
				gateId: budget.tier,
				kind: 'budget-exceeded',
				message: `Tier "${budget.tier}" took ${measured}ms, over its ${budget.budgetMs}ms budget${exceptionNote} (PLAT-010 AC3).`,
			});
		}
	}
	return problems;
}
