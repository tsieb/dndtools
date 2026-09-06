import { expect, test } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// RC-UX-3.3 — the keyboard shortcut registry (app/shortcuts/registry.ts) is the single source for
// both the keys the shell fires on and the keys it advertises. These cases pin the two ends of that:
// pressing `?` opens the overlay printed FROM the registry, and Settings › Accessibility prints the
// same registry rather than the hand-authored table it used to carry (which had drifted — it listed
// seven shortcuts while the shell implemented four more it never mentioned).

test.describe('keyboard shortcuts: one registry, read by the handlers and the help', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/session');
		await seedFresh(page);
		await page.goto('/#/session', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
	});

	test('`?` opens the shortcut overlay and Escape closes it', async ({ page }) => {
		await page.locator('#main-content').focus();
		await page.keyboard.press('?');

		const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
		await expect(dialog).toBeVisible();
		// The registry's entries, not a hand-written list: the palette combo and the `?` entry itself.
		await expect(dialog.getByText('Ctrl/⌘+K', { exact: true })).toBeVisible();
		await expect(dialog.getByText('Show this list of keyboard shortcuts')).toBeVisible();
		// Grouped by scope, so a key that only works on the canvas is not advertised as global.
		await expect(dialog.getByRole('heading', { name: 'Scene canvas' })).toBeVisible();

		await page.keyboard.press('Escape');
		await expect(dialog).toBeHidden();
	});

	test('never fires while a text field has focus', async ({ page }) => {
		// `?` is a printable character: firing the overlay on it while a DM types would eat the
		// keystroke. The note composer's title field proves the guard on a real authoring surface.
		await page.goto('/#/knowledge', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.getByRole('button', { name: 'New note' }).first().click();
		const field = page.getByPlaceholder('New note title…');
		await field.waitFor({ state: 'visible' });
		await field.click();
		await page.keyboard.press('?');

		await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveCount(0);
		await expect(field).toHaveValue(/\?/);
	});

	test('Settings prints the registry, including the shortcuts the old static list omitted', async ({
		page,
	}) => {
		await page.goto('/#/settings?tab=accessibility', { waitUntil: 'domcontentloaded' });
		await waitReady(page);

		const panel = page.locator('#main-content');
		await expect(panel.getByText('Enter or leave the fullscreen scene display')).toBeVisible();
		await expect(panel.getByText('Show the next queued scene card to players')).toBeVisible();
		await expect(panel.getByText('Show this list of keyboard shortcuts')).toBeVisible();
		// The map editor keymap comes from the tool model, so Settings lists it too.
		await expect(panel.getByRole('heading', { name: 'Map editor' })).toBeVisible();
	});
});
