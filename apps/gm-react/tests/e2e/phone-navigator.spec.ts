import { expect, test, type CDPSession, type Locator, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// RC-CAN-5.4 — moving around a canvas screen on a phone. `/board` opens as the RC-CAN-5.1 panel
// list and offers a Layout view (`app/canvas/PhoneNavigator.tsx`): the real canvas at Comfortable
// and Detail, a titles-only overview at Fit, a pinch that steps between those three, edge fades,
// a minimap, a "Jump to tile" sheet and a full-screen tile. Both phone sizes the story names run
// every test: 360×640 (the short Android floor) and 390×844 (a current iPhone).

const PHONES = [
	{ width: 360, height: 640 },
	{ width: 390, height: 844 },
] as const;

/** Every tile on the home board, in the order the jump sheet lists them. */
async function homeTiles(page: Page): Promise<Array<{ id: string; title: string }>> {
	await page.waitForFunction(() => {
		const rt = window.__rt!;
		const id = rt.state.commandCenter.homeSceneId;
		return !!id && (rt.state.scenes.scenes[id]?.widgets.length ?? 0) > 1;
	});
	const ids = await page.evaluate(() => {
		const rt = window.__rt!;
		const scene = rt.state.scenes.scenes[rt.state.commandCenter.homeSceneId!];
		return [...scene.widgets]
			.sort((a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x)
			.map((w) => w.id);
	});
	// The titles come off the jump sheet's own rows, so the sheet must list every tile.
	await page.getByTestId('phone-jump-open').click();
	const sheet = page.getByRole('dialog', { name: 'Jump to tile' });
	await expect(sheet.getByRole('listitem')).toHaveCount(ids.length);
	const tiles: Array<{ id: string; title: string }> = [];
	for (const id of ids) {
		const row = sheet.getByTestId(`phone-jump-${id}`);
		tiles.push({ id, title: (await row.getAttribute('aria-label'))!.replace(/^Go to /, '') });
	}
	await page.keyboard.press('Escape');
	await expect(sheet).toBeHidden();
	return tiles;
}

async function openLayout(page: Page, size: { width: number; height: number }) {
	await page.setViewportSize(size);
	await markOnboarded(page);
	await gotoRoute(page, '/board');
	await seedFresh(page);
	await page.goto('/#/board', { waitUntil: 'domcontentloaded' });
	await waitReady(page);
	// The list is the phone's default reading; Layout is one press away.
	await expect(page.getByTestId('stacked-board')).toBeVisible();
	const board = page.getByRole('group', { name: 'Board view' });
	await expect(board.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
	await board.getByRole('button', { name: 'Layout' }).click();
	await expect(page.getByTestId('phone-navigator')).toBeVisible();
	await expect(page.getByTestId('scene-board-bounded')).toBeVisible();
	await expect(zoomStep(page, 'Comfortable')).toHaveAttribute('aria-pressed', 'true');
}

function zoomStep(page: Page, name: 'Fit' | 'Comfortable' | 'Detail'): Locator {
	return page.getByTestId('board-zoom-presets').getByRole('button', { name, exact: true });
}

/** The element the layout scrolls: the overview at Fit, the canvas otherwise. */
function scroller(page: Page): Locator {
	return page.locator(
		'[data-testid="phone-layout-overview"], [data-testid="phone-layout-stage"] [data-testid="scene-board-bounded"]',
	);
}

/**
 * A tile is "reached" when its top-left corner is inside the layout's visible box AND a hit test
 * there lands on the tile itself (not on the toolbar, the tab bar or another tile).
 */
async function reached(page: Page, testId: string): Promise<boolean> {
	return page.evaluate((id) => {
		const view = document.querySelector<HTMLElement>(
			'[data-testid="phone-layout-overview"], [data-testid="phone-layout-stage"] [data-testid="scene-board-bounded"]',
		);
		const tile = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
		if (!view || !tile) return false;
		const v = view.getBoundingClientRect();
		const r = tile.getBoundingClientRect();
		const x = Math.max(r.left, v.left) + 6;
		const y = Math.max(r.top, v.top) + 6;
		if (x > v.right - 1 || y > v.bottom - 1 || x > r.right || y > r.bottom) return false;
		const hit = document.elementFromPoint(x, y);
		return !!hit && tile.contains(hit);
	}, testId);
}

/**
 * One finger dragging the layout: real touch events through the browser's input pipeline, so the
 * scroll (and any momentum after it) is the browser's own. Chrome rails a drag to its dominant
 * axis, so the two axes are separate drags, each kept inside the layout's box.
 */
async function swipe(cdp: CDPSession, page: Page, dx: number, dy: number) {
	const box = (await scroller(page).boundingBox())!;
	const drag = async (fromX: number, fromY: number, byX: number, byY: number) => {
		const finger = (x: number, y: number) => [
			{ id: 1, x: Math.round(x), y: Math.round(y), radiusX: 4, radiusY: 4, force: 1 },
		];
		await cdp.send('Input.dispatchTouchEvent', {
			type: 'touchStart',
			touchPoints: finger(fromX, fromY),
		});
		for (let i = 1; i <= 10; i += 1) {
			await cdp.send('Input.dispatchTouchEvent', {
				type: 'touchMove',
				touchPoints: finger(fromX + (byX * i) / 10, fromY + (byY * i) / 10),
			});
		}
		await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	};
	const reachX = box.width - 40;
	const reachY = box.height - 40;
	const midY = box.y + box.height / 2;
	const midX = box.x + box.width / 2;
	// Content follows the finger, so scrolling right means dragging left.
	if (Math.abs(dx) > 2) {
		const by = -Math.sign(dx) * Math.min(Math.abs(dx), reachX);
		await drag(dx > 0 ? box.x + box.width - 20 : box.x + 20, midY, by, 0);
	}
	if (Math.abs(dy) > 2) {
		const by = -Math.sign(dy) * Math.min(Math.abs(dy), reachY);
		await drag(midX, dy > 0 ? box.y + box.height - 20 : box.y + 20, 0, by);
	}
	await page.waitForTimeout(150);
}

async function pinch(cdp: CDPSession, page: Page, from: number, to: number) {
	const box = (await scroller(page).boundingBox())!;
	const x = box.x + box.width / 2;
	const y = box.y + box.height / 2;
	const points = (d: number) => [
		{ id: 1, x: x - d / 2, y, radiusX: 4, radiusY: 4, force: 1 },
		{ id: 2, x: x + d / 2, y, radiusX: 4, radiusY: 4, force: 1 },
	];
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(from) });
	const steps = 6;
	for (let i = 1; i <= steps; i += 1) {
		await cdp.send('Input.dispatchTouchEvent', {
			type: 'touchMove',
			touchPoints: points(from + ((to - from) * i) / steps),
		});
	}
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/**
 * Every visible text run inside `<main>`, with the size it actually PAINTS at: the computed font
 * size times every ancestor transform's scale (the canvas scales its tiles with a transform).
 * Screen-reader-only text (clipped to 1px) is not painted and is skipped.
 */
async function smallText(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		const main = document.getElementById('main-content')!;
		const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
		const found: string[] = [];
		for (let node = walker.nextNode(); node; node = walker.nextNode()) {
			const text = node.textContent?.trim();
			const el = node.parentElement;
			if (!text || !el) continue;
			const range = document.createRange();
			range.selectNodeContents(node);
			const rects = [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1);
			if (rects.length === 0) continue;
			const style = getComputedStyle(el);
			if (style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
			let scale = 1;
			for (let a: Element | null = el; a; a = a.parentElement) {
				const transform = getComputedStyle(a).transform;
				if (transform && transform !== 'none') scale *= new DOMMatrixReadOnly(transform).a;
			}
			const painted = parseFloat(style.fontSize) * scale;
			if (painted < 11.99) found.push(`${painted.toFixed(1)}px "${text.slice(0, 40)}"`);
		}
		return found;
	});
}

for (const size of PHONES) {
	test.describe(`phone navigator at ${size.width}×${size.height}`, () => {
		test.use({ hasTouch: true, isMobile: true });

		test('one finger reaches every tile, across both axes', async ({ page }) => {
			await openLayout(page, size);
			const cdp = await page.context().newCDPSession(page);
			const tiles = await homeTiles(page);
			const view = scroller(page);
			// Touch panning is native scrolling: both axes, no pinch-zoom of the page.
			await expect(view).toHaveCSS('touch-action', 'pan-x pan-y');
			let maxLeft = 0;
			for (const tile of tiles) {
				for (
					let attempt = 0;
					attempt < 6 && !(await reached(page, `widget-${tile.id}`));
					attempt += 1
				) {
					const delta = await page.evaluate((id) => {
						const v = document
							.querySelector(
								'[data-testid="phone-layout-stage"] [data-testid="scene-board-bounded"]',
							)!
							.getBoundingClientRect();
						const r = document
							.querySelector(`[data-testid="widget-${id}"]`)!
							.getBoundingClientRect();
						return { dx: r.left - v.left - 12, dy: r.top - v.top - 12 };
					}, tile.id);
					await swipe(cdp, page, delta.dx, delta.dy);
				}
				expect(await reached(page, `widget-${tile.id}`), `pan to ${tile.title}`).toBe(true);
				maxLeft = Math.max(maxLeft, await view.evaluate((el) => el.scrollLeft));
			}
			// The board is wider than the phone at 1:1, so at least one tile needed a sideways pan.
			expect(maxLeft).toBeGreaterThan(0);
		});

		test('the jump sheet lists and reaches every tile, and opens each full screen', async ({
			page,
		}) => {
			await openLayout(page, size);
			const tiles = await homeTiles(page);
			// The phone's bottom tab bar (DS BottomTabBar); the sidebar's Primary nav is hidden here.
			const tabBar = page.getByRole('navigation', { name: 'Primary' }).filter({ visible: true });
			for (const tile of tiles) {
				await page.getByTestId('phone-jump-open').click();
				const sheet = page.getByRole('dialog', { name: 'Jump to tile' });
				await expect(sheet).toBeVisible();
				await sheet.getByRole('button', { name: `Go to ${tile.title}`, exact: true }).click();
				await expect(sheet).toBeHidden();
				const frame = page.getByTestId(`widget-${tile.id}`);
				await expect(frame).toBeFocused();
				await expect.poll(() => reached(page, `widget-${tile.id}`), tile.title).toBe(true);
			}
			// Full screen, from the same sheet, sits above the bottom navigation.
			for (const tile of tiles) {
				await page.getByTestId('phone-jump-open').click();
				const sheet = page.getByRole('dialog', { name: 'Jump to tile' });
				await sheet.getByRole('button', { name: `Expand ${tile.title}`, exact: true }).click();
				const full = page.getByTestId('phone-fullscreen');
				await expect(full).toBeVisible();
				await expect(full.getByRole('heading', { name: tile.title })).toBeVisible();
				await expect(page.getByTestId('phone-fullscreen-close')).toBeFocused();
				const box = (await full.boundingBox())!;
				expect(box.x).toBeGreaterThanOrEqual(0);
				expect(box.x + box.width).toBeLessThanOrEqual(size.width + 0.5);
				await expect(tabBar).toBeVisible();
				const nav = (await tabBar.boundingBox())!;
				expect(box.y + box.height).toBeLessThanOrEqual(nav.y + 0.5);
				await page.keyboard.press('Escape');
				await expect(full).toBeHidden();
				// Leaving full screen lands on the same tile in the layout.
				await expect(page.getByTestId(`widget-${tile.id}`)).toBeFocused();
			}
		});

		test('a pinch snaps between Fit, Comfortable and Detail; the overview opens tiles', async ({
			page,
		}) => {
			await openLayout(page, size);
			const cdp = await page.context().newCDPSession(page);
			const tiles = await homeTiles(page);
			await pinch(cdp, page, 100, 150);
			await expect(zoomStep(page, 'Detail')).toHaveAttribute('aria-pressed', 'true');
			await expect
				.poll(() =>
					page
						.getByTestId('scene-board-bounded')
						.evaluate((el) =>
							[...el.querySelectorAll<HTMLElement>('div')].some((d) =>
								d.style.transform.includes('scale(1.5)'),
							),
						),
				)
				.toBe(true);
			// Further out than the last step stays on it: no free percentage past Detail.
			await pinch(cdp, page, 100, 150);
			await expect(zoomStep(page, 'Detail')).toHaveAttribute('aria-pressed', 'true');
			await pinch(cdp, page, 150, 100);
			await expect(zoomStep(page, 'Comfortable')).toHaveAttribute('aria-pressed', 'true');
			await pinch(cdp, page, 150, 100);
			await expect(zoomStep(page, 'Fit')).toHaveAttribute('aria-pressed', 'true');
			const overview = page.getByTestId('phone-layout-overview');
			await expect(overview).toBeVisible();
			await expect(page.getByTestId('scene-board-bounded')).toHaveCount(0);
			// Every tile is on the overview, reachable, and one tap from full screen.
			for (const tile of tiles) {
				const card = page.getByTestId(`phone-overview-${tile.id}`);
				await card.scrollIntoViewIfNeeded();
				expect(await reached(page, `phone-overview-${tile.id}`), tile.title).toBe(true);
			}
			await page.getByTestId(`phone-overview-${tiles[0].id}`).click();
			await expect(page.getByTestId('phone-fullscreen')).toBeVisible();
			await page.getByTestId('phone-fullscreen-close').click();
			await expect(page.getByTestId(`phone-overview-${tiles[0].id}`)).toBeFocused();
			// Pinching out of the overview returns to the real tiles.
			await pinch(cdp, page, 100, 150);
			await expect(zoomStep(page, 'Comfortable')).toHaveAttribute('aria-pressed', 'true');
			await expect(page.getByTestId('scene-board-bounded')).toBeVisible();
		});

		test('edge fades mark where more board lies, and the minimap jumps there', async ({ page }) => {
			await openLayout(page, size);
			const view = scroller(page);
			await expect(page.getByTestId('phone-edge-fade-right')).toBeVisible();
			await expect(page.getByTestId('phone-edge-fade-left')).toHaveCount(0);
			await expect(page.getByTestId('phone-edge-fade-top')).toHaveCount(0);
			// Tap the minimap's far corner: the layout scrolls to the far end of the board.
			const map = page.getByTestId('phone-minimap');
			const box = (await map.boundingBox())!;
			await page.touchscreen.tap(box.x + box.width - 2, box.y + box.height - 2);
			await expect.poll(() => view.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
			await expect(page.getByTestId('phone-edge-fade-left')).toBeVisible();
			await expect(page.getByTestId('phone-edge-fade-right')).toHaveCount(0);
			// Tap the near corner to come back.
			await page.touchscreen.tap(box.x + 2, box.y + 2);
			await expect.poll(() => view.evaluate((el) => el.scrollLeft)).toBe(0);
			await expect(page.getByTestId('phone-edge-fade-left')).toHaveCount(0);
		});

		test('no text on the phone board paints below 12px, in any view', async ({ page }) => {
			await openLayout(page, size);
			const tiles = await homeTiles(page);
			for (const step of ['Comfortable', 'Detail', 'Fit'] as const) {
				await zoomStep(page, step).click();
				await expect(zoomStep(page, step)).toHaveAttribute('aria-pressed', 'true');
				expect(await smallText(page), `Layout at ${step}`).toEqual([]);
			}
			// A full-screen tile, and the jump sheet.
			await page.getByTestId(`phone-overview-${tiles[0].id}`).click();
			await expect(page.getByTestId('phone-fullscreen')).toBeVisible();
			expect(await smallText(page), 'full-screen tile').toEqual([]);
			await page.getByTestId('phone-fullscreen-close').click();
			await page.getByTestId('phone-jump-open').click();
			await expect(page.getByRole('dialog', { name: 'Jump to tile' })).toBeVisible();
			expect(await smallText(page), 'jump sheet').toEqual([]);
			await page.keyboard.press('Escape');
			// The panel list, every panel expanded, and one panel full screen.
			await page
				.getByRole('group', { name: 'Board view' })
				.getByRole('button', { name: 'List' })
				.click();
			await expect(page.getByTestId('stacked-board')).toBeVisible();
			expect(await smallText(page), 'panel list').toEqual([]);
			// Edit mode keeps the canvas, but never at Fit.
			await page.getByRole('button', { name: 'Edit layout' }).click();
			await expect(page.getByTestId('scene-board-bounded')).toBeVisible();
			await expect(zoomStep(page, 'Fit')).toHaveCount(0);
			expect(await smallText(page), 'edit mode').toEqual([]);
		});
	});
}
