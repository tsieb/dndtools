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
const DESKTOP_COLUMNS = 12;

/**
 * A workspace-authored package, installed only so the tile menu's Width rows are ENABLED. Every
 * widget that ships is `system` tier and `isWidgetResizable` locks those, so a system tile can show
 * the control but never commit through it — which is how a span written against the wrong grid
 * stayed invisible to the rest of this suite.
 */
const SPAN_WIDGET_TYPE = 'flowspan';
const SPAN_PACKAGE = {
	id: 'workspace.flowspan',
	version: '1.0.0',
	displayName: 'Flow span',
	widgets: [
		{
			type: SPAN_WIDGET_TYPE,
			version: '1.0.0',
			displayName: 'Flow span',
			author: 'workspace',
			description: 'A resizable custom widget used to exercise the flow width control.',
			placement: { surfaces: ['scene'], libraryListed: true },
			renderEntrypoint: {
				runtime: 'custom-html-js',
				sandbox: 'iframe',
				assetPath: `widgets/${SPAN_WIDGET_TYPE}/index.html`,
				hostApiVersion: 1,
			},
			style: {
				isolation: 'iframe-document',
				stylesheetAssetPaths: [],
				capabilities: ['css-variables'],
				tokens: [],
			},
			supportedProfiles: ['desktop', 'tablet', 'mobile', 'web'],
			defaultSize: { width: 320, height: 200 },
			minSize: { width: 120, height: 80 },
			resizePolicy: 'free',
			requiredBindings: [],
			optionalBindings: [],
			configurationSchema: { type: 'object', additionalProperties: true },
			capabilitySets: ['manager', 'operator', 'viewer'],
			commands: [],
			events: [],
			hostPermissions: [],
		},
	],
	migrations: [],
	assets: [
		{
			path: `widgets/${SPAN_WIDGET_TYPE}/index.html`,
			kind: 'html',
			entrypoint: true,
			content: '<!doctype html><html><body><p>Span</p></body></html>',
		},
	],
	portabilityWarnings: [],
};

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
async function seedFlowScene(page: Page, spans: [number, number] = [6, 6]): Promise<FlowFixture> {
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
	let column = 0;
	for (const [index, widgetInstanceId] of [first, second].entries()) {
		const moved = await dispatch(page, {
			type: 'scene.move-widget',
			actorId,
			payload: { sceneId, widgetInstanceId, x: column * COLUMN_STEP, y: 0 },
		});
		expect(moved.status, JSON.stringify(moved)).toBe('accepted');
		const resized = await dispatch(page, {
			type: 'scene.resize-widget',
			actorId,
			payload: { sceneId, widgetInstanceId, w: spans[index] * COLUMN_STEP, h: 220 },
		});
		expect(resized.status, JSON.stringify(resized)).toBe('accepted');
		column += spans[index];
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

	test("reproduces the Command Center's 7 + 5 body at desktop", async ({ page }) => {
		// The acceptance names the Command Center's CURRENT arrangement, whose body is
		// `minmax(0,1.5fr) minmax(0,1fr)` — spans 7 + 5 of twelve, not an even split. An even split
		// would reproduce under a rescale too, so this is the case that pins the ratio.
		await markOnboarded(page);
		await gotoRoute(page, '/');
		await seedFresh(page);
		const { sceneId, first, second } = await seedFlowScene(page, [7, 5]);

		await page.setViewportSize({ width: 1280, height: 900 });
		await gotoRoute(page, `/scene/${sceneId}`);
		const board = page.getByTestId('scene-board-flow');
		await expect(board).toHaveAttribute('data-flow-columns', String(DESKTOP_COLUMNS));

		const main = (await page.getByTestId(`widget-${first}`).boundingBox())!;
		const side = (await page.getByTestId(`widget-${second}`).boundingBox())!;
		expect(Math.abs(main.y - side.y), 'both tiles share the first row').toBeLessThan(2);
		expect(side.x).toBeGreaterThan(main.x + main.width - 2);
		// 7 : 5 within a column's worth of slack — the grid's gap eats a few px off each track.
		expect(main.width / side.width).toBeGreaterThan(1.25);
		expect(main.width / side.width).toBeLessThan(1.55);

		// And it still reflows one-per-row at rail, so the ratio is reproduced, not frozen.
		await page.setViewportSize({ width: 900, height: 900 });
		await expect(board).toHaveAttribute('data-flow-columns', '6');
		const railMain = (await page.getByTestId(`widget-${first}`).boundingBox())!;
		const railSide = (await page.getByTestId(`widget-${second}`).boundingBox())!;
		expect(railSide.y).toBeGreaterThan(railMain.y + railMain.height - 2);
		expect(Math.abs(railMain.width - railSide.width)).toBeLessThan(2);
	});

	test('the width menu reads and writes the authoring grid at every tier', async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/');
		await seedFresh(page);
		const { sceneId } = await seedFlowScene(page);
		const actorId = await page.evaluate(() => window.__rt!.defaultActorId);

		// Every widget that ships is `system` tier, whose Width rows are locked, so the control that
		// actually writes a span needs a workspace-authored package behind it.
		const installed = await dispatch(page, {
			type: 'widget.package.install',
			actorId,
			payload: { package: SPAN_PACKAGE },
		});
		expect(installed.status, JSON.stringify(installed)).toBe('accepted');
		const enabled = await dispatch(page, {
			type: 'widget.package.enable',
			actorId,
			payload: { packageId: SPAN_PACKAGE.id },
		});
		expect(enabled.status, JSON.stringify(enabled)).toBe('accepted');

		const added = await dispatch(page, {
			type: 'scene.add-widget',
			actorId,
			payload: {
				sceneId,
				widget: {
					type: SPAN_WIDGET_TYPE,
					version: '1.0.0',
					// Half of the authoring grid, parked below the seeded row so it sorts last.
					layout: { x: 0, y: 2000, w: (DESKTOP_COLUMNS / 2) * COLUMN_STEP, h: 220 },
					configuration: {},
					localState: {},
					binding: null,
				},
			},
		});
		expect(added.status, JSON.stringify(added)).toBe('accepted');
		const tileId = await page.evaluate(
			([id, type]) =>
				window.__rt!.state.scenes.scenes[id].widgets.find((w) => w.type === type)!.id.toString(),
			[sceneId, SPAN_WIDGET_TYPE] as const,
		);

		await gotoRoute(page, `/scene/${sceneId}`);
		await expect(page.getByTestId('scene-board-flow')).toBeVisible();
		await page.getByRole('button', { name: 'Edit layout' }).click();

		// The tile is half of TWELVE columns whatever tier is rendering it, so "Half" is the checked
		// row at each of them and the other three are not. Reading the presets off the tier instead
		// checked all four at phone, where every placement is span 1.
		for (const [width, columns] of [
			[1280, '12'],
			[900, '6'],
			[375, '1'],
		] as const) {
			await page.setViewportSize({ width, height: 900 });
			await expect(page.getByTestId('scene-board-flow')).toHaveAttribute(
				'data-flow-columns',
				columns,
			);
			await page.getByTestId(`widget-${tileId}`).getByTestId('flow-tile-actions').click();
			const widthGroup = page.getByTestId('flow-tile-menu').getByRole('group', { name: 'Width' });
			await expect(widthGroup).toBeVisible();
			for (const [label, checked] of [
				['Full width', 'false'],
				['Half', 'true'],
				['Third', 'false'],
				['Quarter', 'false'],
			] as const) {
				await expect(
					widthGroup.getByRole('menuitemradio', { name: label }),
					`"${label}" at ${width}px`,
				).toHaveAttribute('aria-checked', checked);
			}
			// And the panel is reachable, not hanging off the bottom of the screen: a tile low in the
			// scroll region used to open its menu below the fold, where the Width group could not be
			// clicked at all — the phone tier losing the control it is supposed to keep.
			const panel = (await page.getByTestId('flow-tile-menu').boundingBox())!;
			expect(panel.y, `menu top at ${width}px`).toBeGreaterThanOrEqual(0);
			expect(panel.y + panel.height, `menu bottom at ${width}px`).toBeLessThanOrEqual(900);

			await page.keyboard.press('Escape');
			await expect(page.getByTestId('flow-tile-menu')).toBeHidden();
		}

		// And the write is against the authoring grid too: "Full width" on a PHONE has to mean twelve
		// columns on the desktop the screen was authored for, not the phone's single column.
		await page.getByTestId(`widget-${tileId}`).getByTestId('flow-tile-actions').click();
		await page
			.getByTestId('flow-tile-menu')
			.getByRole('menuitemradio', { name: 'Full width' })
			.click();
		await expect
			.poll(async () =>
				page.evaluate(
					([id, widgetId]) =>
						window.__rt!.state.scenes.scenes[id].widgets.find((w) => w.id === widgetId)!.layout.w,
					[sceneId, tileId] as const,
				),
			)
			.toBe(DESKTOP_COLUMNS * COLUMN_STEP);
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
