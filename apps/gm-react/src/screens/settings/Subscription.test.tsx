// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BillingStatus } from '../../cloud/appApi';
import type { EntitlementsValue } from '../../cloud/entitlements';

// RC-CLD-2.1 — the "e2e with a stub" for Settings › Subscription (ADR-027). Same harness as
// `screens/Upgrade.test.tsx`: `useEntitlements` is a controllable external store, the account
// API's billing calls are `vi.fn`s, `window.location.assign` is stubbed, and `cloud/billing.ts`
// (surface rules, Stripe-only navigation guard, lifecycle phase) stays real.
const mocks = vi.hoisted(() => {
	const listeners = new Set<() => void>();
	let value: EntitlementsValue | null = null;
	return {
		runtimeKind: 'web' as string,
		createCheckoutSession: vi.fn(),
		createPortalSession: vi.fn(),
		store: {
			get: () => value,
			set(next: EntitlementsValue) {
				value = next;
				for (const fn of listeners) fn();
			},
			subscribe(fn: () => void) {
				listeners.add(fn);
				return () => {
					listeners.delete(fn);
				};
			},
		},
	};
});

vi.mock('../../cloud/entitlements', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../cloud/entitlements')>();
	const { useSyncExternalStore } = await import('react');
	return {
		...actual,
		useEntitlements: () => {
			const value = useSyncExternalStore(mocks.store.subscribe, mocks.store.get);
			if (!value) throw new Error('test: entitlements value not set before mount');
			return value;
		},
	};
});
vi.mock('../../cloud/AuthContext', () => ({
	useAuth: () => ({ status: 'signed-in', user: { sub: 'user-1' }, openAuthModal: vi.fn() }),
}));
vi.mock('../../cloud/config', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../cloud/config')>();
	return {
		...actual,
		isAccountApiConfigured: true,
		cloudConfig: { ...actual.cloudConfig, publicAppUrl: 'https://lamplight.click/' },
	};
});
vi.mock('../../platform/capabilities', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../platform/capabilities')>();
	const platformCapabilities = {
		...actual.platformCapabilities,
		get runtimeKind() {
			return mocks.runtimeKind as typeof actual.platformCapabilities.runtimeKind;
		},
	};
	return { ...actual, platformCapabilities };
});
vi.mock('../../cloud/appApi', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../cloud/appApi')>();
	return {
		...actual,
		createCheckoutSession: mocks.createCheckoutSession,
		createPortalSession: mocks.createPortalSession,
	};
});

const { AppApiError } = await import('../../cloud/appApi');
const { OFFLINE_FALLBACK_MATRIX } = await import('../../cloud/entitlements');
const { Toaster, ToastViewport } = await import('../../ds');
const { I18nProvider } = await import('../../i18n');
const { SettingsSubscription } = await import('./Subscription');

const PORTAL_URL = 'https://billing.stripe.com/p/session/ps_1';
// Epoch seconds, mid-day UTC so the rendered calendar date is the same in every zone.
const PERIOD_END = 1_791_000_000;
const periodEndText = new Intl.DateTimeFormat('en', { dateStyle: 'long' }).format(
	new Date(PERIOD_END * 1000),
);

const status = (over: Partial<BillingStatus> = {}): BillingStatus => ({
	provider: 'stripe',
	checkoutAvailable: true,
	portalAvailable: false,
	status: null,
	active: false,
	interval: null,
	currentPeriodEnd: null,
	cancelAtPeriodEnd: false,
	livemode: true,
	...over,
});
const subscribedStatus = (over: Partial<BillingStatus> = {}): BillingStatus =>
	status({
		status: 'active',
		active: true,
		portalAvailable: true,
		interval: 'month',
		currentPeriodEnd: PERIOD_END,
		...over,
	});
const ent = (over: Partial<EntitlementsValue> = {}): EntitlementsValue => ({
	plan: 'hearth',
	features: OFFLINE_FALLBACK_MATRIX,
	source: 'server',
	loading: false,
	serverBacked: true,
	canChangePlan: false,
	simulated: false,
	billing: status(),
	setPlan: vi.fn(async () => undefined),
	refresh: vi.fn(async () => undefined),
	...over,
});
const lanternSubscriber = (over: Partial<BillingStatus> = {}) =>
	ent({ plan: 'lantern', billing: subscribedStatus(over) });

let root: Root;
let container: HTMLDivElement;

async function mount(value: EntitlementsValue) {
	mocks.store.set(value);
	await act(async () => {
		root.render(
			<I18nProvider>
				<MemoryRouter initialEntries={['/settings']}>
					<SettingsSubscription />
				</MemoryRouter>
				<ToastViewport />
			</I18nProvider>,
		);
	});
}

const named = (label: string) =>
	[...container.querySelectorAll('button')].filter((b) => b.textContent?.trim() === label);
const phaseLine = () => container.querySelector('[data-testid="billing-phase"]')?.textContent;
const assign = () => vi.mocked(window.location.assign);

async function click(el: HTMLElement) {
	await act(async () => {
		el.click();
		for (let i = 0; i < 8; i++) await Promise.resolve();
	});
}

beforeEach(() => {
	(window as unknown as { matchMedia: unknown }).matchMedia = (query: string) => ({
		matches: false,
		media: query,
		addEventListener: () => {},
		removeEventListener: () => {},
	});
	(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	(window as unknown as { scrollTo: unknown }).scrollTo = () => {};
	vi.stubGlobal('location', {
		href: 'http://localhost/settings',
		origin: 'http://localhost',
		protocol: 'http:',
		host: 'localhost',
		hostname: 'localhost',
		pathname: '/settings',
		search: '',
		hash: '',
		assign: vi.fn(),
		replace: vi.fn(),
		reload: vi.fn(),
	});
	mocks.runtimeKind = 'web';
	mocks.createCheckoutSession.mockReset();
	mocks.createPortalSession.mockReset();
	mocks.createPortalSession.mockResolvedValue({ url: PORTAL_URL });
	Toaster.clear();
	container = document.createElement('div');
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	Toaster.clear();
	vi.unstubAllGlobals();
});

describe('live billing with a renewing subscription', () => {
	it('shows the account badge, the renewal date, and a working Manage billing button', async () => {
		await mount(lanternSubscriber());
		expect(container.textContent).toContain('Your account');
		expect(container.textContent).not.toContain('Account preview');
		expect(container.textContent).toContain('Lantern');
		expect(container.textContent).toContain('Encrypted off-device backup · $7/mo');
		expect(phaseLine()).toBe(`Renews on ${periodEndText}.`);
		expect(container.textContent).toContain('Billing');
		expect(container.textContent).toContain('Payments and cancellation');
		expect(container.textContent).toContain(
			'Payments are processed by Stripe on its secure hosted pages; Lamplight never stores card details.',
		);
		expect(container.textContent).not.toContain('Manage your subscription from the web app');
		// Live mode: no test-mode badge.
		expect(container.textContent).not.toContain('Test mode');

		// The Billing panel's action plus the two non-current plan cards.
		const manage = named('Manage billing');
		expect(manage).toHaveLength(3);
		for (const b of manage) expect(b.disabled).toBe(false);
		await click(manage[0]);
		expect(mocks.createPortalSession).toHaveBeenCalledTimes(1);
		expect(assign()).toHaveBeenCalledWith(PORTAL_URL);
	});

	it('prices an annual subscription per year and flags a test-mode stage', async () => {
		await mount(lanternSubscriber({ interval: 'year', livemode: false }));
		expect(container.textContent).toContain('Encrypted off-device backup · $70/yr');
		expect(container.textContent).toContain('Test mode');
	});

	it('reports a portal failure as an error toast without navigating', async () => {
		mocks.createPortalSession.mockRejectedValue(
			new AppApiError('No billing account.', 'http', 404),
		);
		await mount(lanternSubscriber());
		await click(named('Manage billing')[0]);
		expect(assign()).not.toHaveBeenCalled();
		expect(container.querySelector('[role="alert"]')?.textContent).toContain('No billing account.');
		expect(named('Manage billing')[0].disabled).toBe(false);
	});

	it('on Android points at the web app instead of offering the portal', async () => {
		mocks.runtimeKind = 'android';
		await mount(lanternSubscriber());
		expect(phaseLine()).toBe(`Renews on ${periodEndText}.`);
		expect(container.textContent).toContain(
			'Manage your subscription from the web app at lamplight.click.',
		);
		// The Billing panel carries no portal action, and nothing on the screen can open one.
		const enabledManage = named('Manage billing').filter((b) => !b.disabled);
		expect(enabledManage).toHaveLength(0);
		for (const b of named('Manage billing')) await click(b);
		expect(mocks.createPortalSession).not.toHaveBeenCalled();
		expect(assign()).not.toHaveBeenCalled();
	});
});

describe('subscription lifecycle phases', () => {
	it('announces a scheduled cancellation with the date cloud features stay on until', async () => {
		await mount(lanternSubscriber({ cancelAtPeriodEnd: true }));
		expect(phaseLine()).toBe(
			`Cancellation scheduled — cloud features stay on until ${periodEndText}.`,
		);
	});

	it('warns about a failed payment while the subscription is past due', async () => {
		await mount(lanternSubscriber({ status: 'past_due' }));
		expect(phaseLine()).toBe(
			'The last payment failed. Update your card from Manage billing to keep cloud features.',
		);
		expect(named('Manage billing').length).toBeGreaterThan(0);
	});

	it('says the subscription has ended once it is no longer active', async () => {
		await mount(
			ent({
				plan: 'hearth',
				billing: status({ status: 'canceled', active: false, portalAvailable: true }),
			}),
		);
		expect(phaseLine()).toBe('Your subscription has ended. You are on the free plan.');
		// The portal stays reachable (invoices), and the paid cards go back to the Upgrade path.
		expect(named('Manage billing')).toHaveLength(1);
		expect(named('Subscribe')).toHaveLength(2);
	});

	it('shows no subscription for a live account that never subscribed', async () => {
		await mount(ent());
		expect(phaseLine()).toBe('No active subscription.');
		expect(named('Manage billing')).toHaveLength(0);
		expect(named('Subscribe')).toHaveLength(2);
		expect(named('Compare plans')).toHaveLength(1);
	});

	it('on an informs-only surface the paid cards say View plan, not Subscribe', async () => {
		mocks.runtimeKind = 'android';
		await mount(ent());
		expect(named('Subscribe')).toHaveLength(0);
		expect(named('View plan')).toHaveLength(2);
	});
});

describe('no billing configured', () => {
	it('renders the pre-existing preview panel', async () => {
		await mount(ent({ billing: null, canChangePlan: true, simulated: true }));
		expect(container.textContent).toContain('Preview access');
		expect(container.textContent).toContain('Account preview');
		expect(container.textContent).toContain(
			'Cloud plans are currently a free preview. Listed prices are planned launch prices;',
		);
		expect(container.textContent).toContain('on your account');
		expect(container.textContent).not.toContain('Payments and cancellation');
		expect(container.querySelector('[data-testid="billing-phase"]')).toBeNull();
		expect(named('Manage billing')).toHaveLength(0);
		expect(named('Try preview')).toHaveLength(2);
		expect(named('Compare preview plans')).toHaveLength(1);
	});

	it('renders the gated copy when plan changes are unavailable', async () => {
		await mount(ent({ billing: null, canChangePlan: false }));
		expect(container.textContent).toContain('Plan availability');
		expect(container.textContent).toContain(
			'Self-service cloud plan changes are not available in this release.',
		);
		expect(named('View plan')).toHaveLength(2);
	});
});
