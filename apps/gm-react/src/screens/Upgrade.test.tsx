// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BillingStatus } from '../cloud/appApi';
import type { EntitlementsValue } from '../cloud/entitlements';

// RC-CLD-2.1 — the "e2e with a stub" for the Stripe billing UI (ADR-027). The Upgrade screen is
// driven end to end through STUBBED hooks: no network, no Cognito, no Stripe. `useEntitlements`
// is a controllable external store (so flipping the value re-renders the screen exactly as the
// real provider would), the account API's two billing calls are `vi.fn`s, and the browser hand-off
// to Stripe is observed through a stubbed `window.location.assign`. `cloud/billing.ts` itself
// stays REAL, so the surface rules and the stripe.com-only navigation guard are exercised too.
const mocks = vi.hoisted(() => {
	const listeners = new Set<() => void>();
	let value: EntitlementsValue | null = null;
	return {
		runtimeKind: 'web' as string,
		authStatus: 'signed-in' as string,
		createCheckoutSession: vi.fn(),
		createPortalSession: vi.fn(),
		openAuthModal: vi.fn(),
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

vi.mock('../cloud/entitlements', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../cloud/entitlements')>();
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
vi.mock('../cloud/AuthContext', () => ({
	useAuth: () => ({
		status: mocks.authStatus,
		user: { sub: 'user-1' },
		openAuthModal: mocks.openAuthModal,
	}),
}));
vi.mock('../cloud/config', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../cloud/config')>();
	return {
		...actual,
		isAccountApiConfigured: true,
		cloudConfig: { ...actual.cloudConfig, publicAppUrl: 'https://lamplight.click/' },
	};
});
vi.mock('../platform/capabilities', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../platform/capabilities')>();
	// Only the surface rule (`runtimeKind`) is steered; the rest of the module stays real because
	// the account API's token store reads `getPlatformCapabilities()` while loading.
	const platformCapabilities = {
		...actual.platformCapabilities,
		get runtimeKind() {
			return mocks.runtimeKind as typeof actual.platformCapabilities.runtimeKind;
		},
	};
	return { ...actual, platformCapabilities };
});
vi.mock('../cloud/appApi', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../cloud/appApi')>();
	return {
		...actual,
		createCheckoutSession: mocks.createCheckoutSession,
		createPortalSession: mocks.createPortalSession,
	};
});

const { AppApiError } = await import('../cloud/appApi');
const { OFFLINE_FALLBACK_MATRIX } = await import('../cloud/entitlements');
const { Toaster, ToastViewport } = await import('../ds');
const { I18nProvider } = await import('../i18n');
const { Upgrade } = await import('./Upgrade');

const CHECKOUT_URL = 'https://checkout.stripe.com/c/pay/cs_test_1';
const PORTAL_URL = 'https://billing.stripe.com/p/session/ps_1';

const status = (over: Partial<BillingStatus> = {}): BillingStatus => ({
	provider: 'stripe',
	checkoutAvailable: true,
	portalAvailable: false,
	status: null,
	active: false,
	interval: null,
	currentPeriodEnd: null,
	cancelAtPeriodEnd: false,
	livemode: false,
	...over,
});
const subscribedStatus = (over: Partial<BillingStatus> = {}): BillingStatus =>
	status({
		status: 'active',
		active: true,
		portalAvailable: true,
		interval: 'month',
		currentPeriodEnd: 1_791_000_000,
		...over,
	});

// The stub's `refresh` mimics the provider: every call publishes a NEW value object, which is
// what re-arms the screen's confirmation poll (its effect keys on the entitlements identity).
const refresh = vi.fn(async () => {
	const current = mocks.store.get();
	if (current) mocks.store.set({ ...current });
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
	refresh,
	...over,
});

let root: Root;
let container: HTMLDivElement;

function LocationProbe() {
	const { pathname, search } = useLocation();
	return <span data-testid="location">{`${pathname}${search}`}</span>;
}

async function mount(path = '/upgrade', value: EntitlementsValue = ent()) {
	mocks.store.set(value);
	await act(async () => {
		root.render(
			<I18nProvider>
				<MemoryRouter initialEntries={[path]}>
					<Upgrade />
					<LocationProbe />
				</MemoryRouter>
				<ToastViewport />
			</I18nProvider>,
		);
	});
}

const buttons = (scope: ParentNode = container) => [...scope.querySelectorAll('button')];
const named = (label: string, scope: ParentNode = container) =>
	buttons(scope).filter((b) => b.textContent?.trim() === label);
function button(label: string, scope: ParentNode = container): HTMLButtonElement {
	const match = named(label, scope)[0];
	if (!match) throw new Error(`Button not found: ${label}`);
	return match;
}
const dialog = () => container.querySelector<HTMLElement>('[role="dialog"]');
function dialogTitle(): string {
	const id = dialog()?.getAttribute('aria-labelledby');
	// `useId` ids carry colons, and jsdom ships no `CSS.escape`, so look the node up by id directly.
	return (id && document.getElementById(id)?.textContent?.trim()) || '';
}
const locationText = () => container.querySelector('[data-testid="location"]')?.textContent;
const confirmingBanner = () =>
	[...container.querySelectorAll('[role="status"]')].find((el) =>
		el.textContent?.includes('Confirming your subscription with Stripe…'),
	);
const assign = () => vi.mocked(window.location.assign);

/** Click and let the async billing call + its `.catch` settle (microtasks only — no real timers,
 *  so it also works under fake timers). */
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
	// jsdom's `location.assign` is non-configurable (spyOn throws "Cannot redefine property"), but
	// vitest exposes `location` on globalThis through a configurable getter, so the whole object
	// can be swapped for the test and restored by `vi.unstubAllGlobals()`.
	vi.stubGlobal('location', {
		href: 'http://localhost/upgrade',
		origin: 'http://localhost',
		protocol: 'http:',
		host: 'localhost',
		hostname: 'localhost',
		pathname: '/upgrade',
		search: '',
		hash: '',
		assign: vi.fn(),
		replace: vi.fn(),
		reload: vi.fn(),
	});
	mocks.runtimeKind = 'web';
	mocks.authStatus = 'signed-in';
	mocks.createCheckoutSession.mockReset();
	mocks.createPortalSession.mockReset();
	mocks.createCheckoutSession.mockResolvedValue({ url: CHECKOUT_URL });
	mocks.createPortalSession.mockResolvedValue({ url: PORTAL_URL });
	refresh.mockClear();
	Toaster.clear();
	container = document.createElement('div');
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	Toaster.clear();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('live billing on the web build', () => {
	it('offers Stripe Checkout on the paid cards, with the Stripe footer', async () => {
		await mount();
		expect(container.querySelector('h2')?.textContent).toBe(
			'Local play stays free. Cloud plans are available.',
		);
		expect(named('Subscribe to Lantern')).toHaveLength(1);
		expect(named('Subscribe to Beacon')).toHaveLength(1);
		expect(button('Subscribe to Lantern').disabled).toBe(false);
		// The free plan is the current one, so it carries no CTA; nobody is subscribed, so no portal.
		expect(named('Your current plan')).toHaveLength(1);
		expect(named('Manage billing')).toHaveLength(0);
		expect(container.textContent).toContain(
			'Prices are in USD, billed by Stripe. Cancel any time; no account is needed to keep playing locally.',
		);
		expect(container.textContent).toContain('Billing is handled by Stripe.');
	});

	it('shows the test-mode badge only for a Stripe test-mode stage', async () => {
		await mount('/upgrade', ent({ billing: status({ livemode: false }) }));
		const badge = container.querySelector('[data-testid="billing-test-mode"]');
		expect(badge?.textContent).toContain('Test mode — no real charges');

		await mount('/upgrade', ent({ billing: status({ livemode: true }) }));
		expect(container.querySelector('[data-testid="billing-test-mode"]')).toBeNull();
		expect(container.textContent).not.toContain('Test mode — no real charges');
	});

	it('confirms plan + cycle in a dialog, then hands the browser to hosted Checkout', async () => {
		await mount();
		await click(button('Subscribe to Lantern'));
		expect(dialogTitle()).toBe('Subscribe to Lantern');
		expect(dialog()?.textContent).toContain('$7');
		expect(dialog()?.textContent).toContain('/mo');
		expect(dialog()?.textContent).toContain('Lamplight never sees your card details.');
		await click(button('Cancel', dialog()!));
		expect(dialog()).toBeNull();

		const annual = container.querySelector<HTMLButtonElement>(
			'[role="switch"][aria-label="Show annual pricing"]',
		)!;
		expect(annual.getAttribute('aria-checked')).toBe('false');
		await click(annual);
		expect(annual.getAttribute('aria-checked')).toBe('true');

		await click(button('Subscribe to Lantern'));
		expect(dialogTitle()).toBe('Subscribe to Lantern');
		expect(dialog()?.textContent).toContain('$70');
		expect(dialog()?.textContent).toContain('/yr');
		expect(dialog()?.textContent).not.toContain('$7/mo');

		await click(button('Continue to secure checkout', dialog()!));
		expect(mocks.createCheckoutSession).toHaveBeenCalledTimes(1);
		expect(mocks.createCheckoutSession).toHaveBeenCalledWith('lantern', 'year');
		expect(assign()).toHaveBeenCalledTimes(1);
		expect(assign()).toHaveBeenCalledWith(CHECKOUT_URL);
		// The browser is leaving for Stripe: the dialog stays busy rather than re-arming the button.
		expect(named('Opening checkout…', dialog()!)).toHaveLength(1);
	});

	it('sends the monthly interval when the cycle toggle is left alone', async () => {
		await mount();
		await click(button('Subscribe to Beacon'));
		expect(dialogTitle()).toBe('Subscribe to Beacon');
		expect(dialog()?.textContent).toContain('$15');
		await click(button('Continue to secure checkout', dialog()!));
		expect(mocks.createCheckoutSession).toHaveBeenCalledWith('beacon', 'month');
		expect(assign()).toHaveBeenCalledWith(CHECKOUT_URL);
	});

	it('surfaces a refused Checkout session as an error toast and does not navigate', async () => {
		mocks.createCheckoutSession.mockRejectedValue(
			new AppApiError('This account already has an active subscription.', 'http', 409),
		);
		await mount();
		await click(button('Subscribe to Lantern'));
		await click(button('Continue to secure checkout', dialog()!));
		expect(mocks.createCheckoutSession).toHaveBeenCalledWith('lantern', 'month');
		expect(assign()).not.toHaveBeenCalled();
		const alert = container.querySelector('[role="alert"]');
		expect(alert?.textContent).toContain('This account already has an active subscription.');
		// The dialog is still open and usable again — the failure did not strand the button.
		expect(button('Continue to secure checkout', dialog()!).disabled).toBe(false);
	});

	it('refuses to follow a non-Stripe URL from the backend', async () => {
		mocks.createCheckoutSession.mockResolvedValue({ url: 'https://phish.example/pay' });
		await mount();
		await click(button('Subscribe to Lantern'));
		await click(button('Continue to secure checkout', dialog()!));
		expect(assign()).not.toHaveBeenCalled();
		expect(container.querySelector('[role="alert"]')?.textContent).toContain(
			'The billing page address was not a Stripe page.',
		);
	});

	it('routes a subscribed account to the hosted portal from the hero and every card', async () => {
		await mount('/upgrade', ent({ plan: 'lantern', billing: subscribedStatus() }));
		expect(named('Subscribe to Beacon')).toHaveLength(0);
		expect(named('Subscribe to Lantern')).toHaveLength(0);
		expect(named('Your current plan')).toHaveLength(1);
		// Hero button + the Hearth and Beacon cards.
		const manage = named('Manage billing');
		expect(manage).toHaveLength(3);
		for (const b of manage) expect(b.disabled).toBe(false);

		await click(manage[0]);
		expect(mocks.createPortalSession).toHaveBeenCalledTimes(1);
		expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
		expect(assign()).toHaveBeenCalledWith(PORTAL_URL);
	});

	it('reports a portal failure without navigating', async () => {
		mocks.createPortalSession.mockRejectedValue(
			new AppApiError('No billing account.', 'http', 404),
		);
		await mount('/upgrade', ent({ plan: 'lantern', billing: subscribedStatus() }));
		await click(named('Manage billing')[0]);
		expect(assign()).not.toHaveBeenCalled();
		expect(container.querySelector('[role="alert"]')?.textContent).toContain('No billing account.');
		expect(named('Manage billing')[0].disabled).toBe(false);
	});
});

describe('informs-only surfaces (Android / desktop)', () => {
	it('names the web host, disables the paid CTAs, and never starts Checkout', async () => {
		mocks.runtimeKind = 'android';
		await mount();
		expect(container.textContent).toContain(
			'Cloud plans are purchased from the web app at lamplight.click. A subscription on your account works here automatically.',
		);
		expect(container.querySelector('h2')?.textContent).toBe(
			'Local play stays free. Cloud plans are available.',
		);
		const ctas = named('Subscribe at lamplight.click');
		expect(ctas).toHaveLength(2);
		for (const b of ctas) expect(b.disabled).toBe(true);
		expect(named('Subscribe to Lantern')).toHaveLength(0);
		expect(named('Manage billing')).toHaveLength(0);
		// Per Play policy the surface may only inform: no link and no button leads off to a purchase.
		const offsiteLinks = [...container.querySelectorAll('a[href]')].filter((a) =>
			/stripe|lamplight/i.test(a.getAttribute('href') ?? ''),
		);
		expect(offsiteLinks).toHaveLength(0);
		for (const b of ctas) await click(b);
		expect(dialog()).toBeNull();
		expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
		expect(assign()).not.toHaveBeenCalled();
	});

	it('keeps a subscribed account on the portal-less path on Electron', async () => {
		mocks.runtimeKind = 'electron';
		await mount('/upgrade', ent({ plan: 'lantern', billing: subscribedStatus() }));
		// The hero portal button is web-only; the cards fall back to disabled "manage on the web" CTAs.
		const manage = named('Manage at lamplight.click');
		expect(manage).toHaveLength(2);
		for (const b of manage) expect(b.disabled).toBe(true);
		expect(mocks.createPortalSession).not.toHaveBeenCalled();
	});
});

describe('returning from Checkout', () => {
	it('polls entitlements until the webhook lands, then confirms the plan', async () => {
		vi.useFakeTimers();
		await mount('/upgrade?checkout=success');
		expect(confirmingBanner()).toBeTruthy();
		// The marker is dropped from the URL so a reload cannot replay the confirmation.
		expect(locationText()).toBe('/upgrade');
		expect(refresh).not.toHaveBeenCalled();

		await act(async () => {
			vi.advanceTimersByTime(2500);
		});
		expect(refresh).toHaveBeenCalledTimes(1);
		await act(async () => {
			vi.advanceTimersByTime(2500);
		});
		expect(refresh).toHaveBeenCalledTimes(2);
		expect(confirmingBanner()).toBeTruthy();

		// The webhook has written the plan: the next refresh reports the active subscription.
		await act(async () => {
			mocks.store.set(ent({ plan: 'lantern', billing: subscribedStatus() }));
		});
		expect(confirmingBanner()).toBeUndefined();
		expect(container.textContent).toContain('You are now on Lantern. Thank you!');
		expect(named('Manage billing').length).toBeGreaterThan(0);
		// Polling stops once confirmed.
		await act(async () => {
			vi.advanceTimersByTime(10_000);
		});
		expect(refresh).toHaveBeenCalledTimes(2);
	});

	it('gives up honestly after twelve attempts', async () => {
		vi.useFakeTimers();
		await mount('/upgrade?checkout=success');
		for (let i = 0; i < 12; i++) {
			await act(async () => {
				vi.advanceTimersByTime(2500);
			});
		}
		expect(refresh).toHaveBeenCalledTimes(12);
		expect(confirmingBanner()).toBeUndefined();
		expect(container.textContent).toContain(
			'Your payment went through, but the plan has not updated yet.',
		);
		await act(async () => {
			vi.advanceTimersByTime(2500);
		});
		expect(refresh).toHaveBeenCalledTimes(12);
	});

	it('says nothing was charged when Checkout was cancelled, and strips the marker', async () => {
		await mount('/upgrade?checkout=cancelled');
		expect(container.textContent).toContain('Checkout cancelled — nothing was charged.');
		expect(locationText()).toBe('/upgrade');
		expect(confirmingBanner()).toBeUndefined();
		expect(refresh).not.toHaveBeenCalled();
		expect(assign()).not.toHaveBeenCalled();
	});

	it('keeps unrelated query parameters when stripping the marker', async () => {
		await mount('/upgrade?tab=cloud&checkout=cancelled');
		expect(locationText()).toBe('/upgrade?tab=cloud');
	});
});

describe('no billing configured', () => {
	it('keeps the pre-existing no-payment preview flow intact', async () => {
		await mount('/upgrade', ent({ billing: null, canChangePlan: true, simulated: true }));
		expect(container.querySelector('h2')?.textContent).toBe(
			'Local play stays free. Cloud plans are in preview.',
		);
		expect(named('Try Lantern preview')).toHaveLength(1);
		expect(named('Try Beacon preview')).toHaveLength(1);
		expect(named('Subscribe to Lantern')).toHaveLength(0);
		expect(named('Manage billing')).toHaveLength(0);
		expect(container.querySelector('[data-testid="billing-test-mode"]')).toBeNull();
		expect(container.textContent).toContain('Preview access is free.');

		await click(button('Try Lantern preview'));
		expect(dialogTitle()).toBe('Try Lantern preview');
		expect(dialog()?.textContent).toContain('Cloud-plan preview — no payment is taken.');
		expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
	});

	it('labels the gated production state when plan changes are unavailable', async () => {
		await mount('/upgrade', ent({ billing: null, canChangePlan: false }));
		expect(container.querySelector('h2')?.textContent).toBe(
			'Local play stays free. Cloud plan sign-up is not available yet.',
		);
		expect(named('Plan changes unavailable')).toHaveLength(2);
	});
});
