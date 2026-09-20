import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { enterPreview, gotoRoute, markOnboarded } from './_helpers';

async function clean(page: Page) {
	// Scan the settled state, not a translucent frame of the dialog entry animation.
	await page.evaluate(async () => {
		await Promise.all(
			document
				.getAnimations()
				.filter((a) => a.effect?.getTiming().iterations !== Infinity)
				.map((a) => a.finished.catch(() => {})),
		);
	});
	const results = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
		.analyze();
	expect(results.violations).toEqual([]);
}

test('builder route, every step and discard overlay are accessible; keyboard stays in the confirmation', async ({
	page,
}) => {
	await markOnboarded(page);
	await gotoRoute(page, '/characters');
	await clean(page);
	await page.getByRole('button', { name: 'New character', exact: true }).first().click();
	await clean(page);
	await page.getByRole('button', { name: /Build from scratch/ }).click();
	const wizard = page.getByRole('dialog', { name: 'New character wizard' });
	await wizard.getByRole('button', { name: 'NPC', exact: true }).click();
	await wizard.getByLabel('Name', { exact: true }).fill('Polish traveller');
	for (let step = 0; step < 6; step++) {
		if (step === 4)
			await wizard.getByLabel('DM notes', { exact: true }).fill('Private builder secret');
		await clean(page);
		if (step < 5) await wizard.getByRole('button', { name: 'Continue', exact: true }).click();
	}
	await wizard.getByRole('button', { name: 'Cancel', exact: true }).click();
	const confirm = page.getByRole('alertdialog');
	await expect(confirm).toBeVisible();
	await expect(confirm.getByRole('button', { name: 'Keep editing' })).toBeFocused();
	await clean(page);
	for (let i = 0; i < 8; i++) {
		await page.keyboard.press('Tab');
		expect(await confirm.evaluate((el) => el.contains(document.activeElement))).toBe(true);
	}
	await page.keyboard.press('Escape');
	await expect(confirm).toHaveCount(0);
	await expect(wizard.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
	await wizard.getByRole('button', { name: 'Create character', exact: true }).press('Enter');
	await expect(wizard).toHaveCount(0);
	await expect(page.getByText('Polish traveller').first()).toBeVisible();
	await enterPreview(page, 'player');
	await expect(page.getByText('Polish traveller').first()).toBeVisible();
	await expect(page.getByText('Private builder secret')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'New character', exact: true })).toHaveCount(0);
	const refused = await page.evaluate(async () => {
		const rt = window.__rt!;
		const result = await rt.dispatch({
			type: 'character.quick-create',
			actorId: rt.defaultActorId,
			payload: {
				kind: 'npc',
				name: 'Preview must not create',
				visibility: 'dm-only',
				abilityScores: {},
				combat: {},
			},
		});
		return { status: result.status, message: result.rejection?.message };
	});
	expect(refused.status).toBe('rejected');
	expect(refused.message).toMatch(/read.only/i);
});

test('import failure is accessible and recoverable without writing a character', async ({
	page,
}) => {
	await markOnboarded(page);
	await gotoRoute(page, '/characters');
	await page.getByRole('button', { name: 'New character', exact: true }).first().click();
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: /Import character file/ }).click();
	await (
		await chooser
	).setFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('[]') });
	const preview = page.getByRole('dialog', { name: 'Import character file' });
	await expect(preview.getByRole('alert')).toBeVisible();
	await clean(page);
	const retry = page.waitForEvent('filechooser');
	await preview.getByRole('button', { name: 'Choose another file' }).click();
	await (
		await retry
	).setFiles({
		name: 'traveller.json',
		mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify({ name: 'Recovered traveller', kind: 'npc' })),
	});
	await expect(preview.getByRole('alert')).toHaveCount(0);
	await clean(page);
	await preview.getByRole('button', { name: 'Import character', exact: true }).click();
	await expect(preview).toHaveCount(0);
	await expect(page.getByText('Recovered traveller').first()).toBeVisible();
});

test('large text keeps the entry paths, wizard and discard recovery reachable', async ({
	page,
}) => {
	await markOnboarded(page);
	await gotoRoute(page, '/characters');
	await page.evaluate(() => {
		document.documentElement.style.fontSize = '200%';
	});
	await page.getByRole('button', { name: 'New character', exact: true }).first().click();
	await page.getByRole('button', { name: /Build from scratch/ }).click();
	const wizard = page.getByRole('dialog', { name: 'New character wizard' });
	await wizard.getByLabel('Name', { exact: true }).fill('Large text traveller');
	await wizard.getByRole('button', { name: 'Continue', exact: true }).click();
	await expect(wizard.getByRole('heading', { name: 'Class & level', exact: true })).toBeVisible();
	expect(await wizard.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
	await wizard.getByRole('button', { name: 'Cancel', exact: true }).click();
	await page.getByRole('button', { name: 'Discard character', exact: true }).click();
	await expect(wizard).toHaveCount(0);
	await page.getByRole('button', { name: 'New character', exact: true }).first().click();
	await expect(page.getByRole('button', { name: /Build from scratch/ })).toBeVisible();
});

test('a character can be built using only the keyboard', async ({ page }) => {
	await markOnboarded(page);
	await gotoRoute(page, '/characters');
	const reach = async (target: import('@playwright/test').Locator) => {
		for (let tabs = 0; tabs < 100; tabs++) {
			if (await target.evaluate((el) => el === document.activeElement)) return;
			await page.keyboard.press('Tab');
		}
		await expect(target).toBeFocused();
	};
	await reach(page.getByRole('button', { name: 'New character', exact: true }).first());
	await page.keyboard.press('Enter');
	await reach(page.getByRole('button', { name: /Build from scratch/ }));
	await page.keyboard.press('Enter');
	const wizard = page.getByRole('dialog', { name: 'New character wizard' });
	await reach(wizard.getByRole('button', { name: 'NPC', exact: true }));
	await page.keyboard.press('Space');
	await reach(wizard.getByLabel('Name', { exact: true }));
	await page.keyboard.type('Keyboard traveller');
	for (let step = 0; step < 5; step++) {
		await reach(wizard.getByRole('button', { name: 'Continue', exact: true }));
		await page.keyboard.press('Enter');
	}
	await reach(wizard.getByRole('button', { name: 'Create character', exact: true }));
	await page.keyboard.press('Enter');
	await expect(wizard).toHaveCount(0);
	await expect(page.getByText('Keyboard traveller').first()).toBeVisible();
});
