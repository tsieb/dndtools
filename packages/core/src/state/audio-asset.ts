import { hashAssetBytes, assetId } from './map-assets';

/**
 * AUDIO-004 — content-addressed LOCAL AUDIO ASSET model with metadata, LICENSING notes, TAGS, and a
 * SOURCE REFERENCE.
 *
 * This composes the existing content-addressed asset pattern (`state/map-assets.ts`): an audio asset's
 * id is a HASH of its bytes, so importing the same file twice deduplicates to a single record and the
 * id is itself the integrity check. Per ADR-014 the prototype builds no blob CDN — the deliverable is
 * the hash + metadata + a content-addressed reference; the bytes live behind a storage adapter. This
 * module is PURE and DETERMINISTIC (no DOM, no `crypto.subtle`, no clock) so the same bytes hash to the
 * same id on every device and in a Node test environment. It REUSES `hashAssetBytes`/`assetId` so the
 * audio store and the map store share one content-address algorithm rather than re-deriving it.
 *
 * The LICENSING crux (AUDIO-004 AC2) is fail-closed: a license is a TYPED enum, not free text the caller
 * can fabricate. `unknown` is the default for an asset whose license was never declared, and
 * {@link assetNeedsLicenseReview} flags exactly those assets for review BEFORE an export — the asset is
 * NEVER silently treated as cleared. A free-text `licenseNote`/`attribution` is preserved verbatim
 * (never invented) so the recorded provenance is auditable.
 */

export const AUDIO_ASSET_SCHEMA_VERSION = 1 as const;

/** The entity type audio assets are addressed by in ops/visibility. Audio assets default to DM-only. */
export const AUDIO_ASSET_ENTITY_TYPE = 'audio-asset' as const;

/**
 * The natively-supported audio MIME types. Anything outside this set is NOT a native local audio asset
 * and is rejected at import (fail closed) — the same discipline the map asset store uses for image/SVG.
 * Kept narrow on purpose: the common lossy/lossless web-playable container formats.
 */
export const NATIVE_AUDIO_MIME_TYPES: Readonly<Record<string, true>> = Object.freeze({
	'audio/mpeg': true, // .mp3
	'audio/mp4': true, // .m4a / aac in mp4
	'audio/aac': true,
	'audio/ogg': true, // .ogg / .oga (vorbis/opus)
	'audio/opus': true,
	'audio/wav': true,
	'audio/webm': true,
	'audio/flac': true,
});

/**
 * Default maximum imported audio size in bytes. Audio files are larger than images, so this bound is
 * higher than the map asset bound, but the import path always enforces SOME limit so an oversized file
 * is rejected with an actionable diagnostic BEFORE any storage mutation.
 */
export const DEFAULT_MAX_AUDIO_BYTES = 32 * 1024 * 1024;

/**
 * The DECLARED license of an audio asset. A TYPED enum (never free text) so the licensing gate can fail
 * closed deterministically:
 *
 *   - `unknown`            — license never declared. The fail-closed DEFAULT; flagged for review.
 *   - `owned`              — the DM authored/owns the asset outright.
 *   - `cc0` / `cc-by`      — Creative Commons public-domain / attribution (attribution REQUIRED for cc-by).
 *   - `royalty-free`       — a royalty-free license the DM holds.
 *   - `licensed`           — a specific paid/personal license the DM holds (details in `licenseNote`).
 *   - `restricted`         — explicitly NOT cleared for the use the DM intends (blocks export/redistribution).
 *
 * The enum is closed; an unrecognized persisted value hydrates to `unknown` (fail closed — never cleared).
 */
export type AudioLicenseKind =
	| 'unknown'
	| 'owned'
	| 'cc0'
	| 'cc-by'
	| 'royalty-free'
	| 'licensed'
	| 'restricted';

export const AUDIO_LICENSE_KINDS: readonly AudioLicenseKind[] = Object.freeze([
	'unknown',
	'owned',
	'cc0',
	'cc-by',
	'royalty-free',
	'licensed',
	'restricted',
]);

/** True when `value` is a declared license kind. Unknown values fail closed to `unknown` on hydrate. */
export function isAudioLicenseKind(value: unknown): value is AudioLicenseKind {
	return typeof value === 'string' && (AUDIO_LICENSE_KINDS as readonly string[]).includes(value);
}

/** Recorded LICENSE metadata for an asset. The free-text fields are preserved verbatim, never fabricated. */
export interface AudioLicense {
	kind: AudioLicenseKind;
	/** A short DM-authored license note (e.g. the marketplace order id, the license URL). Verbatim. */
	licenseNote: string;
	/** Required attribution text for `cc-by` (and surfaced for any license that needs credit). Verbatim. */
	attribution: string;
}

/** The fail-closed default license for a freshly imported asset whose license was not declared. */
export const UNDECLARED_AUDIO_LICENSE: AudioLicense = Object.freeze({
	kind: 'unknown',
	licenseNote: '',
	attribution: '',
});

/**
 * A content-addressed local audio asset record. `id` IS the content hash (the integrity check);
 * `byteLength`/`checksum` let a reader re-verify the payload; `license`, `tags`, and `source` record the
 * provenance the DM authored. The record carries METADATA only — the bytes live behind a
 * content-addressed reference the storage adapter resolves (ADR-014: no blob CDN in the prototype).
 */
export interface AudioAsset {
	/** Content hash of the bytes, prefixed with the algorithm tag (e.g. `fnv1a64-…`). The asset id. */
	id: string;
	mimeType: string;
	/** Original filename, for the DM-facing asset list. Provenance only; never a storage path. */
	fileName: string;
	/** A short DM-authored display title (defaults to the filename when unset). */
	title: string;
	byteLength: number;
	/** Same hash as `id` but without the algorithm prefix — the bare integrity checksum. */
	checksum: string;
	/** Declared license metadata. `unknown` until the DM declares it; flagged for review until then. */
	license: AudioLicense;
	/** DM-authored tags for organizing the audio library (normalized: trimmed, lowercased, deduped). */
	tags: string[];
	/** Provenance: which DECLARED audio source this asset came from + when. Never a filesystem path. */
	source: {
		/** The id of the declared audio source (see `state/audio-source.ts`) this asset belongs to. */
		sourceId: string;
		importedAt: string;
		importedBy: string;
	};
	schemaVersion: typeof AUDIO_ASSET_SCHEMA_VERSION;
}

/** True when a MIME type is a natively-supported local audio format. Pure lookup. */
export function isNativeAudioMimeType(mimeType: string): boolean {
	return NATIVE_AUDIO_MIME_TYPES[mimeType] === true;
}

/** Normalize tags fail-closed: trim, lowercase, drop empties, dedupe, stable sort. Pure. */
export function normalizeAudioTags(tags: readonly string[] | undefined): string[] {
	const seen = new Set<string>();
	for (const raw of tags ?? []) {
		const tag = raw.trim().toLowerCase();
		if (tag.length > 0) seen.add(tag);
	}
	return [...seen].sort();
}

/**
 * Build a {@link AudioLicense} from caller input fail-closed. An unrecognized/absent kind defaults to
 * `unknown` (never silently cleared); the free-text fields are preserved verbatim (trimmed only). The
 * function NEVER fabricates a license — a missing kind stays `unknown` so the review gate stays armed.
 */
export function buildAudioLicense(input: {
	kind?: unknown;
	licenseNote?: string;
	attribution?: string;
}): AudioLicense {
	return {
		kind: isAudioLicenseKind(input.kind) ? input.kind : 'unknown',
		licenseNote: (input.licenseNote ?? '').trim(),
		attribution: (input.attribution ?? '').trim(),
	};
}

export type AudioAssetValidationError =
	| { kind: 'empty-bytes'; message: string }
	| { kind: 'too-large'; message: string; byteLength: number; limitBytes: number }
	| { kind: 'unsupported-mime'; message: string; mimeType: string };

export interface BuildAudioAssetInput {
	bytes: Uint8Array;
	mimeType: string;
	fileName: string;
	title?: string;
	license?: { kind?: unknown; licenseNote?: string; attribution?: string };
	tags?: readonly string[];
	sourceId: string;
	importedBy: string;
	importedAt: string;
	maxBytes?: number;
}

/**
 * AUDIO-004 AC1 — validate + build a content-addressed {@link AudioAsset} from raw bytes. Fail-closed and
 * order-sensitive (reject BEFORE any storage mutation):
 *
 *   1. empty bytes are rejected (no zero-byte asset),
 *   2. oversized bytes are rejected with the breach size + limit (actionable diagnostic),
 *   3. a non-native audio MIME type is rejected here (only the declared web-playable formats import).
 *
 * On success the asset id is the content hash, so importing identical bytes again yields the same id
 * (dedupe). The recorded metadata is exactly what AUDIO-004 AC1 requires: TAGS, a LICENSE note, the
 * SOURCE reference, and the ASSET HASH. The license defaults to `unknown` when undeclared (review gate
 * stays armed); tags are normalized; the function never touches storage.
 */
export function buildAudioAsset(
	input: BuildAudioAssetInput,
): AudioAsset | { error: AudioAssetValidationError } {
	if (input.bytes.length === 0) {
		return { error: { kind: 'empty-bytes', message: 'Imported audio asset has no bytes.' } };
	}
	const limit = input.maxBytes ?? DEFAULT_MAX_AUDIO_BYTES;
	if (input.bytes.length > limit) {
		return {
			error: {
				kind: 'too-large',
				message: `Audio asset of ${input.bytes.length} bytes exceeds the ${limit} byte import limit.`,
				byteLength: input.bytes.length,
				limitBytes: limit,
			},
		};
	}
	if (!isNativeAudioMimeType(input.mimeType)) {
		return {
			error: {
				kind: 'unsupported-mime',
				message: `MIME type "${input.mimeType}" is not a natively supported local audio asset.`,
				mimeType: input.mimeType,
			},
		};
	}
	const checksum = hashAssetBytes(input.bytes);
	const fileName = input.fileName.trim();
	return {
		id: assetId(checksum),
		mimeType: input.mimeType,
		fileName,
		title: (input.title ?? '').trim() || fileName,
		byteLength: input.bytes.length,
		checksum,
		license: buildAudioLicense(input.license ?? {}),
		tags: normalizeAudioTags(input.tags),
		source: {
			sourceId: input.sourceId,
			importedAt: input.importedAt,
			importedBy: input.importedBy,
		},
		schemaVersion: AUDIO_ASSET_SCHEMA_VERSION,
	};
}

/**
 * AUDIO-004 AC2 — the LICENSING REVIEW gate. An asset needs review when its license is NOT cleared for
 * use: an `unknown` license (never declared) OR a `restricted` license (explicitly not cleared) OR a
 * `cc-by` license MISSING its required attribution. This is the fail-closed predicate the export path
 * consults so a missing/restricted license is FLAGGED before export — never silently allowed.
 */
export function assetNeedsLicenseReview(asset: AudioAsset): boolean {
	const { kind, attribution } = asset.license;
	if (kind === 'unknown' || kind === 'restricted') return true;
	if (kind === 'cc-by' && attribution.length === 0) return true;
	return false;
}

/** The non-leaking reason an asset was flagged for license review (for the DM-facing review list). */
export type AudioLicenseReviewReason =
	| 'license-undeclared'
	| 'license-restricted'
	| 'attribution-missing';

/** Resolve the precise review reason for a flagged asset, or null when the license is cleared. Pure. */
export function licenseReviewReason(asset: AudioAsset): AudioLicenseReviewReason | null {
	const { kind, attribution } = asset.license;
	if (kind === 'unknown') return 'license-undeclared';
	if (kind === 'restricted') return 'license-restricted';
	if (kind === 'cc-by' && attribution.length === 0) return 'attribution-missing';
	return null;
}

/** Deep-clone an audio asset so callers never mutate shared state. Pure. */
export function cloneAudioAsset(asset: AudioAsset): AudioAsset {
	return {
		...asset,
		license: { ...asset.license },
		tags: [...asset.tags],
		source: { ...asset.source },
	};
}
