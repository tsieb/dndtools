import { describe, expect, it } from 'vitest';
import {
	ERROR_TAXONOMY_CATEGORIES,
	FEATURE_TIERS,
	PRODUCT_ANALYTICS_EVENTS,
	PRODUCT_ANALYTICS_EVENT_NAMES,
	PRODUCT_ANALYTICS_MAX_EVENTS,
	PRODUCT_ANALYTICS_PAYLOAD_VERSION,
	buildProductAnalyticsEvent,
	isTelemetryConsent,
	parseProductAnalyticsPayload,
	telemetryConsentAllows,
	toAnalyticsAppVersion,
} from '../src';

// RC-CLD-1.4 — the analytics taxonomy is the privacy boundary. These tests hold the two properties
// the whole feature rests on: nothing outside the declared vocabulary can be built or parsed, and
// consent fails closed on every value that is not literally 'granted'.

const validPayload = {
	version: PRODUCT_ANALYTICS_PAYLOAD_VERSION,
	appVersion: '0.3',
	platform: 'web',
	events: [{ name: 'screen.viewed', props: { screen: 'session' } }],
};

describe('RC-CLD-1.4 consent fails closed', () => {
	it('only an explicit granted record allows sending', () => {
		expect(telemetryConsentAllows('granted')).toBe(true);
		for (const value of ['denied', '', null, undefined, 'GRANTED', 1, true, {}])
			expect(telemetryConsentAllows(value)).toBe(false);
	});

	it('recognises exactly the two recordable consent values', () => {
		expect(isTelemetryConsent('granted')).toBe(true);
		expect(isTelemetryConsent('denied')).toBe(true);
		expect(isTelemetryConsent('unset')).toBe(false);
		expect(isTelemetryConsent(null)).toBe(false);
	});
});

describe('RC-CLD-1.4 event taxonomy is closed', () => {
	it('builds a declared event with declared property values', () => {
		expect(buildProductAnalyticsEvent('feature.used', { feature: 'dice-roll' })).toEqual({
			name: 'feature.used',
			props: { feature: 'dice-roll' },
		});
	});

	it('rejects an undeclared event name', () => {
		expect(buildProductAnalyticsEvent('note.opened', {})).toBeNull();
		expect(buildProductAnalyticsEvent('toString', {})).toBeNull();
	});

	it('rejects free text smuggled into a declared property', () => {
		expect(
			buildProductAnalyticsEvent('screen.viewed', { screen: 'The Sunless Citadel, room 4' }),
		).toBeNull();
		expect(buildProductAnalyticsEvent('feature.used', { feature: 'search', q: 'lich' })).toBeNull();
	});

	it('rejects a missing declared property and a non-object props bag', () => {
		expect(buildProductAnalyticsEvent('screen.viewed', {})).toBeNull();
		expect(buildProductAnalyticsEvent('screen.viewed', 'session')).toBeNull();
		expect(buildProductAnalyticsEvent('screen.viewed', ['session'])).toBeNull();
	});

	it('declares only enum-valued properties — no event has a free-text field', () => {
		for (const name of PRODUCT_ANALYTICS_EVENT_NAMES) {
			const spec = PRODUCT_ANALYTICS_EVENTS[name] as Record<string, readonly string[]>;
			for (const values of Object.values(spec)) {
				expect(Array.isArray(values)).toBe(true);
				expect(values.length).toBeGreaterThan(0);
				for (const value of values) expect(value).toMatch(/^[a-z][a-z0-9-]*$/);
			}
		}
	});

	it('reuses the onboarding feature tiers rather than inventing a second list', () => {
		expect([...PRODUCT_ANALYTICS_EVENTS['experience.tier'].tier]).toEqual([...FEATURE_TIERS]);
	});

	it('reuses the error taxonomy categories rather than inventing a second list', () => {
		expect([...PRODUCT_ANALYTICS_EVENTS['error.observed'].category]).toEqual([
			...ERROR_TAXONOMY_CATEGORIES,
		]);
	});
});

describe('RC-CLD-1.4 payload parsing', () => {
	it('accepts a well-formed identity-free payload', () => {
		expect(parseProductAnalyticsPayload(validPayload)).toEqual(validPayload);
	});

	it('drops any field the envelope does not declare', () => {
		const parsed = parseProductAnalyticsPayload({
			...validPayload,
			accountId: 'us-east-1:abc',
			userEmail: 'dm@example.test',
		});
		expect(parsed).not.toBeNull();
		expect(Object.keys(parsed ?? {}).sort()).toEqual([
			'appVersion',
			'events',
			'platform',
			'version',
		]);
	});

	it('rejects a wrong version, an empty batch and an oversized batch', () => {
		expect(parseProductAnalyticsPayload({ ...validPayload, version: 2 })).toBeNull();
		expect(parseProductAnalyticsPayload({ ...validPayload, events: [] })).toBeNull();
		expect(
			parseProductAnalyticsPayload({
				...validPayload,
				events: Array.from({ length: PRODUCT_ANALYTICS_MAX_EVENTS + 1 }, () => ({
					name: 'app.launched',
					props: { platform: 'web' },
				})),
			}),
		).toBeNull();
	});

	it('rejects a batch where any single event is off-taxonomy', () => {
		expect(
			parseProductAnalyticsPayload({
				...validPayload,
				events: [
					{ name: 'screen.viewed', props: { screen: 'session' } },
					{ name: 'screen.viewed', props: { screen: 'Aldric the Grim' } },
				],
			}),
		).toBeNull();
	});

	it('rejects a fingerprint-grade app version and coarsens a real one', () => {
		expect(parseProductAnalyticsPayload({ ...validPayload, appVersion: '0.3.4-rc.7' })).toBeNull();
		expect(toAnalyticsAppVersion('0.3.4-rc.7')).toBe('0.3');
		expect(toAnalyticsAppVersion('not-a-version')).toBeNull();
	});

	it('rejects a platform outside the two shipped shells', () => {
		expect(parseProductAnalyticsPayload({ ...validPayload, platform: 'android' })).toBeNull();
	});
});
