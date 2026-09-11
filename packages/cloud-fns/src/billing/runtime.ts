// ADR-027 — Stripe billing runtime: the ONE place the Lambdas obtain a Stripe client and the
// stage's billing settings. Everything comes from SSM at runtime, never from the template:
//
//   <BILLING_SSM_PREFIX>/stripe-secret-key      SecureString  sk_test_… / sk_live_…
//   <BILLING_SSM_PREFIX>/stripe-webhook-secret  SecureString  whsec_… (the endpoint's signing secret)
//   <BILLING_SSM_PREFIX>/config                 String        JSON, see BillingSettings below
//
// Reading at runtime (cached per container) rather than baking values into the deploy means the
// operator can turn billing on, rotate a key, or switch prices with `stripe-bootstrap.mjs` and no
// stack update — and, more importantly, that a stage with NO parameters is simply "billing not
// configured": every caller fails CLOSED (503 for checkout/portal/webhook, `billing: null` in the
// entitlement read). A half-configured stage (one parameter missing, key/mode mismatch, malformed
// config) is treated exactly the same as unconfigured, and logged once per container.
import Stripe from 'stripe';
import { SSMClient, GetParametersCommand } from '@aws-sdk/client-ssm';

export type PaidPlan = 'lantern' | 'beacon';
export type BillingInterval = 'month' | 'year';
export const PAID_PLANS: readonly PaidPlan[] = ['lantern', 'beacon'] as const;
export const BILLING_INTERVALS: readonly BillingInterval[] = ['month', 'year'] as const;

/** The non-secret half of the configuration (`…/billing/config`, JSON). */
export interface BillingSettings {
	version: 1;
	/** Which Stripe mode the stage runs in. Must agree with the secret key's prefix. */
	livemode: boolean;
	/** Stripe price ids per paid plan and billing interval. */
	prices: Record<PaidPlan, Record<BillingInterval, string>>;
	/** Optional saved customer-portal configuration (`bpc_…`); Stripe's default when absent. */
	portalConfigurationId?: string;
}

/** Everything a route needs, resolved and validated. `null` means billing is not configured. */
export interface BillingRuntime {
	stripe: Stripe;
	settings: BillingSettings;
	webhookSecret: string;
	/** Reverse of `settings.prices`: price id → plan + interval. */
	priceIndex: ReadonlyMap<string, { plan: PaidPlan; interval: BillingInterval }>;
}

const PRICE_ID_RE = /^price_[A-Za-z0-9]{8,}$/;
const PORTAL_CONFIG_RE = /^bpc_[A-Za-z0-9]{8,}$/;
const SECRET_KEY_RE = /^(sk|rk)_(test|live)_[A-Za-z0-9]{16,}$/;
const WEBHOOK_SECRET_RE = /^whsec_[A-Za-z0-9]{16,}$/;

/** Parse + validate the JSON config parameter. Throws with a safe, specific message. */
export function parseBillingSettings(raw: string): BillingSettings {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error('billing config is not valid JSON');
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
		throw new Error('billing config must be a JSON object');
	const obj = parsed as Record<string, unknown>;
	if (obj.version !== 1) throw new Error('billing config version must be 1');
	if (typeof obj.livemode !== 'boolean') throw new Error('billing config livemode must be boolean');
	const pricesRaw = obj.prices;
	if (!pricesRaw || typeof pricesRaw !== 'object' || Array.isArray(pricesRaw))
		throw new Error('billing config prices must be an object');
	const prices = {} as Record<PaidPlan, Record<BillingInterval, string>>;
	const seen = new Set<string>();
	for (const plan of PAID_PLANS) {
		const byInterval = (pricesRaw as Record<string, unknown>)[plan];
		if (!byInterval || typeof byInterval !== 'object' || Array.isArray(byInterval))
			throw new Error(`billing config prices.${plan} must be an object`);
		prices[plan] = {} as Record<BillingInterval, string>;
		for (const interval of BILLING_INTERVALS) {
			const id = (byInterval as Record<string, unknown>)[interval];
			if (typeof id !== 'string' || !PRICE_ID_RE.test(id))
				throw new Error(`billing config prices.${plan}.${interval} must be a Stripe price id`);
			if (seen.has(id)) throw new Error(`billing config price ${id} is mapped twice`);
			seen.add(id);
			prices[plan][interval] = id;
		}
	}
	let portalConfigurationId: string | undefined;
	if (obj.portalConfigurationId !== undefined && obj.portalConfigurationId !== '') {
		if (
			typeof obj.portalConfigurationId !== 'string' ||
			!PORTAL_CONFIG_RE.test(obj.portalConfigurationId)
		)
			throw new Error('billing config portalConfigurationId must be a Stripe bpc_ id');
		portalConfigurationId = obj.portalConfigurationId;
	}
	return { version: 1, livemode: obj.livemode, prices, portalConfigurationId };
}

export function buildPriceIndex(
	settings: BillingSettings,
): ReadonlyMap<string, { plan: PaidPlan; interval: BillingInterval }> {
	const index = new Map<string, { plan: PaidPlan; interval: BillingInterval }>();
	for (const plan of PAID_PLANS)
		for (const interval of BILLING_INTERVALS)
			index.set(settings.prices[plan][interval], { plan, interval });
	return index;
}

/**
 * Assemble a runtime from the three raw parameter values. Exported for tests and for the
 * bootstrap script's dry-run; the Lambdas go through `getBillingRuntime()` below.
 */
export function assembleBillingRuntime(values: {
	secretKey: string;
	webhookSecret: string;
	config: string;
	stripeFactory?: (secretKey: string) => Stripe;
}): BillingRuntime {
	const secretKey = values.secretKey.trim();
	const webhookSecret = values.webhookSecret.trim();
	if (!SECRET_KEY_RE.test(secretKey)) throw new Error('stripe secret key has an unexpected shape');
	if (!WEBHOOK_SECRET_RE.test(webhookSecret))
		throw new Error('stripe webhook secret has an unexpected shape');
	const settings = parseBillingSettings(values.config);
	const keyIsLive = /^(sk|rk)_live_/.test(secretKey);
	if (keyIsLive !== settings.livemode)
		throw new Error(
			`stripe key mode (${keyIsLive ? 'live' : 'test'}) does not match config livemode=${settings.livemode}`,
		);
	const stripe = (values.stripeFactory ?? defaultStripeFactory)(secretKey);
	return { stripe, settings, webhookSecret, priceIndex: buildPriceIndex(settings) };
}

function defaultStripeFactory(secretKey: string): Stripe {
	return new Stripe(secretKey, {
		// Lambda: keep requests bounded well inside the function timeout, and let the SDK retry
		// idempotent calls once on a network blip rather than surfacing every transient fault.
		timeout: 10_000,
		maxNetworkRetries: 1,
		appInfo: { name: 'lamplight-cloud', url: 'https://lamplight.click' },
	});
}

// --- cached loader -----------------------------------------------------------------------------
const PREFIX = (process.env.BILLING_SSM_PREFIX ?? '').replace(/\/$/, '');
const CONFIGURED_TTL_MS = 5 * 60 * 1000; // re-read a working config every 5 minutes
const UNCONFIGURED_TTL_MS = 60 * 1000; // re-check an absent/broken config every minute

let cache: { value: BillingRuntime | null; expiresAt: number } | undefined;
let ssm: SSMClient | undefined;
let inflight: Promise<BillingRuntime | null> | undefined;

/**
 * The stage's billing runtime, or `null` when billing is not configured. Never throws for a
 * configuration problem — that is logged and answered with `null` so every route fails closed.
 * SSM/KMS transport faults DO throw (a transient outage must not be cached as "unconfigured").
 */
export async function getBillingRuntime(now = Date.now()): Promise<BillingRuntime | null> {
	if (cache && cache.expiresAt > now) return cache.value;
	if (inflight) return inflight;
	inflight = (async () => {
		try {
			const value = await loadFromSsm();
			cache = {
				value,
				expiresAt: Date.now() + (value ? CONFIGURED_TTL_MS : UNCONFIGURED_TTL_MS),
			};
			return value;
		} finally {
			inflight = undefined;
		}
	})();
	return inflight;
}

/** Test seam: drop the cached runtime (and, optionally, pin one). */
export function resetBillingRuntimeCache(pinned?: BillingRuntime | null): void {
	cache = pinned === undefined ? undefined : { value: pinned, expiresAt: Number.MAX_SAFE_INTEGER };
	inflight = undefined;
}

async function loadFromSsm(): Promise<BillingRuntime | null> {
	if (!PREFIX) return null;
	ssm ??= new SSMClient({ region: process.env.AWS_REGION });
	const names = {
		secretKey: `${PREFIX}/stripe-secret-key`,
		webhookSecret: `${PREFIX}/stripe-webhook-secret`,
		config: `${PREFIX}/config`,
	};
	const res = await ssm.send(
		new GetParametersCommand({ Names: Object.values(names), WithDecryption: true }),
	);
	const byName = new Map((res.Parameters ?? []).map((p) => [p.Name ?? '', p.Value ?? '']));
	const missing = Object.values(names).filter((n) => !byName.get(n));
	if (missing.length === Object.keys(names).length) return null; // plainly unconfigured: quiet
	if (missing.length > 0) {
		console.error('billing is half-configured; failing closed', {
			missing: missing.map((n) => n.slice(PREFIX.length + 1)),
		});
		return null;
	}
	try {
		return assembleBillingRuntime({
			secretKey: byName.get(names.secretKey)!,
			webhookSecret: byName.get(names.webhookSecret)!,
			config: byName.get(names.config)!,
		});
	} catch (err) {
		console.error('billing configuration rejected; failing closed', {
			reason: err instanceof Error ? err.message : String(err),
		});
		return null;
	}
}
