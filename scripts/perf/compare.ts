/** Grade median-of-seven scenario batches; retain the core's tail statistic inside each batch.
 * CI requires a compatible measured baseline and grades drift per run. Absolute reference-device
 * targets remain diagnostics in each run; local comparisons continue to gate both targets and drift.
 * A millisecond budget whose shift stays inside 1.5 frames grades steady (`RESOLUTION_FLOOR_MS`).
 *
 * `--policy <scheduled|pull-request>` turns a set of per-run CI verdicts into the job's one binding
 * verdict (RC-ENG-1.4, see `decidePolicy`); `--agreement <dir>` checks that five scheduled jobs on
 * one commit reached the same decision.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
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
import { verifyStability } from './stability';

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

function parseFlags(argv: readonly string[], bare = new Set<string>()): Map<string, string> {
	const flags = new Map<string, string>();
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
	return flags;
}

function parseOptions(argv: readonly string[]): Options {
	const bare = new Set<string>();
	const flags = parseFlags(argv, bare);
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

/** The per-run verdict file `compare.ts --ci --json` writes. */
export interface RunVerdict {
	commit: string;
	baselineCommit: string;
	ci: boolean;
	clean: boolean;
	budgets: Array<{ budgetId: string; verdict: string; drift: string; targetVerdict: string }>;
}

/** What a scheduled run records about the runner class it measured the reference on. */
export interface RecordedCiBaseline {
	recordedAt: string;
	/** The `main` commit the recording job ran; the values are the pinned reference's. */
	commit: string;
	referenceCommit: string;
	runId: string | null;
	host: { runnerLabel: string; os: string; cpuCount: number; cpuModels: string[] };
	runs: number;
	budgets: Array<{ budgetId: string; unit: string; observedValue: number; runs: number[] }>;
}

/** `tests/perf/baseline.ci.json`: the pinned reference plus, once recorded, its runner class. */
export interface CiBaselineConfig {
	schemaVersion: number;
	referenceCommit: string;
	runnerLabel: string;
	aggregation: string;
	tolerance: number;
	description?: string;
	recorded: RecordedCiBaseline | null;
}

export type PolicyMode = 'scheduled' | 'pull-request';

/** Runs per mode: five for the scheduled agreement check, two interleaved repeats on a PR. */
export const POLICY_RUNS: Record<PolicyMode, number> = { scheduled: 5, 'pull-request': 2 };

export interface PolicyInput {
	mode: PolicyMode;
	config: CiBaselineConfig;
	/** One entry per expected run; `null` where the run left no verdict file. */
	verdicts: Array<RunVerdict | null>;
	host: PerfRunFile['host'] | null;
}

export interface PolicyDecision {
	mode: PolicyMode;
	commit: string | null;
	referenceCommit: string;
	enforcing: boolean;
	enforcement: string;
	/** Which verdict can fail this job once enforcing: drift on the schedule, targets on a PR. */
	binding: 'drift' | 'target';
	stable: boolean | null;
	failed: boolean;
	/** Findings that fail the job when enforcing and are reported as "would fail" otherwise. */
	failures: string[];
	advisories: string[];
	budgets: Array<{
		budgetId: string;
		verdict: string;
		gate: string[];
		target: string[];
		drift: string[];
	}>;
}

/** Why the recorded baseline does (or does not) cover this runner and reference. */
export function enforcementFor(
	config: CiBaselineConfig,
	host: PerfRunFile['host'] | null,
): { enforcing: boolean; reason: string } {
	const recorded = config.recorded;
	if (!recorded) {
		return {
			enforcing: false,
			reason: 'No CI baseline is recorded yet, so this run reports and does not fail.',
		};
	}
	if (recorded.referenceCommit !== config.referenceCommit) {
		return {
			enforcing: false,
			reason: `The recorded baseline measured reference ${recorded.referenceCommit.slice(0, 8)}, but the pinned reference is now ${config.referenceCommit.slice(0, 8)}; record it again before it can gate.`,
		};
	}
	if (
		!host ||
		host.runnerLabel !== recorded.host.runnerLabel ||
		host.os !== recorded.host.os ||
		host.cpuCount !== recorded.host.cpuCount
	) {
		const seen = host ? `${host.runnerLabel}, ${host.cpuCount}× ${host.os}` : 'no capture';
		return {
			enforcing: false,
			reason: `The baseline was recorded on ${recorded.host.runnerLabel} (${recorded.host.cpuCount}× ${recorded.host.os}) and this run is ${seen}, a different runner class; it reports and does not fail.`,
		};
	}
	return {
		enforcing: true,
		reason: `Enforcing: baseline recorded ${recorded.recordedAt} on ${recorded.host.runnerLabel} (${recorded.host.cpuCount} cores) for reference ${recorded.referenceCommit.slice(0, 8)}.`,
	};
}

/**
 * The RC-ENG-1.4 policy. Until a baseline is recorded for the runner class, nothing fails. Once it
 * is, the scheduled run (five paired runs on `main`) fails on drift past tolerance or on runs that
 * disagree, and a pull request (two paired runs) fails only on an absolute target breached in BOTH
 * repeats, or on a budget neither repeat could measure. A PR's drift and a scheduled run's target
 * breaches stay advisory.
 */
export function decidePolicy(input: PolicyInput): PolicyDecision {
	const { mode, config, verdicts, host } = input;
	const { enforcing, reason } = enforcementFor(config, host);
	const present = verdicts.filter((verdict): verdict is RunVerdict => verdict !== null);
	const failures: string[] = [];
	const advisories: string[] = [];
	const missing = verdicts.length - present.length;
	if (missing > 0) failures.push(`${missing} of ${verdicts.length} runs left no verdict.`);
	if (present.some((verdict) => verdict.commit !== present[0].commit || !verdict.ci)) {
		failures.push('The runs do not share one candidate commit in CI mode.');
	}

	let stable: boolean | null = null;
	if (mode === 'scheduled') {
		try {
			if (missing > 0) throw new Error('A run is missing.');
			verifyStability(present);
			stable = true;
		} catch (error) {
			stable = false;
			failures.push(`The five runs do not agree: ${(error as Error).message}`);
		}
	}

	const budgets = PERFORMANCE_BUDGETS.map(({ id }) => {
		const entries = present.map((verdict) => verdict.budgets.find((b) => b.budgetId === id));
		const gate = entries.map((entry) => entry?.verdict ?? 'missing');
		const target = entries.map((entry) => entry?.targetVerdict ?? 'missing');
		const drift = entries.map((entry) => entry?.drift ?? '—');
		const breachedEverywhere =
			present.length >= 2 && missing === 0 && target.every((value) => value === 'BREACH');
		const measuredNowhere = target.every((value) => value !== 'PASS' && value !== 'BREACH');
		let verdict: string;
		if (mode === 'scheduled') {
			verdict = stable ? gate[0] : 'unstable';
			if (gate.includes('breach'))
				failures.push(`${id} drifted past tolerance (${drift.join(', ')}).`);
			if (missing === 0 && gate.includes('invalid'))
				failures.push(`${id} has no valid drift comparison in every run.`);
			if (target.includes('BREACH'))
				advisories.push(
					`${id} breached its absolute target in ${target.filter((t) => t === 'BREACH').length} of ${target.length} runs (diagnostic on the schedule).`,
				);
		} else {
			verdict = measuredNowhere
				? 'unmeasured'
				: breachedEverywhere
					? 'confirmed-breach'
					: target.includes('BREACH')
						? 'unconfirmed-breach'
						: 'pass';
			if (breachedEverywhere)
				failures.push(`${id} breached its absolute target in both interleaved repeats.`);
			else if (target.includes('BREACH'))
				advisories.push(`${id} breached its absolute target in one repeat only; not confirmed.`);
			if (measuredNowhere) failures.push(`${id} was not measured in any repeat.`);
			if (gate.includes('breach'))
				advisories.push(
					`${id} drifted past tolerance (${drift.join(', ')}); drift is advisory on a pull request.`,
				);
		}
		return { budgetId: id, verdict, gate, target, drift };
	});

	return {
		mode,
		commit: present[0]?.commit ?? null,
		referenceCommit: config.referenceCommit,
		enforcing,
		enforcement: reason,
		binding: mode === 'scheduled' ? 'drift' : 'target',
		stable,
		failed: enforcing && failures.length > 0,
		failures,
		advisories,
		budgets,
	};
}

function median(values: readonly number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * The baseline a scheduled run proposes: the pinned reference's five per-run measurements on this
 * runner class, with their median. Only a complete, agreeing set is recordable; the file is an
 * artifact that a delivery PR lands, never a commit the workflow makes.
 */
export function recordCiBaseline(
	config: CiBaselineConfig,
	decision: PolicyDecision,
	references: readonly PerfBaselineFile[],
	runId: string | null,
	recordedAt: string,
): CiBaselineConfig | null {
	if (
		decision.mode !== 'scheduled' ||
		decision.stable !== true ||
		decision.commit === null ||
		references.length !== POLICY_RUNS.scheduled ||
		references.some(
			(reference) =>
				reference.commit !== config.referenceCommit ||
				reference.host.runnerLabel !== references[0].host.runnerLabel ||
				reference.host.os !== references[0].host.os ||
				reference.host.cpuCount !== references[0].host.cpuCount,
		)
	) {
		return null;
	}
	const budgets = PERFORMANCE_BUDGETS.map(({ id }) => {
		const entries = references.map((reference) => reference.budgets.find((b) => b.budgetId === id));
		const runs = entries.map((entry) => entry?.observedValue ?? null);
		if (runs.some((value) => value === null || !Number.isFinite(value))) return null;
		const values = runs as number[];
		return { budgetId: id, unit: entries[0]!.unit, observedValue: median(values), runs: values };
	});
	if (budgets.some((budget) => budget === null)) return null;
	const host = references[0].host;
	return {
		...config,
		recorded: {
			recordedAt,
			commit: decision.commit,
			referenceCommit: config.referenceCommit,
			runId,
			host: {
				runnerLabel: host.runnerLabel,
				os: host.os,
				cpuCount: host.cpuCount,
				cpuModels: [...new Set(references.map((reference) => reference.host.cpuModel))].sort(),
			},
			runs: references.length,
			budgets: budgets as RecordedCiBaseline['budgets'],
		},
	};
}

/** Five scheduled jobs on one commit agree when they reach the same decision on every budget. */
export function verifyScheduledAgreement(decisions: readonly PolicyDecision[]): void {
	if (decisions.length < POLICY_RUNS.scheduled) {
		throw new Error(
			`At least ${POLICY_RUNS.scheduled} scheduled runs are required; found ${decisions.length}.`,
		);
	}
	const first = decisions[0];
	const signature = (decision: PolicyDecision) =>
		JSON.stringify({
			failed: decision.failed,
			enforcing: decision.enforcing,
			budgets: decision.budgets.map(({ budgetId, verdict }) => ({ budgetId, verdict })),
		});
	for (const decision of decisions) {
		if (decision.mode !== 'scheduled' || decision.stable !== true) {
			throw new Error('Every run must be a scheduled run whose own five captures agree.');
		}
		if (
			decision.commit === null ||
			decision.commit !== first.commit ||
			decision.referenceCommit !== first.referenceCommit
		) {
			throw new Error('The scheduled runs do not share one candidate and reference commit.');
		}
		if (signature(decision) !== signature(first)) {
			throw new Error('The scheduled runs disagree on the binding verdict or a budget verdict.');
		}
	}
}

function policyMarkdown(decision: PolicyDecision, recorded: boolean): string {
	const lines = [
		`# Performance policy: ${decision.mode}`,
		'',
		`Candidate \`${decision.commit ?? 'unknown'}\` against pinned reference \`${decision.referenceCommit}\`.`,
		'',
		decision.enforcement,
		'',
		`Binding verdict for this mode: **${decision.binding === 'drift' ? 'drift past tolerance across five agreeing runs' : 'an absolute target breached in both interleaved repeats'}**.`,
		'',
		`**${decision.failed ? 'FAILED' : decision.enforcing ? 'PASSED' : decision.failures.length ? 'ADVISORY (would fail once enforcing)' : 'ADVISORY (clean)'}**`,
		'',
		'| Budget | Verdict | Drift gate per run | Target per run | Drift per run |',
		'| --- | --- | --- | --- | --- |',
		...decision.budgets.map(
			(b) =>
				`| \`${b.budgetId}\` | ${b.verdict} | ${b.gate.join(', ')} | ${b.target.join(', ')} | ${b.drift.join(', ')} |`,
		),
		'',
	];
	if (decision.failures.length) {
		lines.push(decision.enforcing ? '## Failures' : '## Would fail once enforcing', '');
		lines.push(...decision.failures.map((failure) => `- ${failure}`), '');
	}
	if (decision.advisories.length) {
		lines.push('## Advisory', '', ...decision.advisories.map((advisory) => `- ${advisory}`), '');
	}
	if (recorded) {
		lines.push(
			'A baseline candidate for this runner class is in the artifact as `baseline.ci.json`. Land it through the delivery PR to switch enforcement on.',
			'',
		);
	}
	lines.push(
		'Per-run reports (`report-N.md`), captures and baselines are in the `perf-run` artifact.',
		'',
	);
	return `${lines.join('\n')}\n`;
}

function readJsonIfPresent<T>(path: string): T | null {
	return existsSync(path) ? readJson<T>(path) : null;
}

function runPolicy(flags: Map<string, string>): void {
	const mode = flags.get('policy');
	if (mode !== 'scheduled' && mode !== 'pull-request') {
		throw new Error('--policy takes scheduled or pull-request.');
	}
	const dir = resolve(flags.get('dir') ?? join(REPO_ROOT, 'tmp/perf'));
	const configPath = flags.get('config') ?? join(REPO_ROOT, 'tests/perf/baseline.ci.json');
	const config = readJson<CiBaselineConfig>(configPath);
	const runs = POLICY_RUNS[mode];
	const verdicts = Array.from({ length: runs }, (_, i) =>
		readJsonIfPresent<RunVerdict>(join(dir, `verdict-${i + 1}.json`)),
	);
	const host =
		Array.from({ length: runs }, (_, i) =>
			readJsonIfPresent<PerfRunFile>(join(dir, `current-${i + 1}.json`)),
		).find((run) => run !== null)?.host ?? null;
	const decision = decidePolicy({
		mode,
		config: { ...config, recorded: config.recorded ?? null },
		verdicts,
		host,
	});
	const references = Array.from({ length: runs }, (_, i) =>
		readJsonIfPresent<PerfBaselineFile>(join(dir, `baseline-${i + 1}.json`)),
	).filter((reference): reference is PerfBaselineFile => reference !== null);
	const proposed =
		mode === 'scheduled'
			? recordCiBaseline(
					config,
					decision,
					references,
					flags.get('run-id') ?? null,
					new Date().toISOString(),
				)
			: null;
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, 'policy.json'), `${JSON.stringify(decision, null, 2)}\n`);
	if (proposed) {
		writeFileSync(join(dir, 'baseline.ci.json'), `${JSON.stringify(proposed, null, '\t')}\n`);
	}
	const markdown = policyMarkdown(decision, proposed !== null);
	writeFileSync(join(dir, 'policy.md'), markdown);
	const summary = flags.get('summary');
	if (summary) writeFileSync(summary, markdown, { flag: 'a' });
	console.log(markdown);
	if (decision.failed) process.exitCode = 1;
}

function runAgreement(dir: string): void {
	const root = resolve(dir);
	const decisions = readdirSync(root, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, 'policy.json')))
		.map((entry) => readJson<PolicyDecision>(join(root, entry.name, 'policy.json')));
	verifyScheduledAgreement(decisions);
	console.log(
		`${decisions.length} scheduled runs of ${decisions[0].commit} agree: ${decisions[0].failed ? 'FAILED' : 'PASSED'}${decisions[0].enforcing ? '' : ' (advisory)'} on all ${decisions[0].budgets.length} budgets.`,
	);
}

function main(): void {
	const argv = process.argv.slice(2);
	const policyAt = argv.indexOf('--policy');
	const agreementAt = argv.indexOf('--agreement');
	if (agreementAt >= 0) return runAgreement(argv[agreementAt + 1] ?? '');
	if (policyAt >= 0) return runPolicy(parseFlags(argv));
	const options = parseOptions(argv);
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
			'This is one run. The binding CI verdict is the policy step (compare.ts --policy), which decides per mode which of drift or target can fail the job.',
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
