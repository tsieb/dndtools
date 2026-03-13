import { getPnpmCommand, runCommand } from './lib/command-runner.js';

async function runStage(name: string, args: string[]): Promise<void> {
	const result = await runCommand(getPnpmCommand(), args);
	if (result.exitCode !== 0) {
		process.stdout.write(result.stdout);
		process.stderr.write(result.stderr);
		throw new Error(`${name} failed with exit code ${result.exitCode}.`);
	}
}

async function main(): Promise<void> {
	const [renderer, mcp] = await Promise.all([
		runStage('renderer build', ['build']),
		runStage('mcp build', ['mcp:build']),
	]);
	void renderer;
	void mcp;
	await runStage('electron bundle', [
		'exec',
		'tsup',
		'electron/main.ts',
		'electron/preload.ts',
		'--format',
		'cjs',
		'--platform',
		'node',
		'--external',
		'electron',
		'--outDir',
		'electron/dist',
	]);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
