import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded } from './_helpers';

// RC-CAN-4.4 — the scene templates picker. A fresh scene offers "Use a template" from its empty
// state and from the gallery header; picking a template dispatches `scene.apply-template`, whose
// tiles land in the scene and survive a reload. Runs on both the desktop and the mobile project.

async function freshScene(page: Page): Promise<string> {
	await markOnboarded(page);
	await gotoRoute(page, '/scenes');
	const sceneName = `Template Scene ${Date.now()}`;
	const created = await dispatch(page, {
		type: 'scene.create',
		actorId: await page.evaluate(() => window.__rt!.defaultActorId),
		payload: { name: sceneName, description: '', visibility: 'dm-only', tags: [] },
	});
	expect(created.status).toBe('accepted');
	const sceneId = await page.evaluate(
		(name) =>
			Object.values(window.__rt!.state.scenes.scenes).find((s) => s.name === name)?.id ?? null,
		sceneName,
	);
	expect(sceneId).toBeTruthy();
	return sceneId!;
}

function sceneWidgetTypes(page: Page, sceneId: string): Promise<string[]> {
	return page.evaluate(
		(id) =>
			(
				window.__rt!.state.scenes.scenes[id] as unknown as { widgets: Array<{ type: string }> }
			).widgets.map((w) => w.type),
		sceneId,
	);
}

test('applies a built-in template to a fresh scene from its empty state', async ({ page }) => {
	const sceneId = await freshScene(page);
	await gotoRoute(page, `/scene/${sceneId}`);

	const frames = page.getByTestId('scene-board-canvas').locator('[data-testid^="widget-"]');
	await expect(frames).toHaveCount(0);
	await page
		.getByTestId('scene-empty-templates')
		.getByRole('button', { name: 'Use a template' })
		.click();

	const picker = page.getByTestId('template-picker');
	await expect(picker).toBeVisible();
	// The five built-ins, each with a generated miniature.
	for (const id of ['combat', 'social', 'exploration', 'town', 'session-prep']) {
		const card = picker.getByTestId(`template-card-builtin-${id}`);
		await expect(card).toBeVisible();
		await expect(card.locator('[data-preview="generated"]')).toHaveCount(1);
	}

	await picker.getByRole('button', { name: 'Combat scene' }).click();
	await expect(picker).toBeHidden();

	await page.waitForFunction(
		(id) => (window.__rt!.state.scenes.scenes[id]?.widgets.length ?? 0) === 5,
		sceneId,
		{ timeout: 10_000 },
	);
	expect(await sceneWidgetTypes(page, sceneId)).toEqual([
		'initiative-tracker',
		'map',
		'dice',
		'timer',
		'quick-reference',
	]);
	await expect(frames).toHaveCount(5);
	// The DM picked a starting layout to adjust it, so the editor lands in edit mode…
	await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeVisible();
	// …and the empty-state offer is gone with the emptiness.
	await expect(page.getByTestId('scene-empty-templates')).toHaveCount(0);
	const lastOp = await page.evaluate(() => {
		const opsLog = window.__rt!.state.sync.operations as Array<{ opType: string }>;
		return opsLog[opsLog.length - 1]?.opType;
	});
	expect(lastOp).toBe('scene.apply-template');

	// Durable: the applied tiles come back after a reload.
	await page.reload({ waitUntil: 'domcontentloaded' });
	await gotoRoute(page, `/scene/${sceneId}`);
	await expect(frames).toHaveCount(5);
});

test('the gallery header offers templates on an empty scene, including a saved layout', async ({
	page,
}) => {
	const sceneId = await freshScene(page);
	// A saved board layout (a Command Center preset) is a user template with a live miniature.
	const presetWidgetCount = await page.evaluate(async () => {
		const rt = window.__rt!;
		const actorId = rt.defaultActorId;
		await rt.dispatch({ type: 'command-center.ensure-home', actorId, payload: {} });
		const saved = await rt.dispatch({
			type: 'command-center.save-preset',
			actorId,
			payload: { name: 'Table console' },
		});
		if (saved.status !== 'accepted') throw new Error('save-preset rejected');
		const presets = (
			rt.state as unknown as {
				commandCenter: { presets: Record<string, { name: string; widgets: unknown[] }> };
			}
		).commandCenter.presets;
		return Object.values(presets).find((p) => p.name === 'Table console')!.widgets.length;
	});
	expect(presetWidgetCount).toBeGreaterThan(0);

	await gotoRoute(page, `/scene/${sceneId}`);
	await page.getByRole('button', { name: 'Edit layout' }).click();
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	const header = page.getByTestId('gallery-start-header');
	await expect(header).toBeVisible();
	await header.getByRole('button', { name: 'Use a scene template' }).click();

	const picker = page.getByTestId('template-picker');
	await expect(picker).toBeVisible();
	await expect(page.getByTestId('add-widget-gallery')).toBeHidden();
	const saved = picker.getByRole('list', { name: 'Your templates' });
	const card = saved.locator('li', { hasText: 'Table console' });
	await expect(card.locator('[data-preview="live"]')).toHaveCount(1);
	await card.getByRole('button', { name: 'Table console' }).click();
	await expect(picker).toBeHidden();

	await page.waitForFunction(
		([id, count]) =>
			(window.__rt!.state.scenes.scenes[id as string]?.widgets.length ?? 0) === count,
		[sceneId, presetWidgetCount] as const,
		{ timeout: 10_000 },
	);
	await expect(
		page.getByTestId('scene-board-canvas').locator('[data-testid^="widget-"]'),
	).toHaveCount(presetWidgetCount);
	// Once the scene has tiles the header entry is not offered any more.
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByTestId('add-widget-gallery')).toBeVisible();
	await expect(page.getByTestId('gallery-start-header')).toHaveCount(0);
});
