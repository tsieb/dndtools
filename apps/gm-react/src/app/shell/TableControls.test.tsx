// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LOCALE_STORAGE_KEY, loadCatalog } from '../../i18n';
import { removePreference, writePreference } from '../../platform/preferences';

/**
 * RC-ENG-15.2 — the shell's Host table and Account controls carry visible labels and catalog copy.
 *
 * Account renders only with the cloud configured, which the Playwright server never is
 * (`isolation-guard.spec.ts`), so its labelled, menu-first behaviour is held here: signed out it
 * opens sign-in, signed in it opens a menu (Account settings, Sign out) instead of signing out on
 * the first click under an "Account" label.
 */

const auth = {
	isConfigured: true,
	status: 'signed-out' as 'signed-out' | 'signed-in',
	user: null as { email: string } | null,
	openAuthModal: vi.fn(),
	signOut: vi.fn(async () => undefined),
};
vi.mock('../../cloud/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../cloud/offline', () => ({
	useCloudActions: () => ({ blocked: false, offline: false, offlineProps: {}, offlineStyle: {} }),
	CloudOfflineNotice: () => null,
}));

const session = {
	role: 'idle' as 'idle' | 'host',
	peers: [] as Array<{ connected: boolean }>,
	pendingJoins: [] as unknown[],
};
vi.mock('../../net/SessionContext', () => ({ useSession: () => session }));

const { AccountButton, HostSessionButton } = await import('../../net/SessionPanel');

let root: Root;
let container: HTMLDivElement;

function Where() {
	const location = useLocation();
	return <output data-testid="where">{`${location.pathname}${location.search}`}</output>;
}

async function mount(node: React.ReactNode) {
	await act(async () => {
		root.render(
			<MemoryRouter>
				<I18nProvider>
					{node}
					<Where />
				</I18nProvider>
			</MemoryRouter>,
		);
	});
}

const button = () => container.querySelector('button')!;
const where = () => container.querySelector('[data-testid="where"]')!.textContent;
const menuItems = () =>
	[...document.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent?.trim());

describe('RC-ENG-15.2 labelled table controls', () => {
	beforeEach(() => {
		removePreference(LOCALE_STORAGE_KEY);
		container = document.createElement('div');
		document.body.appendChild(container);
		root = createRoot(container);
		auth.status = 'signed-out';
		auth.user = null;
		auth.openAuthModal.mockClear();
		auth.signOut.mockClear();
		session.role = 'idle';
		session.peers = [];
		session.pendingJoins = [];
	});
	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		document.body.innerHTML = '';
	});

	it('Account signed out: visible "Account", a named sign-in action', async () => {
		await mount(<AccountButton />);
		expect(button().textContent).toBe('Account');
		expect(button().getAttribute('aria-label')).toBe(
			'Account — sign in for online play and encrypted cloud backup',
		);
		await act(async () => button().click());
		expect(auth.openAuthModal).toHaveBeenCalledTimes(1);
		expect(menuItems()).toEqual([]);
	});

	it('Account signed in: the label opens a menu, it never signs out on the first click', async () => {
		auth.status = 'signed-in';
		auth.user = { email: 'dm@example.invalid' };
		await mount(<AccountButton />);
		expect(button().textContent).toBe('Account');
		expect(button().getAttribute('aria-label')).toBe('Account — signed in as dm@example.invalid');
		expect(button().getAttribute('aria-haspopup')).toBe('menu');

		await act(async () => button().click());
		expect(auth.signOut).not.toHaveBeenCalled();
		expect(button().getAttribute('aria-expanded')).toBe('true');
		expect(document.body.textContent).toContain('Signed in as dm@example.invalid');
		expect(menuItems()).toEqual(['Account settings', 'Sign out']);

		const settings = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')][0]!;
		await act(async () => settings.click());
		expect(where()).toBe('/settings?tab=account');
		expect(menuItems()).toEqual([]);

		await act(async () => button().click());
		const signOut = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')][1]!;
		await act(async () => signOut.click());
		expect(auth.signOut).toHaveBeenCalledTimes(1);
	});

	it('Host table keeps one visible label and spells the state out in its name', async () => {
		await mount(<HostSessionButton />);
		expect(button().textContent).toBe('Host table');
		expect(button().getAttribute('aria-label')).toBe('Host table');

		session.role = 'host';
		session.peers = [{ connected: true }, { connected: true }, { connected: false }];
		await mount(<HostSessionButton />);
		expect(button().textContent).toBe('Host table · 2');
		expect(button().getAttribute('aria-label')).toBe('Host table — hosting 2 players');

		session.pendingJoins = [{}];
		await mount(<HostSessionButton />);
		expect(button().textContent).toBe('Host table · 1 waiting');
		expect(button().getAttribute('aria-label')).toBe(
			'Host table — 1 player is waiting for approval',
		);
	});

	it('a sheet row is full width and keeps the label', async () => {
		await mount(<HostSessionButton layout="row" />);
		expect(button().style.width).toBe('100%');
		expect(button().textContent).toBe('Host table');
	});

	it('Spanish: both controls read from the catalog', async () => {
		writePreference(LOCALE_STORAGE_KEY, 'es');
		await loadCatalog('es');
		auth.status = 'signed-in';
		auth.user = { email: 'dm@example.invalid' };
		session.role = 'host';
		session.peers = [{ connected: true }];
		await mount(
			<>
				<HostSessionButton />
				<AccountButton />
			</>,
		);
		const [host, account] = [...container.querySelectorAll('button')];
		expect(host!.textContent).toBe('Organizar mesa · 1');
		expect(host!.getAttribute('aria-label')).toBe('Organizar mesa — 1 jugador conectado');
		expect(account!.textContent).toBe('Cuenta');
		expect(account!.getAttribute('aria-label')).toBe(
			'Cuenta — sesión iniciada como dm@example.invalid',
		);
	});
});
