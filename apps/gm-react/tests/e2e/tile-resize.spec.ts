import { expect, test, type Locator } from '@playwright/test';
import { gotoRoute, markOnboarded, preferPhoneCanvas } from './_helpers';

// Both functional profiles exercise the same persisted canvas commands.
test.beforeEach(async ({ page }) => {
	await markOnboarded(page);
	await preferPhoneCanvas(page);
	await gotoRoute(page, '/board');
	await expect(page.locator('[data-widget-region]').first()).toBeVisible();
});

async function expectWhole(region: Locator, content: Locator) {
	const outer = await region.boundingBox();
	const inner = await content.boundingBox();
	expect(outer).not.toBeNull();
	expect(inner).not.toBeNull();
	expect(inner!.y).toBeGreaterThanOrEqual(outer!.y - 1);
	expect(inner!.y + inner!.height).toBeLessThanOrEqual(outer!.y + outer!.height + 1);
}

test('every seeded tile enables Resize; Prep and Map resize through the UI and persist', async ({
	page,
}) => {
	const data = await page.evaluate(async () => {
		const rt = window.__rt!;
		const sceneId = rt.state.commandCenter.homeSceneId!;
		const widgets = rt.state.scenes.scenes[sceneId].widgets;
		const prep = widgets.find((w) => w.type === 'prep')!;
		const map = widgets.find((w) => w.type === 'map')!;
		const result = await rt.dispatch({
			type: 'scene.configure-widget',
			actorId: rt.defaultActorId,
			payload: {
				sceneId,
				widgetInstanceId: prep.id,
				configuration: { ...prep.configuration, count: 6 },
			},
		});
		return {
			sceneId,
			notes: Object.values(rt.state.content.items)
				.filter((item) => item.kind === 'note')
				.map((item) => item.title),
			widgets: widgets.map((w) => ({ id: w.id, type: w.type, ...w.layout })),
			prep: prep.id,
			map: map.id,
			status: result.status,
		};
	});
	expect(data.status).toBe('accepted');
	await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
	for (const widget of data.widgets) {
		const tile = page.getByTestId(`widget-${widget.id}`);
		await tile.focus();
		await page.keyboard.press('Shift+F10');
		const resize = page.getByRole('menuitem', { name: 'Resize', exact: true });
		await expect(resize).not.toHaveAttribute('aria-disabled', 'true');
		await page.keyboard.press('Escape');
	}
	for (const id of [data.prep, data.map]) {
		const tile = page.getByTestId(`widget-${id}`);
		await tile.focus();
		await page.keyboard.press('Space');
		await expect(tile.getByRole('button', { name: /^Resize / })).toBeVisible();
		for (let i = 0; i < 28; i++) await page.keyboard.press('Shift+ArrowDown');
		await expect
			.poll(() =>
				page.evaluate(
					({ sceneId, id }) =>
						window.__rt!.state.scenes.scenes[sceneId].widgets.find((w) => w.id === id)!.layout.h,
					{ sceneId: data.sceneId, id },
				),
			)
			.toBe(data.widgets.find((w) => w.id === id)!.h + 560);
		await page.keyboard.press('Escape');
	}
	await page.getByRole('button', { name: 'Done', exact: true }).click();
	const prepRegion = page.getByTestId(`widget-${data.prep}`).locator('[data-widget-region]');
	// The seeded notes are actual content, not a screenshot-only replacement.
	// The Ashen Hand is a faction object since RC-KNW-6.2, so five notes remain.
	expect(data.notes).toHaveLength(5);
	for (const title of data.notes) {
		const note = prepRegion.getByText(title, { exact: true });
		await expect(note).toBeVisible();
		await expectWhole(prepRegion, note);
	}
	await expect
		.poll(() => prepRegion.evaluate((el) => el.scrollHeight - el.clientHeight))
		.toBeLessThan(2);
	const mapRegion = page.getByTestId(`widget-${data.map}`).locator('[data-widget-region]');
	await expectWhole(mapRegion, mapRegion.getByRole('button', { name: 'Zoom in', exact: true }));
	await expectWhole(mapRegion, mapRegion.getByRole('button', { name: 'Zoom out', exact: true }));
	await page.reload();
	await expect(page.getByTestId(`widget-${data.prep}`)).toBeVisible();
	const saved = await page.evaluate(
		({ sceneId }) =>
			window.__rt!.state.scenes.scenes[sceneId].widgets.map((w) => ({ id: w.id, h: w.layout.h })),
		data,
	);
	for (const id of [data.prep, data.map])
		expect(saved.find((w) => w.id === id)!.h).toBe(data.widgets.find((w) => w.id === id)!.h + 560);
});

test('a builtin corner handle appears on hover and dragging commits a resize', async ({ page }) => {
	await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
	const tile = page.locator('[data-testid^="widget-"][role="group"]').first();
	const id = (await tile.getAttribute('data-testid'))!.slice(7);
	await tile.hover();
	const handle = tile.getByRole('button', { name: /^Resize / });
	await expect(handle).toBeVisible();
	const box = (await handle.boundingBox())!;
	const before = await tile.getAttribute('aria-label');
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 80, { steps: 8 });
	await page.mouse.up();
	await expect(page.getByTestId(`widget-${id}`)).not.toHaveAttribute('aria-label', before!);
});

test('a builtin inspector offers working Small, Medium and Large presets', async ({ page }) => {
	const { sceneId, id } = await page.evaluate(() => {
		const rt = window.__rt!;
		const sceneId = rt.state.commandCenter.homeSceneId!;
		return {
			sceneId,
			id: rt.state.scenes.scenes[sceneId].widgets.find((w) => w.type === 'prep')!.id,
		};
	});
	await gotoRoute(page, `/scene/${sceneId}`);
	await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
	// The scene details panel initially occupies the phone inspector slot.
	const closeDetails = page.getByRole('button', { name: 'Close scene details' });
	if (await closeDetails.isVisible()) await closeDetails.click();
	await page.getByTestId(`widget-${id}`).focus();
	await page.keyboard.press('Enter');
	const inspector = page.getByTestId('widget-inspector');
	await inspector.getByRole('tab', { name: 'Transform', exact: true }).click();
	for (const [name, width, height] of [
		['Small', 20, 20],
		['Medium', 260, 200],
		['Large', 390, 300],
	] as const) {
		await inspector.getByRole('button', { name, exact: true }).click();
		await expect
			.poll(() =>
				page.evaluate(
					({ sceneId, id }) => {
						const { w, h } = window.__rt!.state.scenes.scenes[sceneId].widgets.find(
							(w) => w.id === id,
						)!.layout;
						return { w, h };
					},
					{ sceneId, id },
				),
			)
			.toEqual({ w: width, h: height });
	}
});
