import { expect, test, type Page } from '@playwright/test';
import { openSection } from './_nav-helper';

// UX-A11Y-014 (WCAG 3.2.6 consistent help) + UX-A11Y-009/012 (dialog focus trap, restoration) +
// UX-A11Y-002 (keyboard parity). The Help trigger lives in the shared top bar — same position on
// every route — opens the keyboard-shortcut reference in the shared Dialog primitive (focus trapped,
// Escape closes, focus returns to the trigger), and is reachable by `?` everywhere.

async function freshHome(page: Page) {
	await page.goto('/');
	await page.getByTestId('command-center').waitFor({ state: 'visible' });
	await page.evaluate(async () => {
		await indexedDB.deleteDatabase('dndtools-v2');
	});
	await page.reload();
	await page.getByTestId('command-center').waitFor({ state: 'visible' });
}

test.describe('UX-A11Y-014 consistent Help mechanism', () => {
	test('Help trigger is present, labelled, and last in the top bar on every route (AC1)', async ({
		page,
	}) => {
		await freshHome(page);
		const help = page.getByTestId('open-help');
		await expect(help).toBeVisible();
		await expect(help).toHaveAttribute('aria-label', 'Help');

		// Same relative position on a second route: the Help trigger is the last control in the shared
		// top-bar controls on both, so it appears in the same place (the shell header is shared).
		const lastControlTestId = async () =>
			page
				.locator('header.app-header .top-bar-controls')
				.locator('button, a, select')
				.last()
				.getAttribute('data-testid');
		expect(await lastControlTestId()).toBe('open-help');

		await openSection(page, 'settings');
		await page.getByTestId('settings-view').waitFor({ state: 'visible' });
		await expect(page.getByTestId('open-help')).toBeVisible();
		expect(await lastControlTestId()).toBe('open-help');
	});

	test('`?` opens the shortcut reference from any route (AC2), Escape closes it', async ({ page }) => {
		await freshHome(page);
		await page.keyboard.press('Shift+Slash'); // `?`
		await expect(page.getByTestId('help-dialog')).toBeVisible();
		await expect(page.getByTestId('help-shortcuts')).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.getByTestId('help-dialog')).toBeHidden();

		// Consistent on another route.
		await openSection(page, 'settings');
		await page.getByTestId('settings-view').waitFor({ state: 'visible' });
		await page.keyboard.press('Shift+Slash');
		await expect(page.getByTestId('help-dialog')).toBeVisible();
	});
});

test.describe('UX-A11Y-009/012 Help dialog focus trap + restoration', () => {
	test('clicking Help opens a modal dialog, traps focus, Escape restores focus to the trigger', async ({
		page,
	}) => {
		await freshHome(page);
		const help = page.getByTestId('open-help');
		await help.click();

		const dialog = page.getByTestId('help-dialog');
		await expect(dialog).toBeVisible();
		await expect(dialog).toHaveAttribute('role', 'dialog');
		await expect(dialog).toHaveAttribute('aria-modal', 'true');

		// Focus moved inside the dialog (to the close button, the first focusable).
		await expect(page.getByTestId('help-dialog-close')).toBeFocused();

		// Tab keeps focus inside the dialog — it never escapes to the page behind it.
		await page.keyboard.press('Tab');
		const activeInDialog = await page.evaluate(() => {
			const dlg = document.querySelector('[data-testid="help-dialog"]');
			return dlg ? dlg.contains(document.activeElement) : false;
		});
		expect(activeInDialog).toBe(true);

		// Escape closes and returns focus to the trigger (UX-A11Y-009 restoration).
		await page.keyboard.press('Escape');
		await expect(dialog).toBeHidden();
		await expect(help).toBeFocused();
	});
});
