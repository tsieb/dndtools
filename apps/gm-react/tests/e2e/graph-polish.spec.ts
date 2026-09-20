import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

async function axe(page: Page) {
	const result = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
		.analyze();
	expect(result.violations).toEqual([]);
}

test.beforeEach(async ({ page }) => {
	await markOnboarded(page);
	await gotoRoute(page, '/graph');
	await seedFresh(page);
	await page.goto('/#/graph');
	await waitReady(page);
});

test('graph polish: axe clean for graph, selection, empty search and player projection', async ({
	page,
}) => {
	await axe(page);
	await page.getByLabel('Search the graph').fill('Campaign Primer');
	await page.getByRole('button', { name: 'Campaign Primer' }).first().click();
	await expect(page.getByRole('button', { name: 'Open note' })).toBeVisible();
	await axe(page);
	await page.getByLabel('Search the graph').fill('no-match-for-this-query');
	await expect(page.getByRole('button', { name: 'Open note' })).toHaveCount(0);
	await axe(page);
	await page.getByRole('button', { name: 'Clear filters', exact: true }).first().click();
	await page.getByRole('radio', { name: 'Player view', exact: true }).click();
	await expect(page.getByRole('button', { name: /The Sunken Crypt — DM notes/ })).toHaveCount(0);
	await axe(page);
});

test('graph polish: large text leaves search controls reachable and canvas targets at least 48px', async ({
	page,
}) => {
	await page.locator('html').evaluate((el) => (el.style.fontSize = '200%'));
	const search = page.getByLabel('Search the graph');
	await search.fill('Campaign Primer');
	const node = page.getByTestId('graph-node');
	await expect(node).toHaveCount(1);
	const bounds = await node.boundingBox();
	expect(bounds!.width).toBeGreaterThanOrEqual(48);
	expect(bounds!.height).toBeGreaterThanOrEqual(48);
	await search.press('Escape');
	await expect(search).toHaveValue('');
	await page.getByRole('region', { name: 'Graph results' }).focus();
	await page.keyboard.press('Tab');
	await expect(
		page.getByRole('region', { name: 'Graph results' }).getByRole('button').first(),
	).toBeFocused();
	const clipped = await page
		.locator('.graph-surface')
		.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
	expect(clipped).toBe(false);
});

test('graph polish: failed repair stays retryable, announces pending and completes through dispatch', async ({
	page,
}) => {
	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	for (const [title, body] of [
		['Polish Target Note', 'The target.'],
		['Polish Broken Note', 'See [[Polish Target Not]].'],
	]) {
		const result = await dispatch(page, {
			type: 'content.create-item',
			actorId,
			payload: { kind: 'note', title, body },
		});
		expect(result.status).toBe('accepted');
	}
	await page.goto('/#/graph/repair');
	await waitReady(page);
	await axe(page);
	// Fail exactly one call, then restore the real mutation boundary for the retry.
	await page.evaluate(() => {
		const rt = window.__rt!;
		const original = rt.dispatch.bind(rt);
		rt.dispatch = async (...args: Parameters<typeof rt.dispatch>) => {
			rt.dispatch = original;
			if (args[0].type === 'content.update-item') {
				await new Promise((resolve) => setTimeout(resolve, 500));
				throw new Error('Simulated storage failure');
			}
			return original(...args);
		};
	});
	const fix = page.getByRole('button', { name: 'Fix to “Polish Target Note”', exact: true });
	await fix.click();
	await expect(page.getByText('Saving the repaired link…')).toBeVisible();
	await expect(fix).toBeDisabled();
	await expect(page.getByRole('alert')).toContainText('Couldn’t fix the link');
	await expect(page.getByRole('alert')).toContainText('Try the fix again');
	await expect(fix).toBeEnabled();
	await axe(page);
	await fix.click();
	await expect(
		page.getByText('Fixed the link in “Polish Broken Note”.', { exact: true }),
	).toBeVisible();
	await expect(fix).toHaveCount(0);
	await expect(page.getByRole('alert')).toHaveCount(0);
	await axe(page);
});

test('graph polish: preview rejects writes and repair controls cannot mutate', async ({ page }) => {
	await page.evaluate(() => window.__rt!.enterPreview({ role: 'player' }));
	await expect(page.getByRole('button', { name: /The Sunken Crypt — DM notes/ })).toHaveCount(0);
	const result = await dispatch(page, {
		type: 'content.create-item',
		actorId: await page.evaluate(() => window.__rt!.defaultActorId),
		payload: { kind: 'note', title: 'Blocked preview write', body: 'Must not persist' },
	});
	expect(result.status).toBe('rejected');
	await page.evaluate(() => {
		window.location.hash = '/graph/repair';
	});
	await expect(page.getByText('Leave preview to repair links.')).toBeVisible();
	await expect(page.getByRole('button', { name: /^Fix to/ })).toHaveCount(0);
	await axe(page);
});

test('graph polish: selected search result keeps its selected treatment after pointer leave', async ({
	page,
}) => {
	await page.getByLabel('Search the graph').fill('Campaign Primer');
	const result = page.getByRole('region', { name: 'Graph results' }).getByRole('button').first();
	await result.click();
	await expect(result).toHaveAttribute('aria-pressed', 'true');
	const selected = await result.evaluate((el) => el.style.background);
	await page.mouse.move(0, 0);
	// Inspect the inline target, so a transition cannot briefly mask a lost selected state.
	await expect.poll(() => result.evaluate((el) => el.style.background)).toBe(selected);
});
