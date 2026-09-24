import { expect, test } from '@playwright/test';
import '../e2e/_helpers';

// RC-POL-1.5: the golden-route `characters` captures pin the populated roster in three themes. This
// pins the illustrated empty roster in all five, clipped to a text-free band of its illustration
// (frame stroke, dashed figure, halo fill): the shared baseline budget (check-baseline-budget.mjs)
// has no room for full-page or even whole-illustration captures in every theme and tier.
// tests/e2e/characters-polish.spec.ts covers the other states and their axe scans.
for (const theme of ['tavern', 'parchment', 'high-contrast', 'scholar', 'dungeon']) {
	test(`characters empty ${theme}`, async ({ page }) => {
		await page.addInitScript((applied) => {
			localStorage.setItem('dndtools:react:theme', applied);
			localStorage.setItem('dndtools:react:onboarded', 'gate');
		}, theme);
		await page.goto('/#/characters', { waitUntil: 'domcontentloaded' });
		await page.waitForFunction(() => window.__rt?.loaded === true, null, { timeout: 20_000 });
		// An observer sees nothing once every character is DM-only: the empty projection, not a filter.
		await page.evaluate(async () => {
			const rt = window.__rt!;
			const state = rt.state.characters as { characters: Record<string, { id: string }> };
			for (const character of Object.values(state.characters)) {
				const result = await rt.dispatch({
					type: 'character.set-sharing',
					actorId: rt.defaultActorId,
					payload: { characterId: character.id, visibility: 'dm-only', sharedWith: [] },
				});
				if (result.status !== 'accepted') throw new Error('Unable to prepare private roster');
			}
			rt.enterPreview({ role: 'observer' });
		});
		const art = page.locator('svg[data-illustration="characters-empty"]');
		await expect(art).toBeVisible();
		await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
		await page.evaluate(() => document.fonts.ready);
		const box = (await art.boundingBox())!;
		await expect(page).toHaveScreenshot(`characters-empty--${theme}.png`, {
			clip: { x: Math.round(box.x) + 40, y: Math.round(box.y) + 36, width: 80, height: 48 },
		});
	});
}
