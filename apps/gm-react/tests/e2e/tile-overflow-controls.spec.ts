import { expect, test } from '@playwright/test';
import { gotoRoute, markOnboarded, preferPhoneCanvas, journeySurfaceIssues } from './_helpers';

for (const width of [1440, 834, 390]) {
	test(`live home tile controls receive centre taps at ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height: 1112 });
		await markOnboarded(page);
		await preferPhoneCanvas(page);
		await gotoRoute(page, '/board');
		await expect(page.locator('[data-widget-region]').first()).toBeVisible();
		await expect
			.poll(async () =>
				(await journeySurfaceIssues(page)).filter((issue) =>
					issue.startsWith('unrecoverable clip'),
				),
			)
			.toEqual([]);

		// The unchanged ENG-8.1 detector checks seeded home content above. Live combat's
		// compact name ellipses have a separate, pre-existing missing-title issue on phones.
		if (width >= 768) {
			const fit = page.getByRole('button', { name: 'Fit', exact: true }).first();
			await fit.click();
			await expect(fit).toHaveAttribute('aria-pressed', 'true');
		}
		const statuses = await page.evaluate(async () => {
			const rt = window.__rt!;
			const live = await rt.dispatch({
				type: 'session.set-workflow',
				actorId: rt.defaultActorId,
				payload: { workflow: 'active', activeSceneId: rt.state.commandCenter.homeSceneId },
			});
			const combat = await rt.dispatch({
				type: 'combat.start',
				actorId: rt.defaultActorId,
				payload: {
					combatants: [
						{ kind: 'monster', name: 'First foe', ac: 12, initiative: 18, maxHp: 30 },
						{ kind: 'monster', name: 'Second foe', ac: 12, initiative: 9, maxHp: 30 },
					],
				},
			});
			return [live.status, combat.status];
		});
		expect(statuses).toEqual(['accepted', 'accepted']);
		await expect(page.getByRole('region', { name: '2. Initiative Tracker' })).toContainText(
			'First foe',
		);
		// RC-ENG-8.15 — hit-test where everything RESTS: no scrolling into view first, which is how
		// this spec once passed while Next turn sat below the footer (RC-ENG-8.3 B2-1). The combat
		// tile's primary action must rest in view on every tier and receive a centre tap.
		const nextTurn = page
			.getByRole('region', { name: '2. Initiative Tracker' })
			.getByRole('button', { name: 'Next turn', exact: true });
		await expect(nextTurn).toBeVisible();
		// Scroll the PAGE to the tile (a phone canvas runs below the fold) and leave the tile's body
		// where it rests.
		await nextTurn.evaluate((el) => {
			const region = el.closest<HTMLElement>('[data-widget-region]')!;
			if (region.scrollTop !== 0) throw new Error('the body is not at rest');
			el.scrollIntoView({ block: 'center' });
			region.scrollTop = 0;
		});
		const restsInView = await nextTurn.evaluate((el) => {
			const box = el.getBoundingClientRect();
			const region = el.closest('[data-widget-region]')!.getBoundingClientRect();
			return box.top >= region.top - 1 && box.bottom <= region.bottom + 1;
		});
		expect(restsInView, 'Next turn rests inside its tile body').toBe(true);
		// Every control whose centre rests inside its tile's body gets the tap there: no footer, frame
		// or neighbour covers it. Content scrolled out of a body is that body's to recover.
		const covered = await page.evaluate(() => {
			const misses: string[] = [];
			for (const tile of document.querySelectorAll('[data-testid^="widget-"][role="group"]')) {
				for (const el of tile.querySelectorAll<HTMLElement>('button')) {
					const box = el.getBoundingClientRect();
					if (!box.width || !box.height) continue;
					const x = box.x + box.width / 2;
					const y = box.y + box.height / 2;
					if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
					let resting = true;
					for (let p = el.parentElement; p && p !== tile; p = p.parentElement) {
						if (getComputedStyle(p).overflowY === 'visible') continue;
						const clip = p.getBoundingClientRect();
						if (y < clip.top || y > clip.bottom) resting = false;
					}
					if (!resting) continue;
					const hit = document.elementFromPoint(x, y);
					if (!(el === hit || el.contains(hit)))
						misses.push(`${el.getAttribute('aria-label') ?? el.innerText} → ${hit?.tagName}`);
				}
			}
			return misses;
		});
		expect(covered).toEqual([]);
		await nextTurn.evaluate((el) => {
			const box = el.getBoundingClientRect();
			const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
			if (!(el === hit || el.contains(hit))) throw new Error('Next turn is covered');
		});
		const turnBefore = await page.evaluate(() => window.__rt!.state.session.combat.turn);
		const box = (await nextTurn.boundingBox())!;
		await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
		await expect
			.poll(() => page.evaluate(() => window.__rt!.state.session.combat.turn))
			.not.toBe(turnBefore);
		const footers = page.getByRole('button', { name: /^Grow .* to fit content$/ });
		expect(await footers.count()).toBeGreaterThan(0);
		for (const grow of await footers.all()) {
			// The footer must reserve space, not merely allow a tap through covered content.
			const overlap = await grow.evaluate((button) => {
				const footer = button.parentElement!;
				const region = footer.previousElementSibling!;
				return region.getBoundingClientRect().bottom - footer.getBoundingClientRect().top;
			});
			expect(overlap).toBeLessThanOrEqual(1);
			const box = (await grow.boundingBox())!;
			// One text row (WCAG 2.5.8's 24px) and a touch target's width: a 44px row hid the body.
			expect(box.height).toBeGreaterThanOrEqual(23.5);
			expect(box.height).toBeLessThanOrEqual(30);
			expect(box.width).toBeGreaterThanOrEqual(43.5);
			await expect(grow.locator('..')).toHaveCSS('pointer-events', 'none');
			await expect(grow).toHaveCSS('pointer-events', 'auto');
		}
	});
}

test('restoring a tile size removes overflow caused only by its footer', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 1112 });
	await markOnboarded(page);
	await preferPhoneCanvas(page);
	await gotoRoute(page, '/board');
	await expect(page.locator('[data-widget-region]').first()).toBeVisible();
	const original = await page.evaluate(() => {
		const rt = window.__rt!;
		const sceneId = rt.state.commandCenter.homeSceneId!;
		const timer = rt.state.scenes.scenes[sceneId].widgets.find((w) => w.type === 'timer')!;
		return { sceneId, widgetInstanceId: timer.id, w: timer.layout.w, h: timer.layout.h };
	});
	const tile = page.getByTestId(`widget-${original.widgetInstanceId}`);
	const grow = tile.getByRole('button', { name: /^Grow .* to fit content$/ });
	await expect(grow).toHaveCount(0);
	for (const size of [{ ...original, w: 160, h: 110 }, original]) {
		const status = await page.evaluate(async (payload) => {
			const rt = window.__rt!;
			return (
				await rt.dispatch({
					type: 'scene.resize-widget',
					actorId: rt.defaultActorId,
					payload,
				})
			).status;
		}, size);
		expect(status).toBe('accepted');
		if (size === original) await expect(grow).toHaveCount(0);
		else await expect(grow).toBeVisible();
	}
	await expect(tile.locator('[data-widget-region]')).not.toHaveAttribute('tabindex');
});
