import {
	MAX_ASSET_BLOB_BYTES,
	SCENE_CARD_FLAVOR_MAX_LENGTH,
	assetId,
	hasAsciiControlCharacter,
	hashAssetBytes,
	isSceneCardLightingHint,
	isSceneCardMood,
	type CoreStateSlice,
	type SceneCardHeroImage,
	type SceneCardLightingHint,
	type SceneCardMood,
	type SyncOperation,
} from '@dndtools/core';
import {
	loadCoreState,
	restoreFullVaultState,
	validateRestoredCoreState,
	type AssetBlobRecord,
} from './storage/coreStore';
import { getAssetBytes, listAssetBytes, putAssetBytes } from './storage/assetStore';

/**
 * Whole-vault backup: the full durable core state slice PLUS the asset bytes the cloud
 * snapshot deliberately omits. This is the one true "get everything out / put everything
 * back" path (Settings → Storage). Import is authoritative and destructive (it replaces
 * the current vault), so callers confirm explicitly and reload the runtime afterwards.
 */

export const VAULT_BACKUP_FORMAT = 'dndtools-vault-backup';
export const VAULT_BACKUP_VERSION = 1;
export const MAX_VAULT_BACKUP_FILE_BYTES = 256 * 1024 * 1024;
const MAX_VAULT_BACKUP_RAW_ASSET_BYTES = 180 * 1024 * 1024;
const MAX_VAULT_BACKUP_ASSETS = 10_000;
const MAX_BASE64_ASSET_CHARS = Math.ceil(MAX_ASSET_BLOB_BYTES / 3) * 4;

export interface VaultBackupAsset {
	id: string;
	mime: string;
	base64: string;
}

export interface VaultBackup {
	format: typeof VAULT_BACKUP_FORMAT;
	version: number;
	createdAt: string;
	slice: VaultBackupSlice;
	assets: VaultBackupAsset[];
}

/** JSON-safe durable state: derived idempotency sets and all ephemeral runtime fields are excluded. */
export type VaultBackupSlice = Omit<CoreStateSlice, 'sync'> & {
	sync: { operations: SyncOperation[] };
};

export class VaultBackupValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'VaultBackupValidationError';
	}
}

// Chunked base64: String.fromCharCode(...bigArray) overflows the arg limit on MB blobs.
const B64_CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.length; i += B64_CHUNK) {
		binary += String.fromCharCode(...bytes.subarray(i, i + B64_CHUNK));
	}
	return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
	if (
		typeof base64 !== 'string' ||
		base64.length % 4 !== 0 ||
		!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)
	) {
		throw new VaultBackupValidationError('Backup contains invalid base64 media data.');
	}
	let binary: string;
	try {
		binary = atob(base64);
	} catch {
		throw new VaultBackupValidationError('Backup contains invalid base64 media data.');
	}
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	if (bytesToBase64(bytes) !== base64) {
		throw new VaultBackupValidationError('Backup contains non-canonical base64 media data.');
	}
	return bytes;
}

/** Every durable slice a backup must carry; import fails closed if one is missing. */
const REQUIRED_SLICE_KEYS = [
	'scenes',
	'maps',
	'permissions',
	'session',
	'widgets',
	'commandCenter',
	'characters',
	'content',
	'encounters',
	'audio',
	'mcp',
	'sync',
] as const;

export async function exportFullVault(): Promise<VaultBackup> {
	const slice = await loadCoreState();
	const assets = await listAssetBytes();
	const rawAssetBytes = assets.reduce((total, entry) => total + entry.bytes.byteLength, 0);
	if (assets.length > MAX_VAULT_BACKUP_ASSETS || rawAssetBytes > MAX_VAULT_BACKUP_RAW_ASSET_BYTES) {
		throw new VaultBackupValidationError(
			'This vault is too large for the current JSON backup format. Keep the existing vault unchanged and use the app data folder for a full archival copy.',
		);
	}
	const normalizedSlice = backupSlice(slice);
	const estimatedBytes =
		new TextEncoder().encode(JSON.stringify(normalizedSlice)).byteLength +
		assets.reduce((total, entry) => total + Math.ceil(entry.bytes.byteLength / 3) * 4 + 1_024, 0);
	if (estimatedBytes > MAX_VAULT_BACKUP_FILE_BYTES) {
		throw new VaultBackupValidationError(
			'This vault is too large for the current JSON backup format. No backup file was created.',
		);
	}
	return {
		format: VAULT_BACKUP_FORMAT,
		version: VAULT_BACKUP_VERSION,
		createdAt: new Date().toISOString(),
		slice: normalizedSlice,
		assets: assets.map((a) => ({
			id: a.id,
			mime: a.mime,
			base64: bytesToBase64(new Uint8Array(a.bytes)),
		})),
	};
}

function plainRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function backupSlice(slice: CoreStateSlice): VaultBackupSlice {
	return {
		scenes: slice.scenes,
		maps: slice.maps,
		permissions: slice.permissions,
		session: slice.session,
		widgets: slice.widgets,
		systems: slice.systems,
		commandCenter: slice.commandCenter,
		characters: slice.characters,
		content: slice.content,
		encounters: slice.encounters,
		audio: slice.audio,
		mcp: slice.mcp,
		sync: { operations: slice.sync.operations },
	};
}

function normalizeUntrustedSlice(value: unknown): VaultBackupSlice {
	if (!plainRecord(value)) throw new VaultBackupValidationError('Backup carries no vault state.');
	for (const key of REQUIRED_SLICE_KEYS) {
		if (!(key in value)) {
			throw new VaultBackupValidationError(`Backup is missing the "${key}" state slice.`);
		}
	}
	if (!plainRecord(value.sync) || !Array.isArray(value.sync.operations)) {
		throw new VaultBackupValidationError('Backup operation log is malformed.');
	}
	// Released v1 files serialized OperationLog.idempotencyKeys as an extra derived object. Select only
	// durable fields, then use the same strict schema/operation validator as encrypted cloud restore.
	const selected = {
		scenes: value.scenes,
		maps: value.maps,
		permissions: value.permissions,
		session: value.session,
		widgets: value.widgets,
		commandCenter: value.commandCenter,
		characters: value.characters,
		content: value.content,
		encounters: value.encounters,
		audio: value.audio,
		mcp: value.mcp,
		// RC-SYS-1.1: `systems` is optional on import — a file written before the slice existed has
		// none, and dropping it here would make the restore validator reject its own export.
		...('systems' in value ? { systems: value.systems } : {}),
		sync: { operations: value.sync.operations },
	};
	try {
		return backupSlice(validateRestoredCoreState(selected));
	} catch (error) {
		const detail = error instanceof Error ? error.message : 'Backup vault state is invalid.';
		throw new VaultBackupValidationError(detail.replace(/^Cloud backup\b/, 'Local backup'));
	}
}

function prepareVaultBackup(value: unknown): {
	backup: VaultBackup;
	assetRecords: AssetBlobRecord[];
} {
	if (!plainRecord(value)) throw new VaultBackupValidationError('Not a vault backup file.');
	if (
		JSON.stringify(Object.keys(value).sort()) !==
		JSON.stringify(['assets', 'createdAt', 'format', 'slice', 'version'])
	) {
		throw new VaultBackupValidationError('Backup has unexpected top-level fields.');
	}
	if (value.format !== VAULT_BACKUP_FORMAT) {
		throw new VaultBackupValidationError('Not a dndtools vault backup (missing format marker).');
	}
	if (value.version !== VAULT_BACKUP_VERSION) {
		throw new VaultBackupValidationError(
			`Backup version ${String(value.version)} is not supported by this app.`,
		);
	}
	if (typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) {
		throw new VaultBackupValidationError('Backup creation time is invalid.');
	}
	const slice = normalizeUntrustedSlice(value.slice);
	if (!Array.isArray(value.assets) || value.assets.length > MAX_VAULT_BACKUP_ASSETS) {
		throw new VaultBackupValidationError('Backup asset list is malformed or too large.');
	}
	let totalBytes = 0;
	const ids = new Set<string>();
	const assets: VaultBackupAsset[] = [];
	const assetRecords: AssetBlobRecord[] = [];
	for (const candidate of value.assets) {
		if (
			!plainRecord(candidate) ||
			JSON.stringify(Object.keys(candidate).sort()) !== JSON.stringify(['base64', 'id', 'mime']) ||
			typeof candidate.id !== 'string' ||
			candidate.id.length < 1 ||
			candidate.id.length > 120 ||
			ids.has(candidate.id) ||
			typeof candidate.mime !== 'string' ||
			candidate.mime.length < 1 ||
			candidate.mime.length > 255 ||
			hasAsciiControlCharacter(candidate.mime) ||
			typeof candidate.base64 !== 'string' ||
			candidate.base64.length > MAX_BASE64_ASSET_CHARS
		) {
			throw new VaultBackupValidationError('Backup contains a malformed or duplicate asset entry.');
		}
		const bytes = base64ToBytes(candidate.base64);
		if (
			bytes.byteLength < 1 ||
			bytes.byteLength > MAX_ASSET_BLOB_BYTES ||
			assetId(hashAssetBytes(bytes)) !== candidate.id
		) {
			throw new VaultBackupValidationError(
				'Backup media content does not match its declared asset id.',
			);
		}
		totalBytes += bytes.byteLength;
		if (totalBytes > MAX_VAULT_BACKUP_RAW_ASSET_BYTES) {
			throw new VaultBackupValidationError('Backup media exceeds the safe restore size.');
		}
		ids.add(candidate.id);
		assets.push({ id: candidate.id, mime: candidate.mime, base64: candidate.base64 });
		assetRecords.push({
			id: candidate.id,
			mime: candidate.mime,
			bytes: bytes.slice().buffer,
			byteLength: bytes.byteLength,
			createdAt: value.createdAt,
		});
	}
	return {
		backup: {
			format: VAULT_BACKUP_FORMAT,
			version: VAULT_BACKUP_VERSION,
			createdAt: value.createdAt,
			slice,
			assets,
		},
		assetRecords,
	};
}

/**
 * Validate an untrusted parsed backup completely before any state or asset mutation.
 */
export function validateVaultBackup(value: unknown): VaultBackup {
	return prepareVaultBackup(value).backup;
}

export interface VaultRestoreResult {
	restoredAssets: number;
	skippedAssets: number;
}

/**
 * Replace the current vault with the backup's contents. Callers MUST confirm with the user first.
 * State and content-addressed bytes are fully validated, then replaced in one IndexedDB transaction;
 * corrupt media fails before mutation and unrelated blobs from the prior vault do not survive.
 */
export async function importFullVault(backup: VaultBackup): Promise<VaultRestoreResult> {
	const prepared = prepareVaultBackup(backup);
	await restoreFullVaultState(prepared.backup.slice, prepared.assetRecords);
	return { restoredAssets: prepared.assetRecords.length, skippedAssets: 0 };
}

/**
 * RC-AUD-2.3 — `.dndscene` SCENE PACKAGE export/import: ONE scene card (title, mood, flavor,
 * lighting hint, and the audio preset/sound-cue REFERENCES that make it a package — I11 S11.2.1,
 * RC-AUD-2.1) carried as small standalone JSON, so a DM can hand a single scene to another table
 * or archive it outside the whole-vault backup. Distinct from {@link exportFullVault}: this is a
 * ONE-CARD, additive, non-destructive shape (Community → Export and the Scene cards panel), never a
 * vault replacement.
 *
 * Portability rules, deliberately narrow:
 *
 *   - The hero image travels as `url` (kept as-is — nothing to bundle) or `bundled` (its bytes ride
 *     along base64-encoded, content-address-verified on import exactly like a vault-backup asset).
 *     A `vault-asset` hero whose bytes no longer resolve locally degrades to no hero image on
 *     export rather than producing a package with a dangling reference — the same graceful-degrade
 *     the display surface already applies to a missing asset.
 *   - `audioPresetId` / `audioAssociationId` travel as bare REFERENCE ids, exactly as the live card
 *     already treats them (`isSceneCardPackage`'s doc comment): resolved live at play time through
 *     the destination vault's own preset/sound-board gates, so an id that doesn't exist there simply
 *     fails to resolve — never a hard import error.
 *   - Every package is plain JSON — "web-only packages as small JSON" per the roadmap: unlike the
 *     whole-vault backup format there is no separate large-archive path, so a package with no
 *     bundled hero image is always a few hundred bytes of text.
 *   - Visibility is NOT carried: an imported card is always created `dm-only` (the command's own
 *     fail-closed default), regardless of the visibility it had at the source table.
 */

export const SCENE_PACKAGE_FORMAT = 'dndtools-scene-package';
export const SCENE_PACKAGE_VERSION = 1;

/** The hero image half of a package: `url` (kept as-is) or `bundled` (bytes ride in `heroAsset`). */
export interface ScenePackageHeroImage {
	kind: 'url' | 'bundled';
	ref: string;
}

export interface ScenePackageCard {
	title: string;
	mood: SceneCardMood;
	flavorText: string;
	lightingHint: SceneCardLightingHint | null;
	audioPresetId: string | null;
	audioAssociationId: string | null;
	heroImage: ScenePackageHeroImage | null;
}

export interface ScenePackage {
	format: typeof SCENE_PACKAGE_FORMAT;
	version: number;
	createdAt: string;
	card: ScenePackageCard;
	/** The bundled hero image bytes, present iff `card.heroImage.kind === 'bundled'`. */
	heroAsset: VaultBackupAsset | null;
}

/** The minimal card shape an export needs — satisfied by both {@link SceneCard} and `SceneCardView`. */
export interface ScenePackageSourceCard {
	title: string;
	mood: SceneCardMood;
	flavorText: string;
	lightingHint: SceneCardLightingHint | null;
	audioPresetId: string | null;
	audioAssociationId: string | null;
	heroImage: SceneCardHeroImage | null;
}

/** Build a `.dndscene` package from one live card. Bundles hero bytes when they still resolve locally. */
export async function exportScenePackage(card: ScenePackageSourceCard): Promise<ScenePackage> {
	let heroImage: ScenePackageHeroImage | null = null;
	let heroAsset: VaultBackupAsset | null = null;
	if (card.heroImage?.kind === 'url') {
		heroImage = { kind: 'url', ref: card.heroImage.ref };
	} else if (card.heroImage?.kind === 'vault-asset') {
		const blob = await getAssetBytes(card.heroImage.ref);
		if (blob) {
			const bytes = new Uint8Array(await blob.arrayBuffer());
			heroImage = { kind: 'bundled', ref: card.heroImage.ref };
			heroAsset = {
				id: card.heroImage.ref,
				mime: blob.type || 'application/octet-stream',
				base64: bytesToBase64(bytes),
			};
		}
		// else: the referenced asset no longer resolves locally — degrade to no hero image, honestly.
	}
	return {
		format: SCENE_PACKAGE_FORMAT,
		version: SCENE_PACKAGE_VERSION,
		createdAt: new Date().toISOString(),
		card: {
			title: card.title,
			mood: card.mood,
			flavorText: card.flavorText.slice(0, SCENE_CARD_FLAVOR_MAX_LENGTH),
			lightingHint: card.lightingHint,
			audioPresetId: card.audioPresetId,
			audioAssociationId: card.audioAssociationId,
			heroImage,
		},
		heroAsset,
	};
}

/** Validate an untrusted parsed `.dndscene` file completely (no bytes written, nothing dispatched). */
export function validateScenePackage(value: unknown): ScenePackage {
	if (!plainRecord(value)) throw new VaultBackupValidationError('Not a scene package file.');
	if (value.format !== SCENE_PACKAGE_FORMAT) {
		throw new VaultBackupValidationError('Not a dndtools scene package (missing format marker).');
	}
	if (value.version !== SCENE_PACKAGE_VERSION) {
		throw new VaultBackupValidationError(
			`Scene package version ${String(value.version)} is not supported by this app.`,
		);
	}
	if (typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) {
		throw new VaultBackupValidationError('Scene package creation time is invalid.');
	}
	const rawCard = value.card;
	if (!plainRecord(rawCard) || typeof rawCard.title !== 'string' || rawCard.title.length < 1) {
		throw new VaultBackupValidationError('Scene package is missing a card title.');
	}
	const audioPresetId =
		typeof rawCard.audioPresetId === 'string' && rawCard.audioPresetId.length > 0
			? rawCard.audioPresetId
			: null;
	const audioAssociationId =
		typeof rawCard.audioAssociationId === 'string' && rawCard.audioAssociationId.length > 0
			? rawCard.audioAssociationId
			: null;

	let heroImage: ScenePackageHeroImage | null = null;
	let heroAsset: VaultBackupAsset | null = null;
	const rawHero = rawCard.heroImage;
	if (
		plainRecord(rawHero) &&
		(rawHero.kind === 'url' || rawHero.kind === 'bundled') &&
		typeof rawHero.ref === 'string' &&
		rawHero.ref.length > 0
	) {
		if (rawHero.kind === 'url') {
			heroImage = { kind: 'url', ref: rawHero.ref };
		} else {
			// A bundled reference with no matching/valid bytes is a malformed file, not a graceful-degrade
			// case — unlike a live vault asset going missing after the fact, this package was never valid.
			const rawAsset = value.heroAsset;
			if (
				!plainRecord(rawAsset) ||
				typeof rawAsset.id !== 'string' ||
				rawAsset.id !== rawHero.ref ||
				typeof rawAsset.mime !== 'string' ||
				rawAsset.mime.length < 1 ||
				rawAsset.mime.length > 255 ||
				hasAsciiControlCharacter(rawAsset.mime) ||
				typeof rawAsset.base64 !== 'string'
			) {
				throw new VaultBackupValidationError(
					'Scene package hero image bytes are missing or malformed.',
				);
			}
			const bytes = base64ToBytes(rawAsset.base64);
			if (
				bytes.byteLength < 1 ||
				bytes.byteLength > MAX_ASSET_BLOB_BYTES ||
				assetId(hashAssetBytes(bytes)) !== rawAsset.id
			) {
				throw new VaultBackupValidationError(
					'Scene package hero image content does not match its declared asset id.',
				);
			}
			heroImage = { kind: 'bundled', ref: rawHero.ref };
			heroAsset = { id: rawAsset.id, mime: rawAsset.mime, base64: rawAsset.base64 };
		}
	}

	return {
		format: SCENE_PACKAGE_FORMAT,
		version: SCENE_PACKAGE_VERSION,
		createdAt: value.createdAt,
		card: {
			title: rawCard.title,
			mood: isSceneCardMood(rawCard.mood) ? rawCard.mood : 'exploration',
			flavorText:
				typeof rawCard.flavorText === 'string'
					? rawCard.flavorText.slice(0, SCENE_CARD_FLAVOR_MAX_LENGTH)
					: '',
			lightingHint: isSceneCardLightingHint(rawCard.lightingHint) ? rawCard.lightingHint : null,
			audioPresetId,
			audioAssociationId,
			heroImage,
		},
		heroAsset,
	};
}

/**
 * Materialize a validated package into `scene-card.create` input: bundled hero bytes (if any) are
 * written into the local asset store (content-addressed, so a re-import of the same bytes is a
 * no-op) and resolved to a `vault-asset` reference. The caller still dispatches `scene-card.create`
 * through the runtime — this helper never mutates durable core state itself.
 */
export async function materializeScenePackage(pkg: ScenePackage): Promise<{
	title: string;
	mood: SceneCardMood;
	flavorText: string;
	lightingHint: SceneCardLightingHint | null;
	audioPresetId: string | null;
	audioAssociationId: string | null;
	heroImage: SceneCardHeroImage | null;
}> {
	let heroImage: SceneCardHeroImage | null = null;
	if (pkg.card.heroImage?.kind === 'url') {
		heroImage = { kind: 'url', ref: pkg.card.heroImage.ref };
	} else if (pkg.card.heroImage?.kind === 'bundled' && pkg.heroAsset) {
		const bytes = base64ToBytes(pkg.heroAsset.base64);
		const id = await putAssetBytes(bytes, pkg.heroAsset.mime);
		heroImage = { kind: 'vault-asset', ref: id };
	}
	return {
		title: pkg.card.title,
		mood: pkg.card.mood,
		flavorText: pkg.card.flavorText,
		lightingHint: pkg.card.lightingHint,
		audioPresetId: pkg.card.audioPresetId,
		audioAssociationId: pkg.card.audioAssociationId,
		heroImage,
	};
}
