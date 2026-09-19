// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import type { DiscoveryListing, ListingReview } from './shared';

/**
 * RC-SYS-3.4 + RC-CLD-4.5 — Community › Discover: the listing-kind filter, server-side search, the
 * featured row, and the rating form.
 *
 * The screen runs its REAL discovery client (`shared.tsx`); only `fetch` is replaced, by a small
 * stand-in server that filters the way the handler does and records every request. What the
 * handler itself decides (the curation policy, the maintainer guard) is pinned against the real
 * handler in packages/cloud-fns/src/app-api/handler.test.ts, and the browser path is
 * tests/e2e/community-discover.spec.ts.
 */
vi.mock('../../cloud/config', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../cloud/config')>();
	return {
		...actual,
		isAccountApiConfigured: true,
		cloudConfig: { ...actual.cloudConfig, appApiUrl: 'https://api.example.test/dev' },
	};
});
vi.mock('../../cloud/auth', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../cloud/auth')>()),
	getIdToken: async () => 'id-token',
}));
vi.mock('../../cloud/AuthContext', () => ({
	useAuth: () => ({ status: 'signed-in', openAuthModal: vi.fn() }),
}));
vi.mock('../../runtime/RuntimeContext', () => ({
	useRuntime: () => ({
		defaultActorId: 'dm',
		dispatch: vi.fn(),
		state: { systems: { packages: {} }, widgets: { packages: {} } },
	}),
}));

const { CommDiscover } = await import('./Discover');

function listing(overrides: Partial<DiscoveryListing>): DiscoveryListing {
	return {
		moduleId: 'm1',
		kind: 'widget-package',
		name: 'A module',
		summary: 'Something to add to a table.',
		version: '1.0.0',
		publishedAt: '2026-01-01T00:00:00.000Z',
		contentHash: 'abcdef0123456789',
		size: 2048,
		owned: false,
		systems: [],
		license: '',
		rating: { average: null, count: 0 },
		featured: false,
		installed: false,
		myReview: null,
		...overrides,
	};
}

const LISTINGS: DiscoveryListing[] = [
	listing({ moduleId: 'm1', kind: 'widget-package', name: 'Torch tracker', systems: ['dnd5e'] }),
	listing({
		moduleId: 'm2',
		kind: 'system-package',
		name: 'Hearthlight',
		systems: ['hearthlight'],
	}),
	listing({
		moduleId: 'm3',
		kind: 'content-module',
		name: 'The Sunken Crypt',
		systems: ['dnd5e'],
		license: 'CC-BY-4.0',
	}),
];

interface Recorded {
	method: string;
	path: string;
	params: URLSearchParams;
	body: unknown;
}
let server: {
	listings: DiscoveryListing[];
	featured: DiscoveryListing[];
	reviews: ListingReview[];
	requests: Recorded[];
};

const respond = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** The stand-in app API: filters the way the handler does, and records what it was asked. */
async function fakeApi(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
	const url = new URL(String(input));
	const method = init.method ?? 'GET';
	const path = url.pathname.replace(/^\/dev/, '');
	const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
	server.requests.push({ method, path, params: url.searchParams, body });
	if (method === 'GET' && path === '/listings') {
		const kind = url.searchParams.get('kind');
		const system = url.searchParams.get('system');
		const q = url.searchParams.get('q')?.toLowerCase() ?? '';
		const listings = server.listings.filter(
			(m) =>
				(!kind || m.kind === kind) &&
				(!system || m.systems.includes(system)) &&
				m.name.toLowerCase().includes(q),
		);
		return respond({
			listings,
			total: listings.length,
			facets: { systems: ['dnd5e', 'hearthlight'], licenses: ['CC-BY-4.0'] },
		});
	}
	if (method === 'GET' && path === '/listings/featured')
		return respond({ featured: server.featured });
	if (method === 'GET' && path.endsWith('/reviews'))
		return respond({ reviews: server.reviews, rating: { average: null, count: 0 } });
	if (method === 'PUT' && path.endsWith('/review')) {
		const { stars, note } = body as { stars: number; note: string };
		const at = '2026-09-01T00:00:00.000Z';
		server.reviews = [{ reviewId: 'r1', stars, note, createdAt: at, updatedAt: at, mine: true }];
		return respond({
			review: { reviewId: 'r1', stars, note, createdAt: at, updatedAt: at },
			rating: { average: stars, count: 1 },
		});
	}
	return respond({ error: 'not found' }, 404);
}

let root: Root;
let container: HTMLDivElement;

/** Let the stand-in answer and React commit it (a few hops: the token, the fetch, the JSON). */
async function settle() {
	for (let hop = 0; hop < 3; hop++) {
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
	}
}

async function mount() {
	await act(async () => {
		root.render(
			<I18nProvider>
				<CommDiscover />
			</I18nProvider>,
		);
	});
	await settle();
}

function select(id: string): HTMLSelectElement {
	const found = container.querySelector<HTMLSelectElement>(`#${id}`);
	if (!found) throw new Error(`#${id} is not on the screen`);
	return found;
}

async function choose(id: string, value: string) {
	const control = select(id);
	await act(async () => {
		control.value = value;
		control.dispatchEvent(new Event('change', { bubbles: true }));
	});
	await settle();
}

/** Type into a React-controlled field the way a browser does: set the value, fire `input`. */
async function type(field: HTMLInputElement | HTMLTextAreaElement, text: string) {
	const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value')?.set;
	await act(async () => {
		setter?.call(field, text);
		field.dispatchEvent(new Event('input', { bubbles: true }));
	});
}

function button(text: string): HTMLButtonElement {
	const found = [...container.querySelectorAll('button')].find(
		(candidate) => candidate.textContent?.trim() === text,
	);
	if (!found) throw new Error(`no "${text}" button on the screen`);
	return found;
}

async function click(target: HTMLElement) {
	await act(async () => {
		target.click();
	});
	await settle();
}

const shelfCards = () => [
	...container.querySelectorAll<HTMLButtonElement>(
		'[data-testid="discover-shelf"] button[aria-pressed]',
	),
];
/** The names on the shelf, read off the listing cards. */
const shelfNames = () => shelfCards().map((card) => card.querySelector('span')?.textContent ?? '');
const lastSearch = () =>
	[...server.requests].reverse().find((request) => request.path === '/listings')!.params;

describe('RC-SYS-3.4 / RC-CLD-4.5 Community › Discover', () => {
	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		root = createRoot(container);
		server = { listings: LISTINGS, featured: [], reviews: [], requests: [] };
		vi.stubGlobal('fetch', vi.fn(fakeApi));
	});
	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it('offers a labelled filter with every listing kind, System packages included', async () => {
		await mount();
		const options = [...select('community-kind-filter').options].map(
			(option) => option.textContent,
		);
		expect(options).toEqual([
			'All kinds',
			'Widget package',
			'System package',
			'Scene package',
			'Content module',
		]);
		// The control is named, so a keyboard/screen-reader user knows what it narrows.
		const label = container.querySelector('label[for="community-kind-filter"]');
		expect(label?.textContent).toBe('Kind');
	});

	it('asks the server for one kind at a time: system packages, then everything again', async () => {
		await mount();
		expect(shelfNames()).toEqual(['Torch tracker', 'Hearthlight', 'The Sunken Crypt']);

		await choose('community-kind-filter', 'system-package');
		expect(lastSearch().get('kind')).toBe('system-package');
		expect(shelfNames()).toEqual(['Hearthlight']);
		// The detail panel follows the filter rather than describing a listing no longer on the shelf.
		expect(container.textContent).toContain('Hearthlight');
		expect(container.textContent).not.toContain('Torch tracker');

		await choose('community-kind-filter', 'all');
		expect(lastSearch().has('kind')).toBe(false);
		expect(shelfNames()).toEqual(['Torch tracker', 'Hearthlight', 'The Sunken Crypt']);
	});

	it('says so honestly when nothing matches the chosen kind', async () => {
		await mount();
		await choose('community-kind-filter', 'scene-package');
		expect(shelfNames()).toEqual([]);
		expect(container.textContent).toContain('Nothing of that kind yet');
		// The filter itself stays reachable, so the empty state is not a dead end.
		expect(select('community-kind-filter').value).toBe('scene-package');
	});

	it('filters by a system from the server’s facets, then by words once typing settles', async () => {
		await mount();
		const systems = [...select('community-system-filter').options].map((o) => o.textContent);
		expect(systems).toEqual(['Any system', 'dnd5e', 'hearthlight']);
		expect(container.querySelector('label[for="community-system-filter"]')?.textContent).toBe(
			'System',
		);

		await choose('community-system-filter', 'dnd5e');
		expect(lastSearch().get('system')).toBe('dnd5e');
		expect(shelfNames()).toEqual(['Torch tracker', 'The Sunken Crypt']);

		const searchBox = container.querySelector<HTMLInputElement>('input[type="search"]')!;
		expect(searchBox.getAttribute('aria-label')).toBe('Search modules');
		await type(searchBox, 'crypt');
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 300));
		});
		await settle();
		expect(lastSearch().get('q')).toBe('crypt');
		expect(lastSearch().get('system')).toBe('dnd5e');
		expect(shelfNames()).toEqual(['The Sunken Crypt']);
		expect(container.textContent).toContain('1 module');
	});

	it('shows the maintainers’ featured row above the shelf', async () => {
		server.featured = [{ ...LISTINGS[2], featured: true, rating: { average: 4.5, count: 2 } }];
		await mount();
		const heading = [...container.querySelectorAll('h2')].find((h) => h.textContent === 'Featured');
		const region = heading?.closest('section');
		expect(region?.getAttribute('aria-labelledby')).toBe(heading?.id);
		expect(region?.textContent).toContain('The Sunken Crypt');
		expect(region?.textContent).toContain('4.5 ★ · 2 ratings');
		// The stars are announced as a sentence, not read out glyph by glyph.
		expect(region?.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(
			'Rated 4.5 out of 5 from 2 ratings',
		);
	});

	it('explains that a rating needs an install, and offers no form until then', async () => {
		server.listings = [listing({ moduleId: 'm1', name: 'Torch tracker' })];
		await mount();
		expect(container.textContent).toContain('Install this module to rate it.');
		expect(container.querySelector('textarea')).toBeNull();
		expect(() => button('Save rating')).toThrow();
	});

	it('never offers the rating form to the module’s own publisher', async () => {
		server.listings = [
			listing({ moduleId: 'm1', name: 'Torch tracker', owned: true, installed: true }),
		];
		await mount();
		expect(container.textContent).toContain('You published this module, so you can’t rate it.');
		expect(container.querySelector('textarea')).toBeNull();
	});

	it('rates an installed module: stars and a note go to the server, and the card shows it', async () => {
		server.listings = [listing({ moduleId: 'm1', name: 'Torch tracker', installed: true })];
		await mount();
		expect(button('Save rating').disabled).toBe(true); // no stars chosen yet

		await click(button('4 ★'));
		const note = container.querySelector('textarea')!;
		expect(note.maxLength).toBe(280);
		await type(note, 'Lit every session.');
		await click(button('Save rating'));

		const saved = server.requests.find((request) => request.method === 'PUT');
		expect(saved).toMatchObject({
			path: '/listings/m1/review',
			body: { stars: 4, note: 'Lit every session.' },
		});
		expect(shelfCards()[0].textContent).toContain('4 ★ · 1 rating');
		expect(button('Update rating')).toBeTruthy();
		expect(container.textContent).toContain('Lit every session.');
	});
});
