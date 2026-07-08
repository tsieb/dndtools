import { describe, expect, it } from 'vitest';
import {
	QUALITY_GATES,
	QUALITY_GATE_BUDGETS,
	REVIEW_WINDOW_DAYS,
	SMOKE_TARGET_MS,
	checkBudgets,
	pathMatchesGlob,
	selectGatesForPaths,
	tierBudget,
	validateGateRegistry,
	type QualityGate,
	type QualityGateTier,
} from '../src/index';

const ALL_SCRIPTS = new Set(QUALITY_GATES.map((gate) => gate.script));
const TODAY = '2026-06-04';

describe('PLAT-010 quality-gate registry', () => {
	it('every declared tier has a configured time budget (AC3)', () => {
		const budgetTiers = new Set(QUALITY_GATE_BUDGETS.map((b) => b.tier));
		for (const gate of QUALITY_GATES) {
			expect(budgetTiers.has(gate.tier)).toBe(true);
			expect(tierBudget(gate.tier)).not.toBeNull();
		}
	});

	it('keeps the smoke target at three minutes (AC3 headline)', () => {
		expect(SMOKE_TARGET_MS).toBe(3 * 60 * 1000);
		expect(tierBudget('smoke')?.budgetMs).toBe(SMOKE_TARGET_MS);
		// The smoke tier claims no scope exception: it must actually meet the headline target.
		expect(tierBudget('smoke')?.scopeException).toBeNull();
	});

	it('full/release tiers exceed the smoke target only with a declared scope exception (AC3)', () => {
		for (const tier of ['full', 'release'] as QualityGateTier[]) {
			const budget = tierBudget(tier);
			expect(budget).not.toBeNull();
			if (budget && budget.budgetMs > SMOKE_TARGET_MS) {
				expect(budget.scopeException).not.toBeNull();
				expect(budget.scopeException?.length ?? 0).toBeGreaterThan(0);
			}
		}
	});

	it('every gate is owned, justified, and names a defect class (AC2)', () => {
		const problems = validateGateRegistry({ availableScripts: ALL_SCRIPTS, today: TODAY });
		expect(problems).toEqual([]);
		for (const gate of QUALITY_GATES) {
			expect(gate.owner.trim()).not.toBe('');
			expect(gate.reason.trim()).not.toBe('');
			expect(gate.protects.length).toBeGreaterThan(0);
		}
	});

	it('fails closed when a gate has no owner (AC2 negative)', () => {
		const bad: QualityGate = {
			...QUALITY_GATES[0]!,
			id: 'unowned',
			owner: '   ',
		};
		const problems = validateGateRegistry({
			gates: [bad],
			availableScripts: ALL_SCRIPTS,
			today: TODAY,
		});
		expect(problems.some((p) => p.kind === 'missing-owner')).toBe(true);
	});

	it('fails closed when a gate names no defect class (AC2 negative)', () => {
		const bad: QualityGate = { ...QUALITY_GATES[0]!, id: 'no-class', protects: [] };
		const problems = validateGateRegistry({
			gates: [bad],
			availableScripts: ALL_SCRIPTS,
			today: TODAY,
		});
		expect(problems.some((p) => p.kind === 'no-defect-class')).toBe(true);
	});

	it('fails closed when a gate references a script that does not exist', () => {
		const bad: QualityGate = { ...QUALITY_GATES[0]!, id: 'ghost', script: 'does:not:exist' };
		const problems = validateGateRegistry({
			gates: [bad],
			availableScripts: new Set(['lint']),
			today: TODAY,
		});
		expect(problems.some((p) => p.kind === 'unknown-script')).toBe(true);
	});

	it('fails closed when a gate is in a tier without a budget (AC3 negative)', () => {
		const bad = { ...QUALITY_GATES[0]!, id: 'no-budget' } as QualityGate;
		const problems = validateGateRegistry({
			gates: [bad],
			budgets: [], // no budgets configured at all
			availableScripts: ALL_SCRIPTS,
			today: TODAY,
		});
		expect(problems.some((p) => p.kind === 'tier-without-budget')).toBe(true);
	});

	it('fails closed when a gate has not been reviewed within the window (AC4 negative)', () => {
		const stale: QualityGate = {
			...QUALITY_GATES[0]!,
			id: 'stale',
			lastReviewed: '2020-01-01',
		};
		const problems = validateGateRegistry({
			gates: [stale],
			availableScripts: ALL_SCRIPTS,
			today: TODAY,
		});
		const expired = problems.find((p) => p.kind === 'review-window-expired');
		expect(expired).toBeDefined();
		expect(expired?.message).toContain(String(REVIEW_WINDOW_DAYS));
	});

	it('flags duplicate gate ids', () => {
		const dup = QUALITY_GATES[0]!;
		const problems = validateGateRegistry({
			gates: [dup, { ...dup }],
			availableScripts: ALL_SCRIPTS,
			today: TODAY,
		});
		expect(problems.some((p) => p.kind === 'duplicate-id')).toBe(true);
	});
});

describe('PLAT-010 path/tier selection (AC1)', () => {
	it('matches ** globs across directory depth', () => {
		expect(pathMatchesGlob('apps/gm-react/src/screens/Board.tsx', 'apps/gm-react/**')).toBe(true);
		expect(pathMatchesGlob('packages/core/src/index.ts', 'packages/core/**')).toBe(true);
		expect(pathMatchesGlob('docs/x.md', 'apps/gm-react/**')).toBe(false);
	});

	it('matches a root file glob exactly', () => {
		expect(pathMatchesGlob('package.json', 'package.json')).toBe(true);
		expect(pathMatchesGlob('apps/gm-react/package.json', 'package.json')).toBe(false);
	});

	it('selects the platform gates when a change touches the app (AC1)', () => {
		const selected = selectGatesForPaths(['apps/gm-react/src/screens/Foo.tsx']);
		const ids = selected.map((g) => g.id);
		// Unconditional gates (empty selectsOnPaths) plus the apps/gm-react-scoped gates.
		expect(ids).toContain('boundary-lint');
		expect(ids).toContain('check');
		expect(ids).toContain('e2e');
		expect(ids).toContain('critical-tests'); // unconditional
	});

	it('does not select platform-only gates for an unrelated change', () => {
		const selected = selectGatesForPaths(['README.md']);
		const ids = selected.map((g) => g.id);
		expect(ids).not.toContain('boundary-lint');
		expect(ids).not.toContain('e2e');
		// Unconditional gates still run.
		expect(ids).toContain('critical-tests');
		expect(ids).toContain('smoke');
	});
});

describe('PLAT-010 budget enforcement (AC3)', () => {
	it('passes when measured durations are under budget', () => {
		expect(checkBudgets({ critical: 5000, smoke: 120000 })).toEqual([]);
	});

	it('fails closed when a tier exceeds budget with no scope exception', () => {
		const problems = checkBudgets({ smoke: SMOKE_TARGET_MS + 1 });
		expect(problems).toHaveLength(1);
		expect(problems[0]!.kind).toBe('budget-exceeded');
		expect(problems[0]!.gateId).toBe('smoke');
	});

	it('treats the configured budget as the hard ceiling even with a scope exception', () => {
		const fullBudget = QUALITY_GATE_BUDGETS.find((b) => b.tier === 'full')!;
		expect(fullBudget.scopeException).not.toBeNull();
		// The scope exception explains the larger-than-smoke budget; it does NOT waive the
		// configured ceiling, so exceeding it is still reported (fail closed).
		const problems = checkBudgets({ full: fullBudget.budgetMs + 1 });
		expect(problems.some((p) => p.gateId === 'full')).toBe(true);
		// A tier under its own budget is fine.
		expect(checkBudgets({ full: fullBudget.budgetMs - 1 })).toEqual([]);
	});
});
