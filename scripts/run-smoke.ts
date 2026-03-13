import path from 'node:path';
import { getPnpmCommand, printJson, runCommand } from './lib/command-runner.js';

const STEPS = [
	{ name: 'format', args: ['format:check'] },
	{ name: 'lint', args: ['lint'] },
	{ name: 'typecheck', args: ['typecheck'] },
	{ name: 'critical-tests', args: ['test:critical'] },
] as const;

async function main(): Promise<void> {
	const outputDir = path.join(
		process.cwd(),
		'tmp',
		'smoke',
		new Date().toISOString().replaceAll(':', '-'),
	);
	const pnpm = getPnpmCommand();

	printJson({ event: 'smoke_started', outputDir, stepCount: STEPS.length });

	const results = await Promise.all(
		STEPS.map(async (step) => {
			const logFile = path.join(outputDir, `${step.name}.log`);
			printJson({ event: 'step_started', step: step.name, logFile });
			const result = await runCommand(pnpm, step.args, { logFile });
			printJson({
				event: 'step_finished',
				step: step.name,
				logFile,
				exitCode: result.exitCode,
				durationMs: result.durationMs,
			});
			return {
				name: step.name,
				logFile,
				exitCode: result.exitCode,
				durationMs: result.durationMs,
				stdout: result.stdout,
				stderr: result.stderr,
			};
		}),
	);

	const failed = results.find((result) => result.exitCode !== 0);
	if (failed) {
		process.stdout.write(failed.stdout);
		process.stderr.write(failed.stderr);
		printJson({ event: 'smoke_failed', outputDir, failedStep: failed.name, results });
		process.exit(failed.exitCode);
	}

	printJson({
		event: 'smoke_finished',
		outputDir,
		totalDurationMs: Math.max(...results.map((result) => result.durationMs)),
		results,
	});
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
