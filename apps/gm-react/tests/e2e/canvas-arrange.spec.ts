import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh, waitReady, preferPhoneCanvas } from './_helpers';

/** Only Tab changes focus: no pointer, locator.focus(), or DOM focus injection. */
async function tabTo(page: Page, target: Locator) {
	for (let step = 0; step < 120; step++) {
		if (await target.evaluate((node) => node === document.activeElement)) return;
		await page.keyboard.press('Tab');
	}
	await expect(target).toBeFocused();
}

const axe = (page: Page) =>
	new AxeBuilder({ page }).include('[data-testid="scene-board-bounded"]').analyze();

const geometry = (frames: Locator) =>
	frames.evaluateAll((nodes) =>
		nodes
			.map((node) => {
				const style = (node as HTMLElement).style;
				return {
					id: node.getAttribute('data-testid')!,
					x: parseFloat(style.left),
					y: parseFloat(style.top),
					z: Number(style.zIndex),
				};
			})
			.sort((a, b) => a.y - b.y),
	);

test('RC-CAN-3.6: keyboard-only multi-select aligns and layers three tiles', async ({ page }) => {
	await preferPhoneCanvas(page);
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
	while (await frames.count()) {
		await tabTo(page, frames.first());
		const count = await frames.count();
		await page.keyboard.press('Delete');
		await expect(frames).toHaveCount(count - 1);
	}
	// The gallery (RC-CAN-4.1) fills the first open slot, so the three start at three different lefts.
	for (let count = 0; count < 3; count++) {
		await tabTo(page, count ? frames.first() : board);
		await page.keyboard.press('a');
		const note = page.getByTestId('add-widget-gallery').getByTestId('gallery-entry-note');
		await tabTo(page, note);
		await page.keyboard.press('Enter');
		await expect(frames).toHaveCount(count + 1);
	}
	const before = await geometry(frames);
	expect(new Set(before.map((tile) => tile.x)).size).toBe(3);
	const [top, middle, bottom] = before.map((tile) => page.getByTestId(tile.id));

	// Space selects the first tile; Shift+Space adds each of the others.
	await tabTo(page, top);
	await page.keyboard.press('Space');
	await tabTo(page, middle);
	await page.keyboard.press('Shift+Space');
	await tabTo(page, bottom);
	await page.keyboard.press('Shift+Space');
	const bar = page.getByRole('toolbar', { name: 'Arrange 3 selected tiles' });
	await expect(bar).toBeVisible();
	for (const tile of [top, middle, bottom])
		await expect(tile).toHaveAttribute('aria-label', /selected/);

	// Alt+A aligns the selection's left edges to its leftmost tile.
	await page.keyboard.press('Alt+a');
	const left = Math.min(...before.map((tile) => tile.x));
	await expect
		.poll(async () => (await geometry(frames)).map((tile) => tile.x))
		.toEqual([left, left, left]);
	await expect(board.getByTestId('canvas-resize-announcement')).toHaveText('Arranged 3 tiles.');
	// Tops are untouched: align left moves along one axis only.
	expect((await geometry(frames)).map((tile) => tile.y)).toEqual(before.map((tile) => tile.y));
	await expect(bottom).toBeFocused();

	// Alt+W aligns their tops as well, and the selection survives both arrangements.
	await page.keyboard.press('Alt+w');
	const topEdge = Math.min(...before.map((tile) => tile.y));
	await expect
		.poll(async () => new Set((await geometry(frames)).map((tile) => tile.y)))
		.toEqual(new Set([topEdge]));
	await expect(bar).toBeVisible();
	expect((await axe(page)).violations).toEqual([]);

	// Escape collapses the selection. Ctrl+] brings a lone tile forward; Ctrl+Shift+[ sends it back.
	await page.keyboard.press('Escape');
	await expect(bar).toBeHidden();
	const stackOf = async (id: string) => (await geometry(frames)).find((tile) => tile.id === id)!.z;
	const topId = before[0].id;
	const lowest = Math.min(...(await geometry(frames)).map((tile) => tile.z));
	await tabTo(page, top);
	await page.keyboard.press('Space');
	await page.keyboard.press('Control+BracketRight');
	await expect.poll(() => stackOf(topId)).toBeGreaterThan(lowest);
	await page.keyboard.press('Control+Shift+BracketLeft');
	await expect.poll(() => stackOf(topId)).toBe(lowest);

	expect((await axe(page)).violations).toEqual([]);
});
