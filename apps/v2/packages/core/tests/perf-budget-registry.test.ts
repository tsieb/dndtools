import { describe, expect, it } from 'vitest';
import {
	LIVE_SESSION_DELIVERY_BUDGET_ID,
	PERFORMANCE_BUDGETS,
	PERFORMANCE_BUDGET_REGISTRY_VERSION,
	budgetForId,
	budgetsForOwner,
	validateBudgetRegistry,
	type BudgetApprovedException,
	type BudgetProblem,
	type PerformanceBudget,
} from '../src/index';

// An explicit "today" so review-window checks are deterministic — no Date.now() anywhere.
const TODAY = '2026-06-05';

function kinds(problems: BudgetProblem[]): string[] {
	return problems.map((p) => p.kind).sort();
}

describe('PERF-001 performance-budget registry — ownership + qualification', () => {
	it('declares every workflow named by the PERF-007 budget artifact (AC1)', () => {
		const ids = new Set(PERFORMANCE_BUDGETS.map((b) => b.id));
		for (const id of [
			'smoke-ci',
			'app-startup',
			'vault-open',
			'scene-first-render',
			'widget-update',
			'map-pan-zoom-desktop',
			'map-pan-zoom-slim',
			'search',
			'graph-indexing',
			'sync-reconciliation',
		]) {
			expect(ids.has(id), `missing budget "${id}"`).toBe(true);
		}
	});

	it('every budget is owned and carries a user-facing risk (AC2)', () => {
		for (const budget of PERFORMANCE_BUDGETS) {
			expect(budget.owner.trim()).not.toBe('');
			expect(budget.userFacingRisk.trim()).not.toBe('');
		}
	});

	it('every provisional budget declares dataset, device class, and review date — never "fast enough" (AC3)', () => {
		for (const budget of PERFORMANCE_BUDGETS) {
			expect(budget.dataset.trim()).not.toBe('');
			expect(budget.deviceClass.trim()).not.toBe('');
			if (budget.maturity.kind === 'provisional') {
				expect(budget.maturity.reviewDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			}
		}
	});

	it('the canonical registry validates clean as of its review date', () => {
		expect(validateBudgetRegistry({ today: TODAY })).toEqual([]);
	});

	it('budgetForId resolves a declared budget and returns null for an unknown id (fail-closed signal)', () => {
		expect(budgetForId('app-startup')?.owner).toBe('Platform');
		expect(budgetForId('does-not-exist')).toBeNull();
	});

	it('budgetsForOwner returns a domain’s budgets case-insensitively (AC1 planning lookup)', () => {
		const mapsLower = budgetsForOwner('maps');
		const mapsExact = budgetsForOwner('Maps');
		expect(mapsLower.map((b) => b.id).sort()).toEqual(['map-pan-zoom-desktop', 'map-pan-zoom-slim']);
		expect(mapsExact).toEqual(mapsLower);
		expect(budgetsForOwner('Nobody')).toEqual([]);
	});

	it('exposes a registry version', () => {
		expect(PERFORMANCE_BUDGET_REGISTRY_VERSION).toBe(1);
	});
});

describe('PERF-001 validateBudgetRegistry — fail closed', () => {
	const ok: PerformanceBudget = {
		id: 'unit-test',
		workflow: 'Unit test workflow',
		owner: 'Platform',
		userFacingRisk: 'Risk text.',
		dataset: 'A dataset',
		deviceClass: 'Desktop reference',
		metric: { kind: 'latency-ms-p95', direction: 'lower-is-better', target: 100, unit: 'ms', percentile: 95 },
		maturity: { kind: 'provisional', reviewDate: '2026-12-31' },
	};

	it('accepts a fully-qualified budget', () => {
		expect(validateBudgetRegistry({ budgets: [ok], today: TODAY })).toEqual([]);
	});

	it('rejects a budget with no owner (AC2 — a breach must name an owner)', () => {
		const problems = validateBudgetRegistry({ budgets: [{ ...ok, owner: '  ' }], today: TODAY });
		expect(kinds(problems)).toContain('missing-owner');
	});

	it('rejects a budget with no user-facing risk (AC2)', () => {
		const problems = validateBudgetRegistry({ budgets: [{ ...ok, userFacingRisk: '' }], today: TODAY });
		expect(kinds(problems)).toContain('missing-user-facing-risk');
	});

	it('rejects a provisional budget missing dataset / device class — the "fast enough" trap (AC3)', () => {
		const problems = validateBudgetRegistry({
			budgets: [{ ...ok, dataset: '', deviceClass: '' }],
			today: TODAY,
		});
		expect(kinds(problems)).toEqual(['missing-dataset', 'missing-device-class']);
	});

	it('flags a provisional budget whose review date has already passed (AC3)', () => {
		const stale: PerformanceBudget = {
			...ok,
			maturity: { kind: 'provisional', reviewDate: '2025-01-01' },
		};
		const problems = validateBudgetRegistry({ budgets: [stale], today: TODAY });
		expect(kinds(problems)).toContain('review-window-expired');
	});

	it('does not flag a provisional review date exactly today (boundary — due today is not yet overdue)', () => {
		const dueToday: PerformanceBudget = {
			...ok,
			maturity: { kind: 'provisional', reviewDate: TODAY },
		};
		expect(validateBudgetRegistry({ budgets: [dueToday], today: TODAY })).toEqual([]);
	});

	it('rejects an invalid review-date format', () => {
		const problems = validateBudgetRegistry({
			budgets: [{ ...ok, maturity: { kind: 'provisional', reviewDate: '12/31/2026' } }],
			today: TODAY,
		});
		expect(kinds(problems)).toContain('invalid-review-date');
	});

	it('rejects a non-positive or non-finite metric target', () => {
		const zero = validateBudgetRegistry({ budgets: [{ ...ok, metric: { ...ok.metric, target: 0 } }], today: TODAY });
		expect(kinds(zero)).toContain('invalid-target');
		const nan = validateBudgetRegistry({ budgets: [{ ...ok, metric: { ...ok.metric, target: NaN } }], today: TODAY });
		expect(kinds(nan)).toContain('invalid-target');
	});

	it('rejects a percentile metric with an out-of-range / missing percentile', () => {
		const missing = validateBudgetRegistry({
			budgets: [{ ...ok, metric: { kind: 'latency-ms-p95', direction: 'lower-is-better', target: 100, unit: 'ms' } }],
			today: TODAY,
		});
		expect(kinds(missing)).toContain('invalid-percentile');
		const tooBig = validateBudgetRegistry({
			budgets: [{ ...ok, metric: { ...ok.metric, percentile: 150 } }],
			today: TODAY,
		});
		expect(kinds(tooBig)).toContain('invalid-percentile');
	});

	it('does not require a percentile for a single-shot duration-ms metric', () => {
		const duration: PerformanceBudget = {
			...ok,
			metric: { kind: 'duration-ms', direction: 'lower-is-better', target: 2000, unit: 'ms' },
		};
		expect(validateBudgetRegistry({ budgets: [duration], today: TODAY })).toEqual([]);
	});

	it('rejects duplicate budget ids', () => {
		const problems = validateBudgetRegistry({ budgets: [ok, ok], today: TODAY });
		expect(kinds(problems)).toContain('duplicate-id');
	});

	it('validates a baselined budget’s measuredAt date', () => {
		const baseline: PerformanceBudget = { ...ok, maturity: { kind: 'baseline', measuredAt: 'nope' } };
		const problems = validateBudgetRegistry({ budgets: [baseline], today: TODAY });
		expect(kinds(problems)).toContain('invalid-baseline-date');
		const goodBaseline: PerformanceBudget = { ...ok, maturity: { kind: 'baseline', measuredAt: '2026-06-01' } };
		expect(validateBudgetRegistry({ budgets: [goodBaseline], today: TODAY })).toEqual([]);
	});

	it('is deterministic — identical input yields identical problems', () => {
		const bad: PerformanceBudget = { ...ok, owner: '', userFacingRisk: '' };
		const a = validateBudgetRegistry({ budgets: [bad], today: TODAY });
		const b = validateBudgetRegistry({ budgets: [bad], today: TODAY });
		expect(a).toEqual(b);
	});
});

describe('PERF-001 migration — COLLAB live-session budget now references the registry', () => {
	it('the live-session delivery budget is owned in the registry', () => {
		const budget = budgetForId(LIVE_SESSION_DELIVERY_BUDGET_ID);
		expect(budget).not.toBeNull();
		expect(budget?.owner).toBe('Collaboration');
		expect(budget?.metric.target).toBe(500);
	});
});

// ---------------------------------------------------------------------------
// PERF-007 AC1 — approved temporary exception mechanism
// ---------------------------------------------------------------------------
// A budget may declare an approvedException when the workflow is temporarily
// expected to breach its target (e.g. CI migration). The exception does NOT
// waive the budget — the measurement verdict is still 'breach' — but it lets
// CI reporters distinguish a known deviation from a surprise. validateBudgetRegistry
// flags expired exceptions so they cannot silently outlive their approval window.
describe('PERF-007 AC1 — approved temporary exception mechanism', () => {
	const ok: PerformanceBudget = {
		id: 'unit-test',
		workflow: 'Unit test workflow',
		owner: 'Platform',
		userFacingRisk: 'Risk text.',
		dataset: 'A dataset',
		deviceClass: 'Desktop reference',
		metric: { kind: 'duration-ms', direction: 'lower-is-better', target: 1000, unit: 'ms' },
		maturity: { kind: 'provisional', reviewDate: '2026-12-31' },
	};

	it('a budget with no approvedException validates clean (the common case)', () => {
		expect(ok.approvedException).toBeUndefined();
		expect(validateBudgetRegistry({ budgets: [ok], today: TODAY })).toEqual([]);
	});

	it('the canonical smoke-ci budget has no approvedException — it is within its target', () => {
		const smokeBudget = budgetForId('smoke-ci');
		expect(smokeBudget).not.toBeNull();
		expect(smokeBudget?.approvedException).toBeUndefined();
		// Confirming the target is the documented 3-minute ceiling (PERF-007 table).
		expect(smokeBudget?.metric.target).toBe(3 * 60 * 1000);
	});

	it('a budget with a future approvedException validates clean (active exception is allowed)', () => {
		const exception: BudgetApprovedException = {
			reason: 'CI runner migration; target re-verified after migration completes.',
			expiresOn: '2027-01-01',
		};
		const withException: PerformanceBudget = { ...ok, approvedException: exception };
		expect(validateBudgetRegistry({ budgets: [withException], today: TODAY })).toEqual([]);
	});

	it('a budget with an approvedException expiring exactly today is still valid (boundary)', () => {
		const exception: BudgetApprovedException = { reason: 'Known slow environment.', expiresOn: TODAY };
		expect(
			validateBudgetRegistry({ budgets: [{ ...ok, approvedException: exception }], today: TODAY }),
		).toEqual([]);
	});

	it('flags an expired approvedException (approved-exception-expired)', () => {
		const exception: BudgetApprovedException = {
			reason: 'Legacy slow runner.',
			expiresOn: '2025-01-01', // long past
		};
		const withExpired: PerformanceBudget = { ...ok, approvedException: exception };
		const problems = validateBudgetRegistry({ budgets: [withExpired], today: TODAY });
		expect(kinds(problems)).toContain('approved-exception-expired');
		expect(problems[0]!.message).toContain('2025-01-01');
	});

	it('flags an approvedException with an invalid expiresOn date format', () => {
		const exception: BudgetApprovedException = { reason: 'Bad format.', expiresOn: '01/01/2027' };
		const problems = validateBudgetRegistry({
			budgets: [{ ...ok, approvedException: exception }],
			today: TODAY,
		});
		expect(kinds(problems)).toContain('approved-exception-expired');
	});

	it('flags an approvedException with an empty reason', () => {
		const exception: BudgetApprovedException = { reason: '   ', expiresOn: '2027-01-01' };
		const problems = validateBudgetRegistry({
			budgets: [{ ...ok, approvedException: exception }],
			today: TODAY,
		});
		expect(kinds(problems)).toContain('approved-exception-expired');
	});
});
