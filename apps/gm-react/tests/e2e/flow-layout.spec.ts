import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

/**
 * RC-CAN-7.7 / ADR-041 — the FLOW layout policy.
 *
 * The three things the policy claims and this suite checks against a real browser: a two-column
 * desktop arrangement reproduces and then REFLOWS at rail and phone; a keyboard reorder dispatches
 * the same durable move a drag does and survives a reload; and no tile clips its content at any
 * tier.
 *
 * Column geometry mirrors `app/board-helpers.ts` — 12 columns at desktop, 6 at rail, 1 at phone,
 * 96 durable px per column. A test that hard-codes a width instead of deriving it from these would
 * pass for the wrong reason the day the grid is retuned.
 */
const COLUMN_STEP = 96;
const HALF_WIDTH = 6 * COLUMN_STEP;

interface FlowFixture {
	sceneId: string;
	/** The two tiles placed side by side on the first row, in reading order. */
	first: string;
	second: string;
}

/**
 * Take the vault's home scene, switch it to the flow policy, and lay its first two widgets out as
 * a two-column row (spans 6 + 6 of twelve). Everything is dispatched through the core, so the
 * fixture is exactly the durable state a GM would have authored.
 *
 * `command-center.ensure-home` resolves asynchronously AFTER `waitReady`, so the home scene is
 * waited for rather than read in a one-shot evaluate — the race canvas.spec.ts documents.
 */
async function seedFlowScene(page: Page): Promise<FlowFixture> {
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
	const sceneId = await page.evaluate(() => {
		const state = window.__rt!.state as unknown as {
			commandCenter: { homeSceneId: string | null };
			scenes: { scenes: Record<string, { id: string; isTemplate?: boolean }> };
		};
		return (
			state.commandCenter.homeSceneId ??
			Object.values(state.scenes.scenes).find((s) => !s.isTemplate)!.id
		);
	});

	const policy = await dispatch(page, {
		type: 'scene.set-layout-policy',
		actorId: await page.evaluate(() => window.__rt!.defaultActorId),
		payload: { sceneId, layoutPolicy: 'flow' },
	});
	expect(policy.status, JSON.stringify(policy)).toBe('accepted');

	const widgetIds = await page.evaluate((id) => {
		const scene = window.__rt!.state.scenes.scenes[id];
		return [...scene.widgets]
			.sort((a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x)
			.map((w) => w.id);
	}, sceneId);
	expect(widgetIds.length, 'the seeded home scene should carry widgets').toBeGreaterThanOrEqual(2);
	const [first, second] = widgetIds;

	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	for (const [index, widgetInstanceId] of [first, second].entries()) {
		const moved = await dispatch(page, {
			type: 'scene.move-widget',
			actorId,
			payload: { sceneId, widgetInstanceId, x: index * HALF_WIDTH, y: 0 },
		});
		expect(moved.status, JSON.stringify(moved)).toBe('accepted');
		const resized = await dispatch(page, {
			type: 'scene.resize-widget',
			actorId,
			payload: { sceneId, widgetInstanceId, w: HALF_WIDTH, h: 220 },
		});
		expect(resized.status, JSON.stringify(resized)).toBe('accepted');
	}
	return { sceneId, first, second };
}

/** Widget instance ids in the order the tiles appear in the DOM — flow's reading order. */
async function domOrder(page: Page): Promise<string[]> {
	return page
		.locator('[data-flow-index]')
		.evaluateAll((nodes) =>
			nodes.map((node) => node.getAttribute('data-testid')?.replace('widget-', '') ?? ''),
		);
}

/** The durable reading order the core holds: `(y, x)`, the same key `flowOrder` sorts on. */
async function durableOrder(page: Page, sceneId: string): Promise<string[]> {
	return page.evaluate((id) => {
		const scene = window.__rt!.state.scenes.scenes[id];
		return [...scene.widgets]
			.sort(
				(a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x || a.id.localeCompare(b.id),
			)
			.map((w) => w.id);
	}, sceneId);
}

test.describe('flow layout policy', () => {
	test('reproduces a two-column arrangement at desktop and reflows at rail and phone', async ({
		page,
	}) => {
		await markOnboarded(page);
		await gotoRoute(page, '/');
		await seedFresh(page);
		const { sceneId, first, second } = await seedFlowScene(page);

		await page.setViewportSize({ width: 1280, height: 900 });
		await gotoRoute(page, `/scene/${sceneId}`);
		const board = page.getByTestId('scene-board-flow');
		await expect(board).toBeVisible();
		await expect(board).toHaveAttribute('data-flow-columns', '12');

		const left = page.getByTestId(`widget-${first}`);
		const right = page.getByTestId(`widget-${second}`);
		await expect(left).toBeVisible();
		await expect(right).toBeVisible();

		// Two columns: the same row, side by side.
		const deskLeft = (await left.boundingBox())!;
		const deskRight = (await right.boundingBox())!;
		expect(Math.abs(deskLeft.y - deskRight.y)).toBeLessThan(2);
		expect(deskRight.x).toBeGreaterThan(deskLeft.x + deskLeft.width - 2);

		// Rail: six columns, and a half-width desktop tile now fills its own row.
		await page.setViewportSize({ width: 900, height: 900 });
		await expect(board).toHaveAttribute('data-flow-columns', '6');
		const railLeft = (await left.boundingBox())!;
		const railRight = (await right.boundingBox())!;
		expect(railRight.y, 'the second tile reflows below the first at rail').toBeGreaterThan(
			railLeft.y + railLeft.height - 2,
		);
		expect(Math.abs(railLeft.width - railRight.width)).toBeLessThan(2);

		// Phone: one column, and every control the desktop tier had is still there.
		await page.setViewportSize({ width: 375, height: 700 });
		await expect(board).toHaveAttribute('data-flow-columns', '1');
		const phoneLeft = (await left.boundingBox())!;
		const phoneRight = (await right.boundingBox())!;
		expect(phoneRight.y).toBeGreaterThan(phoneLeft.y + phoneLeft.height - 2);
		expect(Math.abs(phoneLeft.x - phoneRight.x)).toBeLessThan(2);

		await page.getByRole('button', { name: 'Edit layout' }).click();
		await expect(page.getByTestId('flow-tile-actions').first()).toBeVisible();
		await expect(page.getByRole('radio', { name: 'Flow' })).toBeVisible();
	});

	test('a keyboard reorder dispatches a durable move and survives a reload', async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/');
		await seedFresh(page);
		const { sceneId, first, second } = await seedFlowScene(page);

		await gotoRoute(page, `/scene/${sceneId}`);
		await expect(page.getByTestId('scene-board-flow')).toBeVisible();
		expect((await domOrder(page)).slice(0, 2)).toEqual([first, second]);

		await page.getByRole('button', { name: 'Edit layout' }).click();

		// Focus the first tile, select it, then move it one place later.
		const tile = page.getByTestId(`widget-${first}`);
		await tile.focus();
		await page.keyboard.press('Enter');
		await page.keyboard.press('ArrowRight');

		// The move is announced, so a screen-reader user is told where the tile landed.
		await expect(page.getByTestId('flow-announcement')).toContainText('position 2 of');

		// The DOM order — which is also the reading and focus order — followed the layout.
		await expect.poll(async () => (await domOrder(page)).slice(0, 2)).toEqual([second, first]);
		// And so did the durable core state: the reorder is a real `scene.move-widget`.
		expect((await durableOrder(page, sceneId)).slice(0, 2)).toEqual([second, first]);

		// Focus stays on the tile that moved, so a second press continues the same gesture.
		await expect(tile).toBeFocused();

		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await expect(page.getByTestId('scene-board-flow')).toBeVisible();
		expect((await domOrder(page)).slice(0, 2)).toEqual([second, first]);
	});

	test('a drag and a menu row move a tile through the same command the keyboard does', async ({
		page,
	}) => {
		await markOnboarded(page);
		await gotoRoute(page, '/');
		await seedFresh(page);
		const { sceneId, first, second } = await seedFlowScene(page);
		await page.setViewportSize({ width: 1280, height: 900 });
		await gotoRoute(page, `/scene/${sceneId}`);
		await expect(page.getByTestId('scene-board-flow')).toBeVisible();
		await page.getByRole('button', { name: 'Edit layout' }).click();
		expect((await domOrder(page)).slice(0, 2)).toEqual([first, second]);

		// DRAG: press on the first tile and release over the second, which takes its place.
		const from = (await page.getByTestId(`widget-${first}`).boundingBox())!;
		await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
		await page.mouse.down();
		// The press SELECTS, and a selection opens the Inspector beside the board — which reflows the
		// grid. Measure the drop target after that, or the drag aims at where the tile used to be.
		await expect(page.getByTestId('widget-inspector')).toBeVisible();
		const to = (await page.getByTestId(`widget-${second}`).boundingBox())!;
		await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
		await page.mouse.up();
		await expect.poll(async () => (await domOrder(page)).slice(0, 2)).toEqual([second, first]);
		expect((await durableOrder(page, sceneId)).slice(0, 2)).toEqual([second, first]);

		// MENU: "Move back" puts it straight back, through the same `scene.move-widget`.
		await page.getByTestId(`widget-${first}`).getByTestId('flow-tile-actions').click();
		await page.getByTestId('flow-tile-menu').getByRole('menuitem', { name: 'Move back' }).click();
		await expect.poll(async () => (await domOrder(page)).slice(0, 2)).toEqual([first, second]);
		expect((await durableOrder(page, sceneId)).slice(0, 2)).toEqual([first, second]);
	});

	test('the flow screen and its tile menu are axe-clean while editing', async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/');
		await seedFresh(page);
		const { sceneId, first } = await seedFlowScene(page);
		await gotoRoute(page, `/scene/${sceneId}`);
		await expect(page.getByTestId('scene-board-flow')).toBeVisible();
		await page.getByRole('button', { name: 'Edit layout' }).click();

		const board = await new AxeBuilder({ page })
			.include('[data-testid="scene-board-flow"]')
			.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
			.analyze();
		expect(board.violations).toEqual([]);

		// The move and width rows live in a portalled menu, which the scan above cannot reach.
		await page.getByTestId(`widget-${first}`).getByTestId('flow-tile-actions').click();
		const menu = page.getByTestId('flow-tile-menu');
		await expect(menu).toBeVisible();
		const menuScan = await new AxeBuilder({ page })
			.include('[data-testid="flow-tile-menu"]')
			.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
			.analyze();
		expect(menuScan.violations).toEqual([]);
	});

	test('no tile clips its content at any tier', async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/');
		await seedFresh(page);
		const { sceneId } = await seedFlowScene(page);
		await gotoRoute(page, `/scene/${sceneId}`);
		await expect(page.getByTestId('scene-board-flow')).toBeVisible();

		for (const width of [1280, 900, 375]) {
			await page.setViewportSize({ width, height: 800 });
			// Let the grid settle at the new column count before measuring.
			await expect(page.getByTestId('scene-board-flow')).toHaveAttribute(
				'data-flow-columns',
				width >= 1025 ? '12' : width >= 641 ? '6' : '1',
			);
			const clipped = await page
				.locator('[data-flow-index]')
				.evaluateAll((nodes) =>
					nodes
						.filter(
							(node) =>
								node.scrollHeight > node.clientHeight + 1 ||
								node.scrollWidth > node.clientWidth + 1,
						)
						.map((node) => node.getAttribute('data-testid')),
				);
			expect(clipped, `tiles clipping content at ${width}px`).toEqual([]);
		}
	});
});
