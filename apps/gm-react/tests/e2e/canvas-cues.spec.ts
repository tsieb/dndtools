import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
	dispatch,
	gotoRoute,
	markOnboarded,
	preferPhoneCanvas,
	seedFresh,
	waitReady,
} from './_helpers';

/**
 * RC-CAN-8.3 — direct manipulation cues.
 *
 * Edit mode used to change only the cursor: a hovered tile was pixel-identical to a resting one, a
 * right-click or a long-press did nothing, a drag showed no guides, and a flow screen reordered only
 * through its "…" menu while its Undo/Redo cluster floated over the last tile on a phone. This
 * suite runs on both profiles and checks each cue in a real browser.
 */

test.beforeEach(async ({ page }) => preferPhoneCanvas(page));

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function openBoard(page: Page): Promise<{ sceneId: string; widgetIds: string[] }> {
	await markOnboarded(page);
	await gotoRoute(page, '/board');
	await seedFresh(page);
	await page.goto('/#/board', { waitUntil: 'domcontentloaded' });
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
	const widgetIds = await page.evaluate(
		(id) => window.__rt!.state.scenes.scenes[id].widgets.map((w) => w.id),
		sceneId,
	);
	await page.getByRole('button', { name: 'Edit layout' }).click();
	await expect(page.getByTestId('canvas-history-controls')).toBeVisible();
	return { sceneId, widgetIds };
}

/** Pixels that differ between two PNG captures, decoded in the page (the suite ships no decoder). */
async function differingPixels(page: Page, a: Buffer, b: Buffer, tolerance = 8): Promise<number> {
	return page.evaluate(
		async ({ a, b, tolerance }) => {
			const decode = async (base64: string) => {
				const bitmap = await createImageBitmap(
					await (await fetch(`data:image/png;base64,${base64}`)).blob(),
				);
				const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
				const context = canvas.getContext('2d')!;
				context.drawImage(bitmap, 0, 0);
				return context.getImageData(0, 0, bitmap.width, bitmap.height);
			};
			const [x, y] = await Promise.all([decode(a), decode(b)]);
			if (x.width !== y.width || x.height !== y.height) return Number.POSITIVE_INFINITY;
			let count = 0;
			for (let i = 0; i < x.data.length; i += 4) {
				for (let c = 0; c < 3; c += 1) {
					if (Math.abs(x.data[i + c]! - y.data[i + c]!) > tolerance) {
						count += 1;
						break;
					}
				}
			}
			return count;
		},
		{ a: a.toString('base64'), b: b.toString('base64'), tolerance },
	);
}

/** Axe over the edited board. Tile bodies are scanned too; only the known body finding is let
 *  through (`canvas-history.spec.ts` explains it: an overflowing body in edit mode). */
async function expectBoardAxeClean(page: Page) {
	const result = await new AxeBuilder({ page })
		.include('[data-testid="scene-board-bounded"]')
		.withTags(AXE_TAGS)
		.analyze();
	const remaining = [];
	for (const violation of result.violations) {
		const bodyOnly =
			violation.id === 'scrollable-region-focusable' &&
			(
				await Promise.all(
					violation.nodes.map((node) =>
						page.evaluate(
							(css) => document.querySelector(css)?.matches('[data-widget-region]') ?? false,
							String(node.target.at(-1)),
						),
					),
				)
			).every(Boolean);
		if (!bodyOnly) remaining.push(violation);
	}
	expect(remaining).toEqual([]);
}

/** A touch held still for `ms`, through CDP: Playwright's touchscreen only taps. */
async function longPress(page: Page, x: number, y: number, ms = 800) {
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
	await page.waitForTimeout(ms);
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	await cdp.detach();
}

test.describe('canvas cues on the board', () => {
	test('hovering an edited tile lifts it, and the grip sits in its title bar', async ({ page }) => {
		const { widgetIds } = await openBoard(page);
		const frame = page.getByTestId(`widget-${widgetIds[0]}`);
		await expect(frame.getByTestId('tile-grip')).toBeVisible();

		const box = (await frame.boundingBox())!;
		// Room for the outline and the shadow, and for the 2px rise.
		const clip = {
			x: Math.max(0, box.x - 12),
			y: Math.max(0, box.y - 12),
			width: box.width + 24,
			height: box.height + 24,
		};
		const capture = () => page.screenshot({ clip, animations: 'disabled', caret: 'hide' });
		await page.mouse.move(1, 1);
		const rest = await capture();
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		await expect(frame).not.toHaveCSS('box-shadow', 'none');
		const hovered = await capture();
		expect(await differingPixels(page, rest, hovered)).toBeGreaterThan(0);

		// And back: leaving the tile puts it down again.
		await page.mouse.move(1, 1);
		await expect(frame).toHaveCSS('box-shadow', 'none');
		await expect
			.poll(async () => differingPixels(page, rest, await capture()), { timeout: 10_000 })
			.toBe(0);
	});

	test('a right-click opens the tile menu at the pointer, and the menu is axe-clean', async ({
		page,
	}) => {
		const { widgetIds } = await openBoard(page);
		const frame = page.getByTestId(`widget-${widgetIds[0]}`);
		const box = (await frame.boundingBox())!;
		const at = { x: Math.round(box.x + box.width * 0.4), y: Math.round(box.y + box.height * 0.6) };
		await page.mouse.click(at.x, at.y, { button: 'right' });

		const menu = page.getByTestId('tile-actions-menu');
		await expect(menu).toBeVisible();
		await expect(menu.getByRole('menuitem', { name: 'Duplicate' })).toBeVisible();
		const viewport = page.viewportSize()!;
		const panel = (await menu.boundingBox())!;
		// Opened rightwards from the pointer, unless that would run off the right edge.
		expect(
			Math.abs(panel.x - Math.max(8, Math.min(at.x, viewport.width - panel.width - 8))),
		).toBeLessThan(2);
		expect(panel.x + panel.width).toBeLessThanOrEqual(viewport.width);
		const menuScan = await new AxeBuilder({ page })
			.include('[data-testid="tile-actions-menu"]')
			.withTags(AXE_TAGS)
			.analyze();
		expect(menuScan.violations).toEqual([]);

		await page.keyboard.press('Escape');
		await expect(menu).toBeHidden();
		await expectBoardAxeClean(page);
	});

	test('a long-press opens the tile menu at the finger and leaves the tile where it was', async ({
		page,
	}, testInfo) => {
		test.skip(!testInfo.project.use.hasTouch, 'a touch gesture needs a touch profile');
		const { sceneId, widgetIds } = await openBoard(page);
		const before = await page.evaluate(
			([s, w]) => window.__rt!.state.scenes.scenes[s].widgets.find((x) => x.id === w)!.layout,
			[sceneId, widgetIds[0]] as const,
		);
		const box = (await page.getByTestId(`widget-${widgetIds[0]}`).boundingBox())!;
		await longPress(page, Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2));
		await expect(page.getByTestId('tile-actions-menu')).toBeVisible();
		const after = await page.evaluate(
			([s, w]) => window.__rt!.state.scenes.scenes[s].widgets.find((x) => x.id === w)!.layout,
			[sceneId, widgetIds[0]] as const,
		);
		expect(after).toEqual(before);
	});

	test('a drag shows snap guides and distance hints, and the selection chip stays inside its tile', async ({
		page,
	}) => {
		const { widgetIds } = await openBoard(page);
		const frame = page.getByTestId(`widget-${widgetIds[0]}`);
		const box = (await frame.boundingBox())!;
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		await page.mouse.down();
		// A short drag along the top row: the tile still shares its top edge with its neighbours.
		await page.mouse.move(box.x + box.width / 2 + 6, box.y + box.height / 2, { steps: 3 });
		// The layer itself is a zero-size origin in board units; its lines and labels are what show.
		const guides = page.getByTestId('canvas-drag-guides');
		await expect(guides.locator('[data-guide]').first()).toBeVisible();
		await expect(guides.locator('[data-gap]').first()).toBeVisible();
		await expect(frame).toHaveCSS('box-shadow', /.+/);
		await page.mouse.up();
		await expect(guides).toHaveCount(0);

		// The chip of the now-selected tile is drawn inside the frame, not over the canvas edge.
		const chip = frame.getByTestId('tile-selection-chip');
		await expect(chip).toBeVisible();
		const [c, f] = [(await chip.boundingBox())!, (await frame.boundingBox())!];
		expect(c.x).toBeGreaterThanOrEqual(f.x);
		expect(c.y).toBeGreaterThanOrEqual(f.y);
		expect(c.x + c.width).toBeLessThanOrEqual(f.x + f.width + 1);
		expect(c.y + c.height).toBeLessThanOrEqual(f.y + f.height + 1);
	});
});

/** The home scene on the flow policy with its first two tiles side by side (6 + 6 of twelve). */
async function openFlowScene(
	page: Page,
): Promise<{ sceneId: string; first: string; second: string }> {
	await markOnboarded(page);
	await gotoRoute(page, '/');
	await seedFresh(page);
	// `command-center.ensure-home` resolves after `waitReady`; fall back to any authored scene, as
	// `flow-layout.spec.ts` does.
	const handle = await page.waitForFunction(() => {
		const state = window.__rt!.state;
		return (
			state.commandCenter.homeSceneId ??
			Object.values(state.scenes.scenes).find((s) => !s.isTemplate)?.id ??
			null
		);
	});
	const sceneId = (await handle.jsonValue()) as string;
	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	const policy = await dispatch(page, {
		type: 'scene.set-layout-policy',
		actorId,
		payload: { sceneId, layoutPolicy: 'flow' },
	});
	expect(policy.status, JSON.stringify(policy)).toBe('accepted');
	const ids = await page.evaluate((id) => {
		const scene = window.__rt!.state.scenes.scenes[id];
		return [...scene.widgets]
			.sort((a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x)
			.map((w) => w.id);
	}, sceneId);
	for (const [index, widgetInstanceId] of ids.slice(0, 2).entries()) {
		const moved = await dispatch(page, {
			type: 'scene.move-widget',
			actorId,
			payload: { sceneId, widgetInstanceId, x: index * 6 * 96, y: 0 },
		});
		expect(moved.status, JSON.stringify(moved)).toBe('accepted');
	}
	await gotoRoute(page, `/scene/${sceneId}`);
	await expect(page.getByTestId('scene-board-flow')).toBeVisible();
	await page.getByRole('button', { name: 'Edit layout' }).click();
	await expect(page.getByTestId('flow-history-controls')).toBeVisible();
	return { sceneId, first: ids[0]!, second: ids[1]! };
}

const domOrder = (page: Page) =>
	page
		.locator('[data-flow-index]')
		.evaluateAll((nodes) =>
			nodes.map((n) => n.getAttribute('data-testid')!.replace('widget-', '')),
		);

const durableOrder = (page: Page, sceneId: string) =>
	page.evaluate((id) => {
		const scene = window.__rt!.state.scenes.scenes[id];
		return [...scene.widgets]
			.sort(
				(a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x || a.id.localeCompare(b.id),
			)
			.map((w) => w.id);
	}, sceneId);

test.describe('canvas cues on a flow screen', () => {
	test('a drag by the grip shows a drop indicator, reorders, and Undo restores', async ({
		page,
	}, testInfo) => {
		const { sceneId, first, second } = await openFlowScene(page);
		expect((await domOrder(page)).slice(0, 2)).toEqual([first, second]);

		const grip = page.getByTestId(`widget-${first}`).getByTestId('tile-grip');
		await expect(grip).toBeVisible();
		const g = (await grip.boundingBox())!;
		const from = { x: g.x + g.width / 2, y: g.y + g.height / 2 };
		const indicator = page.getByTestId(`widget-${second}`).getByTestId('flow-drop-indicator');
		// Near the target's top: on a phone the scene editor's details sheet covers the lower half of
		// the screen, and a drop lands on whatever is under the finger.
		const centre = async () => {
			const box = (await page.getByTestId(`widget-${second}`).boundingBox())!;
			return { x: box.x + box.width / 2, y: box.y + Math.min(box.height / 2, 32) };
		};
		if (testInfo.project.use.hasTouch) {
			// The phone path: a finger on the grip, which is `touch-action: none` where the rest of
			// the tile scrolls the screen. A touch selects only on a tap, so no Inspector covers the
			// tiles mid-drag.
			const cdp = await page.context().newCDPSession(page);
			const touch = (type: string, at?: { x: number; y: number }) =>
				cdp.send('Input.dispatchTouchEvent', {
					type: type as 'touchStart',
					touchPoints: at ? [{ x: Math.round(at.x), y: Math.round(at.y) }] : [],
				});
			await touch('touchStart', from);
			const to = await centre();
			for (let step = 1; step <= 12; step += 1) {
				await touch('touchMove', {
					x: from.x + ((to.x - from.x) * step) / 12,
					y: from.y + ((to.y - from.y) * step) / 12,
				});
			}
			await expect(indicator).toBeVisible();
			await expect(indicator).toHaveAttribute('data-side', 'after');
			await touch('touchEnd');
			await cdp.detach();
			await expect(page.getByTestId('widget-inspector')).toHaveCount(0);
		} else {
			await page.mouse.move(from.x, from.y);
			await page.mouse.down();
			// The press selects, which opens the Inspector beside the board and reflows the grid:
			// measure the target only after that.
			await expect(page.getByTestId('widget-inspector')).toBeVisible();
			const to = await centre();
			await page.mouse.move(to.x, to.y, { steps: 12 });
			await expect(indicator).toBeVisible();
			await expect(indicator).toHaveAttribute('data-side', 'after');
			await page.mouse.up();
		}
		await expect(page.getByTestId('flow-drop-indicator')).toHaveCount(0);

		await expect.poll(async () => (await domOrder(page)).slice(0, 2)).toEqual([second, first]);
		expect((await durableOrder(page, sceneId)).slice(0, 2)).toEqual([second, first]);

		// Undo from the docked toolbar: the same `scene.move-widget` the menu dispatches, undone.
		await page.getByTestId('flow-history-controls').getByRole('button', { name: /^Undo/ }).click();
		await expect.poll(async () => (await domOrder(page)).slice(0, 2)).toEqual([first, second]);
		expect((await durableOrder(page, sceneId)).slice(0, 2)).toEqual([first, second]);
	});

	test('the history toolbar is docked above the tiles and never covers the last one', async ({
		page,
	}) => {
		await openFlowScene(page);
		const board = page.getByTestId('scene-board-flow');
		const toolbar = page.getByRole('toolbar', { name: 'Layout history' });
		await expect(toolbar).toBeVisible();
		const tiles = page.locator('[data-flow-index]');
		const firstTile = (await tiles.first().boundingBox())!;
		expect(
			(await toolbar.boundingBox())!.y + (await toolbar.boundingBox())!.height,
		).toBeLessThanOrEqual(firstTile.y);

		await board.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
		const last = tiles.last();
		await expect(last).toBeInViewport();
		const [t, l] = [(await toolbar.boundingBox())!, (await last.boundingBox())!];
		const overlaps =
			t.y < l.y + l.height && l.y < t.y + t.height && t.x < l.x + l.width && l.x < t.x + t.width;
		expect(overlaps, 'the toolbar overlaps the last tile').toBe(false);
	});

	test('a right-click opens the flow tile menu, and the edited screen is axe-clean', async ({
		page,
	}) => {
		const { first } = await openFlowScene(page);
		const tile = page.getByTestId(`widget-${first}`);
		const box = (await tile.boundingBox())!;
		await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
		const menu = page.getByTestId('flow-tile-menu');
		await expect(menu).toBeVisible();
		await expect(menu.getByRole('menuitem', { name: 'Move forward' })).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(menu).toBeHidden();

		const scan = await new AxeBuilder({ page })
			.include('[data-testid="scene-board-flow"]')
			.withTags([...AXE_TAGS, 'best-practice'])
			.analyze();
		expect(scan.violations).toEqual([]);
	});
});
