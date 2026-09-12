import {
	decodeFolderNote,
	decodeFolderRules,
	decodeFolderCalendars,
	encodeFolderNote,
	folderNotePath,
	mapFolderImages,
	selectFolderNotes,
	FOLDER_MAX_BYTES,
	FOLDER_MAX_FILES,
	safeFolderPath,
	type FolderEntry,
} from '../../../../packages/core/src/export/markdown-folder';
import {
	decodeFolderZip,
	encodeFolderZip,
	validateFolderEntries,
} from '../../../../packages/core/src/export/folder-zip';
import { hasDmAuthority, type CoreCommand, type CommandResult } from '@dndtools/core';

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

// Markdown-folder transport. The pure codec stays in core; blobs stay in the platform store.
interface MarkdownRuntime {
	readonly state: CoreStateSlice;
	readonly defaultActorId: string;
	dispatch(command: CoreCommand): Promise<CommandResult>;
}
interface FolderAsset {
	path: string;
	id: string;
	mime: string;
}
const IMAGE_EXTENSIONS: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/gif': 'gif',
	'image/webp': 'webp',
	'image/avif': 'avif',
};

export async function exportMarkdownFolder(
	runtime: MarkdownRuntime,
	includeDmOnly = false,
): Promise<FolderEntry[]> {
	const notes = selectFolderNotes(
		runtime.state.content,
		runtime.state.permissions,
		runtime.defaultActorId,
		includeDmOnly,
	);
	const entries: FolderEntry[] = [];
	const used = new Set<string>();
	const manifest: FolderAsset[] = [];
	const encoder = new TextEncoder();
	for (const note of notes) {
		const path = folderNotePath(note, used);
		const prefix = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
		const refs = new Set<string>();
		mapFolderImages(note.body, (ref) => {
			if (ref.startsWith('asset:')) refs.add(ref);
			return ref;
		});
		const assets: Record<string, string> = {};
		for (const ref of refs) {
			const id = ref.slice(6);
			if (!/^[\w-]+$/.test(id)) throw new Error('Invalid image asset reference.');
			const blob = await getAssetBytes(id);
			if (!blob)
				throw new Error(`An image in "${note.title}" is missing. Restore it before exporting.`);
			const extension = IMAGE_EXTENSIONS[blob.type];
			if (!extension) throw new Error(`An image in "${note.title}" has an unsupported format.`);
			const target = `assets/${id}.${extension}`;
			assets[ref] = target;
			if (!manifest.some((asset) => asset.path === prefix + target)) {
				entries.push({ path: prefix + target, bytes: new Uint8Array(await blob.arrayBuffer()) });
				manifest.push({ path: prefix + target, id, mime: blob.type });
			}
		}
		entries.push({ path, bytes: encoder.encode(encodeFolderNote(note, assets)) });
	}
	entries.push({ path: 'vault-assets.json', bytes: encoder.encode(JSON.stringify(manifest)) });
	const calendarIds = new Set(
		notes.flatMap((note) =>
			[...Object.values(note.dateFields), ...note.timelineRefs.map((ref) => ref.date)].map(
				(date) => date.calendarId,
			),
		),
	);
	if (calendarIds.size) {
		const calendars = [...calendarIds].sort().map((id) => {
			const calendar = runtime.state.content.calendars[id];
			if (!calendar) throw new Error('A note references a missing calendar.');
			const { schemaVersion: _version, ...definition } = calendar;
			return definition;
		});
		entries.push({
			path: 'vault-calendars.json',
			bytes: encoder.encode(JSON.stringify(calendars)),
		});
	}
	// Apply the same count, path and aggregate limits used by both transport readers.
	validateFolderEntries(entries);
	return entries;
}

export async function exportMarkdownZip(
	runtime: MarkdownRuntime,
	includeDmOnly = false,
): Promise<Blob> {
	return new Blob([encodeFolderZip(await exportMarkdownFolder(runtime, includeDmOnly))], {
		type: 'application/zip',
	});
}

/** Additive import: validate all files/assets first, then use ordinary core commands for each note. */
export async function importMarkdownFolder(
	runtime: MarkdownRuntime,
	entries: FolderEntry[],
): Promise<number> {
	const actor = runtime.state.permissions.actors[runtime.defaultActorId];
	if (!actor || !hasDmAuthority(actor.role))
		throw new Error('Only the DM may import a markdown folder.');
	validateFolderEntries(entries); // common path/count/size validation before any storage or command
	const decoder = new TextDecoder('utf-8', { fatal: true });
	const manifestEntry = entries.find((entry) => entry.path === 'vault-assets.json');
	const manifest: unknown = manifestEntry ? JSON.parse(decoder.decode(manifestEntry.bytes)) : [];
	if (!Array.isArray(manifest) || manifest.length > FOLDER_MAX_FILES)
		throw new Error('Invalid folder asset manifest.');
	const assets: Array<{ bytes: Uint8Array; mime: string }> = [];
	for (const candidate of manifest) {
		if (
			!plainRecord(candidate) ||
			typeof candidate.path !== 'string' ||
			!safeFolderPath(candidate.path) ||
			typeof candidate.id !== 'string' ||
			typeof candidate.mime !== 'string' ||
			!IMAGE_EXTENSIONS[candidate.mime]
		) {
			throw new Error('Invalid folder image descriptor.');
		}
		const entry = entries.find((file) => file.path === candidate.path);
		if (
			!entry ||
			entry.bytes.length === 0 ||
			entry.bytes.length > MAX_ASSET_BLOB_BYTES ||
			assetId(hashAssetBytes(entry.bytes)) !== candidate.id
		) {
			throw new Error('Folder image is missing or does not match its asset id.');
		}
		assets.push({ bytes: entry.bytes, mime: candidate.mime });
	}
	const notes = entries
		.filter((entry) => /\.(md|markdown)$/i.test(entry.path))
		.map((entry) => {
			const text = decoder.decode(entry.bytes);
			return { note: decodeFolderNote(text, entry.path), rules: decodeFolderRules(text) };
		});
	if (notes.length === 0) throw new Error('This folder contains no markdown notes.');
	const calendarEntry = entries.find((entry) => entry.path === 'vault-calendars.json');
	const calendars = decodeFolderCalendars(
		calendarEntry ? JSON.parse(decoder.decode(calendarEntry.bytes)) : [],
	);
	for (const calendar of calendars) {
		const existing = runtime.state.content.calendars[calendar.id];
		if (existing) {
			const { schemaVersion: _version, ...definition } = existing;
			if (JSON.stringify(decodeFolderCalendars([definition])[0]) !== JSON.stringify(calendar)) {
				throw new Error(
					`Calendar "${calendar.name}" differs from the destination calendar. Nothing imported.`,
				);
			}
		}
	}
	const bundledIds = new Set(assets.map((asset) => assetId(hashAssetBytes(asset.bytes))));
	for (const { note } of notes) {
		const refs = new Set<string>();
		mapFolderImages(note.body, (ref) => {
			if (ref.startsWith('asset:')) refs.add(ref.slice(6));
			return ref;
		});
		for (const id of refs)
			if (!bundledIds.has(id) && !(await getAssetBytes(id)))
				throw new Error('A note image is missing from the folder. Nothing imported.');
		for (const date of [
			...Object.values(note.dateFields),
			...note.timelineRefs.map((ref) => ref.date),
		]) {
			if (
				!runtime.state.content.calendars[date.calendarId] &&
				!calendars.some((calendar) => calendar.id === date.calendarId)
			)
				throw new Error('A note calendar is missing. Nothing imported.');
		}
	}
	let imported = 0;
	const dispatch = async (type: CoreCommand['type'], payload: unknown) => {
		const result = await runtime.dispatch({
			type,
			actorId: runtime.defaultActorId,
			payload,
		} as CoreCommand);
		if (result.status !== 'accepted')
			throw new Error(`Imported ${imported} notes before stopping: ${result.rejection.message}`);
		return result;
	};
	for (const calendar of calendars)
		if (!runtime.state.content.calendars[calendar.id])
			await dispatch('content.define-calendar', calendar);
	for (const asset of assets) await putAssetBytes(asset.bytes, asset.mime);
	for (const { note, rules } of notes) {
		// Keep protected prose private until every granular rule is restored.
		const protectedNote = rules.sections.length > 0 || rules.fields.length > 0;
		const result = await dispatch(
			'content.create-item',
			protectedNote ? { ...note, visibility: 'dm-only', sharedWith: [] } : note,
		);
		if (protectedNote) {
			const event = result.events.find((event) => event.kind === 'content.item-changed');
			if (!event || !('itemId' in event))
				throw new Error('Imported note id was not returned. The note remains private.');
			const itemId = event.itemId;
			for (const rule of rules.sections)
				await dispatch('content.set-section-visibility', { ...rule, itemId });
			for (const rule of rules.fields)
				await dispatch('content.set-field-visibility', { ...rule, itemId });
			await dispatch('content.set-item-visibility', {
				itemId,
				visibility: note.visibility,
				sharedWith: note.sharedWith,
			});
		}
		imported++;
	}
	return imported;
}

export async function importMarkdownZip(runtime: MarkdownRuntime, file: File): Promise<number> {
	if (file.size > FOLDER_MAX_BYTES + 512_000) throw new Error('Folder ZIP is too large.');
	return importMarkdownFolder(runtime, decodeFolderZip(new Uint8Array(await file.arrayBuffer())));
}

/** Pick without allocating the file; importMarkdownZip checks its declared size before reading. */
export function pickMarkdownZip(): Promise<File | null> {
	return new Promise((resolve) => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.zip';
		input.hidden = true;
		document.body.appendChild(input);
		const done = (file: File | null) => {
			input.remove();
			resolve(file);
		};
		input.addEventListener('change', () => done(input.files?.[0] ?? null), { once: true });
		input.addEventListener('cancel', () => done(null), { once: true });
		input.click();
	});
}
