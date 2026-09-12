import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';
import { TOOL_GROUPS } from '../../src/app/map/tools';

const seenKey = 'dndtools:react:seen-spotlights';
const coach = (page: Page) => page.locator('[data-map-onboarding]');
const root = (page: Page) => page.getByRole('dialog', { name: 'Map editor — Tour map' });

async function openEditor(page: Page) {
	await page.getByRole('button', { name: 'Tour map', exact: true }).click();
	await page.getByRole('button', { name: 'Open in map editor', exact: true }).click();
	await expect(root(page)).toBeVisible();
}

async function seen(page: Page) {
	return page.evaluate(
		(key) => JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, string[]>,
		seenKey,
	);
}

test.beforeEach(async ({ page }) => {
	await markOnboarded(page);
	await gotoRoute(page, '/atlas');
	await seedFresh(page);
	await page.evaluate((key) => localStorage.removeItem(key), seenKey);
	const result = await dispatch(page, {
		type: 'map.create',
		actorId: 'dm-1',
		payload: {
			name: 'Tour map',
			visibility: 'dm-only',
			projection: { kind: 'flat', rotationDegrees: 0 },
			initialLayers: [{ name: 'Base', category: 'base', visibility: 'dm-only' }],
		},
	});
	expect(result.status).toBe('accepted');
});

test('first-open coach follows rail → options → dock and never repeats after completion or reload', async ({
	page,
}) => {
	await openEditor(page);
	for (const target of ['rail', 'options', 'dock']) {
		await expect(coach(page)).toHaveAttribute('data-map-onboarding', target);
		await expect(root(page).locator(`[data-map-coach="${target}"]`).first()).toHaveCSS(
			'outline-style',
			'solid',
		);
		await coach(page)
			.getByRole('button', { name: target === 'dock' ? 'Done' : 'Next', exact: true })
			.click();
	}
	await expect(coach(page)).toHaveCount(0);
	await expect(root(page)).toBeFocused();
	const records = await seen(page);
	expect(Object.values(records).some((ids) => ids.includes('map-editor'))).toBe(true);
	await root(page).getByRole('button', { name: 'Back to Atlas', exact: false }).click();
	await openEditor(page);
	await expect(coach(page)).toHaveCount(0);
	await page.reload();
	await waitReady(page);
	await openEditor(page);
	await expect(coach(page)).toHaveCount(0);
});

test('an interrupted first display is already seen; another vault history does not suppress this vault', async ({
	page,
}) => {
	await page.evaluate(
		(key) =>
			localStorage.setItem(key, JSON.stringify({ 'another-vault': ['map-editor', 'graph'] })),
		seenKey,
	);
	await openEditor(page);
	await expect(coach(page)).toHaveAttribute('data-map-onboarding', 'rail');
	expect((await seen(page))['another-vault']).toEqual(['map-editor', 'graph']);
	// Reload before Next or dismissal: the spotlight must not come back.
	await page.reload();
	await waitReady(page);
	await openEditor(page);
	await expect(coach(page)).toHaveCount(0);
});

test('skip is keyboard accessible and does not restart on reopen', async ({ page }) => {
	await openEditor(page);
	const skip = coach(page).getByRole('button', { name: 'Skip tour' });
	await skip.focus();
	await page.keyboard.press('Enter');
	await expect(coach(page)).toHaveCount(0);
	await root(page).getByRole('button', { name: 'Back to Atlas', exact: false }).click();
	await openEditor(page);
	await expect(coach(page)).toHaveCount(0);
});

test('every tool tooltip includes its key and ? opens only the map shortcuts', async ({ page }) => {
	await openEditor(page);
	await coach(page).getByRole('button', { name: 'Skip tour' }).click();
	const rail = root(page).getByRole('toolbar', { name: 'Map tools', exact: true });
	const groups = rail.locator('button[aria-expanded]');
	for (const [index, group] of TOOL_GROUPS.entries()) {
		const button = groups.nth(index);
		expect(await button.getAttribute('title')).toContain(
			`(${group.tools.map((tool) => tool.shortcut!.toUpperCase()).join(' · ')})`,
		);
		if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
		const tools = rail.getByRole('group').getByRole('button');
		for (const [toolIndex, tool] of group.tools.entries()) {
			await expect(tools.nth(toolIndex)).toHaveAttribute(
				'title',
				new RegExp(`\\(${tool.shortcut!.toUpperCase()}\\)$`),
			);
		}
	}
	await root(page).focus();
	await page.keyboard.press('?');
	const overlay = page.locator('[data-shortcuts-overlay]');
	await expect(overlay).toBeVisible();
	await expect(overlay.getByRole('heading', { name: 'Map editor', exact: true })).toBeVisible();
	await expect(overlay.getByRole('heading')).toHaveCount(1);
	await expect(overlay.getByText('?', { exact: true })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(overlay).toBeHidden();
	await expect(root(page)).toBeVisible();
});

test('unwritable preferences suppress the tour so it cannot recur', async ({ page }) => {
	await page.evaluate(() => {
		Storage.prototype.setItem = () => {
			throw new Error('Storage denied');
		};
	});
	await openEditor(page);
	await expect(coach(page)).toHaveCount(0);
});

test('the seen record covers another map in the same vault', async ({ page }) => {
	await openEditor(page);
	await expect(coach(page)).toHaveAttribute('data-map-onboarding', 'rail');
	await root(page).getByRole('button', { name: 'Back to Atlas' }).click();
	const result = await dispatch(page, {
		type: 'map.create',
		actorId: 'dm-1',
		payload: {
			name: 'Another map',
			visibility: 'dm-only',
			projection: { kind: 'flat', rotationDegrees: 0 },
			initialLayers: [{ name: 'Base', category: 'base', visibility: 'dm-only' }],
		},
	});
	expect(result.status).toBe('accepted');
	await page.getByRole('button', { name: 'Another map', exact: true }).click();
	await page.getByRole('button', { name: 'Open in map editor', exact: true }).click();
	await expect(page.getByRole('dialog', { name: 'Map editor — Another map' })).toBeVisible();
	await expect(coach(page)).toHaveCount(0);
});

test('Escape from the coach dismisses it without closing the editor', async ({ page }) => {
	await openEditor(page);
	await coach(page).getByRole('button', { name: 'Next', exact: true }).focus();
	await page.keyboard.press('Escape');
	await expect(coach(page)).toHaveCount(0);
	await expect(root(page)).toBeVisible();
	await expect(root(page)).toBeFocused();
});

test('starting to edit dismisses the tour without stealing keyboard focus', async ({ page }) => {
	await openEditor(page);
	await expect(coach(page)).toBeVisible();
	await root(page).focus();
	await page.keyboard.press('f');
	await expect(coach(page)).toHaveCount(0);
	await expect(page.getByRole('group', { name: 'Fog options', exact: true })).toBeVisible();
	await expect(root(page)).toBeFocused();
	await root(page).getByRole('button', { name: 'Back to Atlas' }).click();
	await openEditor(page);
	await expect(coach(page)).toHaveCount(0);
});
