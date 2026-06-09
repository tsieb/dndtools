import { describe, expect, it } from 'vitest';
import {
	DEFAULT_AI_ISOLATION_TOLERANCE,
	EMPTY_MCP_POLICY_STATE,
	classifyAiTaskOutcome,
	computeAiTaskProgress,
	proveCorePerfIndependentOfAiCapability,
	proveCorePerfIndependentOfMcpState,
	proveCorePerfIsolatedFromAi,
	type AiTaskBudget,
	type McpPolicyState,
	type PerformanceBudget,
} from '../src/index';

// A small core-workflow budget so isolation tests do not depend on the canonical numbers.
const WIDGET_UPDATE: PerformanceBudget = {
	id: 'widget-update',
	workflow: 'Widget update',
	owner: 'Canvas',
	userFacingRisk: 'A laggy update.',
	dataset: 'Single command',
	deviceClass: 'Desktop reference',
	metric: { kind: 'latency-ms-p95', direction: 'lower-is-better', target: 100, unit: 'ms', percentile: 95 },
	maturity: { kind: 'provisional', reviewDate: '2026-12-31' },
};
const REGISTRY = [WIDGET_UPDATE];

// MCP disabled is the default; an enabled variant flips ONLY the master switch.
const MCP_DISABLED: McpPolicyState = EMPTY_MCP_POLICY_STATE;
const MCP_ENABLED: McpPolicyState = { ...EMPTY_MCP_POLICY_STATE, enabled: true };

describe('PERF-006 AC1 — core perf is isolated from AI/MCP subsystem load', () => {
	it('a core workflow whose timing does not change under AI/MCP load is ISOLATED', () => {
		const idle = [40, 42, 41, 43];
		const busy = [41, 42, 42, 43]; // essentially identical → within tolerance
		const proof = proveCorePerfIsolatedFromAi('widget-update', idle, busy, { budgets: REGISTRY });
		expect(proof.result).toBe('isolated');
	});

	it('a core workflow that SLOWS materially under AI/MCP load is NOT ISOLATED (breach)', () => {
		const idle = [40, 40, 40, 40];
		const busy = [80, 80, 80, 80]; // 100% slower → far beyond the 5% tolerance
		const proof = proveCorePerfIsolatedFromAi('widget-update', idle, busy, { budgets: REGISTRY });
		expect(proof.result).toBe('not-isolated');
		expect(proof.observedSlowdownFraction).toBeGreaterThan(DEFAULT_AI_ISOLATION_TOLERANCE);
		expect(proof.message).toContain('core path');
	});

	it('a verdict flip (pass→breach) under AI/MCP load is NOT ISOLATED even within timing tolerance noise', () => {
		const idle = [90, 90, 90, 90]; // under the 100ms ceiling → pass
		const busy = [110, 110, 110, 110]; // over the ceiling → breach
		const proof = proveCorePerfIsolatedFromAi('widget-update', idle, busy, { budgets: REGISTRY });
		expect(proof.result).toBe('not-isolated');
		expect(proof.idleMeasurement.result).toBe('pass');
		expect(proof.busyMeasurement.result).toBe('breach');
	});

	it('missing samples on either side is UNKNOWN, never a confident pass (fail closed)', () => {
		expect(proveCorePerfIsolatedFromAi('widget-update', [], [40], { budgets: REGISTRY }).result).toBe(
			'unknown',
		);
		expect(proveCorePerfIsolatedFromAi('widget-update', [40], [], { budgets: REGISTRY }).result).toBe(
			'unknown',
		);
	});

	it('an unknown budget id is an ERROR (never a silent pass)', () => {
		expect(proveCorePerfIsolatedFromAi('ghost', [40], [40], { budgets: REGISTRY }).result).toBe('error');
	});

	it('is deterministic — identical samples yield an identical proof', () => {
		const a = proveCorePerfIsolatedFromAi('widget-update', [40, 41], [40, 41], { budgets: REGISTRY });
		const b = proveCorePerfIsolatedFromAi('widget-update', [40, 41], [40, 41], { budgets: REGISTRY });
		expect(a).toEqual(b);
	});
});

describe('PERF-006 — core perf is independent of the MCP enabled flag (and MCP defaults off)', () => {
	it('a core measurement grades IDENTICALLY whether MCP is enabled or disabled', () => {
		const samples = [40, 45, 50, 90];
		const proof = proveCorePerfIndependentOfMcpState(
			'widget-update',
			samples,
			MCP_ENABLED,
			MCP_DISABLED,
			REGISTRY,
		);
		expect(proof.result).toBe('isolated');
		expect(proof.mcpDefaultOff).toBe(true);
	});

	it('confirms MCP is OFF by default (the disabled state reports MCP off)', () => {
		const proof = proveCorePerfIndependentOfMcpState(
			'widget-update',
			[40],
			MCP_ENABLED,
			MCP_DISABLED,
			REGISTRY,
		);
		expect(proof.mcpDefaultOff).toBe(true);
		// The canonical empty MCP state is disabled — the requirement's default-off invariant.
		expect(EMPTY_MCP_POLICY_STATE.enabled).toBe(false);
	});

	it('no samples is UNKNOWN; unknown budget is ERROR (fail closed)', () => {
		expect(
			proveCorePerfIndependentOfMcpState('widget-update', [], MCP_ENABLED, MCP_DISABLED, REGISTRY).result,
		).toBe('unknown');
		expect(
			proveCorePerfIndependentOfMcpState('ghost', [40], MCP_ENABLED, MCP_DISABLED, REGISTRY).result,
		).toBe('error');
	});
});

describe('PERF-006 AC3 — deterministic commands stay in budget regardless of AI capability (no waiting on AI)', () => {
	it('a core workflow grades the SAME across absent/disabled/available/unavailable AI', () => {
		const proof = proveCorePerfIndependentOfAiCapability('widget-update', [40, 50, 60], REGISTRY);
		expect(proof.result).toBe('isolated');
		const verdicts = Object.values(proof.verdictByCapability);
		expect(new Set(verdicts).size).toBe(1); // every capability state yields the same verdict
		expect(verdicts[0]).toBe('pass');
	});

	it('a breach is reported uniformly across all AI states (the core path still does not wait on AI)', () => {
		const proof = proveCorePerfIndependentOfAiCapability('widget-update', [200, 200, 200], REGISTRY);
		expect(new Set(Object.values(proof.verdictByCapability)).size).toBe(1);
		expect(proof.verdictByCapability.absent).toBe('breach');
		expect(proof.verdictByCapability.available).toBe('breach');
	});

	it('no samples is UNKNOWN; unknown budget is ERROR (fail closed)', () => {
		expect(proveCorePerfIndependentOfAiCapability('widget-update', [], REGISTRY).result).toBe('unknown');
		expect(proveCorePerfIndependentOfAiCapability('ghost', [40], REGISTRY).result).toBe('error');
	});
});

describe('PERF-006 AC2 — an over-limit AI/MCP task is cancelled; its output is discarded or marked partial', () => {
	const budget: AiTaskBudget = { maxContextItems: 50, maxOutputUnits: 1000, maxSteps: 20 };

	it('a completed in-budget task is COMPLETE and final', () => {
		const outcome = classifyAiTaskOutcome({
			budget,
			usage: { contextItems: 10, outputUnits: 200, steps: 5 },
			cancelled: false,
			hasOutput: true,
		});
		expect(outcome.disposition).toBe('complete');
		expect(outcome.withinContract).toBe(true);
		expect(outcome.mustMarkPartial).toBe(false);
	});

	it('a cancelled task WITH output is PARTIAL and must be marked partial (never final)', () => {
		const outcome = classifyAiTaskOutcome({
			budget,
			usage: { contextItems: 30, outputUnits: 500, steps: 10 },
			cancelled: true,
			hasOutput: true,
		});
		expect(outcome.disposition).toBe('partial');
		expect(outcome.mustMarkPartial).toBe(true);
		expect(outcome.withinContract).toBe(true);
	});

	it('a cancelled task with NO output is DISCARDED entirely', () => {
		const outcome = classifyAiTaskOutcome({
			budget,
			usage: { contextItems: 30, outputUnits: 0, steps: 10 },
			cancelled: true,
			hasOutput: false,
		});
		expect(outcome.disposition).toBe('discarded');
		expect(outcome.mustMarkPartial).toBe(false);
	});

	it('a task that finished OVER budget WITHOUT being cancelled is a BREACH (the bound was not enforced)', () => {
		const outcome = classifyAiTaskOutcome({
			budget,
			usage: { contextItems: 100, outputUnits: 5000, steps: 50 }, // every bound exceeded
			cancelled: false,
			hasOutput: true,
		});
		expect(outcome.withinContract).toBe(false);
		expect(outcome.breach).toBe('completed-over-budget');
		expect(outcome.disposition).toBe('partial');
		expect(outcome.mustMarkPartial).toBe(true);
	});

	it('an over-budget task that WAS cancelled is within contract (correct enforcement)', () => {
		const outcome = classifyAiTaskOutcome({
			budget,
			usage: { contextItems: 100, outputUnits: 5000, steps: 50 },
			cancelled: true,
			hasOutput: true,
		});
		expect(outcome.withinContract).toBe(true);
		expect(outcome.disposition).toBe('partial');
	});

	it('a single exceeded bound (steps only) is enough to overrun the budget', () => {
		const outcome = classifyAiTaskOutcome({
			budget,
			usage: { contextItems: 10, outputUnits: 200, steps: 21 }, // steps over by 1
			cancelled: false,
			hasOutput: true,
		});
		expect(outcome.breach).toBe('completed-over-budget');
	});
});

describe('PERF-006 — progress reporting: computeAiTaskProgress reports per-dimension budget fractions', () => {
	const budget: AiTaskBudget = { maxContextItems: 100, maxOutputUnits: 1000, maxSteps: 20 };

	it('a task at zero usage reports all fractions as 0 and is not exceeded', () => {
		const report = computeAiTaskProgress(
			{ contextItems: 0, outputUnits: 0, steps: 0 },
			budget,
		);
		expect(report.contextFraction).toBe(0);
		expect(report.outputFraction).toBe(0);
		expect(report.stepFraction).toBe(0);
		expect(report.overallFraction).toBe(0);
		expect(report.anyExceeded).toBe(false);
	});

	it('overallFraction is the MAX of the three per-dimension fractions', () => {
		// steps is the most constrained: 15/20 = 0.75; context 10/100 = 0.1; output 200/1000 = 0.2.
		const report = computeAiTaskProgress(
			{ contextItems: 10, outputUnits: 200, steps: 15 },
			budget,
		);
		expect(report.stepFraction).toBeCloseTo(0.75);
		expect(report.contextFraction).toBeCloseTo(0.1);
		expect(report.outputFraction).toBeCloseTo(0.2);
		expect(report.overallFraction).toBeCloseTo(0.75);
		expect(report.anyExceeded).toBe(false);
	});

	it('a task at exactly the budget boundary reports fractions of 1.0 and is NOT yet exceeded', () => {
		const report = computeAiTaskProgress(
			{ contextItems: 100, outputUnits: 1000, steps: 20 },
			budget,
		);
		expect(report.contextFraction).toBe(1);
		expect(report.outputFraction).toBe(1);
		expect(report.stepFraction).toBe(1);
		expect(report.overallFraction).toBe(1);
		expect(report.anyExceeded).toBe(false);
	});

	it('any single dimension exceeding 1.0 sets anyExceeded (scheduler must cancel)', () => {
		// steps over by 1 (21/20 = 1.05); others within budget.
		const report = computeAiTaskProgress(
			{ contextItems: 10, outputUnits: 200, steps: 21 },
			budget,
		);
		expect(report.stepFraction).toBeGreaterThan(1);
		expect(report.anyExceeded).toBe(true);
	});

	it('is deterministic — identical (usage, budget) always yields the same report', () => {
		const a = computeAiTaskProgress({ contextItems: 30, outputUnits: 500, steps: 10 }, budget);
		const b = computeAiTaskProgress({ contextItems: 30, outputUnits: 500, steps: 10 }, budget);
		expect(a).toEqual(b);
	});
});
