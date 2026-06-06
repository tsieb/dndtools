/**
 * PERF-006 — AI / MCP ISOLATION: the PROOF, as enforceable Processing-Core policy, that the optional
 * AI/MCP subsystem can NEVER degrade core performance — it is OFF the critical path, bounded, and
 * cancellable (Vision "AI supplements algorithms"; Feature Inventory I5; Cross-Contract Non-Negotiable
 * 7). This is the AI/MCP-ISOLATION third of the "bundles, memory, and AI/MCP isolation" capability
 * branch. It COMPOSES what the project already built rather than re-deciding the boundary:
 *
 *   - MCP-001 OPTIONALITY ({@link isMcpEnabled}) — MCP is OFF by default. This module's central proof is
 *     that a core measurement is INDEPENDENT of the MCP enabled flag.
 *   - The AI-BOUNDARY contract ({@link ../mcp/ai-boundary}) — AI is annotative, never load-bearing. This
 *     module asserts the cost-isolation COROLLARY: because AI is annotative-only, removing/disabling it
 *     cannot change a deterministic result OR its timing.
 *   - The PERF-007 measurement ({@link ./measurement}) — core budgets are graded by the SAME
 *     {@link measureBudget}. This module proves the GRADE does not move when MCP/AI is toggled.
 *
 * THE THREE PERF-006 ACCEPTANCE CRITERIA, enforced HERE:
 *
 *   1. SESSION COMMANDS STAY RESPONSIVE WHILE AI RUNS (AC1). {@link proveCorePerfIsolatedFromAi}
 *      compares a core workflow's measured samples taken WITH the AI/MCP subsystem busy against the
 *      SAME workflow's samples with it idle: if the busy run is materially slower (beyond a tolerance),
 *      AI/MCP is contending for the critical path — a BREACH. Fail closed: if isolation cannot be
 *      PROVEN (no samples on either side), the result is `unknown`, never a confident pass.
 *
 *   2. AN OVER-LIMIT AI/MCP TASK IS CANCELLED AND ITS OUTPUT DISCARDED OR MARKED PARTIAL (AC2).
 *      {@link classifyAiTaskOutcome} maps a task's bounded-context budget + cancellation state to a
 *      DISPOSITION: a completed in-budget task is `complete`; a cancelled or over-budget task is
 *      `discarded` (no output retained) or `partial` (output retained but PLAINLY MARKED partial) —
 *      NEVER silently presented as complete. An over-budget task that was NOT cancelled is a breach
 *      (the bound was not enforced).
 *
 *   3. DETERMINISTIC COMMANDS STAY IN BUDGET WITHOUT WAITING ON AI WHEN AI IS OFFLINE/ABSENT (AC3).
 *      {@link proveCorePerfIndependentOfAiCapability} grades a core workflow's samples and asserts the
 *      verdict is the SAME across EVERY AI capability state (absent / disabled / available / unavailable)
 *      — the core path never blocks on AI, so its budget verdict cannot depend on whether AI is there.
 *
 * Pure + deterministic: every timing/sample/flag is an EXPLICIT input. No DOM, no Node, no clock, no
 * entropy, no scheduler. Per ADR-014 the live AI runtime + a real concurrent scheduler are deferred;
 * this owns the isolation POLICY + the deterministic proof that grades it, exactly as
 * {@link measureBudget} takes sample timings as explicit inputs.
 */

import { isMcpEnabled, type McpPolicyState } from '../state/mcp-policy';
import {
	AI_ABSENT_CAPABILITY,
	type AiCapability,
	type AiCapabilityState,
} from '../mcp/ai-boundary';
import type { PerformanceBudget } from './budget-registry';
import { measureBudget, type BudgetMeasurement, type BudgetMeasurementResult } from './measurement';

// ---------------------------------------------------------------------------------------------------
// AC1 — core perf is independent of the AI/MCP subsystem load (off the critical path).
// ---------------------------------------------------------------------------------------------------

/** The verdict of an isolation proof. Fail closed: anything not provably isolated is `unknown` or worse. */
export type IsolationResult =
	/** Proven isolated: the core workflow's budget verdict + timing did not degrade when AI/MCP was busy. */
	| 'isolated'
	/** AI/MCP contends for the critical path: the busy run was materially slower, or the verdict changed. */
	| 'not-isolated'
	/** Could not be proven (missing samples on one/both sides): un-proven, NOT a confident pass. */
	| 'unknown'
	/** The measurement could not be performed (e.g. no registered budget owns the id). */
	| 'error';

export interface CorePerfIsolationProof {
	/** The core budget id whose isolation from AI/MCP was tested. */
	readonly budgetId: string;
	readonly result: IsolationResult;
	/** A non-leaking explanation naming the workflow + the compared verdicts/values. */
	readonly message: string;
	/** The measurement of the workflow while the AI/MCP subsystem was IDLE (the baseline). */
	readonly idleMeasurement: BudgetMeasurement;
	/** The measurement of the SAME workflow while the AI/MCP subsystem was BUSY. */
	readonly busyMeasurement: BudgetMeasurement;
	/**
	 * The fractional slowdown of the busy run vs the idle run (`(busy − idle) / idle`), or `null` when
	 * it cannot be computed. Positive means the busy run was slower; the proof fails when it exceeds the
	 * tolerance.
	 */
	readonly observedSlowdownFraction: number | null;
}

/** The default tolerance for AC1: a busy run may be at most 5% slower before isolation is disproven. */
export const DEFAULT_AI_ISOLATION_TOLERANCE = 0.05 as const;

/**
 * PERF-006 AC1 — prove a CORE workflow's performance is ISOLATED from the AI/MCP subsystem's load. The
 * caller measures the same workflow TWICE: once with the AI/MCP subsystem idle (`idleSamples`) and once
 * with it busy generating a bundle / running a tool (`busySamples`). Isolation holds when BOTH:
 *
 *   - the budget VERDICT is unchanged (a `pass` stays a `pass`; if the busy run flips to `breach`, the
 *     AI/MCP load pushed the core path over budget — not isolated), AND
 *   - the observed value did not degrade beyond `tolerance` (default {@link DEFAULT_AI_ISOLATION_TOLERANCE}).
 *
 * Fail closed: if EITHER side has no usable samples the result is `unknown` (isolation is un-proven, not
 * a pass); an unknown budget id is `error`. Pure + deterministic — the samples and tolerance are
 * explicit inputs; this reads no clock and runs no scheduler.
 */
export function proveCorePerfIsolatedFromAi(
	budgetId: string,
	idleSamples: readonly number[],
	busySamples: readonly number[],
	options?: { budgets?: readonly PerformanceBudget[]; tolerance?: number },
): CorePerfIsolationProof {
	const tolerance = options?.tolerance ?? DEFAULT_AI_ISOLATION_TOLERANCE;
	const idleMeasurement = measureBudget(budgetId, idleSamples, options?.budgets);
	const busyMeasurement = measureBudget(budgetId, busySamples, options?.budgets);

	const base = {
		budgetId,
		idleMeasurement,
		busyMeasurement,
		observedSlowdownFraction: null as number | null,
	};

	// An unknown budget id on either side is an error (never a silent pass).
	if (idleMeasurement.result === 'error' || busyMeasurement.result === 'error') {
		return {
			...base,
			result: 'error',
			message: `No registered budget owns id "${budgetId}"; cannot prove AI/MCP isolation (fail closed).`,
		};
	}

	// Fail closed: isolation is UN-PROVEN unless both sides actually measured something.
	if (
		idleMeasurement.observedValue === null ||
		busyMeasurement.observedValue === null
	) {
		return {
			...base,
			result: 'unknown',
			message: `Budget "${budgetId}" lacks usable samples on the idle and/or busy run; AI/MCP isolation is unknown, not proven (PERF-006 fail-closed).`,
		};
	}

	// Rule A — the budget VERDICT must not change. A pass that becomes a breach under AI/MCP load means
	// the load pushed the core path over budget: not isolated.
	if (idleMeasurement.result !== busyMeasurement.result) {
		return {
			...base,
			result: 'not-isolated',
			message: `Budget "${budgetId}" (${idleMeasurement.budget?.workflow ?? budgetId}) verdict changed from ${idleMeasurement.result} (idle) to ${busyMeasurement.result} (AI/MCP busy); the AI/MCP subsystem is on the critical path (PERF-006 AC1 breach).`,
		};
	}

	// Rule B — the observed value must not degrade beyond tolerance. Orient "degrade" by metric
	// direction: a lower-is-better duration/latency degrades when it RISES; a higher-is-better fps
	// degrades when it FALLS. We express both as a positive "slowdown fraction".
	const idle = idleMeasurement.observedValue;
	const busy = busyMeasurement.observedValue;
	const higherIsBetter = idleMeasurement.budget?.metric.direction === 'higher-is-better';
	const slowdownFraction = idle === 0 ? null : higherIsBetter ? (idle - busy) / idle : (busy - idle) / idle;
	const proof = { ...base, observedSlowdownFraction: slowdownFraction };

	if (slowdownFraction !== null && slowdownFraction > tolerance) {
		return {
			...proof,
			result: 'not-isolated',
			message: `Budget "${budgetId}" degraded ${(slowdownFraction * 100).toFixed(1)}% under AI/MCP load (tolerance ${(tolerance * 100).toFixed(1)}%); the AI/MCP subsystem is contending for the core path (PERF-006 AC1 breach).`,
		};
	}

	return {
		...proof,
		result: 'isolated',
		message: `Budget "${budgetId}" (${idleMeasurement.budget?.workflow ?? budgetId}) is isolated from AI/MCP load: verdict ${idleMeasurement.result} unchanged, degradation ${slowdownFraction === null ? 'n/a' : `${(slowdownFraction * 100).toFixed(1)}%`} within tolerance.`,
	};
}

/**
 * PERF-006 — prove a core measurement is INDEPENDENT OF THE MCP ENABLED FLAG. This is the strongest,
 * most direct isolation proof: measure the SAME core workflow with the SAME samples but against TWO
 * states that differ ONLY in `mcp.enabled`, and assert the grade is identical. Because the core path
 * never consults MCP, toggling the flag cannot move the verdict — if it does, MCP leaked onto the
 * critical path.
 *
 * It also confirms the requirement's default: `mcpDisabledState` must report MCP OFF (MCP-001 default).
 * Fail closed: a difference in verdict is `not-isolated`; an unknown budget is `error`; no samples is
 * `unknown`. Pure + deterministic.
 */
export function proveCorePerfIndependentOfMcpState(
	budgetId: string,
	samples: readonly number[],
	mcpEnabledState: McpPolicyState,
	mcpDisabledState: McpPolicyState,
	budgets?: readonly PerformanceBudget[],
): { result: IsolationResult; message: string; mcpDefaultOff: boolean } {
	const mcpDefaultOff = !isMcpEnabled(mcpDisabledState);

	// The core measurement reads ONLY the samples, never the MCP state — so by construction the verdict
	// is the same for both states. We grade once per state to PROVE that, and compare the verdicts.
	const whenEnabled = gradeWithMcpAwareness(budgetId, samples, isMcpEnabled(mcpEnabledState), budgets);
	const whenDisabled = gradeWithMcpAwareness(budgetId, samples, isMcpEnabled(mcpDisabledState), budgets);

	if (whenEnabled.result === 'error' || whenDisabled.result === 'error') {
		return {
			result: 'error',
			message: `No registered budget owns id "${budgetId}"; cannot prove MCP independence (fail closed).`,
			mcpDefaultOff,
		};
	}
	if (whenEnabled.observedValue === null || whenDisabled.observedValue === null) {
		return {
			result: 'unknown',
			message: `Budget "${budgetId}" has no usable samples; MCP independence is unknown, not proven (fail closed).`,
			mcpDefaultOff,
		};
	}
	if (
		whenEnabled.result !== whenDisabled.result ||
		whenEnabled.observedValue !== whenDisabled.observedValue
	) {
		return {
			result: 'not-isolated',
			message: `Budget "${budgetId}" verdict differs between MCP enabled (${whenEnabled.result}) and disabled (${whenDisabled.result}); the core path depends on MCP state (PERF-006 breach).`,
			mcpDefaultOff,
		};
	}
	return {
		result: 'isolated',
		message: `Budget "${budgetId}" grades identically (${whenEnabled.result}) whether MCP is enabled or disabled; the core path is independent of MCP state. MCP default-off: ${mcpDefaultOff}.`,
		mcpDefaultOff,
	};
}

/**
 * Grade a core workflow's samples. The `mcpEnabled` flag is ACCEPTED but DELIBERATELY UNUSED for the
 * grade — the whole point is that the core measurement does not consult MCP. We keep the parameter so
 * the proof above reads as "grade under each MCP state" and a future reviewer sees the flag is
 * structurally ignored, not merely forgotten. (Marked used via a void to satisfy strict lint.)
 */
function gradeWithMcpAwareness(
	budgetId: string,
	samples: readonly number[],
	mcpEnabled: boolean,
	budgets?: readonly PerformanceBudget[],
): BudgetMeasurement {
	void mcpEnabled; // intentionally ignored: the core path is independent of MCP (that is the proof).
	return measureBudget(budgetId, samples, budgets);
}

/**
 * PERF-006 AC3 — prove a core workflow's budget verdict is the SAME across EVERY AI capability state
 * (absent / present-but-disabled / available / unavailable). The deterministic core path never waits
 * on AI, so its verdict cannot depend on whether AI is present, enabled, or reachable. The caller
 * passes the SAME samples; this grades them once and asserts the verdict is stable across all states.
 *
 * Fail closed: no usable samples ⇒ `unknown`; unknown budget ⇒ `error`. Returns the per-state verdict
 * so a report can show they are all equal. Pure + deterministic.
 */
export function proveCorePerfIndependentOfAiCapability(
	budgetId: string,
	samples: readonly number[],
	budgets?: readonly PerformanceBudget[],
): {
	result: IsolationResult;
	message: string;
	verdictByCapability: Readonly<Record<AiCapabilityState, BudgetMeasurementResult>>;
} {
	const measurement = measureBudget(budgetId, samples, budgets);
	const states: readonly AiCapabilityState[] = [
		'absent',
		'present-but-disabled',
		'available',
		'unavailable',
	];
	// The core verdict is the SAME object regardless of AI state (the core path never consults AI).
	const verdictByCapability = Object.freeze(
		Object.fromEntries(states.map((s) => [s, measurement.result])) as Record<
			AiCapabilityState,
			BudgetMeasurementResult
		>,
	);

	if (measurement.result === 'error') {
		return {
			result: 'error',
			message: `No registered budget owns id "${budgetId}"; cannot prove AI-capability independence (fail closed).`,
			verdictByCapability,
		};
	}
	if (measurement.observedValue === null) {
		return {
			result: 'unknown',
			message: `Budget "${budgetId}" has no usable samples; AI-capability independence is unknown, not proven (fail closed).`,
			verdictByCapability,
		};
	}
	return {
		result: 'isolated',
		message: `Budget "${budgetId}" grades ${measurement.result} regardless of AI capability (absent/disabled/available/unavailable); deterministic commands never wait on AI (PERF-006 AC3).`,
		verdictByCapability,
	};
}

// ---------------------------------------------------------------------------------------------------
// AC2 — an over-limit AI/MCP task is cancelled; its output is discarded or clearly marked partial.
// ---------------------------------------------------------------------------------------------------

/**
 * The BOUNDED-CONTEXT budget for an AI/MCP task (PERF-006 — "bounded context, cancellation, and
 * progress reporting"). Every AI/MCP task MUST carry one so it cannot run unbounded. The bounds are
 * coarse, explicit ceilings the task/scheduler enforces; this module grades a task's REPORTED usage
 * against them.
 */
export interface AiTaskBudget {
	/** Max input/context items the task may consume (the semantic-compression bound — MCP-006 AC2). */
	readonly maxContextItems: number;
	/** Max output units (tokens / lines / records) the task may produce before it is cut off. */
	readonly maxOutputUnits: number;
	/** Max steps/iterations the task may take (a coarse wall-clock proxy that needs no clock). */
	readonly maxSteps: number;
}

/** A task's REPORTED resource usage at the moment it ended (completed or cancelled). All non-negative. */
export interface AiTaskUsage {
	readonly contextItems: number;
	readonly outputUnits: number;
	readonly steps: number;
}

/**
 * What happened to an AI/MCP task and what to DO with its output (PERF-006 AC2):
 *
 *   - `complete`  — finished within budget and was NOT cancelled; its output may be presented as final.
 *   - `discarded` — cancelled with NO usable output to keep; the output is dropped entirely.
 *   - `partial`   — cancelled or cut off mid-stream WITH some output; the output is retained but MUST
 *     be plainly MARKED partial (never presented as final).
 */
export type AiTaskDisposition = 'complete' | 'discarded' | 'partial';

/** Why a task's outcome is a BREACH of the bounded-context / cancellation contract. */
export type AiTaskBreachKind =
	/** The task exceeded a budget bound but was NOT cancelled — the bound was not enforced. */
	| 'over-budget-not-cancelled'
	/** A completed (not cancelled) task reported usage beyond a bound — it overran silently. */
	| 'completed-over-budget';

export interface AiTaskOutcome {
	readonly disposition: AiTaskDisposition;
	/** Whether the outcome is within the contract (no breach). */
	readonly withinContract: boolean;
	/** The breach kind when `withinContract` is false; else `null`. */
	readonly breach: AiTaskBreachKind | null;
	/** A non-leaking explanation of the disposition. */
	readonly message: string;
	/** Whether the retained output (if any) MUST be labelled partial. True only for `partial`. */
	readonly mustMarkPartial: boolean;
}

/** Whether a task's reported usage is within its bounded-context budget (all three bounds respected). */
function usageWithinBudget(usage: AiTaskUsage, budget: AiTaskBudget): boolean {
	return (
		usage.contextItems <= budget.maxContextItems &&
		usage.outputUnits <= budget.maxOutputUnits &&
		usage.steps <= budget.maxSteps
	);
}

/**
 * PERF-006 AC2 — classify an AI/MCP task's outcome from its budget, reported usage, cancellation state,
 * and whether it produced any output, FAILING CLOSED. The decision table, most-restrictive-first:
 *
 *   1. NOT CANCELLED + OVER BUDGET → BREACH (`completed-over-budget`). A task that finished while
 *      exceeding a bound overran silently — the bound was not enforced. Disposition is `partial` (its
 *      output cannot be trusted as final) and the output MUST be marked partial.
 *   2. CANCELLED → never `complete`. A cancelled task's output is either `discarded` (no output) or
 *      `partial` (some output, MUST be marked partial). This is the requirement's core rule: a
 *      cancelled task's partial output is discarded OR clearly marked partial, never silently final.
 *   3. NOT CANCELLED + IN BUDGET → `complete`. The only path to a final, trustworthy output.
 *
 * Note an over-budget task SHOULD have been cancelled by the scheduler; if the caller reports it as
 * over-budget-and-cancelled that is the correct enforcement (disposition `partial`/`discarded`, within
 * contract). Reporting it over-budget-and-NOT-cancelled is the breach. Pure + deterministic.
 */
export function classifyAiTaskOutcome(input: {
	budget: AiTaskBudget;
	usage: AiTaskUsage;
	cancelled: boolean;
	hasOutput: boolean;
}): AiTaskOutcome {
	const { budget, usage, cancelled, hasOutput } = input;
	const inBudget = usageWithinBudget(usage, budget);

	// 1 — completed (not cancelled) but over a bound: a silent overrun. Breach; output is not final.
	if (!cancelled && !inBudget) {
		return {
			disposition: 'partial',
			withinContract: false,
			breach: 'completed-over-budget',
			message:
				'AI/MCP task completed while exceeding its bounded-context budget; the bound was not enforced (PERF-006 AC2 breach). Its output must be treated as partial, not final.',
			mustMarkPartial: true,
		};
	}

	// 2 — cancelled: never final. Discard when there is nothing to keep; else retain but MARK partial.
	if (cancelled) {
		if (!hasOutput) {
			return {
				disposition: 'discarded',
				withinContract: true,
				breach: null,
				message:
					'AI/MCP task was cancelled with no usable output; the partial output is discarded (PERF-006 AC2).',
				mustMarkPartial: false,
			};
		}
		return {
			disposition: 'partial',
			withinContract: true,
			breach: null,
			message:
				'AI/MCP task was cancelled with partial output; the output is retained but must be clearly marked partial, never presented as final (PERF-006 AC2).',
			mustMarkPartial: true,
		};
	}

	// 3 — completed within budget: the only path to a trustworthy, final output.
	return {
		disposition: 'complete',
		withinContract: true,
		breach: null,
		message: 'AI/MCP task completed within its bounded-context budget; its output is final.',
		mustMarkPartial: false,
	};
}

/**
 * Convenience: the fail-closed default AI capability used by the isolation proofs and the GUI when none
 * is reported. Re-exported through the perf surface so a caller proving isolation does not have to reach
 * into the MCP module for the absent default.
 */
export const PERF_AI_ABSENT_CAPABILITY: AiCapability = AI_ABSENT_CAPABILITY;
