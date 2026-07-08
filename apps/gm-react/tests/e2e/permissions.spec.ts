import { expect, test } from '@playwright/test';
import { dispatch, enterPreview, exitPreview, gotoRoute, markOnboarded, seedFresh } from './_helpers';

// PERMISSIONS — a DM visibility change is reflected in the actor-filtered read model. Revealing a
// scene (dm-only → player-visible) makes it appear in a player preview, while a scene left dm-only
// stays hidden from an observer preview.

test.describe('permissions: visibility changes reflect in the filtered view', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/scenes');
		await seedFresh(page);
		await page.goto('/#/scenes', { waitUntil: 'domcontentloaded' });
		await page.locator('#main-content').waitFor({ state: 'attached' });
	});

	test('revealing a dm-only scene makes it visible in a player preview', async ({ page }) => {
		const name = `Reveal Vault ${Date.now()}`;
		const actorId = await page.evaluate(() => window.__rt!.defaultActorId);

		const created = await dispatch(page, {
			type: 'scene.create',
			actorId,
			payload: { name, description: '', visibility: 'dm-only', tags: [] },
		});
		expect(created.status).toBe('accepted');
		const sceneId = await page.evaluate(
			(n) => Object.values(window.__rt!.state.scenes.scenes).find((s) => s.name === n)?.id ?? null,
			name,
		);
		expect(sceneId).toBeTruthy();

		// Before the reveal: hidden from a player preview.
		await enterPreview(page, 'player');
		await expect(page.getByText(name)).toHaveCount(0);
		await exitPreview(page);

		// Reveal it as the DM.
		const revealed = await dispatch(page, {
			type: 'scene.update-metadata',
			actorId,
			payload: { sceneId, visibility: 'player-visible' },
		});
		expect(revealed.status).toBe('accepted');

		// After the reveal: now present in the player preview's filtered list.
		await enterPreview(page, 'player');
		await expect(page.getByText(name)).not.toHaveCount(0);
	});

	test('a scene left dm-only stays hidden from an observer preview', async ({ page }) => {
		const name = `Observer Secret ${Date.now()}`;
		const actorId = await page.evaluate(() => window.__rt!.defaultActorId);

		const created = await dispatch(page, {
			type: 'scene.create',
			actorId,
			payload: { name, description: '', visibility: 'dm-only', tags: [] },
		});
		expect(created.status).toBe('accepted');

		// DM sees it...
		await expect(page.getByText(name)).not.toHaveCount(0);

		// ...but an observer preview never does.
		await enterPreview(page, 'observer');
		await expect(page.getByText(name)).toHaveCount(0);
	});
});
