import { expect, test, type Page } from '@playwright/test';

async function createNamedScene(page: Page, name: string) {
	await page.getByTestId('scene-name').fill(name);
	await expect(page.getByTestId('scene-create')).toBeEnabled();
	await page.getByTestId('scene-create').click();
	await expect(page.getByTestId('scene-list').getByRole('link', { name })).toBeVisible();
}

async function selectPlayerViewScene(page: Page, actorId: string, sceneName: string) {
	const select = page.getByTestId(`cc-player-view-scene-${actorId}`);
	const value = await select
		.locator('option', { hasText: sceneName })
		.first()
		.getAttribute('value');
	expect(value).not.toBeNull();
	await select.selectOption(value!);
}

test.describe('CMD-001/002/007 Command Center home Scene', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.getByTestId('command-center').waitFor({ state: 'visible' });
		// Reset local IndexedDB so each run starts from a fresh, unconfigured vault.
		await page.evaluate(async () => {
			await indexedDB.deleteDatabase('dndtools-v2');
		});
		await page.reload();
		// The default Command Center is created from the system template on load.
		await page.getByTestId('cc-profile').waitFor({ state: 'visible' });
	});

	test('default Command Center renders the DM tools as widgets (CMD-001)', async ({
		page,
	}, testInfo) => {
		if (testInfo.project.name === 'mobile-chromium') {
			// Slim profile shows focused panels (CMD-002) — covered separately below.
			await expect(page.getByTestId('cc-tablist')).toBeVisible();
			await expect(page.getByTestId('cc-tab-dice')).toBeVisible();
			await expect(page.getByTestId('cc-tab-initiative-tracker')).toBeVisible();
			await expect(page.getByTestId('cc-profile')).toContainText('compact');
		} else {
			await expect(page.getByTestId('cc-widget-dice')).toBeVisible();
			await expect(page.getByTestId('cc-widget-initiative-tracker')).toBeVisible();
			await expect(page.getByTestId('cc-widget-audio')).toBeVisible();
		}
	});

	test('rearranged Command Center tools persist across restart (CMD-002)', async ({
		page,
	}, testInfo) => {
		test.skip(
			testInfo.project.name === 'mobile-chromium',
			'free-canvas rearrange is desktop layout',
		);

		const dice = page.getByTestId('cc-widget-dice');
		await expect(dice).toBeVisible();
		const before = await dice.locator('.layout').textContent();
		await dice.getByRole('button', { name: 'Move tool right' }).click();
		const after = await dice.locator('.layout').textContent();
		expect(after).not.toBe(before);

		await page.reload();
		await page.getByTestId('cc-widget-dice').waitFor({ state: 'visible' });
		const persisted = await page.getByTestId('cc-widget-dice').locator('.layout').textContent();
		expect(persisted).toBe(after);
	});

	test('a saved preset restores the Command Center layout (CMD-007)', async ({
		page,
	}, testInfo) => {
		test.skip(
			testInfo.project.name === 'mobile-chromium',
			'preset apply exercised on desktop layout',
		);

		const dice = page.getByTestId('cc-widget-dice');
		await expect(dice).toBeVisible();
		const baseline = await dice.locator('.layout').textContent();

		await page.getByTestId('cc-preset-name').fill('Default Board');
		await page.getByTestId('cc-save-preset').click();
		await expect(page.getByTestId('cc-preset-list')).toContainText('Default Board');

		// Move a tool away from its saved position, then restore the preset.
		await dice.getByRole('button', { name: 'Move tool right' }).click();
		const moved = await dice.locator('.layout').textContent();
		expect(moved).not.toBe(baseline);

		await page.getByTestId('cc-preset-list').getByRole('button', { name: 'Apply' }).first().click();
		await expect(page.getByTestId('cc-restore-status')).toBeVisible();
		const restored = await page.getByTestId('cc-widget-dice').locator('.layout').textContent();
		expect(restored).toBe(baseline);
	});

	test('slim profile exposes tools through focused panels without changing the Scene (CMD-002)', async ({
		page,
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'mobile-chromium', 'focused panels are the slim profile');

		await expect(page.getByTestId('cc-tablist')).toBeVisible();
		const panel = page.getByTestId('cc-panel');
		await expect(panel).toBeVisible();

		// Switching the focused tool is local UI state only; the Scene is not mutated.
		await page.getByTestId('cc-tab-audio').click();
		await expect(panel).toContainText('Audio');
		await page.getByTestId('cc-tab-prep').click();
		await expect(panel).toContainText('Prep');
	});

	test('active map and workflow controls preserve player-safe Session State (CMD-003/CMD-006)', async ({
		page,
	}) => {
		await page.getByTestId('session-workflow-active').click();
		await expect(page.getByTestId('session-workflow-status')).toContainText('active');

		await page.getByTestId('cc-active-map-select').selectOption({ label: 'Ruined Keep' });
		await page.getByTestId('cc-active-region-select').selectOption({ label: 'Ground Floor' });
		await page.getByTestId('cc-active-map-bind').click();
		await expect(page.getByTestId('cc-active-map-preview')).toContainText('Ruined Keep');
		await expect(page.getByTestId('cc-active-map-preview')).toContainText('Secret Ambush');

		await page.getByTestId('cc-active-map-project').click();
		await expect(page.getByTestId('cc-player-map-preview')).toContainText('delivered');
		await expect(page.getByTestId('cc-player-map-preview')).toContainText('Rooms');
		await expect(page.getByTestId('cc-player-map-preview')).toContainText('Fog of War');
		await expect(page.getByTestId('cc-player-map-preview')).not.toContainText('Secret Ambush');

		await page.getByTestId('nav-scenes').click();
		await page.getByTestId('scene-name').waitFor({ state: 'visible' });
		await page.getByTestId('nav-command-center').click();
		await expect(page.getByTestId('session-workflow-status')).toContainText('active');
		await expect(page.getByTestId('cc-active-map-preview')).toContainText('Ruined Keep');

		await page.getByTestId('session-workflow-paused').click();
		await expect(page.getByTestId('session-player-status')).toContainText('paused-degraded');
		await expect(page.getByTestId('cc-active-map-project')).toBeDisabled();

		await page.getByTestId('session-workflow-ending').click();
		await page.getByTestId('session-workflow-recap').click();
		await expect(page.getByTestId('session-workflow-status')).toContainText('recap');
		await expect(page.getByTestId('session-recap-archive')).toBeVisible();
		await expect(page.getByTestId('cc-active-map-empty')).toBeVisible();
	});

	test('Player View controller assigns connected and disconnected participants (CMD-004)', async ({
		page,
	}) => {
		await page.getByTestId('nav-scenes').click();
		await createNamedScene(page, 'Player One View');

		await page.getByTestId('nav-command-center').click();
		await page.getByTestId('cc-player-view-controller').waitFor({ state: 'visible' });
		await expect(page.getByTestId('cc-player-view-row-actor-player')).toContainText(
			'No assignment',
		);
		await expect(page.getByTestId('cc-player-view-row-actor-player-2')).toContainText(
			'No assignment',
		);
		await expect(page.getByTestId('cc-player-view-row-actor-player-3')).toContainText(
			'No assignment',
		);

		await selectPlayerViewScene(page, 'actor-player', 'Player One View');
		await page.getByTestId('cc-player-view-deliver-actor-player').click();
		await expect(page.getByTestId('cc-player-view-assignment-actor-player')).toContainText(
			'Player One View',
		);
		await expect(page.getByTestId('cc-player-view-assignment-actor-player')).toContainText(
			'delivered',
		);

		await selectPlayerViewScene(page, 'actor-player-2', 'Command Center');
		await page.getByTestId('cc-player-view-deliver-actor-player-2').click();
		await expect(page.getByTestId('cc-player-view-assignment-actor-player-2')).toContainText(
			'Command Center',
		);
		await expect(page.getByTestId('cc-player-view-assignment-actor-player-2')).toContainText(
			'delivered',
		);

		await selectPlayerViewScene(page, 'actor-player-3', 'Command Center');
		await page.getByTestId('cc-player-view-queue-actor-player-3').click();
		await expect(page.getByTestId('cc-player-view-status')).toContainText('queued');
		await expect(page.getByTestId('cc-player-view-assignment-actor-player-3')).toContainText(
			'Command Center',
		);
		await expect(page.getByTestId('cc-player-view-assignment-actor-player-3')).toContainText(
			'queued',
		);
		await expect(page.getByTestId('cc-player-view-assignment-actor-player-3')).toContainText(
			'offline',
		);

		await page.reload();
		await page.getByTestId('cc-player-view-controller').waitFor({ state: 'visible' });
		await expect(page.getByTestId('cc-player-view-assignment-actor-player')).toContainText(
			'Player One View',
		);
		await expect(page.getByTestId('cc-player-view-assignment-actor-player-2')).toContainText(
			'Command Center',
		);
		await expect(page.getByTestId('cc-player-view-assignment-actor-player-3')).toContainText(
			'queued',
		);

		await page.getByTestId('cc-player-view-deliver-actor-player-3').click();
		await expect(page.getByTestId('cc-player-view-assignment-actor-player-3')).toContainText(
			'delivered',
		);
		await expect(page.getByTestId('cc-player-view-assignment-actor-player-3')).not.toContainText(
			'offline',
		);
	});
});
