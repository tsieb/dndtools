import { expect, test } from '@playwright/test';
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
		for (const route of ['/board', ...scenes.map((id) => `/scene/${id}`)]) {
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

for (const title of ['Initiative Tracker', 'Prep']) {
	test(`${title} scrolls by keyboard and grows to show complete content`, async ({
		page,
	}, testInfo) => {
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
		await grow.click();
		await expect
			.poll(() => region.evaluate((el) => el.scrollHeight - el.clientHeight))
			.toBeLessThan(2);
		expect(await tile.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(
			original,
		);
		await testInfo.attach(`${title}-whole`, {
			body: await tile.screenshot({ path: testInfo.outputPath('whole-tile.png') }),
			contentType: 'image/png',
		});
		await tile.getByRole('button', { name: 'Restore tile size' }).click();
		await expect
			.poll(() => tile.evaluate((el) => el.getBoundingClientRect().height))
			.toBe(original);
	});
}
