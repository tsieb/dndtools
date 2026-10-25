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
		await search.fill('DM screen');
		await expect(dialog.getByRole('option', { name: 'DM screen' })).toBeVisible();
		await expectInteractiveControlsReachable(page, dialog, 'command palette');
	});

	test('compact navigation primary controls are touch-sized and not hidden by fixed chrome', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 375, height: 667 });
		const navigation = page.getByRole('navigation', { name: 'Primary' });
		await expect(navigation).toBeVisible();
		for (const name of ['Screens', 'More']) {
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

// IA-1 (RC-ENG-15.1) retired the sidebar's "More · audio, graph & extensions" disclosure (whose
// dead-toggle bug this block used to guard). Graph is now a local page of Notes: landing on /graph
// marks Notes current in Primary and lists Graph in a Notes landmark of its own, never in Primary.
test.describe('shell: Graph is a local page of Notes', () => {
	test('arriving at /graph selects Notes and shows Graph beside, not inside, Primary', async ({
		page,
	}) => {
		// A width the full sidebar owns (the rail and phone profiles render different nav).
		await page.setViewportSize({ width: 1280, height: 800 });
		await markOnboarded(page);
		await gotoRoute(page, '/graph');
		await seedFresh(page);
		await page.goto('/#/graph', { waitUntil: 'domcontentloaded' });
		await page.locator('#main-content').waitFor({ state: 'attached' });

		const primary = page.getByRole('navigation', { name: 'Primary' });
		// Notes is the current SECTION (`true`); Graph is the current PAGE.
		await expect(primary.getByRole('button', { name: /^Notes/ })).toHaveAttribute(
			'aria-current',
			'true',
		);
		await expect(primary.getByText('Graph & search', { exact: true })).toHaveCount(0);
		const local = page.getByRole('navigation', { name: 'Notes', exact: true });
		const graphRow = local.getByRole('button', { name: /^Graph & search/ });
		await expect(graphRow).toHaveAttribute('aria-current', 'page');
		// Leaving Notes swaps the local pages out (ADR-013 local navigation).
		await primary.getByRole('button', { name: /^Maps/ }).click();
		await page.waitForURL(/#\/atlas/);
		await expect(local).toHaveCount(0);
	});
});
