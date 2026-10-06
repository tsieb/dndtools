import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// RC-CAN-8.8 — Layouts and Configure dialogs. Both profiles: on a phone the Layouts panel is the
// same 280px overlay over the canvas.

async function editBoard(page: Page) {
	await markOnboarded(page);
	await gotoRoute(page, '/board');
	await seedFresh(page);
	await page.goto('/#/board');
	await waitReady(page);
	const handle = await page.waitForFunction(
		() => {
			const rt = window.__rt!;
			const id = rt.state.commandCenter.homeSceneId;
			return id && (rt.state.scenes.scenes[id]?.widgets.length ?? 0) > 1 ? id : null;
		},
		null,
		{ timeout: 20_000 },
	);
	const sceneId = (await handle.jsonValue()) as string;
	const frames = page.getByTestId('scene-board-bounded').locator('[data-testid^="widget-"]');
	await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
	await expect(frames.first()).toBeVisible();
	return { sceneId, frames };
}

const panel = (page: Page) => page.getByTestId('board-layouts-panel');
async function axe(page: Page, selector: string) {
	const { violations } = await new AxeBuilder({ page })
		.include(selector)
		.withRules([
			'button-name',
			'label',
			'list',
			'listitem',
			'aria-allowed-attr',
			'nested-interactive',
		])
		.analyze();
	expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
}

const presetNames = (page: Page) =>
	page.evaluate(() =>
		Object.values(window.__rt!.state.commandCenter.presets).map((preset) => preset.name),
	);

test('saves a layout, applies it, says what Restore puts back, renames and deletes it', async ({
	page,
}) => {
	const { sceneId, frames } = await editBoard(page);
	const status = page.getByTestId('board-status');
	const tiles = await frames.count();

	await page.getByRole('button', { name: 'Layouts', exact: true }).click();
	await expect(panel(page)).toBeVisible();

	// The Save button keeps its width next to the name field: one line, nothing clipped.
	const save = panel(page).getByRole('button', { name: 'Save', exact: true });
	await expect(save).toBeDisabled();
	const saveBox = (await save.boundingBox())!;
	const nameBox = (await page.getByLabel('Layout name').boundingBox())!;
	expect(saveBox.height).toBeLessThanOrEqual(nameBox.height + 1);
	expect(await save.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);

	// Enter in the name field saves.
	await page.getByLabel('Layout name').fill('Combat night');
	await page.getByLabel('Layout name').press('Enter');
	await expect(status).toHaveText('Layout “Combat night” saved.');
	await expect(page.getByLabel('Layout name')).toHaveValue('');
	const apply = panel(page).getByRole('button', { name: 'Apply “Combat night”', exact: true });
	await expect(apply).toBeVisible();
	await axe(page, '[data-testid="board-layouts-panel"]');

	// Change the board: drop one tile.
	const removed = await page.evaluate(
		(id) => window.__rt!.state.scenes.scenes[id].widgets[0].id,
		sceneId,
	);
	expect(
		(
			await dispatch(page, {
				type: 'scene.destroy-widget',
				actorId: 'dm-1',
				payload: { sceneId, widgetInstanceId: removed },
			})
		).status,
	).toBe('accepted');
	await expect(frames).toHaveCount(tiles - 1);

	// Apply brings the saved layout back, and Restore says what it would put back.
	await apply.click();
	await expect(status).toHaveText(/Layout “Combat night” applied/);
	await expect(frames).toHaveCount(tiles);
	await expect(panel(page).getByTestId('board-layouts-restore-what')).toHaveText(
		new RegExp(
			`^Puts back the layout you had before applying “Combat night”: ${tiles - 1} tiles, saved at `,
		),
	);
	await expect(
		panel(page).getByRole('button', { name: 'Restore previous layout', exact: true }),
	).toHaveAccessibleDescription(/before applying “Combat night”/);

	// Rename in place. Escape backs out of the field without closing the panel.
	await panel(page).getByRole('button', { name: 'Rename “Combat night”', exact: true }).click();
	const rename = panel(page).getByLabel('New name for “Combat night”');
	await expect(rename).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(panel(page)).toBeVisible();
	await expect(rename).toHaveCount(0);
	const renameButton = panel(page).getByRole('button', {
		name: 'Rename “Combat night”',
		exact: true,
	});
	await expect(renameButton).toBeFocused();
	await renameButton.click();
	await rename.fill('Boss fight');
	await rename.press('Enter');
	await expect(status).toHaveText('Layout renamed to “Boss fight”.');
	await expect(
		panel(page).getByRole('button', { name: 'Apply “Boss fight”', exact: true }),
	).toBeVisible();
	await expect.poll(() => presetNames(page)).toEqual(['Boss fight']);

	// Delete asks first, then leaves the board as it is.
	await panel(page).getByRole('button', { name: 'Delete “Boss fight”', exact: true }).click();
	await expect(panel(page).getByRole('alert')).toHaveText(
		'Delete “Boss fight”? The board stays as it is.',
	);
	await panel(page).getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(status).toHaveText('Layout “Boss fight” deleted.');
	await expect.poll(() => presetNames(page)).toEqual([]);
	await expect(page.getByLabel('Layout name')).toBeFocused();
	await expect(frames).toHaveCount(tiles);
});

test('Dice Configure: an example, a message for a bad formula, Enter saves, Escape guards', async ({
	page,
}) => {
	const { sceneId } = await editBoard(page);
	const diceId = await page.evaluate(
		(id) => window.__rt!.state.scenes.scenes[id].widgets.find((w) => w.type === 'dice')!.id,
		sceneId,
	);
	const formulas = () =>
		page.evaluate(
			({ id, wid }) =>
				window.__rt!.state.scenes.scenes[id].widgets.find((w) => w.id === wid)!.configuration
					.formulas,
			{ id: sceneId, wid: diceId },
		);
	const frame = page.getByTestId(`widget-${diceId}`);
	const menu = page.getByTestId('tile-actions-menu');
	const openConfigure = async () => {
		await frame.scrollIntoViewIfNeeded();
		await expect(async () => {
			if (!(await menu.isVisible())) await frame.getByTestId('tile-actions-trigger').click();
			await expect(menu).toBeVisible({ timeout: 1_000 });
		}).toPass();
		await page.getByRole('menuitem', { name: 'Configure…', exact: true }).click();
		const dialog = page.getByRole('dialog', { name: 'Configure Dice', exact: true });
		await expect(dialog).toBeVisible();
		return dialog;
	};

	const dialog = await openConfigure();
	const field = dialog.getByLabel('Quick-roll formulas (comma separated)');
	await expect(field).toHaveAttribute('placeholder', '1d20+5, 2d6');
	await expect(field).toHaveAccessibleDescription(/for example 1d20\+5, 2d6/);

	await field.fill('1d20+5, 2x6');
	await field.press('Enter');
	await expect(dialog).toBeVisible();
	await expect(field).toHaveAttribute('aria-invalid', 'true');
	await expect(dialog).toContainText('“2x6” is not a dice formula. Write dice like 1d20+5 or 2d6.');
	await axe(page, '[data-testid="tile-configure-dialog"]');
	expect(await formulas()).toBeUndefined();

	// Escape with unsaved changes asks; Keep editing returns to the draft.
	await page.keyboard.press('Escape');
	await expect(dialog.getByTestId('tile-configure-unsaved')).toContainText(
		'You have unsaved changes',
	);
	await dialog.getByRole('button', { name: 'Keep editing', exact: true }).click();
	await expect(field).toHaveValue('1d20+5, 2x6');

	await field.fill('1d20+5, 2d6');
	await field.press('Enter');
	await expect(dialog).toHaveCount(0);
	await expect.poll(formulas).toBe('1d20+5, 2d6');

	// Discarding leaves the saved formulas alone.
	const again = await openConfigure();
	await again.getByLabel('Quick-roll formulas (comma separated)').fill('d4');
	await page.keyboard.press('Escape');
	await again.getByRole('button', { name: 'Discard changes', exact: true }).click();
	await expect(again).toHaveCount(0);
	expect(await formulas()).toBe('1d20+5, 2d6');
});
