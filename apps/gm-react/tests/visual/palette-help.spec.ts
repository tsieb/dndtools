import { expect, test } from '@playwright/test';
import { gotoRoute, markOnboarded } from '../e2e/_helpers';

// RC-POL-1.22 / RC-DSN-4.1: capture the complete visible dialog, including its
// header, bounded body and footer, in every shipped theme and responsive tier.
// Dialog crops exclude unrelated route chrome while retaining the surface's layout.
for (const theme of ['tavern', 'parchment', 'scholar', 'dungeon', 'high-contrast']) {
	test(`palette, help and shortcuts — ${theme}`, async ({ page }) => {
		await markOnboarded(page);
		await page.clock.setFixedTime(new Date('2026-03-14T15:30:00Z'));
		await page.addInitScript((value) => localStorage.setItem('dndtools:react:theme', value), theme);
		await gotoRoute(page, '/');
		await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
		await page.evaluate(() => document.fonts.ready);
		await page.keyboard.press('Control+k');
		const palette = page.getByRole('dialog', { name: 'Command palette' });
		await expect(palette).toBeVisible();
		await expect(palette.getByRole('option').first()).toBeVisible();
		await expect(palette).toHaveScreenshot(`palette-populated--${theme}.png`);

		await palette.getByRole('combobox').fill('zzzz-no-such-command');
		await expect(palette.getByText('No matches')).toBeVisible();
		await expect(palette).toHaveScreenshot(`palette-empty--${theme}.png`);

		await palette.getByRole('combobox').fill('Help');
		await page.getByRole('option', { name: 'Help', exact: true }).waitFor();
		await palette.getByRole('combobox').press('Enter');
		const help = page.getByRole('dialog', { name: 'Help', exact: true });
		await expect(help).toBeVisible();
		await expect(help.getByText(/Version /)).toBeVisible();
		await expect(help).toHaveScreenshot(`help--${theme}.png`);

		await help.getByRole('button', { name: 'Keyboard shortcuts' }).click();
		const shortcuts = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
		await expect(shortcuts).toBeVisible();
		await shortcuts.getByRole('region', { name: 'Keyboard shortcuts', exact: true }).focus();
		await expect(shortcuts).toHaveScreenshot(`shortcuts--${theme}.png`);
	});
}
