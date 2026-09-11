#!/usr/bin/env node
// ADR-027 — Stripe bootstrap for one stage. IDEMPOTENT: run it as often as you like.
//
//   STRIPE_SECRET_KEY=sk_test_… pnpm billing:bootstrap -- --stage dev
//   STRIPE_SECRET_KEY=sk_live_… pnpm billing:bootstrap -- --stage prod \
//        --privacy-url https://lamplight.click/#/legal/privacy --terms-url https://lamplight.click/#/legal/terms
//
// What it makes true, in order, creating only what is missing:
//   1. Products  — "Lamplight Lantern" / "Lamplight Beacon" (found by metadata.lamplight_plan).
//   2. Prices    — month + year per plan, USD, found by lookup_key (lantern_month, …). Prices are
//                  immutable in Stripe: a changed amount is REPORTED, never silently replaced
//                  (pass --rotate-prices to mint new prices and move the lookup keys over).
//   3. Portal    — a customer-portal configuration that lets a subscriber cancel (at period end),
//                  switch between the four prices, update card/address/email and see invoices.
//   4. Webhook   — an endpoint for <app-api-url>/billing/webhook subscribed to the four events
//                  the Lambda handles. Its signing secret is only revealed at creation, so an
//                  endpoint that exists while SSM lacks the secret is deleted and recreated.
//   5. SSM       — /dndtools/<stage>/billing/{stripe-secret-key,stripe-webhook-secret} as
//                  SecureString and …/config as the JSON the Lambdas validate at runtime.
//
// The Lambdas re-read SSM within five minutes, so no redeploy is needed after this runs (the
// app-api stack must already be deployed at the version that carries the billing routes).
//
// Guard rails: the key's mode must match the stage (test↔dev, live↔prod) unless
// --allow-mode-mismatch is given; nothing is written with --dry-run; the secret key never
// touches the repo, a file, or stdout.
import Stripe from 'stripe';
import { SSMClient, GetParameterCommand, PutParameterCommand } from '@aws-sdk/client-ssm';

const args = parseArgs(process.argv.slice(2));
const STAGE = args.stage;
if (STAGE !== 'dev' && STAGE !== 'prod') die('--stage must be dev or prod');
const PROJECT = args.project ?? 'dndtools';
const REGION = args.region ?? 'ca-central-1';
const PROFILE = args.profile ?? (STAGE === 'prod' ? 'dndtools-prod' : 'dndtools');
const DRY_RUN = Boolean(args['dry-run']);
const PREFIX = `/${PROJECT}/${STAGE}/billing`;

const SECRET_KEY = (process.env.STRIPE_SECRET_KEY ?? '').trim();
if (!/^(sk|rk)_(test|live)_[A-Za-z0-9]{16,}$/.test(SECRET_KEY))
	die('STRIPE_SECRET_KEY must be set in the environment (sk_test_… for dev, sk_live_… for prod)');
const LIVE = /_live_/.test(SECRET_KEY);
if (LIVE !== (STAGE === 'prod') && !args['allow-mode-mismatch'])
	die(
		`refusing: a ${LIVE ? 'LIVE' : 'test'} key for stage "${STAGE}" (pass --allow-mode-mismatch only if you really mean it)`,
	);

// --- the catalogue (keep in step with PLAN_CARDS in apps/gm-react/src/cloud/entitlements.ts) ---
// Stripe product tax code. New Stripe accounts have "Managed Payments" on by default, which
// REFUSES a Checkout line item whose product has no tax code; Stripe Tax also keys on it.
// txcd_10103001 = "Software as a service (SaaS) — personal use" (a consumer subscription).
const PRODUCT_TAX_CODE = 'txcd_10103001';
const PLANS = {
	lantern: {
		name: 'Lamplight Lantern',
		description: 'Encrypted off-device backup, internet remote play, 1 co-DM seat.',
		month: 700,
		year: 7000,
	},
	beacon: {
		name: 'Lamplight Beacon',
		description: 'Everything in Lantern, 3 co-DM seats, public campaign wikis and publishing.',
		month: 1500,
		year: 15000,
	},
};
const INTERVALS = ['month', 'year'];
const WEBHOOK_EVENTS = [
	'checkout.session.completed',
	'customer.subscription.created',
	'customer.subscription.updated',
	'customer.subscription.deleted',
];

const stripe = new Stripe(SECRET_KEY, { maxNetworkRetries: 2, timeout: 20_000 });
// The default credential chain honours AWS_PROFILE; never rely on an ambient one (see aws-auth).
process.env.AWS_PROFILE = PROFILE;
const ssm = new SSMClient({ region: REGION });

const log = (...m) => console.log(...m);
const plan = (...m) => console.log(DRY_RUN ? '  [dry-run]' : '  →', ...m);

log(
	`Stripe bootstrap · stage=${STAGE} · mode=${LIVE ? 'LIVE' : 'test'} · ssm=${PREFIX} · profile=${PROFILE}`,
);
if (DRY_RUN) log('DRY RUN — nothing will be created or written.');

// --- 0. where is the app-api? -----------------------------------------------------------------
const appApiUrl = (await readParam(`/${PROJECT}/${STAGE}/app-api/url`))?.replace(/\/$/, '');
if (!appApiUrl) die(`/${PROJECT}/${STAGE}/app-api/url is not in SSM — deploy app-api first`);
const webhookUrl = `${appApiUrl}/billing/webhook`;
log(`webhook target: ${webhookUrl}`);

// --- 1. products ------------------------------------------------------------------------------
const products = {};
for (const [id, spec] of Object.entries(PLANS)) {
	const found = await stripe.products.search({
		query: `active:'true' AND metadata['lamplight_plan']:'${id}'`,
		limit: 1,
	});
	if (found.data[0]) {
		products[id] = found.data[0];
		const taxCode =
			typeof found.data[0].tax_code === 'string'
				? found.data[0].tax_code
				: found.data[0].tax_code?.id;
		if (taxCode !== PRODUCT_TAX_CODE) {
			plan(`set tax code ${PRODUCT_TAX_CODE} on product ${id}`);
			if (!DRY_RUN) await stripe.products.update(found.data[0].id, { tax_code: PRODUCT_TAX_CODE });
		}
		log(`product ${id}: ${found.data[0].id} (exists)`);
	} else {
		plan(`create product ${spec.name}`);
		if (!DRY_RUN) {
			products[id] = await stripe.products.create({
				name: spec.name,
				description: spec.description,
				tax_code: PRODUCT_TAX_CODE,
				metadata: { lamplight_plan: id, app: 'lamplight' },
			});
			log(`product ${id}: ${products[id].id} (created)`);
		}
	}
}

// --- 2. prices --------------------------------------------------------------------------------
const prices = { lantern: {}, beacon: {} };
const lookupKeys = Object.keys(PLANS).flatMap((id) => INTERVALS.map((i) => `${id}_${i}`));
const existingPrices = await stripe.prices.list({ lookup_keys: lookupKeys, limit: 100 });
const byLookup = new Map(existingPrices.data.map((p) => [p.lookup_key, p]));
for (const [id, spec] of Object.entries(PLANS)) {
	for (const interval of INTERVALS) {
		const key = `${id}_${interval}`;
		const want = spec[interval];
		const have = byLookup.get(key);
		if (have && have.unit_amount === want && have.currency === 'usd' && have.active) {
			prices[id][interval] = have.id;
			log(`price ${key}: ${have.id} $${(want / 100).toFixed(2)}/${interval} (exists)`);
			continue;
		}
		if (have && !args['rotate-prices']) {
			die(
				`price ${key} (${have.id}) is $${(have.unit_amount / 100).toFixed(2)} ${have.currency}${have.active ? '' : ', inactive'} but the catalogue says $${(want / 100).toFixed(2)} usd. Prices are immutable: pass --rotate-prices to mint a replacement and move the lookup key.`,
			);
		}
		plan(
			`create price ${key} $${(want / 100).toFixed(2)}/${interval}${have ? ' (rotating lookup key)' : ''}`,
		);
		if (!DRY_RUN) {
			const created = await stripe.prices.create({
				product: products[id].id,
				currency: 'usd',
				unit_amount: want,
				recurring: { interval },
				lookup_key: key,
				transfer_lookup_key: true,
				metadata: { lamplight_plan: id, lamplight_interval: interval },
			});
			prices[id][interval] = created.id;
			log(`price ${key}: ${created.id} (created)`);
		}
	}
}

// --- 3. customer portal configuration ---------------------------------------------------------
const currentConfig = safeJson(await readParam(`${PREFIX}/config`));
let portalConfigurationId = currentConfig?.portalConfigurationId ?? '';
if (portalConfigurationId) {
	try {
		const existing = await stripe.billingPortal.configurations.retrieve(portalConfigurationId);
		if (!existing.active) portalConfigurationId = '';
		else log(`portal configuration: ${portalConfigurationId} (exists)`);
	} catch {
		portalConfigurationId = '';
	}
}
const portalFeatures = {
	customer_update: { enabled: true, allowed_updates: ['email', 'name', 'address'] },
	invoice_history: { enabled: true },
	payment_method_update: { enabled: true },
	subscription_cancel: {
		enabled: true,
		mode: 'at_period_end',
		proration_behavior: 'none',
		cancellation_reason: {
			enabled: true,
			options: ['too_expensive', 'missing_features', 'switched_service', 'unused', 'other'],
		},
	},
	subscription_update: {
		enabled: true,
		default_allowed_updates: ['price'],
		proration_behavior: 'create_prorations',
		products: DRY_RUN
			? []
			: Object.keys(PLANS).map((id) => ({
					product: products[id].id,
					prices: INTERVALS.map((i) => prices[id][i]),
				})),
	},
};
const businessProfile = {
	headline: 'Lamplight — manage your cloud plan',
	...(args['privacy-url'] ? { privacy_policy_url: args['privacy-url'] } : {}),
	...(args['terms-url'] ? { terms_of_service_url: args['terms-url'] } : {}),
};
if (!portalConfigurationId) {
	plan('create portal configuration (cancel at period end, switch plans, card/invoices)');
	if (!DRY_RUN) {
		const created = await stripe.billingPortal.configurations.create({
			business_profile: businessProfile,
			features: portalFeatures,
			default_return_url: `${await webOrigin()}/#/settings`,
		});
		portalConfigurationId = created.id;
		log(`portal configuration: ${portalConfigurationId} (created)`);
	}
} else if (!DRY_RUN) {
	// Keep an existing configuration in step with the catalogue (new prices, changed URLs).
	await stripe.billingPortal.configurations.update(portalConfigurationId, {
		business_profile: businessProfile,
		features: portalFeatures,
	});
	log(`portal configuration: ${portalConfigurationId} (updated to the current catalogue)`);
}

// --- 4. webhook endpoint ----------------------------------------------------------------------
let webhookSecret = await readParam(`${PREFIX}/stripe-webhook-secret`, true);
const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
let endpoint = endpoints.data.find((e) => e.url === webhookUrl);
const eventsMatch = (e) =>
	e && WEBHOOK_EVENTS.every((ev) => e.enabled_events.includes(ev)) && e.status === 'enabled';
if (endpoint && webhookSecret && eventsMatch(endpoint)) {
	log(`webhook endpoint: ${endpoint.id} (exists; secret already in SSM)`);
} else {
	if (endpoint) {
		plan(
			`delete webhook endpoint ${endpoint.id} (${webhookSecret ? 'event list drifted' : 'its signing secret is not in SSM and cannot be read back'})`,
		);
		if (!DRY_RUN) await stripe.webhookEndpoints.del(endpoint.id);
	}
	plan(`create webhook endpoint ${webhookUrl} for ${WEBHOOK_EVENTS.join(', ')}`);
	if (!DRY_RUN) {
		endpoint = await stripe.webhookEndpoints.create({
			url: webhookUrl,
			enabled_events: WEBHOOK_EVENTS,
			// Pin the endpoint to the API version the SDK (and therefore our types) speak.
			api_version: stripe.getApiField('version'),
			description: `Lamplight ${STAGE} entitlement webhook (ADR-027)`,
			metadata: { app: 'lamplight', stage: STAGE },
		});
		webhookSecret = endpoint.secret;
		log(`webhook endpoint: ${endpoint.id} (created)`);
	}
}

// --- 5. SSM -----------------------------------------------------------------------------------
const config = {
	version: 1,
	livemode: LIVE,
	prices,
	...(portalConfigurationId ? { portalConfigurationId } : {}),
};
plan(`write ${PREFIX}/config = ${JSON.stringify(config)}`);
plan(`write ${PREFIX}/stripe-secret-key (SecureString, ${SECRET_KEY.slice(0, 8)}…)`);
plan(`write ${PREFIX}/stripe-webhook-secret (SecureString)`);
if (!DRY_RUN) {
	if (!webhookSecret) die('no webhook signing secret available to write (unexpected)');
	await writeParam(`${PREFIX}/stripe-secret-key`, SECRET_KEY, 'SecureString');
	await writeParam(`${PREFIX}/stripe-webhook-secret`, webhookSecret, 'SecureString');
	await writeParam(`${PREFIX}/config`, JSON.stringify(config), 'String');
	log('');
	log('Done. The Lambdas pick this up within five minutes (no redeploy needed).');
	log(
		`Verify: ${STAGE === 'dev' ? 'infra/verify-billing.sh dev' : 'the runbook’s prod smoke test (docs/runbooks/stripe-billing.md)'}`,
	);
} else {
	log('');
	log('Dry run complete. Re-run without --dry-run to apply.');
}

// --- helpers ----------------------------------------------------------------------------------
async function webOrigin() {
	const origin = await readParam(`/${PROJECT}/${STAGE}/web/url`);
	if (!origin) die(`/${PROJECT}/${STAGE}/web/url is not in SSM — deploy web-hosting first`);
	return origin.replace(/\/$/, '');
}

async function readParam(name, decrypt = false) {
	try {
		const res = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: decrypt }));
		return res.Parameter?.Value ?? '';
	} catch (err) {
		if (err?.name === 'ParameterNotFound') return '';
		throw err;
	}
}

async function writeParam(name, value, type) {
	await ssm.send(
		new PutParameterCommand({
			Name: name,
			Value: value,
			Type: type,
			Overwrite: true,
			Tier: 'Standard',
			Description: `ADR-027 Stripe billing (${STAGE}) — written by stripe-bootstrap.mjs`,
		}),
	);
}

function safeJson(text) {
	try {
		return text ? JSON.parse(text) : null;
	} catch {
		return null;
	}
}

function parseArgs(argv) {
	const out = {};
	for (let i = 0; i < argv.length; i += 1) {
		const a = argv[i];
		if (!a.startsWith('--')) die(`unexpected argument ${a}`);
		const key = a.slice(2);
		const next = argv[i + 1];
		if (next !== undefined && !next.startsWith('--')) {
			out[key] = next;
			i += 1;
		} else out[key] = true;
	}
	return out;
}

function die(message) {
	console.error(`stripe-bootstrap: ${message}`);
	process.exit(2);
}
