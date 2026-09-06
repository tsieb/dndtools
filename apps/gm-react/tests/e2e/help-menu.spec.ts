import { expect, test } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh } from './_helpers';

// RC-UX-3.4 — Help menu (WCAG 3.2.6 consistent help, a Getting started milestone list off the
// core's own onboarding view, and a What's new section parsed from the repo's CHANGELOG.md).
// The trigger currently lives in `Footer.tsx` (phone tier only — see the run journal HANDOFF for
// the desktop/tablet/rail equivalent), so this spec forces the phone viewport regardless of
// project.

test.describe('help menu', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await markOnboarded(page);
		await gotoRoute(page, '/');
		await seedFresh(page);
	});

	test("opens from the fixed Help trigger with Getting started and What's new", async ({
		page,
	}) => {
		await page.getByRole('button', { name: 'Help' }).click();

		const dialog = page.getByRole('dialog', { name: 'Help' });
		await expect(dialog).toBeVisible();
		await expect(dialog.getByRole('heading', { name: 'Getting started' })).toBeVisible();
		await expect(dialog.getByText(/of \d+ set up/)).toBeVisible();
		await expect(dialog.getByRole('heading', { name: "What's new" })).toBeVisible();
	});

	test('opens the keyboard shortcuts overlay from within the Help menu', async ({ page }) => {
		await page.getByRole('button', { name: 'Help' }).click();
		const dialog = page.getByRole('dialog', { name: 'Help' });
		await dialog.getByRole('button', { name: 'Keyboard shortcuts' }).click();

		await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
	});

	test("the What's new badge clears once the menu has been opened", async ({ page }) => {
		const trigger = page.getByRole('button', { name: 'Help' });
		const badge = page.getByTestId('whats-new-badge');
		// A fresh profile has never opened the menu, so the unseen-release dot is present.
		await expect(badge).toBeVisible();
		await trigger.click();
		await page.getByRole('dialog', { name: 'Help' }).getByRole('button', { name: 'Close' }).click();
		await expect(badge).toHaveCount(0);
	});
});
