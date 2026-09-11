// ADR-027 — the authoritative PAID entitlement write path. A Stripe subscription (always re-read
// from Stripe, never trusted from an event payload) is turned into the account's entitlement row
// in the app-api table. This module owns the row's billing fields and the two rules that keep the
// write path safe under Stripe's at-least-once, out-of-order delivery:
//
//   1. FRESH STATE ONLY. Callers pass the subscription as it is NOW (re-fetched), stamped with the
//      time it was fetched. The row remembers `billingSyncedAt`; an older fetch can never overwrite
//      a newer one, whatever order the events arrive in.
//   2. AN ENDED SUBSCRIPTION ONLY DOWNGRADES ITSELF. If the row is bound to subscription B and a
//      terminal event for an older subscription A arrives, A is ignored — otherwise "cancel old,
//      start new" would race the account back to the free tier.
//
// The account-deletion tombstone (`deletedAt`) is honoured on every write: nothing here can
// resurrect a deleted account, and the DELETE /account flow deletes the Stripe customer (which
// cancels its subscriptions) before it removes rows.
import type Stripe from 'stripe';
import { getItem, putItemConditional } from '../lib/aws.ts';
import type { BillingInterval, BillingRuntime, PaidPlan } from './runtime.ts';

export type PlanId = 'hearth' | PaidPlan;

/** Statuses that keep paid features switched on. `past_due` stays on while Stripe's smart
 *  retries run — the subscription becomes `canceled`/`unpaid` (both off) when they are exhausted. */
export const GRANTING_STATUSES: ReadonlySet<string> = new Set(['active', 'trialing', 'past_due']);

/** What the entitlement row records about the Stripe side. Flat so it marshals with toItem(). */
export interface BillingRowFields {
	billingProvider: 'stripe';
	stripeCustomerId: string;
	stripeSubscriptionId: string;
	stripeSubscriptionStatus: string;
	stripePriceId: string;
	billingInterval: BillingInterval | '';
	/** Epoch seconds; 0 when unknown. */
	currentPeriodEnd: number;
	cancelAtPeriodEnd: 'true' | 'false';
	/** Epoch ms of the Stripe read this row reflects — the stale-write guard. */
	billingSyncedAt: number;
	lastStripeEventId: string;
}

export interface DerivedEntitlement {
	plan: PlanId;
	granting: boolean;
	fields: Omit<BillingRowFields, 'billingSyncedAt' | 'lastStripeEventId'>;
}

const idOf = (ref: string | { id: string } | null | undefined): string =>
	typeof ref === 'string' ? ref : (ref?.id ?? '');

/**
 * Pure: a subscription → the plan it grants (or the free tier) plus the fields to record.
 * A GRANTING subscription on a price this stage does not know is a configuration error and
 * throws — the operator changed prices without updating `…/billing/config` — so the caller can
 * fail the webhook (Stripe retries; the error alarm fires) instead of silently under-granting.
 */
export function deriveEntitlement(
	subscription: Stripe.Subscription,
	runtime: Pick<BillingRuntime, 'priceIndex'>,
): DerivedEntitlement {
	const item = subscription.items?.data?.[0];
	const priceId = item ? idOf(item.price as unknown as string | { id: string }) : '';
	const status = subscription.status;
	const granting = GRANTING_STATUSES.has(status);
	const mapped = priceId ? runtime.priceIndex.get(priceId) : undefined;
	if (granting && !mapped) {
		throw new Error(`subscription ${subscription.id} is ${status} on unmapped price "${priceId}"`);
	}
	// 2025-03-31.basil moved current_period_end onto the subscription item; older API versions
	// (and older test fixtures) still carry it on the subscription. Read either.
	const periodEnd =
		(item as { current_period_end?: number } | undefined)?.current_period_end ??
		(subscription as unknown as { current_period_end?: number }).current_period_end ??
		0;
	return {
		plan: granting && mapped ? mapped.plan : 'hearth',
		granting,
		fields: {
			billingProvider: 'stripe',
			stripeCustomerId: idOf(subscription.customer as string | { id: string }),
			stripeSubscriptionId: subscription.id,
			stripeSubscriptionStatus: status,
			stripePriceId: priceId,
			billingInterval: mapped?.interval ?? '',
			currentPeriodEnd: Number.isFinite(periodEnd) ? Math.floor(periodEnd) : 0,
			cancelAtPeriodEnd: subscription.cancel_at_period_end ? 'true' : 'false',
		},
	};
}

// --- row layout (shares the app-api single table; see infra/app-api/template.yaml) ---------------
export const accountPk = (sub: string) => `account#${sub}`;
export const SK_ENTITLEMENT = 'entitlement';
/** Reverse lookup: which account owns a Stripe customer. Written at checkout time. */
export const stripeCustomerPk = (customerId: string) => `stripe-customer#${customerId}`;
export const SK_STRIPE_ACCOUNT = 'account';
/** Processed-event marker for replay protection; TTL keeps the table from growing forever. */
export const stripeEventPk = (eventId: string) => `stripe-event#${eventId}`;
export const SK_STRIPE_PROCESSED = 'processed';
const EVENT_MARKER_TTL_SECONDS = 30 * 24 * 60 * 60;

export type ApplyOutcome = 'written' | 'stale' | 'ignored-other-subscription' | 'account-deleted';

/**
 * Write a freshly derived entitlement for `sub`, honouring the two ordering rules above and the
 * deletion tombstone. `fetchedAt` is the epoch-ms moment the subscription was read from Stripe.
 */
export async function applyEntitlement(
	table: string,
	sub: string,
	derived: DerivedEntitlement,
	fetchedAt: number,
	eventId: string,
	nowIso: string = new Date().toISOString(),
): Promise<ApplyOutcome> {
	const key = { pk: accountPk(sub), sk: SK_ENTITLEMENT };
	const existing = await getItem(table, key, true);
	if (existing?.deletedAt) return 'account-deleted';
	if (
		!derived.granting &&
		existing?.stripeSubscriptionId &&
		existing.stripeSubscriptionId !== derived.fields.stripeSubscriptionId
	) {
		// Rule 2: an ended subscription that is not the one the account is bound to.
		return 'ignored-other-subscription';
	}
	const row: Record<string, string | number | undefined> = {
		...key,
		plan: derived.plan,
		updatedAt: nowIso,
		...derived.fields,
		// Keep the customer binding even when a subscription ends, so the portal (invoice
		// history, resubscribe) keeps working for the account.
		stripeCustomerId: derived.fields.stripeCustomerId || existing?.stripeCustomerId || '',
		billingSyncedAt: fetchedAt,
		lastStripeEventId: eventId,
	};
	const written = await putItemConditional(table, row, {
		// Rule 1 (stale guard) + the tombstone. `<=` rather than `<` so a retry of the SAME fetch
		// (Stripe redelivering an event we already applied) is a harmless idempotent rewrite.
		expression:
			'attribute_not_exists(#deletedAt) AND (attribute_not_exists(#syncedAt) OR #syncedAt <= :fetchedAt)',
		names: { '#deletedAt': 'deletedAt', '#syncedAt': 'billingSyncedAt' },
		values: { ':fetchedAt': fetchedAt },
	});
	if (written) return 'written';
	const after = await getItem(table, key, true);
	return after?.deletedAt ? 'account-deleted' : 'stale';
}

/** Which account a Stripe customer belongs to (from the reverse row), or ''. */
export async function accountForStripeCustomer(table: string, customerId: string): Promise<string> {
	if (!customerId) return '';
	const row = await getItem(
		table,
		{ pk: stripeCustomerPk(customerId), sk: SK_STRIPE_ACCOUNT },
		true,
	);
	return row?.sub ?? '';
}

/** Record the customer ↔ account binding (idempotent; the row is tiny and never expires). */
export async function bindStripeCustomer(
	table: string,
	customerId: string,
	sub: string,
	nowIso: string = new Date().toISOString(),
): Promise<void> {
	await putItemConditional(
		table,
		{ pk: stripeCustomerPk(customerId), sk: SK_STRIPE_ACCOUNT, sub, createdAt: nowIso },
		{
			// Never let a second account claim an existing customer.
			expression: 'attribute_not_exists(#pk) OR #sub = :sub',
			names: { '#pk': 'pk', '#sub': 'sub' },
			values: { ':sub': sub },
		},
	);
}

/** Mark an event processed. Returns false if it had already been marked (replay). */
export async function markEventProcessed(
	table: string,
	eventId: string,
	nowSec: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
	return putItemConditional(
		table,
		{
			pk: stripeEventPk(eventId),
			sk: SK_STRIPE_PROCESSED,
			processedAt: nowSec,
			expiresAt: nowSec + EVENT_MARKER_TTL_SECONDS,
		},
		{ expression: 'attribute_not_exists(#pk)', names: { '#pk': 'pk' } },
	);
}

/** True when an event was already fully processed (replay / duplicate delivery). */
export async function wasEventProcessed(table: string, eventId: string): Promise<boolean> {
	const row = await getItem(table, { pk: stripeEventPk(eventId), sk: SK_STRIPE_PROCESSED });
	return Boolean(row);
}

/** The Cognito sub a subscription belongs to: its metadata first, then the customer binding. */
export async function resolveAccountForSubscription(
	table: string,
	subscription: Stripe.Subscription,
	hint?: string,
): Promise<string> {
	const fromMetadata = subscription.metadata?.cognito_sub;
	if (typeof fromMetadata === 'string' && fromMetadata) return fromMetadata;
	if (hint) return hint;
	return accountForStripeCustomer(table, idOf(subscription.customer as string | { id: string }));
}
