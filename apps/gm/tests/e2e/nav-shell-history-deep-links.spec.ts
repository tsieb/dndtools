import { expect, test, type Page } from '@playwright/test';
import { openSection } from './_nav-helper';

// UX-SHELL contextual navigation, history, and deep links (epic 8):
// - UX-NAV-008 backlinks as a navigation surface (count, Alt+B, focus).
// - UX-NAV-012 scroll-position restoration across browser back/forward.
// - UX-NAV-016 player-safe "unavailable" deep-link state with a recovery action + offline copy.
// - UX-NAV-017 in-app back/forward controls.
// - UX-NAV-020 legacy alias redirects are transparent and use replaceState (back skips the alias).

async function freshHome(page: Page) {
	await page.goto('/');
	await page.getByTestId('command-center').waitFor({ state: 'visible' });
	await page.evaluate(async () => {
		await indexedDB.deleteDatabase('dndtools-v2');
		localStorage.removeItem('dndtools-v2-nav-history');
	});
	await page.reload();
	await page.getByTestId('command-center').waitFor({ state: 'visible' });
}

async function freshAtlas(page: Page) {
	await page.goto('/atlas/');
	await page.getByTestId('atlas-view').waitFor({ state: 'visible' });
	await page.evaluate(async () => {
		await indexedDB.deleteDatabase('dndtools-v2');
	});
	await page.reload();
	await page.getByTestId('atlas-view').waitFor({ state: 'visible' });
}

async function viewAs(page: Page, role: 'dm' | 'player') {
	await page.getByTestId('view-as-select').selectOption(role === 'dm' ? 'local-dm' : 'actor-player');
}

/** Read/scroll whichever container scrolls on the active profile (window on Desktop/landscape,
 *  the `<main>` content region on the compact layout). */
async function setScroll(page: Page, y: number) {
	await page.evaluate((target) => {
		const main = document.getElementById('main-content');
		if (main && main.scrollHeight > main.clientHeight + 20) main.scrollTop = target;
		else window.scrollTo(0, target);
	}, y);
}
async function getScroll(page: Page): Promise<number> {
	return page.evaluate(() => {
		const main = document.getElementById('main-content');
		if (main && main.scrollHeight > main.clientHeight + 20) return Math.round(main.scrollTop);
		return Math.round(window.scrollY);
	});
}

test.describe('UX-NAV-007 breadcrumbs are second-level and deeper only', () => {
	test('AC1: no breadcrumb renders at a section root', async ({ page }) => {
		await freshHome(page);
		// A bare section root (Home + Section) shows no breadcrumb — the global nav conveys location.
		await openSection(page, 'atlas');
		await page.getByTestId('atlas-view').waitFor({ state: 'visible' });
		await expect(page.getByTestId('breadcrumbs')).toHaveCount(0);

		await openSection(page, 'knowledge');
		await page.getByTestId('knowledge-view').waitFor({ state: 'visible' });
		await expect(page.getByTestId('breadcrumbs')).toHaveCount(0);
	});

	test('AC2: an open entity shows the location trail with the current item marked', async ({
		page,
	}, testInfo) => {
		await freshHome(page);
		// The Command Center home Scene is an open entity below the Scenes section root.
		await page.getByTestId('cc-open-editor').click();
		await page.getByTestId('scene-editor').waitFor({ state: 'visible' });

		const breadcrumbs = page.getByTestId('breadcrumbs');
		await expect(breadcrumbs).toBeVisible();
		if (testInfo.project.name === 'mobile-chromium') {
			// Compact: the trail truncates to `‹ <parent>` with the full path in a sheet.
			await expect(page.getByTestId('breadcrumb-compact-trigger')).toBeVisible();
		} else {
			// The current location is the deepest crumb, marked aria-current (non-interactive).
			await expect(breadcrumbs.locator('[aria-current="page"]')).toHaveCount(1);
			await expect(breadcrumbs.getByRole('link', { name: 'Scenes' })).toBeVisible();
		}
	});
});

test.describe('UX-NAV-008 backlinks as navigation', () => {
	test('AC1/AC3: the panel shows a count and Alt+B expands a collapsed panel onto the first row', async ({
		page,
	}, testInfo) => {
		test.skip(
			testInfo.project.name !== 'desktop-chromium',
			'Alt+B + the inline complementary panel are the Desktop surface (compact uses a sheet)',
		);
		await freshHome(page);

		// Open the Command Center home Scene so it has a backlink.
		await page.getByTestId('cc-open-editor').click();
		await page.getByTestId('scene-editor').waitFor({ state: 'visible' });

		// AC1: the toggle shows the authorized backlink count, matching the rendered rows.
		const toggle = page.getByTestId('backlinks-toggle');
		const panel = page.getByTestId('contextual-nav');
		await expect(panel).toBeVisible();
		const rows = panel.locator('a[data-backlink-row]');
		const rowCount = await rows.count();
		expect(rowCount).toBeGreaterThan(0);
		await expect(toggle).toHaveText(`Backlinks (${rowCount})`);

		// Collapse the panel, then AC3: Alt+B re-expands it and moves focus to the first row.
		await toggle.click();
		await expect(page.getByTestId('contextual-nav')).toHaveCount(0);
		await page.keyboard.press('Alt+b');
		await expect(page.getByTestId('contextual-nav')).toBeVisible();
		await expect(page.getByTestId('contextual-nav').locator('a[data-backlink-row]').first()).toBeFocused();
	});
});

test.describe('UX-NAV-012 scroll restoration', () => {
	// Session and Atlas are both DIRECT tabs on every profile (no compact "More" sheet), so these
	// navigations stay client-side (popstate on back) — the in-memory restoration store applies.
	test('AC2: browser back restores the saved scroll position', async ({ page }) => {
		await freshHome(page);

		// Session is a tall section on every profile.
		await openSection(page, 'session');
		await page.getByTestId('session-view').waitFor({ state: 'visible' });
		await setScroll(page, 600);
		await expect.poll(() => getScroll(page)).toBeGreaterThan(300);

		// Navigate away to a different section...
		await openSection(page, 'atlas');
		await page.getByTestId('atlas-view').waitFor({ state: 'visible' });

		// ...then browser back restores Session AND its scroll offset (not reset to the top).
		await page.goBack();
		await page.getByTestId('session-view').waitFor({ state: 'visible' });
		await expect.poll(() => getScroll(page)).toBeGreaterThan(300);
	});

	test('AC1: a forward navigation to a new route starts at the top', async ({ page }) => {
		await freshHome(page);
		await openSection(page, 'session');
		await page.getByTestId('session-view').waitFor({ state: 'visible' });
		await setScroll(page, 600);
		await expect.poll(() => getScroll(page)).toBeGreaterThan(300);
		await openSection(page, 'atlas');
		await page.getByTestId('atlas-view').waitFor({ state: 'visible' });
		// A fresh forward navigation starts at the top, not at the previous page's offset.
		await expect.poll(() => getScroll(page)).toBeLessThan(50);
	});
});

test.describe('UX-NAV-016 player-safe deep-link unavailable state', () => {
	test('AC2: a hidden target is generic-unavailable with a recovery action and no leak', async ({
		page,
	}) => {
		await freshAtlas(page);
		await page.goto('/atlas/?map=map-ruined-keep&poi=region-secret-cellar');
		await page.getByTestId('map-viewport').waitFor({ state: 'visible' });
		await viewAs(page, 'player');

		const unavailable = page.getByTestId('deep-link-unavailable');
		await expect(unavailable).toBeVisible();
		await expect(page.getByTestId('map-viewport')).toHaveCount(0);
		// Names nothing about the hidden target.
		await expect(unavailable).not.toContainText('Ruined Keep');
		await expect(unavailable).not.toContainText('Secret Cellar');
		await expect(unavailable.getByRole('heading', { level: 2 })).toHaveText('Not available');

		// The recovery action returns to the Command Center.
		await unavailable.getByTestId('unavailable-home').click();
		await expect(page).toHaveURL(/\/$/);
		await expect(page.getByTestId('command-center')).toBeVisible();
	});

	test('offline shows offline-specific copy and a retry affordance', async ({ page, context }) => {
		await freshAtlas(page);
		await page.goto('/atlas/?map=map-never-synced');
		const unavailable = page.getByTestId('deep-link-unavailable');
		await expect(unavailable).toBeVisible();

		await context.setOffline(true);
		await expect(page.getByTestId('unavailable-retry')).toBeVisible();
		await expect(unavailable).toContainText('offline');
		// Still no entity name and a recovery action is present.
		await expect(page.getByTestId('unavailable-home')).toBeVisible();
		await context.setOffline(false);
	});
});

test.describe('UX-NAV-017 in-app back/forward controls', () => {
	test('the in-app controls move through history like the browser buttons', async ({ page }) => {
		await freshHome(page);
		await openSection(page, 'atlas');
		await page.getByTestId('atlas-view').waitFor({ state: 'visible' });
		await openSection(page, 'settings');
		await page.getByTestId('settings-view').waitFor({ state: 'visible' });

		// In-app back returns to Atlas...
		await page.getByTestId('history-back').click();
		await expect(page).toHaveURL(/\/atlas\/?$/);
		await page.getByTestId('atlas-view').waitFor({ state: 'visible' });

		// ...and in-app forward returns to Settings.
		await page.getByTestId('history-forward').click();
		await expect(page).toHaveURL(/\/settings\/?$/);
		await page.getByTestId('settings-view').waitFor({ state: 'visible' });
	});
});

test.describe('UX-NAV-020 legacy alias transparency (replaceState)', () => {
	test('a redirected alias does not appear in history (back skips it)', async ({ page }) => {
		await page.goto('/settings/');
		await page.getByTestId('settings-view').waitFor({ state: 'visible' });

		// Navigate to a legacy alias; it redirects to the canonical Atlas route, preserving params.
		await page.goto('/maps/?poi=region-coast');
		await expect(page).toHaveURL(/\/atlas\/?\?poi=region-coast$/);
		await page.getByTestId('atlas-view').waitFor({ state: 'visible' });

		// Back returns to the page BEFORE the alias (the alias used replaceState, not pushState):
		// were it a pushState redirect, back would re-enter /maps/ and loop back to /atlas/.
		await page.goBack();
		await expect(page).toHaveURL(/\/settings\/?$/);
		await page.getByTestId('settings-view').waitFor({ state: 'visible' });
	});
});
