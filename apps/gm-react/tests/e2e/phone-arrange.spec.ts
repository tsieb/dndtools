import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

async function openBoard(page: Page, width: number) {
	await page.setViewportSize({ width, height: 844 });
	await markOnboarded(page);
	await gotoRoute(page, '/board');
	await seedFresh(page);
	await page.goto('/#/board');
	await waitReady(page);
	await expect(page.locator('[data-testid^="widget-"]').first()).toBeVisible();
}
async function order(page: Page) {
	return page.evaluate(() => {
		const rt = window.__rt!;
		return [...rt.state.scenes.scenes[rt.state.commandCenter.homeSceneId!].widgets]
			.sort((a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x)
			.map((w) => w.id);
	});
}
// Editing is the `?edit=1` search param: the board re-renders a tick after the click, so wait
// for it rather than measure the reading posture.
async function editLayout(page: Page) {
	await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeVisible();
}
async function noSidewaysControls(page: Page) {
	expect(
		await page.locator('#main-content button').evaluateAll((els) =>
			els
				.filter((el) => {
					const r = el.getBoundingClientRect();
					return r.width > 0 && r.height > 0 && (r.right > innerWidth + 1 || r.left < -1);
				})
				.map((el) => el.getAttribute('aria-label') || el.textContent),
		),
	).toEqual([]);
}

test('phone list stays mounted, handle persists a core move, sizes and visibility are reachable', async ({
	page,
}) => {
	await openBoard(page, 390);
	const list = page.getByTestId('stacked-board');
	await list.evaluate((el) => el.setAttribute('data-original', 'true'));
	const before = await order(page);
	await editLayout(page);
	await expect(list).toHaveAttribute('data-original', 'true');
	await expect(page.getByRole('button', { name: 'List', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Layout', exact: true })).toBeVisible();
	await expect(list.getByText('DM only', { exact: true })).toHaveCount(0);
	await list.locator('h3 button').nth(0).click();
	await list.locator('h3 button').nth(1).click();
	const handle = list.getByRole('button', { name: /^Drag .* to reorder/ }).first();
	const box = await handle.boundingBox();
	const target = await page.getByTestId(`widget-${before[1]}`).boundingBox();
	expect(box).not.toBeNull();
	expect(target).not.toBeNull();
	await page.mouse.move(box!.x + 10, box!.y + 10);
	await page.mouse.down();
	await page.mouse.move(box!.x + 10, target!.y + 30, { steps: 8 });
	await page.mouse.up();

	await expect.poll(() => order(page)).toEqual([before[1], before[0], ...before.slice(2)]);
	await expect
		.poll(() => page.evaluate(() => window.__rt!.lastLifecycle))
		.toMatchObject({ commandType: 'scene.move-widget', status: 'success' });
	await list.getByRole('button', { name: /^Undo/ }).click();
	await expect.poll(() => order(page)).toEqual(before);
	await list.getByRole('button', { name: /^Redo/ }).click();
	await expect.poll(() => order(page)).toEqual([before[1], before[0], ...before.slice(2)]);
	await page
		.getByTestId(`widget-${before[0]}`)
		.getByRole('button', { name: 'Move up', exact: true })
		.click();
	await expect.poll(() => order(page)).toEqual(before);
	await page
		.getByTestId(`widget-${before[0]}`)
		.getByRole('button', { name: 'Move down', exact: true })
		.click();
	await expect.poll(() => order(page)).toEqual([before[1], before[0], ...before.slice(2)]);
	const tile = page.getByTestId(`widget-${before[0]}`);
	await tile.getByRole('button', { name: 'Large', exact: true }).click();
	await expect
		.poll(() => page.evaluate(() => window.__rt!.lastLifecycle))
		.toMatchObject({ commandType: 'scene.resize-widget', status: 'success' });
	await noSidewaysControls(page);
	await page.screenshot({ path: test.info().outputPath('phone-list.png') });
	await expect(page.getByTestId('screen-pin')).toBeVisible();
	const axe = await new AxeBuilder({ page }).include('#main-content').analyze();
	expect(axe.violations).toEqual([]);
	await page.reload();
	await waitReady(page);
	await expect.poll(() => order(page)).toEqual([before[1], before[0], ...before.slice(2)]);
});

test('every size preset leaves the Fit canvas tile menus inside the phone viewport', async ({
	page,
}) => {
	await openBoard(page, 390);
	await editLayout(page);
	const tile = page.getByTestId(
		(await page.locator('[data-stacked-tile]').first().getAttribute('data-testid'))!,
	);
	// Small is the 20×20 minimum: at Fit it paints narrower than the screen-sized 44px trigger.
	for (const preset of ['Small', 'Medium', 'Large']) {
		await tile.getByRole('button', { name: preset, exact: true }).click();
		await expect
			.poll(() => page.evaluate(() => window.__rt!.lastLifecycle))
			.toMatchObject({ commandType: 'scene.resize-widget', status: 'success' });
		await page.getByRole('button', { name: 'Layout', exact: true }).click();
		const board = page.getByTestId('scene-board-bounded');
		await expect(board.getByTestId('tile-actions-trigger').first()).toBeVisible();
		await expect
			.poll(() =>
				board.getByTestId('tile-actions-trigger').evaluateAll((els) =>
					els
						.filter((el) => {
							const r = el.getBoundingClientRect();
							return r.left < -1 || r.right > innerWidth + 1;
						})
						.map((el) => el.getAttribute('aria-label')),
				),
			)
			.toEqual([]);
		await noSidewaysControls(page);
		await page.screenshot({ path: test.info().outputPath(`preset-${preset}-layout.png`) });
		await page.getByRole('button', { name: 'List', exact: true }).click();
		await expect(page.getByTestId('stacked-board')).toBeVisible();
	}
});

test('phone Layout edits at Fit and opens a readable loupe', async ({ page }) => {
	await openBoard(page, 390);
	await page.getByRole('button', { name: 'Layout', exact: true }).click();
	await editLayout(page);
	const overview = page.getByTestId('scene-board-bounded');
	await expect(overview).toBeVisible();
	await noSidewaysControls(page);
	const tile = overview.locator('[data-testid^="widget-"]').first();
	const scale = await overview
		.locator('[style*="--scene-board-scale:"]')
		.evaluate((el) => Number((el as HTMLElement).style.getPropertyValue('--scene-board-scale')));
	expect(scale).toBeLessThan(1);
	const id = (await tile.getAttribute('data-testid'))!.slice('widget-'.length);
	const layout = () =>
		page.evaluate((widgetId) => {
			const rt = window.__rt!;
			const scene = rt.state.scenes.scenes[rt.state.commandCenter.homeSceneId!];
			return scene.widgets.find((w) => w.id === widgetId)!.layout;
		}, id);
	const authored = await layout();
	const box = (await tile.boundingBox())!;
	const touch = await page.context().newCDPSession(page);
	await touch.send('Input.dispatchTouchEvent', {
		type: 'touchStart',
		// Use the tile body, clear of the unscaled menu button's touch target.
		touchPoints: [{ x: box.x + 12, y: box.y + box.height - 12 }],
	});
	await page.waitForTimeout(100);
	await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	await touch.detach();
	await expect(page.getByTestId('phone-edit-loupe')).toBeVisible();
	// The opening tap's own click must not land on a size preset in the new loupe.
	await page.waitForTimeout(600);
	expect(await layout()).toEqual(authored);
	await page.screenshot({ path: test.info().outputPath('phone-loupe.png') });
	await expect(page.getByRole('button', { name: 'Move down', exact: true })).toBeVisible();
	await noSidewaysControls(page);
	expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
	await page.getByRole('button', { name: 'Close', exact: true }).click();
	await expect(tile).toBeFocused();
	await expect(overview).toBeVisible();
});

test('rail Fit paints no text smaller than twelve pixels', async ({ page }) => {
	await openBoard(page, 834);
	const board = page.getByTestId('scene-board-bounded');
	await expect(board).toBeVisible();
	const small = await board.evaluate((el) =>
		[...el.querySelectorAll<HTMLElement>('*')].flatMap((node) => {
			if (![...node.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()))
				return [];
			if (!node.getBoundingClientRect().width) return [];
			const cs = getComputedStyle(node);
			const scale = Number(cs.getPropertyValue('--scene-board-scale') || 1);
			const painted = parseFloat(cs.fontSize) * Math.min(1, scale);
			return painted < 11.99 ? [{ text: node.textContent?.slice(0, 50), painted }] : [];
		}),
	);
	expect(small).toEqual([]);
	expect((await new AxeBuilder({ page }).include('#main-content').analyze()).violations).toEqual(
		[],
	);
});

test('stacked tile menu stays in bounds and badges only shared or player-visible tiles', async ({
	page,
}) => {
	await openBoard(page, 390);
	await editLayout(page);
	const tile = page.getByTestId('stacked-board').locator('[data-stacked-tile]').first();
	for (const visibility of ['Shared', 'Players']) {
		await tile.getByTestId('tile-actions-trigger').click();
		await page.getByRole('menuitem', { name: 'Visibility', exact: true }).click();
		await page.getByRole('menuitemradio', { name: visibility, exact: true }).click();
		await expect(
			tile.getByText(visibility === 'Shared' ? 'Shared' : 'Players', { exact: true }),
		).toBeVisible();
	}
	await tile.getByTestId('tile-actions-trigger').click();
	await noSidewaysControls(page);
	expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
