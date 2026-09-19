import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, waitReady } from './_helpers';

test('backgrounds, docks and section bands persist', async ({ page }) => {
	await markOnboarded(page);
	await gotoRoute(page, '/scenes');
	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	expect(
		(
			await dispatch(page, {
				type: 'scene.create',
				actorId,
				payload: { name: 'Surface fixture', description: '', tags: [], visibility: 'dm-only' },
			})
		).status,
	).toBe('accepted');
	const sceneId = await page.evaluate(
		() =>
			Object.values(window.__rt!.state.scenes.scenes).find((s) => s.name === 'Surface fixture')!.id,
	);
	await gotoRoute(page, `/scene/${sceneId}`);
	const board = page.getByTestId('scene-board-canvas');
	for (const background of ['paper', 'parchment', 'dark', 'grid']) {
		expect(
			(
				await dispatch(page, {
					type: 'scene.update-metadata',
					actorId,
					payload: { sceneId, visualSettings: { background } },
				})
			).status,
		).toBe('accepted');
		await expect(board).toHaveAttribute('data-background', background);
		const result = await new AxeBuilder({ page })
			.include('[data-testid="scene-board-canvas"]')
			.withRules(['color-contrast'])
			.analyze();
		expect(result.violations, `${background} empty scene contrast`).toEqual([]);
	}
	// Empty scenes also have their own background, before there is a widget to identify them.
	await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
	const meta = page.getByTestId('scene-meta-panel');
	await meta.getByLabel('Background', { exact: true }).selectOption('parchment');
	await meta.getByRole('button', { name: 'Save details' }).click();
	await expect(board).toHaveAttribute('data-background', 'parchment');
	await expect(page.getByTestId('scene-background')).toHaveCSS(
		'background-color',
		'rgb(243, 235, 221)',
	);
	expect(
		(
			await dispatch(page, {
				type: 'scene.add-widget',
				actorId,
				payload: {
					sceneId,
					widget: {
						type: 'note',
						version: '1.0.0',
						layout: { x: 80, y: 90, w: 260, h: 180 },
						configuration: {},
						localState: {},
						binding: null,
					},
				},
			})
		).status,
	).toBe('accepted');
	const widgetId = await page.evaluate(
		(id) => window.__rt!.state.scenes.scenes[id].widgets[0].id,
		sceneId,
	);
	expect(
		(
			await dispatch(page, {
				type: 'scene.set-sections',
				actorId,
				payload: {
					sceneId,
					sections: [
						{
							id: 'surface-section',
							name: 'Encounter notes',
							bounds: { x: 0, y: 0, w: 600, h: 500 },
							widgetInstanceIds: [widgetId],
						},
					],
				},
			})
		).status,
	).toBe('accepted');
	const band = page.getByRole('region', { name: 'Encounter notes', exact: true });
	await expect(band).toBeVisible();
	await expect(band).toHaveCSS('width', '600px');
	await expect(band).toHaveCSS('pointer-events', 'none');
	const tile = page.getByTestId(`widget-${widgetId}`);
	await tile.focus();
	await page.keyboard.press('Enter');
	const inspector = page.getByTestId('widget-inspector');
	await inspector.getByRole('tab', { name: 'Transform', exact: true }).click();
	const dock = inspector.getByLabel('Dock to edge');
	await dock.selectOption('left');
	await inspector.getByRole('button', { name: 'Close inspector' }).click();
	const history = page.getByTestId('canvas-history-controls');
	await history.getByRole('button', { name: /^Undo/ }).click();
	await expect(tile).toHaveCSS('left', '80px');
	await history.getByRole('button', { name: /^Redo/ }).click();
	await expect(tile).toHaveCSS('left', '0px');
	await tile.focus();
	await page.keyboard.press('Enter');
	await inspector.getByRole('tab', { name: 'Transform', exact: true }).click();
	await dock.selectOption('none');
	await inspector.getByRole('button', { name: 'Close inspector' }).click();
	await history.getByRole('button', { name: /^Undo/ }).click();
	await expect(tile).toHaveCSS('left', '0px');
	await history.getByRole('button', { name: /^Redo/ }).click();
	await expect(tile).toHaveCSS('left', '80px');
	await tile.focus();
	await page.keyboard.press('Enter');
	await inspector.getByRole('tab', { name: 'Transform', exact: true }).click();
	for (const [edge, prop, value] of [
		['left', 'left', '0px'],
		['right', 'left', '340px'],
		['top', 'top', '0px'],
		['bottom', 'top', '320px'],
		['none', 'left', '80px'],
	] as const) {
		await dock.selectOption(edge);
		await expect(tile).toHaveCSS(prop, value);
	}
	await dock.selectOption('bottom');
	await inspector.getByRole('button', { name: 'Close inspector' }).click();
	for (const [background, color] of [
		['paper', 'rgb(255, 255, 255)'],
		['dark', 'rgb(20, 16, 11)'],
		['grid', null],
	] as const) {
		expect(
			(
				await dispatch(page, {
					type: 'scene.update-metadata',
					actorId,
					payload: { sceneId, visualSettings: { background } },
				})
			).status,
		).toBe('accepted');
		await expect(board).toHaveAttribute('data-background', background);
		if (color)
			await expect(page.getByTestId('scene-background')).toHaveCSS('background-color', color);
	}
	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitReady(page);
	await expect(board).toHaveAttribute('data-background', 'grid');
	await expect(band).toBeVisible();
	await expect(tile).toHaveCSS('top', '320px');
	const saved = await page.evaluate(
		(id) => window.__rt!.state.scenes.scenes[id].widgets[0].layout,
		sceneId,
	);
	expect(saved).toMatchObject({ dock: 'bottom', x: 80, y: 90 });
	await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
	await tile.focus();
	await page.keyboard.press('Enter');
	await inspector.getByRole('tab', { name: 'Transform', exact: true }).click();
	await dock.selectOption('left');
	await inspector.getByRole('button', { name: 'Close inspector' }).click();
	await meta.getByRole('button', { name: 'Close scene details' }).click();
	const box = (await tile.boundingBox())!;
	await page.mouse.move(box.x + 30, box.y + 50);
	await page.mouse.down();
	await page.mouse.move(box.x + 90, box.y + 50, { steps: 5 });
	await page.mouse.up();
	await expect
		.poll(() =>
			page.evaluate((id) => window.__rt!.state.scenes.scenes[id].widgets[0].layout.x, sceneId),
		)
		.toBe(60);
	await expect(tile).toHaveCSS('left', '0px');
});

test('bounded scene background covers vertical and horizontal scrolling', async ({ page }) => {
	await markOnboarded(page);
	await gotoRoute(page, '/board');
	await expect
		.poll(() => page.evaluate(() => window.__rt!.state.commandCenter.homeSceneId))
		.toBeTruthy();
	const { sceneId, actorId } = await page.evaluate(() => ({
		sceneId: window.__rt!.state.commandCenter.homeSceneId!,
		actorId: window.__rt!.defaultActorId,
	}));
	expect(
		(
			await dispatch(page, {
				type: 'scene.set-sections',
				actorId,
				payload: {
					sceneId,
					sections: [
						{
							id: 'large-region',
							name: 'Far section',
							bounds: { x: 0, y: 0, w: 8000, h: 8000 },
							widgetInstanceIds: [],
						},
					],
				},
			})
		).status,
	).toBe('accepted');
	const board = page.getByTestId('scene-board-bounded');
	for (const background of ['dark', 'paper', 'parchment', 'grid']) {
		expect(
			(
				await dispatch(page, {
					type: 'scene.update-metadata',
					actorId,
					payload: { sceneId, visualSettings: { background } },
				})
			).status,
		).toBe('accepted');
		await expect(board).toHaveAttribute('data-background', background);
		await board.evaluate((el) => {
			el.scrollTop = el.scrollHeight;
			el.scrollLeft = el.scrollWidth;
		});
		const coverage = await board.evaluate((el) => {
			const boardRect = el.getBoundingClientRect();
			const backdrop = el
				.querySelector('[data-testid="scene-background"]')!
				.getBoundingClientRect();
			return {
				x: el.scrollLeft,
				y: el.scrollTop,
				covers:
					backdrop.left <= boardRect.left + 1 &&
					backdrop.top <= boardRect.top + 1 &&
					backdrop.right >= boardRect.right - 1 &&
					backdrop.bottom >= boardRect.bottom - 1,
			};
		});
		expect(coverage.x).toBeGreaterThan(0);
		expect(coverage.y).toBeGreaterThan(0);
		expect(coverage.covers).toBe(true);
	}
});
