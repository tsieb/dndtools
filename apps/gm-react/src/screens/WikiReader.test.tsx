// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppApiError, type PublicWiki } from '../cloud/appApi';
import { WikiReader } from './WikiReader';

// The public wiki reader is CLOUD-gated, so the Playwright e2e server can only ever reach its
// `missing` and `invalid` phases — the `password` and `ready` phases have no e2e coverage and never
// will offline. These component tests are where their interactive contract lives.
vi.mock('../cloud/appApi', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../cloud/appApi')>();
	return { ...actual, getPublicWiki: vi.fn() };
});
const { getPublicWiki } = await import('../cloud/appApi');
const mockedGetPublicWiki = vi.mocked(getPublicWiki);

const WIKI: PublicWiki = {
	wikiId: 'w1',
	title: 'The Copper Coast',
	access: 'public',
	publishedAt: '2026-01-01T00:00:00.000Z',
	updatedAt: '2026-01-02T00:00:00.000Z',
	pageCount: 2,
	pages: [
		{ slug: 'harbour', title: 'Harbour Ward', markdown: 'Ships at anchor.' },
		{ slug: 'crypt', title: 'The Sunken Crypt', markdown: 'Water to the knee.' },
	],
};

let root: Root;
let container: HTMLDivElement;

async function mount(search = '?id=w1') {
	await act(async () => {
		root.render(
			<MemoryRouter initialEntries={[`/wiki${search}`]}>
				<WikiReader />
			</MemoryRouter>,
		);
	});
}

beforeEach(() => {
	// This jsdom build ships no matchMedia, and `useViewport` reads it during the first render.
	(window as unknown as { matchMedia: unknown }).matchMedia = (query: string) => ({
		matches: false,
		media: query,
		addEventListener: () => {},
		removeEventListener: () => {},
	});
	(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	// jsdom has no layout, so scrollTo is unimplemented and logs to stderr.
	(window as unknown as { scrollTo: unknown }).scrollTo = () => {};
	container = document.createElement('div');
	document.body.appendChild(container);
	root = createRoot(container);
	mockedGetPublicWiki.mockReset();
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

describe('a repeated wrong wiki password gives feedback', () => {
	// The password phase used to carry only `wrong: boolean`, so the SECOND wrong password rendered a
	// byte-identical DOM: no visible change, and an unchanged role="alert" node announces nothing.
	// It read as "the Open wiki button is dead".
	async function typePasswordAndSubmit(value: string) {
		const input = container.querySelector<HTMLInputElement>('input[type="password"]')!;
		// React installs its own `value` setter to track changes; assigning `.value` directly leaves the
		// tracker thinking nothing changed and onChange never fires. Go through the native setter.
		const setValue = Object.getOwnPropertyDescriptor(
			HTMLInputElement.prototype,
			'value',
		)!.set!.bind(input);
		await act(async () => {
			setValue(value);
			input.dispatchEvent(new Event('input', { bubbles: true }));
		});
		const open = [...container.querySelectorAll('button')].find((b) =>
			/Open wiki|Checking/.test(b.textContent ?? ''),
		)!;
		await act(async () => {
			open.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		});
	}

	it('escalates the message and re-mounts the alert on each failed attempt', async () => {
		mockedGetPublicWiki.mockRejectedValue(new AppApiError('nope', 'unauthenticated', 401));
		await mount();

		// First prompt: no error yet.
		expect(container.querySelector('[role="alert"]')).toBeNull();
		expect(container.querySelector('input[type="password"]')).not.toBeNull();

		await typePasswordAndSubmit('first-guess');
		const firstAlert = container.querySelector('[role="alert"]');
		expect(firstAlert?.textContent).toContain('That password is not right');

		await typePasswordAndSubmit('second-guess');
		const secondAlert = container.querySelector('[role="alert"]');
		// Different copy, so a sighted user sees the retry was processed…
		expect(secondAlert?.textContent).toContain('Still not right after 2 attempts');
		// …and a NEW node, so role="alert" fires again for a screen reader.
		expect(secondAlert).not.toBe(firstAlert);
	});
});

describe('the wiki reader announces a load failure', () => {
	it('puts the invalid-wiki message in an alert region', async () => {
		mockedGetPublicWiki.mockRejectedValue(new AppApiError('This wiki is gone.', 'http', 404));
		await mount();
		// The loading phase announced itself politely; replacing that subtree without a live region
		// left a screen reader stuck on "Fetching the published pages…".
		expect(container.querySelector('[role="alert"]')?.textContent).toContain('This wiki is gone.');
	});

	it('offers a Try again that re-fetches, on the one route with no app chrome', async () => {
		// `/wiki` is the only surface whose audience is a non-user following a shared link: no nav, no
		// back chrome, no account. The commonest cause of `invalid` is a transient network failure
		// ("This wiki could not be loaded — try again."), and the phase was a dead end that gave the
		// reader nothing to try.
		mockedGetPublicWiki.mockRejectedValue(new AppApiError('Network unreachable.', 'http', 503));
		await mount();
		expect(mockedGetPublicWiki).toHaveBeenCalledTimes(1);

		const retry = [...container.querySelectorAll('button')].find(
			(b) => b.textContent === 'Try again',
		)!;
		expect(retry, 'the invalid phase had no recovery affordance at all').toBeTruthy();

		mockedGetPublicWiki.mockResolvedValue(WIKI);
		await act(async () => {
			retry.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		});
		expect(mockedGetPublicWiki).toHaveBeenCalledTimes(2);
		expect(container.textContent).toContain('The Copper Coast');
	});
});

describe('the ready wiki is navigable by keyboard', () => {
	beforeEach(() => {
		mockedGetPublicWiki.mockResolvedValue(WIKI);
	});

	it('exposes a main landmark and a skip link past the page nav', async () => {
		await mount();
		const main = container.querySelector('main#wiki-content');
		expect(main).not.toBeNull();
		expect(main!.getAttribute('tabindex')).toBe('-1');

		const skip = container.querySelector<HTMLAnchorElement>('a[data-skip-link]');
		expect(skip).not.toBeNull();
		expect(skip!.getAttribute('href')).toBe('#wiki-content');
		// The nav emits one button per page ahead of the article, so the skip link must come first.
		const nav = container.querySelector('nav[aria-label="Wiki pages"]')!;
		expect(skip!.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	it('moves focus to the new page heading when a page is switched', async () => {
		await mount();
		expect(container.querySelector('h2')?.textContent).toBe('Harbour Ward');

		const cryptBtn = [...container.querySelectorAll('nav button')].find(
			(b) => b.textContent === 'The Sunken Crypt',
		)!;
		await act(async () => {
			cryptBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		});

		const heading = container.querySelector('h2')!;
		expect(heading.textContent).toBe('The Sunken Crypt');
		// Focus used to stay on the nav button with nothing announcing the swap.
		expect(document.activeElement).toBe(heading);
	});

	it('does not steal focus on the initial load', async () => {
		await mount();
		expect(container.querySelector('h2')?.textContent).toBe('Harbour Ward');
		expect(document.activeElement).toBe(document.body);
	});
});

describe('the page nav does not swallow the phone viewport', () => {
	beforeEach(() => {
		mockedGetPublicWiki.mockResolvedValue(WIKI);
	});

	/** Re-point the matchMedia stub at a given width before the component's first render. */
	function setViewportWidth(px: number) {
		(window as unknown as { matchMedia: unknown }).matchMedia = (query: string) => {
			const max = /max-width:\s*(\d+)px/.exec(query);
			return {
				matches: max ? px <= Number(max[1]) : false,
				media: query,
				addEventListener: () => {},
				removeEventListener: () => {},
			};
		};
	}

	// The sticky + maxHeight treatment exists so that on DESKTOP a nav taller than the viewport can
	// still be scrolled to its last entry. On phone the split stacks to a single column and the nav is
	// the FIRST row, so the same properties turned the page list into a scroll-trapped panel filling
	// almost the whole screen with the article pushed entirely below it.
	it('keeps the sticky, height-capped nav on desktop', async () => {
		setViewportWidth(1280);
		await mount();
		const nav = container.querySelector<HTMLElement>('nav[aria-label="Wiki pages"]')!;
		expect(nav.style.position).toBe('sticky');
		expect(nav.style.maxHeight).not.toBe('');
		expect(nav.style.overflowY).toBe('auto');
	});

	it('drops it on phone, where the nav sits above the article in one column', async () => {
		setViewportWidth(390);
		await mount();
		const nav = container.querySelector<HTMLElement>('nav[aria-label="Wiki pages"]')!;
		expect(nav.style.position).not.toBe('sticky');
		expect(nav.style.maxHeight).toBe('');
		expect(nav.style.overflowY).toBe('');
	});
});

describe('the public reader names itself in the browser tab', () => {
	// `/wiki` is the one chrome-less, account-less surface in the app: no shell, no nav, no account.
	// The browser tab, the bookmark and the OS share sheet are its ONLY chrome, and every published
	// wiki was shipping the app's static <title>, so two open wikis were indistinguishable tabs.
	beforeEach(() => {
		document.title = 'DND Tools';
	});

	it('sets document.title once the wiki resolves', async () => {
		mockedGetPublicWiki.mockResolvedValue(WIKI);
		await mount();
		expect(document.title).toBe('The Copper Coast — Campaign wiki');
	});

	it('restores the previous title on unmount, so an in-session visit does not rename the app tab', async () => {
		mockedGetPublicWiki.mockResolvedValue(WIKI);
		await mount();
		expect(document.title).toBe('The Copper Coast — Campaign wiki');
		await act(async () => {
			root.unmount();
		});
		expect(document.title).toBe('DND Tools');
	});

	it('leaves the title alone while the wiki has not resolved', async () => {
		mockedGetPublicWiki.mockRejectedValue(new AppApiError('nope', 'http', 404));
		await mount();
		expect(document.title).toBe('DND Tools');
	});
});
