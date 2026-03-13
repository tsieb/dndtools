import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { getPnpmCommand, printJson, runCommand } from './lib/command-runner.js';
import {
	collectBundleMetrics,
	readJson,
	summarizeTimings,
	type BuildBaseline,
	type PerformanceBaseline,
	type TestBaseline,
	writeJson,
} from './lib/metrics.js';

type MetricsCategory = 'bundle' | 'build' | 'test' | 'performance';
type CaptureProfile = 'baseline' | 'ci';

type TimedCommand = {
	name: string;
	args: string[];
	env?: NodeJS.ProcessEnv;
};

const DEFAULT_CATEGORIES: MetricsCategory[] = ['bundle', 'build', 'test', 'performance'];

function parseCategories(rawValue: string | undefined): MetricsCategory[] {
	if (!rawValue) {
		return DEFAULT_CATEGORIES;
	}
	const values = rawValue
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean) as MetricsCategory[];
	for (const value of values) {
		if (!DEFAULT_CATEGORIES.includes(value)) {
			throw new Error(`Unsupported metrics category: ${value}`);
		}
	}
	return values;
}

function parseProfile(rawValue: string | undefined): CaptureProfile {
	if (!rawValue || rawValue === 'baseline' || rawValue === 'ci') {
		return rawValue ?? 'baseline';
	}
	throw new Error(`Unsupported metrics capture profile: ${rawValue}`);
}

function getBuildCommands(profile: CaptureProfile): TimedCommand[] {
	const commands: TimedCommand[] = [
		{ name: 'build', args: ['build'] },
		{ name: 'mcp:build', args: ['mcp:build'] },
		{ name: 'desktop:build', args: ['desktop:build'] },
	];
	if (profile === 'baseline') {
		commands.push({
			name: 'desktop:package:dir',
			args: [
				'exec',
				'electron-builder',
				'--config',
				'electron-builder.yml',
				'--dir',
				'--publish',
				'never',
			],
		});
	}
	return commands;
}

function getTestCommands(includeExtended: boolean): TimedCommand[] {
	const commands: TimedCommand[] = [
		{ name: 'test', args: ['test'] },
		{ name: 'test:smoke', args: ['test:smoke'] },
		{ name: 'desktop:test:critical', args: ['desktop:test:critical'] },
		{ name: 'desktop:test:a11y', args: ['desktop:test:a11y'] },
	];
	if (includeExtended) {
		commands.push({ name: 'test:e2e', args: ['test:e2e'] });
		commands.push({ name: 'desktop:test:perf', args: ['desktop:test:perf'] });
		commands.push({ name: 'desktop:test:memory', args: ['desktop:test:memory'] });
	}
	return commands;
}

async function captureTimings(
	commands: TimedCommand[],
	repeats: number,
	outputDir: string,
): Promise<Array<{ name: string; command: string; samplesMs: number[]; p50Ms: number | null }>> {
	const pnpm = getPnpmCommand();
	const results: Array<{
		name: string;
		command: string;
		samplesMs: number[];
		p50Ms: number | null;
	}> = [];

	for (const item of commands) {
		const samplesMs: number[] = [];
		for (let index = 0; index < repeats; index += 1) {
			const logFile = path.join(
				outputDir,
				'logs',
				`${item.name.replaceAll(':', '-')}-run-${index + 1}.log`,
			);
			printJson({
				event: 'metrics_step_started',
				step: item.name,
				run: index + 1,
				repeats,
				logFile,
			});
			const result = await runCommand(pnpm, item.args, { env: item.env, logFile });
			if (result.exitCode !== 0) {
				process.stdout.write(result.stdout);
				process.stderr.write(result.stderr);
				throw new Error(`Command failed: pnpm ${item.args.join(' ')}`);
			}
			samplesMs.push(result.durationMs);
			printJson({
				event: 'metrics_step_finished',
				step: item.name,
				run: index + 1,
				durationMs: result.durationMs,
				logFile,
			});
		}
		results.push(summarizeTimings(item.name, `pnpm ${item.args.join(' ')}`, samplesMs));
	}

	return results;
}

async function capturePerformance(outputDir: string): Promise<PerformanceBaseline> {
	const perfOutputPath = path.join(outputDir, 'performance-current.json');
	const result = await runCommand(getPnpmCommand(), ['desktop:test:perf'], {
		env: {
			PERF_BENCHMARK: '1',
			PERF_RESULTS_PATH: perfOutputPath,
		},
		logFile: path.join(outputDir, 'logs', 'desktop-test-perf.log'),
	});
	if (result.exitCode !== 0) {
		process.stdout.write(result.stdout);
		process.stderr.write(result.stderr);
		throw new Error('desktop:test:perf failed during performance capture.');
	}
	const baseline = await readJson<PerformanceBaseline>(perfOutputPath);
	return {
		...baseline,
		generatedAt: baseline.generatedAt ?? new Date().toISOString(),
	};
}

async function cleanPackagingOutput(repoRoot: string): Promise<void> {
	await fs.rm(path.join(repoRoot, 'dist-desktop'), { recursive: true, force: true });
}

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: {
			categories: { type: 'string' },
			outputDir: { type: 'string' },
			repeats: { type: 'string' },
			profile: { type: 'string' },
			includeExtendedTests: { type: 'boolean' },
			writeBaseline: { type: 'boolean' },
		},
		strict: true,
	});

	const categories = parseCategories(values.categories);
	const profile = parseProfile(values.profile);
	const repeats = Number(values.repeats ?? (profile === 'baseline' ? '3' : '1'));
	if (!Number.isFinite(repeats) || repeats < 1) {
		throw new Error(`Invalid repeats value: ${String(values.repeats)}`);
	}

	const repoRoot = process.cwd();
	const outputDir = path.resolve(
		values.outputDir ?? path.join(repoRoot, 'tmp', 'metrics', 'latest'),
	);
	printJson({
		event: 'metrics_capture_started',
		profile,
		categories,
		repeats,
		outputDir,
	});

	if (categories.includes('build')) {
		const buildBaseline: BuildBaseline = {
			version: 1,
			generatedAt: new Date().toISOString(),
			stages: await captureTimings(getBuildCommands(profile), repeats, outputDir),
		};
		await writeJson(path.join(outputDir, 'build-baseline.json'), buildBaseline);
		if (values.writeBaseline) {
			await writeJson(path.join(repoRoot, 'tests', 'perf', 'build-baseline.json'), buildBaseline);
		}
		await cleanPackagingOutput(repoRoot);
	}

	if (categories.includes('bundle')) {
		if (!categories.includes('build')) {
			const buildResult = await runCommand(getPnpmCommand(), ['build'], {
				logFile: path.join(outputDir, 'logs', 'bundle-build.log'),
			});
			if (buildResult.exitCode !== 0) {
				process.stdout.write(buildResult.stdout);
				process.stderr.write(buildResult.stderr);
				throw new Error('pnpm build failed before bundle metrics collection.');
			}
		}
		const bundleBaseline = await collectBundleMetrics(repoRoot);
		await writeJson(path.join(outputDir, 'bundle-baseline.json'), bundleBaseline);
		if (values.writeBaseline) {
			await writeJson(path.join(repoRoot, 'tests', 'perf', 'bundle-baseline.json'), bundleBaseline);
		}
	}

	if (categories.includes('test')) {
		const testBaseline: TestBaseline = {
			version: 1,
			generatedAt: new Date().toISOString(),
			suites: await captureTimings(
				getTestCommands(values.includeExtendedTests ?? false),
				repeats,
				outputDir,
			),
		};
		await writeJson(path.join(outputDir, 'test-baseline.json'), testBaseline);
		if (values.writeBaseline) {
			await writeJson(path.join(repoRoot, 'tests', 'perf', 'test-baseline.json'), testBaseline);
		}
	}

	if (categories.includes('performance')) {
		const performanceBaseline = await capturePerformance(outputDir);
		await writeJson(path.join(outputDir, 'performance-baseline.json'), performanceBaseline);
		if (values.writeBaseline) {
			await writeJson(
				path.join(repoRoot, 'tests', 'perf', 'performance-baseline.json'),
				performanceBaseline,
			);
		}
	}

	printJson({
		event: 'metrics_capture_finished',
		profile,
		outputDir,
	});
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
