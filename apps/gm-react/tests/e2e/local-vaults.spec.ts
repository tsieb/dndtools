import { expect, test } from '@playwright/test';
import { gotoRoute, markOnboarded, waitReady } from './_helpers';

// Desktop management is the owned shell surface. Rail/More and production activation require the
// handoffs in RC-UX-5.4's journal; do not silently enable a switch with global preferences/cloud IDs.
test('local vault catalog creates and renames without mutating the open campaign', async ({
	page,
}) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await markOnboarded(page);
	await gotoRoute(page, '/board');
	// Board initialization persists its home scene after runtime.loaded becomes true.
	await expect(
		page.locator('[data-testid="scene-board-bounded"] [data-testid^="widget-"]').first(),
	).toBeVisible();
	const before = await page.evaluate(() => window.__rt!.state.sync.operations.length);
	const chip = page.getByRole('button', { name: 'Local vaults', exact: true });
	await chip.focus();
	await page.keyboard.press('Enter');
	const dialog = page.getByRole('dialog', { name: 'Local vaults' });
	await expect(dialog).toBeVisible();
	await expect(dialog.getByText(/Last opened/)).toBeVisible();
	await dialog.getByLabel('Vault name', { exact: true }).fill('Mountain campaign');
	await dialog.getByRole('button', { name: 'Create vault', exact: true }).click();
	await expect(
		dialog.getByRole('button', { name: 'Mountain campaign', exact: true }),
	).toBeDisabled();
	await expect(
		dialog.getByText('Opening another vault is unavailable in this version.'),
	).toBeVisible();
	await expect(dialog.getByText('Not opened yet')).toBeVisible();
	await dialog.getByRole('button', { name: 'Rename Your campaign', exact: true }).click();
	await dialog.getByLabel('Rename vault', { exact: true }).fill('Harbor campaign');
	await dialog.getByRole('button', { name: 'Save', exact: true }).click();
	await page.keyboard.press('Escape');
	await expect(dialog).not.toBeVisible();
	await expect(chip).toBeFocused();
	await expect(chip).toContainText('Harbor campaign');
	expect(await page.evaluate(() => window.__rt!.state.sync.operations.length)).toBe(before);
	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitReady(page);
	await chip.click();
	await expect(dialog.getByRole('button', { name: 'Harbor campaign', exact: true })).toBeVisible();
	await expect(
		dialog.getByRole('button', { name: 'Mountain campaign', exact: true }),
	).toBeVisible();
	expect(await page.evaluate(() => window.__rt!.state.sync.operations.length)).toBe(before);
});
