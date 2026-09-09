// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./config', () => ({
	cloudConfig: { appApiUrl: 'https://api.example.test/v1' },
	isAccountApiConfigured: true,
}));
vi.mock('../platform/capabilities', () => ({ platformCapabilities: { runtimeKind: 'web' } }));

import {
	TELEMETRY_CONSENT_KEY,
	flushTelemetry,
	isTelemetryConfigured,
	pendingTelemetryEvents,
	recordTelemetryEvent,
	resetTelemetryQueueForTests,
	setTelemetryConsent,
	storedTelemetryConsent,
	telemetryConsent,
	telemetryEnabled,
	telemetryIngestUrl,
} from './telemetry';

// RC-CLD-1.4 acceptance: ZERO events without consent. The assertion that carries the criterion is
// `fetch` never being called — not "an empty payload was sent".
const fetchMock = vi.fn();

beforeEach(() => {
	window.localStorage.clear();
	resetTelemetryQueueForTests();
	fetchMock.mockReset();
	fetchMock.mockResolvedValue({ ok: true });
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('RC-CLD-1.4 zero events without consent', () => {
	it('sends nothing at all when no consent was ever recorded', async () => {
		expect(storedTelemetryConsent()).toBeNull();
		expect(telemetryConsent()).toBe('denied');
		expect(telemetryEnabled()).toBe(false);

		expect(recordTelemetryEvent('app.launched', { platform: 'web' })).toBe(false);
		expect(recordTelemetryEvent('screen.viewed', { screen: 'session' })).toBe(false);
		expect(pendingTelemetryEvents()).toEqual([]);
		await expect(flushTelemetry()).resolves.toBe(false);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('sends nothing when consent is explicitly denied', async () => {
		setTelemetryConsent('denied');
		expect(recordTelemetryEvent('feature.used', { feature: 'dice-roll' })).toBe(false);
		await expect(flushTelemetry()).resolves.toBe(false);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('treats a tampered consent value as denied', async () => {
		window.localStorage.setItem(TELEMETRY_CONSENT_KEY, 'yes-please');
		expect(telemetryConsent()).toBe('denied');
		expect(recordTelemetryEvent('screen.viewed', { screen: 'home' })).toBe(false);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('drops an already-queued batch when consent is withdrawn before the flush', async () => {
		setTelemetryConsent('granted');
		expect(recordTelemetryEvent('screen.viewed', { screen: 'board' })).toBe(true);
		expect(pendingTelemetryEvents()).toHaveLength(1);

		setTelemetryConsent('denied');
		expect(pendingTelemetryEvents()).toEqual([]);
		await expect(flushTelemetry()).resolves.toBe(false);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe('RC-CLD-1.4 with consent granted', () => {
	beforeEach(() => setTelemetryConsent('granted'));

	it('queues a declared event and posts an identity-free batch', async () => {
		expect(recordTelemetryEvent('screen.viewed', { screen: 'session' })).toBe(true);
		await expect(flushTelemetry()).resolves.toBe(true);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('https://api.example.test/v1/telemetry');
		expect(init.credentials).toBe('omit');
		expect(init.headers).toEqual({ 'Content-Type': 'text/plain;charset=UTF-8' });

		const body = JSON.parse(String(init.body)) as Record<string, unknown>;
		expect(Object.keys(body).sort()).toEqual(['appVersion', 'events', 'platform', 'version']);
		expect(body.events).toEqual([{ name: 'screen.viewed', props: { screen: 'session' } }]);
		expect(String(body.appVersion)).toMatch(/^\d+\.\d+$/);
	});

	it('refuses an off-taxonomy event rather than sanitising it', async () => {
		// @ts-expect-error — the taxonomy is typed; this is the runtime guard for untyped callers.
		expect(recordTelemetryEvent('note.opened', { title: 'The Sunless Citadel' })).toBe(false);
		// @ts-expect-error — a declared event with a value outside its enum.
		expect(recordTelemetryEvent('screen.viewed', { screen: 'Aldric the Grim' })).toBe(false);
		expect(pendingTelemetryEvents()).toEqual([]);
		await expect(flushTelemetry()).resolves.toBe(false);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('never surfaces a transport failure', async () => {
		fetchMock.mockRejectedValue(new Error('offline'));
		expect(recordTelemetryEvent('feature.used', { feature: 'export' })).toBe(true);
		await expect(flushTelemetry()).resolves.toBe(false);
	});

	it('exposes the ingestion route only where the build is configured', () => {
		expect(isTelemetryConfigured()).toBe(true);
		expect(telemetryIngestUrl()).toBe('https://api.example.test/v1/telemetry');
	});
});
