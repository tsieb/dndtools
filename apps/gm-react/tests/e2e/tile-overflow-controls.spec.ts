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
		const tiles = page.locator('[data-testid^="widget-"][role="group"]');
		expect(await tiles.count()).toBeGreaterThan(0);
		for (const tile of await tiles.all()) {
			for (const button of await tile.getByRole('button').all()) {
				if (!(await button.isVisible())) continue;
				// Scrolling is the supported recovery for overflowing content; never grow the tile
				// or force a click, either of which would conceal a footer intercepting the centre.
				await button.scrollIntoViewIfNeeded();
				await expect
					.poll(
						() =>
							button.evaluate((el) => {
								const box = el.getBoundingClientRect();
								const hit = document.elementFromPoint(
									box.x + box.width / 2,
									box.y + box.height / 2,
								);
								return el === hit || el.contains(hit);
							}),
						{ message: (await button.getAttribute('aria-label')) ?? (await button.innerText()) },
					)
					.toBe(true);
			}
		}
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
			expect(box.height).toBeGreaterThanOrEqual(43.5);
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
