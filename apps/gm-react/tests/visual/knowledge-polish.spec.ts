import { expect, test, type Page } from '@playwright/test';
import '../e2e/_helpers';

// RC-POL-1.11 — the golden-route `knowledge` captures pin the whole list in three themes. This pins
// the Notes surface in all five themes on every tier, as a text-free crop of a DM-only note card's
// corner: the purple DM-only stripe, the card edge and the accent book glyph, which between them
// carry the theme's accent, DM-only and surface colours. Any crop with text costs several KiB per
// image and the shared baseline budget (check-baseline-budget.mjs) has little room left. The e2e
// polish spec covers the other states with strict axe on both profiles.

const THEMES = ['tavern', 'parchment', 'scholar', 'dungeon', 'high-contrast'] as const;
const DM_ONLY_NOTE = 'The Sunken Crypt — DM notes';

async function stage(page: Page, theme: string): Promise<void> {
	await page.clock.setFixedTime(new Date('2026-03-14T15:30:00Z'));
	await page.addInitScript((applied) => {
		window.localStorage.setItem('dndtools:react:onboarded', 'gate');
		window.localStorage.setItem('dndtools:react:theme', applied);
	}, theme);
}

for (const theme of THEMES) {
	test(`knowledge note card — ${theme}`, async ({ page }) => {
		await stage(page, theme);
		await page.goto('/#/knowledge', { waitUntil: 'domcontentloaded' });
		await page.waitForFunction(() => window.__rt?.loaded === true, null, { timeout: 20_000 });
		await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
		const card = page.locator('li').filter({ hasText: DM_ONLY_NOTE }).first();
		await expect(card).toBeVisible({ timeout: 20_000 });
		await page.evaluate(() => document.fonts.ready);
		// The clip is in viewport coordinates, and on a phone the card can sit below the fold.
		await card.scrollIntoViewIfNeeded();
		const box = (await card.boundingBox())!;
		// Stripe, border and glyph; the "Note" label starts past this width.
		await expect(page).toHaveScreenshot(`knowledge-card-corner--${theme}.png`, {
			clip: { x: box.x, y: box.y, width: 36, height: 36 },
		});
	});
}
