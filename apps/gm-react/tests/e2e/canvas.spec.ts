import { expect, test } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// CANVAS — the spatial surfaces (/board, /scene/:id) mount against the real Processing Core, and a
// content mutation (moving a widget) round-trips through the op-log and survives reload.

test.describe('canvas: board + scene mount and round-trip', () => {
	test('the bounded GM Screen keeps vertical board content touch-scrollable on a phone', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 375, height: 667 });
		await markOnboarded(page);
		await gotoRoute(page, '/board');
		await seedFresh(page);
		await page.goto('/#/board', { waitUntil: 'domcontentloaded' });
		await waitReady(page);

		const board = page.getByTestId('scene-board-bounded');
		await expect(board).toBeVisible();
		await page.waitForFunction(
			() => {
				const rt = window.__rt!;
				const id = rt.state.commandCenter.homeSceneId;
				return !!id && rt.state.scenes.scenes[id]?.widgets.length > 0;
			},
			null,
			{ timeout: 10_000 },
		);
		// Put one existing widget beyond the short phone board viewport through the normal core
		// command. The resulting content must remain reachable by a vertical scroll gesture.
		const moved = await page.evaluate(async () => {
			const rt = window.__rt!;
			const sceneId = rt.state.commandCenter.homeSceneId!;
			const widget = rt.state.scenes.scenes[sceneId].widgets[0];
			return rt.dispatch({
				type: 'scene.move-widget',
				actorId: rt.defaultActorId,
				payload: { sceneId, widgetInstanceId: widget.id, x: widget.layout.x, y: 900 },
			});
		});
		expect(moved.status).toBe('accepted');
		await expect
			.poll(() => board.evaluate((element) => element.scrollHeight > element.clientHeight))
			.toBe(true);
		// The board owns a vertical scroll range for its tall widget canvas. Its touch-action must
		// preserve a direct-touch route to that range rather than requiring a desktop scrollbar.
		await expect(board).toHaveCSS('touch-action', 'pan-y');
		const dimensions = await board.evaluate((element) => ({
			clientHeight: element.clientHeight,
			scrollHeight: element.scrollHeight,
		}));
		expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);
		await board.evaluate((element) => {
			element.scrollTop = element.scrollHeight;
		});
		await expect.poll(() => board.evaluate((element) => element.scrollTop > 0)).toBe(true);
	});

	// The edit-mode grid overlay was a 6000x6000 absolutely-positioned sheet living INSIDE the
	// bounded policy's `overflow: auto` scroll container. Absolute descendants still contribute
	// scrollable overflow, so pressing "Edit layout" ballooned the board's scrollHeight to several
	// thousand px of empty space — and made the scroll assertion above pass vacuously.
	test('entering board edit mode does not invent a phantom scroll region', async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/board');
		await seedFresh(page);
		await page.goto('/#/board', { waitUntil: 'domcontentloaded' });
		await waitReady(page);

		const board = page.getByTestId('scene-board-bounded');
		await expect(board).toBeVisible();
		await page.waitForFunction(
			() => {
				const rt = window.__rt!;
				const id = rt.state.commandCenter.homeSceneId;
				return !!id && rt.state.scenes.scenes[id]?.widgets.length > 0;
			},
			null,
			{ timeout: 10_000 },
		);

		const before = await board.evaluate((el) => el.scrollHeight);
		await page.getByRole('button', { name: /Edit layout/i }).click();
		// The grid is decorative: it only needs to cover the board's own extent, so turning it on
		// must not materially change how far the surface scrolls.
		await expect
			.poll(() => board.evaluate((el) => el.scrollHeight), { timeout: 5_000 })
			.toBeLessThanOrEqual(before + 200);
	});

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
				return (
					!!id && !!rt.state.scenes.scenes[id] && rt.state.scenes.scenes[id].widgets.length > 0
				);
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
			return {
				status: res.status,
				wid: w.id,
				targetX,
				targetY,
				before,
				after: rt.state.sync.operations.length,
			};
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

test.describe('canvas: destroying a widget is confirmed', () => {
	// `scene.destroy-widget` has NO restore counterpart in the core, so there is nothing an Undo toast
	// could dispatch — a single click (or a stray Delete keypress while arrow-navigating the frames in
	// edit mode) used to permanently destroy a widget and its configuration.
	async function sceneWithOneWidget(page: import('@playwright/test').Page): Promise<string> {
		await markOnboarded(page);
		await gotoRoute(page, '/scenes');
		const sceneName = `Destroy Scene ${Date.now()}`;
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

		// Place one widget through the real Add panel, so the instance is whatever the live library
		// actually offers rather than a hand-built payload.
		await gotoRoute(page, `/scene/${sceneId}`);
		await page.getByRole('button', { name: 'Edit layout' }).click();
		await page.getByRole('button', { name: 'Add', exact: true }).click();
		await expect(page.getByText('Add widget', { exact: true })).toBeVisible();
		// Button 0 is the panel's own Close control; the library entries follow it.
		await page.getByTestId('scene-add-widget-panel').getByRole('button').nth(1).click();
		await page.waitForFunction(
			(id) => (window.__rt!.state.scenes.scenes[id]?.widgets.length ?? 0) === 1,
			sceneId!,
			{ timeout: 10_000 },
		);
		return sceneId!;
	}

	const widgetCount = (page: import('@playwright/test').Page, sceneId: string) =>
		page.evaluate((id) => window.__rt!.state.scenes.scenes[id]?.widgets.length ?? 0, sceneId);

	test('the Inspector Remove asks first, and Keep leaves the widget alone', async ({ page }) => {
		const sceneId = await sceneWithOneWidget(page);
		const widgetId = await page.evaluate(
			(id) => window.__rt!.state.scenes.scenes[id].widgets[0].id,
			sceneId,
		);

		// Select the widget to open the Inspector, then ask to remove it. Enter on a focused frame is
		// the frame's own select gesture — a pointer press there would start a move drag instead.
		await page.getByTestId(`widget-${widgetId}`).focus();
		await page.keyboard.press('Enter');
		await page.getByRole('button', { name: 'Remove widget' }).click();

		const confirm = page.getByRole('dialog', { name: /Remove/ });
		await expect(confirm).toBeVisible();
		await confirm.getByRole('button', { name: 'Keep' }).click();
		await expect(confirm).toHaveCount(0);
		expect(await widgetCount(page, sceneId)).toBe(1);

		// Confirming does destroy it.
		await page.getByRole('button', { name: 'Remove widget' }).click();
		await page
			.getByRole('dialog', { name: /Remove/ })
			.getByRole('button', { name: 'Remove widget' })
			.click();
		await expect.poll(() => widgetCount(page, sceneId)).toBe(0);
	});

	// /board has NO Inspector, so Delete on a focused frame is the only widget-lifecycle operation on
	// that surface — and it destroyed the instance's configuration (a note's body, a timer's duration,
	// a map binding) with no confirm, no toast and no undo. Same gate as /scene/:id now.
	test('Delete on a focused /board widget frame asks first, and Escape keeps it', async ({
		page,
	}) => {
		await markOnboarded(page);
		await gotoRoute(page, '/board');
		await seedFresh(page);
		await page.goto('/#/board', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		const homeSceneId = await page.waitForFunction(
			() => {
				const rt = window.__rt!;
				const id = rt.state.commandCenter.homeSceneId;
				return id && (rt.state.scenes.scenes[id]?.widgets.length ?? 0) > 0 ? id : null;
			},
			null,
			{ timeout: 20_000 },
		);
		const sceneId = (await homeSceneId.jsonValue()) as string;
		const before = await widgetCount(page, sceneId);
		expect(before).toBeGreaterThan(0);

		await page.getByRole('button', { name: 'Edit layout' }).click();
		const widgetId = await page.evaluate(
			(id) => window.__rt!.state.scenes.scenes[id].widgets[0].id,
			sceneId,
		);
		await page.getByTestId(`widget-${widgetId}`).focus();
		await page.keyboard.press('Delete');

		const confirm = page.getByRole('dialog', { name: /Remove/ });
		await expect(confirm).toBeVisible();
		// Nothing left the board while the question was on screen.
		expect(await widgetCount(page, sceneId)).toBe(before);

		await page.keyboard.press('Escape');
		await expect(confirm).toHaveCount(0);
		expect(await widgetCount(page, sceneId)).toBe(before);

		// And confirming still works, so the gate is a question and not a wall.
		await page.getByTestId(`widget-${widgetId}`).focus();
		await page.keyboard.press('Delete');
		await page
			.getByRole('dialog', { name: /Remove/ })
			.getByRole('button', { name: 'Remove widget' })
			.click();
		await expect.poll(() => widgetCount(page, sceneId)).toBe(before - 1);
	});

	test('a stray Delete keypress on a focused widget frame cannot destroy it outright', async ({
		page,
	}) => {
		const sceneId = await sceneWithOneWidget(page);
		const widgetId = await page.evaluate(
			(id) => window.__rt!.state.scenes.scenes[id].widgets[0].id,
			sceneId,
		);

		// The keyboard path had no confirmation UI attached at all — arrow-navigating the frames and
		// hitting Delete removed a widget silently.
		await page.getByTestId(`widget-${widgetId}`).focus();
		await page.keyboard.press('Delete');
		await expect(page.getByRole('dialog', { name: /Remove/ })).toBeVisible();
		expect(await widgetCount(page, sceneId)).toBe(1);

		await page.keyboard.press('Escape');
		await expect(page.getByRole('dialog', { name: /Remove/ })).toHaveCount(0);
		expect(await widgetCount(page, sceneId)).toBe(1);
	});
});

test.describe('canvas: side panels close on Escape', () => {
	test('the /board Add-widget panel closes on Escape from within the panel', async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/board');
		await seedFresh(page);
		await page.goto('/#/board', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.waitForFunction(
			() => {
				const rt = window.__rt!;
				const id = rt.state.commandCenter.homeSceneId;
				return !!id && !!rt.state.scenes.scenes[id];
			},
			null,
			{ timeout: 10_000 },
		);

		await page.getByRole('button', { name: 'Edit layout' }).click();
		await page.getByRole('button', { name: 'Add', exact: true }).click();
		await expect(page.getByText('Add widget', { exact: true })).toBeVisible();

		// Escape pressed inside the panel dismisses it, matching the scene-details panel contract.
		await page.getByRole('button', { name: 'Close', exact: true }).focus();
		await page.keyboard.press('Escape');
		await expect(page.getByText('Add widget', { exact: true })).toHaveCount(0);
	});

	// The Layouts panel used to render unconditionally on `editing && !addOpen` — no toggle, no
	// Close control, no Escape handler. On a phone it is a 280px absolute overlay, so it covered
	// all but ~97px of the board and the only escape was leaving edit mode entirely. It is now a
	// peer of the Add panel, and the two share one side slot.
	test('the /board Layouts panel toggles, closes on Escape, and yields the slot to Add', async ({
		page,
	}) => {
		await markOnboarded(page);
		await gotoRoute(page, '/board');
		await seedFresh(page);
		await page.goto('/#/board', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.waitForFunction(
			() => {
				const rt = window.__rt!;
				const id = rt.state.commandCenter.homeSceneId;
				return !!id && !!rt.state.scenes.scenes[id];
			},
			null,
			{ timeout: 10_000 },
		);

		const layouts = page.getByTestId('board-layouts-panel');
		const layoutsToggle = page.getByRole('button', { name: 'Layouts', exact: true });
		const addToggle = page.getByRole('button', { name: 'Add', exact: true });

		// Entering edit mode no longer forces the panel open over the board.
		await page.getByRole('button', { name: 'Edit layout' }).click();
		await expect(layouts).toHaveCount(0);
		await expect(layoutsToggle).toHaveAttribute('aria-expanded', 'false');

		await layoutsToggle.click();
		await expect(layouts).toBeVisible();
		await expect(layoutsToggle).toHaveAttribute('aria-expanded', 'true');

		// Escape from inside the panel dismisses it, matching the Add panel's contract.
		await page.getByRole('button', { name: 'Close layouts' }).focus();
		await page.keyboard.press('Escape');
		await expect(layouts).toHaveCount(0);

		// The two panels compete for the same side slot, so opening Add closes Layouts.
		await layoutsToggle.click();
		await expect(layouts).toBeVisible();
		await addToggle.click();
		await expect(page.getByText('Add widget', { exact: true })).toBeVisible();
		await expect(layouts).toHaveCount(0);

		// …and leaving edit mode drops both.
		await page.getByRole('button', { name: 'Done' }).click();
		await expect(page.getByText('Add widget', { exact: true })).toHaveCount(0);
		await expect(layouts).toHaveCount(0);
	});

	test('the scene editor Add-widget panel closes on Escape from within the panel', async ({
		page,
	}) => {
		await markOnboarded(page);
		await gotoRoute(page, '/scenes');

		const sceneName = `Escape Scene ${Date.now()}`;
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
		await page.getByRole('button', { name: 'Edit layout' }).click();
		await page.getByRole('button', { name: 'Add', exact: true }).click();
		await expect(page.getByText('Add widget', { exact: true })).toBeVisible();

		await page.getByRole('button', { name: 'Close', exact: true }).focus();
		await page.keyboard.press('Escape');
		await expect(page.getByText('Add widget', { exact: true })).toHaveCount(0);
	});
});
