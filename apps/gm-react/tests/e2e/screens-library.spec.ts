import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
	createScreenInLibrary,
	dispatch,
	gotoRoute,
	markOnboarded,
	preferPhoneCanvas,
	seedFresh,
	waitReady,
} from './_helpers';

/**
 * RC-CAN-8.7 — the Screens library and its vocabulary, on both the desktop and the mobile project.
 *
 * - The library lists the GM's own screens first and the scenes projected to the players after them,
 *   under one heading each, below the top bar's single page title.
 * - A card's actions are labelled buttons at the 44px touch floor.
 * - A Blank screen's empty state names the screen, not "Your DM screen".
 * - The flow tile menu reads in Spanish, every row of it (it used to be English-only `TEXT`).
 * - axe `heading-order` is clean on the library and on the scene cards' own page.
 * - The scene cards are one click from the library (even when a filter hides every screen), the
 *   Session screen's now playing and the atmosphere widget.
 */

test.beforeEach(async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await markOnboarded(page);
});

async function openLibrary(page: Page): Promise<void> {
	await gotoRoute(page, '/screens');
	await seedFresh(page);
	await page.goto('/#/screens', { waitUntil: 'domcontentloaded' });
	await waitReady(page);
	await expect(page.getByTestId('screens-library')).toBeVisible();
	// The demo seed's player-visible scene, so both sections have cards.
	await expect(page.getByTestId('screens-section-scenes').getByRole('listitem')).not.toHaveCount(0);
}

async function headingOrderViolations(page: Page) {
	const results = await new AxeBuilder({ page }).withRules(['heading-order']).analyze();
	return results.violations;
}

test('the library lists the GM screens first, then the player scenes', async ({ page }) => {
	await openLibrary(page);
	const main = page.locator('#main-content');
	// One page title (the top bar's), then the two sections — the GM's screens leading.
	await expect(page.getByRole('heading', { level: 1, name: 'Screens', exact: true })).toHaveCount(
		1,
	);
	await expect(main.getByRole('heading', { level: 2 })).toHaveText(['DM screens', 'Player scenes']);
	await expect(main.getByRole('heading', { name: 'Screens', exact: true })).toHaveCount(0);

	// Every card in the first section is GM-only; every card in the second is seen by players.
	const screens = page.getByTestId('screens-section-screens').getByRole('listitem');
	const scenes = page.getByTestId('screens-section-scenes').getByRole('listitem');
	await expect(screens).not.toHaveCount(0);
	for (const card of await screens.all()) await expect(card.getByText('DM only')).toBeVisible();
	for (const card of await scenes.all())
		await expect(card.getByText(/^(Player visible|Shared)$/)).toBeVisible();
	// Screens come first in the DOM, so in reading and tab order too.
	const order = await page
		.locator('[data-testid^="screens-section-"]')
		.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-testid')));
	expect(order).toEqual(['screens-section-screens', 'screens-section-scenes']);

	// The scene cards are their own page now, reached from the player section.
	await expect(page.locator('#card-title')).toHaveCount(0);
	await page.getByTestId('screens-scene-cards').click();
	await page.waitForURL((url) => url.hash === '#/scene-cards', { timeout: 10_000 });
	await expect(page.getByRole('heading', { level: 1, name: 'Scene cards' })).toBeVisible();
	await expect(page.locator('#card-title')).toBeVisible();
});

test('every card action is a labelled button at least 44px square', async ({ page }) => {
	await openLibrary(page);
	const groups = page.locator('[data-testid^="screen-actions-"]');
	await expect(groups).not.toHaveCount(0);
	const buttons = groups.getByRole('button');
	const count = await buttons.count();
	expect(count).toBe((await groups.count()) * 4);
	for (const button of await buttons.all()) {
		// Labelled: the button shows its word, and its accessible name starts with that word.
		const word = (await button.innerText()).trim();
		expect(word.length, 'a visible label').toBeGreaterThan(1);
		await expect(button).toHaveAccessibleName(new RegExp(`^${word}\\b`));
		const box = (await button.boundingBox())!;
		expect(box.height, `${word} height`).toBeGreaterThanOrEqual(44);
		expect(box.width, `${word} width`).toBeGreaterThanOrEqual(44);
	}
});

test('a Blank screen names itself in its empty state', async ({ page }) => {
	await openLibrary(page);
	await createScreenInLibrary(page, 'Table night', 'Blank');
	await page.waitForURL((url) => url.hash.startsWith('#/screen/'), { timeout: 10_000 });
	const empty = page.getByTestId('board-empty-templates');
	await expect(empty.getByRole('heading', { name: 'Table night is empty' })).toBeVisible();
	await expect(page.getByText(/Your DM screen is empty/)).toHaveCount(0);
});

async function expectSceneCardsPage(page: Page): Promise<void> {
	await page.waitForURL((url) => url.hash === '#/scene-cards', { timeout: 10_000 });
	await expect(page.getByRole('heading', { level: 1, name: 'Scene cards' })).toBeVisible();
	await expect(page.locator('#card-title')).toBeVisible();
}

test('a filter that matches no screen keeps the way into the scene cards', async ({ page }) => {
	await openLibrary(page);
	await page.getByRole('searchbox', { name: 'Search' }).fill('no screen is called this');
	await expect(page.getByTestId('screens-section-screens').getByRole('listitem')).toHaveCount(0);
	await page.getByTestId('screens-scene-cards').click();
	await expectSceneCardsPage(page);
});

test('the Session screen links to the scene cards from now playing', async ({ page }) => {
	await openLibrary(page);
	await gotoRoute(page, '/session');
	const link = page
		.getByRole('region', { name: /Now playing/ })
		.getByRole('button', { name: 'Scene cards', exact: true });
	await expect(link).toBeVisible();
	const box = (await link.boundingBox())!;
	expect(box.height).toBeGreaterThanOrEqual(44);
	await link.click();
	await expectSceneCardsPage(page);
});

test('the atmosphere widget links to the scene cards', async ({ page }) => {
	await openLibrary(page);
	await createScreenInLibrary(page, 'Tavern talk', 'Social encounter');
	await page.waitForURL((url) => url.hash.startsWith('#/screen/'), { timeout: 10_000 });
	const link = page.getByTestId('audio-scene-cards');
	await expect(link).toBeVisible();
	await expect(link).toHaveAccessibleName('Scene cards');
	await link.click();
	await expectSceneCardsPage(page);
});

test('axe heading-order is clean on the library and the scene cards page', async ({ page }) => {
	await openLibrary(page);
	expect(await headingOrderViolations(page)).toEqual([]);
	await gotoRoute(page, '/scene-cards');
	await expect(page.locator('#card-title')).toBeVisible();
	expect(await headingOrderViolations(page)).toEqual([]);
});

test.describe('in Spanish', () => {
	test.beforeEach(async ({ page }) => {
		// The flow menu is a canvas-tier control; phones default to stacked panels (RC-CAN-5.1).
		await preferPhoneCanvas(page);
		await page.addInitScript(() => localStorage.setItem('dndtools:locale', 'es'));
	});

	test('the flow tile menu reads in Spanish', async ({ page }) => {
		await gotoRoute(page, '/screens');
		await seedFresh(page);
		await page.waitForFunction(() => !!window.__rt!.state.commandCenter.homeSceneId);
		const sceneId = await page.evaluate(() => window.__rt!.state.commandCenter.homeSceneId!);
		const policy = await dispatch(page, {
			type: 'scene.set-layout-policy',
			actorId: await page.evaluate(() => window.__rt!.defaultActorId),
			payload: { sceneId, layoutPolicy: 'flow' },
		});
		expect(policy.status, JSON.stringify(policy)).toBe('accepted');

		await gotoRoute(page, `/screen/${sceneId}`);
		await expect(page.locator('html')).toHaveAttribute('lang', 'es');
		await expect(page.getByTestId('scene-board-flow')).toBeVisible();
		await page.getByRole('button', { name: 'Editar el diseño', exact: true }).click();
		await expect(page.getByRole('toolbar', { name: 'Historial de diseño' })).toBeVisible();

		const tile = page.locator('[data-flow-index="1"]');
		await tile.getByTestId('flow-tile-actions').click();
		const menu = page.getByTestId('flow-tile-menu');
		await expect(menu).toBeVisible();
		// The whole menu, row by row. The tile's own title is the GM's content, not copy, so it is
		// matched rather than spelled; everything else is the Spanish catalog.
		await expect(menu).toMatchAriaSnapshot(`
      - menu /^Acciones de .+$/:
        - menuitem "Mover al principio"
        - menuitem "Mover atrás"
        - menuitem "Mover adelante"
        - menuitem "Mover al final"
        - group "Ancho":
          - menuitemradio "Ancho completo"
          - menuitemradio "Mitad"
          - menuitemradio "Tercio"
          - menuitemradio "Cuarto"
        - menuitem "Quitar"
    `);
		// And not one English row survives beside them (whole words: "Mover" is Spanish).
		await expect(menu).not.toContainText(
			/\b(Move|Width|Full width|Half|Third|Quarter|Edit widget|Remove|Actions for)\b/,
		);
		await page.keyboard.press('Escape');
		await expect(menu).toBeHidden();
	});
});
