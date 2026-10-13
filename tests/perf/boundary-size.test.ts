import { describe, expect, it } from 'vitest';
import {
	DEFAULT_MAX_PAYLOAD_BYTES,
	validatePlatformRequest,
} from '../../packages/core/src/platform/service-boundary';
import { createStoragePlatformServiceRegistry } from '../../packages/core/src/schemas/platform-service';
import { buildInitialState } from '../../packages/core/src/testing';

// RC-ENG-3.2 review: an earlier candidate remembered each measured object's size by identity across
// boundary calls. Boundary input is mutable, so a reused nested object that grew or gained a cycle
// after one accepted commit slipped through the next. Every call must measure what it is given.
describe('platform boundary size check across commits', () => {
	const registry = createStoragePlatformServiceRegistry();

	it('rejects an oversized payload that reuses a previously accepted nested object', () => {
		const next = buildInitialState();
		expect(
			validatePlatformRequest(registry, 'storage.persistFullState', { next, appended: [] }).ok,
		).toBe(true);
		Object.assign(next.content, { body: 'x'.repeat(DEFAULT_MAX_PAYLOAD_BYTES) });
		const payload = { next: { ...next }, appended: [] };
		expect(new TextEncoder().encode(JSON.stringify(payload)).length).toBeGreaterThan(
			DEFAULT_MAX_PAYLOAD_BYTES,
		);
		const result = validatePlatformRequest(registry, 'storage.persistFullState', payload);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe('payload-too-large');
	});

	it('rejects a cycle introduced into a previously accepted nested object', () => {
		const next = buildInitialState();
		expect(
			validatePlatformRequest(registry, 'storage.persistFullState', { next, appended: [] }).ok,
		).toBe(true);
		Object.assign(next.content, { self: next.content });
		const result = validatePlatformRequest(registry, 'storage.persistFullState', {
			next: { ...next },
			appended: [],
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe('payload-not-serializable');
	});
});
