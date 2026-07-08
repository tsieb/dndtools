import { expect, test } from '@playwright/test';

// UX-CAMPAIGN — the Campaign world-model route shell: a cross-cutting, actor-filtered lens over the
// cast (characters), locations (maps), timeline (calendar-dated content), and lore (notes), each
// cross-linked to the surface that owns it. Renders the same on desktop and compact profiles, so this
// runs on BOTH Playwright projects.

test.describe('UX-CAMPAIGN world-model route shell', () => {
	test('the Campaign route shows the world-model category sections and cross-links', async ({ page }) => {
		await page.goto('/campaign/');
		await page.getByTestId('campaign-view').waitFor({ state: 'visible' });

		// The four world-model lenses are present.
		await expect(page.getByTestId('campaign-timeline')).toBeVisible();
		await expect(page.getByTestId('campaign-cast')).toBeVisible();
		await expect(page.getByTestId('campaign-locations')).toBeVisible();
		await expect(page.getByTestId('campaign-lore')).toBeVisible();

		// Campaign is a lens, not a copy — it points back to Knowledge for arcs/quests/factions.
		await expect(page.getByTestId('campaign-future-note')).toContainText('Knowledge');

		// Cross-links to the owning surfaces are present (Campaign does not duplicate the data).
		await expect(page.locator('a[href^="/knowledge/"]').first()).toBeVisible();
	});
});
