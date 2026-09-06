/**
 * PERF-007 — PERFORMANCE MEASUREMENT against declared budgets (Vision Performance; CI/CD Philosophy;
 * audit remediation). This is the MEASUREMENT half of the PERF capability branch: a deterministic,
 * inspectable way to grade observed samples against a budget DECLARED in the PERF-001 registry
 * ({@link ./budget-registry}) and report pass / breach / unknown.
 *
 * It does NOT invent budgets — it grades samples against a budget the registry owns. A measurement
 * against an id no registry owns is an ERROR, never a silent pass (fail closed, see {@link measureBudget}).
 *
 * It REUSES the existing nearest-rank {@link percentile} from the COLLAB live-session module rather
 * than re-implementing a parallel percentile. The COLLAB `reportLatencyBudget` remains the
 * live-session-specific report; this generalizes the same idea over ANY registered budget and ANY
 * metric direction (a ceiling for lower-is-better, a floor for higher-is-better).
 *
 * THE PERF-007 ACCEPTANCE CRITERIA, enforced HERE:
 *
 *   1. EACH BENCHMARK REPORTS PASS/FAIL AGAINST A NAMED TARGET, FIXTURE SIZE, AND PLATFORM PROFILE
 *      (AC2). {@link measureBudget} returns the owning budget's id, workflow, owner, dataset
 *      (fixture), and device class (platform profile) alongside the observed value and verdict, so a
 *      report names exactly what was measured and who owns it.
 *   2. SMOKE CI HAS A CONCRETE TARGET (AC1). The smoke-ci budget is a `duration-ms` budget in the
 *      registry; {@link measureBudget} grades a measured smoke duration against its 3-minute ceiling
 *      the same way every other budget is graded.
 *
 * FAIL-CLOSED CORRECTNESS SIGNALLING (the central rule of this module):
 *
 *   - A measurement against an UNKNOWN budget id returns `result: 'error'` (`reason: 'unknown-budget'`),
 *     never a pass.
 *   - A measurement with NO usable samples returns `result: 'unknown'` (not a confident pass) — an
 *     unmeasured budget is presumed un-proven, not green.
 *   - A non-finite or wrong-signed sample is discarded; if every sample is discarded the result is
 *     `unknown`.
 *
 * Pure + deterministic: identical samples + identical budget ⇒ identical observed value, verdict, and
 * margin. No DOM, no Node, no clock, no entropy — sample timings are EXPLICIT inputs taken by the
 * caller; this module never reads wall-clock time.
 */

import { percentile } from '../collab/session-sync';
import { budgetForId, type BudgetMetric, type PerformanceBudget } from './budget-registry';

/**
 * The verdict of measuring samples against a budget. Fail closed: anything not a confident pass is
 * `unknown` or worse.
 *
 *   - `pass`    — enough samples were measured and the graded value meets the budget target.
 *   - `breach`  — enough samples were measured and the graded value misses the budget target.
 *   - `unknown` — no usable samples; the budget is un-proven, NOT a pass.
 *   - `error`   — the measurement could not be performed (e.g. no registered budget owns the id).
 */
export type BudgetMeasurementResult = 'pass' | 'breach' | 'unknown' | 'error';

/** Why a measurement is an error or unknown, for a non-leaking diagnostic. */
export type BudgetMeasurementReason = 'ok' | 'unknown-budget' | 'no-samples';

export interface BudgetMeasurement {
	/** The budget id measured (echoed even when the id is unknown, for the diagnostic). */
	readonly budgetId: string;
	/** The verdict. */
	readonly result: BudgetMeasurementResult;
	/** Why, when the result is not a clean pass/breach. */
	readonly reason: BudgetMeasurementReason;
	/** A non-leaking message naming the workflow, owner, fixture, profile, observed value, and target. */
	readonly message: string;
	/** The owning budget, or `null` when the id is unknown. */
	readonly budget: PerformanceBudget | null;
	/** The number of usable samples graded (after discarding non-finite / wrong-signed values). */
	readonly sampleCount: number;
	/** The graded observed value in the metric's unit (the percentile for percentile metrics, the
	 *  single duration for `duration-ms`). `null` when there is nothing to grade. */
	readonly observedValue: number | null;
	/** The budget target the observed value was graded against (`null` when the id is unknown). */
	readonly target: number | null;
	/**
	 * Signed margin to target in the metric's unit, oriented so POSITIVE always means "inside budget"
	 * and NEGATIVE always means "over budget", regardless of metric direction. `null` when there is
	 * nothing to grade. For a ceiling (lower-is-better): `target - observed`. For a floor
	 * (higher-is-better): `observed - target`.
	 */
	readonly marginToTarget: number | null;
}

/** Keep only finite, correctly-signed samples for a metric. Durations/latencies must be >= 0; fps must be > 0. */
function usableSamples(samples: readonly number[], metric: BudgetMetric): number[] {
	return samples.filter((value) => {
		if (!Number.isFinite(value)) return false;
		// A negative duration/latency or a non-positive frame rate is not a real measurement.
		return metric.direction === 'higher-is-better' ? value > 0 : value >= 0;
	});
}

/**
 * Grade usable samples into a single observed value per the metric kind. Precondition: samples
 * non-empty.
 *
 * A percentile metric is graded at the percentile that makes the target meaningful IN ITS OWN
 * DIRECTION:
 *
 *   - a CEILING (lower-is-better) is graded at the declared percentile — `p95 <= 100ms` means 95%
 *     of samples are at or under the ceiling, so the graded value is the nearest-rank p95;
 *   - a FLOOR (higher-is-better) is graded at the COMPLEMENT — `p95 >= 50fps` means 95% of samples
 *     are at or above the floor, which is the nearest-rank p5, NOT the p95. Grading a frame-rate
 *     floor at the nearest-rank p95 would grade the BEST frames of a stuttering pan and report
 *     jank as a pass; the complement grades the slow tail the user actually feels.
 */
function gradeObservedValue(samples: readonly number[], metric: BudgetMetric): number {
	if (metric.kind === 'duration-ms') {
		// A one-shot duration budget grades the WORST observed run (max), so a single slow run breaches.
		return Math.max(...samples);
	}
	// Percentile metrics grade the nearest-rank percentile (reusing the COLLAB percentile helper).
	return percentile(samples, gradedPercentile(metric));
}

/** The percentile actually graded for a percentile metric, complemented for a floor (see above). */
function gradedPercentile(metric: BudgetMetric): number {
	const declared = metric.percentile ?? 95;
	return metric.direction === 'higher-is-better' ? 100 - declared : declared;
}

/** Whether an observed value meets the budget target, given the metric direction. */
function meetsTarget(observed: number, metric: BudgetMetric): boolean {
	return metric.direction === 'higher-is-better'
		? observed >= metric.target
		: observed <= metric.target;
}

/**
 * PERF-007 — measure observed samples against a DECLARED budget and report pass / breach / unknown /
 * error, FAILING CLOSED.
 *
 *   - If no registered budget owns `budgetId`, returns `error` / `unknown-budget` — a measurement
 *     against a missing budget is an error, never a silent pass.
 *   - If no usable samples remain after discarding non-finite / wrong-signed values, returns
 *     `unknown` / `no-samples` — an unmeasured budget is un-proven, not green.
 *   - Otherwise grades the observed value (max for `duration-ms`, nearest-rank percentile for
 *     percentile metrics) against the target and returns `pass` or `breach`, with the owning
 *     workflow, owner, dataset (fixture), and device class (platform profile) named in the message
 *     (AC2). EXACTLY at the threshold is a PASS (the target is inclusive).
 *
 * `budgets` defaults to the canonical registry; pass a custom registry to grade against a test set.
 * Pure + deterministic: identical samples + budget ⇒ identical measurement.
 */
export function measureBudget(
	budgetId: string,
	samples: readonly number[],
	budgets?: readonly PerformanceBudget[],
): BudgetMeasurement {
	const budget = budgets === undefined ? budgetForId(budgetId) : budgetForId(budgetId, budgets);
	if (budget === null) {
		return {
			budgetId,
			result: 'error',
			reason: 'unknown-budget',
			message: `No registered performance budget owns id "${budgetId}"; refusing to report a pass (PERF-001 / PERF-007 fail-closed).`,
			budget: null,
			sampleCount: 0,
			observedValue: null,
			target: null,
			marginToTarget: null,
		};
	}

	const { metric } = budget;
	const usable = usableSamples(samples, metric);
	if (usable.length === 0) {
		return {
			budgetId,
			result: 'unknown',
			reason: 'no-samples',
			message: `Budget "${budget.id}" (${budget.workflow}, owner ${budget.owner}) has no usable samples; status is unknown, not pass (PERF-007 fail-closed).`,
			budget,
			sampleCount: 0,
			observedValue: null,
			target: metric.target,
			marginToTarget: null,
		};
	}

	const observedValue = gradeObservedValue(usable, metric);
	const pass = meetsTarget(observedValue, metric);
	const marginToTarget =
		metric.direction === 'higher-is-better'
			? observedValue - metric.target
			: metric.target - observedValue;
	const comparator = metric.direction === 'higher-is-better' ? '>=' : '<=';
	const percentileLabel = metric.kind === 'duration-ms' ? 'max' : `p${gradedPercentile(metric)}`;

	// PERF-007 AC1: when a breach has an approved temporary exception, name it in the message so
	// CI reporters can distinguish a known deviation from a surprise breach.
	const exceptionNote =
		!pass && budget.approvedException !== undefined
			? ` [approved exception until ${budget.approvedException.expiresOn}: ${budget.approvedException.reason}]`
			: '';

	return {
		budgetId,
		result: pass ? 'pass' : 'breach',
		reason: 'ok',
		message: `Budget "${budget.id}" (${budget.workflow}) ${pass ? 'PASS' : 'BREACH'}: ${percentileLabel} ${observedValue}${metric.unit} ${comparator} ${metric.target}${metric.unit} on ${budget.dataset} / ${budget.deviceClass}; owner ${budget.owner}${pass ? '' : `; risk: ${budget.userFacingRisk}`}${exceptionNote}.`,
		budget,
		sampleCount: usable.length,
		observedValue,
		target: metric.target,
		marginToTarget,
	};
}

/** A single benchmark run: a budget id plus the samples observed for it. */
export interface BudgetMeasurementInput {
	readonly budgetId: string;
	readonly samples: readonly number[];
}

export interface BudgetMeasurementSuite {
	/** Per-budget measurements, one per input, in input order. */
	readonly measurements: readonly BudgetMeasurement[];
	/** Count of measurements that PASSED. */
	readonly passCount: number;
	/** Count of measurements that BREACHED their budget. */
	readonly breachCount: number;
	/** Count of measurements with no usable samples (unknown — un-proven, not pass). */
	readonly unknownCount: number;
	/** Count of measurements that errored (e.g. unknown budget id). */
	readonly errorCount: number;
	/**
	 * Whether the suite is clean: every measurement PASSED. Fail closed — any breach, unknown, OR
	 * error makes the suite NOT clean (an un-proven or un-owned budget never lets the suite pass).
	 */
	readonly allPassed: boolean;
}

/**
 * PERF-007 — measure a SET of benchmark runs against the registry and summarize. Each input is graded
 * by {@link measureBudget} (so the same fail-closed rules apply per measurement). The suite is
 * `allPassed` only when EVERY measurement passed — a breach, an unknown (no samples), or an error
 * (unknown budget) all keep the suite from passing. Pure + deterministic.
 */
export function measureBudgetSuite(
	inputs: readonly BudgetMeasurementInput[],
	budgets?: readonly PerformanceBudget[],
): BudgetMeasurementSuite {
	const measurements = inputs.map((input) => measureBudget(input.budgetId, input.samples, budgets));
	let passCount = 0;
	let breachCount = 0;
	let unknownCount = 0;
	let errorCount = 0;
	for (const measurement of measurements) {
		switch (measurement.result) {
			case 'pass':
				passCount += 1;
				break;
			case 'breach':
				breachCount += 1;
				break;
			case 'unknown':
				unknownCount += 1;
				break;
			case 'error':
				errorCount += 1;
				break;
		}
	}
	return {
		measurements,
		passCount,
		breachCount,
		unknownCount,
		errorCount,
		allPassed: measurements.length > 0 && passCount === measurements.length,
	};
}

// ── RC-ENG-1.1 — BASELINE COMPARISON ─────────────────────────────────────────────────────────────
// The measurement half above answers "does this run meet its declared target?". A perf pipeline also
// has to answer "did this run get WORSE than the recorded baseline?", because a budget with slack in
// it can absorb a large regression and still pass. Both questions are graded HERE so the capture
// script, the compare script and CI share one implementation and one vocabulary.
//
// Pure + deterministic, like everything above: no clock, no I/O. The scripts own reading the run and
// baseline JSON; this owns the arithmetic and the verdict.

/** One recorded baseline value for a budget: the observed value a previous accepted run graded. */
export interface BudgetBaselineEntry {
	readonly budgetId: string;
	/** The graded observed value in the budget's unit, from the accepted baseline run. */
	readonly observedValue: number;
}

/**
 * The verdict of comparing a fresh measurement against its recorded baseline. Fail closed: only a
 * comparison that actually happened can be `improved` / `steady`; anything else says so plainly.
 *
 *   - `improved`    — the run moved the metric in the good direction by more than the tolerance.
 *   - `steady`      — the run is within the tolerance band of the baseline, either way.
 *   - `regressed`   — the run moved the metric in the BAD direction by more than the tolerance.
 *   - `no-baseline` — no baseline is recorded for this budget; nothing to compare against.
 *   - `not-measured`— the measurement itself was `unknown` or `error`, so there is nothing to compare.
 */
export type BaselineComparisonVerdict =
	| 'improved'
	| 'steady'
	| 'regressed'
	| 'no-baseline'
	| 'not-measured';

export interface BaselineComparison {
	readonly budgetId: string;
	readonly verdict: BaselineComparisonVerdict;
	/** The freshly graded value, or `null` when the measurement produced none. */
	readonly observedValue: number | null;
	/** The recorded baseline value, or `null` when none is recorded. */
	readonly baselineValue: number | null;
	/**
	 * Signed drift as a fraction of the baseline, oriented so POSITIVE always means WORSE and
	 * NEGATIVE always means BETTER, whichever way the metric points. `null` when no comparison was
	 * possible (or the baseline is 0, which carries no ratio).
	 */
	readonly driftRatio: number | null;
	/** A non-leaking one-line explanation naming the budget, both values, and the drift. */
	readonly message: string;
}

/** The default regression tolerance: a run may drift 20% off baseline before it counts as a regression (ADR-009). */
export const DEFAULT_BASELINE_TOLERANCE = 0.2;

function formatPercent(ratio: number): string {
	return `${(ratio * 100).toFixed(1)}%`;
}

/**
 * RC-ENG-1.1 — compare one fresh {@link BudgetMeasurement} against its recorded baseline value.
 *
 * The drift is expressed as a fraction of the baseline and oriented so positive is always worse:
 * for a ceiling (lower-is-better) a slower run drifts positive; for a floor (higher-is-better) a
 * lower frame rate drifts positive. A drift above `tolerance` in the bad direction is `regressed`;
 * above it in the good direction is `improved`; anything between is `steady`.
 *
 * Fail closed: a measurement that is `unknown` or `error` is `not-measured` (never `steady` — an
 * un-run scenario must not read as "no change"), and a budget with no recorded baseline is
 * `no-baseline`, not a silent pass.
 */
export function compareToBaseline(
	measurement: BudgetMeasurement,
	baselineValue: number | null | undefined,
	tolerance: number = DEFAULT_BASELINE_TOLERANCE,
): BaselineComparison {
	const { budgetId } = measurement;
	if (measurement.observedValue === null || measurement.budget === null) {
		return {
			budgetId,
			verdict: 'not-measured',
			observedValue: null,
			baselineValue: baselineValue ?? null,
			driftRatio: null,
			message: `Budget "${budgetId}" was not measured (${measurement.reason}); there is nothing to compare against the baseline.`,
		};
	}
	if (baselineValue === null || baselineValue === undefined || !Number.isFinite(baselineValue)) {
		return {
			budgetId,
			verdict: 'no-baseline',
			observedValue: measurement.observedValue,
			baselineValue: null,
			driftRatio: null,
			message: `Budget "${budgetId}" has no recorded baseline; observed ${measurement.observedValue}${measurement.budget.metric.unit} is recorded but not compared.`,
		};
	}

	const unit = measurement.budget.metric.unit;
	if (baselineValue === 0) {
		return {
			budgetId,
			verdict: 'steady',
			observedValue: measurement.observedValue,
			baselineValue,
			driftRatio: null,
			message: `Budget "${budgetId}" has a zero baseline, which carries no ratio; observed ${measurement.observedValue}${unit} is reported without a drift.`,
		};
	}

	// Positive drift always means WORSE: a rising duration on a ceiling, a falling frame rate on a floor.
	const rawDrift = (measurement.observedValue - baselineValue) / Math.abs(baselineValue);
	const driftRatio =
		measurement.budget.metric.direction === 'higher-is-better' ? -rawDrift : rawDrift;
	const band = Math.abs(tolerance);
	const verdict: BaselineComparisonVerdict =
		driftRatio > band ? 'regressed' : driftRatio < -band ? 'improved' : 'steady';
	const direction = driftRatio > 0 ? 'worse than' : driftRatio < 0 ? 'better than' : 'level with';
	return {
		budgetId,
		verdict,
		observedValue: measurement.observedValue,
		baselineValue,
		driftRatio,
		message: `Budget "${budgetId}" ${verdict.toUpperCase()}: ${measurement.observedValue}${unit} is ${formatPercent(Math.abs(driftRatio))} ${direction} the ${baselineValue}${unit} baseline (tolerance ${formatPercent(band)}).`,
	};
}

export interface BaselineComparisonSuite {
	readonly comparisons: readonly BaselineComparison[];
	readonly regressedCount: number;
	readonly improvedCount: number;
	readonly steadyCount: number;
	readonly missingBaselineCount: number;
	readonly notMeasuredCount: number;
	/**
	 * Whether the run is clean against the baseline: no regression AND no measurement that failed to
	 * run. A budget with no baseline yet does NOT block (it is new, and the run records its first
	 * value), but a scenario that produced no samples DOES — a scenario that silently stopped running
	 * must not read as green.
	 */
	readonly clean: boolean;
}

/**
 * RC-ENG-1.1 — compare a whole suite of measurements against recorded baselines. `baselines` is
 * keyed by budget id; an id with no entry compares as `no-baseline`. Pure + deterministic.
 */
export function compareSuiteToBaseline(
	measurements: readonly BudgetMeasurement[],
	baselines: readonly BudgetBaselineEntry[],
	tolerance: number = DEFAULT_BASELINE_TOLERANCE,
): BaselineComparisonSuite {
	const byId = new Map(baselines.map((entry) => [entry.budgetId, entry.observedValue]));
	const comparisons = measurements.map((measurement) =>
		compareToBaseline(measurement, byId.get(measurement.budgetId) ?? null, tolerance),
	);
	let regressedCount = 0;
	let improvedCount = 0;
	let steadyCount = 0;
	let missingBaselineCount = 0;
	let notMeasuredCount = 0;
	for (const comparison of comparisons) {
		switch (comparison.verdict) {
			case 'regressed':
				regressedCount += 1;
				break;
			case 'improved':
				improvedCount += 1;
				break;
			case 'steady':
				steadyCount += 1;
				break;
			case 'no-baseline':
				missingBaselineCount += 1;
				break;
			case 'not-measured':
				notMeasuredCount += 1;
				break;
		}
	}
	return {
		comparisons,
		regressedCount,
		improvedCount,
		steadyCount,
		missingBaselineCount,
		notMeasuredCount,
		clean: regressedCount === 0 && notMeasuredCount === 0,
	};
}
