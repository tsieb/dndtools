/**
 * PERF-001 — PERFORMANCE BUDGET OWNERSHIP (Vision Performance; Feature Inventory I2 performance
 * budgets; Architecture Contract 1 Processing/Display decoupling). This module is the SINGLE
 * authoritative place where v2 performance budgets are DECLARED and OWNED, so budgets are not
 * scattered ad-hoc across feature modules. It is the budget half of the PERF capability branch; the
 * measurement half ({@link ./measurement}) reports observed samples against a budget declared HERE.
 *
 * It is modeled on the PLAT-010 quality-gate registry (`../platform/quality-gates`): a structured,
 * owned, time-reviewed registry plus a fail-closed validator. The two registries are deliberately
 * separate — quality gates own CI test/lint TIERS, this owns user-facing PERFORMANCE WORKFLOWS
 * (startup, vault open, Scene render, widget update, map pan/zoom, search, graph indexing, sync
 * reconciliation) — but they share the same shape so a reviewer reads them the same way.
 *
 * THE THREE PERF-001 ACCEPTANCE CRITERIA, all enforced HERE:
 *
 *   1. EVERY FEATURE DOMAIN HAS A BUDGET + MEASUREMENT METHOD (AC1). Each {@link PerformanceBudget}
 *      names the workflow it governs, the owning domain, and the {@link BudgetMetric} (the
 *      measurement method) used to grade observed samples. {@link budgetsForOwner} /
 *      {@link budgetForId} let a planning review confirm the relevant budgets exist before a domain
 *      starts implementation.
 *   2. A BREACH IDENTIFIES THE OWNING DOMAIN + USER-FACING RISK (AC2). Every budget carries a
 *      non-empty `owner` and a non-empty `userFacingRisk`, so when a budget breaches in CI or
 *      profiling the report (built by {@link ./measurement}) names who owns it and what the user
 *      feels. {@link validateBudgetRegistry} fails closed when either is missing.
 *   3. PROVISIONAL TARGETS ARE FULLY QUALIFIED, NEVER "fast enough" (AC3). A budget with no measured
 *      baseline is `provisional` and MUST declare `dataset`, `deviceClass`, and a `reviewDate`.
 *      {@link validateBudgetRegistry} rejects a provisional budget missing any of them, and flags a
 *      provisional budget whose review date has passed.
 *
 * Pure: no DOM, no Node, no Svelte, no storage, no clock, no entropy. The "today" used for review
 * windows is an EXPLICIT input, never `Date.now()`, so validation is deterministic and unit-testable.
 */

/**
 * How a budget's observed samples are measured and graded. The kind names BOTH the unit and the
 * direction of "good", so a measurement function can grade a sample deterministically without a
 * per-budget special case:
 *
 *   - `latency-ms-p95`     — duration in ms, lower is better; the budget target is a p95 ceiling.
 *   - `throughput-fps-p95` — frames per second, HIGHER is better; the target is a p95 floor.
 *   - `duration-ms`        — a single wall-clock duration in ms, lower is better; the target is a
 *                            ceiling (used for one-shot workflows like smoke CI or app startup where
 *                            a percentile over many samples is not meaningful).
 */
export type BudgetMetricKind = 'latency-ms-p95' | 'throughput-fps-p95' | 'duration-ms';

/** Whether a budget's target is a ceiling (lower is better) or a floor (higher is better). */
export type BudgetDirection = 'lower-is-better' | 'higher-is-better';

/**
 * The measurement method + target for one budget — the part {@link ./measurement} grades samples
 * against. `target` is the threshold in the metric's unit (a ceiling for `lower-is-better`, a floor
 * for `higher-is-better`). `percentile` is the percentile graded for percentile metrics (ignored by
 * the single-sample `duration-ms` kind).
 */
export interface BudgetMetric {
	readonly kind: BudgetMetricKind;
	readonly direction: BudgetDirection;
	/** The threshold in the metric's unit. A ceiling when lower-is-better, a floor when higher-is-better. */
	readonly target: number;
	/** Unit label for diagnostics (e.g. `ms`, `fps`). Non-empty. */
	readonly unit: string;
	/** The percentile (0–100) graded for percentile metrics. Omitted/ignored for `duration-ms`. */
	readonly percentile?: number;
}

/**
 * A budget whose target is a measured baseline, or one that is still provisional. A provisional
 * budget MUST declare its dataset, device class, and review date (PERF-001 AC3) so it is never the
 * ambiguous "fast enough"; a baselined budget records the date the baseline was measured.
 */
export type BudgetMaturity =
	| { readonly kind: 'provisional'; readonly reviewDate: string }
	| { readonly kind: 'baseline'; readonly measuredAt: string };

/**
 * PERF-007 AC1: a time-limited, explicitly approved exception for a budget that is temporarily
 * expected to breach its target (e.g. a CI infrastructure migration, a known slow environment).
 * The exception does NOT waive the budget — the measurement verdict is still `breach` — but
 * {@link ./measurement}'s message names the reason so CI reporters can distinguish a known
 * deviation from a surprise breach. {@link validateBudgetRegistry} flags any exception whose
 * `expiresOn` date has passed, so exceptions cannot silently linger forever.
 */
export interface BudgetApprovedException {
	/**
	 * Human-readable explanation of why the temporary breach is accepted (e.g. "CI migration to
	 * new runner pool; target will be re-verified once migration completes"). Non-empty.
	 */
	readonly reason: string;
	/**
	 * ISO `YYYY-MM-DD` date after which this exception is no longer valid. Any exception whose
	 * `expiresOn` is in the past is flagged by {@link validateBudgetRegistry} (kind
	 * `approved-exception-expired`) so it cannot silently persist beyond its approval window.
	 */
	readonly expiresOn: string;
}

/**
 * ONE owned performance budget for ONE user-facing workflow. The registry below is the only place
 * these are declared. Every field is required for a complete budget; {@link validateBudgetRegistry}
 * fails closed when an ownership/qualification field is missing or empty.
 */
export interface PerformanceBudget {
	/** Stable id, unique in the registry (e.g. `app-startup`, `scene-first-render`). */
	readonly id: string;
	/** Human-facing workflow name (e.g. "App startup", "Scene first render"). Non-empty. */
	readonly workflow: string;
	/** The accountable owning domain (e.g. `Platform`, `Canvas`, `Maps`, `Search`). Non-empty (AC2). */
	readonly owner: string;
	/** What the user feels when this budget breaches. Non-empty (AC2). */
	readonly userFacingRisk: string;
	/** The dataset/fixture the target is defined against (e.g. "1,000 notes / 100 objects"). Non-empty (AC3). */
	readonly dataset: string;
	/** The device class / platform profile the target applies to (e.g. "Desktop reference"). Non-empty (AC3). */
	readonly deviceClass: string;
	/** The measurement method + threshold {@link ./measurement} grades samples against. */
	readonly metric: BudgetMetric;
	/** Whether the target is a measured baseline or a provisional placeholder (AC3). */
	readonly maturity: BudgetMaturity;
	/**
	 * PERF-007 AC1: an approved, time-limited exception for a budget temporarily expected to
	 * breach its target. When set, {@link ./measurement} names the exception in the breach
	 * message. The verdict is still `breach` — the exception does NOT waive the budget —
	 * so measurements remain truthful; CI scripts decide whether to treat a documented breach
	 * as non-blocking. Omit when no exception is active (the common case).
	 */
	readonly approvedException?: BudgetApprovedException;
}

/** Registry schema version, bumped on a breaking budget-shape change. */
export const PERFORMANCE_BUDGET_REGISTRY_VERSION = 1 as const;

/**
 * The declared, owned performance budgets for v2. These are the concrete provisional thresholds the
 * PERF-007 budget artifact names (smoke CI, startup, vault open, Scene first render, widget update,
 * map pan/zoom, search, graph indexing, sync reconciliation). This module is the executable,
 * validated source of truth for those thresholds. All are `provisional` (no measured baseline
 * exists yet, per ADR-014's prototype stance) and therefore each declares dataset, device class,
 * and a review date.
 */
export const PERFORMANCE_BUDGETS: readonly PerformanceBudget[] = [
	{
		id: 'smoke-ci',
		workflow: 'Smoke CI',
		owner: 'Platform',
		userFacingRisk: 'Slow CI feedback delays every contributor and erodes the fast-feedback loop.',
		dataset: 'Supported CI runner',
		deviceClass: 'CI reference runner',
		metric: { kind: 'duration-ms', direction: 'lower-is-better', target: 3 * 60 * 1000, unit: 'ms' },
		maturity: { kind: 'provisional', reviewDate: '2026-12-31' },
	},
	{
		id: 'app-startup',
		workflow: 'App startup',
		owner: 'Platform',
		userFacingRisk: 'A slow shell makes the app feel unresponsive on launch.',
		dataset: 'Warm cache',
		deviceClass: 'Desktop reference device',
		metric: { kind: 'duration-ms', direction: 'lower-is-better', target: 2 * 1000, unit: 'ms' },
		maturity: { kind: 'provisional', reviewDate: '2026-12-31' },
	},
	{
		id: 'vault-open',
		workflow: 'Vault open',
		owner: 'Platform',
		userFacingRisk: 'A slow vault open delays reaching a usable Command Center.',
		dataset: '1,000 notes / 100 objects / 20 maps',
		deviceClass: 'Desktop reference device',
		metric: { kind: 'duration-ms', direction: 'lower-is-better', target: 3 * 1000, unit: 'ms' },
		maturity: { kind: 'provisional', reviewDate: '2026-12-31' },
	},
	{
		id: 'scene-first-render',
		workflow: 'Scene first render',
		owner: 'Canvas',
		userFacingRisk: 'A slow Scene render delays a DM reaching an interactive table.',
		dataset: '50 widgets / 10 active bindings',
		deviceClass: 'Desktop and slim reference profiles',
		metric: { kind: 'duration-ms', direction: 'lower-is-better', target: 1500, unit: 'ms' },
		maturity: { kind: 'provisional', reviewDate: '2026-12-31' },
	},
	{
		id: 'widget-update',
		workflow: 'Widget update',
		owner: 'Canvas',
		userFacingRisk: 'A laggy widget update makes a Scene feel sluggish to the DM and players.',
		dataset: 'Single accepted command',
		deviceClass: 'Desktop and slim reference profiles',
		metric: { kind: 'latency-ms-p95', direction: 'lower-is-better', target: 100, unit: 'ms', percentile: 95 },
		maturity: { kind: 'provisional', reviewDate: '2026-12-31' },
	},
	{
		id: 'map-pan-zoom-desktop',
		workflow: 'Map pan/zoom (desktop)',
		owner: 'Maps',
		userFacingRisk: 'A low frame rate makes map navigation stutter during play.',
		dataset: '4 layers / 100 POIs',
		deviceClass: 'Desktop reference',
		metric: { kind: 'throughput-fps-p95', direction: 'higher-is-better', target: 50, unit: 'fps', percentile: 95 },
		maturity: { kind: 'provisional', reviewDate: '2026-12-31' },
	},
	{
		id: 'map-pan-zoom-slim',
		workflow: 'Map pan/zoom (slim)',
		owner: 'Maps',
		userFacingRisk: 'A low frame rate makes map navigation stutter on slim devices.',
		dataset: '4 layers / 100 POIs',
		deviceClass: 'Slim reference',
		metric: { kind: 'throughput-fps-p95', direction: 'higher-is-better', target: 30, unit: 'fps', percentile: 95 },
		maturity: { kind: 'provisional', reviewDate: '2026-12-31' },
	},
	{
		id: 'search',
		workflow: 'Search',
		owner: 'Search',
		userFacingRisk: 'A slow query makes finding content feel unresponsive.',
		dataset: '10,000 indexed records',
		deviceClass: 'Desktop and mobile reference profiles',
		metric: { kind: 'latency-ms-p95', direction: 'lower-is-better', target: 250, unit: 'ms', percentile: 95 },
		maturity: { kind: 'provisional', reviewDate: '2026-12-31' },
	},
	{
		id: 'graph-indexing',
		workflow: 'Graph indexing',
		owner: 'Graph',
		userFacingRisk: 'Slow affected-node updates leave navigation stale after a note changes.',
		dataset: 'One changed note in a 10,000-record vault',
		deviceClass: 'Background worker profile',
		metric: { kind: 'duration-ms', direction: 'lower-is-better', target: 500, unit: 'ms' },
		maturity: { kind: 'provisional', reviewDate: '2026-12-31' },
	},
	{
		id: 'sync-reconciliation',
		workflow: 'Sync reconciliation',
		owner: 'Sync',
		userFacingRisk: 'A slow replay starves the UI while a backlog of operations is applied.',
		dataset: '1,000 queued operations',
		deviceClass: 'Desktop and mobile reference profiles',
		metric: { kind: 'latency-ms-p95', direction: 'lower-is-better', target: 2 * 1000, unit: 'ms', percentile: 95 },
		maturity: { kind: 'provisional', reviewDate: '2026-12-31' },
	},
	{
		// Migrated from the COLLAB live-session module's ad-hoc DEFAULT_SESSION_LATENCY_BUDGET. The p95
		// delivery target is now OWNED here; `collab/session-sync.ts` reads its default p95 from this entry
		// (see LIVE_SESSION_DELIVERY_BUDGET_ID) so the number is declared in exactly one place.
		id: 'live-session-delivery',
		workflow: 'Live session update delivery',
		owner: 'Collaboration',
		userFacingRisk: 'A laggy live session leaves a participant view behind the DM during play.',
		dataset: 'Near-real-time projected session ops',
		deviceClass: 'Desktop and mobile reference profiles',
		metric: { kind: 'latency-ms-p95', direction: 'lower-is-better', target: 500, unit: 'ms', percentile: 95 },
		maturity: { kind: 'provisional', reviewDate: '2026-12-31' },
	},
];

/** The registry id of the budget that owns the COLLAB live-session p95 delivery target (see migration note). */
export const LIVE_SESSION_DELIVERY_BUDGET_ID = 'live-session-delivery' as const;

const BUDGET_BY_ID: ReadonlyMap<string, PerformanceBudget> = new Map(
	PERFORMANCE_BUDGETS.map((budget) => [budget.id, budget]),
);

/**
 * Look up a declared budget by id, or `null` if no budget owns that id. A `null` is the fail-closed
 * signal the measurement layer turns into an error rather than a silent pass — a measurement against
 * an unregistered budget must NOT report a confident pass (PERF-001 AC2 / PERF-007 fail-closed).
 */
export function budgetForId(
	id: string,
	budgets: readonly PerformanceBudget[] = PERFORMANCE_BUDGETS,
): PerformanceBudget | null {
	if (budgets === PERFORMANCE_BUDGETS) return BUDGET_BY_ID.get(id) ?? null;
	return budgets.find((budget) => budget.id === id) ?? null;
}

/**
 * Every declared budget owned by a domain, in registry order. Lets a planning review confirm the
 * relevant budgets exist before that domain starts implementation (PERF-001 AC1). Owner match is
 * case-insensitive so `Maps` and `maps` resolve the same.
 */
export function budgetsForOwner(
	owner: string,
	budgets: readonly PerformanceBudget[] = PERFORMANCE_BUDGETS,
): PerformanceBudget[] {
	const needle = owner.trim().toLowerCase();
	return budgets.filter((budget) => budget.owner.trim().toLowerCase() === needle);
}

/** A structural problem with the budget registry, surfaced so a validator can fail closed. */
export type BudgetProblemKind =
	| 'duplicate-id'
	| 'missing-workflow'
	| 'missing-owner'
	| 'missing-user-facing-risk'
	| 'missing-dataset'
	| 'missing-device-class'
	| 'invalid-target'
	| 'invalid-percentile'
	| 'invalid-unit'
	| 'missing-review-date'
	| 'invalid-review-date'
	| 'review-window-expired'
	| 'invalid-baseline-date'
	| 'approved-exception-expired';

export interface BudgetProblem {
	readonly budgetId: string;
	readonly kind: BudgetProblemKind;
	readonly message: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Days from `fromIso` to `toIso`, or `null` if either date is unparseable. */
function daysBetween(fromIso: string, toIso: string): number | null {
	const from = Date.parse(`${fromIso}T00:00:00Z`);
	const to = Date.parse(`${toIso}T00:00:00Z`);
	if (Number.isNaN(from) || Number.isNaN(to)) return null;
	return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

/**
 * PERF-001 — validate the budget registry against its ownership + qualification contract, FAILING
 * CLOSED. Every budget must:
 *
 *   - have a unique id, a non-empty workflow, owner, and user-facing risk (AC1/AC2);
 *   - declare a dataset and device class (AC3 — never the ambiguous "fast enough");
 *   - carry a positive, finite metric target, a non-empty unit, and a valid percentile (0–100) for
 *     percentile metrics;
 *   - if provisional, declare a valid `reviewDate` that has NOT already passed relative to `today`
 *     (a provisional target whose review date has lapsed is flagged for re-justification, AC3);
 *   - if baselined, declare a valid `measuredAt` date.
 *
 * `today` is an EXPLICIT ISO date so review-window checks are deterministic (no `Date.now()`).
 * Returns every problem found so the caller can report all of them at once.
 */
export function validateBudgetRegistry(options: {
	budgets?: readonly PerformanceBudget[];
	today: string;
}): BudgetProblem[] {
	const budgets = options.budgets ?? PERFORMANCE_BUDGETS;
	const problems: BudgetProblem[] = [];
	const seen = new Set<string>();

	for (const budget of budgets) {
		if (seen.has(budget.id)) {
			problems.push({
				budgetId: budget.id,
				kind: 'duplicate-id',
				message: `Duplicate performance-budget id "${budget.id}".`,
			});
		}
		seen.add(budget.id);

		if (budget.workflow.trim() === '') {
			problems.push({
				budgetId: budget.id,
				kind: 'missing-workflow',
				message: `Budget "${budget.id}" has no workflow name (PERF-001 AC1).`,
			});
		}
		if (budget.owner.trim() === '') {
			problems.push({
				budgetId: budget.id,
				kind: 'missing-owner',
				message: `Budget "${budget.id}" has no owning domain (PERF-001 AC2).`,
			});
		}
		if (budget.userFacingRisk.trim() === '') {
			problems.push({
				budgetId: budget.id,
				kind: 'missing-user-facing-risk',
				message: `Budget "${budget.id}" names no user-facing risk (PERF-001 AC2).`,
			});
		}
		if (budget.dataset.trim() === '') {
			problems.push({
				budgetId: budget.id,
				kind: 'missing-dataset',
				message: `Budget "${budget.id}" has no dataset/fixture; targets must not be "fast enough" (PERF-001 AC3).`,
			});
		}
		if (budget.deviceClass.trim() === '') {
			problems.push({
				budgetId: budget.id,
				kind: 'missing-device-class',
				message: `Budget "${budget.id}" has no device class/platform profile (PERF-001 AC3).`,
			});
		}

		const { metric } = budget;
		if (!Number.isFinite(metric.target) || metric.target <= 0) {
			problems.push({
				budgetId: budget.id,
				kind: 'invalid-target',
				message: `Budget "${budget.id}" has a non-positive or non-finite target (${String(metric.target)}).`,
			});
		}
		if (metric.unit.trim() === '') {
			problems.push({
				budgetId: budget.id,
				kind: 'invalid-unit',
				message: `Budget "${budget.id}" has an empty metric unit.`,
			});
		}
		const isPercentileMetric =
			metric.kind === 'latency-ms-p95' || metric.kind === 'throughput-fps-p95';
		if (isPercentileMetric) {
			const p = metric.percentile;
			if (p === undefined || !Number.isFinite(p) || p < 0 || p > 100) {
				problems.push({
					budgetId: budget.id,
					kind: 'invalid-percentile',
					message: `Budget "${budget.id}" metric "${metric.kind}" needs a percentile in 0–100 (got ${String(p)}).`,
				});
			}
		}

		if (budget.maturity.kind === 'provisional') {
			const { reviewDate } = budget.maturity;
			if (reviewDate.trim() === '') {
				problems.push({
					budgetId: budget.id,
					kind: 'missing-review-date',
					message: `Provisional budget "${budget.id}" must declare a review date (PERF-001 AC3).`,
				});
			} else if (!ISO_DATE.test(reviewDate)) {
				problems.push({
					budgetId: budget.id,
					kind: 'invalid-review-date',
					message: `Budget "${budget.id}" has an invalid reviewDate "${reviewDate}" (want YYYY-MM-DD).`,
				});
			} else {
				const overdueByDays = daysBetween(reviewDate, options.today);
				if (overdueByDays === null) {
					problems.push({
						budgetId: budget.id,
						kind: 'invalid-review-date',
						message: `Budget "${budget.id}" reviewDate "${reviewDate}" could not be parsed.`,
					});
				} else if (overdueByDays > 0) {
					problems.push({
						budgetId: budget.id,
						kind: 'review-window-expired',
						message: `Provisional budget "${budget.id}" was due for review ${overdueByDays} day(s) ago (${reviewDate}); re-baseline or re-justify it (PERF-001 AC3).`,
					});
				}
			}
		} else {
			const { measuredAt } = budget.maturity;
			if (!ISO_DATE.test(measuredAt) || daysBetween(measuredAt, options.today) === null) {
				problems.push({
					budgetId: budget.id,
					kind: 'invalid-baseline-date',
					message: `Baselined budget "${budget.id}" has an invalid measuredAt "${measuredAt}" (want YYYY-MM-DD).`,
				});
			}
		}

		// PERF-007 AC1 — validate any approved temporary exception (fail closed: an expired exception
		// is flagged so it cannot silently outlive its approval window).
		if (budget.approvedException !== undefined) {
			const { expiresOn, reason } = budget.approvedException;
			if (reason.trim() === '') {
				// An exception with no reason is not reviewable and should not be accepted silently.
				problems.push({
					budgetId: budget.id,
					kind: 'approved-exception-expired',
					message: `Budget "${budget.id}" has an approved exception with no reason; add a reason or remove the exception (PERF-007 AC1).`,
				});
			} else if (!ISO_DATE.test(expiresOn)) {
				problems.push({
					budgetId: budget.id,
					kind: 'approved-exception-expired',
					message: `Budget "${budget.id}" approved exception has an invalid expiresOn "${expiresOn}" (want YYYY-MM-DD, PERF-007 AC1).`,
				});
			} else {
				const overdueByDays = daysBetween(expiresOn, options.today);
				if (overdueByDays !== null && overdueByDays > 0) {
					problems.push({
						budgetId: budget.id,
						kind: 'approved-exception-expired',
						message: `Budget "${budget.id}" approved exception expired ${overdueByDays} day(s) ago (${expiresOn}); re-approve or remove it (PERF-007 AC1).`,
					});
				}
			}
		}
	}

	return problems;
}
