import { expect, test, type Page } from '@playwright/test';

/**
 * UX-CMD-001/002/003/008/012 — the role-differentiated Command Center home: the glanceable session
 * status strip, the recoverable last-known-good layout, and the hard DM / player / observer split.
 *
 * The home AGGREGATES campaign-wide state, so it is the product's most dangerous leak surface. The
 * no-leak tests below run on BOTH profiles and prove a player/observer never receives the DM dashboard,
 * a connected-count, or any DM-only scene name/marker.
 */

const FORBIDDEN = 'DMSECRETZZZ9';

async function resetHome(page: Page) {
	await page.goto('/');
	await page.getByTestId('command-center').waitFor({ state: 'visible' });
	await page.evaluate(async () => {
		await indexedDB.deleteDatabase('dndtools-v2');
	});
	await page.reload();
	// The DM home is created from the system template on load; the status strip proves it is ready.
	await page.getByTestId('cc-status-strip').waitFor({ state: 'visible' });
}

async function createScene(page: Page, name: string, visibility: 'dm-only' | 'player-visible') {
	await page.goto('/scenes/');
	await page.getByTestId('scene-name').waitFor({ state: 'visible' });
	await page.getByTestId('scene-name').fill(name);
	await page.getByTestId('scene-visibility').selectOption(visibility);
	await expect(page.getByTestId('scene-create')).toBeEnabled();
	await page.getByTestId('scene-create').click();
	await expect(page.getByTestId('scene-list')).toContainText(name);
}

test.describe('UX-CMD Command Center home + role-differentiated dashboard', () => {
	test.beforeEach(async ({ page }) => {
		await resetHome(page);
	});

	test('UX-CMD-001 — the Command Center is reachable from any surface in one action', async ({
		page,
	}) => {
		// Navigate away to a deep route, then return home with a single nav action.
		await page.goto('/characters/');
		await page.getByTestId('nav-command-center').click();
		await expect(page.getByTestId('command-center')).toBeVisible();
		// The home nav item reports the active page (UX-CMD-001 accessibility).
		await expect(page.getByTestId('nav-command-center').first()).toHaveAttribute(
			'aria-current',
			'page',
		);
	});

	test('UX-CMD-003 — the glanceable status strip surfaces phase, players, and audio for the DM', async ({
		page,
	}) => {
		await expect(page.getByTestId('cc-status-strip')).toBeVisible();
		await expect(page.getByTestId('cc-status-phase')).toContainText('Idle');
		await expect(page.getByTestId('cc-status-turn')).toContainText('No combat');
		// The DM sees the roster cell (player + observer + extra demo players are non-DM participants).
		await expect(page.getByTestId('cc-status-players')).toBeVisible();
		await expect(page.getByTestId('cc-status-audio')).toContainText('Silent');

		// Start the session: the phase cell reflects the live state without any extra interaction.
		await page.getByTestId('session-workflow-active').click();
		await expect(page.getByTestId('cc-status-phase')).toContainText('Active');
	});

	test('UX-CMD-008 — a captured safe point restores the layout after an experimental change', async ({
		page,
	}, testInfo) => {
		test.skip(
			testInfo.project.name === 'mobile-chromium',
			'free-canvas widget move is the desktop layout',
		);
		// A baseline safe point is captured automatically once the home is ready.
		await expect(page.getByTestId('cc-autosave-meta')).toBeVisible();
		await expect(page.getByTestId('cc-autosave-restore')).toBeEnabled();

		const dice = page.getByTestId('cc-widget-dice');
		await expect(dice).toBeVisible();
		const baseline = await dice.locator('.layout').textContent();

		// Make an experimental change (a raw move does NOT re-checkpoint).
		await dice.getByRole('button', { name: 'Move tool right' }).click();
		const moved = await dice.locator('.layout').textContent();
		expect(moved).not.toBe(baseline);

		// Restore the safe point: the dice returns to its captured baseline position.
		await page.getByTestId('cc-autosave-restore').click();
		await expect(page.getByTestId('cc-autosave-status')).toBeVisible();
		const restored = await page.getByTestId('cc-widget-dice').locator('.layout').textContent();
		expect(restored).toBe(baseline);
	});

	test('UX-CMD-012 — a player sees their own controlled view with no DM dashboard and no leak', async ({
		page,
	}) => {
		// The DM authors a DM-only scene carrying a recognizable forbidden marker, and a player-visible
		// scene that will be shared with the player.
		await createScene(page, `Secret ${FORBIDDEN}`, 'dm-only');
		await createScene(page, 'Shared Tavern', 'player-visible');

		// Assign the player-visible scene to the demo player from the Command Center.
		await page.getByTestId('nav-command-center').click();
		await page.getByTestId('cc-player-view-controller').waitFor({ state: 'visible' });
		const select = page.getByTestId('cc-player-view-scene-actor-player');
		const value = await select
			.locator('option', { hasText: 'Shared Tavern' })
			.first()
			.getAttribute('value');
		await select.selectOption(value!);
		await page.getByTestId('cc-player-view-deliver-actor-player').click();
		await expect(page.getByTestId('cc-player-view-assignment-actor-player')).toContainText(
			'Shared Tavern',
		);

		// Switch the rendered actor to the player.
		await page.getByTestId('view-as-select').selectOption('actor-player');

		// The player gets their own participant home — never the DM dashboard.
		await expect(page.getByTestId('cc-participant-home')).toBeVisible();
		await expect(page.getByTestId('cc-participant-role')).toContainText('Player');
		await expect(page.getByTestId('cc-player-scene-name')).toContainText('Shared Tavern');

		// No DM controls are present in the player's tree.
		await expect(page.getByTestId('session-workflow')).toHaveCount(0);
		await expect(page.getByTestId('cc-player-view-controller')).toHaveCount(0);
		await expect(page.getByTestId('cc-preset-list')).toHaveCount(0);
		await expect(page.getByTestId('cc-add-widget')).toHaveCount(0);
		await expect(page.getByTestId('cc-phase-controls')).toHaveCount(0);
		await expect(page.getByTestId('cc-push-open')).toHaveCount(0);
		// The players roster cell is DM-only — a participant never sees a connected count.
		await expect(page.getByTestId('cc-status-players')).toHaveCount(0);

		// The DM-only marker and the DM home scene name never appear anywhere in the player home.
		await expect(page.locator('body')).not.toContainText(FORBIDDEN);
		await expect(page.getByTestId('cc-participant-home')).not.toContainText('Command Center');
	});

	test('UX-CMD-012 — an observer gets a read-only home labelled "Observer mode" with no leak', async ({
		page,
	}) => {
		await createScene(page, `Secret ${FORBIDDEN}`, 'dm-only');

		await page.getByTestId('nav-command-center').click();
		await page.getByTestId('view-as-select').selectOption('actor-observer');

		await expect(page.getByTestId('cc-participant-home')).toBeVisible();
		await expect(page.getByTestId('cc-participant-role')).toContainText('Observer');
		await expect(page.getByTestId('cc-observer-badge')).toBeVisible();
		// Observers get NO personal toolbar (read-only) and no DM controls.
		await expect(page.getByTestId('cc-participant-toolbar')).toHaveCount(0);
		await expect(page.getByTestId('session-workflow')).toHaveCount(0);
		await expect(page.getByTestId('cc-status-players')).toHaveCount(0);
		// The DM-only marker never leaks into the observer home.
		await expect(page.locator('body')).not.toContainText(FORBIDDEN);
	});
});
