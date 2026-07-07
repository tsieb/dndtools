// CLIENT-HELD VAULT KEY CUSTODY (ADR-017 / SEC-004). The per-vault E2EE keyring is a SECRET: it holds
// the raw AES-256 content keys that decrypt cloud artifacts. It must live ONLY in the OS-encrypted
// credential store (Electron safeStorage via durableSecretStore) — never in IndexedDB, localStorage,
// the op log, exports, or logs. This is the concrete realization of the `client-held` key custodian the
// release-approved cloud security model declares: the server never receives any of this material.
//
// Fail-closed device capability: durable custody requires the OS credential store. On the web (no
// keychain) durableSecretStore persists nothing, so a keyring generated there is MEMORY-ONLY and lost on
// reload — which would make cloud-synced data unrecoverable. So `custodyAvailable()` is false on web, and
// the cloud-sync gate (see cloudSync.ts) will not offer enablement on a device that cannot durably hold
// the client key. Encryption still works in-session; only durable cloud sync is gated off.

import {
	createVaultKeyring,
	decryptFromKeyring,
	encryptForKeyring,
	rotateVaultKeyring,
	type EncryptedEnvelope,
	type ParticipantKeyHolding,
	type VaultKeyring,
} from '@dndtools/core';
import { durableSecretStore } from './secureStore';

const NS = 'vaultkey:';

/** In-memory cache of decoded keyrings, keyed by vaultId, to avoid re-reading the OS store per op. */
const cache = new Map<string, VaultKeyring>();

async function readDurable(vaultId: string): Promise<VaultKeyring | null> {
	const raw = await durableSecretStore.get(NS + vaultId);
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as VaultKeyring;
		// Minimal shape guard — a corrupt record fails closed (treated as absent).
		// Require the current-epoch key to actually be present: a truncated/partial write that
		// dropped it must be rebuilt (fail closed), not loaded and then made to throw inside encrypt.
		if (
			parsed &&
			typeof parsed.currentEpoch === 'number' &&
			parsed.keys &&
			typeof parsed.keys[parsed.currentEpoch] === 'string'
		)
			return parsed;
	} catch {
		/* fall through — corrupt keyring is treated as absent (fail closed) */
	}
	return null;
}

async function persistDurable(vaultId: string, keyring: VaultKeyring): Promise<boolean> {
	return durableSecretStore.set(NS + vaultId, JSON.stringify(keyring));
}

/**
 * Get the vault's keyring, creating and durably persisting a fresh one on first use. Throws fail-closed
 * when durable custody is unavailable (web): we refuse to mint a key we cannot safely persist, because a
 * lost key means unrecoverable cloud data under the unsupported-by-design recovery model.
 */
async function getOrCreateKeyring(vaultId: string): Promise<VaultKeyring> {
	const cached = cache.get(vaultId);
	if (cached) return cached;

	const existing = await readDurable(vaultId);
	if (existing) {
		cache.set(vaultId, existing);
		return existing;
	}

	if (!(await durableSecretStore.available())) {
		throw new Error(
			'Vault key custody requires an OS credential store; this device cannot durably hold the client key (fail closed).',
		);
	}
	const fresh = createVaultKeyring();
	const stored = await persistDurable(vaultId, fresh);
	if (!stored) throw new Error('Failed to persist the vault keyring to the OS credential store (fail closed).');
	cache.set(vaultId, fresh);
	return fresh;
}

/**
 * Get an EXISTING keyring, or throw fail-closed. Unlike {@link getOrCreateKeyring} this NEVER mints key
 * material — decrypt must never fabricate a key. A device that holds no keyring cannot decrypt the vault's
 * artifacts (they were sealed under a key held only on the originating device), so minting a fresh random
 * keyring here would (a) fail the AES-GCM tag with a cryptic error and, worse, (b) durably persist a wrong
 * key that then re-seals NEW content under a divergent key — permanently forking/locking out the vault.
 */
async function requireExistingKeyring(vaultId: string): Promise<VaultKeyring> {
	const cached = cache.get(vaultId);
	if (cached) return cached;
	const existing = await readDurable(vaultId);
	if (!existing) {
		throw new Error('This device holds no vault key; the cloud artifact cannot be decrypted here (fail closed).');
	}
	cache.set(vaultId, existing);
	return existing;
}

export interface VaultKeyManager {
	/** Whether this device can durably hold the client-held key (OS credential store present). */
	custodyAvailable(): Promise<boolean>;
	/** Seal a value into an opaque envelope under the vault's current key epoch. */
	encrypt(vaultId: string, plaintext: unknown): Promise<EncryptedEnvelope>;
	/** Open an envelope with the vault's key for its epoch. Throws fail-closed if this device lacks that key. */
	decrypt(vaultId: string, envelope: EncryptedEnvelope): Promise<unknown>;
	/** Rotate the vault key on a participant revocation (mints a fresh epoch key the revoked party never holds). */
	rotate(vaultId: string, revoked: ParticipantKeyHolding): Promise<void>;
	/** Forget a vault's keyring from this device (cache + OS store). Does NOT affect the server or other devices. */
	forget(vaultId: string): Promise<void>;
}

export const vaultKeyManager: VaultKeyManager = {
	async custodyAvailable() {
		return durableSecretStore.available();
	},

	async encrypt(vaultId, plaintext) {
		const keyring = await getOrCreateKeyring(vaultId);
		return encryptForKeyring(keyring, plaintext);
	},

	async decrypt(vaultId, envelope) {
		const keyring = await requireExistingKeyring(vaultId); // NEVER mint on decrypt (fail closed)
		return decryptFromKeyring(keyring, envelope);
	},

	async rotate(vaultId, revoked) {
		const keyring = await getOrCreateKeyring(vaultId);
		const { keyring: rotated } = rotateVaultKeyring(keyring, revoked);
		const stored = await persistDurable(vaultId, rotated);
		if (!stored) throw new Error('Failed to persist the rotated vault keyring (fail closed).');
		cache.set(vaultId, rotated);
	},

	async forget(vaultId) {
		cache.delete(vaultId);
		await durableSecretStore.remove(NS + vaultId);
	},
};
