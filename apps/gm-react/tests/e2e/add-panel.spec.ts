import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// RC-CAN-8.5 — an Add panel a GM can read. Both profiles: on a phone, Edit layout switches the
// board to its canvas and the panel is a bottom Sheet holding the same rows.

async function editBoard(page: Page) {
	await markOnboarded(page);
	await gotoRoute(page, '/board');
	await seedFresh(page);
	await page.goto('/#/board');
	await waitReady(page);
	const frames = page.getByTestId('scene-board-bounded').locator('[data-testid^="widget-"]');
	await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
	await expect(frames.first()).toBeVisible();
	return frames;
}

const gallery = (page: Page) => page.getByTestId('add-widget-gallery');

test('adds Dice in two clicks after Edit layout: in view, selected, focused and announced', async ({
	page,
}) => {
	const frames = await editBoard(page);
	const before = new Set(
		await frames.evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-testid')!)),
	);

	// Click 1 opens the panel; click 2 is the Dice row itself.
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await gallery(page).getByRole('button', { name: 'Add Dice', exact: true }).click();

	await expect(gallery(page)).toBeHidden();
	await expect(frames).toHaveCount(before.size + 1);
	const ids = await frames.evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-testid')!));
	const added = page.getByTestId(ids.find((id) => !before.has(id))!);
	await expect(added).toBeFocused();
	await expect(added).toHaveAttribute('aria-label', /^Dice, /);
	// Selected: the single-tile selection chip (and its outline) sits on the new frame.
	await expect(added.getByTestId('tile-selection-chip')).toBeVisible();
	await expect(page.getByTestId('add-widget-announcement')).toHaveText('Added Dice');

	const box = (await added.boundingBox())!;
	const viewport = page.viewportSize()!;
	expect(box.x).toBeGreaterThanOrEqual(0);
	expect(box.y).toBeGreaterThanOrEqual(0);
	expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
	expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
	// Placed in a free slot: nothing overlaps, so the layout banner stays away.
	await expect(page.getByRole('button', { name: 'Fix layout' })).toHaveCount(0);
});

test('a GM scrolled down a long board gets the new tile where they are looking', async ({
	page,
}) => {
	const frames = await editBoard(page);
	// Move the top-left tile far below the rest: the top row now has a free slot, out of sight.
	const { sceneId, first, actorId } = await page.evaluate(() => {
		const rt = window.__rt!;
		const id = rt.state.commandCenter.homeSceneId!;
		const [top] = [...rt.state.scenes.scenes[id].widgets].sort(
			(a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x,
		);
		return { sceneId: id, first: top.id, actorId: rt.defaultActorId };
	});
	const moved = await dispatch(page, {
		type: 'scene.move-widget',
		actorId,
		payload: { sceneId, widgetInstanceId: first, x: 24, y: 1600 },
	});
	expect(moved.status, JSON.stringify(moved)).toBe('accepted');
	const board = page.getByTestId('scene-board-bounded');
	await expect(page.getByTestId(`widget-${first}`)).toHaveAttribute(
		'aria-label',
		/position 24, 1600/,
	);
	const before = await frames.count();
	// Open the panel first: on a wide screen it narrows the pane, and Fit re-scales the board.
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	const dice = gallery(page).getByRole('button', { name: 'Add Dice', exact: true });
	await expect(dice).toBeVisible();
	await board.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
	await expect.poll(() => board.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
	const scrolled = await board.evaluate((el) => el.scrollTop);

	await dice.click();
	await expect(frames).toHaveCount(before + 1);
	const added = page.locator(':focus');
	await expect(added).toHaveAttribute('aria-label', /^Dice, .*position \d+, (\d+)/);
	const y = Number((await added.getAttribute('aria-label'))!.match(/position \d+, (\d+)/)![1]);
	// In the part of the board on screen, not in the free top-row slot it would have scrolled back
	// up to (y 24); and the board did not scroll back up.
	expect(y).toBeGreaterThan(24);
	expect(await board.evaluate((el) => el.scrollTop)).toBeGreaterThanOrEqual(scrolled - 4);
});

test('every button in the panel has a name (axe) and the library comes before More ways to add', async ({
	page,
}) => {
	await editBoard(page);
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(gallery(page).getByRole('button', { name: 'Add Dice', exact: true })).toBeVisible();

	const results = await new AxeBuilder({ page })
		.include('[data-testid="add-widget-gallery"]')
		.withRules(['button-name', 'nested-interactive', 'aria-hidden-focus', 'label'])
		.analyze();
	expect(results.violations).toEqual([]);

	const names = await gallery(page)
		.getByRole('button')
		.evaluateAll((nodes) => nodes.map((n) => n.getAttribute('aria-label') ?? n.textContent ?? ''));
	const rows = names.flatMap((name, index) => (/^Add \S/.test(name) ? [index] : []));
	expect(rows.length).toBeGreaterThan(5);
	expect(names.indexOf('Build your own')).toBeGreaterThan(Math.max(...rows));
	const more = gallery(page).getByRole('group', { name: 'More ways to add' });
	// RC-WID-6.7 — with the assistant off, Generate is the reason and a link to Settings, not a
	// button that opens a dialog saying the same thing.
	await expect(more.getByRole('group', { name: 'Generate with assistant' })).toContainText(
		'The assistant is off.',
	);
	await expect(more.getByRole('link', { name: 'Open Settings › Tool preferences' })).toBeVisible();
	await expect(more.getByRole('button')).toHaveCount(1);
});

test('the miniature shows on keyboard focus but is never in the tab order', async ({ page }) => {
	await editBoard(page);
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	const dice = gallery(page).getByRole('button', { name: 'Add Dice', exact: true });
	await expect(dice).toBeVisible();
	await expect(page.getByTestId('gallery-preview')).toHaveCount(0);

	const rows = gallery(page).locator('ul > li > button');
	const order = await rows.evaluateAll((nodes) => nodes.map((n) => n.getAttribute('aria-label')));
	const at = order.indexOf('Add Dice');
	expect(at).toBeGreaterThan(0);
	const next = order[at + 1];

	// Tab onto the Dice row from the one before it: keyboard focus draws the miniature beside it.
	await rows.nth(at - 1).focus();
	await page.keyboard.press('Tab');
	await expect(dice).toBeFocused();
	const preview = page.getByTestId('gallery-preview');
	await expect(preview).toBeVisible();
	await expect(preview).toHaveAttribute('aria-hidden', 'true');
	await expect(preview).toHaveAttribute('inert', '');
	expect(await preview.getByRole('button', { includeHidden: true }).count()).toBeGreaterThan(0);

	// The next Tab skips every control the miniature draws and lands on the next row.
	await page.keyboard.press('Tab');
	await expect(gallery(page).getByRole('button', { name: next!, exact: true })).toBeFocused();
	expect(
		await page.evaluate(() => !!document.activeElement?.closest('[data-testid="gallery-preview"]')),
	).toBe(false);
});

test('a mouse hover previews the row without moving the list', async ({ page, isMobile }) => {
	test.skip(isMobile, 'Touch has no hover; the phone sheet keeps the rows only.');
	await editBoard(page);
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	const dice = gallery(page).getByRole('button', { name: 'Add Dice', exact: true });
	const rest = (await dice.boundingBox())!;
	await dice.hover();
	const preview = page.getByTestId('gallery-preview');
	await expect(preview).toBeVisible();
	expect(await dice.boundingBox()).toEqual(rest);
	// It sits beside the panel, over the canvas, not on top of the rows.
	const panel = (await gallery(page).boundingBox())!;
	expect(
		(await preview.boundingBox())!.x + (await preview.boundingBox())!.width,
	).toBeLessThanOrEqual(panel.x);
	await page.mouse.move(0, 0);
	await expect(preview).toHaveCount(0);
});
