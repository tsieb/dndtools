import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SCENARIOS } from '../../scripts/perf/capture';
type Browser = Parameters<(typeof SCENARIOS)[number]['run']>[0]['browser'];
type BrowserContext = Awaited<ReturnType<Browser['newContext']>>;
type Page = Awaited<ReturnType<BrowserContext['newPage']>>;

const url = process.env.PERF_BROWSER_URL ?? 'http://localhost:5273';
const requireApp = createRequire(resolve('apps/gm-react/package.json'));

// Opt-in integration check against a real Vite server. Run with PERF_BROWSER_URL=http://localhost:5273.
// Exercise the exported scenarios, including their real restore path and navigation timing.
describe('navigation measurement boundaries in Chromium', () => {
	for (const id of ['app-startup', 'scene-first-render']) {
		for (const profile of ['standard', 'large']) {
			it(
				`${id} (${profile}) starts a document after fixture setup`,
				{ timeout: 120_000 },
				async () => {
					const { chromium } = requireApp('@playwright/test');
					const browser: Browser = await chromium.launch();
					const navigations: { origin: number; setupFinished: number; response: boolean }[] = [];
					const newContext = browser.newContext.bind(browser);
					browser.newContext = async (options) => {
						const context: BrowserContext = await newContext(options);
						let setupFinished = 0;
						const newPage = context.newPage.bind(context);
						context.newPage = async () => {
							const page: Page = await newPage();
							const evaluate = page.evaluate.bind(page);
							page.evaluate = async (fn, arg) => {
								const result = await evaluate(fn, arg);
								if (arg && typeof arg === 'object' && 'content' in arg && 'sync' in arg) {
									// Deliberately add setup overhead: it must precede the measured time origin.
									await page.waitForTimeout(100);
									setupFinished = await evaluate(() => performance.timeOrigin + performance.now());
								}
								return result;
							};
							const goto = page.goto.bind(page);
							page.goto = async (...args) => {
								const response = await goto(...args);
								navigations.push({
									origin: await evaluate(() => performance.timeOrigin),
									setupFinished,
									response: response !== null,
								});
								return response;
							};
							return page;
						};
						return context;
					};
					try {
						const scenario = SCENARIOS.find(
							(entry) => entry.budgetId === `${id}${profile === 'large' ? ':large' : ''}`,
						)!;
						const capture = await scenario.run({
							browser,
							root: process.cwd(),
							options: {
								port: Number(new URL(url).port),
								notes: 200,
								vaultProfile: 'standard',
								out: '',
								only: null,
								skip: new Set(),
								headed: false,
								referenceRoot: null,
								referencePort: 5373,
								referenceOut: null,
							},
						});
						assert.equal(capture.samples.length, 3);
						assert.ok(navigations.every((navigation) => navigation.response));
						const measured =
							profile === 'large'
								? navigations.filter((navigation) => navigation.setupFinished > 0)
								: navigations;
						assert.equal(measured.length, 4); // discarded warmup + three recorded samples
						for (const navigation of measured) {
							assert.ok(navigation.origin > navigation.setupFinished);
						}
						console.info(JSON.stringify({ id, profile, samples: capture.samples, navigations }));
					} finally {
						await browser.close();
					}
				},
			);
		}
	}
});
