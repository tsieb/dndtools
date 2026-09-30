import { expect, test } from '@playwright/test';
import { gotoRoute, markOnboarded } from '../e2e/_helpers';

for (const theme of ['tavern', 'parchment', 'scholar', 'dungeon', 'high-contrast']) {
	test(`app shell — ${theme}`, async ({ page }) => {
		await page.clock.setFixedTime(new Date('2026-03-14T15:30:00Z'));
		await markOnboarded(page);
		await page.addInitScript((value) => {
			localStorage.setItem('dndtools:react:theme', value);
		}, theme);
		await gotoRoute(page, '/screens');
		await page.waitForLoadState('networkidle');
		await page.evaluate(() => document.fonts.ready);
		// The scene workspace has its own goldens. Mask only its contents, keeping all shell
		// navigation, titles, footer and safe-area geometry visible in this surface's baseline.
		await expect(page).toHaveScreenshot(`shell--${theme}.png`, {
			mask: [page.locator('#main-content')],
		});
		const phone = (page.viewportSize()?.width ?? 1280) <= 640;
		if (phone) {
			await page.getByRole('button', { name: 'More', exact: true }).click();
			await expect(page.getByRole('dialog', { name: 'All sections' })).toHaveScreenshot(
				`shell-more--${theme}.png`,
			);
		}
		let release!: () => void;
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		await page.route('**/src/app/shell/VaultSwitcher.tsx*', async (route) => {
			await held;
			await route.continue();
		});
		const vaults = page.getByRole('dialog', { name: 'Local vaults' });
		try {
			await page.getByRole('button', { name: /^Local vaults/ }).click();
			await expect(vaults.getByRole('status')).toHaveText('Loading your vaults…');
			await expect(vaults).toHaveScreenshot(`shell-vault-loading--${theme}.png`);
		} finally {
			release();
		}
		await expect(vaults.getByRole('textbox')).toBeVisible();
		await expect(vaults).toHaveScreenshot(`shell-vault-ready--${theme}.png`);
		await page.keyboard.press('Escape');
		await page.evaluate(() => localStorage.setItem('dndtools:react:local-vaults-v1', '{broken'));
		if (phone) await page.getByRole('button', { name: 'More', exact: true }).click();
		await page.getByRole('button', { name: /^Local vaults/ }).click();
		await expect(vaults.getByRole('alert')).toBeVisible();
		await expect(vaults).toHaveScreenshot(`shell-vault-error--${theme}.png`);
	});
}
