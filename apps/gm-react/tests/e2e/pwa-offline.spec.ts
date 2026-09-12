import { test, expect } from '@playwright/test';
import { dispatch, markOnboarded, waitReady } from './_helpers';

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

	for (const surface of [
		{
			name: 'note',
			route: '/knowledge',
			type: 'content.create-item',
			slice: 'content',
			collection: 'items',
			payload: {
				kind: 'note',
				title: 'Offline note',
				body: 'Written without a network',
				visibility: 'dm-only',
			},
		},
		{
			name: 'character',
			route: '/characters',
			type: 'character.quick-create',
			slice: 'characters',
			collection: 'characters',
			payload: { kind: 'npc', name: 'Offline character' },
		},
		{
			name: 'map',
			route: '/atlas',
			type: 'map.create',
			slice: 'maps',
			collection: 'maps',
			payload: {
				name: 'Offline map',
				visibility: 'dm-only',
				projection: { kind: 'flat', rotationDegrees: 0 },
				initialLayers: [{ name: 'Base', category: 'base', visibility: 'dm-only' }],
			},
		},
		{
			name: 'scene',
			route: '/scenes',
			type: 'scene.create',
			slice: 'scenes',
			collection: 'scenes',
			payload: { name: 'Offline scene', description: '', visibility: 'dm-only', tags: [] },
		},
		{
			name: 'audio preset',
			route: '/audio',
			type: 'audio.save-preset',
			slice: 'audio',
			collection: 'presets',
			payload: { name: 'Offline audio preset', category: 'dungeon' },
		},
	]) {
		test(`creates a ${surface.name} offline and retains it after an offline reload`, async ({
			page,
			context,
		}) => {
			test.slow();
			await markOnboarded(page);
			await page.goto(`/?sw=dev#${surface.route}`, { waitUntil: 'domcontentloaded' });
			await waitReady(page);
			await waitForController(page);
			// Warm the actual durable surface under worker control, including its lazy chunk.
			await page.reload({ waitUntil: 'domcontentloaded' });
			await waitReady(page);
			await page.locator('h1').first().waitFor({ state: 'attached' });
			await expect(page.getByText('Loading your vault…', { exact: true })).toHaveCount(0);
			const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
			if (surface.name === 'audio preset') {
				// Prepare capturable session audio online; only the new preset is authored offline.
				// This tests reference persistence, not availability of remote audio bytes.
				const source = await dispatch(page, {
					type: 'audio.configure-source',
					actorId,
					payload: {
						type: 'web-stream',
						displayName: 'Preset source',
						url: 'https://audio.invalid/ambience.mp3',
						cacheBehavior: 'cache-required',
					},
				});
				expect(source.status, JSON.stringify(source.rejection)).toBe('accepted');
				const sourceId = source.events?.find((e) => e.kind === 'audio.source-configured')?.sourceId;
				const played = await dispatch(page, {
					type: 'session.audio.play',
					actorId,
					payload: { sourceId, volume: 0.5, online: true },
				});
				expect(played.status, JSON.stringify(played.rejection)).toBe('accepted');
			}
			const readCreated = () =>
				page.evaluate(({ slice, collection, name }) => {
					const state = window.__rt!.state[slice] as Record<
						string,
						Record<string, { id: string; name?: string; title?: string }>
					>;
					return (
						Object.values(state[collection]).find(
							(item) => (item.title ?? item.name) === `Offline ${name}`,
						) ?? null
					);
				}, surface);
			expect(await readCreated()).toBeNull();
			await context.setOffline(true);
			try {
				await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
				const created = await dispatch(page, {
					type: surface.type,
					actorId,
					payload: surface.payload,
				});
				expect(created.status, JSON.stringify(created.rejection)).toBe('accepted');
				const saved = await readCreated();
				expect(saved).not.toBeNull();
				await page.reload({ waitUntil: 'domcontentloaded' });
				await waitReady(page);
				await waitForController(page);
				expect(await page.evaluate(() => navigator.onLine)).toBe(false);
				expect(await readCreated()).toEqual(saved);
				if (surface.name === 'audio preset')
					await page.getByRole('tab', { name: 'Presets' }).click();
				await expect(
					page.getByText(`Offline ${surface.name}`, { exact: true }).first(),
				).toBeVisible();
			} finally {
				await context.setOffline(false);
			}
		});
	}

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
