import { expect, test } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

test.beforeEach(async ({ page }) => {
	await markOnboarded(page);
	await gotoRoute(page, '/settings');
	await seedFresh(page);
	await page.goto('/#/settings');
	await waitReady(page);
	await page.getByRole('radio', { name: /Beginner/ }).click();
});

test('Beginner hides controls and Manage links; Expert reveals the real sections', async ({
	page,
}) => {
	await gotoRoute(page, '/');
	await expect(page.getByRole('heading', { name: 'Manage', exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: /Permission grants|Permissions/ })).toHaveCount(0);
	await gotoRoute(page, '/settings?tab=about');
	for (const label of [
		'Storage usage',
		'Error counts',
		'Performance marks',
		'Export diagnostics bundle',
	]) {
		await expect(page.getByRole('heading', { name: label, exact: true })).toHaveCount(0);
	}
	await gotoRoute(page, '/settings?tab=sync');
	await expect(page.getByText('Hidden at your experience level')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Vault privacy mode', exact: true })).toHaveCount(
		0,
	);
	await gotoRoute(page, '/settings?tab=permissions');
	await expect(page.getByText('Hidden at your experience level')).toBeVisible();
	await page.getByRole('button', { name: 'Show advanced settings' }).click();
	await expect(page.locator('[data-settings-section="settings.permissions.roles"]')).toBeVisible();
	await gotoRoute(page, '/settings?tab=sync');
	await expect(
		page.getByRole('heading', { name: 'Vault privacy mode', exact: true }),
	).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Local backup', exact: true })).toBeVisible();
	await gotoRoute(page, '/settings?tab=about');
	for (const label of [
		'Storage usage',
		'Error counts',
		'Performance marks',
		'Export diagnostics bundle',
	]) {
		await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible();
	}
});

test('section deep link unlocks directly and an open page follows tier changes in another window', async ({
	page,
	context,
}) => {
	await gotoRoute(page, '/settings?tab=sync&section=settings-privacy-title');
	await expect(page.getByText('Hidden at your experience level')).toBeVisible();
	await page.getByRole('button', { name: 'Show advanced settings' }).click();
	await expect(
		page.getByRole('heading', { name: 'Vault privacy mode', exact: true }),
	).toBeVisible();
	const picker = await context.newPage();
	await gotoRoute(picker, '/settings');
	await picker
		.getByRole('radiogroup', { name: 'Experience complexity' })
		.getByRole('radio', { name: /Standard/ })
		.click();
	await expect(page.getByText('Hidden at your experience level')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Vault privacy mode', exact: true })).toHaveCount(
		0,
	);
	await gotoRoute(page, '/settings?tab=sync#settings-privacy-rowCloud');
	await expect(page.getByText('Hidden at your experience level')).toBeVisible();
	await gotoRoute(page, '/settings?tab=sync');
	await expect(page.getByText('Hidden at your experience level')).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Local backup', exact: true })).toHaveCount(0);
	await picker
		.getByRole('radiogroup', { name: 'Experience complexity' })
		.getByRole('radio', { name: /Expert/ })
		.click();
	await expect(
		page.getByRole('heading', { name: 'Vault privacy mode', exact: true }),
	).toBeVisible();
	await picker
		.getByRole('radiogroup', { name: 'Experience complexity' })
		.getByRole('radio', { name: /Beginner/ })
		.click();
	await expect(page.getByText('Hidden at your experience level')).toBeVisible();
	await picker.close();
});
