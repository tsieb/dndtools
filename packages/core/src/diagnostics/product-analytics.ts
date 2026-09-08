/**
 * RC-CLD-1.4 — PRODUCT ANALYTICS TAXONOMY (opt-in, content-free).
 *
 * The product needs to know which surfaces are used, not what happens inside them. A vault holds a
 * campaign's private writing; an analytics pipeline that can carry a note title, a character name,
 * a search term or a file path is a data-exfiltration channel with a friendly name. So this module
 * is built the same way {@link ErrorTaxonomyCounts} is: privacy BY CONSTRUCTION rather than by
 * scrubbing.
 *
 * THE MODEL.
 *   • A {@link ProductAnalyticsEventName} is a member of a CLOSED set declared here. There is no
 *     "custom event" escape hatch, so a new event cannot ship without a code review of this file.
 *   • Every event declares the property keys it accepts and, for each key, the CLOSED set of values
 *     that key may take. Properties are enums, never free text and never numbers derived from
 *     content. {@link buildProductAnalyticsEvent} rejects an unknown name, an unknown key, or an
 *     unknown value outright — it returns `null`, it does not sanitise and continue.
 *   • The envelope carries no identity: no account id, no vault id, no install id, no session id,
 *     no IP-derived field, no timestamp finer than the minute. Two installs sending the same event
 *     produce byte-identical payloads, so the ingestion side has nothing to correlate on.
 *
 * CONSENT lives beside the taxonomy because "is it allowed to leave the device" is part of the
 * contract, not a UI detail: {@link telemetryConsentAllows} is the single predicate the app layer
 * asks, and an absent/unrecognised record resolves to `denied` (fail closed).
 *
 * The framework-free core owns this so the same taxonomy validates on both ends of the wire: the
 * client builds with it and the ingestion Lambda re-validates with it, and an event the core would
 * not build is an event the server will not count.
 */

/** Recorded analytics consent. No record ⇒ `denied`; only an explicit `granted` sends anything. */
export type TelemetryConsent = 'granted' | 'denied';

export function isTelemetryConsent(value: unknown): value is TelemetryConsent {
	return value === 'granted' || value === 'denied';
}

/** The one predicate the app asks before touching the network. Fails closed on anything unknown. */
export function telemetryConsentAllows(value: unknown): boolean {
	return value === 'granted';
}

/** The closed set of events. Adding one is a deliberate edit here, reviewed against §no-content. */
export const PRODUCT_ANALYTICS_EVENTS = {
	/** The app finished booting and rendered a first screen. */
	'app.launched': {
		platform: ['web', 'desktop'],
	},
	/** A top-level screen was opened (which surfaces are used at all). The values are the app's
	 *  top-level routes; anything else is `other`, so a deep link's campaign or note id can never
	 *  reach the payload by widening this list. */
	'screen.viewed': {
		screen: [
			'home',
			'board',
			'session',
			'characters',
			'atlas',
			'campaign',
			'knowledge',
			'graph',
			'audio',
			'extensions',
			'community',
			'upgrade',
			'settings',
			'other',
		],
	},
	/** A feature was used once. Coarse buckets only — never the entity it acted on. */
	'feature.used': {
		feature: [
			'dice-roll',
			'combat-tracker',
			'scene-push',
			'map-generate',
			'widget-add',
			'ai-run',
			'export',
			'import',
			'search',
		],
	},
	/** The device-scoped experience tier, sampled at launch (is progressive disclosure working).
	 *  The values ARE `FEATURE_TIERS` — the same vocabulary the onboarding registry gates on, not a
	 *  parallel list that could drift away from it. */
	'experience.tier': {
		tier: ['core', 'intermediate', 'advanced'],
	},
	/** A cloud capability was turned on or off (adoption of sync/remote play, not its contents). */
	'cloud.capability': {
		capability: ['sync', 'remote-play', 'marketplace'],
		state: ['enabled', 'disabled'],
	},
	/** An error boundary caught something, by the SAME closed category the error taxonomy uses. */
	'error.observed': {
		category: ['network', 'sync', 'storage', 'permission', 'validation', 'render', 'unknown'],
	},
} as const satisfies Record<string, Record<string, readonly string[]>>;

export type ProductAnalyticsEventName = keyof typeof PRODUCT_ANALYTICS_EVENTS;

export const PRODUCT_ANALYTICS_EVENT_NAMES = Object.keys(
	PRODUCT_ANALYTICS_EVENTS,
) as ProductAnalyticsEventName[];

/** Properties accepted by one event: every key maps to one of that key's declared enum values. */
export type ProductAnalyticsProps<N extends ProductAnalyticsEventName> = {
	readonly [K in keyof (typeof PRODUCT_ANALYTICS_EVENTS)[N]]: (typeof PRODUCT_ANALYTICS_EVENTS)[N][K] extends readonly (infer V)[]
		? V
		: never;
};

/** One validated event. `props` is closed-vocabulary only — there is no free-text field here. */
export interface ProductAnalyticsEvent {
	readonly name: ProductAnalyticsEventName;
	readonly props: Readonly<Record<string, string>>;
}

/** Payload version. Bump when the envelope shape changes; the server rejects other versions. */
export const PRODUCT_ANALYTICS_PAYLOAD_VERSION = 1;

/** Semver-ish app version, coarse enough to be a cohort and not a fingerprint (major.minor only). */
const APP_VERSION_PATTERN = /^\d{1,3}\.\d{1,3}$/;
const PLATFORMS = ['web', 'desktop'] as const;
export type TelemetryPlatform = (typeof PLATFORMS)[number];

/**
 * What actually goes over the wire. Deliberately identity-free: the batch is a bag of enum-only
 * events plus two low-cardinality cohort fields. Nothing here distinguishes one install from
 * another, which is why the ingestion side can be unauthenticated without becoming a tracker.
 */
export interface ProductAnalyticsPayload {
	readonly version: typeof PRODUCT_ANALYTICS_PAYLOAD_VERSION;
	readonly appVersion: string;
	readonly platform: TelemetryPlatform;
	readonly events: readonly ProductAnalyticsEvent[];
}

/** Largest batch the client sends and the server accepts (a bound, not a sampling policy). */
export const PRODUCT_ANALYTICS_MAX_EVENTS = 50;

function isEventName(value: unknown): value is ProductAnalyticsEventName {
	return typeof value === 'string' && Object.hasOwn(PRODUCT_ANALYTICS_EVENTS, value);
}

/**
 * Build ONE event, or `null` when it does not match the taxonomy exactly. Fail-closed on all of:
 * unknown event name, missing declared key, unknown extra key, value outside the key's enum.
 */
export function buildProductAnalyticsEvent(
	name: unknown,
	props: unknown,
): ProductAnalyticsEvent | null {
	if (!isEventName(name)) return null;
	const spec = PRODUCT_ANALYTICS_EVENTS[name] as Record<string, readonly string[]>;
	if (typeof props !== 'object' || props === null || Array.isArray(props)) return null;
	const given = props as Record<string, unknown>;
	const keys = Object.keys(spec);
	for (const key of Object.keys(given)) if (!keys.includes(key)) return null;
	const clean: Record<string, string> = {};
	for (const key of keys) {
		const allowed = spec[key];
		const value = given[key];
		if (!allowed || typeof value !== 'string' || !allowed.includes(value)) return null;
		clean[key] = value;
	}
	return { name, props: clean };
}

/** Coarsen a full app version to the `major.minor` cohort the payload carries. Invalid ⇒ null. */
export function toAnalyticsAppVersion(version: unknown): string | null {
	if (typeof version !== 'string') return null;
	const match = /^(\d{1,3})\.(\d{1,3})(?:\.\d{1,4})?(?:[-+].*)?$/.exec(version.trim());
	if (!match) return null;
	const [, major, minor] = match;
	return major && minor ? `${major}.${minor}` : null;
}

/**
 * Validate a whole received payload — the SERVER's entry point, and the client's last check before
 * sending. Returns the payload with every event re-validated, or `null` if anything is off. An
 * empty event list is rejected too: a batch with nothing in it is a request that should not exist.
 */
export function parseProductAnalyticsPayload(value: unknown): ProductAnalyticsPayload | null {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
	const raw = value as Record<string, unknown>;
	if (raw.version !== PRODUCT_ANALYTICS_PAYLOAD_VERSION) return null;
	if (typeof raw.appVersion !== 'string' || !APP_VERSION_PATTERN.test(raw.appVersion)) return null;
	if (!PLATFORMS.includes(raw.platform as TelemetryPlatform)) return null;
	if (!Array.isArray(raw.events)) return null;
	if (raw.events.length === 0 || raw.events.length > PRODUCT_ANALYTICS_MAX_EVENTS) return null;
	const events: ProductAnalyticsEvent[] = [];
	for (const entry of raw.events) {
		if (typeof entry !== 'object' || entry === null) return null;
		const { name, props } = entry as { name?: unknown; props?: unknown };
		const built = buildProductAnalyticsEvent(name, props ?? {});
		if (!built) return null;
		events.push(built);
	}
	return {
		version: PRODUCT_ANALYTICS_PAYLOAD_VERSION,
		appVersion: raw.appVersion,
		platform: raw.platform as TelemetryPlatform,
		events,
	};
}
