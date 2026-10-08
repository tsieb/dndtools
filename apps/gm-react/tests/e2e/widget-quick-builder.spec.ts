import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

async function setup(page: Page) {
	await markOnboarded(page);
	await gotoRoute(page, '/board');
	await seedFresh(page);
	const characterId = await page.evaluate(
		() =>
			Object.values(window.__rt!.state.characters.characters).find(
				(character) => character.kind === 'pc',
			)!.id,
	);
	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	const renamed = await dispatch(page, {
		type: 'character.edit-field',
		actorId,
		payload: { characterId, path: 'name', value: 'Quick Hero' },
	});
	expect(renamed.status, JSON.stringify(renamed.rejection)).toBe('accepted');
	const updated = await dispatch(page, {
		type: 'character.set-combat',
		actorId,
		payload: { characterId, hp: 7, maxHp: 12, ac: 14 },
	});
	expect(updated.status, JSON.stringify(updated.rejection)).toBe('accepted');
	await page.goto('/#/board');
	await waitReady(page);
}

async function placed(page: Page, name: string) {
	const ids = () =>
		page.evaluate((displayName) => {
			const rt = window.__rt!;
			const packages = Object.values(rt.state.widgets.packages);
			const type = packages.find((record) => record.package.displayName === displayName)?.package
				.widgets[0]?.type;
			return rt.state.scenes.scenes[rt.state.commandCenter.homeSceneId!]!.widgets.filter(
				(widget) => widget.type === type,
			).map((widget) => widget.id);
		}, name);
	await expect.poll(ids).toHaveLength(1);
	return page.getByTestId(`widget-${(await ids())[0]}`);
}

for (const [recipe, name, template] of [
	['Party list', 'Party HP', 'status-list'],
	['Counter or clock', 'Doom counter', 'tracker'],
] as const) {
	test(`${recipe}: six clicks from the reading board, real data, axe and Standby`, async ({
		page,
	}) => {
		await setup(page);
		let clicks = 0;
		const click = async (target: Locator) => {
			await target.click();
			clicks += 1;
		};
		await click(page.getByRole('button', { name: 'Edit layout', exact: true }));
		await click(page.getByRole('button', { name: 'Add', exact: true }));
		await click(
			page.getByTestId('add-widget-gallery').getByRole('button', { name: 'Build your own' }),
		);
		const quick = page.getByTestId('quick-builder');
		await expect(quick).toBeVisible();
		for (let panel = 0; panel < 3; panel += 1) {
			const axe = await new AxeBuilder({ page })
				.include('[data-testid="quick-builder"]')
				.withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
				.analyze();
			expect(axe.violations).toEqual([]);
			if (panel === 0) await click(quick.getByRole('button', { name: recipe, exact: true }));
			if (panel === 1) {
				if (recipe === 'Party list')
					await expect(quick.getByTestId('widget-builder-preview')).toContainText(
						'Quick Hero · HP 7 of 12',
					);
				await click(quick.getByRole('button', { name: 'Next', exact: true }));
			}
		}
		await click(quick.getByRole('button', { name: 'Add to screen', exact: true }));
		expect(clicks).toBeLessThanOrEqual(6);
		await expect(quick).toHaveCount(0);
		const tile = await placed(page, name);
		await expect(tile.getByTestId(`widget-template-${template}`)).toBeVisible();
		if (recipe === 'Party list') await expect(tile).toContainText('Quick Hero · HP 7 of 12');
		else {
			await tile.getByTestId('tile-actions-trigger').click();
			await page.getByRole('menuitem', { name: 'Configure…', exact: true }).click();
			const configure = page.getByRole('dialog', { name: 'Configure Doom counter' });
			await configure.getByRole('spinbutton', { name: 'Count', exact: true }).fill('3');
			await configure.getByRole('button', { name: 'Save', exact: true }).click();
			await expect(tile.getByTestId('widget-template-tracker')).toContainText('3');
		}
		await page.getByRole('button', { name: 'Done', exact: true }).click();
		expect(await page.evaluate(() => window.__rt!.state.session.workflow)).toBe('idle');
	});
}

/** Actual Tab traversal, never locator.focus(): no pointer is used in this story. */
async function tabTo(page: Page, target: Locator) {
	for (let count = 0; count < 100; count += 1) {
		if (await target.evaluate((node) => node === document.activeElement)) return;
		await page.keyboard.press('Tab');
	}
	throw new Error('Target was not reachable by Tab');
}

test('Command Center New widget and a complete recipe work with only the keyboard', async ({
	page,
}) => {
	await setup(page);
	await gotoRoute(page, '/');
	const launcher = page.getByRole('button', { name: /^New widget / });
	await tabTo(page, launcher);
	await page.keyboard.press('Enter');
	const quick = page.getByTestId('quick-builder');
	await expect(quick).toBeVisible();
	await tabTo(page, quick.getByRole('button', { name: 'Party list', exact: true }));
	await page.keyboard.press('Enter');
	await tabTo(page, quick.getByRole('button', { name: 'Next', exact: true }));
	await page.keyboard.press('Enter');
	await tabTo(page, quick.getByRole('button', { name: 'Add to screen', exact: true }));
	await page.keyboard.press('Enter');
	await expect(quick).toHaveCount(0);
	await expect(await placed(page, 'Party HP')).toBeFocused();
	// The route request is consumed once: opening Add afterward remains ordinary gallery browsing.
	await tabTo(page, page.getByRole('button', { name: 'Add', exact: true }));
	await page.keyboard.press('Enter');
	await expect(page.getByTestId('add-widget-gallery')).toBeVisible();
	await expect(quick).toHaveCount(0);
});

test('More options keeps the Quick draft and opens the matching Full step', async ({ page }) => {
	await setup(page);
	await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('button', { name: 'Build your own' }).click();
	const quick = page.getByTestId('quick-builder');
	await quick.getByRole('button', { name: 'Counter or clock', exact: true }).click();
	await quick.getByRole('spinbutton', { name: 'Maximum', exact: true }).fill('9');
	await quick.getByRole('button', { name: 'More options', exact: true }).click();
	const full = page.getByRole('dialog', { name: /Widget builder/ });
	await expect(full.getByRole('button', { name: 'Config fields', exact: true })).toHaveAttribute(
		'aria-current',
		'step',
	);
	const panes = full.getByRole('radiogroup', { name: 'Builder pane' });
	if (await panes.isVisible())
		await panes.getByRole('radio', { name: 'Definition', exact: true }).click();
	const pkg = JSON.parse(await full.getByTestId('widget-builder-json').inputValue());
	expect(pkg.displayName).toBe('Doom counter');
	expect(
		pkg.widgets[0].configFields.find((field: { key: string }) => field.key === 'max').default,
	).toBe(9);
});

test('every recipe picker is accessible, including long vault data in the preview', async ({
	page,
}) => {
	await setup(page);
	await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('button', { name: 'Build your own' }).click();
	const quick = page.getByTestId('quick-builder');
	for (const name of [
		'Party list',
		'Counter or clock',
		'Table of things',
		'Note for the table',
		'Buttons',
		'Stat block',
		'Chart',
		'Form',
	]) {
		await quick.getByRole('button', { name, exact: true }).click();
		if (name === 'Note for the table') {
			const picker = quick.getByRole('combobox', { name: 'Which note' });
			const noteId = await picker.locator('option').nth(1).getAttribute('value');
			await picker.selectOption(noteId!);
		}
		const axe = await new AxeBuilder({ page })
			.include('[data-testid="quick-builder"]')
			.withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
			.analyze();
		expect(axe.violations, name).toEqual([]);
		await quick.getByRole('button', { name: 'Back', exact: true }).click();
	}
});
