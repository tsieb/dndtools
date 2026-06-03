import path from 'node:path';
import { getPnpmCommand, printJson, runCommand } from './lib/command-runner.js';

type AuditProfile = 'quick' | 'full';

type AuditStep = {
	name: string;
	command: string;
	args: string[];
};

const PROFILE_STEPS: Record<AuditProfile, AuditStep[]> = {
	quick: [
		{ name: 'format', command: getPnpmCommand(), args: ['format:check'] },
		{ name: 'lint', command: getPnpmCommand(), args: ['lint'] },
		{ name: 'typecheck', command: getPnpmCommand(), args: ['typecheck'] },
		{ name: 'critical-tests', command: getPnpmCommand(), args: ['test:critical'] },
	],
	full: [
		{ name: 'format', command: getPnpmCommand(), args: ['format:check'] },
		{ name: 'lint', command: getPnpmCommand(), args: ['lint'] },
		{ name: 'typecheck', command: getPnpmCommand(), args: ['typecheck'] },
		{ name: 'unit-tests', command: getPnpmCommand(), args: ['test'] },
		{ name: 'docs-validation', command: getPnpmCommand(), args: ['docs:validate'] },
		{ name: 'browser-e2e', command: getPnpmCommand(), args: ['test:e2e'] },
	],
};

function getProfileFromArg(value: string | undefined): AuditProfile {
	if (value === 'quick' || value === 'full') {
		return value;
	}
	throw new Error(`Expected audit profile "quick" or "full"; received ${value ?? 'nothing'}.`);
}

async function main(): Promise<void> {
	const profile = getProfileFromArg(process.argv[2]);
	const runId = new Date().toISOString().replaceAll(':', '-');
	const outputDir = path.join(process.cwd(), 'tmp', 'audit', profile, runId);
	const steps = PROFILE_STEPS[profile];
	const results: Array<{ name: string; durationMs: number; exitCode: number; logFile: string }> =
		[];

	printJson({ event: 'audit_started', profile, outputDir, stepCount: steps.length });

	for (const step of steps) {
		const logFile = path.join(outputDir, `${step.name}.log`);
		printJson({ event: 'step_started', profile, step: step.name, logFile });
		const result = await runCommand(step.command, step.args, { logFile });
		results.push({
			name: step.name,
			durationMs: result.durationMs,
			exitCode: result.exitCode,
			logFile,
		});
		printJson({
			event: 'step_finished',
			profile,
			step: step.name,
			exitCode: result.exitCode,
			durationMs: result.durationMs,
			logFile,
		});
		if (result.exitCode !== 0) {
			printJson({
				event: 'audit_failed',
				profile,
				failedStep: step.name,
				outputDir,
				results,
			});
			process.exit(result.exitCode);
		}
	}

	printJson({
		event: 'audit_finished',
		profile,
		outputDir,
		totalDurationMs: results.reduce((sum, entry) => sum + entry.durationMs, 0),
		results,
	});
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
