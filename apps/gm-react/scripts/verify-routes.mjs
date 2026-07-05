// Route-mount smoke gate: load every route in headless chromium and assert it mounts with no page
// error, no console error, and a non-trivial rendered DOM. Complements verify-roundtrip/verify-canvas
// (which prove the core round-trip) by proving every SCREEN renders clean. Needs `pnpm dev` running.
// Exits non-zero on any failure.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(here, '../../gm/package.json'));
const { chromium } = require('playwright');

const BASE = process.env.REACT_URL ?? 'http://localhost:5273';
const routes = [
	'/', '/board', '/scenes', '/session', '/characters', '/atlas', '/campaign',
	'/knowledge', '/graph', '/audio', '/extensions', '/community', '/player',
	'/play', '/upgrade', '/settings',
];

const browser = await chromium.launch();
let fails = 0;
for (const route of routes) {
	const page = await browser.newPage();
	// Skip the first-run onboarding overlay so each route's own surface is what mounts.
	await page.addInitScript(() => {
		try {
			window.localStorage.setItem('dndtools:react:onboarded', 'gate');
		} catch {}
	});
	const errors = [];
	page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
	page.on('console', (m) => m.type() === 'error' && errors.push(`console.error: ${m.text()}`));
	try {
		await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 20000 });
		await page.waitForTimeout(600); // let lazy chunks + effects settle
		const rootHtml = await page.evaluate(() => document.getElementById('root')?.innerHTML?.length ?? 0);
		const ok = errors.length === 0 && rootHtml > 200;
		if (!ok) fails++;
		console.log(`${ok ? '✓' : '✗'} ${route.padEnd(14)} root=${rootHtml}b ${errors.length ? '\n   ' + errors.slice(0, 4).join('\n   ') : ''}`);
	} catch (e) {
		fails++;
		console.log(`✗ ${route.padEnd(14)} NAV FAILED: ${e.message}`);
	}
	await page.close();
}
await browser.close();
console.log(`\n${fails === 0 ? `✓ ALL ${routes.length} ROUTES CLEAN` : `✗ ${fails}/${routes.length} routes had errors`}`);
process.exit(fails === 0 ? 0 : 1);
