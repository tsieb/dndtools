import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh } from './_helpers';

async function axe(page: Page) {
	// Scan the final painted dialog, not a partially transparent frame during its entrance.
	await page.evaluate(async () => {
		await Promise.all(
			document
				.getAnimations()
				.filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
				.map((animation) => animation.finished.catch(() => undefined)),
		);
	});
	const results = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'])
		.analyze();
	expect(results.violations).toEqual([]);
}
test.beforeEach(async ({ page }) => {
	await markOnboarded(page);
	await gotoRoute(page, '/player');
	await seedFresh(page);
	await gotoRoute(page, '/player');
	await expect(page.getByTestId('character-sheet')).toBeVisible();
});

test('player polish: sheet, rest overlays and all tabs are axe clean', async ({ page }) => {
	await axe(page);
	const shortRest = page.getByRole('button', { name: 'Short rest', exact: true });
	const target = (await shortRest.boundingBox())!;
	expect(target.height).toBeGreaterThanOrEqual(48);
	expect(target.width).toBeGreaterThanOrEqual(48);
	const hpTarget = (await page
		.getByLabel('Hit point change amount', { exact: true })
		.boundingBox())!;
	expect(hpTarget.height).toBeGreaterThanOrEqual(48);
	expect(hpTarget.width).toBeGreaterThanOrEqual(48);
	await shortRest.focus();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('dialog')).toBeVisible();
	await axe(page);
	await page.keyboard.press('Escape');
	await expect(shortRest).toBeFocused();
	await page.getByRole('button', { name: 'Long rest', exact: true }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
	await axe(page);
	await page.keyboard.press('Escape');
	for (const name of ['Resources', 'Party', 'Level up', 'Journal', 'History']) {
		await page.getByRole('tab', { name, exact: true }).click();
		await axe(page);
	}
});

test('player polish: failed save keeps the draft and reports recovery; retry persists', async ({
	page,
}) => {
	await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
	await page.getByLabel('Race', { exact: true }).fill('Wood elf');
	await page.evaluate(() => {
		const rt = window.__rt!;
		const dispatch = rt.dispatch.bind(rt);
		rt.dispatch = async (command) => {
			if ((command as { type: string }).type === 'character.edit-field') {
				rt.dispatch = dispatch;
				await new Promise((resolve) => setTimeout(resolve, 500));
				throw new Error('test storage failure');
			}
			return dispatch(command);
		};
	});
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByRole('status').filter({ hasText: 'Saving character…' })).toBeVisible();
	await expect(page.getByRole('alert')).toContainText('Check your storage and try again.');
	await expect(page.getByLabel('Race', { exact: true })).toHaveValue('Wood elf');
	await axe(page);
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByRole('status').filter({ hasText: 'Character saved.' })).toBeVisible();
	await expect(page.getByRole('alert')).toHaveCount(0);
	await page.reload();
	await expect(
		page.getByTestId('character-sheet').getByText('Wood elf', { exact: true }),
	).toBeVisible();
});

test('player polish: empty actor projection is illustrated', async ({ page }) => {
	await page.evaluate(async () => {
		const rt = window.__rt!;
		const state = rt.state.characters as { characters: Record<string, { id: string }> };
		for (const character of Object.values(state.characters)) {
			const result = await rt.dispatch({
				type: 'character.set-sharing',
				actorId: rt.defaultActorId,
				payload: { characterId: character.id, visibility: 'dm-only', sharedWith: [] },
			});
			if (result.status !== 'accepted') throw new Error('Unable to prepare private roster');
		}
		rt.enterPreview({ role: 'observer' });
	});
	await expect(page.getByRole('heading', { name: 'No character yet' })).toBeVisible();
	await expect(page.locator('[data-illustration="characters-empty"]')).toBeVisible();
	await axe(page);
});

test('player polish: large text keeps sheet and rest controls reachable', async ({ page }) => {
	await page.setViewportSize({ width: 393, height: 700 });
	await page.addStyleTag({ content: 'html { font-size: 200%; }' });
	await page.getByRole('button', { name: 'Short rest', exact: true }).click();
	const dialog = page.getByRole('dialog');
	const cancel = dialog.getByRole('button', { name: 'Cancel', exact: true });
	await cancel.scrollIntoViewIfNeeded();
	await expect(cancel).toBeInViewport();
	await cancel.click();
	const amount = page.getByLabel('Hit point change amount', { exact: true });
	await amount.scrollIntoViewIfNeeded();
	await expect(amount).toBeInViewport();
});

test('player polish: discard names the character and cancel preserves the draft', async ({
	page,
}) => {
	await page.getByRole('tab', { name: 'Level up', exact: true }).click();
	await page.getByRole('button', { name: 'Level up (milestone)' }).click();
	await page.getByRole('button', { name: 'Discard level-up' }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toHaveAccessibleName(/Discard .+’s level-up\?/);
	await axe(page);
	await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Discard level-up' })).toBeVisible();
});

test('player polish: actor projection hides private PCs and runtime rejects preview writes', async ({
	page,
}) => {
	const projection = await page.evaluate(
		async (queryUrl) => {
			const rt = window.__rt!;
			rt.enterPreview({
				role: 'player',
				playerActorId: rt.actors.find((a) => a.role === 'player')!.id,
			});
			const core = await new Function('url', 'return import(url)')(queryUrl);
			const pcs = core
				.listCharactersForActor(rt.state.characters, rt.state.permissions, rt.defaultActorId)
				.filter((c: { kind: string }) => c.kind === 'pc');
			const result = await rt.dispatch({
				type: 'character.edit-field',
				actorId: rt.defaultActorId,
				payload: { characterId: pcs[0].id, path: 'data.race', value: 'Forbidden' },
			});
			return { names: pcs.map((c: { name: string }) => c.name), status: result.status };
		},
		`/@fs${fileURLToPath(new URL('../../../../packages/core/src/queries/character-query.ts', import.meta.url))}`,
	);
	expect(projection.status).toBe('rejected');
	expect(projection.names.length).toBeGreaterThan(0);
	await expect(page.getByTestId('character-sheet')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Short rest', exact: true })).toHaveCount(0);
	await expect(
		page.locator('#main-content').getByText(projection.names[0], { exact: true }).first(),
	).toBeVisible();
	await axe(page);
});
