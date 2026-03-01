import { spawn } from 'node:child_process';

function run(): Promise<number> {
	const child = spawn(
		'pnpm',
		[
			'playwright',
			'test',
			'-c',
			'playwright.desktop.config.ts',
			'tests/e2e-desktop/memory.spec.ts',
			'--reporter=line',
		],
		{
			stdio: 'inherit',
			shell: process.platform === 'win32',
			env: {
				...process.env,
				MEMORY_PROFILE: process.env.MEMORY_PROFILE ?? '1',
			},
		},
	);

	return new Promise((resolve, reject) => {
		child.once('error', reject);
		child.once('exit', (code) => resolve(code ?? 1));
	});
}

run()
	.then((code) => {
		process.exit(code);
	})
	.catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	});
