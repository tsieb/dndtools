import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import Stripe from 'stripe';

// ADR-027 contract tests for the Stripe billing module: configuration validation (fail closed on
// anything half-right), plan derivation from a subscription, the two ordering rules that make the
// webhook safe under at-least-once/out-of-order delivery, and the webhook Lambda itself driven
// with REAL Stripe signatures (the SDK's test-header generator) over an in-memory table.
vi.hoisted(() => {
	process.env.APP_TABLE = 'app';
	process.env.AWS_REGION = 'ca-central-1';
	process.env.BILLING_SSM_PREFIX = '/dndtools/test/billing';
});

// In-memory DynamoDB with just enough condition-expression semantics for this module's writes.
const store = vi.hoisted(() => {
	const items = new Map<string, Record<string, string | number>>();
	const key = (k: Record<string, unknown>) => `${String(k.pk)}|${String(k.sk)}`;
	return { items, key };
});

vi.mock('../lib/aws.ts', () => {
	const evalCondition = (
		expression: string,
		existing: Record<string, string | number> | undefined,
		names: Record<string, string> = {},
		values: Record<string, string | number> = {},
		incoming: Record<string, string | number | undefined>,
	): boolean => {
		const attr = (alias: string) => names[alias] ?? alias.replace(/^#/, '');
		// Each clause we use is evaluated literally; AND/OR are the only combinators used.
		const clause = (c: string): boolean => {
			c = c
				.trim()
				.replace(/^\((.*)\)$/, '$1')
				.trim();
			let m = /^attribute_not_exists\((#?\w+)\)$/.exec(c);
			if (m) return existing?.[attr(m[1])] === undefined;
			m = /^(#?\w+)\s*<=\s*(:\w+)$/.exec(c);
			if (m) return Number(existing?.[attr(m[1])]) <= Number(values[m[2]]);
			m = /^(#?\w+)\s*=\s*(:\w+)$/.exec(c);
			if (m) return existing?.[attr(m[1])] === values[m[2]];
			throw new Error(`fake cannot evaluate clause: ${c} (${JSON.stringify(incoming)})`);
		};
		const orGroup = (g: string) => g.split(' OR ').some(clause);
		// Split on top-level AND (the module never nests AND inside OR).
		return expression
			.split(/ AND (?![^(]*\))/)
			.every((part) => orGroup(part.replace(/^\((.*)\)$/, '$1')));
	};
	return {
		getItem: async (_t: string, k: Record<string, string>) => {
			const row = store.items.get(store.key(k));
			return row
				? Object.fromEntries(Object.entries(row).map(([a, b]) => [a, String(b)]))
				: undefined;
		},
		deleteItem: async (_t: string, k: Record<string, string>) => {
			store.items.delete(store.key(k));
		},
		putItemConditional: async (
			_t: string,
			obj: Record<string, string | number | undefined>,
			condition: {
				expression: string;
				names?: Record<string, string>;
				values?: Record<string, string | number>;
			},
		) => {
			const k = store.key(obj);
			const existing = store.items.get(k);
			if (!evalCondition(condition.expression, existing, condition.names, condition.values, obj))
				return false;
			const row: Record<string, string | number> = {};
			for (const [a, b] of Object.entries(obj)) if (b !== undefined) row[a] = b;
			store.items.set(k, row);
			return true;
		},
	};
});

const runtimeMod = await import('./runtime.ts');
const { assembleBillingRuntime, parseBillingSettings, resetBillingRuntimeCache } = runtimeMod;
const ent = await import('./entitlements.ts');
const { handler: webhook } = await import('./webhook.ts');

const SECRET_KEY = 'sk_test_' + 'a'.repeat(24);
const WEBHOOK_SECRET = 'whsec_' + 'b'.repeat(32);
const PRICES = {
	lantern: { month: 'price_lanternMonth1', year: 'price_lanternYear01' },
	beacon: { month: 'price_beaconMonth01', year: 'price_beaconYear001' },
};
const CONFIG = JSON.stringify({ version: 1, livemode: false, prices: PRICES });

// A fake Stripe API surface. Signature verification uses the REAL SDK (no network involved).
const stripeFake = vi.hoisted(() => ({
	subscriptions: new Map<string, unknown>(),
	retrieveCalls: [] as string[],
}));
function fakeStripe(): Stripe {
	const real = new Stripe(SECRET_KEY);
	return {
		webhooks: real.webhooks,
		subscriptions: {
			retrieve: async (id: string) => {
				stripeFake.retrieveCalls.push(id);
				const sub = stripeFake.subscriptions.get(id);
				if (!sub)
					throw Object.assign(new Error('No such subscription'), { code: 'resource_missing' });
				return sub;
			},
		},
	} as unknown as Stripe;
}

function subscription(over: Partial<Record<string, unknown>> = {}): Stripe.Subscription {
	return {
		id: 'sub_1',
		object: 'subscription',
		customer: 'cus_1',
		status: 'active',
		cancel_at_period_end: false,
		metadata: { cognito_sub: 'user-1' },
		items: {
			object: 'list',
			data: [
				{ id: 'si_1', price: { id: PRICES.lantern.month }, current_period_end: 1_800_000_000 },
			],
		},
		...over,
	} as unknown as Stripe.Subscription;
}

function signedEvent(
	type: string,
	object: object,
	opts: { id?: string; livemode?: boolean; secret?: string } = {},
): APIGatewayProxyEventV2 {
	const payload = JSON.stringify({
		id: opts.id ?? `evt_${Math.random().toString(36).slice(2)}`,
		object: 'event',
		type,
		livemode: opts.livemode ?? false,
		created: Math.floor(Date.now() / 1000),
		data: { object },
	});
	const header = new Stripe(SECRET_KEY).webhooks.generateTestHeaderString({
		payload,
		secret: opts.secret ?? WEBHOOK_SECRET,
	});
	return {
		routeKey: 'POST /billing/webhook',
		rawPath: '/billing/webhook',
		headers: { 'stripe-signature': header },
		body: payload,
		isBase64Encoded: false,
		requestContext: { http: { method: 'POST' } },
	} as unknown as APIGatewayProxyEventV2;
}

const call = async (e: APIGatewayProxyEventV2) => {
	const res = (await webhook(e, {} as never, () => {})) as { statusCode: number; body: string };
	return { status: res.statusCode, body: JSON.parse(res.body) };
};

const row = () => store.items.get('account#user-1|entitlement');

beforeEach(() => {
	store.items.clear();
	stripeFake.subscriptions.clear();
	stripeFake.retrieveCalls.length = 0;
	resetBillingRuntimeCache(
		assembleBillingRuntime({
			secretKey: SECRET_KEY,
			webhookSecret: WEBHOOK_SECRET,
			config: CONFIG,
			stripeFactory: fakeStripe,
		}),
	);
});

describe('billing configuration (fail closed)', () => {
	it('parses a complete config and indexes every price', () => {
		const settings = parseBillingSettings(CONFIG);
		expect(settings.prices.beacon.year).toBe(PRICES.beacon.year);
		const index = runtimeMod.buildPriceIndex(settings);
		expect(index.get(PRICES.lantern.year)).toEqual({ plan: 'lantern', interval: 'year' });
		expect(index.size).toBe(4);
	});

	it.each([
		['not JSON', 'nope'],
		['wrong version', JSON.stringify({ version: 2, livemode: false, prices: PRICES })],
		[
			'missing plan',
			JSON.stringify({ version: 1, livemode: false, prices: { lantern: PRICES.lantern } }),
		],
		[
			'bad price id',
			JSON.stringify({
				version: 1,
				livemode: false,
				prices: { ...PRICES, beacon: { month: 'prod_x', year: PRICES.beacon.year } },
			}),
		],
		[
			'duplicate price',
			JSON.stringify({
				version: 1,
				livemode: false,
				prices: { ...PRICES, beacon: { month: PRICES.lantern.month, year: PRICES.beacon.year } },
			}),
		],
		[
			'bad portal id',
			JSON.stringify({ version: 1, livemode: false, prices: PRICES, portalConfigurationId: 'x' }),
		],
	])('rejects a config that is %s', (_label, config) => {
		expect(() => parseBillingSettings(config)).toThrow();
	});

	it('refuses a key whose mode disagrees with the config', () => {
		expect(() =>
			assembleBillingRuntime({
				secretKey: 'sk_live_' + 'c'.repeat(24),
				webhookSecret: WEBHOOK_SECRET,
				config: CONFIG,
				stripeFactory: fakeStripe,
			}),
		).toThrow(/mode/);
	});

	it('refuses malformed secrets', () => {
		expect(() =>
			assembleBillingRuntime({ secretKey: 'hello', webhookSecret: WEBHOOK_SECRET, config: CONFIG }),
		).toThrow(/secret key/);
		expect(() =>
			assembleBillingRuntime({ secretKey: SECRET_KEY, webhookSecret: 'nope', config: CONFIG }),
		).toThrow(/webhook secret/);
	});
});

describe('deriveEntitlement', () => {
	const runtime = () => ({ priceIndex: runtimeMod.buildPriceIndex(parseBillingSettings(CONFIG)) });

	it('maps an active subscription to its plan and records the period', () => {
		const d = ent.deriveEntitlement(subscription(), runtime());
		expect(d.plan).toBe('lantern');
		expect(d.granting).toBe(true);
		expect(d.fields).toMatchObject({
			stripeCustomerId: 'cus_1',
			stripeSubscriptionId: 'sub_1',
			stripeSubscriptionStatus: 'active',
			billingInterval: 'month',
			currentPeriodEnd: 1_800_000_000,
			cancelAtPeriodEnd: 'false',
		});
	});

	it.each(['trialing', 'past_due'])('keeps paid features on while %s', (status) => {
		expect(ent.deriveEntitlement(subscription({ status }), runtime()).plan).toBe('lantern');
	});

	it.each(['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused'])(
		'drops to the free tier when %s',
		(status) => {
			const d = ent.deriveEntitlement(subscription({ status }), runtime());
			expect(d.plan).toBe('hearth');
			expect(d.granting).toBe(false);
		},
	);

	it('throws (so the webhook fails and alarms) for a GRANTING subscription on an unmapped price', () => {
		const sub = subscription({
			items: { object: 'list', data: [{ id: 'si', price: { id: 'price_unknownAAAAA' } }] },
		});
		expect(() => ent.deriveEntitlement(sub, runtime())).toThrow(/unmapped price/);
	});

	it('treats an ENDED subscription on an unmapped price as free rather than failing', () => {
		const sub = subscription({
			status: 'canceled',
			items: { object: 'list', data: [{ id: 'si', price: { id: 'price_unknownAAAAA' } }] },
		});
		expect(ent.deriveEntitlement(sub, runtime()).plan).toBe('hearth');
	});

	it('reads current_period_end from the subscription when the item lacks it (older API)', () => {
		const sub = subscription({
			current_period_end: 1_700_000_000,
			items: { object: 'list', data: [{ id: 'si', price: { id: PRICES.beacon.year } }] },
		});
		const d = ent.deriveEntitlement(sub, runtime());
		expect(d.plan).toBe('beacon');
		expect(d.fields.currentPeriodEnd).toBe(1_700_000_000);
		expect(d.fields.billingInterval).toBe('year');
	});
});

describe('applyEntitlement ordering rules', () => {
	const runtime = () => ({ priceIndex: runtimeMod.buildPriceIndex(parseBillingSettings(CONFIG)) });

	it('writes the plan and stamps the sync time', async () => {
		const out = await ent.applyEntitlement(
			'app',
			'user-1',
			ent.deriveEntitlement(subscription(), runtime()),
			1000,
			'evt_1',
		);
		expect(out).toBe('written');
		expect(row()).toMatchObject({
			plan: 'lantern',
			billingSyncedAt: 1000,
			lastStripeEventId: 'evt_1',
		});
	});

	it('rule 1: an older Stripe read never overwrites a newer one', async () => {
		await ent.applyEntitlement(
			'app',
			'user-1',
			ent.deriveEntitlement(subscription({ status: 'canceled' }), runtime()),
			2000,
			'evt_new',
		);
		const out = await ent.applyEntitlement(
			'app',
			'user-1',
			ent.deriveEntitlement(subscription(), runtime()),
			1000,
			'evt_old',
		);
		expect(out).toBe('stale');
		expect(row()).toMatchObject({ plan: 'hearth', lastStripeEventId: 'evt_new' });
	});

	it('a redelivery of the same read is an idempotent rewrite, not stale', async () => {
		await ent.applyEntitlement(
			'app',
			'user-1',
			ent.deriveEntitlement(subscription(), runtime()),
			1000,
			'evt_1',
		);
		const out = await ent.applyEntitlement(
			'app',
			'user-1',
			ent.deriveEntitlement(subscription(), runtime()),
			1000,
			'evt_1',
		);
		expect(out).toBe('written');
	});

	it('rule 2: an ended OTHER subscription does not downgrade the bound one', async () => {
		await ent.applyEntitlement(
			'app',
			'user-1',
			ent.deriveEntitlement(subscription({ id: 'sub_new' }), runtime()),
			1000,
			'evt_1',
		);
		const out = await ent.applyEntitlement(
			'app',
			'user-1',
			ent.deriveEntitlement(subscription({ id: 'sub_old', status: 'canceled' }), runtime()),
			2000,
			'evt_2',
		);
		expect(out).toBe('ignored-other-subscription');
		expect(row()).toMatchObject({ plan: 'lantern', stripeSubscriptionId: 'sub_new' });
	});

	it('a NEW granting subscription replaces the bound one (upgrade path)', async () => {
		await ent.applyEntitlement(
			'app',
			'user-1',
			ent.deriveEntitlement(subscription({ id: 'sub_a' }), runtime()),
			1000,
			'evt_1',
		);
		const beacon = subscription({
			id: 'sub_b',
			items: { object: 'list', data: [{ id: 'si', price: { id: PRICES.beacon.month } }] },
		});
		expect(
			await ent.applyEntitlement(
				'app',
				'user-1',
				ent.deriveEntitlement(beacon, runtime()),
				2000,
				'evt_2',
			),
		).toBe('written');
		expect(row()).toMatchObject({ plan: 'beacon', stripeSubscriptionId: 'sub_b' });
	});

	it('an ended subscription keeps the customer binding and drops the plan', async () => {
		await ent.applyEntitlement(
			'app',
			'user-1',
			ent.deriveEntitlement(subscription(), runtime()),
			1000,
			'evt_1',
		);
		await ent.applyEntitlement(
			'app',
			'user-1',
			ent.deriveEntitlement(subscription({ status: 'canceled' }), runtime()),
			2000,
			'evt_2',
		);
		expect(row()).toMatchObject({
			plan: 'hearth',
			stripeCustomerId: 'cus_1',
			stripeSubscriptionStatus: 'canceled',
		});
	});

	it('never resurrects a deleted account', async () => {
		store.items.set('account#user-1|entitlement', {
			pk: 'account#user-1',
			sk: 'entitlement',
			deletedAt: '2026-01-01',
		});
		const out = await ent.applyEntitlement(
			'app',
			'user-1',
			ent.deriveEntitlement(subscription(), runtime()),
			1000,
			'evt_1',
		);
		expect(out).toBe('account-deleted');
		expect(row()).not.toHaveProperty('plan');
	});

	it('binds a Stripe customer to one account only', async () => {
		await ent.bindStripeCustomer('app', 'cus_1', 'user-1');
		await ent.bindStripeCustomer('app', 'cus_1', 'user-1'); // idempotent
		await ent.bindStripeCustomer('app', 'cus_1', 'user-2'); // refused silently (condition)
		expect(await ent.accountForStripeCustomer('app', 'cus_1')).toBe('user-1');
	});

	it('marks an event processed exactly once', async () => {
		expect(await ent.markEventProcessed('app', 'evt_1', 100)).toBe(true);
		expect(await ent.markEventProcessed('app', 'evt_1', 200)).toBe(false);
		expect(store.items.get('stripe-event#evt_1|processed')).toMatchObject({
			expiresAt: 100 + 30 * 86400,
		});
	});
});

describe('webhook Lambda', () => {
	it('answers 503 and touches nothing when billing is not configured', async () => {
		resetBillingRuntimeCache(null);
		const res = await call(signedEvent('customer.subscription.created', subscription() as never));
		expect(res.status).toBe(503);
		expect(store.items.size).toBe(0);
	});

	it('rejects a missing signature (400)', async () => {
		const e = signedEvent('customer.subscription.created', subscription() as never);
		delete (e.headers as Record<string, string>)['stripe-signature'];
		expect((await call(e)).status).toBe(400);
	});

	it('rejects a signature made with the wrong secret (400) and writes nothing', async () => {
		const e = signedEvent('customer.subscription.created', subscription() as never, {
			secret: 'whsec_' + 'z'.repeat(32),
		});
		expect((await call(e)).status).toBe(400);
		expect(store.items.size).toBe(0);
	});

	it('rejects a tampered body (400)', async () => {
		const e = signedEvent('customer.subscription.created', subscription() as never);
		e.body = e.body!.replace('"active"', '"canceled"');
		expect((await call(e)).status).toBe(400);
	});

	it('refuses a live-mode event on a test-mode stage (400)', async () => {
		const e = signedEvent('customer.subscription.created', subscription() as never, {
			livemode: true,
		});
		expect((await call(e)).status).toBe(400);
		expect(stripeFake.retrieveCalls).toEqual([]);
	});

	it('applies a subscription event by RE-READING the subscription, not trusting the payload', async () => {
		// Payload says canceled; Stripe (the truth) says active. The row must follow Stripe.
		stripeFake.subscriptions.set('sub_1', subscription());
		const res = await call(
			signedEvent('customer.subscription.updated', subscription({ status: 'canceled' }) as never, {
				id: 'evt_a',
			}),
		);
		expect(res.status).toBe(200);
		expect(res.body.outcome).toBe('written');
		expect(stripeFake.retrieveCalls).toEqual(['sub_1']);
		expect(row()).toMatchObject({ plan: 'lantern', stripeSubscriptionStatus: 'active' });
		expect(store.items.has('stripe-event#evt_a|processed')).toBe(true);
	});

	it('acknowledges a duplicate delivery without re-processing', async () => {
		stripeFake.subscriptions.set('sub_1', subscription());
		await call(
			signedEvent('customer.subscription.created', subscription() as never, { id: 'evt_dup' }),
		);
		const again = await call(
			signedEvent('customer.subscription.created', subscription() as never, { id: 'evt_dup' }),
		);
		expect(again.status).toBe(200);
		expect(again.body.duplicate).toBe(true);
		expect(stripeFake.retrieveCalls).toEqual(['sub_1']);
	});

	it('handles checkout.session.completed via client_reference_id when metadata is absent', async () => {
		stripeFake.subscriptions.set('sub_1', subscription({ metadata: {} }));
		const session = {
			object: 'checkout.session',
			mode: 'subscription',
			subscription: 'sub_1',
			client_reference_id: 'user-1',
		};
		const res = await call(signedEvent('checkout.session.completed', session));
		expect(res.status).toBe(200);
		expect(row()).toMatchObject({ plan: 'lantern' });
	});

	it('falls back to the customer binding when a subscription carries no account metadata', async () => {
		await ent.bindStripeCustomer('app', 'cus_1', 'user-1');
		stripeFake.subscriptions.set('sub_1', subscription({ metadata: {} }));
		const res = await call(
			signedEvent('customer.subscription.created', subscription({ metadata: {} }) as never),
		);
		expect(res.status).toBe(200);
		expect(row()).toMatchObject({ plan: 'lantern' });
	});

	it('answers 500 (Stripe retries; the alarm fires) when a subscription cannot be linked', async () => {
		stripeFake.subscriptions.set('sub_1', subscription({ metadata: {} }));
		const res = await call(
			signedEvent('customer.subscription.created', subscription({ metadata: {} }) as never, {
				id: 'evt_unlinked',
			}),
		);
		expect(res.status).toBe(500);
		expect(res.body).toEqual({ error: 'processing failed' });
		expect(store.items.has('stripe-event#evt_unlinked|processed')).toBe(false);
	});

	it('answers 500 for a granting subscription on an unmapped price (operator misconfiguration)', async () => {
		stripeFake.subscriptions.set(
			'sub_1',
			subscription({
				items: { object: 'list', data: [{ id: 'si', price: { id: 'price_unknownAAAAA' } }] },
			}),
		);
		expect(
			(await call(signedEvent('customer.subscription.created', subscription() as never))).status,
		).toBe(500);
		expect(row()).toBeUndefined();
	});

	it('ignores event types it does not handle (200) without reading Stripe', async () => {
		const res = await call(signedEvent('invoice.paid', { object: 'invoice' }));
		expect(res.status).toBe(200);
		expect(res.body.ignored).toBe(true);
		expect(stripeFake.retrieveCalls).toEqual([]);
	});

	it('acknowledges a subscription Stripe no longer has (test-data deletion) without retry', async () => {
		const res = await call(
			signedEvent('customer.subscription.deleted', subscription({ id: 'sub_gone' }) as never),
		);
		expect(res.status).toBe(200);
		expect(res.body.outcome).toBe('subscription-gone');
	});

	it('accepts a base64-encoded body (API Gateway payload encoding)', async () => {
		stripeFake.subscriptions.set('sub_1', subscription());
		const e = signedEvent('customer.subscription.created', subscription() as never);
		e.body = Buffer.from(e.body!, 'utf8').toString('base64');
		e.isBase64Encoded = true;
		expect((await call(e)).status).toBe(200);
		expect(row()).toMatchObject({ plan: 'lantern' });
	});
});
