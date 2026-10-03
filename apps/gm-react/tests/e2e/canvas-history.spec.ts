import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded, preferPhoneCanvas, seedFresh, waitReady } from './_helpers';

/**
 * RC-CAN-8.1 — the canvas draws exactly what the history says.
 *
 * A drop the board clamps (past its right edge) commits a layout that is not where the pointer let
 * go. The pointer draft used to outlive that commit, so Undo rewound the core — and the layout-issues
 * banner — while the frame stayed where it had been dropped. And a run of arrow-key nudges was one
 * undo step per press, so Ctrl+Z after a keyboard move reversed only its last step.
 */

test.beforeEach(async ({ page }) => preferPhoneCanvas(page));

async function openBoard(page: Page): Promise<{ sceneId: string; widgetId: string }> {
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
	const sceneId = (await handle.jsonValue()) as string;
	const widgetId = await page.evaluate(
		(id) => window.__rt!.state.scenes.scenes[id].widgets[0].id,
		sceneId,
	);
	await page.getByRole('button', { name: 'Edit layout' }).click();
	await expect(page.getByTestId('canvas-history-controls')).toBeVisible();
	return { sceneId, widgetId };
}

const layoutOf = (page: Page, sceneId: string, widgetId: string) =>
	page.evaluate(
		(args) => {
			const w = window.__rt!.state.scenes.scenes[args.sceneId].widgets.find(
				(x) => x.id === args.widgetId,
			)!;
			return { x: w.layout.x, y: w.layout.y };
		},
		{ sceneId, widgetId },
	);

/**
 * Pixels that differ between two PNG captures. Decoded in the page's own canvas (the suite ships no
 * PNG decoder). A pixel counts when a channel moves by more than `tolerance` — Chromium re-rasters
 * anti-aliased curves (the board's rounded corners, the selection ring) a value or two apart between
 * otherwise identical frames, the noise Playwright's own screenshot comparator thresholds away too.
 */
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

/**
 * Axe over the edited canvas, tile bodies included. One finding is the body's, not this surface's: a
 * body whose text overflows its tile is a scroll region, and in edit mode the frame owns the keys, so
 * `WidgetRenderSlot` takes that region out of the tab order and axe reports
 * `scrollable-region-focusable` on it (the phone's Prep tile) — with or without any move. Only that
 * rule, and only on a body region itself, is let through here; the same bodies are then scanned with
 * no exception at all in VIEW mode (`expectBoardAxeClean`).
 */
async function expectCanvasAxeClean(page: Page) {
	const result = await new AxeBuilder({ page })
		.include('[data-testid="scene-board-bounded"]')
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
		.analyze();
	const isBodyRegion = (selector: string) =>
		page.evaluate(
			(css) => document.querySelector(css)?.matches('[data-widget-region]') ?? false,
			selector,
		);
	const remaining = [];
	for (const violation of result.violations) {
		const targets = violation.nodes.map((node) => String(node.target.at(-1)));
		const bodyOnly =
			violation.id === 'scrollable-region-focusable' &&
			(await Promise.all(targets.map(isBodyRegion))).every(Boolean);
		if (!bodyOnly) remaining.push(violation);
	}
	expect(remaining).toEqual([]);
	await page.getByRole('button', { name: 'Done', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Edit layout' })).toBeVisible();
	await expectBoardAxeClean(page);
}

/** The whole board, bodies included, back in view mode. */
async function expectBoardAxeClean(page: Page) {
	const result = await new AxeBuilder({ page })
		.include('[data-testid="scene-board-bounded"]')
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
		.analyze();
	expect(result.violations).toEqual([]);
}

test.describe('canvas history: the frame follows the layout', () => {
	test('drag past the edge, Undo: the board is pixel-identical to before the drag', async ({
		page,
	}) => {
		const { sceneId, widgetId } = await openBoard(page);
		const board = page.getByTestId('scene-board-bounded');
		const frame = page.getByTestId(`widget-${widgetId}`);
		const start = await layoutOf(page, sceneId, widgetId);

		// Select the tile first (a press with no movement commits nothing), so the "before" capture
		// carries the same selection ring the drag leaves behind.
		await frame.click();
		await expect(
			page.getByTestId('canvas-history-controls').getByRole('button', { name: /^Undo/ }),
		).toBeDisabled();
		await page.mouse.move(1, 1);
		// The Undo/Redo cluster is masked: its enabled state is exactly what MUST differ afterwards.
		const capture = () =>
			board.screenshot({
				animations: 'disabled',
				caret: 'hide',
				mask: [page.getByTestId('canvas-history-controls')],
			});
		const before = await capture();

		const box = (await frame.boundingBox())!;
		await page.mouse.move(box.x + box.width / 2, box.y + 12);
		await page.mouse.down();
		await page.mouse.move(box.x + box.width / 2 + 4000, box.y + 12, { steps: 6 });
		await page.mouse.up();
		await expect.poll(async () => (await layoutOf(page, sceneId, widgetId)).x).not.toBe(start.x);
		// The frame lands on the committed (clamped) layout, not on the pointer's drop point.
		const committed = await layoutOf(page, sceneId, widgetId);
		await expect
			.poll(() => frame.evaluate((el) => parseFloat((el as HTMLElement).style.left)))
			.toBe(committed.x);

		await page
			.getByTestId('canvas-history-controls')
			.getByRole('button', { name: /^Undo/ })
			.click();
		await expect.poll(() => layoutOf(page, sceneId, widgetId)).toEqual(start);
		await expect(page.getByTestId('board-layout-banner')).toHaveCount(0);
		await page.mouse.move(1, 1);

		// The screenshot diff against the pre-drag capture is empty.
		await expect
			.poll(async () => differingPixels(page, before, await capture()), { timeout: 10_000 })
			.toBe(0);
		await expectCanvasAxeClean(page);
	});

	test('a keyboard move, Escape, then Ctrl+Z restores the whole move', async ({ page }) => {
		const { sceneId, widgetId } = await openBoard(page);
		const frame = page.getByTestId(`widget-${widgetId}`);
		const start = await layoutOf(page, sceneId, widgetId);

		await frame.focus();
		await page.keyboard.press('Space');
		await page.keyboard.press('ArrowDown');
		await page.keyboard.press('ArrowDown');
		await page.keyboard.press('ArrowDown');
		// Escape straight away, while the nudges may still be queued behind the vault persist: each
		// belongs to the burst it was pressed in, not to whatever is open when its turn comes.
		await page.keyboard.press('Escape');
		await expect
			.poll(() => layoutOf(page, sceneId, widgetId))
			.toEqual({
				x: start.x,
				y: start.y + 60,
			});
		await expect(frame).toBeFocused();

		// One burst, one step: Ctrl+Z from the focused frame undoes all three nudges.
		await page.keyboard.press('Control+z');
		await expect.poll(() => layoutOf(page, sceneId, widgetId)).toEqual(start);
		await expect
			.poll(() =>
				frame.evaluate((el) => ({
					x: parseFloat((el as HTMLElement).style.left),
					y: parseFloat((el as HTMLElement).style.top),
				})),
			)
			.toEqual(start);
		await expect(
			page.getByTestId('canvas-history-controls').getByRole('button', { name: /^Undo/ }),
		).toBeDisabled();
		// The frame's name reads the restored layout.
		await expect(frame).toHaveAttribute(
			'aria-label',
			new RegExp(`position ${start.x}, ${start.y}, size \\d+ by \\d+$`),
		);
		await expectCanvasAxeClean(page);
	});
});
