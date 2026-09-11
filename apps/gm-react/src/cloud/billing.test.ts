import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BillingStatus } from './appApi';

// ADR-027 client helpers: the web-only rule, the "only ever navigate to a Stripe page" guard,
// and the Checkout return-marker parsing the Upgrade screen relies on.
const mocks = vi.hoisted(() => ({
	runtimeKind: 'web' as string,
	createCheckoutSession: vi.fn(),
	createPortalSession: vi.fn(),
	publicAppUrl: 'https://lamplight.click/',
}));
vi.mock('../platform/capabilities', () => ({
	platformCapabilities: {
		get runtimeKind() {
			return mocks.runtimeKind;
		},
	},
}));
vi.mock('./config', () => ({
	cloudConfig: {
		get publicAppUrl() {
			return mocks.publicAppUrl;
		},
	},
}));
vi.mock('./appApi', () => ({
	createCheckoutSession: mocks.createCheckoutSession,
	createPortalSession: mocks.createPortalSession,
}));

import {
	assertStripeHostedUrl,
	billingInformsOnly,
	billingWebHost,
	canOpenPortal,
	canStartCheckout,
	openBillingPortal,
	readCheckoutReturn,
	startCheckout,
	stripCheckoutReturn,
	subscriptionPhase,
} from './billing';

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
const view = (
	billing: BillingStatus | null,
	over: Partial<{ serverBacked: boolean; loading: boolean }> = {},
) => ({
	serverBacked: true,
	loading: false,
	billing,
	...over,
});

beforeEach(() => {
	mocks.runtimeKind = 'web';
	mocks.createCheckoutSession.mockReset();
	mocks.createPortalSession.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe('surface rules', () => {
	it('offers Checkout only when signed in, configured, and on the web build', () => {
		expect(canStartCheckout(view(status()))).toBe(true);
		expect(canStartCheckout(view(null))).toBe(false);
		expect(canStartCheckout(view(status(), { serverBacked: false }))).toBe(false);
		expect(canStartCheckout(view(status(), { loading: true }))).toBe(false);
		expect(canStartCheckout(view(status({ checkoutAvailable: false })))).toBe(false);
		for (const kind of ['android', 'ios', 'electron']) {
			mocks.runtimeKind = kind;
			expect(canStartCheckout(view(status()))).toBe(false);
			expect(billingInformsOnly(view(status()))).toBe(true);
		}
	});

	it('offers the portal only for an account with billing history, on the web build', () => {
		expect(canOpenPortal(view(status()))).toBe(false);
		expect(canOpenPortal(view(status({ portalAvailable: true })))).toBe(true);
		mocks.runtimeKind = 'android';
		expect(canOpenPortal(view(status({ portalAvailable: true })))).toBe(false);
	});

	it('informs-only is never true where billing is not configured at all', () => {
		mocks.runtimeKind = 'android';
		expect(billingInformsOnly(view(null))).toBe(false);
	});

	it('names the web host from the public app URL, with a safe fallback', () => {
		expect(billingWebHost()).toBe('lamplight.click');
		mocks.publicAppUrl = 'https://dev.example.net/';
		expect(billingWebHost()).toBe('dev.example.net');
		mocks.publicAppUrl = '';
		expect(billingWebHost()).toBe('lamplight.click');
		mocks.publicAppUrl = 'https://lamplight.click/';
	});
});

describe('navigation guard', () => {
	it('accepts only https URLs on a stripe.com host', () => {
		expect(assertStripeHostedUrl('https://checkout.stripe.com/c/pay/cs_1').hostname).toBe(
			'checkout.stripe.com',
		);
		expect(assertStripeHostedUrl('https://billing.stripe.com/p/session/x').hostname).toBe(
			'billing.stripe.com',
		);
		for (const bad of [
			'http://checkout.stripe.com/c/pay/cs_1',
			'https://stripe.com.evil.example/pay',
			'https://evilstripe.com/pay',
			'https://example.com/?u=checkout.stripe.com',
			'javascript:alert(1)',
			'not a url',
		]) {
			expect(() => assertStripeHostedUrl(bad)).toThrow();
		}
	});

	it('startCheckout sends the browser to the returned Stripe page', async () => {
		mocks.createCheckoutSession.mockResolvedValueOnce({
			url: 'https://checkout.stripe.com/c/pay/cs_9',
		});
		const navigate = vi.fn();
		await startCheckout('lantern', 'year', navigate);
		expect(mocks.createCheckoutSession).toHaveBeenCalledWith('lantern', 'year');
		expect(navigate).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_9');
	});

	it('startCheckout refuses to navigate to a non-Stripe page', async () => {
		mocks.createCheckoutSession.mockResolvedValueOnce({ url: 'https://phish.example/pay' });
		const navigate = vi.fn();
		await expect(startCheckout('beacon', 'month', navigate)).rejects.toThrow(/not a Stripe page/);
		expect(navigate).not.toHaveBeenCalled();
	});

	it('openBillingPortal sends the browser to the portal session', async () => {
		mocks.createPortalSession.mockResolvedValueOnce({
			url: 'https://billing.stripe.com/p/session/s',
		});
		const navigate = vi.fn();
		await openBillingPortal(navigate);
		expect(navigate).toHaveBeenCalledWith('https://billing.stripe.com/p/session/s');
	});
});

describe('checkout return marker', () => {
	it('reads and strips the marker without disturbing other params', () => {
		expect(readCheckoutReturn('?checkout=success')).toBe('success');
		expect(readCheckoutReturn('?a=1&checkout=cancelled')).toBe('cancelled');
		expect(readCheckoutReturn('?checkout=other')).toBeNull();
		expect(readCheckoutReturn('')).toBeNull();
		expect(stripCheckoutReturn('?checkout=success')).toBe('');
		expect(stripCheckoutReturn('?a=1&checkout=success&b=2')).toBe('?a=1&b=2');
	});
});

describe('subscription phase', () => {
	it('summarises the lifecycle for the Settings surface', () => {
		expect(subscriptionPhase(null)).toBe('none');
		expect(subscriptionPhase(status())).toBe('none');
		expect(subscriptionPhase(status({ status: 'active', active: true }))).toBe('renewing');
		expect(
			subscriptionPhase(status({ status: 'active', active: true, cancelAtPeriodEnd: true })),
		).toBe('ending');
		expect(subscriptionPhase(status({ status: 'past_due', active: true }))).toBe('past-due');
		expect(subscriptionPhase(status({ status: 'canceled', active: false }))).toBe('ended');
	});
});
