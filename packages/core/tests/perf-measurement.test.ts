import { describe, expect, it } from 'vitest';
import {
	measureBudget,
	measureBudgetSuite,
	type BudgetApprovedException,
	type PerformanceBudget,
} from '../src/index';

// A small custom registry so measurement tests do not depend on the canonical budget numbers.
const LATENCY: PerformanceBudget = {
	id: 'lat',
	workflow: 'Latency workflow',
	owner: 'Canvas',
	userFacingRisk: 'A laggy update.',
	dataset: 'Single command',
	deviceClass: 'Desktop reference',
	metric: { kind: 'latency-ms-p95', direction: 'lower-is-better', target: 100, unit: 'ms', percentile: 95 },
	maturity: { kind: 'provisional', reviewDate: '2026-12-31' },
};

const FPS: PerformanceBudget = {
	id: 'fps',
	workflow: 'Frame-rate workflow',
	owner: 'Maps',
	userFacingRisk: 'Stuttery panning.',
	dataset: '4 layers',
	deviceClass: 'Desktop reference',
	metric: { kind: 'throughput-fps-p95', direction: 'higher-is-better', target: 50, unit: 'fps', percentile: 95 },
	maturity: { kind: 'provisional', reviewDate: '2026-12-31' },
};

const DURATION: PerformanceBudget = {
	id: 'dur',
	workflow: 'Smoke CI',
	owner: 'Platform',
	userFacingRisk: 'Slow CI.',
	dataset: 'CI runner',
	deviceClass: 'CI reference runner',
	metric: { kind: 'duration-ms', direction: 'lower-is-better', target: 1000, unit: 'ms' },
	maturity: { kind: 'provisional', reviewDate: '2026-12-31' },
};

const REGISTRY = [LATENCY, FPS, DURATION];

describe('PERF-007 measureBudget — fail closed', () => {
	it('a measurement against an UNKNOWN budget id is an error, never a silent pass', () => {
		const m = measureBudget('not-registered', [10, 20, 30], REGISTRY);
		expect(m.result).toBe('error');
		expect(m.reason).toBe('unknown-budget');
		expect(m.budget).toBeNull();
		expect(m.observedValue).toBeNull();
		expect(m.target).toBeNull();
	});

	it('an empty sample set is UNKNOWN, not a confident pass', () => {
		const m = measureBudget('lat', [], REGISTRY);
		expect(m.result).toBe('unknown');
		expect(m.reason).toBe('no-samples');
		expect(m.sampleCount).toBe(0);
		expect(m.observedValue).toBeNull();
		// The target is still reported so a report can say what was un-proven.
		expect(m.target).toBe(100);
	});

	it('samples that are all non-finite / wrong-signed reduce to UNKNOWN', () => {
		const m = measureBudget('lat', [NaN, Infinity, -5], REGISTRY);
		expect(m.result).toBe('unknown');
		expect(m.sampleCount).toBe(0);
	});

	it('discards non-finite / negative latency samples but grades the rest', () => {
		const m = measureBudget('lat', [10, NaN, -5, 20, Infinity], REGISTRY);
		expect(m.sampleCount).toBe(2);
		expect(m.observedValue).toBe(20);
		expect(m.result).toBe('pass');
	});
});

describe('PERF-007 measureBudget — lower-is-better latency (ceiling)', () => {
	it('a single sample under the target PASSES', () => {
		const m = measureBudget('lat', [42], REGISTRY);
		expect(m.result).toBe('pass');
		expect(m.observedValue).toBe(42);
		expect(m.marginToTarget).toBe(58); // positive = inside budget
	});

	it('EXACTLY at the threshold PASSES (target is inclusive)', () => {
		const m = measureBudget('lat', [100], REGISTRY);
		expect(m.result).toBe('pass');
		expect(m.observedValue).toBe(100);
		expect(m.marginToTarget).toBe(0);
	});

	it('a p95 over the target BREACHES and names the owner + risk', () => {
		// 20 samples: 18 fast, 2 slow → nearest-rank p95 (rank=19) is the 19th smallest = 900.
		const samples = Array.from({ length: 20 }, (_v, i) => (i >= 18 ? 900 : 50));
		const m = measureBudget('lat', samples, REGISTRY);
		expect(m.observedValue).toBe(900);
		expect(m.result).toBe('breach');
		expect(m.marginToTarget).toBe(-800); // negative = over budget
		expect(m.message).toContain('Canvas');
		expect(m.message).toContain('A laggy update.');
	});
});

describe('PERF-007 measureBudget — higher-is-better frame rate (floor)', () => {
	it('a p95 at or above the floor PASSES', () => {
		const m = measureBudget('fps', [60, 58, 55, 62, 59], REGISTRY);
		expect(m.result).toBe('pass');
		expect(m.marginToTarget).toBeGreaterThanOrEqual(0);
	});

	it('EXACTLY at the floor PASSES', () => {
		const m = measureBudget('fps', [50], REGISTRY);
		expect(m.result).toBe('pass');
		expect(m.observedValue).toBe(50);
		expect(m.marginToTarget).toBe(0);
	});

	it('a p95 below the floor BREACHES', () => {
		const m = measureBudget('fps', [20, 22, 25, 18, 30], REGISTRY);
		expect(m.result).toBe('breach');
		expect(m.marginToTarget).toBeLessThan(0);
	});

	it('a non-positive fps sample is discarded (a stalled frame is not a real measurement)', () => {
		const m = measureBudget('fps', [0, 55, 60], REGISTRY);
		expect(m.sampleCount).toBe(2);
		expect(m.result).toBe('pass');
	});
});

describe('PERF-007 measureBudget — duration-ms (one-shot, worst run)', () => {
	it('grades the WORST run so a single slow run breaches the ceiling', () => {
		const pass = measureBudget('dur', [800, 950, 1000], REGISTRY);
		expect(pass.result).toBe('pass');
		expect(pass.observedValue).toBe(1000); // max, and exactly at the ceiling → pass

		const breach = measureBudget('dur', [800, 1200], REGISTRY);
		expect(breach.result).toBe('breach');
		expect(breach.observedValue).toBe(1200);
	});
});

describe('PERF-007 measureBudget — determinism', () => {
	it('identical samples + budget yield identical measurements', () => {
		const samples = [10, 90, 30, 70, 50];
		const a = measureBudget('lat', samples, REGISTRY);
		const b = measureBudget('lat', [...samples], REGISTRY);
		expect(a).toEqual(b);
	});

	it('input order does not change the graded percentile', () => {
		const ascending = measureBudget('lat', [10, 20, 30, 40, 50], REGISTRY);
		const shuffled = measureBudget('lat', [30, 50, 10, 40, 20], REGISTRY);
		expect(ascending.observedValue).toBe(shuffled.observedValue);
		expect(ascending.result).toBe(shuffled.result);
	});
});

describe('PERF-007 measureBudget — against the canonical registry (default budgets)', () => {
	it('grades smoke CI against its real 3-minute ceiling (AC1)', () => {
		const pass = measureBudget('smoke-ci', [2 * 60 * 1000]);
		expect(pass.result).toBe('pass');
		// Confirm the named target is the documented 3-minute threshold.
		expect(pass.target).toBe(3 * 60 * 1000);
		const breach = measureBudget('smoke-ci', [4 * 60 * 1000]);
		expect(breach.result).toBe('breach');
	});

	it('a benchmark names its target, fixture, and platform profile in the measurement output (AC2)', () => {
		const m = measureBudget('search', [120, 130, 140]);
		expect(m.result).toBe('pass');
		// Named target: the threshold value must appear in the message.
		expect(m.target).toBe(250); // search is 250ms p95
		expect(m.message).toContain('250ms'); // named target in message
		// Fixture size must appear in the message.
		expect(m.message).toContain('10,000 indexed records');
		// Platform profile must appear in the message.
		expect(m.message).toContain('Desktop and mobile reference profiles');
	});
});

// ---------------------------------------------------------------------------
// PERF-007 AC1 — approved temporary exception named in breach message
// ---------------------------------------------------------------------------
// When a budget breach has an active approvedException the measurement is still
// 'breach' (exceptions do NOT waive budgets — the measurement is truthful) but
// the message names the exception reason and expiry so CI reporters can
// distinguish a known deviation from a surprise breach.
describe('PERF-007 AC1 — approved exception path in measureBudget', () => {
	const budgetWithException: PerformanceBudget = {
		id: 'exc-test',
		workflow: 'Smoke CI (with exception)',
		owner: 'Platform',
		userFacingRisk: 'Slow CI.',
		dataset: 'CI runner',
		deviceClass: 'CI reference runner',
		metric: { kind: 'duration-ms', direction: 'lower-is-better', target: 1000, unit: 'ms' },
		maturity: { kind: 'provisional', reviewDate: '2026-12-31' },
		approvedException: {
			reason: 'CI runner migration; target re-verified after migration completes.',
			expiresOn: '2027-01-01',
		} satisfies BudgetApprovedException,
	};

	it('a breach with an approved exception is still a breach — exception does NOT waive the budget', () => {
		const m = measureBudget('exc-test', [2000], [budgetWithException]);
		expect(m.result).toBe('breach');
	});

	it('the breach message names the exception reason and expiry (AC1 approved-exception path)', () => {
		const m = measureBudget('exc-test', [2000], [budgetWithException]);
		expect(m.message).toContain('approved exception until 2027-01-01');
		expect(m.message).toContain('CI runner migration');
	});

	it('a passing measurement does not mention the exception (exception note only on breach)', () => {
		const m = measureBudget('exc-test', [500], [budgetWithException]); // under the 1000ms ceiling
		expect(m.result).toBe('pass');
		expect(m.message).not.toContain('approved exception');
	});

	it('a budget without an approvedException does not mention exceptions in the breach message', () => {
		// Re-uses the DURATION fixture from the small registry above (no approvedException).
		const m = measureBudget('dur', [2000], REGISTRY); // breaches the 1000ms ceiling
		expect(m.result).toBe('breach');
		expect(m.message).not.toContain('approved exception');
	});
});

describe('PERF-007 measureBudgetSuite — fail closed across a set', () => {
	it('passes only when every measurement passes', () => {
		const suite = measureBudgetSuite(
			[
				{ budgetId: 'lat', samples: [10, 20] },
				{ budgetId: 'fps', samples: [60, 70] },
				{ budgetId: 'dur', samples: [500] },
			],
			REGISTRY,
		);
		expect(suite.allPassed).toBe(true);
		expect(suite.passCount).toBe(3);
	});

	it('any breach keeps the suite from passing', () => {
		const suite = measureBudgetSuite(
			[
				{ budgetId: 'lat', samples: [10] },
				{ budgetId: 'fps', samples: [10] }, // far below the 50fps floor → breach
			],
			REGISTRY,
		);
		expect(suite.allPassed).toBe(false);
		expect(suite.breachCount).toBe(1);
	});

	it('an unknown (no-samples) measurement keeps the suite from passing — un-proven is not green', () => {
		const suite = measureBudgetSuite(
			[
				{ budgetId: 'lat', samples: [10] },
				{ budgetId: 'dur', samples: [] },
			],
			REGISTRY,
		);
		expect(suite.allPassed).toBe(false);
		expect(suite.unknownCount).toBe(1);
	});

	it('an error (unknown budget) keeps the suite from passing', () => {
		const suite = measureBudgetSuite(
			[
				{ budgetId: 'lat', samples: [10] },
				{ budgetId: 'ghost', samples: [10] },
			],
			REGISTRY,
		);
		expect(suite.allPassed).toBe(false);
		expect(suite.errorCount).toBe(1);
	});

	it('an empty suite does not pass (nothing was proven)', () => {
		expect(measureBudgetSuite([], REGISTRY).allPassed).toBe(false);
	});
});
