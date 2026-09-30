import { expect, test, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded, waitReady } from './_helpers';

// RC-CAN-7.3 — the Screens library and switcher (ADR-041). Runs on both the desktop and the mobile
// project. A GM creates a screen from a template, renames it and pins it in the library, then switches
// between screens by the library, the header switcher and the command palette. Every switch is ONE
// navigation, so it pushes exactly one history entry; an old `/board` bookmark resolves to the GM
// screen by REPLACING its entry, so Back never lands on the alias.

const PALETTE = { name: 'Command palette' } as const;

function hash(page: Page): string {
	return new URL(page.url()).hash;
}

function historyLength(page: Page): Promise<number> {
	return page.evaluate(() => window.history.length);
}

/** The GM screen's id. The library provisions the home board in a fresh vault, as `/board` does. */
async function homeSceneId(page: Page): Promise<string> {
	await expect
		.poll(() => page.evaluate(() => window.__rt!.state.commandCenter.homeSceneId))
		.not.toBeNull();
	return page.evaluate(() => window.__rt!.state.commandCenter.homeSceneId!);
}

function sceneByName(page: Page, name: string) {
	return page.evaluate((wanted) => {
		const scene = Object.values(
			window.__rt!.state.scenes.scenes as Record<
				string,
				{
					id: string;
					name: string;
					widgets: Array<{ type: string }>;
					screen?: { pinned?: boolean } | null;
				}
			>,
		).find((candidate) => candidate.name === wanted);
		return scene
			? {
					id: scene.id,
					types: scene.widgets.map((widget) => widget.type).sort(),
					pinned: scene.screen?.pinned === true,
				}
			: null;
	}, name);
}

/** The pane's own heading names the screen (the shell's <h1> is the section title). */
function screenHeading(page: Page, name: string) {
	return page.locator('#main-content').getByRole('heading', { level: 2, name, exact: true });
}

/** Wait for a one-navigation switch to settle, then assert it added exactly one history entry. */
async function expectOnePush(page: Page, before: number, targetHash: string): Promise<void> {
	await page.waitForURL((url) => url.hash === targetHash, { timeout: 10_000 });
	await expect.poll(() => historyLength(page)).toBe(before + 1);
}

test('create from a template, rename, pin, and switch by library, header switcher and palette', async ({
	page,
}) => {
	await markOnboarded(page);
	await gotoRoute(page, '/screens');
	const library = page.getByTestId('screens-library');
	await expect(library.getByRole('heading', { level: 2, name: 'Screens' })).toBeVisible();
	// The GM screen is listed under its own name and its visibility is named honestly.
	const homeId = await homeSceneId(page);
	const homeCard = page.getByTestId(`screen-card-${homeId}`);
	await expect(homeCard.getByRole('heading', { name: 'DM screen' })).toBeVisible();
	await expect(homeCard.getByText('DM only')).toBeVisible();
	await expect(library.getByText(/^(Draft|Ready)$/)).toHaveCount(0);

	// ── Create from a template ────────────────────────────────────────────────────────────────
	await library.getByRole('button', { name: 'New screen' }).click();
	const dialog = page.getByRole('dialog', { name: 'New screen' });
	await expect(dialog).toBeVisible();
	for (const template of [
		'Command Center',
		'DM screen',
		'Session',
		'Prep',
		'Blank',
		'Combat scene',
	])
		await expect(dialog.getByRole('radio', { name: template, exact: true })).toBeVisible();
	await dialog.getByRole('radio', { name: 'Combat scene', exact: true }).click();
	await expect(dialog.getByRole('radio', { name: 'Combat scene', exact: true })).toHaveAttribute(
		'aria-checked',
		'true',
	);
	await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill('Ambush at the ford');
	await dialog.getByRole('button', { name: 'Create screen' }).click();
	await page.waitForURL((url) => url.hash.startsWith('#/screen/'), { timeout: 10_000 });
	await expect(screenHeading(page, 'Ambush at the ford')).toBeVisible();
	const created = await sceneByName(page, 'Ambush at the ford');
	expect(created).not.toBeNull();
	expect(hash(page)).toBe(`#/screen/${created!.id}`);
	// The template's tiles landed on the new screen.
	expect(created!.types).toEqual(
		['dice', 'initiative-tracker', 'map', 'quick-reference', 'timer'].sort(),
	);
	// It runs on the board engine: Edit layout works in place, but the saved layouts and safe points
	// belong to the GM screen, so this screen does not offer them.
	await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Layouts', exact: true })).toHaveCount(0);
	await page.getByRole('button', { name: 'Done', exact: true }).click();

	// ── Rename and pin in the library ─────────────────────────────────────────────────────────
	await gotoRoute(page, '/screens');
	const card = page.getByTestId(`screen-card-${created!.id}`);
	await card.getByRole('button', { name: 'Rename Ambush at the ford' }).click();
	const nameField = card.getByRole('textbox', { name: 'Name', exact: true });
	await nameField.fill('Ford ambush');
	await card.getByRole('button', { name: 'Save details' }).click();
	await expect(card.getByRole('heading', { name: 'Ford ambush' })).toBeVisible();
	await expect.poll(async () => (await sceneByName(page, 'Ford ambush'))?.id).toBe(created!.id);

	const pin = card.getByRole('button', { name: 'Pin Ford ambush' });
	await pin.click();
	await expect(card.getByRole('button', { name: 'Unpin Ford ambush' })).toHaveAttribute(
		'aria-pressed',
		'true',
	);
	await expect.poll(async () => (await sceneByName(page, 'Ford ambush'))?.pinned).toBe(true);
	// Pinned screens lead the library's default order.
	await expect(library.getByRole('listitem').first()).toHaveAttribute(
		'data-testid',
		`screen-card-${created!.id}`,
	);

	// ── Switch by the library ─────────────────────────────────────────────────────────────────
	let before = await historyLength(page);
	await homeCard.getByRole('link').click();
	await expectOnePush(page, before, `#/screen/${homeId}`);
	await expect(screenHeading(page, 'DM screen')).toBeVisible();

	// ── Switch by the header switcher ─────────────────────────────────────────────────────────
	before = await historyLength(page);
	await page.getByTestId('screen-switcher').click();
	const switcher = page.getByRole('menu', { name: 'Screens' });
	await expect(switcher.getByRole('menuitem', { name: /DM screen/ })).toHaveAttribute(
		'aria-current',
		'page',
	);
	await switcher.getByRole('menuitem', { name: /Ford ambush/ }).click();
	await expectOnePush(page, before, `#/screen/${created!.id}`);
	await expect(screenHeading(page, 'Ford ambush')).toBeVisible();
	await expect(page.getByTestId('screen-pin')).toHaveAttribute('aria-pressed', 'true');

	// ── Switch by the command palette ─────────────────────────────────────────────────────────
	before = await historyLength(page);
	await page.keyboard.press('Control+k');
	const palette = page.getByRole('dialog', PALETTE);
	await expect(palette).toBeVisible();
	await palette.getByRole('combobox').fill('DM screen');
	await palette.getByRole('option', { name: 'DM screen' }).click();
	await page.waitForURL((url) => url.hash === `#/screen/${homeId}`, { timeout: 10_000 });
	await expect(palette).toHaveCount(0);
	// "Go to DM screen" is `/board`, which resolves by REPLACING its entry: still one push.
	await expect.poll(() => historyLength(page)).toBe(before + 1);
	await expect(screenHeading(page, 'DM screen')).toBeVisible();

	before = await historyLength(page);
	await page.keyboard.press('Control+k');
	await expect(palette).toBeVisible();
	await palette.getByRole('combobox').fill('Ford');
	await palette.getByRole('option', { name: /Ford ambush/ }).click();
	await expectOnePush(page, before, `#/screen/${created!.id}`);
	await expect(screenHeading(page, 'Ford ambush')).toBeVisible();

	// Back walks the switches one screen at a time.
	await page.goBack();
	await page.waitForURL((url) => url.hash === `#/screen/${homeId}`, { timeout: 10_000 });
	await expect(screenHeading(page, 'DM screen')).toBeVisible();
});

test('an old /board bookmark opens the GM screen without leaving the alias in history', async ({
	page,
}) => {
	await markOnboarded(page);
	await gotoRoute(page, '/screens');
	const homeId = await homeSceneId(page);

	const before = await historyLength(page);
	await page.goto('/#/board', { waitUntil: 'domcontentloaded' });
	await waitReady(page);
	await page.waitForURL((url) => url.hash === `#/screen/${homeId}`, { timeout: 10_000 });
	await expect(screenHeading(page, 'DM screen')).toBeVisible();
	// The bookmark added one entry and the redirect replaced it rather than pushing a second.
	await expect.poll(() => historyLength(page)).toBe(before + 1);
	await page.goBack();
	await page.waitForURL((url) => url.hash === '#/screens', { timeout: 10_000 });

	// `/scenes` resolves to the library the same way.
	await page.goto('/#/scenes', { waitUntil: 'domcontentloaded' });
	await page.waitForURL((url) => url.hash === '#/screens', { timeout: 10_000 });
	await expect(page.getByTestId('screens-library')).toBeVisible();
});

test('re-entering /board before its redirect has settled still lands on the GM screen', async ({
	page,
}) => {
	await markOnboarded(page);
	await gotoRoute(page, '/screens');
	const homeId = await homeSceneId(page);
	// A slow phone: the redirect's render is still pending when `/board` is asked for again. The
	// second `/board` used to settle equal to the first, so nothing redirected it and the pane stayed
	// empty for good (a CI run of combat-tile.spec.ts sat there for 30s).
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
	await page.evaluate(() => {
		window.location.hash = '#/board';
	});
	await page.waitForURL((url) => url.hash === `#/screen/${homeId}`, { timeout: 10_000 });
	await page.evaluate(() => {
		window.location.hash = '#/board';
	});
	await page.waitForURL((url) => url.hash === `#/screen/${homeId}`, { timeout: 10_000 });
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
	await expect(screenHeading(page, 'DM screen')).toBeVisible();
});

test('/board re-entered the moment its redirect is written still lands on the GM screen', async ({
	page,
}) => {
	await markOnboarded(page);
	await gotoRoute(page, '/screens');
	const homeId = await homeSceneId(page);
	// The test above re-enters `/board` over a Playwright round-trip, so it only loses the race when
	// the host is slow enough. Here `/board` comes back in the microtask after the redirect's
	// `replaceState`, before React can render the redirect: both router updates settle together on a
	// location equal to the committed `/board`, and nothing re-renders the aliases unless the app
	// listens for the browser's own URL change (a promotion run sat on the empty pane for 10s).
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
	await page.evaluate(() => {
		const replaceState = history.replaceState.bind(history);
		let armed = true;
		history.replaceState = (data, unused, url) => {
			replaceState(data, unused, url);
			if (armed && String(url).includes('#/screen/')) {
				armed = false;
				queueMicrotask(() => {
					window.location.hash = '#/board';
				});
			}
		};
		window.location.hash = '#/board';
	});
	await expect.poll(() => hash(page), { timeout: 10_000 }).toBe(`#/screen/${homeId}`);
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
	await expect(screenHeading(page, 'DM screen')).toBeVisible();
});

test('a screen that does not exist says so and leads back to the library', async ({ page }) => {
	await markOnboarded(page);
	await gotoRoute(page, '/screen/no-such-screen');
	await expect(page.getByText('This screen isn’t available')).toBeVisible();
	await page.locator('#main-content').getByRole('button', { name: 'All screens' }).click();
	await page.waitForURL((url) => url.hash === '#/screens', { timeout: 10_000 });
});
