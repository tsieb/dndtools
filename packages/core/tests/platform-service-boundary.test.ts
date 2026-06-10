import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
	DEFAULT_MAX_PAYLOAD_BYTES,
	PLATFORM_SERVICE_METHODS,
	createPlatformServiceRegistry,
	createStoragePlatformServiceRegistry,
	isPlatformServiceMethod,
	validatePlatformRequest,
} from '../src/index';
import { buildInitialState } from '../src/testing';

describe('PLAT-007: platform-service boundary registry', () => {
	it('only allows registering allowlisted method names', () => {
		expect(() =>
			createPlatformServiceRegistry([
				// @ts-expect-error not an allowlisted method
				{ method: 'storage.dropEverything', requestSchema: z.unknown() },
			]),
		).toThrow(/not in the allowlist/);
	});

	it('rejects duplicate method registration', () => {
		expect(() =>
			createPlatformServiceRegistry([
				{ method: 'storage.resetCoreStorage', requestSchema: z.undefined() },
				{ method: 'storage.resetCoreStorage', requestSchema: z.undefined() },
			]),
		).toThrow(/registered more than once/);
	});

	it('exposes the allowlist enum', () => {
		expect(isPlatformServiceMethod('storage.persistFullState')).toBe(true);
		expect(isPlatformServiceMethod('storage.evil')).toBe(false);
		expect(PLATFORM_SERVICE_METHODS).toContain('storage.loadCoreState');
	});
});

describe('PLAT-007 AC1: unknown methods and malformed payloads fail closed', () => {
	const registry = createStoragePlatformServiceRegistry();

	it('rejects an unregistered method before any handler runs', () => {
		const result = validatePlatformRequest(registry, 'storage.unknownMethod', {});
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('expected rejection');
		expect(result.error.code).toBe('unknown-method');
	});

	it('rejects a structurally invalid persistFullState payload', () => {
		const result = validatePlatformRequest(registry, 'storage.persistFullState', {
			previous: { scenes: { schemaVersion: 1 } }, // missing required documents
			next: 42,
		});
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('expected rejection');
		expect(result.error.code).toBe('invalid-payload');
		expect(result.error.issues?.length ?? 0).toBeGreaterThan(0);
	});

	it('rejects an unexpected payload on a no-argument method', () => {
		const result = validatePlatformRequest(registry, 'storage.loadCoreState', { sneaky: true });
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('expected rejection');
		expect(result.error.code).toBe('invalid-payload');
	});

	it('accepts a well-formed persistFullState payload from real core state', () => {
		const previous = buildInitialState();
		const next = buildInitialState();
		const result = validatePlatformRequest(registry, 'storage.persistFullState', {
			previous,
			next,
		});
		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error(result.error.message);
		expect(result.method).toBe('storage.persistFullState');
	});
});

describe('PLAT-007 AC2: oversized payloads are rejected before business logic', () => {
	it('rejects a payload larger than the configured method limit', () => {
		const registry = createPlatformServiceRegistry([
			{
				method: 'storage.persistFullState',
				requestSchema: z.object({ blob: z.string() }).strict(),
				maxPayloadBytes: 64,
			},
		]);
		const result = validatePlatformRequest(registry, 'storage.persistFullState', {
			blob: 'x'.repeat(1000),
		});
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('expected rejection');
		expect(result.error.code).toBe('payload-too-large');
		expect(result.error.sizeBytes).toBeGreaterThan(result.error.limitBytes ?? 0);
	});

	it('measures multi-byte UTF-8 content against the byte limit', () => {
		const registry = createPlatformServiceRegistry([
			{
				method: 'storage.persistFullState',
				requestSchema: z.object({ blob: z.string() }).strict(),
				maxPayloadBytes: 20,
			},
		]);
		// Each "𝕏" is 4 UTF-8 bytes; 10 of them plus JSON quotes exceed 20 bytes.
		const result = validatePlatformRequest(registry, 'storage.persistFullState', {
			blob: '𝕏'.repeat(10),
		});
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('expected rejection');
		expect(result.error.code).toBe('payload-too-large');
	});

	it('size check runs before schema validation (oversized invalid payload reports size)', () => {
		const registry = createPlatformServiceRegistry([
			{
				method: 'storage.persistFullState',
				requestSchema: z.object({ blob: z.number() }).strict(), // would also fail schema
				maxPayloadBytes: 16,
			},
		]);
		const result = validatePlatformRequest(registry, 'storage.persistFullState', {
			blob: 'x'.repeat(1000),
		});
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('expected rejection');
		expect(result.error.code).toBe('payload-too-large');
	});

	it('rejects a non-serializable payload', () => {
		const registry = createStoragePlatformServiceRegistry();
		const circular: Record<string, unknown> = {};
		circular.self = circular;
		const result = validatePlatformRequest(registry, 'storage.persistFullState', circular);
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('expected rejection');
		expect(result.error.code).toBe('payload-not-serializable');
	});

	it('exposes a sane default payload size budget', () => {
		expect(DEFAULT_MAX_PAYLOAD_BYTES).toBeGreaterThan(0);
	});
});
