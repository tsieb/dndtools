import { expect, test } from '@playwright/test';
import { gotoRoute, markOnboarded } from './_helpers';

for (const [tier, width] of [
	['sidebar', 1280],
	['rail', 900],
	['phone', 390],
] as const) {
	test(`${tier}: long pins and Demo campaign controls stay inside their clipping ancestors`, async ({
		page,
	}) => {
		await page.setViewportSize({ width, height: 844 });
		await markOnboarded(page);
		await page.addInitScript(() => {
			const vault = {
				id: 'local-shell-demo',
				name: 'Demo campaign with a very long campaign name',
				kind: 'demo',
				createdAt: '2026-03-14T15:30:00Z',
				lastOpenedAt: '2026-03-14T15:30:00Z',
			};
			localStorage.setItem(
				'dndtools:react:local-vaults-v1',
				JSON.stringify({
					schemaVersion: 1,
					vaults: [{ ...vault, id: 'primary', name: 'Your campaign', kind: 'campaign' }, vault],
				}),
			);
			localStorage.setItem('dndtools:react:selected-local-vault', vault.id);
			localStorage.setItem('dndtools:react:density', 'comfortable');
		});
		await gotoRoute(page, '/screens');
		await expect(page.getByTestId('screens-library')).toBeVisible();
		const name = 'An extraordinarily long pinned screen name that must leave its actions reachable';
		await page.evaluate(async (name) => {
			const rt = window.__rt!;
			const result = await rt.dispatch({
				type: 'scene.create',
				actorId: rt.defaultActorId,
				payload: { name, visibility: 'dm-only' },
			});
			if (result.status !== 'accepted') throw new Error(JSON.stringify(result));
			const id = result.events!.find((e) => e.kind === 'scene.created')!.sceneId as string;
			const pin = await rt.dispatch({
				type: 'scene.set-pinned',
				actorId: rt.defaultActorId,
				payload: { sceneId: id, pinned: true },
			});
			if (pin.status !== 'accepted') throw new Error(JSON.stringify(pin));
		}, name);
		if (tier === 'phone') await page.getByRole('button', { name: 'More', exact: true }).click();
		const scope =
			tier === 'phone'
				? page.getByRole('dialog', { name: 'All sections' })
				: tier === 'rail'
					? page.getByRole('navigation', { name: 'Primary' })
					: page.locator('aside');
		const pin = scope
			.getByRole('button', { name: tier === 'rail' ? name : new RegExp(name) })
			.first();
		await expect(pin).toBeVisible();
		const chip = scope.getByRole('button', { name: /^Local vaults/ });
		await expect(chip.getByText('Demo', { exact: true })).toBeVisible();
		const controls = [pin, chip];
		if (tier !== 'rail')
			controls.push(scope.getByRole('button', { name: `Actions for ${name}`, exact: true }));
		for (const control of controls) {
			await control.scrollIntoViewIfNeeded();
			expect(
				await control.evaluate((el) => {
					const r = el.getBoundingClientRect();
					const clips: string[] = [];
					for (let ancestor = el.parentElement; ancestor; ancestor = ancestor.parentElement) {
						const css = getComputedStyle(ancestor),
							a = ancestor.getBoundingClientRect();
						if (
							/auto|scroll|hidden|clip/.test(css.overflowX) &&
							(r.left < a.left + ancestor.clientLeft - 0.5 ||
								r.right > a.left + ancestor.clientLeft + ancestor.clientWidth + 0.5)
						)
							clips.push(ancestor.tagName);
					}
					return clips;
				}),
			).toEqual([]);
		}
		if (tier !== 'rail') {
			await scope.getByRole('button', { name: `Actions for ${name}`, exact: true }).click();
			await expect(page.getByRole('menuitem', { name: `Unpin ${name}` })).toBeVisible();
		}
	});
}
