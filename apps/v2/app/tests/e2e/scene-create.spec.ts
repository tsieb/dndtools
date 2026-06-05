import { expect, test } from '@playwright/test';

test.describe('CANVAS-001 visible Scene creation + restart persistence', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/scenes/');
		// Wait for runtime to finish loading
		await page.getByTestId('scene-name').waitFor({ state: 'visible' });
		// Reset local IndexedDB so each run starts from a known empty vault.
		await page.evaluate(async () => {
			await indexedDB.deleteDatabase('dndtools-v2');
		});
		await page.reload();
		await page.getByTestId('scene-name').waitFor({ state: 'visible' });
	});

	test('DM creates a Scene and sees it persist across a reload', async ({ page }) => {
		await expect(page.getByTestId('scene-list-empty')).toBeVisible();

		await page.getByTestId('scene-name').fill('Goblin Ambush');
		await page.getByTestId('scene-description').fill('Forest road at dusk');
		await page.getByTestId('scene-tags').fill('combat, prep');
		await page.getByTestId('scene-visibility').selectOption('dm-only');
		await page.getByTestId('scene-create').click();

		await expect(page.getByTestId('last-created')).toBeVisible();
		await expect(page.getByTestId('scene-list').getByText('Goblin Ambush')).toBeVisible();

		await page.reload();
		await page.getByTestId('scene-list').waitFor({ state: 'visible' });
		await expect(page.getByTestId('scene-list').getByText('Goblin Ambush')).toBeVisible();
	});

	test('Adding a widget on a Scene persists across reload', async ({ page }) => {
		await page.getByTestId('scene-name').fill('Combat Board');
		await page.getByTestId('scene-create').click();
		const sceneLink = page.getByTestId('scene-list').getByRole('link', { name: 'Combat Board' });
		await expect(sceneLink).toBeVisible();
		await sceneLink.click();

		await page.getByTestId('scene-editor').waitFor({ state: 'visible' });
		await page.getByTestId('widget-type').fill('initiative-tracker');
		await page.getByTestId('widget-version').fill('1.0.0');
		await page.getByTestId('widget-add').click();

		const widgetGrid = page.getByTestId('widget-grid');
		await expect(widgetGrid.getByText('initiative-tracker')).toBeVisible();

		const url = page.url();
		await page.reload();
		await page.goto(url);
		await page.getByTestId('scene-editor').waitFor({ state: 'visible' });
		await expect(widgetGrid.getByText('initiative-tracker')).toBeVisible();
	});

	test('Widget package review, degraded host permissions, and disabled placeholders are visible', async ({
		page,
	}) => {
		await page.getByTestId('install-weather-package').click();
		await expect(page.getByTestId('package-workspace.weather-panel')).toBeVisible();
		await expect(page.getByTestId('permissions-workspace.weather-panel')).toContainText(
			'network: denied',
		);
		await page.getByTestId('enable-package-workspace.weather-panel').click();
		await expect(page.getByTestId('package-workspace.weather-panel')).toContainText('enabled');
		await page.getByTestId('export-package-workspace.weather-panel').click();
		await expect(page.getByTestId('package-export')).toContainText('workspace.weather-panel');

		await page.getByTestId('scene-name').fill('Weather Scene');
		await page.getByTestId('scene-create').click();
		await page.getByTestId('scene-list').getByRole('link', { name: 'Weather Scene' }).click();
		await page.getByTestId('widget-type').fill('weather-panel');
		await page.getByTestId('widget-version').fill('1.0.0');
		await page.getByTestId('widget-add').click();
		const weatherWidget = page.getByTestId('widget-grid').getByText('weather-panel');
		await expect(weatherWidget).toBeVisible();
		await expect(page.getByTestId('widget-grid')).toContainText('degraded: network unavailable');

		await page.getByTestId('back-to-scenes').click();
		await page.getByTestId('remove-package-workspace.weather-panel').click();
		await page.getByTestId('scene-list').getByRole('link', { name: 'Weather Scene' }).click();
		await expect(page.getByTestId('widget-grid')).toContainText('disabled: Package was removed');
	});

	test('Widget bindings resolve to explicit conflicted and missing states (CANVAS-009)', async ({
		page,
	}) => {
		await page.getByTestId('scene-name').fill('Binding Scene');
		await page.getByTestId('scene-create').click();
		await page.getByTestId('scene-list').getByRole('link', { name: 'Binding Scene' }).click();
		await page.getByTestId('scene-editor').waitFor({ state: 'visible' });

		// A binding to an entity with an unresolved conflict renders the conflicted state
		// and never silently resolves to one version.
		await page.getByTestId('widget-type').fill('character');
		await page.getByTestId('bind-entity-type').fill('character');
		await page.getByTestId('bind-entity-id').fill('pc-1');
		await page.getByTestId('bind-selector').fill('conflicted:hp');
		await page.getByTestId('widget-add').click();
		await expect(page.getByTestId('widget-grid')).toContainText('binding conflicted: hp');

		// A binding to a deleted target renders the missing state without leaking content.
		await page.getByTestId('widget-type').fill('note');
		await page.getByTestId('bind-entity-type').fill('note');
		await page.getByTestId('bind-entity-id').fill('ghost');
		await page.getByTestId('bind-selector').fill('missing:ghost');
		await page.getByTestId('widget-add').click();
		await expect(page.getByTestId('widget-grid')).toContainText('binding missing');
	});

	test('Timer widget dispatches its declared command through the core', async ({ page }) => {
		// A session timer is session state, and the core only accepts a session-writing
		// widget command (`timer.start`, writesTo: 'session') while the session workflow is
		// active (CMD-active-session-control). Session state is application-level, so
		// activate the session on the Command Center first; it persists across navigation.
		await page.goto('/');
		await page.getByTestId('command-center').waitFor({ state: 'visible' });
		await page.getByTestId('session-workflow-active').click();
		await expect(page.getByTestId('session-workflow-status')).toContainText('active');

		await page.goto('/scenes/');
		await page.getByTestId('scene-name').waitFor({ state: 'visible' });
		await page.getByTestId('scene-name').fill('Timer Scene');
		await page.getByTestId('scene-create').click();
		await page.getByTestId('scene-list').getByRole('link', { name: 'Timer Scene' }).click();
		await page.getByTestId('widget-type').fill('timer');
		await page.getByTestId('widget-version').fill('1.0.0');
		await page.getByTestId('widget-add').click();
		const timerArticle = page.getByTestId('widget-grid').getByText('timer');
		await expect(timerArticle).toBeVisible();
		await page.getByTestId('widget-grid').getByRole('button', { name: 'Start' }).click();
		await expect(page.getByTestId('widget-grid')).toContainText('timer running');
	});
});
