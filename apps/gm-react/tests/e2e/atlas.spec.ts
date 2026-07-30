import { expect, test } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// ATLAS — /atlas. This file covers the screen's single notice banner, which is a genuinely mixed
// channel: "Link copied" and "Projected to N players" share it with every command rejection.
//
// Two defects lived there. Atlas's `run()` never cleared the notice on a successful dispatch (the
// map editor's otherwise-identical `run` does), so a refusal outlived every later action — project
// with no live session, then start the session, toggle a layer, create a map, and the banner still
// said "there is no live session". And every message, refusal included, rendered as a polite
// `role="status"` with a blue info glyph, so a hard NO looked exactly like a confirmation.

const MAIN = '#main-content';

test.describe('atlas: the notice banner tells the truth about what just happened', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/atlas');
		await seedFresh(page);
		await page.goto('/#/atlas', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.locator(MAIN).waitFor({ state: 'attached' });
	});

	test('a rejection announces assertively, and the next success clears it', async ({ page }) => {
		const project = page.getByRole('button', { name: 'Project to players' });
		await expect(project).toBeVisible();

		// No live session on a fresh vault, so the Core refuses. That refusal must reach the user as
		// an alert, not as a polite status update in the same skin a success would use.
		await project.click();
		const notice = page.locator(`${MAIN} [role="alert"]`);
		await expect(notice).toHaveCount(1);
		const refusal = (await notice.innerText()).trim();
		expect(refusal.length).toBeGreaterThan(0);

		// A later action that succeeds must not leave the refusal standing. Toggling a layer's
		// visibility is a plain accepted dispatch that writes no message of its own.
		const layerSwitch = page.getByRole('switch', { name: /^Show .+ on the map$/ }).first();
		await expect(layerSwitch).toBeVisible();
		await layerSwitch.click();

		await expect(
			page.locator(`${MAIN} [role="alert"], ${MAIN} [role="status"]`).filter({ hasText: refusal }),
		).toHaveCount(0);
	});

	test('the refusal is dismissible and does not come back on its own', async ({ page }) => {
		await page.getByRole('button', { name: 'Project to players' }).click();
		await expect(page.locator(`${MAIN} [role="alert"]`)).toHaveCount(1);

		await page.getByRole('button', { name: 'Dismiss notice' }).click();
		await expect(page.locator(`${MAIN} [role="alert"]`)).toHaveCount(0);
	});
});
