import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { waitReady, watchJourney } from './_helpers';

/**
 * RC-UX-6.3 — the first-session guide. A fresh vault's Command Center opens on six open rows; each
 * row's link opens the existing flow, and doing the thing there ticks the row (the vault, not the
 * click, completes it). Hiding the guide removes it from the home screen and Help puts it back.
 * Runs on both profiles: the guide is the first thing in reading order at every tier.
 */

const ROWS = [
	'name-campaign',
	'add-party',
	'map-or-note',
	'screen-from-template',
	'standby-session',
	'open-table',
] as const;

const guide = (page: Page) => page.locator('[data-first-session-guide]');
const row = (page: Page, id: (typeof ROWS)[number]) =>
	guide(page).locator(`[data-first-session-row="${id}"]`);
const link = (page: Page, id: string) => guide(page).locator(`[data-first-session-link="${id}"]`);

/** A fresh profile: onboarding opens over an empty vault. */
async function freshVault(page: Page) {
	await page.goto('/#/');
	await waitReady(page);
	await expect(page.locator('[data-fullscreen-overlay="onboarding"]')).toBeVisible();
}

/** Skip onboarding: the campaign stays unnamed, so every row is open. */
async function skipOnboarding(page: Page) {
	await page.keyboard.press('Escape');
	await expect(page.locator('[data-fullscreen-overlay="onboarding"]')).toBeHidden();
	await expect(guide(page)).toBeVisible();
}

/** Back to the Command Center inside the app, without a reload (the vault write may be in flight). */
async function home(page: Page) {
	await page.evaluate(() => {
		window.location.hash = '#/';
	});
	await expect(guide(page)).toBeVisible();
}

async function expectDone(page: Page, ids: readonly string[]) {
	for (const id of ROWS)
		await expect(row(page, id), id).toHaveAttribute(
			'data-done',
			ids.includes(id) ? 'true' : 'false',
		);
}

test('a fresh vault shows six open rows, and completing each through its link ticks it', async ({
	page,
}) => {
	test.setTimeout(180_000);
	await freshVault(page);
	await skipOnboarding(page);

	// First in reading order, bare (no frame title bar), six open rows.
	const firstRegion = page.locator('[data-testid="home-screen"] [data-widget-region]').first();
	await expect(firstRegion.locator('[data-first-session-guide]')).toHaveCount(1);
	await expect(guide(page).locator('li[data-first-session-row]')).toHaveCount(6);
	await expectDone(page, []);
	await expect(guide(page).getByTestId('first-session-progress')).toHaveText('0 of 6 done');
	// The flow screen's own focus order starts there too.
	await expect(link(page, 'name-campaign')).toBeFocused();
	// A bare part keeps its labelled region and an accessible list.
	const axe = await new AxeBuilder({ page }).include('[data-first-session-guide]').analyze();
	expect(axe.violations.map((violation) => violation.id)).toEqual([]);

	// 1. Name the campaign: onboarding's campaign step, then back onto the guide.
	await link(page, 'name-campaign').click();
	const overlay = page.locator('[data-fullscreen-overlay="onboarding"]');
	await expect(overlay).toBeVisible();
	await overlay.getByLabel('Campaign name').fill('The Drowned Coast');
	await overlay.getByRole('button', { name: 'Continue', exact: true }).click();
	await overlay.getByRole('button', { name: 'Continue', exact: true }).click();
	await overlay.getByRole('button', { name: 'Open the Command Center' }).click();
	await expect(overlay).toBeHidden();
	await expectDone(page, ROWS.slice(0, 1));

	// 2. Add the party: Settings › Players, by name.
	await link(page, 'add-players').click();
	await page.getByLabel('Player names', { exact: true }).fill('Ada Quill');
	await page.getByRole('button', { name: 'Add players', exact: true }).click();
	await expect(page.getByLabel('Role for Ada Quill', { exact: true })).toBeVisible();
	await home(page);
	await expectDone(page, ROWS.slice(0, 2));

	// 3. A map: the Atlas opens on its New map form.
	await link(page, 'new-map').click();
	await expect(page.getByRole('heading', { name: 'Create a new map' })).toBeVisible();
	await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Harbour');
	await page.getByRole('button', { name: 'Create map', exact: true }).click();
	await expect
		.poll(() => page.evaluate(() => Object.keys(window.__rt!.state.maps.maps).length))
		.toBe(1);
	await home(page);
	await expectDone(page, ROWS.slice(0, 3));

	// 4. A screen from a template: the library's New screen dialog.
	await link(page, 'new-screen').click();
	const screenDialog = page.getByRole('dialog', { name: 'New screen' });
	await expect(screenDialog).toBeVisible();
	await screenDialog.getByRole('radio').first().click();
	await screenDialog.getByRole('textbox', { name: 'Name', exact: true }).fill('The Gilded Eel');
	await screenDialog.getByRole('button', { name: 'Create screen', exact: true }).click();
	await expect(screenDialog).toBeHidden();
	await home(page);
	await expectDone(page, ROWS.slice(0, 4));

	// 5. A session in Standby: one roll from the Session screen's dice tray.
	await link(page, 'open-session').click();
	await page.getByLabel('Dice expression').fill('1d20');
	await page.getByRole('button', { name: 'Roll', exact: true }).click();
	await home(page);
	await expectDone(page, ROWS.slice(0, 5));

	// 6. Start a session, which opens the player views.
	await link(page, 'start-session').click();
	await page.getByRole('button', { name: 'Start session', exact: true }).click();
	const start = page.getByRole('dialog', { name: 'Start a session' });
	await start.getByRole('button', { name: 'Start session', exact: true }).click();
	await expect(start).toBeHidden();
	await home(page);

	// Complete: the list collapses to one line.
	await expect(guide(page).locator('[data-first-session-complete]')).toHaveText(
		/Your first session is set up: all 6 done\./,
	);
	await expect(guide(page).locator('li[data-first-session-row]')).toHaveCount(0);
});

test('focus lands on the guide’s first row when onboarding closes onto the Command Center', async ({
	page,
}) => {
	await freshVault(page);
	const overlay = page.locator('[data-fullscreen-overlay="onboarding"]');
	await overlay.getByLabel('Campaign name').fill('Saltmarsh');
	await overlay.getByRole('button', { name: 'Continue', exact: true }).click();
	await overlay.getByRole('button', { name: 'Continue', exact: true }).click();
	await overlay.getByRole('button', { name: 'Open the Command Center' }).click();
	await expect(overlay).toBeHidden();
	await expect(link(page, 'name-campaign')).toBeFocused();
	// Naming the campaign in onboarding ticked the first row.
	await expect(row(page, 'name-campaign')).toHaveAttribute('data-done', 'true');
});

test('hide removes the guide from the Command Center, and Help puts it back', async ({ page }) => {
	const health = watchJourney(page);
	await freshVault(page);
	await skipOnboarding(page);

	await guide(page).getByRole('button', { name: 'Hide guide', exact: true }).click();
	await expect(guide(page)).toHaveCount(0);
	await expect(page.locator('[data-testid="home-screen"]')).toBeVisible();
	expect(
		await page.evaluate(() =>
			Object.values(window.__rt!.state.scenes.scenes).some((scene) =>
				scene.widgets.some((widget) => widget.type === 'getting-started'),
			),
		),
	).toBe(false);

	await page.getByRole('button', { name: 'Help', exact: true }).click();
	const help = page.getByRole('dialog', { name: 'Help' });
	await expect(help.getByRole('heading', { name: 'Getting started' })).toBeVisible();
	// Help lists the same six rows while the widget is hidden.
	await expect(help.locator('li[data-first-session-row]')).toHaveCount(6);
	await help.getByRole('button', { name: 'Show the guide on the Command Center' }).click();
	await expect(help).toBeHidden();

	await expect(guide(page)).toBeVisible();
	await expect(guide(page).locator('li[data-first-session-row]')).toHaveCount(6);
	const firstRegion = page.locator('[data-testid="home-screen"] [data-widget-region]').first();
	await expect(firstRegion.locator('[data-first-session-guide]')).toHaveCount(1);

	// Help no longer offers to put back a guide that is there.
	await page.getByRole('button', { name: 'Help', exact: true }).click();
	await expect(
		page
			.getByRole('dialog', { name: 'Help' })
			.getByRole('button', { name: 'Show the guide on the Command Center' }),
	).toHaveCount(0);
	await page.keyboard.press('Escape');
	await health.assertHealthy();
});
