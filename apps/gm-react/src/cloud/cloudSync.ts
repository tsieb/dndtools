// ENCRYPTED CLOUD-BACKUP ENABLEMENT (client side of SYNC-017). The CORE owns the security decision: it
// evaluates the release-approved CloudSyncSecurityModel and returns whether backup MAY be enabled. This module never
// decides security — it (a) passes the release-approved model to the core gate, (b) layers a DEVICE
// capability check (durable client-held key custody must be available on this device), and (c) records the
// user's opt-in intent device-locally AND per Cognito account. The core clamps `enabled` to `canEnable`,
// so a stored/forced flag can never bypass the model.
//
// Cloud backup is OFF by default and opt-in per account; the backup engine consumes this gate. Restoring
// requires a device that already holds the same client-side vault key; this is not key distribution or
// automatic cross-device synchronization.

import {
	DNDTOOLS_CLOUD_SYNC_SECURITY_MODEL,
	evaluateCloudSyncGate,
	hasAsciiControlCharacter,
	type CloudSyncGateResult,
} from '@dndtools/core';
import { hasDurableSecretStoreBridge } from './secureStore';
import { vaultKeyManager } from './vaultKey';

const ENABLE_FLAG = 'dndtools:react:cloud-sync-enabled';
const PENDING_KEY_DELETIONS = 'dndtools:react:pending-vault-key-deletions';

interface PendingKeyDeletion {
	accountId: string;
	vaultId: string;
}

function validPendingEntry(value: unknown): value is PendingKeyDeletion {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const { accountId, vaultId } = value as Partial<PendingKeyDeletion>;
	return (
		typeof accountId === 'string' &&
		accountId.length > 0 &&
		accountId.length <= 256 &&
		typeof vaultId === 'string' &&
		vaultId.length > 0 &&
		vaultId.length <= 128 &&
		!hasAsciiControlCharacter(accountId) &&
		!hasAsciiControlCharacter(vaultId)
	);
}

function pendingKeyDeletions(): PendingKeyDeletion[] {
	try {
		if (typeof window === 'undefined') return [];
		const raw = window.localStorage.getItem(PENDING_KEY_DELETIONS);
		if (!raw || raw.length > 32 * 1024) return [];
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed) || parsed.length > 32 || !parsed.every(validPendingEntry)) return [];
		return parsed;
	} catch {
		return [];
	}
}

function writePendingKeyDeletions(entries: readonly PendingKeyDeletion[]): void {
	try {
		if (typeof window === 'undefined') return;
		if (entries.length === 0) window.localStorage.removeItem(PENDING_KEY_DELETIONS);
		else window.localStorage.setItem(PENDING_KEY_DELETIONS, JSON.stringify(entries));
	} catch {
		// Best effort only: the immediate erasure attempt still runs and reports a failure to the user.
	}
}

function queueKeyDeletion(entry: PendingKeyDeletion): void {
	const entries = pendingKeyDeletions();
	if (
		!entries.some((item) => item.accountId === entry.accountId && item.vaultId === entry.vaultId)
	) {
		writePendingKeyDeletions([...entries, entry]);
	}
}

function dequeueKeyDeletion(entry: PendingKeyDeletion): void {
	writePendingKeyDeletions(
		pendingKeyDeletions().filter(
			(item) => item.accountId !== entry.accountId || item.vaultId !== entry.vaultId,
		),
	);
}

function enableFlagFor(accountId: string | null | undefined): string | null {
	if (!accountId || !accountId.trim() || accountId.length > 256) return null;
	return `${ENABLE_FLAG}:${encodeURIComponent(accountId)}`;
}

/** This account's device-local opt-in (a non-secret boolean; the core still gates its effect). */
export function cloudSyncIntent(accountId: string | null | undefined): boolean {
	try {
		const key = enableFlagFor(accountId);
		return Boolean(
			key && typeof window !== 'undefined' && window.localStorage.getItem(key) === 'true',
		);
	} catch {
		return false;
	}
}

function setCloudSyncIntent(accountId: string, enabled: boolean): void {
	const key = enableFlagFor(accountId);
	if (!key) throw new Error('Sign in before changing encrypted cloud backup settings.');
	try {
		if (typeof window === 'undefined') return;
		if (enabled) window.localStorage.setItem(key, 'true');
		else window.localStorage.removeItem(key);
	} catch {
		/* localStorage unavailable (private mode) — intent simply doesn't persist */
	}
}

export interface CloudSyncStatus {
	/** The core gate result under the release-approved security model (source of truth for canEnable/enabled). */
	gate: CloudSyncGateResult;
	/** Whether THIS device can durably hold the client-held key (OS credential store present). */
	custodyAvailable: boolean;
	/** canEnable AND the device can honor client-held key custody. Fail-closed on web (no keychain). */
	canEnableOnThisDevice: boolean;
}

/**
 * Compute the backup gate for this device/account. Backup can be enabled only when the core model permits
 * it AND the device can durably hold the client key. `gate.enabled` additionally requires this account's
 * opt-in; an absent account always evaluates disabled.
 */
export async function getCloudSyncStatus(
	accountId: string | null | undefined,
): Promise<CloudSyncStatus> {
	const custodyAvailable = await vaultKeyManager.custodyAvailable();
	const gate = evaluateCloudSyncGate({
		securityModel: DNDTOOLS_CLOUD_SYNC_SECURITY_MODEL,
		// Only claim "currently enabled" when the user opted in AND this device can hold the key.
		currentlyEnabled: cloudSyncIntent(accountId) && custodyAvailable,
	});
	return {
		gate,
		custodyAvailable,
		canEnableOnThisDevice: gate.canEnable && custodyAvailable,
	};
}

/**
 * Record this account's backup opt-in. Refuses fail-closed when the device cannot honor client-held key
 * custody (e.g. the web build with no OS keychain) or the core model does not permit enablement. Returns
 * the resulting status so the caller can reflect the (core-decided) effective state.
 */
export async function setCloudSyncEnabled(
	enabled: boolean,
	accountId: string,
): Promise<CloudSyncStatus> {
	if (enabled) {
		const status = await getCloudSyncStatus(accountId);
		if (!status.canEnableOnThisDevice) {
			throw new Error(
				status.custodyAvailable
					? 'Secure cloud backup is not available on this device.'
					: 'Cloud backup needs the desktop app and an available operating-system credential store.',
			);
		}
	}
	setCloudSyncIntent(accountId, enabled);
	return getCloudSyncStatus(accountId);
}

/**
 * Remove device-local state that could otherwise be associated with a permanently deleted account.
 * This runs only after the server confirms deletion. Web builds cannot ever persist a vault key;
 * desktop builds fail loudly when their OS credential store is unavailable instead of claiming the
 * key was erased. The opt-in and push high-water are exact account/vault keys, so another signed-in
 * account on this installation is untouched.
 */
export async function forgetCloudSyncAccount(
	accountId: string,
	vaultId = 'primary',
): Promise<void> {
	const intentKey = enableFlagFor(accountId);
	if (!intentKey || !vaultId.trim() || vaultId.length > 128)
		throw new Error('The deleted account has an invalid local cloud-backup namespace.');

	try {
		if (typeof window !== 'undefined') {
			window.localStorage.removeItem(intentKey);
			window.localStorage.removeItem(`dndtools:react:cloud-pushed-rev:${accountId}:${vaultId}`);
			window.localStorage.removeItem(`dndtools:react:cloud-pushed-rev-v2:${accountId}:${vaultId}`);
		}
	} catch {
		// localStorage is best-effort metadata, never key custody. A disabled/private store cannot
		// preserve these entries and therefore already has the desired post-deletion state.
	}

	const entry = { accountId, vaultId };
	const custodyAvailable = await vaultKeyManager.custodyAvailable();
	if (hasDurableSecretStoreBridge) {
		// Persist a non-secret retry marker BEFORE attempting erasure. If the OS keychain is locked or
		// Electron exits mid-write, the next launch retries without needing the now-deleted identity.
		queueKeyDeletion(entry);
		if (custodyAvailable) {
			await vaultKeyManager.forget(accountId, vaultId);
			dequeueKeyDeletion(entry);
			return;
		}
		throw new Error(
			'its local vault key could not be removed because the operating-system credential store is unavailable; removal is queued for the next app launch',
		);
	}
}

/** Retry key erasure for identities already deleted server-side. Safe and idempotent on every launch. */
export async function retryPendingCloudKeyDeletions(): Promise<{
	removed: number;
	remaining: number;
}> {
	const entries = pendingKeyDeletions();
	if (!hasDurableSecretStoreBridge || entries.length === 0) {
		return { removed: 0, remaining: entries.length };
	}
	if (!(await vaultKeyManager.custodyAvailable())) {
		return { removed: 0, remaining: entries.length };
	}
	let removed = 0;
	for (const entry of entries) {
		try {
			await vaultKeyManager.forget(entry.accountId, entry.vaultId);
			dequeueKeyDeletion(entry);
			removed += 1;
		} catch {
			// Keep the marker. A later launch may have a working credential backend.
		}
	}
	return { removed, remaining: pendingKeyDeletions().length };
}
