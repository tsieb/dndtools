import { expect, test, type Page } from '@playwright/test';
import { openSection } from './_nav-helper';

/**
 * UX-RELEASE — production-readiness walkthrough + player-safe no-leak sweep.
 *
 * The shareable-cut evidence that the remade UI is complete enough to share:
 * - AC1: every primary surface renders real content (not a placeholder-only screen) with the single
 *   correct route `h1`.
 * - AC2: across Desktop + Mobile profiles (both Playwright projects), the primary surfaces have no
 *   horizontal overflow / clipped controls.
 * - AC3: a player never sees DM-only authoring surfaces (the home dashboard add-widget affordance, the
 *   grant manager, or the diagnostics panel) — the home and Settings are the most dangerous leak
 *   surfaces, so they are asserted explicitly here on top of the per-surface no-leak specs.
 */

/** The seven canonical global-nav sections (UX-NAV-002), each with its non-placeholder content testid. */
const PRIMARY_ROUTES: ReadonlyArray<{ id: string; testid: string }> = [
	{ id: 'command-center', testid: 'command-center' },
	{ id: 'session', testid: 'session-view' },
	{ id: 'characters', testid: 'characters-view' },
	{ id: 'atlas', testid: 'atlas-view' },
	{ id: 'campaign', testid: 'campaign-view' },
	{ id: 'knowledge', testid: 'knowledge-view' },
	{ id: 'settings', testid: 'settings-view' },
];

async function home(page: Page) {
	await page.goto('/');
	await page.getByTestId('command-center').waitFor({ state: 'visible' });
}

test.describe('UX-RELEASE production walkthrough (AC1/AC2)', () => {
	test('every primary surface renders real content, a correct h1, and no horizontal overflow', async ({
		page,
	}) => {
		await home(page);
		for (const route of PRIMARY_ROUTES) {
			await openSection(page, route.id);
			// AC1: the surface's real content is present — not a "coming soon" placeholder.
			await expect(page.getByTestId(route.testid)).toBeVisible();
			// NAV-007: exactly one route-level h1, and it reflects the real route (never "Not available").
			const h1 = page.getByTestId('route-title');
			await expect(h1).toBeVisible();
			await expect(h1).not.toHaveText('Not available');
			await expect(h1).not.toBeEmpty();
			// AC2: no horizontal overflow / clipped controls on this profile.
			const overflow = await page.evaluate(
				() => document.documentElement.scrollWidth - document.documentElement.clientWidth,
			);
			expect(overflow, `horizontal overflow on /${route.id}`).toBeLessThanOrEqual(1);
		}
	});
});

test.describe('UX-RELEASE player-safe no-leak sweep (AC3)', () => {
	test('the home leak surface: a player gets their controlled home, never the DM dashboard', async ({
		page,
	}) => {
		await home(page);
		// Switch the viewing actor to a player on the home route, then assert in place: every core query
		// now renders the player-filtered home.
		await page.getByTestId('view-as-select').selectOption('actor-player');
		// The player gets their own controlled home (not the DM dashboard), so the DM dashboard's
		// add-widget affordance and its first-reach coach mark are absent.
		await expect(page.getByTestId('cc-participant-home')).toBeVisible();
		await expect(page.getByTestId('cc-add-widget')).toHaveCount(0);
		await expect(page.getByTestId('coach-mark-cc-add-widget')).toHaveCount(0);
	});

	test('the Settings leak surface: a player never sees the DM grant manager or diagnostics', async ({
		page,
	}) => {
		await home(page);
		await openSection(page, 'settings');
		await expect(page.getByTestId('settings-view')).toBeVisible();
		// Switch to a player on the Settings route, then assert in place.
		await page.getByTestId('view-as-select').selectOption('actor-player');
		// The DM grant manager and diagnostics panel are DM-only — they must not exist for a player.
		await expect(page.getByTestId('grant-manager')).toHaveCount(0);
		await expect(page.getByTestId('diagnostics-panel')).toHaveCount(0);
	});
});
