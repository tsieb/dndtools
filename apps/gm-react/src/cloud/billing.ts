// ADR-027 — the client side of Stripe billing. Deliberately thin: the app never sees a card, a
// price id, or a subscription object. It asks the account backend for a one-shot URL to a
// Stripe-HOSTED page (Checkout or the customer portal), sends the browser there, and — on the
// way back — refreshes entitlements until the server's webhook has written the new plan.
//
// WEB ONLY. Checkout and the portal are offered on the plain web build alone (`runtimeKind ===
// 'web'`). Android is informs-only per Google Play policy (a web purchase lights up on the device
// through the shared account; the app never steers to an external purchase), and the desktop
// build follows the same rule so there is exactly one place money is handled.
import { platformCapabilities } from '../platform/capabilities';
import { cloudConfig } from './config';
import {
	createCheckoutSession,
	createPortalSession,
	type BillingInterval,
	type BillingStatus,
	type PaidPlanId,
} from './appApi';

/** The minimum an entitlement value must expose for these helpers. */
export interface BillingView {
	serverBacked: boolean;
	loading: boolean;
	billing: BillingStatus | null;
}

/** True on the surface allowed to start money flows (the web build). */
export function isBillingSurface(): boolean {
	return platformCapabilities.runtimeKind === 'web';
}

/** The stage has billing configured for this signed-in account (any surface). */
export function billingConfigured(view: BillingView): boolean {
	return view.serverBacked && !view.loading && view.billing !== null;
}

/** Hosted Checkout may be started right now, from here. */
export function canStartCheckout(view: BillingView): boolean {
	return billingConfigured(view) && view.billing!.checkoutAvailable && isBillingSurface();
}

/** The hosted portal may be opened right now, from here. */
export function canOpenPortal(view: BillingView): boolean {
	return billingConfigured(view) && view.billing!.portalAvailable && isBillingSurface();
}

/** Billing exists for this account but this surface must only INFORM (mobile/desktop). */
export function billingInformsOnly(view: BillingView): boolean {
	return billingConfigured(view) && view.billing!.checkoutAvailable && !isBillingSurface();
}

/** Where a non-web surface tells the user to subscribe (hostname only; never a link). */
export function billingWebHost(): string {
	try {
		return new URL(cloudConfig.publicAppUrl).host || 'lamplight.click';
	} catch {
		return 'lamplight.click';
	}
}

const STRIPE_HOST_RE = /(^|\.)stripe\.com$/i;

/**
 * The only navigation this module performs: to an HTTPS page on a stripe.com host. Anything
 * else the backend might hand back (a bug, a compromised response) is refused rather than
 * followed — the user must never be redirected off to an unexpected origin by a billing button.
 */
export function assertStripeHostedUrl(url: string): URL {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new Error('The billing page address was invalid.');
	}
	if (parsed.protocol !== 'https:' || !STRIPE_HOST_RE.test(parsed.hostname))
		throw new Error('The billing page address was not a Stripe page.');
	return parsed;
}

export type Navigate = (url: string) => void;
const defaultNavigate: Navigate = (url) => window.location.assign(url);

/** Start hosted Checkout for a paid plan. Resolves once the browser has been sent to Stripe. */
export async function startCheckout(
	plan: PaidPlanId,
	interval: BillingInterval,
	navigate: Navigate = defaultNavigate,
): Promise<void> {
	const { url } = await createCheckoutSession(plan, interval);
	navigate(assertStripeHostedUrl(url).toString());
}

/** Open the hosted customer portal (cancel, change plan, update card, invoices). */
export async function openBillingPortal(navigate: Navigate = defaultNavigate): Promise<void> {
	const { url } = await createPortalSession();
	navigate(assertStripeHostedUrl(url).toString());
}

export type CheckoutReturn = 'success' | 'cancelled' | null;

/** Which Checkout outcome (if any) a route's search string announces (`?checkout=…`). */
export function readCheckoutReturn(search: string): CheckoutReturn {
	const value = new URLSearchParams(search).get('checkout');
	return value === 'success' || value === 'cancelled' ? value : null;
}

/** The same search string with the Checkout marker removed ('' when nothing is left). */
export function stripCheckoutReturn(search: string): string {
	const params = new URLSearchParams(search);
	params.delete('checkout');
	const rest = params.toString();
	return rest ? `?${rest}` : '';
}

/** How the Settings/Upgrade surfaces summarise a subscription's lifecycle. */
export type SubscriptionPhase = 'none' | 'renewing' | 'ending' | 'past-due' | 'ended';

export function subscriptionPhase(billing: BillingStatus | null): SubscriptionPhase {
	if (!billing || !billing.status) return 'none';
	if (billing.active) {
		if (billing.status === 'past_due') return 'past-due';
		return billing.cancelAtPeriodEnd ? 'ending' : 'renewing';
	}
	return 'ended';
}
