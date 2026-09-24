import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { serveAccountFixture, type AccountFixtureMode } from './_accountFixture';
import { gotoRoute, markOnboarded, waitReady } from './_helpers';

async function accountFixture(page: Page, mode: AccountFixtureMode) {
	await serveAccountFixture(page, mode);
	await markOnboarded(page);
	await gotoRoute(page, '/upgrade');
	await waitReady(page);
}

async function checkAxe(page: Page) {
	await page.evaluate(async () => {
		await Promise.all(
			document
				.getAnimations()
				.filter((a) => a.effect?.getTiming().iterations !== Infinity)
				.map((a) => a.finished.catch(() => {})),
		);
	});
	expect(
		(
			await new AxeBuilder({ page })
				.withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'])
				.analyze()
		).violations,
	).toEqual([]);
}

test('account save failure retains the dialog and lets the user retry', async ({ page }) => {
	await accountFixture(page, 'preview');
	await page.getByRole('button', { name: 'Try Lantern preview' }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('button', { name: 'Save plan choice' }).click();
	await expect(dialog.getByRole('button', { name: 'Saving…' })).toBeDisabled();
	await page.keyboard.press('Escape');
	await expect(dialog).toBeVisible();
	await expect(
		page.getByRole('alert').filter({ hasText: 'Could not save your plan choice. Try again.' }),
	).toBeVisible();
	await checkAxe(page);
	await dialog.getByRole('button', { name: 'Save plan choice' }).click();
	await expect(dialog).toHaveCount(0);
	await expect(
		page.getByRole('status').filter({ hasText: 'Now trying the Lantern preview' }),
	).toBeVisible();
});

test('hosted checkout dialog is accessible and a failed handoff can be retried', async ({
	page,
}) => {
	await accountFixture(page, 'checkout');
	await page.getByRole('button', { name: 'Subscribe to Lantern' }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await checkAxe(page);
	await dialog.getByRole('button', { name: 'Continue to secure checkout' }).click();
	await expect(dialog.getByRole('button', { name: 'Opening checkout…' })).toBeDisabled();
	await page.keyboard.press('Escape');
	await expect(dialog).toBeVisible();
	await expect(
		page.getByRole('alert').filter({ hasText: 'Checkout could not be opened. Try again.' }),
	).toBeVisible();
	await expect(dialog.getByRole('button', { name: 'Continue to secure checkout' })).toBeEnabled();
});

test('stale account comparison is illustrated and refresh shows a loading state', async ({
	page,
}) => {
	await accountFixture(page, 'offline');
	await expect(page.locator('[data-illustration="connection-lost"]')).toBeVisible();
	await page.getByRole('button', { name: 'Check again' }).click();
	await expect(page.getByRole('status').filter({ hasText: 'Checking your plan…' })).toBeVisible();
	await expect(page.locator('[data-skeleton="list"]')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Check again' })).toHaveCount(0);
	await expect(page.getByText('Checking your plan…')).toHaveCount(0);
	await checkAxe(page);
});
