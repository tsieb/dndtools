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
