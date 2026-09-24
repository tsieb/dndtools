import { expect, test } from '@playwright/test';
import { communityAxe } from './_communityAxe';
import { API, CRYPT, CORS, serveMarketplace, openDiscover } from './_communityMarketplace';
import { gotoRoute, markOnboarded } from './_helpers';

test.describe('community: discovery against the app API (Community → Discover)', () => {
	test('searches by kind and by system, and shows the featured row', async ({ page }) => {
		const market = await serveMarketplace(page);
		await openDiscover(page);

		const featured = page.getByRole('region', { name: 'Featured' });
		await expect(featured.getByRole('button', { name: /The Sunken Crypt/ })).toBeVisible();

		const shelf = page.getByTestId('discover-shelf');
		await expect(shelf.getByRole('button')).toHaveCount(3);
		await communityAxe(page);

		await page.getByLabel('Kind', { exact: true }).selectOption('system-package');
		await expect(shelf.getByRole('button')).toHaveCount(1);
		await expect(shelf.getByRole('button', { name: /Hearthlight/ })).toBeVisible();
		expect(market.searches.at(-1)?.get('kind')).toBe('system-package');

		await page.getByLabel('Kind', { exact: true }).selectOption('all');
		await expect(shelf.getByRole('button')).toHaveCount(3);
		await page.getByLabel('System', { exact: true }).selectOption('dnd5e');
		await expect(shelf.getByRole('button')).toHaveCount(2);
		await expect(shelf.getByRole('button', { name: /Hearthlight/ })).toHaveCount(0);
		expect(market.searches.at(-1)?.get('system')).toBe('dnd5e');
		expect(market.searches.at(-1)?.has('kind')).toBe(false);

		await page.getByRole('searchbox', { name: 'Search modules' }).fill('crypt');
		await expect(shelf.getByRole('button')).toHaveCount(1);
		await expect(shelf.getByRole('button', { name: /The Sunken Crypt/ })).toBeVisible();
		expect(market.searches.at(-1)?.get('q')).toBe('crypt');
		expect(market.searches.at(-1)?.get('system')).toBe('dnd5e');
	});

	test('installs a module, then rates it, and the rating lands on the shelf', async ({ page }) => {
		const market = await serveMarketplace(page);
		await openDiscover(page);

		const shelf = page.getByTestId('discover-shelf');
		await shelf.getByRole('button', { name: /The Sunken Crypt/ }).click();

		// The policy is explained before it is enforced: no install, no rating form.
		const ratings = page.getByRole('region', { name: 'Ratings' });
		await expect(ratings.getByText(/Install this module to rate it/)).toBeVisible();
		await expect(ratings.getByRole('button', { name: 'Save rating' })).toHaveCount(0);

		await page.getByRole('button', { name: 'Install to vault' }).click();
		const review = page.getByRole('dialog', { name: 'Install this package?' });
		await expect(review).toBeVisible();
		await expect(review.getByText('sunken-crypt-notes.md')).toBeVisible();
		await communityAxe(page);
		await review.getByRole('button', { name: 'Install package' }).click();
		await expect(review).toBeHidden();

		// It really landed, through the transactional `content.commit-import`, and the server was
		// told, which is what the rating is gated on.
		await expect
			.poll(
				() =>
					page.evaluate((title) => {
						const items = (
							window.__rt!.state.content as { items: Record<string, { title: string }> }
						).items;
						return Object.values(items).some((item) => item.title === title);
					}, market.noteTitle),
				{ timeout: 10_000 },
			)
			.toBe(true);
		await expect.poll(() => market.installs.has(CRYPT)).toBe(true);

		const note = 'The flooded nave carried two whole sessions.';
		const star = ratings.getByRole('radio', { name: '4 ★' });
		const starBounds = await star.boundingBox();
		expect(starBounds?.width).toBeGreaterThanOrEqual(44);
		expect(starBounds?.height).toBeGreaterThanOrEqual(44);
		await star.click();
		await ratings.getByLabel('Review note (optional)').fill(note);
		await ratings.getByRole('button', { name: 'Save rating' }).click();

		await expect(ratings.getByRole('button', { name: 'Update rating' })).toBeVisible();
		expect(market.ratingBodies).toEqual([{ stars: 4, note }]);
		await communityAxe(page);
		// The saved review is listed (the form keeps the note too, so look in the list itself).
		await expect(ratings.getByRole('listitem').getByText(note)).toBeVisible();
		await expect(shelf.getByRole('button', { name: /The Sunken Crypt/ })).toContainText(
			'4 ★ · 1 rating',
		);
	});
});

test.describe('extensions: the marketplace panel follows the app API (Extensions → Plugins)', () => {
	test('drops the "Community marketplace · Unavailable" panel where the app API exists', async ({
		page,
	}) => {
		await serveMarketplace(page);
		await markOnboarded(page);
		await gotoRoute(page, '/extensions');
		await page.getByRole('tab', { name: 'Plugins' }).click();
		await expect(page.getByLabel('Widget package definition JSON')).toBeVisible();
		await expect(page.getByText('Community marketplace', { exact: true })).toHaveCount(0);
	});

	test('keeps saying so where there is no app API', async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/extensions');
		await page.getByRole('tab', { name: 'Plugins' }).click();
		await expect(page.getByLabel('Widget package definition JSON')).toBeVisible();
		await expect(page.getByText('Community marketplace', { exact: true })).toBeVisible();
		await expect(
			page.getByText('The community marketplace is not available in this edition.', {
				exact: false,
			}),
		).toBeVisible();
	});
});

test('community: failed discovery retries into an illustrated empty shelf', async ({ page }) => {
	await serveMarketplace(page);
	let failed = true;
	await page.route(`${API}/listings`, (route) =>
		route.fulfill({
			status: failed ? 503 : 200,
			headers: CORS,
			contentType: 'application/json',
			body: JSON.stringify(
				failed
					? { error: 'Unavailable' }
					: { listings: [], total: 0, facets: { systems: [], licenses: [] } },
			),
		}),
	);
	await openDiscover(page);
	await expect(page.locator('[data-illustration="connection-lost"]')).toBeVisible();
	await communityAxe(page);
	failed = false;
	await page.getByRole('button', { name: 'Retry', exact: true }).click();
	await expect(page.locator('[data-illustration="community-empty"]')).toBeVisible();
	await communityAxe(page);
});

test('community: removal confirmation names the listing, is accessible and cancels by keyboard', async ({
	page,
}) => {
	await serveMarketplace(page, true);
	await openDiscover(page);
	await page.getByRole('button', { name: 'Remove listing', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Remove this listing?' });
	await expect(dialog).toContainText('The Sunken Crypt');
	await communityAxe(page);
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	await expect(page.getByRole('button', { name: 'Remove listing', exact: true })).toBeFocused();
});
