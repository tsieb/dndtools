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
import {
	budgetForId,
	type BudgetMetric,
	type PerformanceBudget,
} from './budget-registry';

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
export type BudgetMeasurementReason =
	| 'ok'
	| 'unknown-budget'
	| 'no-samples';

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

/** Grade usable samples into a single observed value per the metric kind. Precondition: samples non-empty. */
function gradeObservedValue(samples: readonly number[], metric: BudgetMetric): number {
	if (metric.kind === 'duration-ms') {
		// A one-shot duration budget grades the WORST observed run (max), so a single slow run breaches.
		return Math.max(...samples);
	}
	// Percentile metrics grade the nearest-rank percentile (reusing the COLLAB percentile helper).
	return percentile(samples, metric.percentile ?? 95);
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
	const percentileLabel = metric.kind === 'duration-ms' ? 'max' : `p${metric.percentile ?? 95}`;

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
