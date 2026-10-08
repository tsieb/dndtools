import { expect, test, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh } from './_helpers';

// RC-CHR-6.5 — "Preview as <player>" from the top bar opens the companion itself: the page that
// player's phone renders, as that player, with an exit banner and no DM chrome. The demo vault seats
// Demo Player 2 as Brother Calloway's owner; each of the first two players is assigned their own scene
// so the stage can only show the right one if the companion reads as the previewed player.

const PLAYER_2 = 'actor-player-2';

async function assignScenes(page: Page): Promise<{ mine: string; theirs: string }> {
	const stamp = Date.now();
	const names = { mine: `Calloway's Vigil ${stamp}`, theirs: `Sera's Rooftop ${stamp}` };
	const result = await page.evaluate(
		async ({ names, player2 }) => {
			const rt = window.__rt!;
			const dm = rt.defaultActorId;
			const ids: Record<string, string> = {};
			for (const name of [names.mine, names.theirs]) {
				const created = await rt.dispatch({
					type: 'scene.create',
					actorId: dm,
					payload: { name, description: '', visibility: 'player-visible', tags: [] },
				});
				if (created.status !== 'accepted') return { ok: false, step: `create ${name}` };
				ids[name] = Object.values(rt.state.scenes.scenes).find((s) => s.name === name)!.id;
			}
			const live = await rt.dispatch({
				type: 'session.set-workflow',
				actorId: dm,
				payload: { workflow: 'active', activeSceneId: ids[names.theirs] },
			});
			if (live.status !== 'accepted') return { ok: false, step: 'go live' };
			for (const [actor, name] of [
				['actor-player', names.theirs],
				[player2, names.mine],
			] as const) {
				const projected = await rt.dispatch({
					type: 'session.project-player-view',
					actorId: dm,
					payload: { playerActorIds: [actor], target: { kind: 'scene', sceneId: ids[name] } },
				});
				if (projected.status !== 'accepted') return { ok: false, step: `project to ${actor}` };
			}
			return { ok: true, step: 'done' };
		},
		{ names, player2: PLAYER_2 },
	);
	expect(result.ok, result.step).toBe(true);
	return names;
}

/** The top bar's "Preview as" menu: inline from rail up, inside Table controls on a phone. */
async function previewFromTopBar(page: Page, name: string): Promise<void> {
	const tableControls = page.getByRole('button', { name: 'Table controls' });
	if (await tableControls.isVisible()) await tableControls.click();
	await page.getByRole('button', { name: 'Preview as another role' }).click();
	await page.getByRole('menuitemradio', { name, exact: true }).click();
}

async function openSheet(page: Page): Promise<void> {
	const tabs = page.locator('.player-view-bottom-tabs nav');
	if (await tabs.isVisible())
		await tabs.getByRole('button', { name: 'Sheet', exact: true }).click();
	else
		await page
			.locator('.player-view-desktop-nav nav')
			.getByRole('button', { name: /My character/ })
			.click();
}

test.describe('companion preview follows the previewed actor', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/screens');
		await seedFresh(page);
		await gotoRoute(page, '/screens');
	});

	test('preview as Demo Player 2 opens their companion: their PC, their scene, no DM chrome', async ({
		page,
	}) => {
		const scenes = await assignScenes(page);
		await previewFromTopBar(page, 'Demo Player 2');

		await expect(page).toHaveURL(/#\/play$/);
		await expect.poll(() => page.evaluate(() => window.__rt!.preview?.actorId)).toBe(PLAYER_2);
		const banner = page.getByRole('region', { name: 'Previewing as Demo Player 2 (Player)' });
		await expect(banner).toBeVisible();
		await expect(banner.getByRole('button', { name: 'Exit preview' })).toBeVisible();
		await expect(page.locator('.player-view-toolbar')).toContainText('Preview · Demo Player 2');

		// The specific player's own scene assignment, never the other player's.
		const stage = page.getByTestId('player-stage');
		await expect(stage).toContainText(scenes.mine);
		await expect(stage).not.toContainText(scenes.theirs);

		// No DM navigation: the only navigation landmark is the companion's own.
		const tree = await page.locator('body').ariaSnapshot();
		const navigations = [...tree.matchAll(/- navigation "([^"]*)"/g)].map((m) => m[1]);
		expect(navigations.length).toBeGreaterThan(0);
		expect(new Set(navigations)).toEqual(new Set(['Player sections']));
		expect(tree).not.toContain('Preview as another role');

		await openSheet(page);
		const main = page.locator('#player-main');
		await expect(main).toContainText('Brother Calloway');
		await expect(main).not.toContainText('Sera Duskwhisper');

		// Escape leaves preview and returns to the shell route it was opened from.
		await page.keyboard.press('Escape');
		await expect.poll(() => page.evaluate(() => window.__rt!.preview)).toBeNull();
		await expect(page).toHaveURL(/#\/screens$/);
		await expect(page.getByRole('navigation', { name: 'Primary' }).first()).toBeAttached();
	});

	test('the banner exit and an observer preview: the companion reads as the observer', async ({
		page,
	}) => {
		await previewFromTopBar(page, 'Observer');
		await expect(page).toHaveURL(/#\/play$/);
		const banner = page.getByRole('region', { name: 'Previewing as Observer' });
		await expect(banner).toBeVisible();
		await expect(page.locator('.player-view-toolbar')).toContainText(
			'Preview · Observer (preview)',
		);

		await banner.getByRole('button', { name: 'Exit preview' }).click();
		await expect.poll(() => page.evaluate(() => window.__rt!.preview)).toBeNull();
		await expect(page).toHaveURL(/#\/screens$/);
		await expect(banner).toHaveCount(0);
	});

	test('the home page points a previewed participant to the companion', async ({ page }) => {
		await gotoRoute(page, '/');
		await page.evaluate(() =>
			window.__rt!.enterPreview({ role: 'player', playerActorId: 'actor-player-2' }),
		);
		await expect(page.getByRole('heading', { name: 'This page is only for the DM' })).toBeVisible();
		await page.getByRole('button', { name: 'Open the player view' }).click();
		await expect(page).toHaveURL(/#\/play$/);
		await expect(
			page.getByRole('region', { name: 'Previewing as Demo Player 2 (Player)' }),
		).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page).toHaveURL(/#\/$/);
		await expect(page.getByTestId('home-screen')).toBeVisible();
	});
});
