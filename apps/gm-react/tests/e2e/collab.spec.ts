import { expect, test } from '@playwright/test';
import { dispatch, enterPreview, exitPreview, gotoRoute, markOnboarded, seedFresh } from './_helpers';

// COLLAB — DM vs player/observer view. The DM's shell re-renders through the SAME actor-filtered
// Core queries a real participant session uses (via `enterPreview`), so a `dm-only` scene is absent
// from a player/observer preview while a `player-visible` scene is present. Also proves preview is
// read-only: a mutation dispatched while previewing is rejected before it reaches the Core.

test.describe('collab: actor-filtered player/observer views', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/scenes');
		await seedFresh(page);
		await page.goto('/#/scenes', { waitUntil: 'domcontentloaded' });
		await page.locator('#main-content').waitFor({ state: 'attached' });
	});

	test('a dm-only scene is hidden from a player preview; a player-visible scene is shown', async ({
		page,
	}) => {
		const stamp = Date.now();
		const dmSecret = `DM Secret ${stamp}`;
		const partyCamp = `Party Camp ${stamp}`;

		// Author both scenes as the DM through the real write path.
		const secret = await dispatch(page, {
			type: 'scene.create',
			actorId: await page.evaluate(() => window.__rt!.defaultActorId),
			payload: { name: dmSecret, description: '', visibility: 'dm-only', tags: [] },
		});
		const camp = await dispatch(page, {
			type: 'scene.create',
			actorId: await page.evaluate(() => window.__rt!.defaultActorId),
			payload: { name: partyCamp, description: '', visibility: 'player-visible', tags: [] },
		});
		expect(secret.status).toBe('accepted');
		expect(camp.status).toBe('accepted');

		// As the DM, the actor-filtered scene list renders BOTH scenes. Assert on DOM presence
		// (count) rather than layout-dependent visibility, so the check holds on the compact profile.
		await expect(page.getByText(dmSecret)).not.toHaveCount(0);
		await expect(page.getByText(partyCamp)).not.toHaveCount(0);

		// Preview as a generic (zero-grant) player: dm-only content is gone, player-visible remains.
		await enterPreview(page, 'player');
		await expect(page.getByText(partyCamp)).not.toHaveCount(0);
		await expect(page.getByText(dmSecret)).toHaveCount(0);
	});

	test('preview mode is read-only: a mutation dispatched while previewing is rejected', async ({
		page,
	}) => {
		await enterPreview(page, 'observer');
		const rejected = await dispatch(page, {
			type: 'scene.create',
			actorId: await page.evaluate(() => window.__rt!.defaultActorId),
			payload: { name: 'Should Not Persist', description: '', visibility: 'dm-only', tags: [] },
		});
		expect(rejected.status).toBe('rejected');
		await exitPreview(page);

		// The rejected mutation never reached Core state.
		const leaked = await page.evaluate(() =>
			Object.values(window.__rt!.state.scenes.scenes).some((s) => s.name === 'Should Not Persist'),
		);
		expect(leaked).toBe(false);
	});
});
