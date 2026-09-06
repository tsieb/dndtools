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

// The sidebar's "More · audio, graph & extensions" disclosure computed
// `moreExpanded = moreOpen || platformActive`, so on any of the five routes it contains (/graph,
// /audio, /extensions, /community, /upgrade) it was a DEAD control: clicking it flipped a boolean
// that the OR already overrode, nothing moved, and `aria-expanded` was pinned to `true` for ever.
// Arriving at a platform route still OPENS the group — but it is a real disclosure again.
test.describe('shell: the sidebar More disclosure is a real toggle', () => {
	test('it opens on arrival at a platform route and can still be collapsed there', async ({
		page,
	}) => {
		// A width the full sidebar owns (the rail and phone profiles render different nav).
		await page.setViewportSize({ width: 1280, height: 800 });
		await markOnboarded(page);
		await gotoRoute(page, '/graph');
		await seedFresh(page);
		await page.goto('/#/graph', { waitUntil: 'domcontentloaded' });
		await page.locator('#main-content').waitFor({ state: 'attached' });

		const toggle = page.getByRole('button', { name: /^More · audio/ });
		await expect(toggle).toBeVisible();
		// Never hide the row you are ON: landing on /graph opens the group.
		await expect(toggle).toHaveAttribute('aria-expanded', 'true');
		const nav = page.getByRole('navigation', { name: 'Primary' });
		const graphRow = nav.getByText('Graph & Search', { exact: true });
		await expect(graphRow).toBeVisible();

		// …and pressing it actually collapses the group, which is the part that was dead.
		await toggle.click();
		await expect(toggle).toHaveAttribute('aria-expanded', 'false');
		await expect(graphRow).toHaveCount(0);

		await toggle.click();
		await expect(toggle).toHaveAttribute('aria-expanded', 'true');
		await expect(graphRow).toBeVisible();
	});
});
