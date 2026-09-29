import { expect, test, type Page } from '@playwright/test';
import {
	gotoRoute,
	markOnboarded,
	journeySurfaceIssues,
	dispatch,
	preferPhoneCanvas,
} from './_helpers';

for (const width of [1440, 900, 375]) {
	test(`default tile content remains recoverable at ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height: 900 });
		test.setTimeout(90_000);
		await markOnboarded(page);
		await gotoRoute(page, '/board');
		await expect(page.locator('[data-widget-region]').first()).toBeVisible();
		for (const templateId of ['combat', 'social', 'exploration', 'town', 'session-prep']) {
			const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
			expect(
				(await dispatch(page, { type: 'scene.create', actorId, payload: { name: templateId } }))
					.status,
			).toBe('accepted');
			const sceneId = await page.evaluate(
				(name) => Object.values(window.__rt!.state.scenes.scenes).find((s) => s.name === name)!.id,
				templateId,
			);
			expect(
				(
					await dispatch(page, {
						type: 'scene.apply-template',
						actorId,
						payload: { sceneId, source: { kind: 'builtin', templateId: templateId } },
					})
				).status,
			).toBe('accepted');
		}
		const scenes = await page.evaluate(() =>
			Object.values(window.__rt!.state.scenes.scenes)
				.filter((s) => s.widgets.length)
				.map((s) => s.id),
		);
		// A screen IS a scene (ADR-041): check each one on both of its surfaces.
		const routes = scenes.flatMap((id) => [`/scene/${id}`, `/screen/${encodeURIComponent(id)}`]);
		for (const route of ['/board', ...routes]) {
			await gotoRoute(page, route);
			await expect(page.locator('[data-widget-region]').first()).toBeVisible();
			await expect
				.poll(
					async () =>
						(await journeySurfaceIssues(page)).filter((issue) =>
							issue.startsWith('unrecoverable clip'),
						),
					{ message: route },
				)
				.toEqual([]);
		}
	});
}

/**
 * How far each region's lowest text or control reaches past the first pixel it can be seen in:
 * the region's bottom edge, or the top of its overlaid footer. At most ~1 means whole.
 */
function clippedTiles(page: Page) {
	return page.evaluate(() =>
		Object.fromEntries(
			[...document.querySelectorAll<HTMLElement>('[data-widget-region]')].map((region) => {
				const footer = region.nextElementSibling;
				const edge = (footer ?? region).getBoundingClientRect()[footer ? 'top' : 'bottom'];
				const reach = [
					...region.querySelectorAll<HTMLElement>('button, [role="timer"], div:not(:has(*))'),
				]
					.filter((el) => el.textContent?.trim() || el.matches('button'))
					.map((el) => el.getBoundingClientRect().bottom - edge);
				return [region.getAttribute('aria-label')!, Math.round(Math.max(-999, ...reach))];
			}),
		),
	);
}

// The two screenshot cases and their neighbours: tiles whose content fits the default home board
// must render whole, with no overflow footer taking room from them, at the desktop and rail tiers.
for (const [width, height] of [
	[1280, 800],
	[834, 1112],
]) {
	test(`default home tiles that fit render whole at ${width}px`, async ({ page }, testInfo) => {
		await markOnboarded(page);
		await page.setViewportSize({ width, height });
		await gotoRoute(page, '/board');
		await expect(page.locator('[data-widget-region]').first()).toBeVisible();
		const initiative = page.getByRole('region', { name: '2. Initiative Tracker' });
		await expect(initiative.getByText('No combat running · HP shown')).toBeVisible();
		await expect(initiative.getByRole('button', { name: /Next turn/ })).toBeVisible();
		const whole = [
			'2. Initiative Tracker',
			'3. Dice',
			'4. Timer',
			'5. Audio',
			'6. Quick Reference',
		];
		await expect
			.poll(async () => {
				const reach = await clippedTiles(page);
				return whole.filter((name) => reach[name] > 1);
			})
			.toEqual([]);
		for (const name of ['2. Initiative Tracker', '4. Timer', '6. Quick Reference']) {
			const region = page.getByRole('region', { name });
			// Nothing to scroll: no tab stop, no footer.
			await expect(region).not.toHaveAttribute('tabindex');
			await expect(region.locator('xpath=..')).not.toContainText(/more line|More below|Grow/);
		}
		await testInfo.attach(`initiative-${width}`, {
			body: await initiative.screenshot(),
			contentType: 'image/png',
		});
	});
}

test('Prep scrolls by keyboard and grows to show complete content', async ({ page }, testInfo) => {
	const title = 'Prep';
	await markOnboarded(page);
	await preferPhoneCanvas(page);
	await page.setViewportSize({ width: 1440, height: 1000 });
	await gotoRoute(page, '/board');
	await expect(page.locator('[data-widget-region]').first()).toBeVisible();
	const grow = page
		.getByRole('button', { name: new RegExp(`Grow .*${title} to fit content`) })
		.first();
	await expect(grow).toBeVisible();
	const tileId = await grow
		.locator('xpath=ancestor::*[starts-with(@data-testid,"widget-")][1]')
		.getAttribute('data-testid');
	const tile = page.getByTestId(tileId!);
	const region = tile.locator('[data-widget-region]');
	await expect(tile).toHaveAccessibleName(new RegExp(title));
	await expect(tile.locator(`span[title="${title}"]`)).toHaveText(title);
	await expect(tile.getByText(/\d+ more lines?/)).toBeVisible();
	const original = await tile.evaluate((el) => el.getBoundingClientRect().height);
	await region.focus();
	await page.keyboard.press('End');
	await expect.poll(() => region.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
	// At the end the last row clears the overlaid footer.
	await expect(tile.getByText('End of content')).toBeVisible();
	await expect.poll(async () => (await clippedTiles(page))[`7. ${title}`]).toBeLessThanOrEqual(1);
	await grow.click();
	await expect
		.poll(() => region.evaluate((el) => el.scrollHeight - el.clientHeight))
		.toBeLessThan(2);
	expect(await tile.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(original);
	// Grown, every row sits above the footer that now holds Restore.
	await expect.poll(async () => (await clippedTiles(page))[`7. ${title}`]).toBeLessThanOrEqual(1);
	await expect(region).not.toHaveAttribute('tabindex');
	await testInfo.attach(`${title}-whole`, {
		body: await tile.screenshot({ path: testInfo.outputPath('whole-tile.png') }),
		contentType: 'image/png',
	});
	// Grow and Restore are one control, so focus stays on it through both.
	const restore = tile.getByRole('button', { name: 'Restore tile size' });
	await expect(restore).toBeFocused();
	await restore.click();
	await expect.poll(() => tile.evaluate((el) => el.getBoundingClientRect().height)).toBe(original);
	await expect(grow).toBeFocused();
	await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
	await expect(region).toHaveAttribute('tabindex', '-1');
	await page.getByRole('button', { name: 'Done', exact: true }).click();
	await expect(region).toHaveAttribute('tabindex', '0');
});

test('Grow converges for a body that grows with its tile', async ({ page }) => {
	await markOnboarded(page);
	await page.setViewportSize({ width: 1280, height: 800 });
	await gotoRoute(page, '/board');
	await expect(page.locator('[data-widget-region]').first()).toBeVisible();
	// The Timer's body fills and centres in its tile, so each px the tile grows moves the controls
	// down too: one measured delta leaves them short, and only re-measuring converges.
	const { sceneId, widgetInstanceId, actorId } = await page.evaluate(() => {
		const state = window.__rt!.state as unknown as {
			commandCenter: { homeSceneId: string };
			scenes: { scenes: Record<string, { widgets: { id: string; type: string }[] }> };
		};
		const sceneId = state.commandCenter.homeSceneId;
		const timer = state.scenes.scenes[sceneId].widgets.find((w) => w.type.endsWith('timer'))!;
		return { sceneId, widgetInstanceId: timer.id, actorId: window.__rt!.defaultActorId };
	});
	const resized = await dispatch(page, {
		type: 'scene.resize-widget',
		actorId,
		payload: { sceneId, widgetInstanceId, w: 160, h: 110 },
	});
	expect(resized.status, JSON.stringify(resized)).toBe('accepted');
	const tile = page.getByTestId(`widget-${widgetInstanceId}`);
	const region = tile.locator('[data-widget-region]');
	const grow = tile.getByRole('button', { name: /Grow .*Timer to fit content/ });
	await expect(grow).toBeVisible();
	await grow.click();
	await expect(tile.getByRole('button', { name: 'Restore tile size' })).toBeVisible();
	await expect
		.poll(async () => (await clippedTiles(page))[(await region.getAttribute('aria-label'))!])
		.toBeLessThanOrEqual(1);
	await expect
		.poll(() => region.evaluate((el) => el.scrollHeight - el.clientHeight))
		.toBeLessThan(2);
	await expect(tile.getByText('End of content')).toBeVisible();
});
