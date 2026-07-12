import { expect, test, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// COMMAND PALETTE — the ⌘K quick-switcher (app/CommandPalette.tsx on the DS CommandPalette). The
// overlay is the keyboard spine of the seven-section IA: it opens on Meta/Control+K (and from the
// top-bar search trigger), composes static "Go to"/"Create" launchers with the actor-filtered
// entity lists AND live full-text hits from the Processing Core's search engine, NAVIGATES to the
// chosen destination on select, and closes on Escape. These specs drive the real overlay (role
// locators, never test-ids) and assert the router actually moved — the palette's whole reason to
// exist. Every candidate is the actor-filtered read, so nothing dm-only can leak into it.

const PALETTE = { name: 'Command palette' } as const;

/** Open the palette via the keyboard chord and wait for the dialog to mount + take input focus. */
async function openViaKeyboard(page: Page, chord: 'Meta+k' | 'Control+k'): Promise<void> {
	await page.keyboard.press(chord);
	await expect(page.getByRole('dialog', PALETTE)).toBeVisible();
	// The overlay focuses its combobox on open (its a11y contract); typing must land there.
	await expect(page.getByRole('combobox')).toBeFocused();
}

test.describe('command palette: the ⌘K quick-switcher', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/');
		await seedFresh(page);
		await page.goto('/#/', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.locator('#main-content').waitFor({ state: 'attached' });
	});

	test('Meta+K opens the palette and Escape closes it', async ({ page }) => {
		await expect(page.getByRole('dialog', PALETTE)).toHaveCount(0);
		await openViaKeyboard(page, 'Meta+k');

		// The overlay is a real modal dialog with its search input and the footer hint bar.
		await expect(page.getByRole('combobox')).toBeVisible();
		await expect(page.getByText('navigate', { exact: false })).not.toHaveCount(0);

		// Escape (from the focused input) dismisses it and returns to the app.
		await page.keyboard.press('Escape');
		await expect(page.getByRole('dialog', PALETTE)).toHaveCount(0);
	});

	test('Control+K also opens the palette', async ({ page }) => {
		await openViaKeyboard(page, 'Control+k');
		await expect(page.getByRole('dialog', PALETTE)).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.getByRole('dialog', PALETTE)).toHaveCount(0);
	});

	test('the top-bar search trigger opens the palette', async ({ page }) => {
		// The chrome exposes a real search affordance on every viewport (the top bar's "Search
		// everything…" button, plus the sidebar's ⌘K button on desktop) — clicking it opens the
		// same overlay, never a dead button.
		await page.getByRole('button', { name: /Search/ }).first().click();
		await expect(page.getByRole('dialog', PALETTE)).toBeVisible();
		await expect(page.getByRole('combobox')).toBeFocused();
	});

	test('searching a section destination and selecting it navigates there', async ({ page }) => {
		await openViaKeyboard(page, 'Meta+k');

		// "Go to" launchers are static section destinations. GM Screen is distinctive (→ /board).
		await page.getByRole('combobox').fill('GM Screen');
		const option = page.getByRole('option', { name: 'GM Screen' });
		await expect(option).toBeVisible();
		await option.click();

		// Selecting a result RUNS its command (navigate) and closes the overlay.
		await page.waitForURL((url) => url.hash === '#/board', { timeout: 10_000 });
		await expect(page.getByRole('dialog', PALETTE)).toHaveCount(0);
		await page.locator('#main-content').waitFor({ state: 'attached' });
	});

	test('a full-text hit from the core search engine deep-links the matched note', async ({ page }) => {
		await openViaKeyboard(page, 'Meta+k');

		// Typing runs a REAL actor-filtered search over the seeded vault. "Campaign Primer" is a
		// seeded player-visible note; "primer" occurs only in it, so it is the unambiguous hit.
		await page.getByRole('combobox').fill('Campaign Primer');
		const hit = page.getByRole('option', { name: 'Campaign Primer' });
		await expect(hit).toBeVisible({ timeout: 10_000 });
		await hit.click();

		// A note hit deep-links its own /knowledge/:id viewer (not the list).
		await page.waitForURL((url) => /#\/knowledge\/[^/]+/.test(url.hash), { timeout: 10_000 });
		await expect(page.getByRole('dialog', PALETTE)).toHaveCount(0);
		await expect(page.getByText('Campaign Primer')).not.toHaveCount(0);
	});

	test('a Create action lands on the right screen', async ({ page }) => {
		await openViaKeyboard(page, 'Meta+k');

		// The "Create" launchers open the create flow on the owning screen. "New scene" → /scenes.
		await page.getByRole('combobox').fill('New scene');
		const create = page.getByRole('option', { name: 'New scene' });
		await expect(create).toBeVisible();
		await create.click();

		await page.waitForURL((url) => url.hash === '#/scenes', { timeout: 10_000 });
		await expect(page.getByRole('dialog', PALETTE)).toHaveCount(0);
		await page.locator('#main-content').waitFor({ state: 'attached' });
	});

	test('a query that matches nothing shows the calm empty state', async ({ page }) => {
		await openViaKeyboard(page, 'Meta+k');
		await page.getByRole('combobox').fill('zzzznotarealcommandxyzzy');
		await expect(page.getByText('No matches')).toBeVisible();
	});
});
