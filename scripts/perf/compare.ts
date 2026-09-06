/**
 * RC-ENG-1.1 — PERF COMPARE. Grades a run file written by `capture.ts` against BOTH the declared
 * budget targets (PERF-001 registry) and the recorded baseline (`tests/perf/baseline.json`), then
 * prints a report and exits non-zero when the run is not clean.
 *
 * All grading arithmetic lives in `@dndtools/core`'s `perf/measurement` — `measureBudget` for the
 * target verdict, `compareSuiteToBaseline` for the drift verdict. This script only reads files,
 * formats, and decides the exit code, so CI and the app can never disagree about what "breach" means.
 *
 * FAIL CLOSED. The run is NOT clean when any of these hold:
 *   - a budget BREACHED its declared target;
 *   - a budget REGRESSED more than the tolerance against its baseline;
 *   - a budget in the registry is MISSING from the run, or recorded no samples (a scenario that
 *     silently stopped running must not read as green — it grades `unknown`, never `pass`).
 * A budget with no baseline entry yet does not block: its value is reported and recorded so the next
 * run has something to compare against.
 *
 * Usage:
 *   tsx scripts/perf/compare.ts [--run tests/perf/current.json] [--baseline tests/perf/baseline.json]
 *                              [--tolerance 0.2] [--markdown tmp/perf/report.md] [--write-baseline]
 *
 * `--write-baseline` rewrites the baseline file from the run instead of comparing — used deliberately
 * when a baseline is first recorded or re-measured on new hardware, never as a way to silence a
 * regression in the same PR that caused it.
 *
 * DRIFT IS ONLY GRADED ON LIKE HARDWARE. A baseline recorded on a workstation says nothing about a
 * shared CI runner: the difference between the two machines would show up as a 100% "regression" on
 * every run and teach everyone to ignore the gate. When the run's CPU differs from the baseline's,
 * targets are still graded and the observed values are still reported, but drift is not — the report
 * says so in as many words. `--compare-across-hardware` overrides that for a deliberate comparison.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	DEFAULT_BASELINE_TOLERANCE,
	PERFORMANCE_BUDGETS,
	compareSuiteToBaseline,
	measureBudget,
	type BaselineComparison,
	type BudgetBaselineEntry,
	type BudgetMeasurement,
} from '../../packages/core/src/index';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../..');

/** One budget's captured samples, as `capture.ts` writes them. */
interface CapturedBudget {
	budgetId: string;
	samples: number[];
	scenario: string;
	fixture: string;
	profile: string;
	unavailableReason?: string;
}

interface PerfRunFile {
	schemaVersion: number;
	capturedAt: string;
	host: {
		hostname: string;
		os: string;
		cpuCount: number;
		cpuModel: string;
		totalMemoryMb: number;
		ci: boolean;
		runnerLabel: string;
	};
	budgets: CapturedBudget[];
}

/** The recorded baseline: one graded value per budget, plus the hardware it was measured on. */
export interface PerfBaselineFile {
	schemaVersion: number;
	recordedAt: string;
	/** The hardware the baseline was measured on — a baseline is only meaningful against like hardware. */
	host: PerfRunFile['host'];
	/** The regression tolerance the baseline is compared with, as a fraction of the baseline value. */
	tolerance: number;
	budgets: Array<{
		budgetId: string;
		observedValue: number | null;
		unit: string;
		sampleCount: number;
		fixture: string;
		scenario: string;
	}>;
}

interface Options {
	run: string;
	baseline: string;
	tolerance: number;
	markdown: string | null;
	writeBaseline: boolean;
	compareAcrossHardware: boolean;
}

function parseOptions(argv: readonly string[]): Options {
	const flags = new Map<string, string>();
	const bare = new Set<string>();
	for (let i = 0; i < argv.length; i += 1) {
		const token = argv[i];
		if (!token.startsWith('--')) continue;
		const next = argv[i + 1];
		if (next === undefined || next.startsWith('--')) bare.add(token.slice(2));
		else {
			flags.set(token.slice(2), next);
			i += 1;
		}
	}
	return {
		run: flags.get('run') ?? join(REPO_ROOT, 'tests/perf/current.json'),
		baseline: flags.get('baseline') ?? join(REPO_ROOT, 'tests/perf/baseline.json'),
		tolerance: Number(flags.get('tolerance') ?? DEFAULT_BASELINE_TOLERANCE),
		markdown: flags.get('markdown') ?? null,
		writeBaseline: bare.has('write-baseline'),
		compareAcrossHardware: bare.has('compare-across-hardware'),
	};
}

function readJson<T>(path: string): T {
	return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function formatValue(value: number | null, unit: string): string {
	return value === null ? '—' : `${value.toFixed(1)}${unit}`;
}

function formatDrift(comparison: BaselineComparison): string {
	if (comparison.driftRatio === null) return '—';
	const sign = comparison.driftRatio > 0 ? '+' : '';
	return `${sign}${(comparison.driftRatio * 100).toFixed(1)}%`;
}

const VERDICT_LABEL: Record<string, string> = {
	pass: 'PASS',
	breach: 'BREACH',
	unknown: 'NOT MEASURED',
	error: 'ERROR',
};

function main(): void {
	const options = parseOptions(process.argv.slice(2));
	if (!existsSync(options.run)) {
		console.error(`No run file at ${options.run}. Capture one first: tsx scripts/perf/capture.ts`);
		process.exitCode = 1;
		return;
	}
	const run = readJson<PerfRunFile>(options.run);
	const capturedById = new Map(run.budgets.map((entry) => [entry.budgetId, entry]));

	// Grade EVERY registry budget, not just the ones the run happened to contain: a budget whose
	// scenario silently disappeared must show up as unmeasured, not vanish from the report.
	const measurements: BudgetMeasurement[] = PERFORMANCE_BUDGETS.map((budget) =>
		measureBudget(budget.id, capturedById.get(budget.id)?.samples ?? []),
	);

	if (options.writeBaseline) {
		const baseline: PerfBaselineFile = {
			schemaVersion: 1,
			recordedAt: run.capturedAt,
			host: run.host,
			tolerance: options.tolerance,
			budgets: measurements.map((measurement) => {
				const captured = capturedById.get(measurement.budgetId);
				return {
					budgetId: measurement.budgetId,
					observedValue: measurement.observedValue,
					unit: measurement.budget?.metric.unit ?? '',
					sampleCount: measurement.sampleCount,
					fixture: captured?.fixture ?? 'n/a',
					scenario: captured?.scenario ?? captured?.unavailableReason ?? 'not captured',
				};
			}),
		};
		mkdirSync(dirname(options.baseline), { recursive: true });
		writeFileSync(options.baseline, `${JSON.stringify(baseline, null, '\t')}\n`, 'utf8');
		console.log(`Wrote baseline ${options.baseline} from ${options.run}.`);
		return;
	}

	const baselineFile = existsSync(options.baseline)
		? readJson<PerfBaselineFile>(options.baseline)
		: null;
	// A baseline from different hardware cannot separate a code regression from a slower machine, so
	// its values are reported but not graded (see the header note).
	const hardwareMatches =
		baselineFile !== null &&
		(options.compareAcrossHardware || baselineFile.host.cpuModel === run.host.cpuModel);
	const baselineEntries: BudgetBaselineEntry[] = (
		hardwareMatches ? (baselineFile?.budgets ?? []) : []
	)
		.filter(
			(entry): entry is typeof entry & { observedValue: number } => entry.observedValue !== null,
		)
		.map((entry) => ({ budgetId: entry.budgetId, observedValue: entry.observedValue }));
	const suite = compareSuiteToBaseline(measurements, baselineEntries, options.tolerance);
	const comparisonById = new Map(suite.comparisons.map((c) => [c.budgetId, c]));

	const recordedById = new Map(
		(baselineFile?.budgets ?? []).map((entry) => [entry.budgetId, entry.observedValue]),
	);
	const rows = measurements.map((measurement) => {
		const captured = capturedById.get(measurement.budgetId);
		const comparison = comparisonById.get(measurement.budgetId)!;
		const unit = measurement.budget?.metric.unit ?? '';
		return {
			budgetId: measurement.budgetId,
			workflow: measurement.budget?.workflow ?? measurement.budgetId,
			owner: measurement.budget?.owner ?? '—',
			verdict: VERDICT_LABEL[measurement.result] ?? measurement.result,
			observed: formatValue(measurement.observedValue, unit),
			target: formatValue(measurement.target, unit),
			baseline: formatValue(
				comparison.baselineValue ?? recordedById.get(measurement.budgetId) ?? null,
				unit,
			),
			drift: formatDrift(comparison),
			driftVerdict: hardwareMatches ? comparison.verdict : 'not compared (other hardware)',
			samples: measurement.sampleCount,
			fixture: captured?.fixture ?? '—',
			note: captured?.unavailableReason ?? '',
		};
	});

	const breaches = measurements.filter((m) => m.result === 'breach');
	const unmeasured = measurements.filter((m) => m.result === 'unknown' || m.result === 'error');
	const regressions = suite.comparisons.filter((c) => c.verdict === 'regressed');

	console.log(
		`\nPerf run ${run.capturedAt} on ${run.host.runnerLabel} (${run.host.cpuCount}× ${run.host.cpuModel}, ${run.host.os})`,
	);
	if (baselineFile) {
		console.log(
			`Baseline ${baselineFile.recordedAt} from ${baselineFile.host.runnerLabel} (${baselineFile.host.cpuCount}× ${baselineFile.host.cpuModel}), tolerance ${(options.tolerance * 100).toFixed(0)}%`,
		);
		if (!hardwareMatches) {
			console.log(
				`Note: the baseline was measured on ${baselineFile.host.cpuModel} and this run on ${run.host.cpuModel}. Targets are graded; drift is NOT, because it would measure the machine rather than the code. Record a baseline on this hardware (pnpm perf:baseline) or pass --compare-across-hardware.`,
			);
		}
	} else {
		console.log(`No baseline at ${options.baseline}; targets are graded, drift is not.`);
	}
	console.log('');
	for (const row of rows) {
		console.log(
			`  ${row.verdict.padEnd(13)} ${row.budgetId.padEnd(22)} ${row.observed.padStart(10)} / ${row.target.padEnd(10)} baseline ${row.baseline.padStart(10)} (${row.drift}, ${row.driftVerdict})  n=${row.samples}`,
		);
		if (row.note) console.log(`      ${row.note}`);
	}
	console.log('');
	console.log(
		`${measurements.length} budgets · ${breaches.length} breach · ${regressions.length} regressed · ${unmeasured.length} not measured · ${suite.missingBaselineCount} without a baseline`,
	);

	if (options.markdown) {
		const lines = [
			'# Performance run',
			'',
			`Captured ${run.capturedAt} on \`${run.host.runnerLabel}\` (${run.host.cpuCount}× ${run.host.cpuModel}).`,
			baselineFile === null
				? 'No baseline recorded yet; targets are graded, drift is not.'
				: hardwareMatches
					? `Compared against the baseline recorded ${baselineFile.recordedAt} on \`${baselineFile.host.runnerLabel}\`, tolerance ${(options.tolerance * 100).toFixed(0)}%.`
					: `The baseline was recorded on \`${baselineFile.host.runnerLabel}\` (${baselineFile.host.cpuModel}), which is not this runner. Targets are graded; drift is not.`,
			'',
			'| Budget | Owner | Verdict | Observed | Target | Baseline | Drift | Samples | Fixture |',
			'| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
			...rows.map(
				(row) =>
					`| ${row.workflow} (\`${row.budgetId}\`) | ${row.owner} | ${row.verdict}${row.driftVerdict === 'regressed' ? ' · REGRESSED' : ''} | ${row.observed} | ${row.target} | ${row.baseline} | ${row.drift} | ${row.samples} | ${row.fixture} |`,
			),
			'',
			`${breaches.length} breach · ${regressions.length} regressed · ${unmeasured.length} not measured.`,
			'',
		];
		mkdirSync(dirname(options.markdown), { recursive: true });
		writeFileSync(options.markdown, `${lines.join('\n')}\n`, 'utf8');
		console.log(`Wrote ${options.markdown}.`);
	}

	const clean = breaches.length === 0 && regressions.length === 0 && unmeasured.length === 0;
	if (!clean) {
		console.error('\nPerf gate FAILED:');
		for (const measurement of breaches) console.error(`  · ${measurement.message}`);
		for (const comparison of regressions) console.error(`  · ${comparison.message}`);
		for (const measurement of unmeasured) console.error(`  · ${measurement.message}`);
		process.exitCode = 1;
		return;
	}
	console.log('Perf gate PASSED: every budget met its target and no budget regressed.');
}

main();
