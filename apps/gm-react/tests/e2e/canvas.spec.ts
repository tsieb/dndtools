import { expect, test } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// CANVAS — the spatial surfaces (/board, /scene/:id) mount against the real Processing Core, and a
// content mutation (moving a widget) round-trips through the op-log and survives reload.

test.describe('canvas: board + scene mount and round-trip', () => {
	test('/board materializes the home scene and a widget move survives reload', async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/board');
		await seedFresh(page);
		await page.goto('/#/board', { waitUntil: 'domcontentloaded' });
		await waitReady(page);

		// ensure-home materializes the home scene with seeded system widgets (dispatched in an effect).
		await page.waitForFunction(
			() => {
				const rt = window.__rt!;
				const id = rt.state.commandCenter.homeSceneId;
				return !!id && !!rt.state.scenes.scenes[id] && rt.state.scenes.scenes[id].widgets.length > 0;
			},
			null,
			{ timeout: 10_000 },
		);

		// Move the first widget through the core command; capture the target position.
		const moved = await page.evaluate(async () => {
			const rt = window.__rt!;
			const id = rt.state.commandCenter.homeSceneId!;
			const w = rt.state.scenes.scenes[id].widgets[0];
			const targetX = w.layout.x + 96;
			const targetY = w.layout.y + 48;
			const before = rt.state.sync.operations.length;
			const res = await rt.dispatch({
				type: 'scene.move-widget',
				actorId: rt.defaultActorId,
				payload: { sceneId: id, widgetInstanceId: w.id, x: targetX, y: targetY },
			});
			return { status: res.status, wid: w.id, targetX, targetY, before, after: rt.state.sync.operations.length };
		});
		expect(moved.status).toBe('accepted');
		expect(moved.after).toBeGreaterThan(moved.before);

		// The moved position survives a full reload round-trip.
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitReady(page);
		const persisted = await page.evaluate((m) => {
			const rt = window.__rt!;
			const id = rt.state.commandCenter.homeSceneId!;
			const w = rt.state.scenes.scenes[id].widgets.find((x) => x.id === m.wid);
			return w ? { x: w.layout.x, y: w.layout.y } : null;
		}, moved);
		expect(persisted).toEqual({ x: moved.targetX, y: moved.targetY });
	});

	test('/scene/:id mounts the editor for a freshly created scene', async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/scenes');

		const sceneName = `Canvas Scene ${Date.now()}`;
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

		await gotoRoute(page, `/scene/${sceneId}`);
		await expect(page.getByText(sceneName)).not.toHaveCount(0);
	});
});
