// Capture real app screens and check the static marketing page locally. No cloud access.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const app = path.join(root, 'apps/gm-react');
const require = createRequire(path.join(app, 'package.json'));
const { chromium } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const refresh = process.argv.includes('--refresh');
const output = path.join(here, refresh ? 'static/screenshots' : '../../test-results/marketing');
await mkdir(output, { recursive: true });
await mkdir(path.join(root, 'test-results/marketing'), { recursive: true });
const port = Number(process.env.DNDTOOLS_MARKETING_PORT ?? 6194);
const env = { ...process.env };
for (const key of [
	'CLOUD_REGION',
	'COGNITO_USER_POOL_ID',
	'COGNITO_CLIENT_ID',
	'SIGNALING_WS_URL',
	'SYNC_API_URL',
	'APP_API_URL',
	'PUBLIC_APP_URL',
	'GOOGLE_CLIENT_ID',
])
	env[`VITE_${key}`] = '';
const vite = spawn(
	'pnpm',
	['exec', 'vite', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
	{ cwd: app, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
);
let log = '';
vite.stdout.on('data', (data) => {
	log += data;
});
vite.stderr.on('data', (data) => {
	log += data;
});
const staticServer = createServer(async (req, res) => {
	const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
	const target = path.resolve(here, 'static', `.${relative === '/' ? '/index.html' : relative}`);
	if (!target.startsWith(path.join(here, 'static') + path.sep)) {
		res.writeHead(403).end();
		return;
	}
	try {
		const body = await readFile(target);
		res.setHeader(
			'Content-Type',
			{ '.html': 'text/html', '.css': 'text/css', '.png': 'image/png' }[path.extname(target)] ??
				'application/octet-stream',
		);
		res.end(body);
	} catch {
		res.writeHead(404).end();
	}
});
let browser;
try {
	for (let i = 0; ; i++) {
		assert.equal(vite.exitCode, null, log);
		if (log.includes('Local:')) break;
		assert.ok(i < 300, `Vite did not start: ${log}`);
		await new Promise((resolve) => setTimeout(resolve, 200));
	}
	browser = await chromium.launch();
	const captures = [];
	for (const [slug, route, heading] of [
		['board', '/board', 'GM Screen'],
		['atlas', '/atlas', 'Maps'],
	]) {
		const page = await browser.newPage({
			viewport: { width: 1440, height: 1000 },
			deviceScaleFactor: 1,
			reducedMotion: 'reduce',
			locale: 'en-US',
			timezoneId: 'UTC',
		});
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.route('**/*', (request) => {
			const url = new URL(request.request().url());
			return ['127.0.0.1', 'localhost'].includes(url.hostname) ||
				['data:', 'blob:'].includes(url.protocol)
				? request.continue()
				: request.abort();
		});
		await page.addInitScript(() => localStorage.setItem('dndtools:react:onboarded', 'gate'));
		await page.goto(`http://127.0.0.1:${port}/#${route}`);
		await page.waitForFunction(() => window.__rt?.loaded === true);
		await page.locator('#main-content').waitFor();
		await page
			.getByRole('heading', { name: heading, exact: true })
			.first()
			.waitFor({ state: 'attached' });
		if (slug === 'board') {
			await page.getByRole('combobox').first().selectOption({ label: 'Ruined Keep' });
			await page.getByText('Map changed', { exact: true }).waitFor({ state: 'visible' });
			await page.getByText('Map changed', { exact: true }).waitFor({ state: 'hidden' });
		} else {
			await page.getByRole('button', { name: 'Ruined Keep', exact: true }).first().click();
		}
		await page.evaluate(() => document.fonts.ready);
		await page.waitForTimeout(1500); // Let seeded canvas rendering settle before the capture.
		assert.deepEqual(errors, [], `${slug} runtime errors`);
		const file = `${slug}.png`;
		const bytes = await page.screenshot({ path: path.join(output, file), animations: 'disabled' });
		captures.push({
			file,
			route,
			viewport: { width: 1440, height: 1000 },
			sha256: createHash('sha256').update(bytes).digest('hex'),
		});
		await page.close();
		console.log(`PASS capture ${slug}`);
	}
	if (refresh)
		await writeFile(
			path.join(output, 'provenance.json'),
			JSON.stringify(
				{
					sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
						cwd: root,
						encoding: 'utf8',
					}).trim(),
					capturedAt: new Date().toISOString(),
					browser: browser.version(),
					fixture:
						'Fresh built-in sample vault; onboarding dismissed; Ruined Keep selected through UI on both routes; external requests blocked',
					captures,
				},
				null,
				2,
			) + '\n',
		);
	await new Promise((resolve) => staticServer.listen(0, '127.0.0.1', resolve));
	for (const width of [390, 768, 1440]) {
		const context = await browser.newContext({ viewport: { width, height: 1000 } });
		const page = await context.newPage();
		const failed = [];
		page.on('response', (response) => {
			if (response.status() >= 400) failed.push(response.url());
		});
		await page.goto(`http://127.0.0.1:${staticServer.address().port}/`);
		await page.locator('h1').waitFor();
		for (const image of await page.locator('img').all()) {
			await image.scrollIntoViewIfNeeded();
			await image.evaluate((image) => image.decode());
		}
		await page.evaluate(() => {
			scrollTo(0, 0);
			return document.fonts.ready;
		});
		assert.equal(await page.locator('h1').count(), 1);
		assert.ok(
			await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
			`Overflow at ${width}`,
		);
		assert.ok(
			await page
				.locator('img')
				.evaluateAll((images) =>
					images.every((image) => image.complete && image.naturalWidth > 0 && image.alt.length > 0),
				),
		);
		assert.deepEqual(failed, []);
		const axe = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'])
			.analyze();
		assert.deepEqual(
			axe.violations.map((v) => v.id),
			[],
			`Accessibility at ${width}`,
		);
		await page.screenshot({
			path: path.join(root, `test-results/marketing/landing-${width}.png`),
			fullPage: true,
		});
		await page.close();
		await context.close();
		console.log(`PASS landing ${width}px: images, overflow, axe`);
	}
} finally {
	await browser?.close();
	staticServer.close();
	try {
		process.kill(-vite.pid, 'SIGTERM');
	} catch {}
}
