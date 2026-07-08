import { expect, test } from '@playwright/test';

test.describe('CMD-008 global command palette', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/board/');
		await page.getByTestId('command-center').waitFor({ state: 'visible' });
		await page.evaluate(async () => {
			await indexedDB.deleteDatabase('dndtools-v2');
		});
		await page.reload();
		await page.getByTestId('cc-add-widget').waitFor({ state: 'visible' });
	});

	test('runs a Command Center action through the same core command as the visible control (AC1)', async ({
		page,
	}) => {
		await page.getByTestId('open-command-palette').click();
		await expect(page.getByTestId('command-palette')).toBeVisible();

		// Search narrows to the save-preset action.
		await page.getByTestId('palette-search').fill('preset');
		const saveAction = page.getByTestId('palette-action-cc.preset.save');
		await expect(saveAction).toBeVisible();

		// Running it dispatches command-center.save-preset — the same command the
		// visible "Save preset" form dispatches — so the new preset appears on the page.
		await page.getByTestId('palette-input-cc.preset.save').fill('Palette Night');
		await page.getByTestId('palette-run-cc.preset.save').click();

		await expect(page.getByTestId('command-palette')).toHaveCount(0);
		await expect(page.getByTestId('cc-preset-list')).toContainText('Palette Night');
	});

	test('opens with the keyboard shortcut and closes with Escape', async ({ page }, testInfo) => {
		test.skip(testInfo.project.name === 'mobile-chromium', 'keyboard shortcut is a pointer-free path');

		await page.keyboard.press('Control+k');
		await expect(page.getByTestId('command-palette')).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.getByTestId('command-palette')).toHaveCount(0);
	});

	test('applies a saved preset from the palette and restores the layout (AC1)', async ({
		page,
	}, testInfo) => {
		test.skip(testInfo.project.name === 'mobile-chromium', 'preset apply exercised on desktop layout');

		const dice = page.getByTestId('cc-widget-dice');
		await expect(dice).toBeVisible();
		const baseline = await dice.locator('.layout').textContent();

		// Save a preset capturing the baseline layout via the visible form.
		await page.getByTestId('cc-preset-name').fill('Board A');
		await page.getByTestId('cc-save-preset').click();
		await expect(page.getByTestId('cc-preset-list')).toContainText('Board A');

		// Move a tool away from the saved position.
		await dice.getByRole('button', { name: 'Move tool right' }).click();
		const moved = await dice.locator('.layout').textContent();
		expect(moved).not.toBe(baseline);

		// Apply the preset through the palette — the same command-center.apply-preset
		// command the visible Apply button dispatches, so the layout is restored.
		await page.getByTestId('open-command-palette').click();
		await page.getByTestId('palette-search').fill('Board A');
		const applyAction = page.locator('[data-testid^="palette-action-cc.preset.apply:"]');
		await expect(applyAction).toBeVisible();
		await applyAction.getByRole('button', { name: 'Run' }).click();

		await expect(page.getByTestId('command-palette')).toHaveCount(0);
		const restored = await page.getByTestId('cc-widget-dice').locator('.layout').textContent();
		expect(restored).toBe(baseline);
	});
});
