import { expect, test, type Page, type TestInfo, type Locator } from '@playwright/test';
import { openSection } from './_nav-helper';

// UX-SHELL — actor-filtered navigation + pinned/recent strip (epic 9):
// - UX-NAV-013: DM-only capability routes (Scenes/Audio/MCP) never reach a player/observer through
//   the nav DOM, the command palette, OR a direct URL — a non-leaking "Not available" page renders.
// - UX-NAV-015: the pinned/recent strip sits between Command Center and the section list (sidebar)
//   or at the top of the "More" sheet (mobile), and only ever shows actor-reachable destinations.

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

async function viewAs(page: Page, actorId: string) {
	await page.getByTestId('view-as-select').selectOption(actorId);
}

/** Pin the current page via the subheader toggle (UX-NAV-015). */
async function pinCurrent(page: Page) {
	const toggle = page.getByTestId('quick-pin-current');
	await expect(toggle).toBeVisible();
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-pressed', 'true');
}

/** The container that hosts the pinned/recent strip on the active profile: the sidebar on
 *  Desktop/landscape, the opened "More" sheet on the compact tab bar. */
async function stripHost(page: Page, testInfo: TestInfo): Promise<Locator> {
	if (testInfo.project.name === 'mobile-chromium') {
		await page.getByTestId('nav-more').click();
		const sheet = page.getByTestId('nav-more-sheet');
		await sheet.waitFor({ state: 'visible' });
		return sheet;
	}
	return page.getByTestId('primary-nav');
}

test.describe('UX-NAV-013 actor-filtered navigation (DM-only route hiding)', () => {
	test('AC2: a non-DM session on a DM-only route gets a generic "Not available" page', async ({
		page,
	}) => {
		// The DM opens the Scenes authoring surface (a DM-only capability route).
		await page.goto('/scenes/');
		await expect(page.getByTestId('scene-name')).toBeVisible();
		await expect(page.getByTestId('section-unavailable')).toHaveCount(0);

		// Switching the active session to a player makes the route resolve to the single generic
		// unavailable page: no scene form, no section name, no resource detail leaks.
		await viewAs(page, 'actor-player');
		await expect(page.getByTestId('section-unavailable')).toBeVisible();
		await expect(page.getByTestId('scene-name')).toHaveCount(0);
		await expect(page.getByTestId('route-title')).toHaveText('Not available');
		await expect(page).toHaveTitle('Not available — DND Tools v2');
		// The "Not available" copy names no entity, route, or section (no-leak).
		const main = page.getByTestId('route-landmark');
		await expect(main).not.toContainText('Weather Panel');
		await expect(main).not.toContainText('Scene');

		// An observer is gated identically.
		await viewAs(page, 'actor-observer');
		await expect(page.getByTestId('section-unavailable')).toBeVisible();
		await expect(page.getByTestId('scene-name')).toHaveCount(0);

		// Returning to the DM restores the authoring surface (the gate is purely actor-driven).
		await viewAs(page, 'local-dm');
		await expect(page.getByTestId('scene-name')).toBeVisible();
		await expect(page.getByTestId('section-unavailable')).toHaveCount(0);
	});

	test('AC1: the non-global DM-only capabilities are absent from the player nav DOM', async ({
		page,
	}) => {
		await freshHome(page);
		await viewAs(page, 'actor-player');
		// Scenes/Audio/MCP are never primary-nav items, and no DM-only path/label leaks.
		await expect(page.getByTestId('nav-scenes')).toHaveCount(0);
		await expect(page.getByTestId('nav-audio')).toHaveCount(0);
		await expect(page.getByTestId('nav-mcp')).toHaveCount(0);
		await expect(page.getByTestId('primary-nav')).not.toContainText('Scenes');
	});
});

test.describe('UX-NAV-015 pinned and recent items strip', () => {
	test('AC1/AC2: pinned items sit below the Library group; recents follow', async ({
		page,
	}, testInfo) => {
		await freshHome(page);

		// Pin two destinations via the per-page toggle.
		await openSection(page, 'session');
		await page.getByTestId('route-landmark').waitFor({ state: 'visible' });
		await pinCurrent(page);
		await openSection(page, 'atlas');
		await page.getByTestId('atlas-view').waitFor({ state: 'visible' });
		await pinCurrent(page);
		// Visit a third section without pinning it, so it lands in recents.
		await openSection(page, 'characters');
		await page.getByTestId('route-landmark').waitFor({ state: 'visible' });

		const host = await stripHost(page, testInfo);
		await expect(host.getByTestId('pinned-recent')).toBeVisible();
		// AC1: exactly the two pinned destinations appear in the pinned group.
		await expect(host.getByTestId('pinned-group').getByTestId('pinned-item')).toHaveCount(2);
		// AC2: the just-visited (unpinned) section appears in the recent group.
		const recent = host.getByTestId('recent-group');
		await expect(recent).toBeVisible();
		await expect(recent.getByTestId('recent-item')).not.toHaveCount(0);
		await expect(recent.getByRole('link', { name: /Characters|Party/ })).toBeVisible();

		if (testInfo.project.name !== 'mobile-chromium') {
			// AC1 position (Desktop sidebar): the design-package rail groups Command Center + the
			// sections under "Library", with the pinned/recent strip below the group. So the vertical
			// order is Command Center -> sections -> strip.
			const order = await page.getByTestId('primary-nav').evaluate((nav) => {
				const ids = ['nav-command-center', 'pinned-recent', 'nav-session'];
				return ids.map((id) => {
					const el = nav.querySelector(`[data-testid="${id}"]`);
					return el ? ids.indexOf(id) : -1;
				});
			});
			expect(order).toEqual([0, 1, 2]); // all present
			const positions = await page.getByTestId('primary-nav').evaluate((nav) => {
				const top = (sel: string) =>
					nav.querySelector(sel)?.getBoundingClientRect().top ?? Number.NaN;
				return {
					home: top('[data-testid="nav-command-center"]'),
					strip: top('[data-testid="pinned-recent"]'),
					session: top('[data-testid="nav-session"]'),
				};
			});
			expect(positions.home).toBeLessThan(positions.session);
			expect(positions.session).toBeLessThan(positions.strip);
		}
	});

	test('AC3: the strip shows only actor-reachable entities (player no-leak)', async ({
		page,
	}, testInfo) => {
		// DM authors a dm-only Scene and a player-visible Scene, then visits each so both land in
		// recents for the DM session.
		await page.goto('/scenes/');
		await page.getByTestId('scene-name').waitFor({ state: 'visible' });
		await page.evaluate(async () => {
			await indexedDB.deleteDatabase('dndtools-v2');
			localStorage.removeItem('dndtools-v2-nav-history');
		});
		await page.reload();
		await page.getByTestId('scene-name').waitFor({ state: 'visible' });

		await page.getByTestId('scene-name').fill('Secret Lair');
		await page.getByTestId('scene-visibility').selectOption('dm-only');
		await page.getByTestId('scene-create').click();
		await page.getByTestId('scene-list').getByRole('link', { name: 'Secret Lair' }).click();
		await page.getByTestId('scene-editor').waitFor({ state: 'visible' });

		await openSection(page, 'session'); // back to a list surface to author the second scene
		await page.goto('/scenes/');
		await page.getByTestId('scene-name').fill('Tavern');
		await page.getByTestId('scene-visibility').selectOption('player-visible');
		await page.getByTestId('scene-create').click();
		await page.getByTestId('scene-list').getByRole('link', { name: 'Tavern' }).click();
		await page.getByTestId('scene-editor').waitFor({ state: 'visible' });

		// As the DM, both scenes are reachable, so both can appear in the strip.
		await page.goto('/');
		await page.getByTestId('command-center').waitFor({ state: 'visible' });
		let host = await stripHost(page, testInfo);
		await expect(host.getByTestId('pinned-recent')).toContainText('Tavern');
		await expect(host.getByTestId('pinned-recent')).toContainText('Secret Lair');

		// Switch the active session to a player: the dm-only Scene is dropped from the strip entirely
		// (absent, not hidden) — only the player-visible Scene survives. No leak through pinned/recent.
		if (testInfo.project.name === 'mobile-chromium') await page.keyboard.press('Escape');
		await viewAs(page, 'actor-player');
		host = await stripHost(page, testInfo);
		await expect(host.getByTestId('pinned-recent')).toContainText('Tavern');
		await expect(host.getByTestId('pinned-recent')).not.toContainText('Secret Lair');
		// The dm-only Scene name never appears anywhere in the primary nav for the player.
		await expect(page.getByTestId('primary-nav')).not.toContainText('Secret Lair');
	});
});
