import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import YAML from 'yaml';

const actionDir = path.resolve('.github/actions/setup-e2e');

it('routes every browser install outside the Playwright image through the composite action', () => {
	const callers: string[] = [];
	for (const file of fs.readdirSync('.github/workflows')) {
		const workflow = YAML.parse(fs.readFileSync(`.github/workflows/${file}`, 'utf8'));
		for (const job of Object.values(workflow.jobs) as {
			steps?: { uses?: string; run?: string }[];
		}[]) {
			for (const step of job.steps ?? []) {
				expect(step.run ?? '').not.toMatch(/playwright\s+install/);
				if (step.uses === './.github/actions/setup-e2e') callers.push(file);
			}
		}
	}
	// ADR-043: ci.yml's browser legs, release.yml and promote-production.yml run in (or rely on)
	// the pinned Playwright image; only the perf capture and the nightly harness still install.
	expect(callers.sort()).toEqual(['nightly.yml', 'perf.yml']);
	const action = YAML.parse(fs.readFileSync(`${actionDir}/action.yml`, 'utf8'));
	expect(action.runs.using).toBe('composite');
	expect(action.runs.steps.map((step: { run: string }) => step.run)).toEqual([
		"sudo rm -f $(grep -rl 'dl\\.google\\.com' /etc/apt/sources.list /etc/apt/sources.list.d 2>/dev/null)",
		'pnpm --filter @dndtools/gm-react exec playwright install --with-deps chromium',
	]);
	for (const step of action.runs.steps) {
		expect(step.shell).toBe('bash');
		expect(step['continue-on-error']).toBeUndefined();
	}
});

it('runs the path-filtered jobs when only a local action changes', () => {
	const ci = YAML.parse(fs.readFileSync('.github/workflows/ci.yml', 'utf8'));
	const filter = ci.jobs.changes.steps.find((step: { id?: string }) => step.id === 'filter');
	expect(YAML.parse(filter.with.filters).runtime).toContain('.github/actions/**');
	const perf = YAML.parse(fs.readFileSync('.github/workflows/perf.yml', 'utf8'));
	expect(perf.on.push.paths).toContain('.github/actions/setup-e2e/**');
	// Pull requests no longer pay for the two-hour paired capture (ADR-043).
	expect(perf.on.pull_request).toBeUndefined();
});

it('gives release and rollback checkouts of older tags this workflow revision of the CI scripts and actions', () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-e2e-tag-'));
	const env = Object.fromEntries(
		Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
	);
	const git = (cwd: string, ...args: string[]) =>
		execFileSync(
			'git',
			[
				'-c',
				'user.name=ci',
				'-c',
				'user.email=ci@example.com',
				'-c',
				'commit.gpgsign=false',
				...args,
			],
			{ cwd, env, encoding: 'utf8' },
		).trim();
	try {
		// An origin whose old commit (the tag) predates the action and whose newer commit (the
		// workflow revision) was pushed after the runner cloned, so the step must fetch it.
		const origin = path.join(root, 'origin');
		const work = path.join(root, 'work');
		fs.mkdirSync(origin);
		git(origin, 'init', '-q', '-b', 'main');
		git(origin, 'config', 'uploadpack.allowReachableSHA1InWant', 'true');
		fs.writeFileSync(path.join(origin, 'README.md'), 'old release\n');
		git(origin, 'add', '.');
		git(origin, 'commit', '-q', '-m', 'old release');
		const tagSha = git(origin, 'rev-parse', 'HEAD');
		git(root, 'clone', '-q', origin, work);
		fs.cpSync(path.resolve('.github/actions'), path.join(origin, '.github/actions'), {
			recursive: true,
		});
		fs.cpSync(path.resolve('scripts/ci'), path.join(origin, 'scripts/ci'), { recursive: true });
		git(origin, 'add', '.');
		git(origin, 'commit', '-q', '-m', 'add the CI scripts and actions');
		const workflowSha = git(origin, 'rev-parse', 'HEAD');

		for (const [file, job] of [
			['release.yml', 'verify'],
			['promote-production.yml', 'preflight'],
		]) {
			const workflow = YAML.parse(fs.readFileSync(`.github/workflows/${file}`, 'utf8'));
			const steps: { name?: string; uses?: string; run?: string }[] = workflow.jobs[job].steps;
			const overlay = steps.find((step) => step.run?.includes('GITHUB_WORKFLOW_SHA'));
			const requireGreen = steps.findIndex((step) =>
				step.run?.includes('scripts/ci/require-green.sh'),
			);
			const setup = steps.findIndex((step) => step.uses === './.github/actions/setup-workspace');
			expect(overlay?.run, `${file} restores the scripts and actions`).toContain(
				'scripts/ci .github/actions',
			);
			expect(steps.indexOf(overlay!), `${file} restores before using the scripts`).toBeLessThan(
				requireGreen,
			);
			expect(steps.indexOf(overlay!), `${file} restores before using the action`).toBeLessThan(
				setup,
			);
			// First run fetches the missing workflow revision; the second finds it locally.
			execFileSync('bash', ['-e', '-c', overlay.run ?? ''], {
				cwd: work,
				env: { ...env, GITHUB_WORKFLOW_SHA: workflowSha },
				stdio: 'pipe',
			});
			expect(
				fs.readFileSync(path.join(work, '.github/actions/setup-workspace/action.yml'), 'utf8'),
			).toBe(fs.readFileSync('.github/actions/setup-workspace/action.yml', 'utf8'));
			expect(fs.readFileSync(path.join(work, 'scripts/ci/require-green.sh'), 'utf8')).toBe(
				fs.readFileSync('scripts/ci/require-green.sh', 'utf8'),
			);
			expect(git(work, 'rev-parse', 'HEAD'), `${file} keeps the tag checked out`).toBe(tagSha);
			expect(git(work, 'diff', '--cached', '--name-only')).toBe('');
		}
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

it('drops every apt source naming the Chrome repo by content, in either format, and reruns cleanly', () => {
	const action = YAML.parse(fs.readFileSync(`${actionDir}/action.yml`, 'utf8'));
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-e2e-'));
	try {
		const parts = path.join(root, 'sources.list.d');
		fs.mkdirSync(parts);
		const ubuntu =
			'Types: deb\nURIs: http://archive.ubuntu.com/ubuntu\nSuites: noble\nComponents: main\n';
		const comment = '# Ubuntu sources have moved to /etc/apt/sources.list.d/ubuntu.sources\n';
		fs.writeFileSync(path.join(root, 'sources.list'), comment);
		fs.writeFileSync(path.join(parts, 'ubuntu.sources'), ubuntu);
		// Neither file name hints at Chrome: 24.04 writes deb822, older images one-line lists.
		fs.writeFileSync(
			path.join(parts, 'runner.sources'),
			'Types: deb\nURIs: https://dl.google.com/linux/chrome/deb/\nSuites: stable\nComponents: main\n',
		);
		fs.writeFileSync(
			path.join(parts, 'legacy.list'),
			'deb [arch=amd64] https://dl.google.com/linux/chrome/deb/ stable main\n',
		);
		// The action's own step, pointed at the fixture instead of /etc/apt and run unprivileged.
		const guard = action.runs.steps[0].run.replace(/^sudo /, '').replaceAll('/etc/apt', root);
		for (let run = 0; run < 2; run++) {
			execFileSync('bash', ['-e', '-c', guard]);
			expect(fs.readdirSync(parts)).toEqual(['ubuntu.sources']);
			expect(fs.readFileSync(path.join(parts, 'ubuntu.sources'), 'utf8')).toBe(ubuntu);
			expect(fs.readFileSync(path.join(root, 'sources.list'), 'utf8')).toBe(comment);
		}
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});
