import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded } from './_helpers';

async function seedPins(page: Page) {
	return page.evaluate(async () => {
		const rt = window.__rt!;
		const ids: string[] = [];
		for (const name of ['First pin', 'Second pin']) {
			const created = await rt.dispatch({
				type: 'scene.create',
				actorId: rt.defaultActorId,
				payload: { name, visibility: 'dm-only' },
			});
			if (created.status !== 'accepted') throw new Error(JSON.stringify(created));
			const id = created.events!.find((event) => event.kind === 'scene.created')!.sceneId as string;
			const pinned = await rt.dispatch({
				type: 'scene.set-pinned',
				actorId: rt.defaultActorId,
				payload: { sceneId: id, pinned: true },
			});
			if (pinned.status !== 'accepted') throw new Error(JSON.stringify(pinned));
			ids.push(id);
		}
		return ids;
	});
}
async function reorderCount(page: Page) {
	return page.evaluate(
		() =>
			window.__rt!.state.sync.operations.filter(
				(op) => (op as { opType: string }).opType === 'scene.reorder-pins',
			).length,
	);
}
for (const [tier, width] of [
	['desktop', 1440],
	['rail', 900],
	['phone', 390],
] as const) {
	test(`${tier}: ordered pins, navigation and unique landmarks`, async ({ page }) => {
		await page.setViewportSize({ width, height: 1000 });
		await markOnboarded(page);
		await gotoRoute(page, '/screens');
		await expect(page.getByTestId('screens-library')).toBeVisible();
		const [first, second] = await seedPins(page);
		if (tier === 'phone') await page.getByRole('button', { name: 'More', exact: true }).click();
		const capture = test.info().outputPath(`pins-${tier}.png`);
		await page.screenshot({ path: capture, animations: 'disabled' });
		await test.info().attach(`pins-${tier}`, { path: capture, contentType: 'image/png' });
		const pins = page.getByTestId('pinned-screens');
		if (tier === 'rail') {
			const nav = page.getByRole('navigation', { name: 'Primary' });
			await expect(nav.getByRole('button', { name: 'First pin', exact: true })).toBeVisible();
			expect(
				await nav
					.getByRole('button', { name: /^(First|Second) pin$/ })
					.evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label'))),
			).toEqual(['First pin', 'Second pin']);
			await nav.getByRole('button', { name: 'Second pin', exact: true }).click();
		} else {
			await expect(pins.locator('[data-screen-pin]').first()).toHaveAttribute('role', 'listitem');
			await expect(pins.locator('[data-screen-pin]').first()).toHaveAttribute(
				'data-screen-pin',
				first,
			);
			if (tier === 'phone') {
				const dialog = page.getByRole('dialog');
				const vaults = dialog.getByRole('button', { name: /Local vaults/ });
				for (const name of ['New screen', 'All screens', 'Actions for First pin']) {
					expect(
						(await dialog.getByRole('button', { name, exact: true }).boundingBox())!.height,
					).toBeGreaterThanOrEqual(44);
				}

				expect((await pins.boundingBox())!.y).toBeLessThan((await vaults.boundingBox())!.y);
			}
			const before = await reorderCount(page);
			await pins.getByRole('button', { name: /Second pin.*DM only/ }).focus();
			await page.keyboard.press('Alt+ArrowUp');
			await expect(pins.locator('[data-screen-pin]').first()).toHaveAttribute(
				'data-screen-pin',
				second,
			);
			await expect.poll(() => reorderCount(page)).toBe(before + 1);
			await expect(pins.getByRole('button', { name: /Second pin.*DM only/ })).toBeFocused();
			// A drag uses the same one-command path as the keyboard.
			if (tier === 'desktop') {
				await pins
					.locator(`[data-screen-pin="${second}"]`)
					.dragTo(pins.locator(`[data-screen-pin="${first}"]`));
				await expect(pins.locator('[data-screen-pin]').first()).toHaveAttribute(
					'data-screen-pin',
					first,
				);
				await expect.poll(() => reorderCount(page)).toBe(before + 2);
			}
			await pins.getByRole('button', { name: /Second pin.*DM only/ }).click();
		}
		await page.waitForURL((url) => url.hash === `#/screen/${second}`);
		// Selection alone is not Live: workflow owns the posture at every tier.
		const liveResult = await page.evaluate(async (sceneId) => {
			const rt = window.__rt!;
			return rt.dispatch({
				type: 'session.set-workflow',
				actorId: rt.defaultActorId,
				payload: { workflow: 'active', activeSceneId: sceneId },
			});
		}, second);
		expect(liveResult.status).toBe('accepted');
		if (tier === 'rail')
			await expect(
				page
					.getByRole('navigation', { name: 'Primary' })
					.getByRole('button', { name: 'Second pin · Live' }),
			).toBeVisible();
		else {
			if (tier === 'phone') await page.getByRole('button', { name: 'More', exact: true }).click();
			await expect(pins.getByRole('button', { name: /Second pin.*Live/ })).toBeVisible();
			if (tier === 'phone') await page.keyboard.press('Escape');
		}
		const standby = await page.evaluate(async () => {
			const rt = window.__rt!;
			return rt.dispatch({
				type: 'session.set-workflow',
				actorId: rt.defaultActorId,
				payload: { workflow: 'idle' },
			});
		});
		expect(standby.status).toBe('accepted');

		if (tier === 'phone') {
			await expect(page.getByRole('dialog')).toHaveCount(0);
			await page.getByRole('button', { name: 'More', exact: true }).click();
		}
		const axe = await new AxeBuilder({ page }).withRules(['landmark-unique']).analyze();
		expect(axe.violations).toEqual([]);
		if (tier !== 'rail') {
			await pins.getByRole('button', { name: 'Actions for Second pin' }).click();
			await pins.getByRole('menuitem', { name: 'Unpin Second pin' }).click();
			await expect(pins.locator(`[data-screen-pin="${second}"]`)).toHaveCount(0);
			await pins.getByRole('button', { name: /First pin.*DM only/ }).click();
			await page.waitForURL((url) => url.hash === `#/screen/${first}`);
		}
	});
}

test('sidebar create intent opens the template dialog; header pin and library unpin update the shell', async ({
	page,
}) => {
	await page.setViewportSize({ width: 1440, height: 1000 });
	await markOnboarded(page);
	await gotoRoute(page, '/screens');
	await page
		.getByRole('navigation', { name: 'Primary' })
		.getByRole('button', { name: 'New screen' })
		.click();
	await expect(page.getByRole('dialog', { name: 'New screen' })).toBeVisible();
	await page.keyboard.press('Escape');
	const [first] = await seedPins(page);
	await gotoRoute(page, `/screen/${first}`);
	await page.getByTestId('screen-pin').click();
	await expect(page.locator(`[data-screen-pin="${first}"]`)).toHaveCount(0);
	await page.getByTestId('screen-pin').click();
	await expect(page.locator(`[data-screen-pin="${first}"]`)).toHaveCount(1);
	await page
		.getByRole('navigation', { name: 'Primary' })
		.getByRole('button', { name: 'All screens' })
		.click();
	await page
		.getByTestId(`screen-card-${first}`)
		.getByRole('button', { name: 'Unpin First pin' })
		.click();
	await expect(page.locator(`[data-screen-pin="${first}"]`)).toHaveCount(0);
});
