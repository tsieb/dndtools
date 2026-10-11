import { expect, test, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded } from './_helpers';

// RC-ENG-9.1 — route titles and accessible names. Runs on both the desktop and the mobile project.
//
// `index.html` ships "Lamplight — Command Center" and nothing ever changed it, so the browser tab (and
// the window title a screen reader announces first) claimed to be the Command Center on every route,
// the chrome-less player, invite and display routes included (canvas CAN-12, player PLY-14). Each
// route now names the tab after the heading it shows: "Lamplight — <h1>".
//
// And the DS StatusDot rendered its pulse keyframes as an inline `<style>` child. A `<style>`'s text
// is text content, so a sidebar row named from its content announced `@keyframes dndPulse{…}` before
// its real name (canvas CAN-17).

/** The GM screen's backing scene: a real id for both `/screen/:id` and `/scene/:id`. */
async function homeSceneId(page: Page): Promise<string> {
	await expect
		.poll(() => page.evaluate(() => window.__rt!.state.commandCenter.homeSceneId))
		.not.toBeNull();
	return page.evaluate(() => window.__rt!.state.commandCenter.homeSceneId!);
}

/** The route's visible heading. The shell's <h1> is visually hidden on compact layouts, not absent. */
async function heading(page: Page): Promise<string> {
	const h1 = page.locator('h1').first();
	await h1.waitFor({ state: 'attached', timeout: 20_000 });
	return ((await h1.textContent()) ?? '').trim();
}

/** The tab title is the product name, then exactly the heading the route shows. */
async function expectTitle(page: Page, expected: string): Promise<void> {
	await expect(page.locator('h1').first()).toHaveText(expected);
	expect(await heading(page)).toBe(expected);
	await expect(page).toHaveTitle(`Lamplight — ${expected}`);
}

/**
 * The shell, screen toolbar and tab share the stored screen name (RC-CAN-8.4).
 */
async function expectScreenTitle(page: Page, name: string): Promise<void> {
	await expect(page.locator('h1').first()).toHaveText(name);
	await expect(
		page.getByTestId('screen-toolbar').getByRole('heading', { name, exact: true }),
	).toBeVisible();
	await expect(page).toHaveTitle(`Lamplight — ${name}`);
}

test.describe('route titles (RC-ENG-9.1)', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
	});

	test('eight routes, shelled and standalone, title the tab after their heading', async ({
		page,
	}) => {
		await gotoRoute(page, '/');
		await expectTitle(page, 'Command Center');

		// In-app navigations, not only cold loads: the title follows the route, it is not just the
		// first one to mount.
		const go = (path: string) =>
			page.evaluate((hash) => {
				window.location.hash = hash;
			}, path);
		// The initial visit to / provisions the GM board, before the library opens.
		const sceneId = await homeSceneId(page);
		const sceneName = await page.evaluate(
			(id) => window.__rt!.state.scenes.scenes[id].name,
			sceneId,
		);

		expect(sceneName).toBe('DM screen');
		await go('/screens');
		await expectTitle(page, 'Screens');

		// A screen bookmark under the old editor route lands on the same screen, titled the same way.
		for (const path of [`/screen/${sceneId}`, `/scene/${sceneId}`]) {
			await go(path);
			await expectScreenTitle(page, sceneName);
		}
		await go('/settings');
		await expectTitle(page, 'Settings');

		// The chrome-less routes have no shell <h1>; each names the tab after its own.
		await page.goto('/#/play', { waitUntil: 'domcontentloaded' });
		await expectTitle(page, 'Join your table');
		await page.waitForFunction(() => window.__rt?.loaded);
		await page.evaluate(() => window.__rt!.enterPreview({ role: 'player' }));
		await expectTitle(page, 'Now playing');
		// The player app swaps its heading per section without a route change; the title follows.
		await page.getByRole('button', { name: 'Dice', exact: true }).first().click();
		await expectTitle(page, 'Dice');

		await page.goto('/#/join', { waitUntil: 'domcontentloaded' });
		await expect(page.getByRole('main', { name: 'Campaign invite' })).toBeVisible();
		await expectTitle(page, 'You’re invited');

		await page.goto('/#/display', { waitUntil: 'domcontentloaded' });
		await page.locator('.app-fixed-viewport').waitFor({ state: 'attached', timeout: 20_000 });
		await expectTitle(page, 'No scene on display');

		// Leaving a standalone route for the shell hands the title back to the shell's heading.
		await go('/settings');
		await expectTitle(page, 'Settings');
	});

	test('fresh home entry seeds DM screen and preserves a rename across aliases and reload', async ({
		page,
	}) => {
		await gotoRoute(page, '/');
		const id = await homeSceneId(page);
		await gotoRoute(page, `/scene/${id}`);
		await expect(page).toHaveURL(new RegExp(`#/screen/${id}\\?edit=1$`));
		await expectScreenTitle(page, 'DM screen');
		const toolbar = page.getByTestId('screen-toolbar');
		await toolbar.getByRole('button', { name: 'Edit scene name, description & tags' }).click();
		const details = page.getByTestId('scene-meta-panel');
		await details.getByRole('textbox', { name: 'Name', exact: true }).fill('Harbor watch');
		await details.getByRole('button', { name: 'Save details', exact: true }).click();
		await expectScreenTitle(page, 'Harbor watch');
		await gotoRoute(page, '/');
		await expectTitle(page, 'Command Center');
		await gotoRoute(page, '/screens');
		await expect(page.getByTestId(`screen-card-${id}`).getByRole('heading')).toHaveText(
			'Harbor watch',
		);
		await gotoRoute(page, '/board');
		await expect(page).toHaveURL(new RegExp(`#/screen/${id}$`));
		await expectScreenTitle(page, 'Harbor watch');
		await page.reload();
		await expectScreenTitle(page, 'Harbor watch');
	});

	test('the navigation chrome carries no @keyframes text in its accessible names', async ({
		page,
	}, testInfo) => {
		await gotoRoute(page, '/');
		// Desktop's sidebar holds the account row's presence StatusDot; the phone has no sidebar, and
		// its tab bar and page are scanned instead so the check is not vacuous there.
		const desktop = testInfo.project.name === 'desktop-chromium';
		const chrome = desktop ? page.locator('aside').first() : page.locator('body');
		await expect(chrome).toBeVisible();
		if (desktop) await expect(chrome.getByRole('navigation').first()).toBeVisible();
		const snapshot = await chrome.ariaSnapshot();
		expect(snapshot).not.toContain('@keyframes');
		expect(snapshot).not.toContain('dndPulse');
		// Text content is what a nameless row is named from. The account row's presence StatusDot sits
		// behind an aria-label, so the snapshot alone would miss the regression there.
		expect(await chrome.evaluate((el) => el.textContent ?? '')).not.toContain('@keyframes');
		if (desktop) await expect(chrome.locator('style')).toHaveCount(0);
	});
});
