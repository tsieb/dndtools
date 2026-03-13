import { runCommand } from './lib/command-runner.js';

async function main(): Promise<void> {
	const forwardedArgs = process.argv.slice(2);
	const result = await runCommand(process.execPath, [
		'./node_modules/tsx/dist/cli.mjs',
		'scripts/compare-baselines.ts',
		'--only',
		'performance',
		...forwardedArgs,
	]);

	process.stdout.write(result.stdout);
	process.stderr.write(result.stderr);
	process.exit(result.exitCode);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
