/**
 * MAP-002 — content-addressed map asset model.
 *
 * A map asset is an imported image or SVG that a map entity references. Its id is a HASH of its
 * bytes (content-addressed storage): identical bytes always produce the same id, so importing the
 * same file twice deduplicates to a single asset, and the id is itself the integrity check — a
 * stored payload can be re-hashed and compared to detect corruption (Contract 2: "Large binary
 * assets are synced by content-addressed asset records plus metadata operations").
 *
 * Per ADR-014 the first prototype does not build a real blob CDN: the deliverable is the hash +
 * metadata + content-addressed reference. Bytes are modeled as a `Uint8Array` the GUI reads from a
 * `File`; the Processing Core only ever sees the bytes to hash them and record metadata. This module
 * is PURE and DETERMINISTIC (no DOM, no `crypto.subtle`, no ambient state) so the same bytes hash to
 * the same id on every device and in a Node test environment.
 */

export const MAP_ASSET_SCHEMA_VERSION = 1 as const;

/**
 * The natively-supported asset kinds. Anything outside this set is an EXTERNAL scene format that
 * requires a declared adapter before import (MAP-002). Kept narrow on purpose: a raster image or an
 * SVG vector is all the renderer needs without a format adapter.
 */
export type MapAssetKind = 'image' | 'svg';

/** The natively-supported MIME types, mapped to their asset kind. */
export const NATIVE_ASSET_MIME_TYPES: Readonly<Record<string, MapAssetKind>> = Object.freeze({
	'image/png': 'image',
	'image/jpeg': 'image',
	'image/webp': 'image',
	'image/gif': 'image',
	'image/svg+xml': 'svg',
});

/**
 * Default maximum imported asset size in bytes. Imports larger than this are rejected with an
 * actionable diagnostic BEFORE any storage mutation (MAP-002 AC2). The default protects the local
 * prototype's IndexedDB store; a caller can lower it but the import path always enforces some bound.
 */
export const DEFAULT_MAX_ASSET_BYTES = 8 * 1024 * 1024;

/**
 * Pixel dimensions of a raster image asset. SVG assets are vector and may omit intrinsic pixel
 * dimensions, so this is optional on the asset record.
 */
export interface MapAssetDimensions {
	width: number;
	height: number;
}

/**
 * A content-addressed map asset record. `id` IS the content hash (the integrity check); `byteLength`
 * and `checksum` let a reader re-verify the payload, and `source` records provenance for auditing.
 * The record carries metadata only — the bytes themselves live behind a content-addressed reference
 * the storage adapter resolves (ADR-014: no blob CDN in the prototype).
 */
export interface MapAsset {
	/** Content hash of the bytes, prefixed with the algorithm tag (e.g. `fnv1a64-…`). The asset id. */
	id: string;
	kind: MapAssetKind;
	mimeType: string;
	/** Original filename, for the DM-facing asset list. Provenance only; never a storage path. */
	fileName: string;
	byteLength: number;
	/** Same hash as `id` but without the algorithm prefix — the bare integrity checksum. */
	checksum: string;
	/** Intrinsic pixel dimensions for raster images; null for vector SVG or when unknown. */
	dimensions: MapAssetDimensions | null;
	/** Provenance: where the bytes came from (an import) and when. Never a filesystem path. */
	source: {
		origin: 'import';
		importedAt: string;
		importedBy: string;
	};
	schemaVersion: typeof MAP_ASSET_SCHEMA_VERSION;
}

/**
 * Deterministic 64-bit FNV-1a hash of the bytes, returned as a 16-char lowercase hex string. FNV-1a
 * is used (not `crypto.subtle`) because it is synchronous, dependency-free, and runs identically in
 * the browser and in a pure Node test environment — the determinism the content-address contract
 * requires. Two 32-bit FNV-1a lanes are combined for a 64-bit digest, which is ample collision
 * resistance for a single-vault prototype asset store while staying a pure integer computation.
 */
export function hashAssetBytes(bytes: Uint8Array): string {
	// FNV-1a 32-bit constants.
	const PRIME = 0x01000193;
	let hashA = 0x811c9dc5; // offset basis
	let hashB = 0x811c9dc5 ^ 0x9e3779b9; // second lane seeded differently to decorrelate the lanes
	for (let i = 0; i < bytes.length; i += 1) {
		const byte = bytes[i]!;
		hashA = Math.imul(hashA ^ byte, PRIME) >>> 0;
		// The second lane folds in the index so byte-order changes affect it, then the byte.
		hashB = Math.imul(hashB ^ ((byte + i) & 0xff), PRIME) >>> 0;
	}
	const hex = (value: number): string => value.toString(16).padStart(8, '0');
	return `${hex(hashA)}${hex(hashB)}`;
}

/** The algorithm tag prefixed onto an asset id, so a future migration can introduce a new hash. */
export const ASSET_HASH_ALGORITHM = 'fnv1a64' as const;

/** Build the content-addressed asset id from a bare checksum: `<algorithm>-<checksum>`. */
export function assetId(checksum: string): string {
	return `${ASSET_HASH_ALGORITHM}-${checksum}`;
}

export type AssetValidationError =
	| { kind: 'empty-bytes'; message: string }
	| { kind: 'too-large'; message: string; byteLength: number; limitBytes: number }
	| { kind: 'unsupported-mime'; message: string; mimeType: string };

export interface BuildAssetInput {
	bytes: Uint8Array;
	mimeType: string;
	fileName: string;
	dimensions?: MapAssetDimensions | null;
	importedBy: string;
	importedAt: string;
	maxBytes?: number;
}

/**
 * Resolve a MIME type to its native asset kind, or `null` when the type is NOT natively supported
 * (i.e. it is an external scene format requiring a declared adapter). Pure lookup.
 */
export function nativeAssetKind(mimeType: string): MapAssetKind | null {
	return NATIVE_ASSET_MIME_TYPES[mimeType] ?? null;
}

/**
 * Validate + build a content-addressed {@link MapAsset} from raw bytes. Fail-closed and order-sensitive
 * (MAP-002 AC2 — reject BEFORE any storage mutation):
 *
 *   1. empty bytes are rejected (no zero-byte asset),
 *   2. oversized bytes are rejected with the breach size + limit (actionable diagnostic),
 *   3. a non-native MIME type is rejected here — native import only accepts image/SVG; external
 *      formats go through the adapter path, never this function.
 *
 * On success the asset id is the content hash, so importing identical bytes again yields the same id
 * (dedupe). The function never touches storage; the command handler decides whether the returned
 * asset is new or a dedupe of an existing one.
 */
export function buildMapAsset(input: BuildAssetInput): MapAsset | { error: AssetValidationError } {
	if (input.bytes.length === 0) {
		return { error: { kind: 'empty-bytes', message: 'Imported asset has no bytes.' } };
	}
	const limit = input.maxBytes ?? DEFAULT_MAX_ASSET_BYTES;
	if (input.bytes.length > limit) {
		return {
			error: {
				kind: 'too-large',
				message: `Asset of ${input.bytes.length} bytes exceeds the ${limit} byte import limit.`,
				byteLength: input.bytes.length,
				limitBytes: limit,
			},
		};
	}
	const kind = nativeAssetKind(input.mimeType);
	if (!kind) {
		return {
			error: {
				kind: 'unsupported-mime',
				message: `MIME type "${input.mimeType}" is not a natively supported map asset; a declared adapter is required.`,
				mimeType: input.mimeType,
			},
		};
	}
	const checksum = hashAssetBytes(input.bytes);
	return {
		id: assetId(checksum),
		kind,
		mimeType: input.mimeType,
		fileName: input.fileName,
		byteLength: input.bytes.length,
		checksum,
		dimensions: input.dimensions ?? null,
		source: {
			origin: 'import',
			importedAt: input.importedAt,
			importedBy: input.importedBy,
		},
		schemaVersion: MAP_ASSET_SCHEMA_VERSION,
	};
}
