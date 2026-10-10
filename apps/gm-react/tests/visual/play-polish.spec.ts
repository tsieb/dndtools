import { expect, test } from '@playwright/test';
import { presentOnline } from '../e2e/_helpers';

// The golden routes cover the join-first state. Capture the companion frame in every theme.
for (const theme of ['tavern', 'parchment', 'high-contrast', 'scholar', 'dungeon']) {
	test(`play stage ${theme}`, async ({ page }) => {
		await presentOnline(page);
		await page.clock.setFixedTime(new Date('2026-03-14T15:30:00Z'));
		await page.addInitScript((theme) => {
			localStorage.setItem('dndtools:react:theme', theme);
			localStorage.setItem('dndtools:react:onboarded', 'gate');
			// Equal seeded timestamps fall back to entity id order. Keep the full frame deterministic.
			let nextId = 0;
			Object.defineProperty(crypto, 'randomUUID', {
				configurable: true,
				value: () => `00000000-0000-4000-8000-${(++nextId).toString(16).padStart(12, '0')}`,
			});
		}, theme);
		await page.goto('/#/play');
		await page.waitForFunction(() => window.__rt?.loaded === true);
		await page.evaluate(() => window.__rt!.enterPreview({ role: 'player' }));
		await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
		// Runtime hydration can finish before the lazy companion route has loaded. Wait for
		// its frame before checking fonts, keeping route startup outside the pixel comparison.
		const frame = page.locator('.player-view-shell');
		await expect(frame).toBeVisible({ timeout: 20_000 });
		await page.evaluate(() => document.fonts.ready);
		await expect(frame).toHaveScreenshot(`play-stage--${theme}.png`);
	});
}
