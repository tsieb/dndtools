/**
 * PLAT-010: the tiered, owned, time-bounded quality-gate registry.
 *
 * This is the DECLARED, structured source of truth for the repo's existing test/lint tiers
 * (critical / smoke / full / release). It does NOT rewrite the test runner — every tier maps
 * onto the package.json scripts that already exist (`test:critical`, `test:smoke`, `lint`,
 * `check`, ...). What this module adds is the *contract* a release-quality review needs:
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
		id: 'boundary-lint',
		tier: 'critical',
		script: 'lint:boundary',
		owner: 'platform',
		reason:
			'Enforces the processing/display + platform-primitive boundaries that the whole architecture depends on.',
		protects: ['boundary-violation', 'visibility-leak'],
		selectsOnPaths: ['apps/gm-react/**', 'packages/core/**'],
		lastReviewed: '2026-07-08',
	},
	{
		id: 'repo-boundary-audit',
		tier: 'critical',
		script: 'audit:repo',
		owner: 'platform',
		reason:
			'Keeps the CI guardrails wired so planning validation and gate enforcement cannot be silently removed.',
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
		id: 'check',
		tier: 'full',
		script: 'check',
		owner: 'platform',
		reason: 'Full gate: boundary lint + typecheck + the complete unit suite.',
		protects: ['platform-regression', 'boundary-violation'],
		selectsOnPaths: ['apps/gm-react/**', 'packages/core/**'],
		lastReviewed: '2026-07-08',
	},
	{
		id: 'e2e',
		tier: 'release',
		script: 'e2e',
		owner: 'platform',
		reason:
			'Playwright browser automation for visible app flows (Scene create/reload, navigation, platform profiles, onboarding) before a release.',
		protects: ['platform-regression', 'accessibility-breakage', 'visibility-leak'],
		selectsOnPaths: ['apps/gm-react/**'],
		lastReviewed: '2026-07-08',
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
	| 'scope-constraint-violation'
	// CON-001 / CON-002 / CON-005 security + source-of-truth block surfaced through the same gate
	// runner (a non-DM delivery surface started relying on GUI hiding; an external dependency became
	// required for a core workflow; or a derived/remote/cache/widget store became the sole source of
	// truth for core vault content).
	| 'security-source-of-truth-violation'
	// RC-STB-2.7 file-size gate: a component file crossed the 800-line hard limit without a
	// recorded grandfather exception, or a grandfathered file grew past its recorded baseline.
	| 'file-size-exceeded'
	// RC-STB-2.7 file-size gate: an exception entry names a file that no longer exceeds the hard
	// limit — the entry is dead weight and should be deleted so the list only ever shrinks.
	| 'stale-file-size-exception';

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

/**
 * RC-STB-2.7: the file-size gate. STB-2 decomposed the ten mega-files that made
 * `apps/gm-react/src` unnavigable; this keeps it decomposed by failing when any `.tsx` file
 * crosses a hard line-count ceiling, and warning (non-blocking) at a lower target so growth gets
 * caught before it becomes a mega-file again.
 */
export const FILE_SIZE_HARD_LIMIT = 800;
export const FILE_SIZE_WARN_TARGET = 500;

/** One file's measured line count, repo-relative path with forward slashes. */
export interface FileLineCount {
	readonly path: string;
	readonly lines: number;
}

/**
 * A grandfathered pre-existing violation of {@link FILE_SIZE_HARD_LIMIT}, recorded at the line
 * count it had when the gate was introduced (RC-STB-2.7). None of these were in STB-2's scope
 * (`Owns`), so turning the gate on must not block unrelated changes — but the baseline is a
 * ceiling, not a pass: growing past it still fails. New entries must never be added here; split
 * the file instead. Sorted by baseline, largest first.
 */
export interface FileSizeException {
	readonly path: string;
	readonly baselineLines: number;
	readonly reason: string;
}

export const FILE_SIZE_EXCEPTIONS: readonly FileSizeException[] = [
	{
		path: 'apps/gm-react/src/ds/components/ds-interaction-fixes.test.tsx',
		baselineLines: 1766,
		reason: 'Pre-existing test file, outside RC-STB-2 scope; not a screen/component split target.',
	},
	{
		path: 'apps/gm-react/src/app/map/MapEditor.tsx',
		baselineLines: 1140,
		reason: 'Pre-existing, outside RC-STB-2 scope (map editor was not one of its ten files).',
	},
	{
		path: 'apps/gm-react/src/app/map/canvas/EditorCanvas.tsx',
		baselineLines: 1079,
		reason: 'Pre-existing, outside RC-STB-2 scope.',
	},
	{
		path: 'apps/gm-react/src/screens/Campaign.tsx',
		baselineLines: 988,
		reason: 'Pre-existing, outside RC-STB-2 scope.',
	},
	{
		path: 'apps/gm-react/src/net/SessionPanel.tsx',
		baselineLines: 953,
		reason: 'Pre-existing, outside RC-STB-2 scope.',
	},
	{
		path: 'apps/gm-react/src/app/ConnectedSources.tsx',
		baselineLines: 885,
		reason: 'Pre-existing, outside RC-STB-2 scope.',
	},
	{
		path: 'apps/gm-react/src/screens/SceneCardsPanel.tsx',
		baselineLines: 874,
		reason: 'Pre-existing, outside RC-STB-2 scope.',
	},
	{
		path: 'apps/gm-react/src/app/map/dock/InspectorPanel.tsx',
		baselineLines: 807,
		reason: 'Pre-existing, outside RC-STB-2 scope.',
	},
];

const FILE_SIZE_EXCEPTION_BY_PATH: ReadonlyMap<string, FileSizeException> = new Map(
	FILE_SIZE_EXCEPTIONS.map((entry) => [entry.path, entry]),
);

/**
 * RC-STB-2.7 hard gate: fail when a `.tsx` file exceeds {@link FILE_SIZE_HARD_LIMIT} and either
 * has no recorded exception, or has grown past its exception's recorded baseline. Also fails
 * closed when an exception entry has gone stale (its file no longer exceeds the limit), so the
 * grandfather list can only shrink over time, never rot.
 */
export function auditFileSizes(
	files: readonly FileLineCount[],
	exceptions: ReadonlyMap<string, FileSizeException> = FILE_SIZE_EXCEPTION_BY_PATH,
): GateProblem[] {
	const problems: GateProblem[] = [];
	const seenPaths = new Set<string>();

	for (const file of files) {
		seenPaths.add(file.path);
		if (file.lines <= FILE_SIZE_HARD_LIMIT) continue;
		const exception = exceptions.get(file.path);
		if (exception === undefined) {
			problems.push({
				gateId: `file-size:${file.path}`,
				kind: 'file-size-exceeded',
				message: `"${file.path}" is ${file.lines} lines, over the ${FILE_SIZE_HARD_LIMIT}-line hard limit (RC-STB-2.7). Split it by responsibility, or record a grandfather exception if it predates this gate.`,
			});
		} else if (file.lines > exception.baselineLines) {
			problems.push({
				gateId: `file-size:${file.path}`,
				kind: 'file-size-exceeded',
				message: `"${file.path}" grew to ${file.lines} lines, past its grandfathered baseline of ${exception.baselineLines} (RC-STB-2.7). Grandfathering caps growth; it does not permit more.`,
			});
		}
	}

	for (const exception of exceptions.values()) {
		if (seenPaths.has(exception.path)) continue;
		problems.push({
			gateId: `file-size:${exception.path}`,
			kind: 'stale-file-size-exception',
			message: `File-size exception "${exception.path}" no longer exists; remove it from FILE_SIZE_EXCEPTIONS.`,
		});
	}

	return problems;
}

/** One non-blocking warn-target notice: a file between the warn target and the hard limit. */
export interface FileSizeWarning {
	readonly path: string;
	readonly lines: number;
	readonly message: string;
}

/**
 * RC-STB-2.7 soft target: files between {@link FILE_SIZE_WARN_TARGET} and
 * {@link FILE_SIZE_HARD_LIMIT} are reported but never fail the gate — an early signal before a
 * file becomes a hard-limit split.
 */
export function fileSizeWarnings(files: readonly FileLineCount[]): FileSizeWarning[] {
	return files
		.filter((file) => file.lines > FILE_SIZE_WARN_TARGET && file.lines <= FILE_SIZE_HARD_LIMIT)
		.map((file) => ({
			path: file.path,
			lines: file.lines,
			message: `"${file.path}" is ${file.lines} lines, over the ${FILE_SIZE_WARN_TARGET}-line target (warn only, RC-STB-2.7).`,
		}));
}
