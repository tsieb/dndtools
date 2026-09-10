/** Grade median-of-seven scenario batches; retain the core's tail statistic inside each batch.
 * CI requires a compatible measured baseline and gates drift. Absolute reference-device targets
 * remain diagnostics in CI; local comparisons continue to gate both targets and drift.
 * A millisecond budget whose shift stays inside 1.5 frames grades steady (`RESOLUTION_FLOOR_MS`).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
	repetitions?: number[][];
	scenario: string;
	fixture: string;
	profile: string;
	unavailableReason?: string;
}

interface PerfRunFile {
	schemaVersion: number;
	capturedAt: string;
	commit?: string;
	aggregation?: string;
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
	commit?: string;
	aggregation?: string;
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
	ci: boolean;
	json: string | null;
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
		ci: bare.has('ci'),
		json: flags.get('json') ?? null,
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

/** A missing/invalid batch invalidates the entire observation, never silently shrinks n. */
export function measureCapture(
	budgetId: string,
	capture?: Pick<CapturedBudget, 'samples' | 'repetitions'>,
): BudgetMeasurement {
	if (!capture?.repetitions) return measureBudget(budgetId, capture?.samples ?? []);
	const batches = capture.repetitions;
	const values = batches.map((samples) => measureBudget(budgetId, samples));
	if (
		batches.length < 7 ||
		values.some(
			(value, i) => value.observedValue === null || value.sampleCount !== batches[i].length,
		)
	) {
		return measureBudget(budgetId, []);
	}
	const sorted = values.map((value) => value.observedValue!).sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
	const measured = measureBudget(budgetId, [median]);
	return {
		...measured,
		sampleCount: batches.length,
		message: `Median of ${batches.length} batch statistics: ${measured.message}`,
	};
}

/**
 * Every browser scenario brackets its timing with a painted frame, so millisecond values move in
 * whole 60 Hz frames (≈16.7ms), and a median of seven can flip between one and two frames on
 * unchanged code. At a 6ms baseline a 2ms step is +33%, far past any percentage tolerance. A
 * millisecond budget therefore counts as regressed (or improved) only when it ALSO moved more than
 * 1.5 frames: more than a one-frame flip plus jitter, less than the ≈33ms two-frame shift that is a
 * real change. Budgets of 125ms and up are unaffected (20% of them already exceeds this); frame
 * rates are graded on the percentage alone.
 */
export const RESOLUTION_FLOOR_MS = 1.5 * (1000 / 60);

export function applyResolutionFloor(
	comparison: BaselineComparison,
	unit: string,
): BaselineComparison {
	if (
		unit !== 'ms' ||
		(comparison.verdict !== 'regressed' && comparison.verdict !== 'improved') ||
		comparison.observedValue === null ||
		comparison.baselineValue === null ||
		Math.abs(comparison.observedValue - comparison.baselineValue) > RESOLUTION_FLOOR_MS
	) {
		return comparison;
	}
	return {
		...comparison,
		verdict: 'steady',
		message: `${comparison.message} The shift is within ${RESOLUTION_FLOOR_MS.toFixed(0)}ms (1.5 frames), below what the scenarios resolve, so it grades steady.`,
	};
}

function main(): void {
	const options = parseOptions(process.argv.slice(2));
	if (!existsSync(options.run)) {
		console.error(`No run file at ${options.run}. Capture one first: tsx scripts/perf/capture.ts`);
		process.exitCode = 1;
		return;
	}
	if (!Number.isFinite(options.tolerance) || options.tolerance < 0 || options.tolerance > 1) {
		throw new Error('Tolerance must be a finite fraction between 0 and 1.');
	}
	const run = readJson<PerfRunFile>(options.run);
	const capturedById = new Map(run.budgets.map((entry) => [entry.budgetId, entry]));

	// Grade EVERY registry budget, not just the ones the run happened to contain: a budget whose
	// scenario silently disappeared must show up as unmeasured, not vanish from the report.
	const measurements: BudgetMeasurement[] = PERFORMANCE_BUDGETS.map((budget) =>
		measureCapture(budget.id, capturedById.get(budget.id)),
	);

	if (
		options.ci &&
		(!run.host.ci ||
			run.aggregation !== 'median-of-batches-v1' ||
			!/^[a-f0-9]{40}$/.test(run.commit ?? '') ||
			run.budgets.some((entry) => !entry.repetitions))
	) {
		throw new Error(
			'CI requires a runner capture with commit provenance and seven independent batches.',
		);
	}
	if (options.writeBaseline) {
		if (measurements.some((measurement) => measurement.observedValue === null)) {
			throw new Error('Refusing to write an incomplete baseline.');
		}
		const baseline: PerfBaselineFile = {
			schemaVersion: 1,
			recordedAt: run.capturedAt,
			commit: run.commit,
			aggregation: run.aggregation,
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
		(options.ci
			? baselineFile.host.ci &&
				baselineFile.host.runnerLabel === run.host.runnerLabel &&
				baselineFile.host.cpuModel === run.host.cpuModel &&
				baselineFile.host.cpuCount === run.host.cpuCount &&
				baselineFile.host.os === run.host.os &&
				baselineFile.aggregation === run.aggregation
			: options.compareAcrossHardware || baselineFile.host.cpuModel === run.host.cpuModel);
	const baselineEntries: BudgetBaselineEntry[] = (
		hardwareMatches ? (baselineFile?.budgets ?? []) : []
	)
		.filter(
			(entry): entry is typeof entry & { observedValue: number } =>
				entry.observedValue !== null &&
				Number.isFinite(entry.observedValue) &&
				entry.observedValue > 0,
		)
		.map((entry) => ({ budgetId: entry.budgetId, observedValue: entry.observedValue }));
	const suite = compareSuiteToBaseline(measurements, baselineEntries, options.tolerance);
	const unitById = new Map(measurements.map((m) => [m.budgetId, m.budget?.metric.unit ?? '']));
	const comparisons = suite.comparisons.map((comparison) =>
		applyResolutionFloor(comparison, unitById.get(comparison.budgetId) ?? ''),
	);
	const comparisonById = new Map(comparisons.map((c) => [c.budgetId, c]));

	const recordedById = new Map(
		(baselineFile?.budgets ?? []).map((entry) => [entry.budgetId, entry.observedValue]),
	);
	const baselineInvalid =
		options.ci &&
		(!hardwareMatches ||
			suite.missingBaselineCount > 0 ||
			!/^[a-f0-9]{40}$/.test(baselineFile?.commit ?? '') ||
			baselineFile?.budgets.some(
				(entry) =>
					!Number.isInteger(entry.sampleCount) ||
					entry.sampleCount < 7 ||
					entry.fixture !== capturedById.get(entry.budgetId)?.fixture,
			));
	const rows = measurements.map((measurement) => {
		const captured = capturedById.get(measurement.budgetId);
		const comparison = comparisonById.get(measurement.budgetId)!;
		const unit = measurement.budget?.metric.unit ?? '';
		return {
			budgetId: measurement.budgetId,
			workflow: measurement.budget?.workflow ?? measurement.budgetId,
			owner: measurement.budget?.owner ?? '—',
			verdict: VERDICT_LABEL[measurement.result] ?? measurement.result,
			gateVerdict:
				baselineInvalid || measurement.observedValue === null
					? 'invalid'
					: comparison.verdict === 'regressed'
						? 'breach'
						: 'pass',
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
	const regressions = comparisons.filter((c) => c.verdict === 'regressed');

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
	console.log(
		run.aggregation === 'median-of-batches-v1'
			? 'Observed: median of independent batch statistics; n counts batches, raw samples retained in capture.'
			: 'Observed: legacy pooled samples.',
	);
	if (options.ci)
		console.log('CI gate uses baseline drift; target verdicts are reference-device diagnostics.');
	console.log('');
	for (const row of rows) {
		console.log(
			`  ${(options.ci ? row.gateVerdict.toUpperCase() : row.verdict).padEnd(13)} ${row.budgetId.padEnd(22)} ${row.observed.padStart(10)} / ${row.target.padEnd(10)} baseline ${row.baseline.padStart(10)} (${row.drift}, ${row.driftVerdict})  n=${row.samples}`,
		);
		if (row.note) console.log(`      ${row.note}`);
	}
	console.log('');
	console.log(
		`${measurements.length} budgets · ${breaches.length} target breach${options.ci ? ' (diagnostic)' : ''} · ${regressions.length} regressed · ${unmeasured.length} not measured · ${suite.missingBaselineCount} without a baseline`,
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
			'| Budget | Owner | Gate verdict | Target verdict (diagnostic in CI) | Observed | Target | Baseline | Drift | Batches / legacy samples | Fixture |',
			'| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
			...rows.map(
				(row) =>
					`| ${row.workflow} (\`${row.budgetId}\`) | ${row.owner} | ${options.ci ? row.gateVerdict.toUpperCase() : row.verdict} | ${row.verdict} | ${row.observed} | ${row.target} | ${row.baseline} | ${row.drift} | ${row.samples} | ${row.fixture} |`,
			),
			'',
			`${breaches.length} target breach${options.ci ? ' (diagnostic)' : ''} · ${regressions.length} regressed · ${unmeasured.length} not measured.`,
			'',
		];
		mkdirSync(dirname(options.markdown), { recursive: true });
		writeFileSync(options.markdown, `${lines.join('\n')}\n`, 'utf8');
		console.log(`Wrote ${options.markdown}.`);
	}

	const clean =
		(options.ci || breaches.length === 0) &&
		regressions.length === 0 &&
		unmeasured.length === 0 &&
		!baselineInvalid;
	if (options.json) {
		mkdirSync(dirname(options.json), { recursive: true });
		writeFileSync(
			options.json,
			JSON.stringify(
				{
					commit: run.commit,
					baselineCommit: baselineFile?.commit,
					ci: options.ci,
					clean,
					budgets: rows.map((row) => ({
						budgetId: row.budgetId,
						verdict: options.ci ? row.gateVerdict : row.verdict,
						drift: row.drift,
						targetVerdict: row.verdict,
					})),
				},
				null,
				2,
			),
		);
	}
	if (options.ci)
		console.log(
			'CI gates baseline drift; absolute target verdicts above are reference-device diagnostics.',
		);
	if (!clean) {
		console.error('\nPerf gate FAILED:');
		if (baselineInvalid)
			console.error(
				'CI requires a complete, compatible baseline with at least seven batches per budget.',
			);
		if (!options.ci)
			for (const measurement of breaches) console.error(`  · ${measurement.message}`);
		for (const comparison of regressions) console.error(`  · ${comparison.message}`);
		for (const measurement of unmeasured) console.error(`  · ${measurement.message}`);
		process.exitCode = 1;
		return;
	}
	console.log(
		options.ci
			? 'Perf gate PASSED: every budget measured and no CI baseline regression.'
			: 'Perf gate PASSED: every budget met its target and no budget regressed.',
	);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
