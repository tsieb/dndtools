import { expect, test } from '@playwright/test';
import { gotoRoute, markOnboarded } from '../e2e/_helpers';

// RC-DSN-4.1 — see golden-routes.spec.ts for the suite, its determinism rules and the container
// commands (docs/development/TESTING.md §8).
//
// RC-POL-1.22 pins one palette state per theme and tier: the search row's `esc` key chip (the
// phone tier has no footer), whose text token this pass raised from tertiary to secondary for
// contrast. It costs ~0.6 KiB per image. The shared 32 MiB cap in check-baseline-budget.mjs had
// ~33 KiB left when this landed, and the whole overlay, its illustrated no-results row, Help and
// Shortcuts cost 5–78 KiB per image, 2.6 MiB across sixty. Those states stay covered functionally,
// with unfiltered axe scans on both profiles, in tests/e2e/palette-polish.spec.ts,
// command-palette.spec.ts, help-menu.spec.ts and shortcuts.spec.ts.
for (const theme of ['tavern', 'parchment', 'scholar', 'dungeon', 'high-contrast']) {
	test(`palette key chip — ${theme}`, async ({ page }) => {
		await markOnboarded(page);
		await page.clock.setFixedTime(new Date('2026-03-14T15:30:00Z'));
		await page.addInitScript((value) => localStorage.setItem('dndtools:react:theme', value), theme);
		await gotoRoute(page, '/');
		await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
		await page.evaluate(() => document.fonts.ready);
		await page.keyboard.press('Control+k');
		const palette = page.getByRole('dialog', { name: 'Command palette' });
		await expect(palette).toBeVisible();
		await expect(palette.locator('kbd', { hasText: 'esc' }).first()).toHaveScreenshot(
			`palette-key--${theme}.png`,
		);
	});
}
