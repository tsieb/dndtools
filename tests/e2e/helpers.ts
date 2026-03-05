import { expect, type Page } from '@playwright/test';

export async function waitForAppReady(page: Page): Promise<void> {
	await page.goto('/');
	await expect(page.locator('main#main-content')).toBeVisible({ timeout: 20_000 });
	await expect(page.getByRole('button', { name: 'Toggle sidebar' })).toBeVisible({
		timeout: 20_000,
	});
}
