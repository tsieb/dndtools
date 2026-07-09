import {
	MAX_ASSET_BLOB_BYTES,
	assetId,
	createStoragePlatformServiceRegistry,
	hashAssetBytes,
	validatePlatformRequest,
	type PlatformServiceRegistry,
} from '@dndtools/core';
import { PlatformBoundaryRejectionError, assetBlobsTable, type AssetBlobRecord } from './coreStore';

/**
 * Content-addressed asset-byte store (ADR-014 amendment).
 *
 * Stores the raw bytes behind the asset METADATA the Processing Core already tracks in
 * `maps.assets` / `audio.assets`. The blob id is the same content hash the core computes
 * (`assetId(hashAssetBytes(bytes))`), so metadata and bytes can never disagree and identical
 * bytes dedupe to a single record. Bytes never enter core state or the operation log
 * (Contract 2); domain commands validate size/MIME per-domain BEFORE bytes reach this store,
 * and this store enforces the outer `MAX_ASSET_BLOB_BYTES` bound fail-closed.
 *
 * Boundary posture (PLAT-007): each write/read validates a small `{id, mime, byteLength}`
 * descriptor through the platform-service registry — the buffer itself is checked against the
 * descriptor's byteLength directly, because multi-megabyte binaries do not cross the JSON
 * boundary.
 */

const registry: PlatformServiceRegistry = createStoragePlatformServiceRegistry();

function boundaryCheck(method: string, payload: unknown): void {
	const validated = validatePlatformRequest(registry, method, payload);
	if (!validated.ok) {
		throw new PlatformBoundaryRejectionError(
			validated.error.code,
			validated.error.method,
			validated.error.message,
		);
	}
}

/** Soft-capacity warning threshold against navigator.storage.estimate(). */
const NEAR_CAPACITY_RATIO = 0.8;

export interface AssetStorageEstimate {
	usageBytes: number | null;
	quotaBytes: number | null;
	/** True when usage exceeds NEAR_CAPACITY_RATIO of quota (both known). */
	nearCapacity: boolean;
}

/** Structured, user-presentable failure for a rejected byte import. */
export class AssetByteLimitError extends Error {
	readonly byteLength: number;
	readonly limitBytes: number;
	constructor(byteLength: number, limitBytes: number, message: string) {
		super(message);
		this.name = 'AssetByteLimitError';
		this.byteLength = byteLength;
		this.limitBytes = limitBytes;
	}
}

export async function storageEstimate(): Promise<AssetStorageEstimate> {
	try {
		if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
			const { usage, quota } = await navigator.storage.estimate();
			const usageBytes = typeof usage === 'number' ? usage : null;
			const quotaBytes = typeof quota === 'number' ? quota : null;
			return {
				usageBytes,
				quotaBytes,
				nearCapacity:
					usageBytes !== null && quotaBytes !== null && quotaBytes > 0
						? usageBytes / quotaBytes > NEAR_CAPACITY_RATIO
						: false,
			};
		}
	} catch {
		// Estimation is advisory; fall through to unknown.
	}
	return { usageBytes: null, quotaBytes: null, nearCapacity: false };
}

/**
 * Ask the browser to exempt this origin's storage from eviction. Advisory: a denial is not an
 * error (the app already renders honest missing-bytes states if blobs are evicted).
 */
export async function requestPersistentStorage(): Promise<boolean> {
	try {
		if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
			return await navigator.storage.persist();
		}
	} catch {
		// fall through
	}
	return false;
}

/**
 * Store bytes and return their content-addressed id. Identical bytes are a no-op returning the
 * same id. Rejects fail-closed when the buffer exceeds the outer blob limit or would not fit in
 * the remaining origin quota.
 */
export async function putAssetBytes(bytes: Uint8Array, mime: string): Promise<string> {
	if (bytes.byteLength === 0 || bytes.byteLength > MAX_ASSET_BLOB_BYTES) {
		throw new AssetByteLimitError(
			bytes.byteLength,
			MAX_ASSET_BLOB_BYTES,
			`Asset of ${bytes.byteLength} bytes exceeds the ${MAX_ASSET_BLOB_BYTES} byte store limit.`,
		);
	}
	const id = assetId(hashAssetBytes(bytes));
	boundaryCheck('storage.putAssetBytes', { id, mime, byteLength: bytes.byteLength });
	const table = assetBlobsTable();
	const existing = await table.get(id);
	if (existing) return id; // content-addressed dedupe: same bytes, same record
	const estimate = await storageEstimate();
	if (
		estimate.usageBytes !== null &&
		estimate.quotaBytes !== null &&
		estimate.usageBytes + bytes.byteLength > estimate.quotaBytes
	) {
		throw new AssetByteLimitError(
			bytes.byteLength,
			Math.max(0, estimate.quotaBytes - estimate.usageBytes),
			'Not enough storage space remains on this device for this asset.',
		);
	}
	// Copy into a standalone ArrayBuffer so a caller-retained view (or a SharedArrayBuffer
	// backing) can never alias the stored record.
	const copy = bytes.slice().buffer;
	const record: AssetBlobRecord = {
		id,
		bytes: copy,
		mime,
		byteLength: bytes.byteLength,
		createdAt: new Date().toISOString(),
	};
	await table.put(record);
	return id;
}

/** Resolve stored bytes as a typed Blob, or null when the bytes are absent (honest miss). */
export async function getAssetBytes(id: string): Promise<Blob | null> {
	boundaryCheck('storage.getAssetBytes', { id });
	const record = await assetBlobsTable().get(id);
	if (!record) return null;
	return new Blob([record.bytes], { type: record.mime });
}

export async function hasAssetBytes(id: string): Promise<boolean> {
	boundaryCheck('storage.getAssetBytes', { id });
	return (await assetBlobsTable().where('id').equals(id).count()) > 0;
}

export async function deleteAssetBytes(id: string): Promise<void> {
	boundaryCheck('storage.deleteAssetBytes', { id });
	await assetBlobsTable().delete(id);
}

export interface AssetUsage {
	count: number;
	totalBytes: number;
}

export async function assetUsage(): Promise<AssetUsage> {
	const records = await assetBlobsTable().toArray();
	return {
		count: records.length,
		totalBytes: records.reduce((sum, r) => sum + r.byteLength, 0),
	};
}

/** Full enumeration for whole-vault backup export. Bytes are copies, safe to transfer. */
export async function listAssetBytes(): Promise<
	Array<{ id: string; mime: string; bytes: ArrayBuffer }>
> {
	const records = await assetBlobsTable().toArray();
	return records.map((r) => ({ id: r.id, mime: r.mime, bytes: r.bytes }));
}

export interface GarbageCollectionResult {
	removed: number;
	freedBytes: number;
}

/**
 * Remove blobs no longer referenced by any asset metadata. Callers pass the union of ids from
 * `maps.assets` and `audio.assets` (and any future byte-bearing domain). Runs after deletions,
 * imports, and restores — never during them.
 */
export async function collectGarbage(referencedIds: Set<string>): Promise<GarbageCollectionResult> {
	const table = assetBlobsTable();
	const records = await table.toArray();
	const orphans = records.filter((r) => !referencedIds.has(r.id));
	if (orphans.length === 0) return { removed: 0, freedBytes: 0 };
	await table.bulkDelete(orphans.map((r) => r.id));
	return {
		removed: orphans.length,
		freedBytes: orphans.reduce((sum, r) => sum + r.byteLength, 0),
	};
}
