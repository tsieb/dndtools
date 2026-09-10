import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import YAML from 'yaml';

const actionDir = path.resolve('.github/actions/setup-e2e');

it('routes all six browser setup sites through the composite action', () => {
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
	expect(callers.sort()).toEqual([
		'ci.yml',
		'ci.yml',
		'perf.yml',
		'promote-production.yml',
		'release.yml',
		'validate.yml',
	]);
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
