import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

/** Only Tab changes focus: no pointer, locator.focus(), or DOM focus injection. */
async function tabTo(page: Page, target: Locator) {
	for (let step = 0; step < 120; step++) {
		if (await target.evaluate((node) => node === document.activeElement)) return;
		await page.keyboard.press('Tab');
	}
	await expect(target).toBeFocused();
}

test('keyboard-only builds a three-tile board and passes axe', async ({ page }) => {
	await markOnboarded(page);
	await gotoRoute(page, '/board');
	await seedFresh(page);
	await page.goto('/#/board');
	await waitReady(page);
	const board = page.getByTestId('scene-board-bounded');
	const frames = board.locator('[data-testid^="widget-"]');
	await expect(frames.first()).toBeVisible();
	await tabTo(page, page.getByRole('button', { name: 'Edit layout', exact: true }));
	await page.keyboard.press('Enter');
	// Clear the starter layout entirely through undoable keyboard removal.
	while (await frames.count()) {
		await tabTo(page, frames.first());
		const count = await frames.count();
		await page.keyboard.press('Delete');
		await expect(frames).toHaveCount(count - 1);
	}
	for (let count = 0; count < 3; count++) {
		await tabTo(page, count ? frames.first() : board);
		await page.keyboard.press('a');
		// The phone gallery is a modal Sheet over the toolbar, so assert the gallery, not the toggle.
		const gallery = page.getByTestId('add-widget-gallery');
		await expect(gallery).toBeVisible();
		const note = gallery.getByTestId('gallery-entry-note');
		await tabTo(page, note);
		await page.keyboard.press('Enter');
		await expect(frames).toHaveCount(count + 1);
	}
	const spatialIds = await frames.evaluateAll((nodes) =>
		nodes
			.map((node) => ({
				id: node.getAttribute('data-testid')!,
				x: parseFloat((node as HTMLElement).style.left),
				y: parseFloat((node as HTMLElement).style.top),
			}))
			.sort((a, b) => a.y - b.y || a.x - b.x)
			.map((tile) => tile.id),
	);
	const top = page.getByTestId(spatialIds[0]);
	const middle = page.getByTestId(spatialIds[1]);
	await tabTo(page, top);
	await page.keyboard.press('Enter');
	await expect(top.locator('[data-tile-content]')).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(top).toBeFocused();
	// The gallery (RC-CAN-4.1) fills the top row first; spatial navigation follows that geometry.
	await page.keyboard.press('ArrowRight');
	await expect(middle).toBeFocused();
	await page.keyboard.press('Space');
	const before = await middle.getAttribute('aria-label');
	await page.keyboard.press('ArrowDown');
	await expect(middle).not.toHaveAttribute('aria-label', before!);
	await page.keyboard.press('Escape');
	await page.keyboard.press('Delete');
	await expect(frames).toHaveCount(2);
	await page.keyboard.press('Control+z');
	await expect(frames).toHaveCount(3);
	const result = await new AxeBuilder({ page })
		.include('[data-testid="scene-board-bounded"]')
		.analyze();
	expect(result.violations).toEqual([]);
});

test('Tab follows pin, dock, group and z metadata without changing paint order', async ({
	page,
}) => {
	await markOnboarded(page);
	await gotoRoute(page, '/board');
	await seedFresh(page);
	await page.goto('/#/board');
	await waitReady(page);
	const board = page.getByTestId('scene-board-bounded');
	const frames = board.locator('[data-testid^="widget-"]');
	await expect(frames.first()).toBeVisible();
	const ids = await frames.evaluateAll((nodes) =>
		nodes.map((node) => node.getAttribute('data-testid')!.slice(7)),
	);
	expect(ids.length).toBeGreaterThanOrEqual(4);
	const results = await page.evaluate(async (ids) => {
		const rt = window.__rt!;
		const sceneId = rt.state.commandCenter.homeSceneId!;
		const results: string[] = [];
		const run = async (type: string, payload: Record<string, unknown>) => {
			const result = await rt.dispatch({
				type,
				actorId: rt.defaultActorId,
				payload: { sceneId, ...payload },
			} as Parameters<typeof rt.dispatch>[0]);
			results.push(result.status);
		};
		for (const [z, widgetInstanceId] of ids.entries()) {
			await run('scene.set-focus-order', { widgetInstanceId, focusOrder: null });
			await run('scene.pin-widget', { widgetInstanceId, pinned: false });
			await run('scene.dock-widget', { widgetInstanceId, dock: null });
			await run('scene.layer-widget', { widgetInstanceId, z });
		}
		await run('scene.pin-widget', { widgetInstanceId: ids[2], pinned: true });
		await run('scene.group-widgets', { widgetInstanceIds: [ids[0], ids[2]] });
		await run('scene.dock-widget', { widgetInstanceId: ids[1], dock: 'top' });
		return results;
	}, ids);
	expect(results.every((result) => result === 'accepted')).toBe(true);
	const expected = [ids[2], ids[0], ids[1], ...ids.slice(3).reverse()];
	await expect
		.poll(() =>
			frames.evaluateAll((nodes) =>
				nodes.map((node) => node.getAttribute('data-testid')!.slice(7)),
			),
		)
		.toEqual(expected);
	await tabTo(page, page.getByTestId(`widget-${expected[0]}`));
	for (const id of expected.slice(1)) {
		// Tile controls can be intermediate Tab stops; the next frame must be the metadata peer.
		for (let step = 0; step < 30; step++) {
			await page.keyboard.press('Tab');
			if (
				await page
					.locator(':focus')
					.getAttribute('data-testid')
					?.then((value) => value?.startsWith('widget-'))
			)
				break;
		}
		await expect(page.getByTestId(`widget-${id}`)).toBeFocused();
	}
	const stack = await frames.evaluateAll((nodes) =>
		nodes.map((node) => Number((node as HTMLElement).style.zIndex)),
	);
	expect(stack).not.toEqual([...stack].sort((a, b) => a - b));
});
