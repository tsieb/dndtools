import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { PERFORMANCE_BUDGETS } from '@dndtools/core';
import { interleavedOrder } from '../../scripts/perf/capture';
import type { BaselineComparison } from '@dndtools/core';
import {
	RESOLUTION_FLOOR_MS,
	applyResolutionFloor,
	decidePolicy,
	measureCapture,
	recordCiBaseline,
	verifyScheduledAgreement,
	type CiBaselineConfig,
	type PerfBaselineFile,
	type PolicyDecision,
	type RunVerdict,
} from '../../scripts/perf/compare';
import { verifyStability } from '../../scripts/perf/stability';

const commit = 'a'.repeat(40);
const baselineCommit = 'b'.repeat(40);
function report() {
	return {
		commit,
		baselineCommit,
		ci: true,
		budgets: PERFORMANCE_BUDGETS.map(({ id }) => ({
			budgetId: id,
			verdict: 'pass',
			drift: '+1.0%',
		})),
	};
}

describe('shared runner performance', () => {
	it('pairs every reference batch with a candidate batch and alternates which runs first', () => {
		const sides = ['reference', 'candidate'] as const;
		const order = Array.from({ length: 7 }, (_, repeat) => interleavedOrder(sides, repeat));
		expect(order.every((pair) => [...pair].sort().join() === 'candidate,reference')).toBe(true);
		expect(order.map((pair) => pair[0])).toEqual([
			'reference',
			'candidate',
			'reference',
			'candidate',
			'reference',
			'candidate',
			'reference',
		]);
		expect(interleavedOrder(['candidate'], 3)).toEqual(['candidate']);
		expect(sides).toEqual(['reference', 'candidate']);
	});
	it('grades a millisecond shift within 1.5 frames steady, whatever percentage it is', () => {
		const compared = (
			budgetId: string,
			observedValue: number,
			baselineValue: number,
			verdict: 'regressed' | 'improved',
		): BaselineComparison => ({
			budgetId,
			verdict,
			observedValue,
			baselineValue,
			driftRatio: (observedValue - baselineValue) / baselineValue,
			message: 'core message.',
		});
		expect(RESOLUTION_FLOOR_MS).toBeCloseTo(25, 5);
		// Observed on unchanged code in one paired run: a 2ms step and a one-frame median flip.
		const search = applyResolutionFloor(compared('search', 8, 6, 'regressed'), 'ms');
		expect(search.verdict).toBe('steady');
		expect(search.driftRatio).toBeCloseTo(1 / 3, 5);
		expect(
			applyResolutionFloor(compared('widget-update', 18.3, 29.9, 'improved'), 'ms').verdict,
		).toBe('steady');
		// The worst one-frame flip still sits inside the floor; two frames is a real change.
		expect(
			applyResolutionFloor(compared('widget-update', 34.4, 17.6, 'regressed'), 'ms').verdict,
		).toBe('steady');
		expect(
			applyResolutionFloor(compared('live-session-delivery', 50, 16.8, 'regressed'), 'ms').verdict,
		).toBe('regressed');
		expect(
			applyResolutionFloor(compared('map-pan-zoom-desktop', 30, 59.9, 'regressed'), 'fps').verdict,
		).toBe('regressed');
	});
	it('rejects minority noisy batches without discarding raw tail semantics', () => {
		const durations = [1000, 1010, 1020, 1030, 1040, 1621, 9000];
		expect(
			measureCapture('scene-first-render', {
				samples: durations,
				repetitions: durations.map((n) => [n]),
			}),
		).toMatchObject({ observedValue: 1030, sampleCount: 7, result: 'pass' });
		const frames = [1, ...Array<number>(19).fill(60)];
		expect(
			measureCapture('map-pan-zoom-desktop', {
				samples: frames,
				repetitions: Array.from({ length: 7 }, () => frames),
			}),
		).toMatchObject({ observedValue: 1, result: 'breach' });
	});
	it('fails closed on insufficient or invalid batches', () => {
		for (const repetitions of [
			Array.from({ length: 6 }, () => [100]),
			[...Array.from({ length: 6 }, () => [100]), []],
			[...Array.from({ length: 6 }, () => [100]), [NaN]],
		]) {
			expect(measureCapture('scene-first-render', { samples: [100], repetitions }).result).toBe(
				'unknown',
			);
		}
	});
	it('accepts agreement and rejects missing drift, changed verdicts, IDs or commits', () => {
		expect(() => verifyStability(Array.from({ length: 5 }, report))).not.toThrow();
		for (const mutate of [
			(r: ReturnType<typeof report>) => {
				r.commit = 'c'.repeat(40);
			},
			(r: ReturnType<typeof report>) => {
				r.budgets[0].drift = '—';
			},
			(r: ReturnType<typeof report>) => {
				r.budgets[0].verdict = 'breach';
			},
			(r: ReturnType<typeof report>) => {
				r.budgets.pop();
			},
		]) {
			const reports = Array.from({ length: 5 }, report);
			mutate(reports[4]);
			expect(() => verifyStability(reports)).toThrow();
		}
		expect(() => verifyStability([report()])).toThrow();
	});
	it('lets a manual run capture any ref with the full history the reference worktree needs', () => {
		const perf = YAML.parse(readFileSync('.github/workflows/perf.yml', 'utf8'));
		const input = perf.on.workflow_dispatch.inputs.ref;
		expect(input).toMatchObject({ required: false, type: 'string', default: '' });
		const checkout = perf.jobs.measure.steps.find((step: { uses?: string }) =>
			step.uses?.startsWith('actions/checkout@'),
		);
		expect(checkout.with).toMatchObject({ ref: '${{ inputs.ref }}', 'fetch-depth': 0 });
		// Two manual runs of different refs, or two PRs against one base, must not cancel each other.
		expect(perf.concurrency.group).toContain('inputs.ref || github.event.pull_request.number');
		expect(perf.concurrency.group).not.toContain('pull_request.base.ref');
	});
	it('encodes both policy modes and lets only the policy step decide the job', () => {
		const perf = YAML.parse(readFileSync('.github/workflows/perf.yml', 'utf8'));
		expect(perf.on.schedule[0].cron).toMatch(/^\d+ \d+ \* \* \*$/);
		expect(perf.on.push.branches).toEqual(['main', 'loop/rc']);
		expect(perf.on.workflow_dispatch.inputs.mode).toMatchObject({
			type: 'choice',
			options: ['scheduled', 'pull-request'],
			default: 'scheduled',
		});
		const mode = perf.jobs.measure.env.PERF_MODE as string;
		expect(mode).toContain("github.event_name == 'schedule'");
		expect(mode).toContain("'scheduled' || 'pull-request'");
		const steps = perf.jobs.measure.steps as Array<{ name?: string; run?: string }>;
		const capture = steps.find((step) => step.run?.includes('scripts/perf/ci.sh'))!;
		expect(capture.run).toContain('PERF_RUNS=5');
		expect(capture.run).toContain('PERF_RUNS=2');
		expect(capture.run).toMatch(/ci\.sh \|\| /);
		const policy = steps.find((step) => step.run?.includes('--policy'))!;
		expect(policy.run).toContain('"$PERF_MODE"');
		expect(policy.run).toContain('$GITHUB_STEP_SUMMARY');
		expect(steps.indexOf(policy)).toBeLessThan(
			steps.findIndex((step) => step.name?.startsWith('Upload')),
		);
	});
	it('writes and grades a real-shaped CI baseline, requires like hardware and detects regression', () => {
		const dir = mkdtempSync(join(tmpdir(), 'perf-ci-test-'));
		try {
			const run = {
				schemaVersion: 1,
				commit,
				aggregation: 'median-of-batches-v1',
				capturedAt: new Date().toISOString(),
				host: {
					ci: true,
					hostname: 'ci-runner',
					os: 'Linux',
					cpuModel: 'test',
					cpuCount: 4,
					runnerLabel: 'github-ubuntu-24.04',
					totalMemoryMb: 16000,
				},
				budgets: PERFORMANCE_BUDGETS.map((budget) => ({
					budgetId: budget.id,
					samples: Array<number>(7).fill(budget.metric.target * 2),
					repetitions: Array.from({ length: 7 }, () => [budget.metric.target * 2]),
					fixture: 'test',
					scenario: 'test',
					profile: 'desktop',
				})),
			};
			const input = join(dir, 'run.json');
			const baseline = join(dir, 'baseline.json');
			const output = join(dir, 'report.json');
			const invoke = (...args: string[]) =>
				spawnSync(
					process.execPath,
					[
						'--import',
						'tsx',
						resolve('scripts/perf/compare.ts'),
						'--ci',
						'--run',
						input,
						'--baseline',
						baseline,
						...args,
					],
					{ encoding: 'utf8' },
				);
			writeFileSync(input, JSON.stringify(run));
			expect(invoke('--write-baseline').status).toBe(0);
			const compared = invoke('--json', output);
			expect(compared.status, compared.stdout + compared.stderr).toBe(0);
			expect(compared.stdout).toContain('0 without a baseline');
			expect(
				JSON.parse(readFileSync(output, 'utf8')).budgets.every(
					(b: { drift: string }) => b.drift === '0.0%',
				),
			).toBe(true);
			run.budgets[0].repetitions = Array.from({ length: 7 }, () => [999999]);
			writeFileSync(input, JSON.stringify(run));
			expect(invoke().status).toBe(1);
			run.host.cpuModel = 'different';
			writeFileSync(input, JSON.stringify(run));
			expect(invoke().status).toBe(1);
			rmSync(baseline);
			expect(invoke().status).toBe(1);
			run.budgets.pop();
			writeFileSync(input, JSON.stringify(run));
			expect(invoke('--write-baseline').status).toBe(1);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	}, 30000);
});

const host = {
	ci: true,
	hostname: 'runner',
	os: 'Linux',
	cpuModel: 'AMD EPYC 7763',
	cpuCount: 4,
	runnerLabel: 'github-ubuntu-24.04',
	totalMemoryMb: 16000,
};
const unrecorded: CiBaselineConfig = {
	schemaVersion: 1,
	referenceCommit: baselineCommit,
	runnerLabel: 'github-ubuntu-24.04',
	aggregation: 'median-of-batches-v1',
	tolerance: 0.2,
	recorded: null,
};
const recorded: CiBaselineConfig = {
	...unrecorded,
	recorded: {
		recordedAt: '2026-09-18T06:17:00.000Z',
		commit,
		referenceCommit: baselineCommit,
		runId: '1',
		host: { runnerLabel: 'github-ubuntu-24.04', os: 'Linux', cpuCount: 4, cpuModels: ['x'] },
		runs: 5,
		budgets: [],
	},
};
function runVerdict(overrides: Record<string, { verdict?: string; targetVerdict?: string }> = {}) {
	return {
		commit,
		baselineCommit,
		ci: true,
		clean: true,
		budgets: PERFORMANCE_BUDGETS.map(({ id }) => ({
			budgetId: id,
			verdict: 'pass',
			drift: '+1.0%',
			targetVerdict: 'PASS',
			...overrides[id],
		})),
	} satisfies RunVerdict;
}

describe('RC-ENG-1.4 performance policy', () => {
	const drifted = { 'app-startup': { verdict: 'breach' } };
	const breached = { 'app-startup': { targetVerdict: 'BREACH' } };

	it('reports and never fails until a baseline is recorded for the runner class', () => {
		for (const mode of ['scheduled', 'pull-request'] as const) {
			const runs = mode === 'scheduled' ? 5 : 2;
			const decision = decidePolicy({
				mode,
				config: unrecorded,
				verdicts: Array.from({ length: runs }, () =>
					runVerdict({ 'app-startup': { verdict: 'breach', targetVerdict: 'BREACH' } }),
				),
				host,
			});
			expect(decision.enforcing).toBe(false);
			expect(decision.failures.length).toBeGreaterThan(0);
			expect(decision.failed).toBe(false);
		}
		// A baseline for another runner class or another pinned reference does not enforce either.
		for (const [config, runner] of [
			[recorded, { ...host, cpuCount: 16 }],
			[{ ...recorded, referenceCommit: 'c'.repeat(40) }, host],
		] as const) {
			const decision = decidePolicy({
				mode: 'scheduled',
				config,
				verdicts: Array.from({ length: 5 }, () => runVerdict(drifted)),
				host: runner,
			});
			expect(decision).toMatchObject({ enforcing: false, failed: false });
		}
	});

	it('fails the scheduled run on drift or disagreement, never on a target breach alone', () => {
		const scheduled = (verdicts: Array<RunVerdict | null>) =>
			decidePolicy({ mode: 'scheduled', config: recorded, verdicts, host });
		const clean = scheduled(Array.from({ length: 5 }, () => runVerdict()));
		expect(clean).toMatchObject({ enforcing: true, binding: 'drift', stable: true, failed: false });
		const targetOnly = scheduled(Array.from({ length: 5 }, () => runVerdict(breached)));
		expect(targetOnly.failed).toBe(false);
		expect(targetOnly.advisories.join()).toContain('app-startup');
		expect(scheduled(Array.from({ length: 5 }, () => runVerdict(drifted))).failed).toBe(true);
		const flipped = scheduled([
			...Array.from({ length: 4 }, () => runVerdict()),
			runVerdict(drifted),
		]);
		expect(flipped).toMatchObject({ stable: false, failed: true });
		expect(scheduled([...Array.from({ length: 4 }, () => runVerdict()), null]).failed).toBe(true);
	});

	it('fails a pull request only on a target breach confirmed by both repeats', () => {
		const pullRequest = (verdicts: Array<RunVerdict | null>) =>
			decidePolicy({ mode: 'pull-request', config: recorded, verdicts, host });
		expect(pullRequest([runVerdict(), runVerdict()])).toMatchObject({
			binding: 'target',
			failed: false,
		});
		expect(pullRequest([runVerdict(drifted), runVerdict(drifted)]).failed).toBe(false);
		const once = pullRequest([runVerdict(breached), runVerdict()]);
		expect(once.failed).toBe(false);
		expect(once.budgets.find((b) => b.budgetId === 'app-startup')?.verdict).toBe(
			'unconfirmed-breach',
		);
		const twice = pullRequest([runVerdict(breached), runVerdict(breached)]);
		expect(twice.failed).toBe(true);
		expect(twice.budgets.find((b) => b.budgetId === 'app-startup')?.verdict).toBe(
			'confirmed-breach',
		);
		// A breach cannot be confirmed by one surviving repeat, and a lost repeat fails closed.
		expect(pullRequest([runVerdict(breached), null]).failed).toBe(true);
		const unmeasured = { search: { targetVerdict: 'NOT MEASURED' } };
		expect(pullRequest([runVerdict(unmeasured), runVerdict(unmeasured)]).failed).toBe(true);
	});

	it('proposes a baseline only from a complete, agreeing scheduled set', () => {
		const reference = (value: number): PerfBaselineFile => ({
			schemaVersion: 1,
			recordedAt: '2026-09-18T06:00:00.000Z',
			commit: baselineCommit,
			aggregation: 'median-of-batches-v1',
			host,
			tolerance: 0.2,
			budgets: PERFORMANCE_BUDGETS.map(({ id, metric }) => ({
				budgetId: id,
				observedValue: value,
				unit: metric.unit,
				sampleCount: 7,
				fixture: 'test',
				scenario: 'test',
			})),
		});
		const references = [100, 104, 99, 250, 101].map(reference);
		const decision = decidePolicy({
			mode: 'scheduled',
			config: unrecorded,
			verdicts: Array.from({ length: 5 }, () => runVerdict()),
			host,
		});
		const proposed = recordCiBaseline(unrecorded, decision, references, '42', 'now');
		expect(proposed?.recorded).toMatchObject({
			commit,
			referenceCommit: baselineCommit,
			runId: '42',
			runs: 5,
			host: { runnerLabel: 'github-ubuntu-24.04', cpuCount: 4, cpuModels: ['AMD EPYC 7763'] },
		});
		expect(proposed?.recorded?.budgets[0]).toMatchObject({ observedValue: 101 });
		// Once landed, the same runner class enforces.
		expect(
			decidePolicy({ ...decision, config: proposed!, verdicts: [runVerdict()], host }).enforcing,
		).toBe(true);
		expect(recordCiBaseline(unrecorded, decision, references.slice(0, 4), null, 'now')).toBeNull();
		expect(
			recordCiBaseline(unrecorded, { ...decision, stable: false }, references, null, 'now'),
		).toBeNull();
	});

	it('checks five scheduled jobs on one commit reached the same decision', () => {
		const decision = (overrides: Record<string, { verdict?: string }> = {}): PolicyDecision =>
			decidePolicy({
				mode: 'scheduled',
				config: recorded,
				verdicts: Array.from({ length: 5 }, () => runVerdict(overrides)),
				host,
			});
		expect(() =>
			verifyScheduledAgreement(Array.from({ length: 5 }, () => decision())),
		).not.toThrow();
		expect(() => verifyScheduledAgreement(Array.from({ length: 4 }, () => decision()))).toThrow();
		expect(() =>
			verifyScheduledAgreement([...Array.from({ length: 4 }, () => decision()), decision(drifted)]),
		).toThrow(/disagree/);
		expect(() =>
			verifyScheduledAgreement([
				...Array.from({ length: 4 }, () => decision()),
				{ ...decision(), commit: 'c'.repeat(40) },
			]),
		).toThrow(/commit/);
	});
});
