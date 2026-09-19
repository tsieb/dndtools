import { expect, test, type Page, type Route } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// RC-CLD-4.5 — marketplace DISCOVERY in a real browser: search by kind and by system, the
// maintainers' featured row, and installing a module and then rating it.
//
// The e2e server blanks every cloud coordinate (playwright.config; isolation-guard.spec.ts holds
// that line), so the real app API is never reachable from here. `screens/community/shared.tsx`
// has a DEV-only seam instead: a page that sets `window.__dndtoolsAppApiE2e = { baseUrl }` with a
// `.invalid` origin gets its discovery client pointed there, and this spec answers that origin
// with `page.route`. Nothing leaves the machine. The route contract itself (the curation policy,
// the maintainer-only guard) is pinned against the real handler in
// packages/cloud-fns/src/app-api/handler.test.ts; this spec proves the screen speaks it.

const API = 'https://app-api.e2e.invalid/dev';
const CRYPT = '11111111-1111-4111-8111-111111111111';
const HEARTH = '22222222-2222-4222-8222-222222222222';
const TORCH = '33333333-3333-4333-8333-333333333333';

interface FakeListing {
	moduleId: string;
	kind: string;
	name: string;
	summary: string;
	systems: string[];
	license: string;
}

const LISTINGS: FakeListing[] = [
	{
		moduleId: CRYPT,
		kind: 'content-module',
		name: 'The Sunken Crypt',
		summary: 'A three-session delve under a drowned chapel.',
		systems: ['dnd5e'],
		license: 'CC-BY-4.0',
	},
	{
		moduleId: HEARTH,
		kind: 'system-package',
		name: 'Hearthlight',
		summary: 'A cosy, rules-light game system.',
		systems: ['hearthlight'],
		license: '',
	},
	{
		moduleId: TORCH,
		kind: 'widget-package',
		name: 'Torch tracker',
		summary: 'Counts torches and lanterns down.',
		systems: ['dnd5e'],
		license: '',
	},
];

/** The Sunken Crypt as the `.dndmodule` a real publish would have stored. */
function cryptBundle(noteTitle: string) {
	return {
		format: 'dndmodule',
		schemaVersion: 1,
		manifest: {
			kind: 'content-module',
			id: 'sunken-crypt',
			name: 'The Sunken Crypt',
			summary: 'A three-session delve under a drowned chapel.',
			version: '1.0.0',
			license: 'CC-BY-4.0',
			systems: ['dnd5e'],
		},
		payload: {
			format: 'dndtools-content-export',
			version: 1,
			mode: 'portable',
			files: [
				{
					path: 'sunken-crypt-notes.md',
					markdown: `# ${noteTitle}\n\nThe chapel bell still rings at low tide.\n`,
				},
			],
		},
		assets: [],
	};
}

interface Marketplace {
	installs: Set<string>;
	ratings: Map<string, { stars: number; note: string }>;
	searches: URLSearchParams[];
	ratingBodies: unknown[];
	noteTitle: string;
}

const CORS = {
	'access-control-allow-origin': '*',
	'access-control-allow-headers': 'authorization, content-type',
	'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

/**
 * Stand in for the app API's discovery routes: the same shapes the handler returns, and the one
 * policy the screen must respect (no install record, no rating). Must run before navigation.
 */
async function serveMarketplace(page: Page): Promise<Marketplace> {
	const market: Marketplace = {
		installs: new Set(),
		ratings: new Map(),
		searches: [],
		ratingBodies: [],
		noteTitle: `Sunken Crypt field notes ${Date.now()}`,
	};
	const rating = (moduleId: string) => {
		const saved = market.ratings.get(moduleId);
		return saved ? { average: saved.stars, count: 1 } : { average: null, count: 0 };
	};
	const view = (m: FakeListing) => {
		const saved = market.ratings.get(m.moduleId);
		return {
			...m,
			version: '1.0.0',
			publishedAt: '2026-09-01T00:00:00.000Z',
			contentHash: 'e2e0123456789abcdef',
			size: 1024,
			owned: false,
			rating: rating(m.moduleId),
			featured: m.moduleId === CRYPT,
			installed: market.installs.has(m.moduleId),
			myReview: saved ? { reviewId: `review-${m.moduleId}`, ...saved } : null,
		};
	};

	await page.addInitScript((baseUrl) => {
		(window as unknown as { __dndtoolsAppApiE2e?: { baseUrl: string } }).__dndtoolsAppApiE2e = {
			baseUrl,
		};
	}, API);

	await page.route(`${API}/**`, async (route: Route) => {
		const request = route.request();
		const json = (body: unknown, status = 200) =>
			route.fulfill({
				status,
				headers: { ...CORS, 'content-type': 'application/json' },
				body: JSON.stringify(body),
			});
		if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
		const url = new URL(request.url());
		const path = url.pathname.replace(/^\/dev/, '');
		const method = request.method();

		if (method === 'GET' && path === '/listings') {
			market.searches.push(url.searchParams);
			const kind = url.searchParams.get('kind');
			const system = url.searchParams.get('system');
			const words = (url.searchParams.get('q') ?? '').toLowerCase().split(/\s+/).filter(Boolean);
			const hits = LISTINGS.filter(
				(m) =>
					(!kind || m.kind === kind) &&
					(!system || m.systems.includes(system)) &&
					words.every((word) => `${m.name} ${m.summary}`.toLowerCase().includes(word)),
			);
			return json({
				listings: hits.map(view),
				total: hits.length,
				facets: { systems: ['dnd5e', 'hearthlight'], licenses: ['CC-BY-4.0'] },
			});
		}
		if (method === 'GET' && path === '/listings/featured') {
			return json({ featured: LISTINGS.filter((m) => m.moduleId === CRYPT).map(view) });
		}
		const onListing = /^\/listings\/([0-9a-f-]+)\/(install|review|reviews)$/.exec(path);
		if (onListing) {
			const [, moduleId, action] = onListing;
			if (action === 'install' && method === 'POST') {
				market.installs.add(moduleId);
				return json({ ok: true, installed: true });
			}
			if (action === 'reviews' && method === 'GET') {
				const saved = market.ratings.get(moduleId);
				const at = '2026-09-02T00:00:00.000Z';
				return json({
					reviews: saved
						? [
								{
									reviewId: `review-${moduleId}`,
									...saved,
									createdAt: at,
									updatedAt: at,
									mine: true,
								},
							]
						: [],
					rating: rating(moduleId),
				});
			}
			if (action === 'review' && method === 'PUT') {
				// The policy the real handler enforces: no install record, no rating.
				if (!market.installs.has(moduleId)) {
					return json({ error: 'Install this module before rating it.' }, 403);
				}
				const body = request.postDataJSON() as { stars: number; note: string };
				market.ratingBodies.push(body);
				market.ratings.set(moduleId, { stars: body.stars, note: body.note });
				const at = '2026-09-02T00:00:00.000Z';
				return json({
					review: {
						reviewId: `review-${moduleId}`,
						stars: body.stars,
						note: body.note,
						createdAt: at,
						updatedAt: at,
					},
					rating: rating(moduleId),
				});
			}
		}
		if (method === 'GET' && path === `/marketplace/modules/${CRYPT}`) {
			return json({ ...view(LISTINGS[0]), package: cryptBundle(market.noteTitle) });
		}
		return json({ error: 'not found' }, 404);
	});
	return market;
}

async function openDiscover(page: Page): Promise<void> {
	await markOnboarded(page);
	await gotoRoute(page, '/community');
	await seedFresh(page);
	await page.goto('/#/community', { waitUntil: 'domcontentloaded' });
	await waitReady(page);
	await page.locator('#main-content').waitFor({ state: 'attached' });
}

test.describe('community: discovery against the app API (Community → Discover)', () => {
	test('searches by kind and by system, and shows the featured row', async ({ page }) => {
		const market = await serveMarketplace(page);
		await openDiscover(page);

		const featured = page.getByRole('region', { name: 'Featured' });
		await expect(featured.getByRole('button', { name: /The Sunken Crypt/ })).toBeVisible();

		const shelf = page.getByTestId('discover-shelf');
		await expect(shelf.getByRole('button')).toHaveCount(3);

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
		await ratings.getByRole('radio', { name: '4 ★' }).click();
		await ratings.getByLabel('Review note (optional)').fill(note);
		await ratings.getByRole('button', { name: 'Save rating' }).click();

		await expect(ratings.getByRole('button', { name: 'Update rating' })).toBeVisible();
		expect(market.ratingBodies).toEqual([{ stars: 4, note }]);
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
