import AxeBuilder from '@axe-core/playwright';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { dispatch, enterPreview, exitPreview, gotoRoute, markOnboarded } from './_helpers';

// RC-POL-1.2 — the GM Screen board's polish pass (§20.2–§20.5). Runs on both the desktop-chromium
// and mobile-chromium projects: axe over the route and every overlay it opens in all five themes, a
// keyboard-only walkthrough of the primary task (pick a tile up, move it, put it down, undo), a
// storage failure as the failure path, the player preview against the core's actor read, the
// history cluster clear of the tiles, Spanish tile-menu copy, and 200% text.

const THEMES = ['tavern', 'parchment', 'scholar', 'dungeon', 'high-contrast'] as const;
type Theme = (typeof THEMES)[number];
const SCENE_QUERY = `/@fs${fileURLToPath(new URL('../../../../packages/core/src/queries/scene.ts', import.meta.url))}`;

async function axe(page: Page, label: string) {
	// Scan settled frames only: a panel or menu transition mid-flight is not what a user reads.
	await page.evaluate(
		() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
	);
	// The shell's chrome is the App shell story's surface (RC-POL-1.23) and is scanned there.
	await page.evaluate(() => {
		const main = document.getElementById('main-content');
		for (const sibling of Array.from(main?.parentElement?.children ?? []))
			if (sibling !== main) sibling.setAttribute('data-axe-shell', '');
		for (const aside of Array.from(document.querySelectorAll('aside')))
			if (!main?.contains(aside)) aside.setAttribute('data-axe-shell', '');
	});
	const result = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
		.exclude('[data-axe-shell]')
		.analyze();
	const found = result.violations.map((violation) => ({
		id: violation.id,
		impact: violation.impact,
		nodes: violation.nodes.map(
			(node) => `${node.target.join(' ')} — ${node.failureSummary?.split('\n').slice(1).join(' ')}`,
		),
	}));
	expect(found, label).toEqual([]);
}

/** Open the GM Screen (it resolves `/board` to its `/screen/:id`) in `theme`; returns its scene. */
async function openBoard(page: Page, theme: Theme = 'tavern', locale?: string) {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.addInitScript(
		([applied, language]) => {
			try {
				window.localStorage.setItem('dndtools:react:theme', applied!);
				if (language) window.localStorage.setItem('dndtools:locale', language);
			} catch {
				/* best-effort, as in markOnboarded */
			}
		},
		[theme, locale] as const,
	);
	await markOnboarded(page);
	await gotoRoute(page, '/board');
	await expect(page).toHaveURL(/#\/screen\//);
	await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
	// The screen has mounted once its toolbar offers editing (in whichever language).
	await expect(main(page).getByTestId('board-status')).toBeAttached();
	return page.evaluate(() => {
		const rt = window.__rt!;
		const sceneId = rt.state.commandCenter.homeSceneId!;
		const widgets = rt.state.scenes.scenes[sceneId].widgets as Array<{ id: string; type: string }>;
		const of = (type: string) => widgets.find((w) => w.type === type)!.id;
		return { sceneId, actorId: rt.defaultActorId, map: of('map'), dice: of('dice') };
	});
}

const main = (page: Page) => page.locator('#main-content');
const editLayout = (page: Page) => main(page).getByRole('button', { name: 'Edit layout' });

async function enterEdit(page: Page) {
	await editLayout(page).click();
	await expect(main(page).getByRole('button', { name: 'Done', exact: true })).toBeVisible();
	await expect(page.getByTestId('scene-board-bounded')).toBeVisible();
}

async function openTileMenu(page: Page, widgetId: string) {
	const frame = page.getByTestId(`widget-${widgetId}`);
	await frame.scrollIntoViewIfNeeded();
	await frame.getByTestId('tile-actions-trigger').click();
	const menu = page.getByTestId('tile-actions-menu');
	await expect(menu).toBeVisible();
	return menu;
}

for (const theme of THEMES) {
	test(`the board, its edit mode and its panels are axe clean — ${theme}`, async ({ page }) => {
		const { map } = await openBoard(page, theme);
		await axe(page, `${theme}: view`);
		await enterEdit(page);
		await axe(page, `${theme}: edit`);
		const menu = await openTileMenu(page, map);
		await menu.getByRole('menuitem', { name: 'Visibility' }).click();
		await expect(menu.getByRole('menuitemradio')).toHaveCount(3);
		await axe(page, `${theme}: tile menu`);
		await page.keyboard.press('Escape');
		await page.keyboard.press('Escape');
		await main(page).getByRole('button', { name: 'Add', exact: true }).click();
		await expect(page.getByTestId('add-widget-gallery')).toBeVisible();
		await axe(page, `${theme}: add widget`);
		await page.keyboard.press('Escape');
		await main(page).getByRole('button', { name: 'Layouts', exact: true }).click();
		await expect(page.getByRole('region', { name: 'Layouts' })).toBeVisible();
		await axe(page, `${theme}: layouts`);
		if (theme === 'high-contrast') {
			// A paper scene pins parchment under its tiles in every theme but this one.
			await expect(page.getByTestId('scene-background')).not.toHaveAttribute('data-theme');
		}
	});

	test(`the empty board and its template picker are axe clean — ${theme}`, async ({ page }) => {
		const { sceneId, actorId } = await openBoard(page, theme);
		const ids = await page.evaluate(
			(id) => window.__rt!.state.scenes.scenes[id].widgets.map((w: { id: string }) => w.id),
			sceneId,
		);
		for (const widgetInstanceId of ids) {
			const removed = await dispatch(page, {
				type: 'scene.destroy-widget',
				actorId,
				payload: { sceneId, widgetInstanceId },
			});
			expect(removed.status).toBe('accepted');
		}
		const empty = page.getByTestId('board-empty-templates');
		await expect(empty).toBeVisible();
		await expect(empty.locator('svg[data-illustration="session-board-empty"]')).toHaveCount(1);
		await axe(page, `${theme}: empty board`);
		// A board that held tiles once offers the Add panel; its start header leads to templates.
		await empty.getByRole('button', { name: 'Add your first tile' }).click();
		await expect(page.getByTestId('gallery-start-header')).toBeVisible();
		await axe(page, `${theme}: add panel on an empty board`);
		await page.getByRole('button', { name: /^Use a scene template/ }).click();
		await expect(page.getByRole('dialog', { name: 'Start from a template' })).toBeVisible();
		await axe(page, `${theme}: template picker`);
	});
}

test('the tile dialogs and the layout banner are axe clean', async ({ page }) => {
	const { sceneId, actorId, map, dice } = await openBoard(page);
	await enterEdit(page);
	let menu = await openTileMenu(page, map);
	await menu.getByRole('menuitem', { name: 'Bind…' }).click();
	await expect(page.getByRole('dialog', { name: 'Bind Map' })).toBeVisible();
	await axe(page, 'bind dialog');
	await page.keyboard.press('Escape');
	menu = await openTileMenu(page, dice);
	await menu.getByRole('menuitem', { name: 'Configure…' }).click();
	await expect(page.getByRole('dialog', { name: 'Configure Dice' })).toBeVisible();
	await axe(page, 'configure dialog');
	await page.keyboard.press('Escape');
	// Drop the dice onto the map: the board names the overlap and offers the fix.
	const at = await page.evaluate(
		([id, wid]) =>
			window.__rt!.state.scenes.scenes[id].widgets.find((w: { id: string }) => w.id === wid)!
				.layout,
		[sceneId, map] as const,
	);
	const moved = await dispatch(page, {
		type: 'scene.move-widget',
		actorId,
		payload: { sceneId, widgetInstanceId: dice, x: at.x, y: at.y },
	});
	expect(moved.status).toBe('accepted');
	await expect(main(page).getByRole('button', { name: 'Fix layout' })).toBeVisible();
	await axe(page, 'layout banner');
});

test('keyboard only: pick a tile up, move it, put it down and undo the move', async ({ page }) => {
	const { sceneId, map } = await openBoard(page);
	const x = () =>
		page.evaluate(
			([id, wid]) =>
				window.__rt!.state.scenes.scenes[id].widgets.find((w: { id: string }) => w.id === wid)!
					.layout.x,
			[sceneId, map] as const,
		);
	await editLayout(page).focus();
	await page.keyboard.press('Enter');
	await expect(main(page).getByRole('button', { name: 'Done', exact: true })).toBeFocused();
	const frame = page.getByTestId(`widget-${map}`);
	// Tab reaches the frames in the core's reading order; the map is the first.
	for (let i = 0; i < 40 && !(await frame.evaluate((el) => el === document.activeElement)); i++)
		await page.keyboard.press('Tab');
	await expect(frame).toBeFocused();
	expect(await frame.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
	const notice = page.getByTestId('canvas-resize-announcement');
	await page.keyboard.press('Space');
	await expect(notice).toContainText('Map selected.');
	const before = await x();
	await page.keyboard.press('ArrowRight');
	await expect.poll(x).toBeGreaterThan(before);
	await expect(notice).toContainText('Map, moved to');
	await page.keyboard.press('Escape');
	await expect(notice).toContainText('Map put down.');
	await page.keyboard.press('Control+z');
	await expect.poll(x).toBe(before);
	await expect(
		page.getByTestId('scene-board-bounded').locator(':scope > [role="status"]'),
	).toContainText('Undone: moved Map');
});

test('a layout that cannot be saved says what to do, and saves once storage recovers', async ({
	page,
}) => {
	await openBoard(page);
	await enterEdit(page);
	await main(page).getByRole('button', { name: 'Layouts', exact: true }).click();
	const panel = page.getByRole('region', { name: 'Layouts' });
	await panel.getByRole('textbox', { name: 'Layout name' }).fill('Combat night');
	// The runtime rethrows a failed vault write (IndexedDB quota, private mode).
	await page.evaluate(() => {
		const rt = window.__rt! as unknown as { dispatch: unknown };
		(window as unknown as { __pol12Dispatch: unknown }).__pol12Dispatch = rt.dispatch;
		rt.dispatch = () => Promise.reject(new Error('QuotaExceededError'));
	});
	await panel.getByRole('button', { name: 'Save', exact: true }).click();
	const alert = main(page).getByRole('alert');
	await expect(alert).toHaveText(
		"That change couldn't be saved to this device. Check storage space and try again.",
	);
	await page.evaluate(() => {
		const rt = window.__rt! as unknown as { dispatch: unknown };
		rt.dispatch = (window as unknown as { __pol12Dispatch: unknown }).__pol12Dispatch;
	});
	await panel.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(alert).toHaveCount(0);
	await expect(page.getByTestId('board-status')).toHaveText('Layout “Combat night” saved.');
});

test('previewing as a player shows the GM screen projects nothing, and refuses writes', async ({
	page,
}) => {
	const { sceneId, map, dice } = await openBoard(page);
	await enterPreview(page, 'player');
	await expect(editLayout(page)).toHaveCount(0);
	const overlay = page.getByTestId('player-preview-overlay');
	await expect(overlay).toBeVisible();
	// The overlay draws every tile with the verdict the player's read gives it: the GM screen is
	// the GM's own board, so each one is hidden, with the reason.
	for (const id of [map, dice])
		await expect(overlay.getByTestId(`preview-tile-${id}`)).toHaveAttribute('data-tone', 'hidden');
	await axe(page, 'player preview');
	// That projection is the core's actor-scoped read, not a client filter.
	const read = await page.evaluate(
		async ([queryUrl, id]) => {
			const rt = window.__rt!;
			const core = await new Function('url', 'return import(url)')(queryUrl);
			const summary = core.getSceneForActor(
				rt.state.scenes,
				rt.state.permissions,
				rt.defaultActorId,
				id,
				{ widgetPackages: rt.state.widgets },
			);
			return 'kind' in summary ? { refused: summary.reason } : { widgets: summary.widgets.length };
		},
		[SCENE_QUERY, sceneId] as const,
	);
	expect(read).toEqual({ refused: expect.any(String) });
	const write = await dispatch(page, {
		type: 'scene.move-widget',
		actorId: await page.evaluate(() => window.__rt!.defaultActorId),
		payload: { sceneId, widgetInstanceId: dice, x: 400, y: 400 },
	});
	expect(write.status).toBe('rejected');
	await exitPreview(page);
	await expect(editLayout(page)).toBeVisible();
});

test('the history cluster never covers a tile’s menu trigger', async ({ page }) => {
	await openBoard(page);
	await enterEdit(page);
	const cluster = page.getByTestId('canvas-history-controls');
	await expect(cluster).toBeVisible();
	const overlapping = () =>
		page.evaluate(() => {
			const box = document
				.querySelector('[data-testid="canvas-history-controls"]')!
				.getBoundingClientRect();
			return Array.from(document.querySelectorAll('[data-testid="tile-actions-trigger"]')).filter(
				(trigger) => {
					const r = trigger.getBoundingClientRect();
					return (
						r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top
					);
				},
			).length;
		});
	expect(await overlapping()).toBe(0);
	// The Add panel narrows the pane, so the layout reaches under the cluster on every tier.
	await main(page).getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByTestId('add-widget-gallery')).toBeVisible();
	if (test.info().project.name.includes('mobile')) await page.keyboard.press('Escape');
	await expect.poll(overlapping).toBe(0);
});

test('the tile menu speaks Spanish when the app does', async ({ page }) => {
	const { map } = await openBoard(page, 'tavern', 'es');
	await main(page).getByRole('button', { name: 'Editar el diseño' }).click();
	const frame = page.getByTestId(`widget-${map}`);
	await frame.getByTestId('tile-actions-trigger').click();
	const menu = page.getByTestId('tile-actions-menu');
	for (const name of ['Mover', 'Duplicar', 'Vincular…', 'Configurar…', 'Visibilidad', 'Quitar'])
		await expect(menu.getByRole('menuitem', { name, exact: true })).toBeVisible();
	await menu.getByRole('menuitem', { name: 'Visibilidad', exact: true }).click();
	await expect(menu.getByRole('menuitemradio', { name: 'Jugadores' })).toBeVisible();
	await expect(frame).toHaveAttribute('aria-label', /, widget de .*, posición \d+, \d+, tamaño/);
});

test('at 200% text the board and its edit mode never widen the page', async ({ page }) => {
	await openBoard(page);
	await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
	const widened = () =>
		page.evaluate(() => {
			const pane = document.getElementById('main-content')!;
			return pane.scrollWidth - pane.clientWidth;
		});
	await expect.poll(widened).toBeLessThanOrEqual(1);
	await enterEdit(page);
	await expect.poll(widened).toBeLessThanOrEqual(1);
	await main(page).getByRole('button', { name: 'Layouts', exact: true }).click();
	await expect.poll(widened).toBeLessThanOrEqual(1);
});
