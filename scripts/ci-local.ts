// Local mirror of the CI `build-and-test` job (.github/workflows/ci.yml).
//
// It exists because the gates people actually run locally (`pnpm lint`, `pnpm typecheck`) are a
// strict subset of what CI enforces, so a tree can look green locally and still fail on push. The
// gap that motivated this: twelve consecutive pushes to `main` failed CI on `format:check:changed`
// alone, while lint and typecheck passed every time.
//
// Usage:
//   pnpm ci:local                 # working-tree formatting, like a developer pre-push
//   pnpm ci:local --base <ref>    # formatting of <ref>...HEAD, like CI on a push
//   pnpm ci:local --fail-fast     # stop at the first failing step
//   pnpm ci:local --with-e2e      # also run the browser E2E + accessibility jobs (slow)
//
// Exits non-zero if any step failed.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// `ci` marks the steps that must see CI=1 to behave as they do on GitHub. It is deliberately NOT
// set globally: `format:check:changed` switches from the working tree to HEAD^...HEAD under CI, so
// a blanket CI=1 would silently change what the default local run checks.
type Step = { name: string; args: string[]; ci?: boolean };

const argv = process.argv.slice(2);
const failFast = argv.includes('--fail-fast');
const withE2e = argv.includes('--with-e2e');
const baseIndex = argv.indexOf('--base');
const base = baseIndex === -1 ? undefined : argv[baseIndex + 1];

if (baseIndex !== -1 && !base) {
	console.error('--base requires a git ref');
	process.exit(2);
}

// Mirrors the CI step order so the first local failure is the first CI failure.
const steps: Step[] = [
	{ name: 'gates', args: ['gates'] },
	{ name: 'security:secrets', args: ['security:secrets'] },
	{
		name: 'format:check:changed',
		args: base ? ['format:check:changed', '--', '--base', base] : ['format:check:changed'],
	},
	{ name: 'lint', args: ['lint'] },
	{ name: 'typecheck', args: ['typecheck'] },
	{ name: 'build', args: ['build'] },
	{ name: 'test', args: ['test'] },
	{ name: 'test:coverage:core', args: ['test:coverage:core'] },
];

if (withE2e) {
	// The E2E and accessibility jobs run on a Vite dev server. `DNDTOOLS_E2E_PORT` keeps them off
	// the default 5273 so a dev server (or the review loop's worktree) can stay up alongside them.
	steps.push(
		{
			name: 'browser-e2e',
			args: ['--filter', '@dndtools/gm-react', 'exec', 'playwright', 'test'],
			ci: true,
		},
		{ name: 'a11y:axe', args: ['a11y:axe'], ci: true },
		{ name: 'a11y:report', args: ['a11y:report'] },
	);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results: { name: string; ok: boolean }[] = [];

for (const step of steps) {
	console.log(`\n[1m=== ${step.name} ===[0m`);
	const result = spawnSync('pnpm', step.args, {
		cwd: repoRoot,
		stdio: 'inherit',
		env: step.ci
			? // CI=1 makes Playwright behave as it does on GitHub: no dev-server reuse, retries, one worker.
				{ ...process.env, CI: '1', DNDTOOLS_E2E_PORT: process.env.DNDTOOLS_E2E_PORT ?? '5291' }
			: process.env,
	});
	const ok = result.status === 0;
	results.push({ name: step.name, ok });
	if (!ok && failFast) break;
}

console.log('\n[1m=== summary ===[0m');
for (const { name, ok } of results) {
	console.log(`${ok ? '[32mPASS[0m' : '[31mFAIL[0m'}  ${name}`);
}

const skipped = steps.length - results.length;
if (skipped > 0) console.log(`(${skipped} step(s) not run — stopped on first failure)`);

const failed = results.filter((r) => !r.ok);
if (failed.length > 0) {
	console.error(`\n${failed.length} step(s) failed: ${failed.map((r) => r.name).join(', ')}`);
	process.exit(1);
}
console.log('\nall steps passed');
