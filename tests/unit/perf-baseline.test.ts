import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PERFORMANCE_BUDGETS, measureBudget } from '@dndtools/core';

// RC-ENG-1.1 — the recorded perf baseline is a tracked artifact the CI gate compares every run
// against, so it has to stay honest on its own terms: one entry per DECLARED budget, values in the
// budget's own unit, and no entry for a budget the registry does not own. A baseline that silently
// loses a budget would make that budget's regression invisible, which is exactly the failure this
// pipeline exists to prevent.

const BASELINE_PATH = fileURLToPath(new URL('../perf/baseline.json', import.meta.url));

interface BaselineEntry {
	budgetId: string;
	observedValue: number | null;
	unit: string;
	sampleCount: number;
	fixture: string;
	scenario: string;
}

interface BaselineFile {
	schemaVersion: number;
	recordedAt: string;
	host: { hostname: string; cpuModel: string; cpuCount: number; runnerLabel: string };
	tolerance: number;
	budgets: BaselineEntry[];
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as BaselineFile;

describe('RC-ENG-1.1 perf baseline', () => {
	it('exists as a tracked artifact', () => {
		expect(existsSync(BASELINE_PATH)).toBe(true);
		expect(baseline.schemaVersion).toBe(1);
		expect(Date.parse(baseline.recordedAt)).not.toBeNaN();
	});

	it('records the hardware it was measured on (a baseline only means something against like hardware)', () => {
		expect(baseline.host.cpuModel.length).toBeGreaterThan(0);
		expect(baseline.host.cpuCount).toBeGreaterThan(0);
		expect(baseline.host.runnerLabel.length).toBeGreaterThan(0);
	});

	it('declares the regression tolerance it is compared with', () => {
		expect(baseline.tolerance).toBeGreaterThan(0);
		expect(baseline.tolerance).toBeLessThanOrEqual(1);
	});

	it('carries exactly one entry per declared budget, and no orphans', () => {
		const declared = PERFORMANCE_BUDGETS.map((budget) => budget.id).sort();
		const recorded = baseline.budgets.map((entry) => entry.budgetId).sort();
		expect(recorded).toEqual(declared);
	});

	it('records every value in its own budget unit, with the samples behind it', () => {
		for (const entry of baseline.budgets) {
			const budget = PERFORMANCE_BUDGETS.find((b) => b.id === entry.budgetId)!;
			expect(entry.unit).toBe(budget.metric.unit);
			if (entry.observedValue === null) {
				// An unmeasured budget is allowed to sit in the baseline as an explicit null — it is the
				// honest record of "not measured yet". It must not pretend to have samples behind it.
				expect(entry.sampleCount).toBe(0);
			} else {
				expect(Number.isFinite(entry.observedValue)).toBe(true);
				expect(entry.observedValue).toBeGreaterThan(0);
				expect(entry.sampleCount).toBeGreaterThan(0);
			}
		}
	});

	it('names the fixture and the scenario behind every value', () => {
		for (const entry of baseline.budgets) {
			expect(entry.fixture.length).toBeGreaterThan(0);
			expect(entry.scenario.length).toBeGreaterThan(0);
		}
	});

	it('grades against the registry without erroring on any recorded id', () => {
		for (const entry of baseline.budgets) {
			if (entry.observedValue === null) continue;
			const measurement = measureBudget(entry.budgetId, [entry.observedValue]);
			expect(measurement.result).not.toBe('error');
		}
	});
});
