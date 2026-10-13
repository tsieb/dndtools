import { expect, test } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// RC-ENG-3.2 — a vault larger than the canvas limit (150). The canvas draws the most-connected nodes
// and reports the drawn count; the result list still lists every node; a node picked from the list is pinned onto the
// canvas; clicking a drawn node moves nothing; and a search small enough to fit draws all its matches.

const RING = 180;
const LONER = 'Large vault loner';

test.describe('graph: large vault canvas', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/graph');
		await seedFresh(page);
		await page.evaluate(
			async ({ n, loner }) => {
				const rt = window.__rt!;
				const create = async (title: string, body: string) => {
					const res = await rt.dispatch({
						type: 'content.create-item',
						actorId: rt.defaultActorId,
						payload: { kind: 'note', title, body, visibility: 'player-visible' },
					});
					if (res.status !== 'accepted') throw new Error(`rejected: ${title}`);
				};
				for (let i = 0; i < n; i += 1) {
					await create(`Ring ${i}`, `See [[Ring ${(i + 1) % n}]] and [[Ring ${(i + 3) % n}]].`);
				}
				// No links: the lowest degree in the vault, so never among the most-connected.
				await create(loner, 'Unlinked.');
			},
			{ n: RING, loner: LONER },
		);
		await page.goto('/#/graph', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await expect(page.getByTestId('graph-node').first()).toBeAttached();
	});

	test('draws a bounded canvas, keeps every result listed, and pins a listed pick', async ({
		page,
	}) => {
		const nodes = page.getByTestId('graph-node');
		await expect(nodes).toHaveCount(150);
		await expect(page.getByRole('status').filter({ hasText: 'Showing' })).toHaveText(
			/^Showing 150 of \d+ visible nodes$/,
		);
		await expect(page.getByTestId('graph-node').filter({ hasText: LONER })).toHaveCount(0);
		await expect(
			nodes.and(page.getByRole('button', { name: new RegExp(`^${LONER},`) })),
		).toHaveCount(0);

		// The loner is not drawn but is listed; picking it from the list pins it onto the canvas.
		const row = page
			.locator('#main-content button[aria-pressed]:not([data-testid="graph-node"])')
			.filter({ hasText: LONER });
		await row.scrollIntoViewIfNeeded();
		await row.click();
		await expect(row).toHaveAttribute('aria-pressed', 'true');
		await expect(nodes).toHaveCount(150);
		await expect(page.getByRole('button', { name: new RegExp(`^${LONER},`) })).toHaveCount(1);
		await expect(page.getByText('Selected', { exact: true })).toBeVisible();
	});

	test('selecting a drawn node leaves every other node where it was', async ({ page }) => {
		const nodes = page.getByTestId('graph-node');
		await expect(nodes).toHaveCount(150);
		const where = () =>
			nodes.evaluateAll((els) =>
				els.map(
					(el) =>
						`${el.getAttribute('aria-label')}@${(el as HTMLElement).style.left},${(el as HTMLElement).style.top}`,
				),
			);
		const before = await where();
		// The drawn circles overlap, so select the way a keyboard user does rather than by pointer.
		await nodes.nth(10).focus();
		await page.keyboard.press('Enter');
		await expect(nodes.nth(10)).toHaveAttribute('aria-pressed', 'true');
		expect(await where()).toEqual(before);
	});

	test('a search that fits under the limit draws every match', async ({ page }) => {
		await page.getByRole('textbox', { name: 'Search the graph' }).fill('Ring 1');
		// Ring 1, Ring 10–19, Ring 100–179: 91 matches, all drawn and counted.
		await expect(page.getByTestId('graph-node')).toHaveCount(91);
		await expect(page.getByRole('status').filter({ hasText: 'Showing' })).toHaveText(
			/^Showing 91 of \d+ visible nodes$/,
		);
	});
});
