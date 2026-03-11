import { test, expect } from '@playwright/test';
import { createTempVaultDir, launchDesktopApp, closeDesktopApp } from './helpers/desktop-app.js';

test.describe('Desktop smoke', () => {
	test('launches built desktop app and renders shell', async () => {
		const vaultDir = await createTempVaultDir('dndtools-e2e-vault-');
		const app = await launchDesktopApp(vaultDir, { autoCompleteWizard: false });
		try {
			const wizardHeading = app.page.getByRole('heading', { name: 'Welcome to DND Tools' });
			const shellHeader = app.page.locator('header').first();
			await expect
				.poll(
					async () =>
						(await wizardHeading.isVisible().catch(() => false)) ||
						(await shellHeader.isVisible().catch(() => false)),
					{ timeout: 20_000, intervals: [250, 500, 1_000] },
				)
				.toBe(true);
		} finally {
			await closeDesktopApp(app);
		}
	});
});
