import { expect, test } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// RC-AUD-3.3 — the opt-in WEB EMBED source (YouTube/SoundCloud). Adding a recognized URL declares the
// source `none` (never cached — AUDIO-009/010); playing it renders the provider's own sandboxed iframe
// player instead of the local `<audio>` element, with an honest network indicator, and going offline
// falls back to an honest message rather than a dead frame (the local ambience layers, unaffected,
// keep sounding). The provider's own player page is STUBBED (`page.route`) — this test never depends
// on reaching youtube-nocookie.com over the real network.

const YOUTUBE_WATCH_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const YOUTUBE_EMBED_SRC =
	'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&playsinline=1';

test.describe('audio: opt-in web embed source', () => {
	test.beforeEach(async ({ page }) => {
		// Stub the embed player itself so the test never makes a real request to YouTube.
		await page.route('https://www.youtube-nocookie.com/**', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'text/html',
				body: '<!doctype html><title>stub player</title>',
			}),
		);
		await markOnboarded(page);
		await gotoRoute(page, '/audio');
		await seedFresh(page);
		await page.goto('/#/audio', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.locator('#main-content').waitFor({ state: 'attached' });
	});

	test('the add-source form detects the provider and declares the source "never cached"', async ({
		page,
	}) => {
		await page.getByLabel('Track name').fill('Tavern playlist');
		await page.getByLabel('Kind').selectOption('web-stream');
		await page.getByLabel('Stream URL').fill(YOUTUBE_WATCH_URL);

		// The detection hint appears from the URL alone, before submitting.
		await expect(page.getByTestId('audio-embed-add-hint')).toContainText('YouTube');

		await page.getByRole('button', { name: 'Add track' }).click();
		await expect(page.getByText('“Tavern playlist” added', { exact: false })).toBeVisible();

		const source = await page.evaluate(() => {
			const sources = (
				window.__rt!.state.audio as {
					sources: Record<string, { displayName: string; cacheBehavior: string; url: string }>;
				}
			).sources;
			return Object.values(sources).find((s) => s.displayName === 'Tavern playlist') ?? null;
		});
		expect(source).toMatchObject({ cacheBehavior: 'none', url: YOUTUBE_WATCH_URL });
	});

	test('playing an embed source renders the sandboxed player with a network indicator', async ({
		page,
	}) => {
		const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
		const configured = await dispatch(page, {
			type: 'audio.configure-source',
			actorId,
			payload: {
				type: 'web-stream',
				displayName: 'Bard playlist',
				url: YOUTUBE_WATCH_URL,
				cacheBehavior: 'none',
			},
		});
		expect(configured.status).toBe('accepted');
		const sourceId = (configured.events ?? []).find((e) => e.kind === 'audio.source-configured')
			?.sourceId as string | undefined;
		expect(sourceId).toBeTruthy();
		const played = await dispatch(page, {
			type: 'session.audio.play',
			actorId,
			payload: { sourceId, online: true },
		});
		expect(played.status).toBe('accepted');

		const frame = page.getByTestId('audio-embed-frame');
		await expect(frame).toBeVisible();
		await expect(frame).toHaveAttribute('src', YOUTUBE_EMBED_SRC);
		await expect(frame).toHaveAttribute(
			'sandbox',
			'allow-scripts allow-same-origin allow-presentation',
		);
		await expect(page.getByText('Online', { exact: true })).toBeVisible();
	});

	test('offline fails over honestly instead of showing a dead frame', async ({ page, context }) => {
		const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
		const configured = await dispatch(page, {
			type: 'audio.configure-source',
			actorId,
			payload: {
				type: 'web-stream',
				displayName: 'Bard playlist',
				url: YOUTUBE_WATCH_URL,
				cacheBehavior: 'none',
			},
		});
		const sourceId = (configured.events ?? []).find((e) => e.kind === 'audio.source-configured')
			?.sourceId as string | undefined;
		await dispatch(page, {
			type: 'session.audio.play',
			actorId,
			payload: { sourceId, online: true },
		});
		await expect(page.getByTestId('audio-embed-frame')).toBeVisible();

		await context.setOffline(true);
		try {
			// Force a re-render (the offline flag is read at render time, not push-subscribed) by
			// switching tabs and back — a real state change every device already re-renders on.
			await page.getByRole('tab', { name: 'Presets' }).click();
			await page.getByRole('tab', { name: 'Playback' }).click();

			await expect(page.getByTestId('audio-embed-frame')).toHaveCount(0);
			await expect(
				page.getByText('No network — playing local ambience layers instead.'),
			).toBeVisible();
		} finally {
			await context.setOffline(false);
		}
	});
});
