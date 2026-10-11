import { expect, test, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded, waitReady } from './_helpers';

async function createScreen(page: Page, name: string) {
	return page.evaluate(async (name) => {
		const rt = window.__rt!;
		const result = await rt.dispatch({
			type: 'scene.create',
			actorId: rt.defaultActorId,
			payload: { name, visibility: 'dm-only', description: '', tags: [] },
		});
		if (result.status !== 'accepted') throw new Error(JSON.stringify(result));
		return Object.values(rt.state.scenes.scenes).find((scene) => scene.name === name)!.id;
	}, name);
}

test.beforeEach(async ({ page }) => {
	await markOnboarded(page);
	await gotoRoute(page, '/screens');
	await expect(page.getByTestId('screens-library')).toBeVisible();
});

test('a scene bookmark opens the one screen editor and replaces its history entry', async ({
	page,
}) => {
	const id = await createScreen(page, 'Harbor watch');
	const before = await page.evaluate(() => history.length);
	await page.goto(`/#/scene/${id}?source=bookmark`, { waitUntil: 'domcontentloaded' });
	await waitReady(page);
	await expect(page).toHaveURL(new RegExp(`#/screen/${id}\\?source=bookmark&edit=1$`));
	await expect(page.getByTestId('screen-toolbar')).toHaveCount(1);
	await expect(page.getByTestId('scene-editor-toolbar')).toHaveCount(0);
	await expect(page.getByTestId('screen-open-editor')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeVisible();
	await expect(page).toHaveTitle('Lamplight — Harbor watch');
	const aria = await page.getByTestId('screen-toolbar').ariaSnapshot();
	expect(aria).toContain('Edit scene name, description & tags');
	expect(aria).toContain('Preview this scene as another role');
	await expect.poll(() => page.evaluate(() => history.length)).toBe(before + 1);
	await page.goBack();
	await expect(page).toHaveURL(/#\/screens$/);
});

test('details, background and layout persist; preview preserves the unsaved details drawer', async ({
	page,
}) => {
	const id = await createScreen(page, 'Harbor edits');
	await gotoRoute(page, `/screen/${id}?edit=1`);
	const toolbar = page.getByTestId('screen-toolbar');
	await expect(toolbar).toBeVisible();
	await toolbar.getByRole('button', { name: 'Edit scene name, description & tags' }).click();
	const details = page.getByTestId('scene-meta-panel');
	await details.getByRole('textbox', { name: 'Name', exact: true }).fill('Night watch');
	await details.getByRole('combobox', { name: 'Background', exact: true }).selectOption('dark');
	await toolbar.getByRole('button', { name: 'Preview this scene as another role' }).click();
	await page.getByRole('menuitemradio', { name: 'Any player', exact: true }).click();
	await expect(page.getByTestId('player-preview-overlay')).toBeVisible();
	await expect(page.getByTestId('screen-stage')).toHaveAttribute('inert', '');
	await expect(toolbar.getByRole('button', { name: 'Done', exact: true })).toHaveCount(0);
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('player-preview-overlay')).toHaveCount(0);
	await expect(details.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(
		'Night watch',
	);
	await details.getByRole('button', { name: 'Save details', exact: true }).click();
	await expect(details).toHaveCount(0);
	await expect(page).toHaveTitle('Lamplight — Night watch');
	await toolbar.getByRole('radio', { name: 'Flow', exact: true }).click();
	await expect(toolbar.getByRole('radio', { name: 'Flow', exact: true })).toHaveAttribute(
		'aria-checked',
		'true',
	);
	await page.reload();
	await waitReady(page);
	await expect(page).toHaveTitle('Lamplight — Night watch');
	await expect(toolbar.getByRole('radio', { name: 'Flow', exact: true })).toHaveAttribute(
		'aria-checked',
		'true',
	);
	await toolbar.getByRole('button', { name: 'Edit scene name, description & tags' }).click();
	await expect(details.getByRole('combobox', { name: 'Background', exact: true })).toHaveValue(
		'dark',
	);
	await toolbar.getByRole('button', { name: 'Done', exact: true }).click();
	await expect(page).toHaveURL(new RegExp(`#/screen/${id}$`));
	await expect(details).toHaveCount(0);
});

test('the home screen uses its stored name, and switching screens drops open drawers', async ({
	page,
}) => {
	const home = await page.evaluate(() => {
		const rt = window.__rt!;
		return rt.state.scenes.scenes[rt.state.commandCenter.homeSceneId!]!;
	});
	await expect(page.getByTestId(`screen-card-${home.id}`).getByRole('heading')).toHaveText(
		home.name,
	);
	const next = await createScreen(page, 'Second screen');
	await gotoRoute(page, `/screen/${home.id}?edit=1`);
	await page.getByRole('button', { name: 'Edit scene name, description & tags' }).click();
	await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Unsaved home draft');
	await gotoRoute(page, `/screen/${next}`);
	await expect(page.getByTestId('screen-toolbar')).toHaveAttribute('aria-label', 'Second screen');
	await expect(page.getByTestId('scene-meta-panel')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Edit layout', exact: true })).toBeVisible();
	await expect(page).toHaveTitle('Lamplight — Second screen');
});

test('a tile opens the shared inspector with bindings and transform controls', async ({ page }) => {
	const id = await createScreen(page, 'Tile inspector');
	const widgetId = await page.evaluate(async (sceneId) => {
		const rt = window.__rt!;
		const result = await rt.dispatch({
			type: 'scene.add-widget',
			actorId: rt.defaultActorId,
			payload: {
				sceneId,
				widget: {
					type: 'map',
					version: '1.0.0',
					layout: { x: 24, y: 24, w: 240, h: 160 },
					configuration: {},
					localState: {},
					binding: null,
				},
			},
		});
		if (result.status !== 'accepted') throw new Error(JSON.stringify(result));
		return rt.state.scenes.scenes[sceneId]!.widgets[0]!.id;
	}, id);
	await gotoRoute(page, `/screen/${id}?edit=1`);
	const tile = page.getByTestId(`widget-${widgetId}`);
	await expect(tile).toBeVisible();
	await tile.focus();
	await tile.press('Enter');
	await expect(page.getByRole('tab', { name: 'Binding', exact: true })).toBeVisible();
	await page.getByRole('tab', { name: 'Transform', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Small', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Small', exact: true }).click();
	await expect
		.poll(() =>
			page.evaluate(
				({ id, widgetId }) => {
					const widget = window.__rt!.state.scenes.scenes[id]!.widgets.find(
						(w) => w.id === widgetId,
					)!;
					return (widget.layout as { w?: number }).w;
				},
				{ id, widgetId },
			),
		)
		.toBeLessThan(240);
});
