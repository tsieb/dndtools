import { expect, test } from '@playwright/test';

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
});
