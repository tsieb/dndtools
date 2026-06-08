import { expect, test } from '@playwright/test';

// UX-VIS-009 (icons), UX-VIS-010 (motion), UX-VIS-011 (density): the foundational Display
// preferences surface in Settings. Runs on both desktop-chromium (Desktop/expanded) and
// mobile-chromium (Pixel 5 / compact), proving the profile-linked density mapping, the motion
// reduced-motion contract, and the shared Icon component's accessibility.

test.describe('UX-VIS display preferences', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/settings/');
		await page.getByTestId('settings-view').waitFor({ state: 'visible' });
		await page.getByTestId('display-preferences').scrollIntoViewIfNeeded();
	});

	test('UX-VIS-010: reducing motion collapses the duration tokens to 0ms', async ({ page }) => {
		await page.getByTestId('motion-option-reduced').click();
		await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
		const standardDuration = await page.evaluate(() =>
			getComputedStyle(document.documentElement).getPropertyValue('--duration-standard').trim(),
		);
		// The browser normalises a zero duration (authored `0ms`) to `0s`.
		expect(['0s', '0ms']).toContain(standardDuration);
		await expect(page.getByTestId('motion-resolved')).toContainText('Reduced motion');

		// The applied data-motion always matches the resolved motion the radiogroup reports.
		const resolved = await page
			.getByTestId('motion-radiogroup')
			.getAttribute('data-resolved-motion');
		await expect(page.locator('html')).toHaveAttribute('data-motion', resolved ?? '');
	});

	test('UX-VIS-009: the icon-only button has an accessible name and status uses non-colour cues', async ({
		page,
	}) => {
		// Icon-only button: the accessible name comes from the Icon component's aria-label.
		await expect(page.getByRole('button', { name: 'Search' })).toBeVisible();

		// Status chips convey state by text (+ distinct icon shape), not colour alone.
		for (const label of ['Saved', 'Unsynced', 'Failed', 'Local only']) {
			await expect(page.getByTestId('icon-demo').getByText(label, { exact: true })).toBeVisible();
		}
		await expect(page.getByTestId('status-chip-dm-only')).toContainText('DM only');
	});

	test('UX-VIS-011: density is profile-linked with correct touch targets', async ({
		page,
	}, testInfo) => {
		const html = page.locator('html');
		const iconButtonMinHeight = () =>
			page
				.getByTestId('icon-only-button')
				.evaluate((el) => getComputedStyle(el).minHeight);
		const focusToken = () =>
			page.evaluate(() =>
				getComputedStyle(document.documentElement).getPropertyValue('--density-focus-target').trim(),
			);

		if (testInfo.project.name === 'mobile-chromium') {
			// AC1: Mobile (compact viewport) locks to comfortable with >=44px touch targets.
			await expect(html).toHaveAttribute('data-density', 'comfortable');
			await expect(page.getByTestId('density-radiogroup')).toHaveAttribute(
				'data-can-override',
				'false',
			);
			await expect(page.getByTestId('density-option-compact')).toHaveAttribute(
				'aria-disabled',
				'true',
			);
			expect(await iconButtonMinHeight()).toBe('44px');
			await expect(page.getByTestId('density-active')).toContainText('comfortable');
		} else {
			// Desktop (expanded viewport): defaults to standard (32px visual target), user-overridable.
			await expect(html).toHaveAttribute('data-density', 'standard');
			await expect(page.getByTestId('density-radiogroup')).toHaveAttribute(
				'data-can-override',
				'true',
			);
			expect(await iconButtonMinHeight()).toBe('32px');
			expect(await focusToken()).toBe('2.75rem'); // 44px focus extent at standard

			// Switch to compact: AC2 — visual target shrinks but the focus ring extent stays 40px.
			await page.getByTestId('density-option-compact').click();
			await expect(html).toHaveAttribute('data-density', 'compact');
			expect(await iconButtonMinHeight()).toBe('28px');
			expect(await focusToken()).toBe('2.5rem'); // 40px focus extent even at 28px visual
			await expect(page.getByTestId('density-active')).toContainText('compact');
		}
	});
});
