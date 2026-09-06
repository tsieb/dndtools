import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

/**
 * Take the session live on the home scene.
 *
 * `session.set-workflow {workflow:'active'}` is REJECTED without an `activeSceneId`, and
 * `command-center.ensure-home` resolves asynchronously AFTER `waitReady` (which only waits for
 * `#main-content`). Three tests here read `homeSceneId` in a one-shot `page.evaluate`, so they raced
 * the home scene into existence: green in isolation, intermittently red under full-suite load. Wait
 * for it, and fall back to the first real scene exactly as combat.spec / player-view.spec already do.
 */
async function goLive(page: Page): Promise<void> {
	await page.waitForFunction(() => {
		const state = window.__rt!.state as unknown as {
			commandCenter: { homeSceneId: string | null };
			scenes: { scenes: Record<string, { id: string; isTemplate?: boolean }> };
		};
		return (
			state.commandCenter.homeSceneId !== null ||
			Object.values(state.scenes.scenes).some((s) => !s.isTemplate)
		);
	});
	const live = await page.evaluate(async () => {
		const rt = window.__rt!;
		const state = rt.state as unknown as {
			commandCenter: { homeSceneId: string | null };
			scenes: { scenes: Record<string, { id: string; isTemplate?: boolean }> };
		};
		const sceneId =
			state.commandCenter.homeSceneId ??
			Object.values(state.scenes.scenes).find((s) => !s.isTemplate)?.id;
		return rt.dispatch({
			type: 'session.set-workflow',
			actorId: rt.defaultActorId,
			payload: { workflow: 'active', activeSceneId: sceneId },
		});
	});
	expect(live.status, `go live was ${live.status}: ${JSON.stringify(live)}`).toBe('accepted');
}

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

test.describe('canvas: layout history and reversible removal', () => {
	// RC-CAN-1.3. Removing a widget used to be gated behind a confirm dialog because the core had no
	// way to put it back. It does now (`scene.restore-widget`), so the canvas keeps a local undo stack
	// instead: a removal happens at once and is reversed by the toast's Undo, the toolbar's Undo, or
	// Ctrl+Z — and so are moves and resizes.
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

	/** The seeded home scene on `/board`, waited for rather than raced (see `goLive` above). */
	async function boardWithWidgets(page: import('@playwright/test').Page): Promise<string> {
		await markOnboarded(page);
		await gotoRoute(page, '/board');
		await seedFresh(page);
		await page.goto('/#/board', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		const handle = await page.waitForFunction(
			() => {
				const rt = window.__rt!;
				const id = rt.state.commandCenter.homeSceneId;
				return id && (rt.state.scenes.scenes[id]?.widgets.length ?? 0) > 0 ? id : null;
			},
			null,
			{ timeout: 20_000 },
		);
		return (await handle.jsonValue()) as string;
	}

	const widgetCount = (page: import('@playwright/test').Page, sceneId: string) =>
		page.evaluate((id) => window.__rt!.state.scenes.scenes[id]?.widgets.length ?? 0, sceneId);

	// The Inspector is gated `!addOpen && !metaOpen`, but SELECTION was not — so with "Scene details"
	// open, clicking a widget painted its selection ring and its title chip and opened no editor at
	// all: a visible selection with nothing to do with it. The Edit-layout toggle had the same hole
	// (it cleared `addOpen` but not `metaOpen`), which left every later widget click inert.
	test('selecting a widget with Scene details open still opens the Inspector', async ({ page }) => {
		const sceneId = await sceneWithOneWidget(page);
		const widgetId = await page.evaluate(
			(id) => window.__rt!.state.scenes.scenes[id].widgets[0].id,
			sceneId,
		);

		await page.getByRole('button', { name: 'Edit scene name, description & tags' }).click();
		await expect(page.getByTestId('scene-meta-panel')).toBeVisible();

		await page.getByTestId(`widget-${widgetId}`).focus();
		await page.keyboard.press('Enter');

		// The Inspector opens (its Remove control is unique to it) and the scene-level panel yields.
		await expect(page.getByRole('button', { name: 'Remove widget' })).toBeVisible();
		await expect(page.getByTestId('scene-meta-panel')).toHaveCount(0);
	});

	// Leaving the details panel open across the Edit-layout toggle used to survive it, so every
	// widget click afterwards was inert for the same reason.
	test('leaving edit mode closes the details panel as well as the Add panel', async ({ page }) => {
		const sceneId = await sceneWithOneWidget(page);
		expect(sceneId).toBeTruthy();

		await page.getByRole('button', { name: 'Edit scene name, description & tags' }).click();
		await expect(page.getByTestId('scene-meta-panel')).toBeVisible();
		await page.getByRole('button', { name: 'Done', exact: true }).click();
		await expect(page.getByTestId('scene-meta-panel')).toHaveCount(0);
	});

	test('the Inspector Remove takes effect at once, and the toast Undo puts the widget back', async ({
		page,
	}) => {
		const sceneId = await sceneWithOneWidget(page);
		const widgetId = await page.evaluate(
			(id) => window.__rt!.state.scenes.scenes[id].widgets[0].id,
			sceneId,
		);

		// Select the widget to open the Inspector, then remove it. Enter on a focused frame is the
		// frame's own select gesture — a pointer press there would start a move drag instead.
		await page.getByTestId(`widget-${widgetId}`).focus();
		await page.keyboard.press('Enter');
		await page.getByRole('button', { name: 'Remove widget' }).click();

		// No question: it is gone, and the offer to undo is on screen instead.
		await expect.poll(() => widgetCount(page, sceneId)).toBe(0);
		const undo = page.getByRole('button', { name: 'Undo', exact: true });
		await expect(undo).toBeVisible();
		await expect(page.getByText(/^Removed /)).toBeVisible();

		// Undo restores the SAME instance, not a fresh one — that is the whole point of the tombstone.
		await undo.click();
		await expect.poll(() => widgetCount(page, sceneId)).toBe(1);
		expect(
			await page.evaluate((id) => window.__rt!.state.scenes.scenes[id].widgets[0].id, sceneId),
		).toBe(widgetId);
	});

	// `Section`'s label is an unassociated <span> and the DS `Select` renders a bare <select> (only
	// `Field` wires a label up), so the one control that decides whether a widget is DM-only or on
	// the players' screen announced nothing but its current value — axe `select-name`, WCAG 4.1.2.
	// `/scene/:id` is not in the axe gate's route list, so nothing was going to catch it there.
	test('the Inspector visibility control has an accessible name', async ({ page }) => {
		const sceneId = await sceneWithOneWidget(page);
		const widgetId = await page.evaluate(
			(id) => window.__rt!.state.scenes.scenes[id].widgets[0].id,
			sceneId,
		);
		await page.getByTestId(`widget-${widgetId}`).focus();
		await page.keyboard.press('Enter');

		const visibility = page.getByRole('combobox', { name: 'Widget visibility' });
		await expect(visibility).toHaveCount(1);
		// And it still drives the durable state it is named for.
		await visibility.selectOption('player-visible');
		await expect
			.poll(() =>
				page.evaluate(
					(id) =>
						(
							window.__rt!.state.scenes.scenes[id].widgets[0].configuration as {
								visibility?: string;
							}
						).visibility,
					sceneId,
				),
			)
			.toBe('player-visible');
	});

	// /board has NO Inspector, so Delete on a focused frame is the only widget-lifecycle operation on
	// that surface. It is no longer a wall or a question: the removal lands and the Undo toast — which
	// never auto-dismisses, because it carries an action — is the safety net.
	test('Delete on a focused /board widget frame removes it and offers Undo', async ({ page }) => {
		const sceneId = await boardWithWidgets(page);
		const before = await widgetCount(page, sceneId);
		expect(before).toBeGreaterThan(0);

		await page.getByRole('button', { name: 'Edit layout' }).click();
		const widgetId = await page.evaluate(
			(id) => window.__rt!.state.scenes.scenes[id].widgets[0].id,
			sceneId,
		);
		await page.getByTestId(`widget-${widgetId}`).focus();
		await page.keyboard.press('Delete');

		await expect.poll(() => widgetCount(page, sceneId)).toBe(before - 1);
		const undo = page.getByRole('button', { name: 'Undo', exact: true });
		await expect(undo).toBeVisible();
		await undo.click();
		await expect.poll(() => widgetCount(page, sceneId)).toBe(before);
	});

	test('Ctrl+Z on the canvas reverses a removal, and announces what it reversed', async ({
		page,
	}) => {
		const sceneId = await sceneWithOneWidget(page);
		const widgetId = await page.evaluate(
			(id) => window.__rt!.state.scenes.scenes[id].widgets[0].id,
			sceneId,
		);
		const canvas = page.getByTestId('scene-board-canvas');

		await page.getByTestId(`widget-${widgetId}`).focus();
		await page.keyboard.press('Delete');
		await expect.poll(() => widgetCount(page, sceneId)).toBe(0);

		// Dismiss the toast so the only remaining route back is the keyboard one.
		await page.getByRole('button', { name: 'Dismiss' }).first().click();
		await canvas.click({ position: { x: 6, y: 6 } });
		await page.keyboard.press('Control+z');

		await expect.poll(() => widgetCount(page, sceneId)).toBe(1);
		await expect(canvas.getByRole('status')).toContainText(/^Undone: removed /);
	});

	test('undo and redo reverse a widget move, on the canvas and from the toolbar', async ({
		page,
	}) => {
		const sceneId = await sceneWithOneWidget(page);
		const widgetId = await page.evaluate(
			(id) => window.__rt!.state.scenes.scenes[id].widgets[0].id,
			sceneId,
		);
		const xOf = () =>
			page.evaluate((id) => window.__rt!.state.scenes.scenes[id].widgets[0].layout.x, sceneId);
		const canvas = page.getByTestId('scene-board-canvas');
		const originalX = await xOf();

		// Select the frame, then one arrow step — the keyboard equivalent of a drag, committed as one
		// `scene.move-widget`.
		await page.getByTestId(`widget-${widgetId}`).focus();
		await page.keyboard.press('Enter');
		await page.keyboard.press('ArrowRight');
		await expect.poll(xOf).toBeGreaterThan(originalX);

		await page.keyboard.press('Control+z');
		await expect.poll(xOf).toBe(originalX);
		await expect(canvas.getByRole('status')).toContainText(/^Undone: moved /);

		// Redo through the toolbar button, so the pointer path is exercised too (WCAG 2.5.7: the
		// button and the shortcut dispatch the same command).
		const controls = page.getByTestId('canvas-history-controls');
		await controls.getByRole('button', { name: /^Redo/ }).click();
		await expect.poll(xOf).toBeGreaterThan(originalX);
		await expect(canvas.getByRole('status')).toContainText(/^Redone: moved /);

		await controls.getByRole('button', { name: /^Undo/ }).click();
		await expect.poll(xOf).toBe(originalX);
	});

	// Undo of a `scene.resize-widget` is covered in src/app/canvas/useLayoutHistory.test.tsx instead:
	// every widget that ships today is `system` tier, and the canvas deliberately offers system
	// widgets no resize handle and swallows their Shift+Arrow — so there is no pointer or keyboard
	// path an end-to-end test could take to a resize on this surface.
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

// `/scene/:id` is ONE route element, so React Router reuses `SceneEditor` across param changes and
// never unmounts it on a scene→scene navigation. `SceneMetaPanel` held its three fields as
// `useState(prop)` drafts with no prop→draft sync and no `key`, and its Save is a FULL metadata
// replacement addressed by the route id — so leaving the panel open and switching scenes wrote the
// PREVIOUS scene's name, description and tags onto the new one, silently and durably.
test.describe('canvas: per-scene editor state does not bleed between scenes', () => {
	test('switching scenes with the details panel open cannot save the old scene onto the new one', async ({
		page,
	}) => {
		await markOnboarded(page);
		await gotoRoute(page, '/scenes');
		await seedFresh(page);
		await page.goto('/#/scenes', { waitUntil: 'domcontentloaded' });
		await waitReady(page);

		const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
		const stamp = Date.now();
		const nameA = `Bleed A ${stamp}`;
		const nameB = `Bleed B ${stamp}`;
		for (const name of [nameA, nameB]) {
			const created = await dispatch(page, {
				type: 'scene.create',
				actorId,
				payload: { name, description: '', visibility: 'dm-only', tags: [] },
			});
			expect(created.status).toBe('accepted');
		}
		const idOf = (name: string) =>
			page.evaluate(
				(n) =>
					Object.values(window.__rt!.state.scenes.scenes).find((s) => s.name === n)?.id ?? null,
				name,
			);
		const idA = (await idOf(nameA))!;
		const idB = (await idOf(nameB))!;
		expect(idA).toBeTruthy();
		expect(idB).toBeTruthy();

		// Open A's details panel and type a new name into the draft.
		await gotoRoute(page, `/scene/${idA}`);
		await page.getByRole('button', { name: 'Edit scene name, description & tags' }).click();
		await expect(page.getByTestId('scene-meta-panel')).toBeVisible();
		await page.locator('#scene-meta-name').fill(`${nameA} EDITED`);

		// Navigate straight to B WITHOUT closing the panel — the component is reused, not remounted.
		await gotoRoute(page, `/scene/${idB}`);
		await expect(page.getByTestId('scene-meta-panel')).toHaveCount(0);

		// Reopening on B shows B's real values, not A's abandoned draft…
		await page.getByRole('button', { name: 'Edit scene name, description & tags' }).click();
		await expect(page.locator('#scene-meta-name')).toHaveValue(nameB);

		// …and saving from B writes B, leaving A untouched.
		await page.getByRole('button', { name: 'Save details' }).click();
		await expect
			.poll(async () => {
				const names = await page.evaluate(
					(ids) =>
						ids.map(
							(id) =>
								(window.__rt!.state.scenes.scenes as Record<string, { name: string }>)[id]?.name ??
								null,
						),
					[idA, idB],
				);
				return names;
			})
			.toEqual([nameA, nameB]);
	});
});

// The GM Screen ships seeded Dice and Timer widgets, and every dice/timer operate command declares
// `writesTo: 'session'` — which the core refuses unless `session.workflow === 'active'`. The chips
// were rendered fully live (accent-toned, keyboard operable) on a fresh, idle install, and the first
// press printed the raw internal string "Session widget commands require an active workflow; current
// workflow is idle." into the board's alert region.
test.describe('canvas: session-only widget operations explain themselves', () => {
	test('the GM Screen dice chip is soft-disabled with a reason while the session is idle', async ({
		page,
	}) => {
		await markOnboarded(page);
		await gotoRoute(page, '/board');
		await seedFresh(page);
		await page.goto('/#/board', { waitUntil: 'domcontentloaded' });
		await waitReady(page);

		expect(await page.evaluate(() => window.__rt!.state.session.workflow)).not.toBe('active');

		const roll = page.getByRole('button', { name: /^Roll / });
		await expect(roll).toHaveCount(1);
		// Soft-disabled: it keeps its place in the tab order and carries its own explanation, rather
		// than being natively `disabled` (unreachable) or silently live (rejected on press).
		await expect(roll).toHaveAttribute('aria-disabled', 'true');
		await expect(roll).toHaveAccessibleName(/Go live in Session/);
		await roll.focus();
		await expect(roll).toBeFocused();

		// Pressing it is swallowed — no raw core rejection reaches the alert region. `locator.click()`
		// refuses an `aria-disabled` target outright (which is itself the point), so dispatch the event
		// directly to prove the handler, not just the actionability check, declines it.
		await roll.dispatchEvent('click');
		await expect(page.getByText(/current workflow is/)).toHaveCount(0);

		// Going live turns the same chip into a real, unqualified control.
		await goLive(page);
		await expect(roll).not.toHaveAttribute('aria-disabled', 'true');
		await expect(roll).toHaveAccessibleName(/^Roll /);
	});
});

// The shell's only <h1> lives in the top bar, OUTSIDE <main>, and on `/scene/:id` it names the
// SECTION ("Scenes"). The scene's own name was a plain <div>, so heading navigation inside the
// content pane found nothing and a screen-reader user could not tell which scene was open.
test.describe('canvas: the spatial surfaces carry a heading inside <main>', () => {
	test('the scene editor heads its pane with the scene name', async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/scenes');
		await seedFresh(page);

		const scene = await page.evaluate(() => {
			const rt = window.__rt!;
			const first = Object.values(rt.state.scenes.scenes)[0]!;
			return { id: first.id, name: first.name };
		});
		await gotoRoute(page, `/scene/${scene.id}`);

		const heading = page.locator('#main-content').getByRole('heading', { name: scene.name });
		await expect(heading.first()).toBeVisible();
	});

	test('the GM Screen heads its pane too', async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/board');
		await seedFresh(page);
		await page.goto('/#/board', { waitUntil: 'domcontentloaded' });
		await waitReady(page);

		await expect(
			page.locator('#main-content').getByRole('heading', { name: 'GM Screen' }).first(),
		).toBeVisible();
	});
});

test.describe('canvas: view mode reads, edit mode moves', () => {
	// `onBgDown` is bound to the canvas WRAPPER, and the drag overlay that swallows pointerdown exists
	// only in EDIT mode. So on `/scene/:id` in view mode a press on widget CONTENT — note text, a
	// character's stats, a map thumbnail — reached the wrapper, started a canvas pan and set
	// `userSelect:'none'` on <body>. A DM could therefore never select or copy a note, and an
	// accidental drag while reading threw the whole canvas off-screen.
	test('pressing widget content does not start a canvas pan or kill text selection', async ({
		page,
	}) => {
		await markOnboarded(page);
		await gotoRoute(page, '/scenes');
		const sceneName = `Read Scene ${Date.now()}`;
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

		// Place a widget through the real Add panel, then leave edit mode: view mode is where the bug is.
		await gotoRoute(page, `/scene/${sceneId}`);
		await page.getByRole('button', { name: 'Edit layout' }).click();
		await page.getByRole('button', { name: 'Add', exact: true }).click();
		await expect(page.getByText('Add widget', { exact: true })).toBeVisible();
		await page.getByTestId('scene-add-widget-panel').getByRole('button').nth(1).click();
		await page.waitForFunction(
			(id) => (window.__rt!.state.scenes.scenes[id]?.widgets.length ?? 0) > 0,
			sceneId,
			{ timeout: 10_000 },
		);
		await page.getByRole('button', { name: 'Done', exact: true }).click();

		const canvas = page.getByTestId('scene-board-canvas');
		await expect(canvas).toBeVisible();

		// Press somewhere INSIDE the placed widget rather than on the empty backdrop.
		const frame = canvas.locator('[data-testid^="widget-"]').first();
		await expect(frame).toBeVisible();
		const box = await frame.boundingBox();
		expect(box).not.toBeNull();
		await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
		await page.mouse.down();

		// The canvas is not now dragging, and the document has not been made unselectable.
		expect(
			await page.evaluate(() => document.body.style.userSelect),
			'reading a widget must not disable text selection document-wide',
		).not.toBe('none');

		// Moving the pointer with the button held must not translate the canvas either.
		const before = await frame.boundingBox();
		await page.mouse.move(box!.x + box!.width / 2 + 140, box!.y + box!.height / 2 + 90);
		const after = await frame.boundingBox();
		await page.mouse.up();
		expect(
			Math.abs(after!.x - before!.x),
			'view mode must not pan from widget content',
		).toBeLessThan(2);
		expect(
			Math.abs(after!.y - before!.y),
			'view mode must not pan from widget content',
		).toBeLessThan(2);
	});
});

// `/board` and `/scene/:id` are the only two screens in the app that bypass `<Page>`, and they were
// therefore the only two rendering with ZERO gutters: the heading, the toolbar and the canvas's own
// rounded border all sat flush against the pane edges, so the border read as a crop rather than a
// frame. `<Page>` gives every other route 24-28px. Measured against `<main>`, which is the bounded
// pane itself (`flex:1; min-height:0; overflow-y:auto` in AppShell).
test.describe('canvas: the two Page-less screens keep their gutters', () => {
	test('/board is inset from the pane edges on desktop', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await markOnboarded(page);
		await gotoRoute(page, '/board');
		await seedFresh(page);
		await page.goto('/#/board', { waitUntil: 'domcontentloaded' });
		await waitReady(page);

		await expect(page.getByTestId('scene-board-bounded')).toBeVisible();
		const gaps = await page.evaluate(() => {
			const main = document.querySelector('#main-content') as HTMLElement;
			const canvas = document.querySelector('[data-testid="scene-board-bounded"]') as HTMLElement;
			const m = main.getBoundingClientRect();
			const c = canvas.getBoundingClientRect();
			return { left: c.left - m.left, right: m.right - c.right };
		});
		expect(gaps.left, 'the canvas must not touch the left pane edge').toBeGreaterThanOrEqual(8);
		expect(gaps.right, 'the canvas must not touch the right pane edge').toBeGreaterThanOrEqual(8);
	});

	// Adding the gutter must not re-introduce the overflow that the `height:'100%'` fix removed: the
	// root is `box-sizing: border-box`, so the padding comes OUT of the 100%, not on top of it.
	test('the gutter does not make /board overflow its pane', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await markOnboarded(page);
		await gotoRoute(page, '/board');
		await seedFresh(page);
		await page.goto('/#/board', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await expect(page.getByTestId('scene-board-bounded')).toBeVisible();
		await expect
			.poll(() =>
				page.evaluate(() => {
					const main = document.querySelector('#main-content') as HTMLElement;
					return main.scrollHeight - main.clientHeight;
				}),
			)
			.toBeLessThanOrEqual(1);
	});

	// PHONE IS DELIBERATELY EXEMPT, and this locks that decision in. The bounded canvas derives its
	// fit scale from the AVAILABLE WIDTH (`boundedScale` in SceneBoardCanvas), so on a 375px handset —
	// where that scale is already ~0.45 and the widget titles paint at ~6px — a gutter would buy
	// whitespace by shrinking content that has none to spare. It also measurably pushed the phone
	// board out of its own vertical scroll range, breaking the touch-scroll contract above.
	test('/board stays edge-to-edge on a phone so the fit scale is not spent on whitespace', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 375, height: 667 });
		await markOnboarded(page);
		await gotoRoute(page, '/board');
		await seedFresh(page);
		await page.goto('/#/board', { waitUntil: 'domcontentloaded' });
		await waitReady(page);

		await expect(page.getByTestId('scene-board-bounded')).toBeVisible();
		const gaps = await page.evaluate(() => {
			const main = document.querySelector('#main-content') as HTMLElement;
			const canvas = document.querySelector('[data-testid="scene-board-bounded"]') as HTMLElement;
			const m = main.getBoundingClientRect();
			const c = canvas.getBoundingClientRect();
			return { left: c.left - m.left, right: m.right - c.right };
		});
		expect(gaps.left).toBeLessThanOrEqual(1);
		expect(gaps.right).toBeLessThanOrEqual(1);
	});
});

// A side panel that CLOSES ITSELF — Escape, its own Close button, a successful Add, a saved
// metadata edit — unmounted the node holding focus, and the browser resets that to <body>. The next
// Tab then restarted the whole page at the skip link, and a screen-reader user was left with no
// context at all. Reclaim the opener, but only when focus really was stranded.
test.describe('canvas: a closing side panel gives focus back', () => {
	test('closing the /board Add panel returns focus to the Add toggle', async ({ page }) => {
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
		const addToggle = page.getByRole('button', { name: 'Add', exact: true });
		await addToggle.click();
		await expect(page.getByText('Add widget', { exact: true })).toBeVisible();

		// Focus is deep inside the panel when it goes away — the worst case for the browser's reset.
		await page.getByRole('button', { name: 'Close', exact: true }).focus();
		await page.keyboard.press('Escape');
		await expect(page.getByText('Add widget', { exact: true })).toHaveCount(0);

		await expect(addToggle).toBeFocused();
		expect(
			await page.evaluate(() => document.activeElement === document.body),
			'focus must not fall through to <body>',
		).toBe(false);
	});
});

// The selection ring was correctly moved from `box-shadow` to `outline` (forced-colors does not
// paint box-shadow), but it was written as `outline: selected ? … : 'none'` — an INLINE style, which
// beats the app's global `:focus-visible` rule. Every UNSELECTED frame therefore had its focus
// indicator suppressed, on the one surface whose whole navigation model is a roving tabindex across
// those frames (CANVAS-016 / WCAG 2.4.7).
test.describe('canvas: a focused widget frame is visibly focused', () => {
	test('an unselected frame does not pin outline:none and rings when focused', async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/board');
		await seedFresh(page);
		await page.goto('/#/board', { waitUntil: 'domcontentloaded' });
		await waitReady(page);

		const frame = page.locator('[data-testid^="widget-"]').first();
		await expect(frame).toBeVisible();

		// No inline suppression: the cascade has to be able to reach it.
		expect(await frame.evaluate((el: HTMLElement) => el.style.outline)).toBe('');

		// Walk the real keyboard path so `:focus-visible` genuinely applies — a programmatic
		// `.focus()` is exactly the case Chromium's heuristic can decline.
		await page.locator('#main-content').click({ position: { x: 2, y: 2 } });
		let landed = false;
		for (let i = 0; i < 40 && !landed; i += 1) {
			await page.keyboard.press('Tab');
			landed = await page.evaluate(() =>
				(document.activeElement?.getAttribute('data-testid') ?? '').startsWith('widget-'),
			);
		}
		expect(landed, 'Tab should reach a widget frame on /board').toBe(true);

		const ring = await page.evaluate(() => {
			const el = document.activeElement as HTMLElement;
			const s = getComputedStyle(el);
			return { style: s.outlineStyle, width: s.outlineWidth };
		});
		expect(ring.style).not.toBe('none');
		expect(ring.width).not.toBe('0px');
	});
});

// The dice widget's result was a bare <span> carrying an `aria-label`. `role=generic` PROHIBITS an
// accessible name, so the wording reached nobody — and mutating the text in place announced nothing,
// making the widget's entire output invisible to assistive tech.
test.describe('canvas: the GM Screen dice widget announces its result', () => {
	test('rolls into a live region that existed before the roll', async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/board');
		await seedFresh(page);
		await page.goto('/#/board', { waitUntil: 'domcontentloaded' });
		await waitReady(page);

		await goLive(page);

		const roll = page.getByRole('button', { name: /^Roll / });
		await expect(roll).toHaveCount(1);
		// A live region inserted TOGETHER with its text is routinely dropped, so it must pre-exist.
		const readout = page
			.locator('[data-testid^="widget-"]')
			.filter({ has: roll })
			.getByRole('status');
		await expect(readout).toHaveCount(1);
		await expect(readout).toHaveText('');

		await roll.click();
		await expect(readout).toHaveText(/Last result for .+ = \d+/);

		// The total is NOT mirrored into a second offscreen copy — only the descriptive prefix is
		// visually hidden. A duplicated copy would make `getByText` ambiguous across the whole app,
		// which is how a previous attempt at this fix broke unrelated specs.
		// Count the total IN ITS OWN POSITION (`= 15`), not as a bare substring: the readout reads
		// "Last result for 1d20 = 1", so a bare `split(total)` also matched the digits inside the
		// EXPRESSION and reported 2 whenever the roll came up 1, 2 or 20 — about one run in seven,
		// on whichever profile happened to roll it. That was a flake in the assertion, not a defect.
		const total = (await readout.textContent())!.match(/= (\d+)/)![1]!;
		const occurrences = await readout.evaluate(
			(el: HTMLElement, t: string) => (el.textContent ?? '').split(`= ${t}`).length - 1,
			total,
		);
		expect(occurrences).toBe(1);
		// And the visually-hidden prefix really does stop before the number.
		expect(await readout.locator('span').first().textContent()).not.toContain(`= ${total}`);
		const hidden = readout.locator('span').first();
		await expect(hidden).toHaveText(/Last result for/);
		expect(await hidden.evaluate((el: HTMLElement) => getComputedStyle(el).position)).toBe(
			'absolute',
		);
	});
});

// Start / Pause / Resume were three conditionally-rendered SIBLINGS. JSX gives each `{cond && …}`
// its own fixed child slot, so React could not reconcile Pause with Resume: pressing Pause destroyed
// the very button the user had just activated and dropped focus to <body>.
test.describe('canvas: the timer transport survives its own press', () => {
	test('keeps keyboard focus on the transport button across start and pause', async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/board');
		await seedFresh(page);
		await page.goto('/#/board', { waitUntil: 'domcontentloaded' });
		await waitReady(page);

		await goLive(page);

		const start = page.getByRole('button', { name: /^Start \d+-second timer$/ });
		await expect(start).toHaveCount(1);
		await start.focus();
		await start.press('Enter');

		const pause = page.getByRole('button', { name: 'Pause', exact: true });
		await expect(pause).toHaveCount(1);
		await expect(pause).toBeFocused();
		expect(
			await page.evaluate(() => document.activeElement === document.body),
			'focus must not fall through to <body>',
		).toBe(false);

		await pause.press('Enter');
		const resume = page.getByRole('button', { name: 'Resume', exact: true });
		await expect(resume).toHaveCount(1);
		await expect(resume).toBeFocused();
	});
});

// `/board`'s confirmation channel is a single `role="status"` host beside the toolbar. It was
// rendered PERMANENTLY (the comment beside it says why: a polite region inserted together with its
// text is routinely dropped) — but it collapsed with `display: 'none'`, which removes the node from
// the ACCESSIBILITY TREE entirely. So flipping to `inline-flex` WITH content was exactly the
// one-mutation insert the comment warns against, and every board confirmation was silent. It now
// collapses with `srOnly`: out of flow (no box, no parent gap) but still in the a11y tree.
test.describe('canvas: the GM Screen status region exists before it speaks', () => {
	test('announces a saved layout through a host that was already in the a11y tree', async ({
		page,
	}) => {
		await markOnboarded(page);
		await gotoRoute(page, '/board');
		await seedFresh(page);
		await page.goto('/#/board', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await goLive(page);

		const status = page.getByTestId('board-status');
		// Present and EMPTY before any write — `display:none` would have made this 0.
		await expect(status).toHaveCount(1);
		await expect(status).toHaveText('');
		expect(await status.evaluate((el: HTMLElement) => getComputedStyle(el).display)).not.toBe(
			'none',
		);
		// And it costs the layout nothing while empty: out of flow, so it is not a flex item and
		// contributes no parent `gap` to the bounded canvas below it.
		expect(await status.evaluate((el: HTMLElement) => getComputedStyle(el).position)).toBe(
			'absolute',
		);

		await page.getByRole('button', { name: 'Edit layout' }).click();
		await page.getByRole('button', { name: 'Layouts', exact: true }).click();
		const name = `Combat night ${Date.now()}`;
		await page.getByLabel('Layout name').fill(name);
		await page.getByRole('button', { name: 'Save', exact: true }).click();

		// Same node, new text — the mutation a screen reader can actually hear.
		await expect(status).toHaveText(new RegExp(`${name}.*saved`));
		expect(await status.evaluate((el: HTMLElement) => getComputedStyle(el).position)).not.toBe(
			'absolute',
		);
	});
});

// The bounded GM Screen FITS its authored extent into the viewport, so every control inside it is
// painted through a `scale()` well below 1 on a handset. `styles/index.css` already compensated the
// widget operation chips for that transform — but the rule was gated to `html[data-android]`, and the
// fit scale applies on EVERY profile. On iOS and mobile web the chips inherited a flat 2rem and then
// shrank with the board, landing at ~15px on screen: below any touch floor, on the app's home
// dashboard. The compensation is now `density-target / scale`, ungated, which leaves desktop (scale 1)
// at exactly the value the chip's own fallback chain already resolved.
test.describe('canvas: board operation chips survive the bounded fit scale', () => {
	test('the dice chip keeps a density-sized hit area on a phone-width board', async ({ page }) => {
		await page.setViewportSize({ width: 393, height: 851 });
		await markOnboarded(page);
		await gotoRoute(page, '/board');
		await seedFresh(page);
		await page.goto('/#/board', { waitUntil: 'domcontentloaded' });
		await waitReady(page);

		const board = page.getByTestId('scene-board-bounded');
		await expect(board).toBeVisible();

		// Establish the precondition this fix exists for, rather than assuming it: the layer really is
		// scaled down. Without this the size assertion below could pass for the wrong reason.
		const scale = await board.evaluate((el) => {
			const layer = el.querySelector('[style*="--scene-board-scale"]') as HTMLElement | null;
			return Number(layer?.style.getPropertyValue('--scene-board-scale') ?? '1');
		});
		expect(scale).toBeGreaterThan(0);
		expect(scale, 'the phone board should be fitted, not 1:1').toBeLessThan(0.8);

		const roll = page.getByRole('button', { name: /^Roll / });
		await expect(roll).toHaveCount(1);
		const box = (await roll.boundingBox())!;
		// boundingBox() is the TRANSFORMED rect, i.e. what the finger actually gets. 2rem/scale declared
		// x scale painted == 2rem. Before the fix this measured ~15px at this viewport.
		expect(
			box.height,
			`chip painted at ${box.height}px under scale ${scale}`,
		).toBeGreaterThanOrEqual(30);
	});
});

// The /scenes create form derived its "✓ Saved" tick from `runtime.lastLifecycle` — GLOBAL runtime
// state that outlives the screen. So a scene created anywhere in the app (⌘K, the hub, a previous
// visit) left an untouched, empty form wearing a green success tick, claiming work it had not done.
// The tick is now the outcome of THIS form's own submit, it names the scene it saved, it retires when
// the next draft starts, and it surfaces the rejection reason instead of swallowing it.
test.describe('scenes: the create form only claims its own saves', () => {
	test('a scene created elsewhere leaves the untouched form with no success tick', async ({
		page,
	}) => {
		await markOnboarded(page);
		await gotoRoute(page, '/scenes');
		await seedFresh(page);
		await page.goto('/#/scenes', { waitUntil: 'domcontentloaded' });
		await waitReady(page);

		const feedback = page.getByTestId('scene-create-feedback');
		// Present and EMPTY before any submit: a permanent host, so the later text change is the one
		// mutation a screen reader hears.
		await expect(feedback).toHaveCount(1);
		await expect(feedback).toHaveText('');

		// Create a scene WITHOUT touching this form — exactly what ⌘K "New scene" or the hub does.
		const elsewhere = `Elsewhere ${Date.now()}`;
		const created = await dispatch(page, {
			type: 'scene.create',
			actorId: await page.evaluate(() => window.__rt!.defaultActorId),
			payload: { name: elsewhere, description: '', visibility: 'dm-only', tags: [] },
		});
		expect(created.status).toBe('accepted');
		await expect(page.getByRole('button', { name: elsewhere })).not.toHaveCount(0);

		// The form said nothing, because the form did nothing.
		await expect(feedback).toHaveText('');
	});

	test('submitting the form reports the scene it saved, then retires on the next draft', async ({
		page,
	}) => {
		await markOnboarded(page);
		await gotoRoute(page, '/scenes');
		await seedFresh(page);
		await page.goto('/#/scenes', { waitUntil: 'domcontentloaded' });
		await waitReady(page);

		// `Create scene` is a SUBSTRING of the SceneCardsPanel's `Create scene card` on this same
		// route, and `Name` of its `Name` field — both need exact matching here.
		const mine = `Mine ${Date.now()}`;
		await page.getByLabel('Name', { exact: true }).first().fill(mine);
		await page.getByRole('button', { name: 'Create scene', exact: true }).click();

		const feedback = page.getByTestId('scene-create-feedback');
		// It names the scene rather than a bare "Saved", so the confirmation is checkable.
		await expect(feedback).toHaveText(new RegExp(mine));

		// Starting the next draft retires it — the tick can never sit above a form it does not describe.
		await page.getByLabel('Name', { exact: true }).first().fill('A');
		await expect(feedback).toHaveText('');
	});
});
