// RC-CLD-1.4 — OPT-IN PRODUCT ANALYTICS CLIENT.
//
// The rule this file exists to keep: with no recorded consent, this module never touches the
// network. Not a queued request, not a beacon on unload, not a "just the install ping". Consent is
// checked at RECORD time (nothing is buffered) and again at FLUSH time (a consent withdrawn while a
// batch waits drops that batch), because a queue that survives a withdrawal is a queue that sends
// after "no".
//
// What can be sent is decided in `@dndtools/core` (`diagnostics/product-analytics`), not here: a
// closed set of event names whose properties are closed sets of values, and an envelope with no
// account id, vault id, install id or session id in it. This file only handles consent storage,
// batching and transport — it cannot widen the taxonomy.
//
// Transport is a `text/plain` POST with `credentials: 'omit'`: a CORS-simple request, so no
// preflight and no cookies, to an unauthenticated ingestion route that stores nothing (it turns a
// batch into CloudWatch counters and drops it). See docs/development/PRODUCT_ANALYTICS.md.

import {
	PRODUCT_ANALYTICS_MAX_EVENTS,
	PRODUCT_ANALYTICS_PAYLOAD_VERSION,
	buildProductAnalyticsEvent,
	isTelemetryConsent,
	telemetryConsentAllows,
	toAnalyticsAppVersion,
	type ProductAnalyticsEvent,
	type ProductAnalyticsEventName,
	type ProductAnalyticsProps,
	type TelemetryConsent,
	type TelemetryPlatform,
} from '@dndtools/core';
import pkg from '../../package.json';
import { platformCapabilities } from '../platform/capabilities';
import { cloudConfig, isAccountApiConfigured } from './config';

export const TELEMETRY_CONSENT_KEY = 'dndtools:react:telemetry-consent';
/** Fired on the window whenever the recorded consent changes, so open panels stay in step. */
export const TELEMETRY_CONSENT_EVENT = 'dndtools:telemetry-consent';

/** Batches are sent at most this often; a full batch is sent immediately. */
const FLUSH_INTERVAL_MS = 30_000;

/** The recorded choice, or null when the DM has never been asked / never answered. */
export function storedTelemetryConsent(): TelemetryConsent | null {
	try {
		if (typeof window === 'undefined') return null;
		const raw = window.localStorage.getItem(TELEMETRY_CONSENT_KEY);
		return isTelemetryConsent(raw) ? raw : null;
	} catch {
		return null;
	}
}

/** The effective consent. No record, or an unrecognised one, means `denied` (fail closed). */
export function telemetryConsent(): TelemetryConsent {
	return storedTelemetryConsent() ?? 'denied';
}

/** True only when an explicit `granted` is on record. Every send path asks this. */
export function telemetryEnabled(): boolean {
	return telemetryConsentAllows(storedTelemetryConsent());
}

/**
 * True when this build has somewhere to send to. A local-first build with no cloud env never shows
 * the consent control as available — offering a switch that cannot do anything would be a dead
 * control.
 */
export function isTelemetryConfigured(): boolean {
	return isAccountApiConfigured;
}

/** The ingestion route on the application API. Empty when the build has no cloud env. */
export function telemetryIngestUrl(): string {
	return isAccountApiConfigured ? `${cloudConfig.appApiUrl}/telemetry` : '';
}

let queue: ProductAnalyticsEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function clearTimer(): void {
	if (flushTimer !== null) {
		clearTimeout(flushTimer);
		flushTimer = null;
	}
}

/** Record the DM's explicit choice. Withdrawing consent drops whatever is still queued. */
export function setTelemetryConsent(consent: TelemetryConsent): void {
	if (!isTelemetryConsent(consent)) return; // never persist an unrecognised value
	if (consent === 'denied') {
		queue = [];
		clearTimer();
	}
	try {
		if (typeof window !== 'undefined') {
			window.localStorage.setItem(TELEMETRY_CONSENT_KEY, consent);
			window.dispatchEvent(new CustomEvent(TELEMETRY_CONSENT_EVENT, { detail: consent }));
		}
	} catch {
		/* private mode — consent simply reads as denied next boot (fail closed) */
	}
}

function platform(): TelemetryPlatform {
	return platformCapabilities.runtimeKind === 'web' ? 'web' : 'desktop';
}

/** Everything currently queued, for tests and for the Settings panel's "what would be sent" list. */
export function pendingTelemetryEvents(): readonly ProductAnalyticsEvent[] {
	return [...queue];
}

/**
 * Record one event. Returns true only when it was actually queued — a denied consent, an
 * unconfigured build, or an off-taxonomy call all return false and leave no trace.
 */
export function recordTelemetryEvent<N extends ProductAnalyticsEventName>(
	name: N,
	props: ProductAnalyticsProps<N>,
): boolean {
	if (!telemetryEnabled() || !isTelemetryConfigured()) return false;
	const event = buildProductAnalyticsEvent(name, props);
	if (!event) return false;
	queue.push(event);
	if (queue.length >= PRODUCT_ANALYTICS_MAX_EVENTS) {
		void flushTelemetry();
		return true;
	}
	if (flushTimer === null && typeof setTimeout === 'function') {
		flushTimer = setTimeout(() => {
			flushTimer = null;
			void flushTelemetry();
		}, FLUSH_INTERVAL_MS);
	}
	return true;
}

/**
 * Send whatever is queued. Re-checks consent, so a batch recorded before a withdrawal is dropped
 * rather than sent. Resolves true only when a request actually went out.
 */
export async function flushTelemetry(): Promise<boolean> {
	clearTimer();
	const events = queue;
	queue = [];
	if (events.length === 0) return false;
	if (!telemetryEnabled() || !isTelemetryConfigured()) return false;
	const appVersion = toAnalyticsAppVersion(pkg.version);
	if (!appVersion) return false;
	const body = JSON.stringify({
		version: PRODUCT_ANALYTICS_PAYLOAD_VERSION,
		appVersion,
		platform: platform(),
		events: events.slice(0, PRODUCT_ANALYTICS_MAX_EVENTS),
	});
	try {
		const response = await fetch(telemetryIngestUrl(), {
			method: 'POST',
			// text/plain keeps this a CORS-simple request: no preflight, and nothing that could
			// carry an Authorization header or a cookie to an anonymous endpoint.
			headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
			credentials: 'omit',
			keepalive: true,
			body,
		});
		return response.ok;
	} catch {
		// Analytics never retries and never surfaces an error: a dropped batch is the correct
		// outcome of a flaky network, and the DM has nothing to act on.
		return false;
	}
}

/** Test seam — drop the queue and any pending timer without touching the recorded consent. */
export function resetTelemetryQueueForTests(): void {
	queue = [];
	clearTimer();
}
