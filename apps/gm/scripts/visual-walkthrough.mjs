// UX-RELEASE visual walkthrough (Command Center redesign final QA): screenshot every primary
// route on desktop + mobile viewports in a dark (tavern) and light (parchment) theme, and report
// horizontal overflow per page. Run against a live preview server:
//   node scripts/visual-walkthrough.mjs [baseURL]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:4183';
const OUT = 'test-results/walkthrough';
mkdirSync(OUT, { recursive: true });

const ROUTES = ['/', '/scenes/', '/session/', '/atlas/', '/characters/', '/settings/'];
const VIEWPORTS = [
	{ name: 'desktop', width: 1280, height: 720 },
	{ name: 'mobile', width: 393, height: 851 },
];
const THEMES = ['tavern', 'parchment'];

const browser = await chromium.launch();
let failures = 0;
for (const viewport of VIEWPORTS) {
	for (const theme of THEMES) {
		const context = await browser.newContext({
			viewport: { width: viewport.width, height: viewport.height },
		});
		const page = await context.newPage();
		await page.addInitScript((t) => {
			window.localStorage.setItem('dndtools:v2:theme', t);
		}, theme);
		for (const route of ROUTES) {
			const slug = route === '/' ? 'home' : route.replaceAll('/', '');
			await page.goto(BASE + route, { waitUntil: 'networkidle' });
			await page.waitForTimeout(600);
			const overflow = await page.evaluate(
				() => document.documentElement.scrollWidth - document.documentElement.clientWidth,
			);
			const themeApplied = await page.evaluate(() =>
				document.documentElement.getAttribute('data-theme'),
			);
			const status = overflow > 1 ? 'OVERFLOW' : 'ok';
			if (overflow > 1 || themeApplied !== theme) failures += 1;
			console.log(
				`${viewport.name}/${theme}${route} — ${status} (overflow ${overflow}px, theme ${themeApplied})`,
			);
			await page.screenshot({
				path: `${OUT}/${viewport.name}-${theme}-${slug}.png`,
				fullPage: false,
			});
		}
		await context.close();
	}
}
await browser.close();
if (failures > 0) {
	console.error(`${failures} walkthrough check(s) failed`);
	process.exit(1);
}
console.log('walkthrough clean');
