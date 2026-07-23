import { expect, test } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh } from './_helpers';
import {
	expectFocusedInputVisible,
	expectInteractiveControlsReachable,
	expectTouchTarget,
} from './ux-audit';

// Representative, deterministic states for the UX finding register. These deliberately exercise
// the paths route-shell scans cannot prove: a populated overlay, focus after viewport shrink, and
// controls at the end of a scroll path behind the compact shell's fixed navigation.
test.describe('UX audit harness: populated and keyboard states', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 360, height: 360 });
		await markOnboarded(page);
		await gotoRoute(page, '/');
		await seedFresh(page);
	});

	test('command palette remains keyboard-reachable at virtual-keyboard height', async ({
		page,
	}) => {
		await page
			.getByRole('button', { name: /Search/ })
			.first()
			.click();
		const dialog = page.getByRole('dialog', { name: 'Command palette' });
		await expect(dialog).toBeVisible();
		const search = dialog.getByRole('combobox');
		await expectFocusedInputVisible(search, 'command palette search');
		await search.fill('GM Screen');
		await expect(dialog.getByRole('option', { name: 'GM Screen' })).toBeVisible();
		await expectInteractiveControlsReachable(page, dialog, 'command palette');
	});

	test('compact navigation primary controls are touch-sized and not hidden by fixed chrome', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 375, height: 667 });
		const navigation = page.getByRole('navigation', { name: 'Primary' });
		await expect(navigation).toBeVisible();
		for (const name of ['Home', 'More']) {
			await expectTouchTarget(
				navigation.getByRole('button', { name }).first(),
				`primary navigation ${name}`,
			);
		}
		await expectInteractiveControlsReachable(page, navigation, 'compact primary navigation');
	});

	test('table-controls sheet exposes every action through its bounded scroll path', async ({
		page,
	}) => {
		await page.getByRole('button', { name: 'Table controls' }).click();
		const sheet = page.getByRole('dialog', { name: 'Table controls' });
		await expect(sheet).toBeVisible();
		await page.waitForTimeout(250); // wait for the sheet entrance transform before geometry checks
		await expectInteractiveControlsReachable(page, sheet, 'table controls sheet');
	});
});
