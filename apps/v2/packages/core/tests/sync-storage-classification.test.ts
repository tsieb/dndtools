import { describe, expect, it } from 'vitest';
import {
	CLOUD_SYNCABLE_CATEGORIES,
	DEVICE_LOCAL_CATEGORIES,
	FAIL_CLOSED_CLASSIFICATION,
	STORAGE_CLASSIFICATION_REGISTRY,
	assertCloudPayloadIsClean,
	classifyStorageCategory,
	declaredClassification,
	eligibleCloudCategories,
	findCloudPayloadLeaks,
	isCloudEligible,
	isKnownStorageCategory,
	partitionStorageRecords,
	type CloudPayloadRecord,
	type StorageDataCategory,
} from '../src';

/**
 * SYNC-007 + SYNC-008 — the typed, FAIL-CLOSED data-classification registry. These tests prove the
 * three hard invariants: device-local-is-never-cloud, unknown ⇒ device-local, and cloud-disabled ⇒
 * nothing eligible for cloud, plus the cloud-payload leak guard (no raw paths / auth tokens).
 */

const ALL_KNOWN_CATEGORIES = Object.keys(STORAGE_CLASSIFICATION_REGISTRY) as StorageDataCategory[];

describe('SYNC-007/008 storage classification registry shape', () => {
	it('partitions every known category into cloud-syncable or device-local with no overlap', () => {
		const cloud = new Set(CLOUD_SYNCABLE_CATEGORIES);
		const local = new Set(DEVICE_LOCAL_CATEGORIES);
		expect(cloud.size + local.size).toBe(ALL_KNOWN_CATEGORIES.length);
		for (const category of ALL_KNOWN_CATEGORIES) {
			// Exactly one of the two sets contains each category.
			expect(cloud.has(category) !== local.has(category)).toBe(true);
		}
	});

	it('classifies the Contract 2 cloud-storage categories as cloud-syncable', () => {
		const expectedCloud: StorageDataCategory[] = [
			'cloud-vault-identity',
			'durable-operation-log',
			'compacted-snapshot',
			'collaboration-session-state',
			'permission-metadata',
			'asset-blob',
			'conflict-record',
		];
		for (const category of expectedCloud) {
			expect(declaredClassification(category)).toBe('cloud-syncable');
		}
	});

	it('classifies the Contract 2 device-local categories as device-local', () => {
		const expectedLocal: StorageDataCategory[] = [
			'auth-refresh-token',
			'os-credential-record',
			'raw-absolute-path',
			'rebuildable-index',
			'presence-state',
			'local-diagnostics',
			'temporary-ui-state',
			'device-platform-preference',
			'local-mcp-process-state',
			'imported-file-staging',
		];
		for (const category of expectedLocal) {
			expect(declaredClassification(category)).toBe('device-local');
		}
	});
});

describe('SYNC-008 invariant: device-local is NEVER classified cloud-syncable', () => {
	it('every device-local category stays device-local for both enablement states', () => {
		for (const category of DEVICE_LOCAL_CATEGORIES) {
			expect(classifyStorageCategory(category, false)).toBe('device-local');
			// The crux: even when cloud sync is ENABLED, a device-local category is never cloud.
			expect(classifyStorageCategory(category, true)).toBe('device-local');
			expect(isCloudEligible(category, true)).toBe(false);
		}
	});

	it('auth refresh tokens and raw absolute paths are never cloud-eligible', () => {
		expect(isCloudEligible('auth-refresh-token', true)).toBe(false);
		expect(isCloudEligible('raw-absolute-path', true)).toBe(false);
		expect(isCloudEligible('os-credential-record', true)).toBe(false);
	});
});

describe('SYNC-007/008 fail-closed: unknown category defaults to device-local', () => {
	it('an unrecognized category is never cloud, even when cloud sync is enabled', () => {
		const unknown = 'some-future-unclassified-category' as StorageDataCategory;
		expect(isKnownStorageCategory(unknown)).toBe(false);
		expect(declaredClassification(unknown)).toBe(FAIL_CLOSED_CLASSIFICATION);
		expect(declaredClassification(unknown)).toBe('device-local');
		expect(classifyStorageCategory(unknown, true)).toBe('device-local');
		expect(classifyStorageCategory(unknown, false)).toBe('device-local');
		expect(isCloudEligible(unknown, true)).toBe(false);
	});

	it('an empty-string category fails closed to device-local', () => {
		expect(classifyStorageCategory('' as StorageDataCategory, true)).toBe('device-local');
	});
});

describe('SYNC-007 AC1: cloud-disabled ⇒ nothing eligible for cloud', () => {
	it('every category — including cloud-syncable ones — is device-local when cloud sync is disabled', () => {
		for (const category of ALL_KNOWN_CATEGORIES) {
			expect(classifyStorageCategory(category, false)).toBe('device-local');
			expect(isCloudEligible(category, false)).toBe(false);
		}
	});

	it('the eligible cloud set is empty when cloud sync is disabled', () => {
		expect(eligibleCloudCategories(false)).toEqual([]);
	});

	it('the eligible cloud set is exactly the declared cloud-syncable categories when enabled', () => {
		expect(new Set(eligibleCloudCategories(true))).toEqual(new Set(CLOUD_SYNCABLE_CATEGORIES));
	});

	it('partitioning a batch yields no cloud records when cloud sync is disabled', () => {
		const records = [
			{ id: 'r1', category: 'durable-operation-log' as StorageDataCategory },
			{ id: 'r2', category: 'asset-blob' as StorageDataCategory },
			{ id: 'r3', category: 'auth-refresh-token' as StorageDataCategory },
		];
		const plan = partitionStorageRecords(records, false);
		expect(plan.cloudSyncable).toEqual([]);
		expect(plan.deviceLocal).toHaveLength(3);
	});
});

describe('SYNC-007/008 partition routing (enabled)', () => {
	it('routes cloud-syncable records to cloud and device-local + unknown records to device-local', () => {
		const records = [
			{ id: 'op-1', category: 'durable-operation-log' as StorageDataCategory },
			{ id: 'snap-1', category: 'compacted-snapshot' as StorageDataCategory },
			{ id: 'token-1', category: 'auth-refresh-token' as StorageDataCategory },
			{ id: 'ui-1', category: 'temporary-ui-state' as StorageDataCategory },
			{ id: 'x-1', category: 'mystery-category' as StorageDataCategory },
		];
		const plan = partitionStorageRecords(records, true);
		expect(plan.cloudSyncable.map((r) => r.id)).toEqual(['op-1', 'snap-1']);
		expect(plan.deviceLocal.map((r) => r.id).sort()).toEqual(['token-1', 'ui-1', 'x-1']);
		// The unknown category is reported AND fails closed into device-local.
		expect(plan.unknownCategoryIds).toEqual(['x-1']);
	});
});

describe('SYNC-008 AC1: a generated cloud payload carries no device-local data, paths, or tokens', () => {
	it('flags a device-local record that appears in a cloud payload', () => {
		const payload: CloudPayloadRecord[] = [
			{ id: 'op-1', category: 'durable-operation-log', value: { opType: 'scene.create' } },
			{ id: 'tok-1', category: 'auth-refresh-token', value: { token: 'xyz' } },
		];
		const findings = findCloudPayloadLeaks(payload, true);
		expect(findings).toHaveLength(1);
		expect(findings[0]).toMatchObject({ recordId: 'tok-1', reason: 'device-local-category' });
		expect(() => assertCloudPayloadIsClean(payload, true)).toThrow(/must not leave the device/i);
	});

	it('flags a cloud-syncable record whose value still contains a raw absolute path', () => {
		const payload: CloudPayloadRecord[] = [
			{
				id: 'meta-1',
				category: 'cloud-vault-identity',
				// A leaked absolute path on an otherwise cloud-syncable record.
				value: { vaultRoot: '/Users/dm/Documents/my-vault' },
			},
		];
		const findings = findCloudPayloadLeaks(payload, true);
		expect(findings).toHaveLength(1);
		expect(findings[0]).toMatchObject({ recordId: 'meta-1', reason: 'sensitive-data' });
		expect(() => assertCloudPayloadIsClean(payload, true)).toThrow();
	});

	it('flags a cloud-syncable record whose value contains an auth-token-shaped secret', () => {
		const payload: CloudPayloadRecord[] = [
			{
				id: 'sess-1',
				category: 'collaboration-session-state',
				value: { authorization: 'Bearer abc.def.ghi' },
			},
		];
		expect(() => assertCloudPayloadIsClean(payload, true)).toThrow();
	});

	it('accepts a clean cloud-syncable payload with only structural metadata', () => {
		const payload: CloudPayloadRecord[] = [
			{ id: 'op-1', category: 'durable-operation-log', value: { opType: 'scene.create', revision: 3 } },
			{ id: 'conf-1', category: 'conflict-record', value: { reason: 'same-scalar-path', resolved: false } },
			{ id: 'perm-1', category: 'permission-metadata', value: { capabilitySet: 'viewer' } },
		];
		expect(findCloudPayloadLeaks(payload, true)).toEqual([]);
		expect(() => assertCloudPayloadIsClean(payload, true)).not.toThrow();
	});

	it('fails closed for ANY payload when cloud sync is disabled (no record is cloud-eligible)', () => {
		const payload: CloudPayloadRecord[] = [
			{ id: 'op-1', category: 'durable-operation-log', value: { opType: 'scene.create' } },
		];
		// With cloud sync disabled, even a clean cloud-syncable record is not eligible ⇒ leak finding.
		const findings = findCloudPayloadLeaks(payload, false);
		expect(findings).toHaveLength(1);
		expect(findings[0]).toMatchObject({ recordId: 'op-1', reason: 'device-local-category' });
		expect(() => assertCloudPayloadIsClean(payload, false)).toThrow();
	});
});
