import { expect, test } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh } from './_helpers';

// RC-UX-3.1 — contextual HelpTips beside non-obvious controls. Every placement is the same
// `ContextHelp` toggletip, so this opens the ones on Settings › Sync (vault privacy mode and the
// recovery key) end to end: press to open, read the copy, Escape or a second press to close, and
// focus lands back on the trigger either way.

test.describe('contextual help tips', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/');
		await seedFresh(page);
		await gotoRoute(page, '/settings?tab=sync');
	});

	test('the vault privacy tip opens with its explanation and Escape returns focus', async ({
		page,
	}) => {
		const trigger = page.getByRole('button', { name: 'About vault privacy mode' });
		await expect(trigger).toHaveAttribute('aria-expanded', 'false');

		await trigger.focus();
		await page.keyboard.press('Enter');
		const tip = page.getByRole('dialog', { name: 'Vault privacy mode' });
		await expect(tip).toBeVisible();
		await expect(tip).toContainText('only your devices hold the keys');
		await expect(trigger).toHaveAttribute('aria-expanded', 'true');

		await page.keyboard.press('Escape');
		await expect(tip).toHaveCount(0);
		await expect(trigger).toBeFocused();
		await expect(trigger).toHaveAttribute('aria-expanded', 'false');
	});

	test('the recovery key tip toggles closed from its own trigger', async ({ page }) => {
		const trigger = page.getByRole('button', { name: 'About the recovery key' });
		await trigger.click();
		const tip = page.getByRole('dialog', { name: 'Recovery key' });
		await expect(tip).toBeVisible();
		await expect(tip).toContainText('the only way back into your encrypted backups');
		// The whole panel stays on screen, even beside a right-edge panel action on a phone.
		const box = await tip.boundingBox();
		const width = page.viewportSize()?.width ?? 0;
		expect(box).not.toBeNull();
		expect(box!.x).toBeGreaterThanOrEqual(0);
		expect(box!.x + box!.width).toBeLessThanOrEqual(width);

		await trigger.click();
		await expect(tip).toHaveCount(0);
	});
});
