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

/**
 * Full enumeration for whole-vault backup export. Bytes are copies, safe to transfer.
 *
 * EMBEDDING records are excluded: they are a derived, rebuildable cache keyed to this device's
 * embedding model, so shipping them in a backup would bloat the archive with bytes the restoring
 * device would rather recompute than trust.
 */
export async function listAssetBytes(): Promise<
	Array<{ id: string; mime: string; bytes: ArrayBuffer }>
> {
	const records = await assetBlobsTable().toArray();
	return records
		.filter((r) => !isEmbeddingRecordId(r.id))
		.map((r) => ({ id: r.id, mime: r.mime, bytes: r.bytes }));
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
	// EMBEDDING records are never referenced by asset METADATA — they are addressed by content
	// revision, not by a `maps.assets`/`audio.assets` entry — so this sweep would delete every one of
	// them on sight. They have their own revision-driven sweep in `pruneEmbeddingVectors`.
	const orphans = records.filter((r) => !isEmbeddingRecordId(r.id) && !referencedIds.has(r.id));
	if (orphans.length === 0) return { removed: 0, freedBytes: 0 };
	await table.bulkDelete(orphans.map((r) => r.id));
	return {
		removed: orphans.length,
		freedBytes: orphans.reduce((sum, r) => sum + r.byteLength, 0),
	};
}

// ---------------------------------------------------------------------------------------------------
// RC-AI-3.2 — EMBEDDING VECTOR CACHE. Appended block; nothing above is reordered.
// ---------------------------------------------------------------------------------------------------

/**
 * The float32 embedding cache lives in the SAME content-addressed blob table as image/audio bytes, but
 * it is addressed differently and on purpose: an image's id is the hash of its BYTES, while an
 * embedding's id is the hash of the thing it DESCRIBES — the corpus document's key (type, id and
 * REVISION) plus the model that produced it. That is what makes the cache correct: edit a note and its
 * key changes, so the stale vector is simply never looked up again; switch embedding models and the two
 * models' vectors coexist instead of overwriting each other.
 *
 * The `embedding:` prefix keeps these records out of the two sweeps that assume "a blob is referenced
 * by asset metadata": backup enumeration and `collectGarbage`.
 */
const EMBEDDING_ID_PREFIX = 'embedding:';

/** The MIME recorded for a cached vector: little-endian float32, this device's byte order. */
export const EMBEDDING_VECTOR_MIME = 'application/vnd.lamplight.embedding+f32';

function isEmbeddingRecordId(id: string): boolean {
	return id.startsWith(EMBEDDING_ID_PREFIX);
}

/**
 * The content address of one cached vector. `cacheKey` is the core corpus document key
 * (`buildSearchCorpusForActor` → `SearchCorpusDocument.key`) and `model` the embedding model id, so
 * the same note at the same revision embedded by the same model always resolves to the same record.
 */
export function embeddingRecordId(cacheKey: string, model: string): string {
	const material = new TextEncoder().encode(`${model}\u0000${cacheKey}`);
	return `${EMBEDDING_ID_PREFIX}${assetId(hashAssetBytes(material))}`;
}

/** Store one document's embedding. Re-storing the same key/model overwrites in place. */
export async function putEmbeddingVector(
	cacheKey: string,
	model: string,
	vector: Float32Array,
): Promise<string> {
	if (vector.length === 0) {
		throw new AssetByteLimitError(0, MAX_ASSET_BLOB_BYTES, 'An embedding vector cannot be empty.');
	}
	const byteLength = vector.byteLength;
	if (byteLength > MAX_ASSET_BLOB_BYTES) {
		throw new AssetByteLimitError(
			byteLength,
			MAX_ASSET_BLOB_BYTES,
			`Embedding of ${byteLength} bytes exceeds the ${MAX_ASSET_BLOB_BYTES} byte store limit.`,
		);
	}
	const id = embeddingRecordId(cacheKey, model);
	boundaryCheck('storage.putAssetBytes', { id, mime: EMBEDDING_VECTOR_MIME, byteLength });
	// Copy into a standalone buffer so a caller-retained view can never alias the stored record.
	const record: AssetBlobRecord = {
		id,
		bytes: vector.slice().buffer,
		mime: EMBEDDING_VECTOR_MIME,
		byteLength,
		createdAt: new Date().toISOString(),
	};
	await assetBlobsTable().put(record);
	return id;
}

/** Read one cached vector back, or null when it was never embedded (or the note has since changed). */
export async function getEmbeddingVector(
	cacheKey: string,
	model: string,
): Promise<Float32Array | null> {
	const id = embeddingRecordId(cacheKey, model);
	boundaryCheck('storage.getAssetBytes', { id });
	const record = await assetBlobsTable().get(id);
	if (!record || record.mime !== EMBEDDING_VECTOR_MIME) return null;
	return new Float32Array(record.bytes);
}

/**
 * Load every cached vector for a set of corpus keys in one pass. Missing keys are simply absent from
 * the returned map — the ranker scores those documents on their lexical half alone.
 */
export async function loadEmbeddingVectors(
	cacheKeys: readonly string[],
	model: string,
): Promise<Map<string, Float32Array>> {
	const ids = cacheKeys.map((key) => embeddingRecordId(key, model));
	const records = await assetBlobsTable().bulkGet(ids);
	const vectors = new Map<string, Float32Array>();
	records.forEach((record, index) => {
		if (!record || record.mime !== EMBEDDING_VECTOR_MIME) return;
		const key = cacheKeys[index];
		if (key === undefined) return;
		vectors.set(key, new Float32Array(record.bytes));
	});
	return vectors;
}

/**
 * Drop cached vectors that no longer describe anything: everything whose id is not the address of one
 * of `liveCacheKeys` under `model`. Editing a note therefore reclaims its previous revision's vector
 * on the next sweep, and vectors from a model no longer in use are reclaimed wholesale.
 */
export async function pruneEmbeddingVectors(
	liveCacheKeys: readonly string[],
	model: string,
): Promise<GarbageCollectionResult> {
	const keep = new Set(liveCacheKeys.map((key) => embeddingRecordId(key, model)));
	const table = assetBlobsTable();
	const records = await table.toArray();
	const stale = records.filter((r) => isEmbeddingRecordId(r.id) && !keep.has(r.id));
	if (stale.length === 0) return { removed: 0, freedBytes: 0 };
	await table.bulkDelete(stale.map((r) => r.id));
	return {
		removed: stale.length,
		freedBytes: stale.reduce((sum, r) => sum + r.byteLength, 0),
	};
}

/** How much of the blob store the embedding cache is using (for the Settings storage readout). */
export async function embeddingCacheUsage(): Promise<AssetUsage> {
	const records = await assetBlobsTable().toArray();
	const embeddings = records.filter((r) => isEmbeddingRecordId(r.id));
	return {
		count: embeddings.length,
		totalBytes: embeddings.reduce((sum, r) => sum + r.byteLength, 0),
	};
}
