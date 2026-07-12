import { test, expect } from '@playwright/test';
import { markOnboarded, gotoRoute } from './_helpers';

// Isolation guard: the e2e suite must run against a LOCAL-FIRST dev server. If a developer has
// populated .env.local with real cloud coordinates (scripts/pull-cloud-env.mjs) and Playwright
// reused that server, every cloud entry point in the app would go live against the dev stack.
// playwright.config.ts blanks the cloud env for servers it starts itself; this spec is the
// backstop that fails the run loudly when any cloud flag is set, instead of letting specs
// silently exercise real Cognito/signaling/sync/app-api endpoints.
test.describe('isolation guard: dev server is local-first', () => {
	test('no cloud endpoint is configured for this e2e run', async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/');
		// The Vite dev server serves the source module graph, so the page can import the real
		// config module. `new Function` keeps Playwright's evaluate-compiler from rewriting the
		// dynamic import.
		const flags = await page.evaluate(() =>
			(new Function('return import("/src/cloud/config.ts")')() as Promise<Record<string, unknown>>).then(
				(m) => ({
					isCloudConfigured: m.isCloudConfigured,
					isAuthConfigured: m.isAuthConfigured,
					isSyncConfigured: m.isSyncConfigured,
					isAccountApiConfigured: m.isAccountApiConfigured,
				}),
			),
		);
		expect(flags, 'e2e must never run against a cloud-configured dev server').toEqual({
			isCloudConfigured: false,
			isAuthConfigured: false,
			isSyncConfigured: false,
			isAccountApiConfigured: false,
		});
	});
});
