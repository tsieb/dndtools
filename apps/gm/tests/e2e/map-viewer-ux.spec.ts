import { expect, test } from '@playwright/test';

// UX-MAP-001/002/003 — the map VIEWER: opening a map embeds the foundational pan/zoom surface
// (CanvasViewport) with its zoom controls + minimap, under a wayfinding breadcrumb that returns to
// the Atlas in one click. Renders the same on desktop and compact profiles, so this runs on BOTH
// Playwright projects.

test.describe('UX-MAP map viewer', () => {
	test('opening a map shows the spatial viewer with zoom controls and a breadcrumb', async ({ page }) => {
		await page.goto('/atlas/?map=map-western-reaches');
		await page.getByTestId('map-viewport').waitFor({ state: 'visible' });

		// The reused foundational viewport + its always-available zoom controls (UX-MAP-001/003).
		await expect(page.getByTestId('canvas-viewport')).toBeVisible();
		await expect(page.getByTestId('canvas-zoom-fit')).toBeVisible();
		await expect(page.getByTestId('canvas-zoom-in')).toBeVisible();

		// Wayfinding breadcrumb (UX-MAP-002): Atlas › <current map>.
		await expect(page.getByTestId('map-breadcrumb-atlas')).toBeVisible();
		await expect(page.getByTestId('map-breadcrumb-current')).toBeVisible();
	});

	test('the breadcrumb Atlas crumb returns to the map library', async ({ page }) => {
		await page.goto('/atlas/?map=map-western-reaches');
		await page.getByTestId('map-viewport').waitFor({ state: 'visible' });

		await page.getByTestId('map-breadcrumb-atlas').click();
		// Back at the library: the viewer is gone and the actor-visible map list is shown.
		await expect(page.getByTestId('map-viewport')).toHaveCount(0);
		await expect(page.getByTestId('atlas-map-list')).toBeVisible();
	});
});
