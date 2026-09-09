import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { PERFORMANCE_BUDGETS } from '@dndtools/core';
import { measureCapture } from '../../scripts/perf/compare';
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
