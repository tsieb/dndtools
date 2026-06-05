import type { MapAsset } from '../state/map-assets';
import type { MapEntity } from '../state/map-state';
import type { SyncOperation } from './operation-log';

/**
 * SYNC-009 — large binary assets sync by CONTENT-ADDRESSED ASSET RECORDS (hash-as-id, reuse MAP-002)
 * plus METADATA OPERATIONS. The operation log carries the asset's metadata + content-hash REFERENCE,
 * NEVER the binary payload itself (Architecture Contract 2, Sync Unit binding rule 6).
 *
 * This module is pure Processing-Core policy. It does NOT move bytes (ADR-014: no blob CDN in the
 * prototype). It provides:
 *
 *   1. {@link operationCarriesBinaryPayload} / {@link assertNoBinaryInOperationLog} — a structural
 *      guard that proves an operation (and a whole op-log) never embeds a binary payload. This is the
 *      assertion seam the tests use to PROVE binary never enters the sync substrate.
 *   2. {@link deriveAssetAvailability} — the computed, content-addressed availability of a map's
 *      referenced assets given which asset BLOBS a device actually has resolved. A referenced asset id
 *      whose blob is absent on this device is `missing`; the GUI renders an asset-missing/degraded
 *      state from this model rather than guessing (SYNC-009 AC2).
 */

/**
 * The largest acceptable byte length for a value embedded in a sync operation. Asset binaries far
 * exceed this; this bound makes "no binary in the op-log" enforceable rather than aspirational. A
 * metadata operation references the content hash and small structural fields, never the bytes.
 */
export const MAX_OPERATION_VALUE_BYTES = 64 * 1024;

/** Why an operation value is considered a binary payload (used in assertion failures + diagnostics). */
export type BinaryPayloadReason =
	| 'binary-buffer' // an ArrayBuffer / typed array (raw bytes) reached the op value
	| 'blob' // a Blob/File-like object reached the op value
	| 'oversized-value'; // the JSON-encoded value exceeds MAX_OPERATION_VALUE_BYTES (asset-shaped)

export interface BinaryPayloadFinding {
	operationId: string;
	opType: string;
	reason: BinaryPayloadReason;
	/** The JSON path within the operation value where the binary-shaped data was found. */
	path: string;
}

function isArrayBufferView(value: unknown): value is ArrayBufferView {
	return ArrayBuffer.isView(value);
}

function isBlobLike(value: unknown): value is { size: number; type: string } {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as { size?: unknown }).size === 'number' &&
		typeof (value as { type?: unknown }).type === 'string' &&
		typeof (value as { arrayBuffer?: unknown }).arrayBuffer === 'function'
	);
}

/**
 * Walk a value looking for binary-shaped data. Returns the first reason + path found, or null when
 * the value is binary-free. Detects raw byte containers (ArrayBuffer / typed arrays) and Blob/File-like
 * objects directly; oversized values are checked separately by the caller against the encoded size.
 */
function findBinaryShape(value: unknown, path: string): { reason: BinaryPayloadReason; path: string } | null {
	if (value === null || value === undefined) return null;
	if (value instanceof ArrayBuffer) return { reason: 'binary-buffer', path };
	if (isArrayBufferView(value)) return { reason: 'binary-buffer', path };
	if (isBlobLike(value)) return { reason: 'blob', path };
	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i += 1) {
			const found = findBinaryShape(value[i], `${path}[${i}]`);
			if (found) return found;
		}
		return null;
	}
	if (typeof value === 'object') {
		for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
			const found = findBinaryShape(entry, path === '' ? key : `${path}.${key}`);
			if (found) return found;
		}
	}
	return null;
}

/**
 * The JSON-encoded byte length of an operation value, or null when it is not encodable (which itself
 * indicates a non-metadata payload). A value that cannot be JSON-encoded (e.g. carries a typed array)
 * is treated as oversized by the caller, because metadata operations are always plain JSON.
 */
function encodedByteLength(value: unknown): number | null {
	try {
		const json = JSON.stringify(value);
		if (json === undefined) return null;
		// Byte length, not char length, so multibyte content is bounded correctly.
		return new TextEncoder().encode(json).length;
	} catch {
		return null;
	}
}

/**
 * Inspect a single operation for an embedded binary payload. Fail-closed: a value that is not plain,
 * bounded JSON metadata is reported. An op with no `value` (a pure structural op) is always clean.
 */
export function operationCarriesBinaryPayload(op: SyncOperation): BinaryPayloadFinding | null {
	if (op.value === undefined) return null;
	const shape = findBinaryShape(op.value, '');
	if (shape) {
		return { operationId: op.id, opType: op.opType, reason: shape.reason, path: shape.path };
	}
	const size = encodedByteLength(op.value);
	if (size === null || size > MAX_OPERATION_VALUE_BYTES) {
		return { operationId: op.id, opType: op.opType, reason: 'oversized-value', path: '' };
	}
	return null;
}

/**
 * Every binary-payload finding across a set of operations. An empty array means the op-log carries no
 * binary — only metadata + content-hash references (SYNC-009 AC1). The sync engine and tests call this
 * to PROVE the binding rule rather than trusting individual call sites.
 */
export function findBinaryPayloadsInOperations(
	operations: readonly SyncOperation[],
): BinaryPayloadFinding[] {
	const findings: BinaryPayloadFinding[] = [];
	for (const op of operations) {
		const finding = operationCarriesBinaryPayload(op);
		if (finding) findings.push(finding);
	}
	return findings;
}

/**
 * Assert that no operation embeds a binary payload. Throws with an actionable message naming the first
 * offending operation. This is the fail-closed guard the asset-import path can call before an op is
 * accepted into the durable log, and the assertion the test suite uses as hard evidence.
 */
export function assertNoBinaryInOperationLog(operations: readonly SyncOperation[]): void {
	const findings = findBinaryPayloadsInOperations(operations);
	if (findings.length > 0) {
		const first = findings[0]!;
		throw new Error(
			`Sync operation ${first.operationId} (${first.opType}) embeds a binary payload (${first.reason}` +
				`${first.path ? ` at ${first.path}` : ''}). Large binary assets must sync as content-addressed ` +
				`asset records plus metadata operations, never embedded bytes.`,
		);
	}
}

/** The resolution state of a single content-addressed asset on this device. */
export type AssetAvailabilityState = 'available' | 'missing';

export interface AssetAvailabilityEntry {
	assetId: string;
	state: AssetAvailabilityState;
	/** True when the asset RECORD (metadata) exists in the synced map state. */
	recordKnown: boolean;
	/** True when the asset BLOB (bytes) has been resolved on this device. */
	blobResolved: boolean;
}

export type MapAssetAvailability = 'available' | 'degraded' | 'unavailable';

export interface MapAssetAvailabilityView {
	mapId: string;
	/** Overall availability: `available` (all blobs present), `degraded` (some missing), `unavailable` (all missing). */
	availability: MapAssetAvailability;
	entries: AssetAvailabilityEntry[];
	missingAssetIds: string[];
	/** Action-oriented message for the asset-missing/degraded UI; null when fully available. */
	message: string | null;
}

function availabilityMessage(
	availability: MapAssetAvailability,
	missingCount: number,
): string | null {
	switch (availability) {
		case 'available':
			return null;
		case 'degraded':
			return `${missingCount} asset${missingCount === 1 ? '' : 's'} ${missingCount === 1 ? 'has' : 'have'} not synced to this device yet. The map opens with the available content; missing imagery will appear once it syncs.`;
		case 'unavailable':
			return 'This map’s imagery has not synced to this device yet. It will appear once the asset finishes syncing.';
	}
}

/**
 * Derive the content-addressed asset availability for a map given the set of asset blob ids actually
 * RESOLVED on this device (SYNC-009 AC2). A map references assets by content hash; if the matching
 * blob has not synced to this device the entry is `missing` and the map opens in a degraded state
 * rather than failing. This is pure: the GUI passes in which blobs the storage adapter resolved and
 * renders the returned model. It NEVER embeds bytes — only ids and availability flags.
 *
 * `resolvedBlobIds` is the set the device storage adapter reports as holding bytes; `assetRecords`
 * carries the synced metadata records (keyed by content hash) so a record can be known while its blob
 * is still missing. Records live in `MapState.assets`; the caller passes that map in.
 */
export function deriveAssetAvailability(
	map: Pick<MapEntity, 'id' | 'assetIds'>,
	assetRecords: Readonly<Record<string, MapAsset>>,
	resolvedBlobIds: ReadonlySet<string>,
): MapAssetAvailabilityView {
	// Dedupe referenced ids while preserving first-seen order for a stable view.
	const referenced: string[] = [];
	const seen = new Set<string>();
	for (const id of map.assetIds) {
		if (!seen.has(id)) {
			seen.add(id);
			referenced.push(id);
		}
	}

	const entries: AssetAvailabilityEntry[] = referenced.map((assetId) => {
		const recordKnown = Boolean(assetRecords[assetId]);
		const blobResolved = resolvedBlobIds.has(assetId);
		return {
			assetId,
			state: blobResolved ? 'available' : 'missing',
			recordKnown,
			blobResolved,
		};
	});

	const missingAssetIds = entries.filter((entry) => entry.state === 'missing').map((entry) => entry.assetId);

	let availability: MapAssetAvailability;
	if (entries.length === 0 || missingAssetIds.length === 0) {
		availability = 'available';
	} else if (missingAssetIds.length === entries.length) {
		availability = 'unavailable';
	} else {
		availability = 'degraded';
	}

	return {
		mapId: map.id,
		availability,
		entries,
		missingAssetIds,
		message: availabilityMessage(availability, missingAssetIds.length),
	};
}
