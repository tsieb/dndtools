import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh } from './_helpers';

async function openRoster(page: Page) {
	await markOnboarded(page);
	await gotoRoute(page, '/characters');
	await seedFresh(page);
	await expect(page.getByRole('button', { name: 'Sera Duskwhisper', exact: true })).toBeVisible();
}
async function secondary(page: Page, name: string) {
	const more = page.getByRole('button', { name: 'More character actions' });
	if (await more.isVisible()) await more.click();
	await page.getByRole('button', { name, exact: true }).click();
}
async function axe(page: Page) {
	const results = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'])
		.analyze();
	expect(results.violations).toEqual([]);
}

test('roster polish: axe on roster, action sheet, creation chooser and import overlay', async ({
	page,
}) => {
	await openRoster(page);
	await axe(page);
	const more = page.getByRole('button', { name: 'More character actions' });
	if (await more.isVisible()) {
		await more.click();
		await expect(page.getByRole('dialog', { name: 'More character actions' })).toBeVisible();
		await axe(page);
		await page.keyboard.press('Escape');
		await expect(more).toBeFocused();
	}
	await page.getByRole('button', { name: 'New character', exact: true }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
	await axe(page);
	await page.keyboard.press('Escape');
	await secondary(page, 'Import character (JSON)');
	await expect(page.getByRole('dialog')).toBeVisible();
	await axe(page);
});

test('roster polish: failed combat write shows recovery and can be retried', async ({ page }) => {
	await openRoster(page);
	await page.evaluate(() => {
		const rt = window.__rt!;
		const dispatch = rt.dispatch.bind(rt);
		rt.dispatch = async (command) => {
			if ((command as { type: string }).type === 'combat.start') {
				rt.dispatch = dispatch;
				await new Promise((resolve) => setTimeout(resolve, 500));
				throw new Error('test storage failure');
			}
			return dispatch(command);
		};
	});
	await secondary(page, 'Start combat');
	await expect(page.getByRole('status').filter({ hasText: 'Starting combat…' })).toBeVisible();
	await expect(page.getByRole('alert')).toContainText('Check your storage and try again.');
	await axe(page);
	await page.getByRole('button', { name: 'Dismiss message' }).click();
	await expect(page.getByRole('alert')).toHaveCount(0);
	await secondary(page, 'Start combat');
	// The retry reaches the real core, which requires an active session.
	await expect(page.getByRole('alert')).toBeVisible();
	await expect(page.getByRole('alert')).not.toContainText('Check your storage');
});

test('roster polish: preview projects actor-visible characters and rejects writes', async ({
	page,
}) => {
	await openRoster(page);
	const result = await page.evaluate(
		async (queryUrl) => {
			const rt = window.__rt!;
			rt.enterPreview({
				role: 'player',
				playerActorId: rt.actors.find((a) => a.role === 'player')!.id,
			});
			const write = await rt.dispatch({
				type: 'character.quick-create',
				actorId: rt.defaultActorId,
				payload: { name: 'Forbidden', kind: 'npc' },
			});
			const core = await new Function('url', 'return import(url)')(queryUrl);
			const views = core.listCharactersForActor(
				rt.state.characters,
				rt.state.permissions,
				rt.defaultActorId,
			);
			return { write, names: views.map((view: { name: string }) => view.name) };
		},
		`/@fs${fileURLToPath(new URL('../../../../packages/core/src/queries/character-query.ts', import.meta.url))}`,
	);
	expect(result.write.status).toBe('rejected');
	expect(result.names).toContain('Sera Duskwhisper');
	expect(result.names).not.toContain('Mira the Ferryman');
	await expect(page.getByRole('button', { name: 'New character', exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Mira the Ferryman', exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Sera Duskwhisper', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Sera Duskwhisper', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
});

test('roster polish: compact large text keeps overflow actions reachable', async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 568 });
	await openRoster(page);
	await page.addStyleTag({ content: 'html { font-size: 200%; }' });
	await page.getByRole('button', { name: 'More character actions' }).click();
	const dialog = page.getByRole('dialog', { name: 'More character actions' });
	await expect(dialog).toBeVisible();
	const action = dialog.getByRole('button', { name: 'Import character (JSON)' });
	await action.scrollIntoViewIfNeeded();
	await expect(action).toBeInViewport();
	await action.click();
	await expect(page.getByRole('dialog')).toBeVisible();
});

test('roster polish: illustrated empty projection and unavailable detail', async ({ page }) => {
	await openRoster(page);
	await page.evaluate(async () => {
		const rt = window.__rt!;
		const characters = rt.state.characters as { characters: Record<string, { id: string }> };
		for (const character of Object.values(characters.characters)) {
			const result = await rt.dispatch({
				type: 'character.set-sharing',
				actorId: rt.defaultActorId,
				payload: { characterId: character.id, visibility: 'dm-only', sharedWith: [] },
			});
			if (result.status !== 'accepted') throw new Error('Unable to prepare private roster');
		}
		rt.enterPreview({ role: 'observer' });
	});
	await expect(page.getByRole('heading', { name: 'Your roster is empty' })).toBeVisible();
	await expect(page.locator('[data-illustration="characters-empty"]')).toBeVisible();
	await axe(page);
	await page.evaluate(() => {
		window.location.hash = '/characters/not-available';
	});
	await expect(page.getByRole('heading', { name: 'Character unavailable' })).toBeVisible();
	await axe(page);
});
