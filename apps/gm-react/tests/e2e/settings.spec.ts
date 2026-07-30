import { expect, test } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// SETTINGS — the "Experience complexity" picker on /settings. It decides how much of the toolkit the
// whole app reveals, and it was the last hand-rolled chooser in the file with VISUAL-ONLY selection:
// three plain buttons distinguished by border and background alone, each its own tab stop, with
// nothing telling assistive tech which one was active. The rest of the app (this file's own "Tool
// preferences", Onboarding's choice cards, Community's sort) already declares a real radiogroup with
// arrow-key selection and a roving tabindex; this brings the last one in line.

test.describe('settings: the experience-complexity picker is a real radiogroup', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/settings');
		await seedFresh(page);
		await page.goto('/#/settings', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.locator('#main-content').waitFor({ state: 'attached' });
	});

	test('exposes its three choices as radios with exactly one checked', async ({ page }) => {
		const group = page.getByRole('radiogroup', { name: 'Experience complexity' });
		await expect(group).toBeVisible();

		const radios = group.getByRole('radio');
		await expect(radios).toHaveCount(3);
		await expect(group.getByRole('radio', { checked: true })).toHaveCount(1);
	});

	test('is one tab stop, and arrow keys move the selection', async ({ page }) => {
		const group = page.getByRole('radiogroup', { name: 'Experience complexity' });
		const radios = group.getByRole('radio');

		// Roving tabindex: only the selected card is reachable by Tab, so the group costs one stop
		// rather than three.
		const tabIndexes = await radios.evaluateAll((els) =>
			els.map((el) => el.getAttribute('tabindex')),
		);
		expect(tabIndexes.filter((t) => t === '0')).toHaveLength(1);
		expect(tabIndexes.filter((t) => t === '-1')).toHaveLength(2);

		const checkedBefore = await group.getByRole('radio', { checked: true }).textContent();
		await group.getByRole('radio', { checked: true }).focus();
		await page.keyboard.press('ArrowRight');

		// Selection follows focus, the way an ARIA radiogroup is specified to behave.
		await expect(group.getByRole('radio', { checked: true })).toHaveCount(1);
		const checkedAfter = await group.getByRole('radio', { checked: true }).textContent();
		expect(checkedAfter).not.toBe(checkedBefore);

		// And it wraps, so the group can be traversed entirely from the keyboard.
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('ArrowRight');
		expect(await group.getByRole('radio', { checked: true }).textContent()).toBe(checkedBefore);
	});
});
