// Decisive verification of Stripe billing (ADR-027) against the DEPLOYED dev app-api in Stripe
// TEST mode. Driven by infra/verify-billing.sh, which mints the Cognito user and passes:
//   APP_API_URL, TOKEN, TEST_EMAIL, ACCOUNT_ID, STRIPE_SECRET_KEY (test), BILLING_CONFIG (JSON)
//
// Proves end-to-end:
//   1. entitlements report billing configured + Checkout available, no subscription yet
//   2. POST /billing/checkout-session returns a checkout.stripe.com URL and binds a customer
//   3. POST /billing/portal-session returns a billing.stripe.com URL for that customer
//   4. the webhook refuses an unsigned and a mis-signed body (400) — nothing else reachable
//   5. a REAL test-mode subscription (pm_card_visa) → Stripe's webhook → plan becomes lantern
//   6. cancelling it → webhook → plan returns to hearth, customer binding kept
//   7. DELETE /account → the Stripe customer is deleted (subscriptions cancelled with it)
import Stripe from 'stripe';

const need = (k) => {
	const v = process.env[k];
	if (!v) {
		console.error(`${k} is required`);
		process.exit(2);
	}
	return v;
};
const APP_API_URL = need('APP_API_URL').replace(/\/$/, '');
const TOKEN = need('TOKEN');
const TEST_EMAIL = need('TEST_EMAIL');
const ACCOUNT_ID = need('ACCOUNT_ID');
const CONFIG = JSON.parse(need('BILLING_CONFIG'));
const stripe = new Stripe(need('STRIPE_SECRET_KEY'), { maxNetworkRetries: 2 });

let passed = 0;
let failed = 0;
const ok = (n) => {
	console.log(`  ✓ ${n}`);
	passed++;
};
const bad = (n, d) => {
	console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`);
	failed++;
};
const check = (cond, n, d) => (cond ? ok(n) : bad(n, d));
const authed = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };
const req = (path, opts = {}) =>
	fetch(`${APP_API_URL}${path}`, { ...opts, headers: { ...authed, ...(opts.headers ?? {}) } });
const entitlements = async () => (await req('/account/entitlements')).json();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(label, predicate, timeoutMs = 90_000) {
	const start = Date.now();
	let last;
	while (Date.now() - start < timeoutMs) {
		last = await entitlements();
		if (predicate(last)) return last;
		await sleep(2500);
	}
	bad(label, `timed out after ${timeoutMs / 1000}s; last=${JSON.stringify(last)}`);
	return null;
}

let customerId = '';
let subscriptionId = '';
try {
	// --- 1. configured, no subscription ---------------------------------------------------------
	{
		const e = await entitlements();
		check(
			e.billing && e.billing.provider === 'stripe',
			'billing is configured on this stage',
			JSON.stringify(e.billing),
		);
		check(e.billing?.checkoutAvailable === true, 'hosted Checkout is available');
		check(e.billing?.livemode === false, 'stage is in Stripe TEST mode');
		check(
			e.plan === 'hearth' && e.billing?.status === null,
			'fresh account: free plan, no subscription',
		);
	}

	// --- 2. checkout session --------------------------------------------------------------------
	{
		const r = await req('/billing/checkout-session', {
			method: 'POST',
			body: JSON.stringify({ plan: 'lantern', interval: 'month' }),
		});
		const body = await r.json();
		check(
			r.status === 200,
			'checkout session created (200)',
			`status ${r.status} ${JSON.stringify(body)}`,
		);
		let host = '';
		try {
			host = new URL(body.url ?? '').hostname;
		} catch {
			/* reported below */
		}
		check(host === 'checkout.stripe.com', 'checkout URL is on checkout.stripe.com', body.url);
		const e = await entitlements();
		check(e.billing?.portalAvailable === true, 'a Stripe customer is now bound to the account');
		check(e.plan === 'hearth', 'starting checkout did NOT grant a plan (only the webhook may)');
		const bad400 = await req('/billing/checkout-session', {
			method: 'POST',
			body: JSON.stringify({ plan: 'hearth', interval: 'month' }),
		});
		check(
			bad400.status === 400,
			'free plan is refused by checkout (400)',
			`status ${bad400.status}`,
		);
	}

	// --- 3. portal session ----------------------------------------------------------------------
	{
		const r = await req('/billing/portal-session', { method: 'POST', body: '{}' });
		const body = await r.json();
		check(
			r.status === 200,
			'portal session created (200)',
			`status ${r.status} ${JSON.stringify(body)}`,
		);
		let host = '';
		try {
			host = new URL(body.url ?? '').hostname;
		} catch {
			/* reported below */
		}
		check(host === 'billing.stripe.com', 'portal URL is on billing.stripe.com', body.url);
	}

	// --- 4. webhook signature gate --------------------------------------------------------------
	{
		const unsigned = await fetch(`${APP_API_URL}/billing/webhook`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				id: 'evt_forged',
				type: 'customer.subscription.created',
				data: { object: {} },
			}),
		});
		check(
			unsigned.status === 400,
			'unsigned webhook is rejected (400)',
			`status ${unsigned.status}`,
		);
		const forged = await fetch(`${APP_API_URL}/billing/webhook`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=deadbeef' },
			body: JSON.stringify({
				id: 'evt_forged',
				type: 'customer.subscription.created',
				data: { object: {} },
			}),
		});
		check(forged.status === 400, 'mis-signed webhook is rejected (400)', `status ${forged.status}`);
		const e = await entitlements();
		check(e.plan === 'hearth', 'forged webhooks changed nothing');
	}

	// --- 5. a real test-mode subscription → webhook → lantern -------------------------------------
	{
		const customers = await stripe.customers.list({ email: TEST_EMAIL, limit: 5 });
		const customer = customers.data.find((c) => c.metadata?.cognito_sub === ACCOUNT_ID);
		check(
			Boolean(customer),
			'the bound customer carries the account id in metadata',
			JSON.stringify(customers.data.map((c) => c.id)),
		);
		if (customer) {
			customerId = customer.id;
			// Attaching the test token mints a real pm_… id; the default must name THAT id.
			const pm = await stripe.paymentMethods.attach('pm_card_visa', { customer: customerId });
			await stripe.customers.update(customerId, {
				invoice_settings: { default_payment_method: pm.id },
			});
			const sub = await stripe.subscriptions.create({
				customer: customerId,
				default_payment_method: pm.id,
				items: [{ price: CONFIG.prices.lantern.month }],
				metadata: { cognito_sub: ACCOUNT_ID, plan: 'lantern', verify: 'infra/verify-billing' },
			});
			subscriptionId = sub.id;
			check(sub.status === 'active', 'test subscription is active in Stripe', sub.status);
			const e = await waitFor('webhook granted the plan', (x) => x.plan === 'lantern');
			if (e) {
				ok('webhook granted the plan: lantern');
				check(
					e.billing?.active === true && e.billing?.status === 'active',
					'billing status reflects the active subscription',
					JSON.stringify(e.billing),
				);
				check(
					e.billing?.interval === 'month' && e.billing?.currentPeriodEnd > 0,
					'interval and period end are reported',
				);
			}
			const dup = await req('/billing/checkout-session', {
				method: 'POST',
				body: JSON.stringify({ plan: 'beacon', interval: 'month' }),
			});
			check(
				dup.status === 409,
				'a second checkout is refused while subscribed (409)',
				`status ${dup.status}`,
			);
		}
	}

	// --- 6. cancel → webhook → hearth -------------------------------------------------------------
	if (subscriptionId) {
		await stripe.subscriptions.cancel(subscriptionId);
		const e = await waitFor(
			'webhook revoked the plan',
			(x) => x.plan === 'hearth' && x.billing?.status === 'canceled',
		);
		if (e) {
			ok('webhook revoked the plan: hearth, status canceled');
			check(
				e.billing?.portalAvailable === true,
				'customer binding survives cancellation (portal still works)',
			);
		}
	}

	// --- 7. account deletion deletes the Stripe customer -----------------------------------------
	if (customerId) {
		const r = await req('/account', { method: 'DELETE' });
		check(r.status === 200, 'account deleted (200)', `status ${r.status} ${await r.text()}`);
		const c = await stripe.customers.retrieve(customerId);
		check(c.deleted === true, 'Stripe customer deleted with the account');
		if (c.deleted) customerId = '';
	}
} finally {
	// Best-effort Stripe cleanup if a step failed part-way.
	if (subscriptionId) await stripe.subscriptions.cancel(subscriptionId).catch(() => {});
	if (customerId) await stripe.customers.del(customerId).catch(() => {});
}

console.log('');
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
