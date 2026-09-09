import { test, expect } from '@playwright/test';
import { markOnboarded, waitReady } from './_helpers';

/**
 * RC-PLT-2.1 — the offline shell.
 *
 * The suite runs against the Vite DEV server, where module URLs are neither hashed nor knowable
 * ahead of time, so the worker's build-time precache has nothing to list and it behaves as a pure
 * runtime cache (see `lamplightServiceWorker()` in vite.config.ts). That is the harder case and the
 * one worth proving: nothing is cached until it has been fetched through the worker, so the app
 * boots offline only if the worker really is intercepting and really is serving from the cache.
 *
 * `?sw=dev` is the dev-server opt-in — the rest of the suite runs with no worker at all.
 */

const APP_URL = '/?sw=dev#/';

async function waitForController(page: import('@playwright/test').Page): Promise<void> {
	await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
		timeout: 30_000,
	});
}

test.describe('installable web app', () => {
	test('reloads and boots with the network down', async ({ page, context }) => {
		await markOnboarded(page);
		await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
		await waitReady(page);

		// The first load happened before the worker existed, so none of it went through the worker.
		// One online reload under the now-active worker is what fills the cache.
		await waitForController(page);
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await waitForController(page);

		await context.setOffline(true);
		try {
			await page.reload({ waitUntil: 'domcontentloaded' });
			await waitReady(page);
			await expect(page.locator('#main-content')).toBeAttached();
			// The vault is local-first, so an offline boot is a working app, not a placeholder.
			await expect(page.locator('h1').first()).toBeAttached();
		} finally {
			await context.setOffline(false);
		}
	});

	test('serves the worker and links a manifest the browser can install from', async ({
		page,
		request,
	}) => {
		await markOnboarded(page);
		await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
		await waitReady(page);

		await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
			'href',
			'/manifest.webmanifest',
		);

		const manifest = await request.get('/manifest.webmanifest');
		expect(manifest.ok()).toBe(true);
		const parsed = (await manifest.json()) as { name: string; display: string; icons: unknown[] };
		expect(parsed.name).toBe('Lamplight');
		expect(parsed.display).toBe('standalone');
		expect(parsed.icons.length).toBeGreaterThan(0);

		const worker = await request.get('/sw.js');
		expect(worker.ok()).toBe(true);
		expect(await worker.text()).toContain('LAMPLIGHT_SKIP_WAITING');
	});
});
