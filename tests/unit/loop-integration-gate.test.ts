// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
import YAML from 'yaml';

const ci = YAML.parse(readFileSync('.github/workflows/ci.yml', 'utf8'));

it('automatically runs every browser shard on loop/rc, without path filtering or build dependency', () => {
	expect(ci.on.push.branches).toContain('loop/rc');
	expect(ci.concurrency.group).toContain("github.ref == 'refs/heads/loop/rc' && github.run_id");
	const browser = ci.jobs['browser-e2e'];
	expect(browser.needs).toEqual(['changes']);
	expect(browser.if).toContain("github.ref == 'refs/heads/loop/rc' ||");
	expect(browser.strategy['fail-fast']).toBe(false);
	expect(browser.strategy.matrix.include.map((entry: { shard: string }) => entry.shard)).toEqual([
		'1/3',
		'2/3',
		'3/3',
	]);
	const tier = ci.jobs.changes.steps.find((step: { id?: string }) => step.id === 'tier').run;
	const dir = mkdtempSync(path.join(tmpdir(), 'loop-tier-'));
	try {
		const result = spawnSync(
			'bash',
			[
				'-c',
				tier
					.replaceAll('${{ github.event_name }}', 'push')
					.replaceAll('${{ github.event.pull_request.base.ref }}', ''),
			],
			{
				env: { ...process.env, GITHUB_OUTPUT: path.join(dir, 'output') },
				encoding: 'utf8',
			},
		);
		expect(result.status, result.stdout + result.stderr).toBe(0);
		expect(readFileSync(path.join(dir, 'output'), 'utf8')).toContain('tier=full');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

it('catches an injected cross-spec regression with the CI command while the named spec passes', () => {
	const dir = mkdtempSync(path.join(tmpdir(), 'loop-gate-'));
	const appRequire = createRequire(path.resolve('apps/gm-react/package.json'));
	const playwright = appRequire.resolve('@playwright/test');
	const cli = appRequire.resolve('@playwright/test/cli');
	const command = ci.jobs['browser-e2e'].steps
		.find((step: { name?: string }) => step.name === 'Run Playwright shard')
		.run.trim();
	// Run the actual workflow's argument list, replacing only the package-manager launcher.
	expect(command.startsWith('pnpm --filter @dndtools/gm-react exec playwright ')).toBe(true);
	const args = command
		.replace('pnpm --filter @dndtools/gm-react exec playwright ', '')
		.replace('--shard="$PLAYWRIGHT_SHARD"', '--shard=1/1')
		.split(/\s+/);
	try {
		writeFileSync(
			path.join(dir, 'playwright.config.cjs'),
			`module.exports = {
            testDir: ${JSON.stringify(dir)}, retries: 0, workers: 1,
            projects: [{name: 'desktop-chromium'}, {name: 'mobile-chromium'}]
        };`,
		);
		writeFileSync(path.join(dir, 'surface.cjs'), 'exports.draggable = true;');
		writeFileSync(
			path.join(dir, 'named.spec.cjs'),
			`const {test, expect} = require(${JSON.stringify(playwright)});
            test('named story still works', () => expect(1).toBe(1));`,
		);
		writeFileSync(
			path.join(dir, 'other-story.spec.cjs'),
			`const {test, expect} = require(${JSON.stringify(playwright)});
            test('other story remains draggable', () => expect(require('./surface.cjs').draggable).toBe(true));`,
		);
		const run = (selection: string[]) =>
			spawnSync(
				process.execPath,
				[cli, ...selection, '--config', path.join(dir, 'playwright.config.cjs')],
				{
					cwd: dir,
					encoding: 'utf8',
					timeout: 30_000,
					env: {
						...process.env,
						CI: '1',
						PLAYWRIGHT_HTML_OPEN: 'never',
						PLAYWRIGHT_HTML_OUTPUT_DIR: path.join(dir, 'report'),
					},
				},
			);
		const baseline = run(args);
		expect(baseline.status, baseline.stdout + baseline.stderr).toBe(0);
		writeFileSync(path.join(dir, 'surface.cjs'), 'exports.draggable = false;');
		const named = run(['test', 'named.spec.cjs', '--reporter=line']);
		expect(named.status, named.stdout + named.stderr).toBe(0);
		const regression = run(args);
		expect(regression.status, regression.stdout + regression.stderr).toBe(1);
		expect(regression.stdout).toContain('2 failed');
		expect(regression.stdout).toContain('other-story.spec.cjs');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}, 90_000);
