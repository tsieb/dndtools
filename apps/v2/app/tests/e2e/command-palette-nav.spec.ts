import { expect, test, type Page } from '@playwright/test';

// NAV-008 / NAV-010: the command palette and primary navigation read the same
// actor-filtered command availability API as widgets and visible controls.

/** Reset to a known-empty vault on the given route. */
async function freshAt(page: Page, route: string, readyTestId: string) {
	await page.goto(route);
	await page.getByTestId(readyTestId).waitFor({ state: 'visible' });
	await page.evaluate(async () => {
		await indexedDB.deleteDatabase('dndtools-v2');
	});
	await page.reload();
	await page.getByTestId(readyTestId).waitFor({ state: 'visible' });
}

async function viewAs(page: Page, actorId: string) {
	await page.getByTestId('view-as-select').selectOption(actorId);
}

test.describe('NAV-010 actor-filtered primary navigation', () => {
	test('hides the DM-only Scenes section from a player without leaking it (AC1)', async ({
		page,
	}) => {
		await freshAt(page, '/', 'command-center');

		// DM sees every section.
		await expect(page.getByTestId('nav-command-center')).toBeVisible();
		await expect(page.getByTestId('nav-scenes')).toBeVisible();
		await expect(page.getByTestId('nav-settings')).toBeVisible();

		// As a player, the DM-only Scenes authoring section is absent entirely.
		await viewAs(page, 'actor-player');
		await expect(page.getByTestId('nav-command-center')).toBeVisible();
		await expect(page.getByTestId('nav-settings')).toBeVisible();
		await expect(page.getByTestId('nav-scenes')).toHaveCount(0);
	});
});

test.describe('NAV-008 command palette actor filtering', () => {
	test('hides DM-only commands from a player in the palette (AC1)', async ({ page }) => {
		await freshAt(page, '/', 'command-center');

		// DM palette offers the Scene-authoring command and Command Center actions.
		await page.getByTestId('open-command-palette').click();
		await expect(page.getByTestId('palette-action-scene.create')).toBeVisible();
		await expect(page.getByTestId('palette-action-nav.scenes')).toBeVisible();
		await page.keyboard.press('Escape');

		// As a player, those DM-only commands disappear; only navigation remains.
		await viewAs(page, 'actor-player');
		await page.getByTestId('open-command-palette').click();
		await expect(page.getByTestId('palette-action-nav.command-center')).toBeVisible();
		await expect(page.getByTestId('palette-action-scene.create')).toHaveCount(0);
		await expect(page.getByTestId('palette-action-nav.scenes')).toHaveCount(0);
		await expect(
			page.locator('[data-testid^="palette-action-cc.preset"]'),
		).toHaveCount(0);
	});

	test('shows a state-disabled command with an accessible, non-leaking reason (AC2)', async ({
		page,
	}) => {
		// Start on /scenes/ and never open the Command Center, so its home Scene is never
		// configured and the save-preset command is visible but unavailable.
		await freshAt(page, '/scenes/', 'scene-name');

		await page.getByTestId('open-command-palette').click();
		await page.getByTestId('palette-search').fill('preset');
		await expect(page.getByTestId('palette-reason-cc.preset.save')).toHaveText(
			'Set up the Command Center first.',
		);
		await expect(page.getByTestId('palette-run-cc.preset.save')).toBeDisabled();
	});

	test('does not leak a hidden scene through palette deep links (NAV-010 AC1)', async ({
		page,
	}) => {
		await freshAt(page, '/scenes/', 'scene-name');

		// DM authors one dm-only and one player-visible scene via the visible form.
		await page.getByTestId('scene-name').fill('Secret Lair');
		await page.getByTestId('scene-visibility').selectOption('dm-only');
		await page.getByTestId('scene-create').click();
		await expect(page.getByTestId('scene-list').getByText('Secret Lair')).toBeVisible();

		await page.getByTestId('scene-name').fill('Tavern');
		await page.getByTestId('scene-visibility').selectOption('player-visible');
		await page.getByTestId('scene-create').click();
		await expect(page.getByTestId('scene-list').getByText('Tavern')).toBeVisible();

		// DM palette can deep-link to both scenes.
		await page.getByTestId('open-command-palette').click();
		await expect(
			page.getByTestId('palette-list').getByText('Open Scene: Secret Lair'),
		).toBeVisible();
		await expect(page.getByTestId('palette-list').getByText('Open Scene: Tavern')).toBeVisible();
		await page.keyboard.press('Escape');

		// As a player, only the player-visible scene is reachable; the dm-only scene name
		// never appears anywhere in the palette.
		await viewAs(page, 'actor-player');
		await page.getByTestId('open-command-palette').click();
		await expect(page.getByTestId('palette-list').getByText('Open Scene: Tavern')).toBeVisible();
		await expect(page.getByTestId('palette-list')).not.toContainText('Secret Lair');
	});
});

test.describe('NAV-010 shared command path', () => {
	test('Create Scene from the palette uses the same command as the visible form (AC2)', async ({
		page,
	}) => {
		await freshAt(page, '/scenes/', 'scene-name');
		await expect(page.getByTestId('scene-list-empty')).toBeVisible();

		// Create one scene with the visible form.
		await page.getByTestId('scene-name').fill('Form Scene');
		await page.getByTestId('scene-create').click();
		await expect(page.getByTestId('scene-list').getByText('Form Scene')).toBeVisible();

		// Create another with the palette's Create Scene command (scene.create) — the same
		// Processing Core command and validation path — and it lands in the same list.
		await page.getByTestId('open-command-palette').click();
		await page.getByTestId('palette-input-scene.create').fill('Palette Scene');
		await page.getByTestId('palette-run-scene.create').click();
		await expect(page.getByTestId('command-palette')).toHaveCount(0);
		await expect(page.getByTestId('scene-list').getByText('Palette Scene')).toBeVisible();
		await expect(page.getByTestId('scene-list').getByText('Form Scene')).toBeVisible();
	});

	test('a navigation command routes from the palette', async ({ page }) => {
		await freshAt(page, '/', 'command-center');
		await page.getByTestId('open-command-palette').click();
		await page.getByTestId('palette-search').fill('settings');
		await page.getByTestId('palette-run-nav.settings').click();
		await expect(page.getByTestId('settings-view')).toBeVisible();
		await expect(page).toHaveURL(/\/settings\/?$/);
	});
});

test.describe('NAV-008 equivalent command menu on compact profile (AC3)', () => {
	test('compact palette exposes the same commands and dispatches the same core command', async ({
		page,
	}, testInfo) => {
		test.skip(
			testInfo.project.name !== 'mobile-chromium',
			'AC3 covers the compact (mobile) profile menu',
		);
		await freshAt(page, '/scenes/', 'scene-name');

		await page.getByTestId('open-command-palette').click();
		const palette = page.getByTestId('command-palette');
		await expect(palette).toBeVisible();
		// The equivalent menu renders as the compact sheet but exposes the identical
		// commands, including the same scene.create Processing Core command.
		await expect(palette).toHaveAttribute('data-profile', 'compact');
		await page.getByTestId('palette-input-scene.create').fill('Mobile Scene');
		await page.getByTestId('palette-run-scene.create').click();
		await expect(page.getByTestId('command-palette')).toHaveCount(0);
		await expect(page.getByTestId('scene-list').getByText('Mobile Scene')).toBeVisible();
	});
});
