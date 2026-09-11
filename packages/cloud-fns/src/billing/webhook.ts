// ADR-027 — STRIPE WEBHOOK. The only writer of PAID entitlement rows. Its own Lambda, with its own
// role, because it is the one unauthenticated WRITE surface in the app-api stack: it holds
// DynamoDB access to the app table and read access to the billing SSM parameters, and nothing
// else — no Cognito, no S3, no SES.
//
// Trust posture:
//   • Every request must carry a valid `Stripe-Signature` over the RAW body for THIS endpoint's
//     signing secret (constructEvent also enforces the 5-minute tolerance window). Anything else
//     is a 400 and touches nothing.
//   • The event's `livemode` must match the stage's key mode — a test-mode event can never move a
//     production plan even if a test signing secret leaked into prod.
//   • Event payloads are treated as a NOTIFICATION, not as truth. The subscription is re-read from
//     Stripe with the secret key before anything is written, which makes replayed, reordered and
//     duplicated deliveries all converge on the same current state (see billing/entitlements.ts).
//   • A subscription we cannot link to an account is a 500 on purpose: Stripe retries for up to
//     three days and the stage's Lambda-errors alarm tells the operator that money is moving
//     without an entitlement. Acknowledging it would hide exactly the failure that matters.
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type Stripe from 'stripe';
import { getBillingRuntime, type BillingRuntime } from './runtime.ts';
import {
	applyEntitlement,
	deriveEntitlement,
	markEventProcessed,
	resolveAccountForSubscription,
	wasEventProcessed,
} from './entitlements.ts';

const APP_TABLE = process.env.APP_TABLE!;
/** Stripe events are a few KB; anything much larger is not from Stripe. */
const MAX_BODY_BYTES = 256 * 1024;

const HANDLED_EVENTS: ReadonlySet<string> = new Set([
	'checkout.session.completed',
	'customer.subscription.created',
	'customer.subscription.updated',
	'customer.subscription.deleted',
]);

function json(statusCode: number, body: unknown) {
	return {
		statusCode,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	};
}

function rawBody(event: Parameters<APIGatewayProxyHandlerV2>[0]): string {
	const body = event.body ?? '';
	return event.isBase64Encoded ? Buffer.from(body, 'base64').toString('utf8') : body;
}

function isStripeMissing(err: unknown): boolean {
	return (err as { code?: string; statusCode?: number })?.code === 'resource_missing';
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
	const runtime = await getBillingRuntime();
	if (!runtime) return json(503, { error: 'billing is not configured' });

	const payload = rawBody(event);
	if (!payload || Buffer.byteLength(payload, 'utf8') > MAX_BODY_BYTES)
		return json(400, { error: 'invalid body' });
	const signature = event.headers?.['stripe-signature'];
	if (!signature) return json(400, { error: 'missing signature' });

	let stripeEvent: Stripe.Event;
	try {
		stripeEvent = runtime.stripe.webhooks.constructEvent(payload, signature, runtime.webhookSecret);
	} catch {
		// Deliberately terse: a prober learns nothing about which check failed.
		return json(400, { error: 'invalid signature' });
	}
	if (stripeEvent.livemode !== runtime.settings.livemode) {
		console.error('stripe event mode mismatch; refused', {
			id: stripeEvent.id,
			livemode: stripeEvent.livemode,
		});
		return json(400, { error: 'event mode mismatch' });
	}

	if (!HANDLED_EVENTS.has(stripeEvent.type)) return json(200, { received: true, ignored: true });
	if (await wasEventProcessed(APP_TABLE, stripeEvent.id))
		return json(200, { received: true, duplicate: true });

	try {
		const outcome = await processEvent(runtime, stripeEvent);
		await markEventProcessed(APP_TABLE, stripeEvent.id);
		console.log('stripe event applied', { id: stripeEvent.id, type: stripeEvent.type, outcome });
		return json(200, { received: true, outcome });
	} catch (err) {
		// Internal detail never reaches the caller (Stripe's dashboard shows response bodies to
		// anyone with dashboard access; keep it to a status). The log carries the context.
		console.error('stripe event failed', { id: stripeEvent.id, type: stripeEvent.type, err });
		return json(500, { error: 'processing failed' });
	}
};

type Outcome =
	| Awaited<ReturnType<typeof applyEntitlement>>
	| 'no-subscription'
	| 'subscription-gone';

async function processEvent(runtime: BillingRuntime, stripeEvent: Stripe.Event): Promise<Outcome> {
	let subscriptionId: string;
	let accountHint = '';
	if (stripeEvent.type === 'checkout.session.completed') {
		const session = stripeEvent.data.object as Stripe.Checkout.Session;
		if (session.mode !== 'subscription') return 'no-subscription';
		subscriptionId =
			typeof session.subscription === 'string'
				? session.subscription
				: (session.subscription?.id ?? '');
		// The session was created by OUR checkout route, which stamps the Cognito sub in both
		// places; the subscription's own metadata (set via subscription_data) wins below.
		accountHint = session.client_reference_id ?? session.metadata?.cognito_sub ?? '';
		if (!subscriptionId) return 'no-subscription'; // delayed payment: the subscription event follows
	} else {
		subscriptionId = (stripeEvent.data.object as Stripe.Subscription).id;
	}

	// Re-read the CURRENT subscription; the event payload is only the trigger.
	const fetchedAt = Date.now();
	let subscription: Stripe.Subscription;
	try {
		subscription = await runtime.stripe.subscriptions.retrieve(subscriptionId);
	} catch (err) {
		if (isStripeMissing(err)) {
			// Only test-mode data deletion produces this; nothing to apply, nothing to retry.
			console.error('stripe subscription no longer exists', { subscriptionId });
			return 'subscription-gone';
		}
		throw err;
	}
	const sub = await resolveAccountForSubscription(APP_TABLE, subscription, accountHint);
	if (!sub) throw new Error(`subscription ${subscription.id} is not linked to any account`);
	const derived = deriveEntitlement(subscription, runtime);
	return applyEntitlement(APP_TABLE, sub, derived, fetchedAt, stripeEvent.id);
}
