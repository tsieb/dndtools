// Real HTTP handlers, isolated config and fake quota. No agents, production data, or external calls.
// node tools/loop/tests/test_dashboard.mjs
import { chromium, expect } from '../../../apps/gm-react/node_modules/@playwright/test/index.mjs';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import AxeBuilder from '../../../apps/gm-react/node_modules/@axe-core/playwright/dist/index.mjs';

const port = await new Promise((resolve) => {
	const server = createServer();
	server.listen(0, '127.0.0.1', () => {
		const p = server.address().port;
		server.close(() => resolve(p));
	});
});
const server = spawn('python3', ['tools/loop/tests/dashboard_fixture.py', String(port)], {
	stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
server.stderr.on('data', (d) => {
	output += d;
});
const artifact = '/tmp/rcloop-dashboard-review';
let browser;
try {
	await new Promise((resolve, reject) => {
		const timeout = setTimeout(() => reject(Error('Fixture timeout: ' + output)), 10000);
		server.stdout.on('data', (d) => {
			if (String(d).includes('dashboard:')) {
				clearTimeout(timeout);
				resolve();
			}
		});
		server.on('exit', (code) => {
			clearTimeout(timeout);
			reject(Error('Fixture exited ' + code + ': ' + output));
		});
	});
	browser = await chromium.launch({ headless: true });
	const context = await browser.newContext({
		viewport: { width: 1440, height: 1100 },
		reducedMotion: 'reduce',
	});
	const page = await context.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const origin = `http://127.0.0.1:${port}`;
	await page.goto(origin);
	await expect(page.getByLabel('Allow Astra pickup')).toBeChecked();
	await page.getByLabel('Allow Spark pickup').uncheck();
	await expect
		.poll(
			async () =>
				(await (await page.request.get(origin + '/api/state')).json()).config.models[
					'gpt-5.3-codex-spark'
				],
		)
		.toBe(false);
	await page.getByLabel('Allow Spark pickup').check();
	await page.getByRole('button', { name: /^Workers/ }).click();
	await page.locator('[data-slot="1"][data-key="backend"]').selectOption('codex');
	await expect(
		page.locator('[data-slot="1"][data-key="model"] option[value="sonnet"]'),
	).toHaveCount(0);
	await page.locator('[data-slot="1"][data-key="model"]').selectOption('gpt-5.3-codex-spark');
	await expect(page.locator('[data-slot="1"][data-key="effort"] option[value="max"]')).toHaveCount(
		0,
	);
	await page.getByRole('button', { name: 'View log' }).click();
	await expect(page.getByRole('dialog')).toContainText(
		'Fixture worker log. <script>not markup</script>',
	);
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).not.toBeVisible();
	await page.getByRole('button', { name: /^Workboard/ }).click();
	await page.getByLabel('Search stories').fill('RC-STB-2.1');
	await expect(page.locator('#stories-body tbody tr')).toHaveCount(1);
	await page.getByRole('button', { name: 'Pin', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Unpin', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Policy', exact: true }).click();
	await page.locator('[data-path="codex.reasoning.S"]').selectOption('high');
	await page.getByRole('button', { name: 'Refresh', exact: true }).click();
	await expect(page.locator('[data-path="codex.reasoning.S"]')).toHaveValue('high');
	await page.evaluate(() => {
		document.querySelector('#toast').hidden = true;
	});
	await expect(page.locator('#policy-status')).toContainText('Unsaved');
	await page.getByRole('button', { name: 'Save policy' }).click();
	await expect
		.poll(
			async () =>
				(await (await page.request.get(origin + '/api/state')).json()).config.codex.reasoning.S,
		)
		.toBe('high');
	const bad = await page.request.post(origin + '/api/cmd', {
		data: { verb: 'config', arg: JSON.stringify({ spark: { effort: 'max' } }) },
	});
	expect((await bad.json()).result).toContain('unsupported Spark');
	await page.route('**/api/cmd', (route) =>
		route.fulfill({ status: 500, json: { result: 'Save rejected for test' } }),
	);
	await page.locator('[data-path="codex.reasoning.S"]').selectOption('medium');
	await page.getByRole('button', { name: 'Save policy' }).click();
	await expect(page.locator('#toast')).toContainText('Save rejected');
	await expect(page.locator('#policy-status')).toContainText('Unsaved');
	await page.unroute('**/api/cmd');
	await page.getByRole('button', { name: 'Discard edits' }).click();
	await expect(page.locator('[data-path="codex.reasoning.S"]')).toHaveValue('high');
	await mkdir(artifact, { recursive: true });
	for (const theme of ['light', 'dark']) {
		if ((await page.locator('html').getAttribute('data-theme')) !== theme)
			await page.locator('#theme').click();
		for (const width of [1440, 390]) {
			await page.setViewportSize({ width, height: 1100 });
			for (const view of ['overview', 'workers', 'workboard', 'activity', 'policy']) {
				await page.locator(`nav [data-view="${view}"]`).click();
				await page.mouse.move(0, 0);
				await page.evaluate(() => window.scrollTo(0, 0));
				const overflow = await page.evaluate(
					() => document.documentElement.scrollWidth > innerWidth,
				);
				expect(overflow, `${view} ${theme} ${width} horizontal overflow`).toBe(false);
				const audit = await new AxeBuilder({ page })
					.withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
					.analyze();
				expect(
					audit.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
					`${view} ${theme} ${width} accessibility`,
				).toEqual([]);
				await page.screenshot({
					path: `${artifact}/${view}-${theme}-${width}.png`,
					fullPage: true,
				});
			}
		}
	}
	await page.getByRole('button', { name: 'Overview', exact: true }).click();
	await page.route('**/api/state', (route) => route.abort());
	await page.getByRole('button', { name: 'Refresh', exact: true }).click();
	await expect(page.locator('#banner')).toContainText('Cannot reach');
	await page.unroute('**/api/state');
	await page.getByRole('button', { name: 'Refresh', exact: true }).click();
	await expect(page.locator('#banner')).not.toBeVisible();
	expect(errors).toEqual([]);
	console.log(
		'Dashboard: all views, both themes, desktop/mobile, model and policy controls, filtering/actions, logs and error recovery passed. Screenshots: ' +
			artifact,
	);
} finally {
	await browser?.close();
	server.kill('SIGTERM');
}
