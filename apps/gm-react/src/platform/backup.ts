import type { CoreStateSlice } from '@dndtools/core';
import { loadCoreState, restoreCoreState } from './storage/coreStore';
import { listAssetBytes, putAssetBytes } from './storage/assetStore';

/**
 * Whole-vault backup: the full durable core state slice PLUS the asset bytes the cloud
 * snapshot deliberately omits. This is the one true "get everything out / put everything
 * back" path (Settings → Storage). Import is authoritative and destructive (it replaces
 * the current vault), so callers confirm explicitly and reload the runtime afterwards.
 */

export const VAULT_BACKUP_FORMAT = 'dndtools-vault-backup';
export const VAULT_BACKUP_VERSION = 1;

export interface VaultBackupAsset {
	id: string;
	mime: string;
	base64: string;
}

export interface VaultBackup {
	format: typeof VAULT_BACKUP_FORMAT;
	version: number;
	createdAt: string;
	slice: CoreStateSlice;
	assets: VaultBackupAsset[];
}

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
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
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
	return {
		format: VAULT_BACKUP_FORMAT,
		version: VAULT_BACKUP_VERSION,
		createdAt: new Date().toISOString(),
		slice,
		assets: assets.map((a) => ({
			id: a.id,
			mime: a.mime,
			base64: bytesToBase64(new Uint8Array(a.bytes)),
		})),
	};
}

/**
 * Validate an untrusted parsed backup fail-closed. Structural only — deep hydration
 * safety is owned by loadCoreState's defensive `ensure*` pass after the restore, which
 * is exactly the path an old or hand-edited backup should flow through.
 */
export function validateVaultBackup(value: unknown): VaultBackup {
	const candidate = value as Partial<VaultBackup> | null;
	if (!candidate || typeof candidate !== 'object') {
		throw new VaultBackupValidationError('Not a vault backup file.');
	}
	if (candidate.format !== VAULT_BACKUP_FORMAT) {
		throw new VaultBackupValidationError('Not a dndtools vault backup (missing format marker).');
	}
	if (typeof candidate.version !== 'number' || candidate.version > VAULT_BACKUP_VERSION) {
		throw new VaultBackupValidationError(
			`Backup version ${String(candidate.version)} is newer than this app understands.`,
		);
	}
	const slice = candidate.slice as Record<string, unknown> | undefined;
	if (!slice || typeof slice !== 'object') {
		throw new VaultBackupValidationError('Backup carries no vault state.');
	}
	for (const key of REQUIRED_SLICE_KEYS) {
		if (!(key in slice) || !slice[key] || typeof slice[key] !== 'object') {
			throw new VaultBackupValidationError(`Backup is missing the "${key}" state slice.`);
		}
	}
	const ops = (slice.sync as { operations?: unknown }).operations;
	if (!Array.isArray(ops)) {
		throw new VaultBackupValidationError('Backup operation log is malformed.');
	}
	if (!Array.isArray(candidate.assets)) {
		throw new VaultBackupValidationError('Backup asset list is malformed.');
	}
	for (const asset of candidate.assets) {
		if (
			!asset ||
			typeof asset.id !== 'string' ||
			typeof asset.mime !== 'string' ||
			typeof asset.base64 !== 'string'
		) {
			throw new VaultBackupValidationError('Backup contains a malformed asset entry.');
		}
	}
	return candidate as VaultBackup;
}

export interface VaultRestoreResult {
	restoredAssets: number;
	skippedAssets: number;
}

/**
 * Replace the current vault with the backup's contents. Callers MUST confirm with the
 * user first (destructive) and reload the runtime (SceneRuntime.load) afterwards.
 * Asset bytes are re-imported through the content-addressed store, so a tampered
 * asset entry (bytes not matching the declared id) simply lands under its true hash
 * and shows as missing where the stale metadata points — corrupted media can never
 * impersonate another asset.
 */
export async function importFullVault(backup: VaultBackup): Promise<VaultRestoreResult> {
	await restoreCoreState(backup.slice);
	let restoredAssets = 0;
	let skippedAssets = 0;
	for (const asset of backup.assets) {
		try {
			await putAssetBytes(base64ToBytes(asset.base64), asset.mime);
			restoredAssets++;
		} catch {
			// One oversized/corrupt media entry must not abort the vault restore.
			skippedAssets++;
		}
	}
	return { restoredAssets, skippedAssets };
}
