// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import type { ModuleListing } from '../../cloud/appApi';

/**
 * RC-SYS-3.4 — the Community › Discover LISTING-KIND filter, and System packages in particular.
 *
 * Discover is CLOUD-gated: the Playwright e2e server blanks every VITE_* cloud coordinate, so the
 * whole shelf renders the fail-closed marketplace gate there (community-publish.spec.ts asserts
 * that) and the filter can never be reached from an e2e run. This component test is where its
 * contract lives — the same place `WikiReader.test.tsx` keeps the reader's cloud-only phases.
 */
vi.mock('../../cloud/config', () => ({ isAccountApiConfigured: true }));
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
vi.mock('../../cloud/appApi', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../cloud/appApi')>();
	return { ...actual, listModules: vi.fn(), getModule: vi.fn(), deleteModule: vi.fn() };
});

const { listModules } = await import('../../cloud/appApi');
const { CommDiscover } = await import('./Discover');
const mockedListModules = vi.mocked(listModules);

function listing(overrides: Partial<ModuleListing>): ModuleListing {
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
		...overrides,
	};
}

const LISTINGS: ModuleListing[] = [
	listing({ moduleId: 'm1', kind: 'widget-package', name: 'Torch tracker' }),
	listing({ moduleId: 'm2', kind: 'system-package', name: 'Hearthlight' }),
	listing({ moduleId: 'm3', kind: 'content-module', name: 'The Sunken Crypt' }),
];

let root: Root;
let container: HTMLDivElement;

async function mount() {
	await act(async () => {
		root.render(
			<I18nProvider>
				<CommDiscover />
			</I18nProvider>,
		);
	});
}

function filter(): HTMLSelectElement {
	const select = container.querySelector<HTMLSelectElement>('#community-kind-filter');
	if (!select) throw new Error('the kind filter is not on the screen');
	return select;
}

async function chooseKind(value: string) {
	const select = filter();
	await act(async () => {
		select.value = value;
		select.dispatchEvent(new Event('change', { bubbles: true }));
	});
}

/** The names on the shelf, read off the listing cards. */
function shelfNames(): string[] {
	return [...container.querySelectorAll('button[aria-pressed]')].map(
		(card) => card.querySelector('span')?.textContent ?? '',
	);
}

describe('RC-SYS-3.4 Community › Discover listing-kind filter', () => {
	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		root = createRoot(container);
		mockedListModules.mockResolvedValue(LISTINGS);
	});
	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	it('offers a labelled filter with every listing kind, System packages included', async () => {
		await mount();
		const options = [...filter().options].map((option) => option.textContent);
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

	it('narrows the shelf to system packages and back', async () => {
		await mount();
		expect(shelfNames()).toEqual(['Torch tracker', 'Hearthlight', 'The Sunken Crypt']);

		await chooseKind('system-package');
		expect(shelfNames()).toEqual(['Hearthlight']);
		// The detail panel follows the filter rather than describing a listing no longer on the shelf.
		expect(container.textContent).toContain('Hearthlight');
		expect(container.textContent).not.toContain('Torch tracker');

		await chooseKind('all');
		expect(shelfNames()).toEqual(['Torch tracker', 'Hearthlight', 'The Sunken Crypt']);
	});

	it('says so honestly when nothing matches the chosen kind', async () => {
		await mount();
		await chooseKind('scene-package');
		expect(shelfNames()).toEqual([]);
		expect(container.textContent).toContain('Nothing of that kind yet');
		// The filter itself stays reachable, so the empty state is not a dead end.
		expect(filter().value).toBe('scene-package');
	});
});
