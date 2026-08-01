// CLIENT-HELD VAULT KEY CUSTODY (ADR-017 / SEC-004). Keyrings are secrets and live only in the
// Electron OS credential store. Every durable key namespace includes the authenticated account and
// vault, while every encryption additionally binds account/vault/artifact kind/revision through AES-GCM
// associated data in the core crypto module.

import {
	VAULT_KEYRING_SCHEMA_VERSION,
	createVaultKeyring,
	decryptFromKeyring,
	encryptForKeyring,
	mergeKeyrings,
	openKeyringRecoveryFile,
	rotateVaultKeyring,
	sealKeyringRecoveryFile,
	type ContextBoundEncryptedEnvelope,
	type EncryptedEnvelope,
	type ParticipantKeyHolding,
	type VaultArtifactContext,
	type VaultKeyring,
} from '@dndtools/core';
import { durableSecretStore } from './secureStore';

const NS = 'vaultkey:';
const SCOPED_VERSION = 'v2';
const MAX_KEY_EPOCHS = 1_024;

/** In-memory cache, account + vault scoped. */
const cache = new Map<string, VaultKeyring>();
/** A deletion-session barrier: an in-flight backup cannot recreate a key after account cleanup. */
const forgotten = new Set<string>();
let mutationTail: Promise<void> = Promise.resolve();

function cacheKey(accountId: string, vaultId: string): string {
	return JSON.stringify([accountId, vaultId]);
}

function toBase64Url(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function digestName(value: string): Promise<string> {
	if (!globalThis.crypto?.subtle) {
		throw new Error(
			'WebCrypto is unavailable; vault keys cannot be safely namespaced (fail closed).',
		);
	}
	const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return toBase64Url(new Uint8Array(digest));
}

async function scopedStorageKey(accountId: string, vaultId: string): Promise<string> {
	return `${NS}${SCOPED_VERSION}:${await digestName(JSON.stringify([accountId, vaultId]))}`;
}

async function legacyClaimKey(vaultId: string): Promise<string> {
	return `${NS}legacy-claim:${await digestName(vaultId)}`;
}

function validateNamespace(accountId: string, vaultId: string): void {
	const hasControlCharacter = (value: string) =>
		Array.from(value).some((character) => {
			const code = character.codePointAt(0) ?? 0;
			return code <= 0x1f || code === 0x7f;
		});
	if (
		typeof accountId !== 'string' ||
		accountId.length < 1 ||
		accountId.length > 256 ||
		typeof vaultId !== 'string' ||
		vaultId.length < 1 ||
		vaultId.length > 128 ||
		hasControlCharacter(accountId) ||
		hasControlCharacter(vaultId)
	) {
		throw new Error('A valid account and vault are required for client-held key custody.');
	}
}

function decodeKeyring(raw: string, storageKey: string): VaultKeyring {
	let candidate: unknown;
	try {
		candidate = JSON.parse(raw);
	} catch {
		throw new Error(`The stored vault keyring ${storageKey} is damaged; it was not replaced.`);
	}
	if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
		throw new Error(`The stored vault keyring ${storageKey} is invalid; it was not replaced.`);
	}
	const parsed = candidate as Partial<VaultKeyring>;
	const epochs = parsed.keys ? Object.entries(parsed.keys) : [];
	if (
		JSON.stringify(Object.keys(candidate).sort()) !==
			JSON.stringify(['currentEpoch', 'keys', 'schemaVersion']) ||
		parsed.schemaVersion !== VAULT_KEYRING_SCHEMA_VERSION ||
		!Number.isSafeInteger(parsed.currentEpoch) ||
		Number(parsed.currentEpoch) < 0 ||
		!parsed.keys ||
		typeof parsed.keys !== 'object' ||
		Array.isArray(parsed.keys) ||
		epochs.length < 1 ||
		epochs.length > MAX_KEY_EPOCHS ||
		epochs.some(
			([epoch, material]) =>
				!/^\d+$/.test(epoch) ||
				!Number.isSafeInteger(Number(epoch)) ||
				typeof material !== 'string' ||
				!/^[A-Za-z0-9_-]{43}$/.test(material),
		) ||
		typeof parsed.keys[Number(parsed.currentEpoch)] !== 'string'
	) {
		throw new Error(`The stored vault keyring ${storageKey} is invalid; it was not replaced.`);
	}
	return parsed as VaultKeyring;
}

async function readDurableAt(storageKey: string): Promise<VaultKeyring | null> {
	const raw = await durableSecretStore.get(storageKey);
	return raw === null ? null : decodeKeyring(raw, storageKey);
}

async function persistDurableAt(storageKey: string, keyring: VaultKeyring): Promise<void> {
	if (!(await durableSecretStore.set(storageKey, JSON.stringify(keyring)))) {
		throw new Error(
			'Failed to persist the vault keyring to the OS credential store (fail closed).',
		);
	}
}

function serialized<T>(operation: () => Promise<T>): Promise<T> {
	const result = mutationTail.then(operation, operation);
	mutationTail = result.then(
		() => undefined,
		() => undefined,
	);
	return result;
}

/**
 * Claim the released v0.2.0 `vaultkey:<vaultId>` key for at most one account. The claim is written
 * before the scoped copy, so a failed write can retry for the same account but can never copy one
 * legacy key into two account namespaces. The original remains for downgrade until `forget`.
 */
async function claimLegacyKeyring(
	accountId: string,
	vaultId: string,
	storageKey: string,
): Promise<VaultKeyring | null> {
	const legacyStorageKey = NS + vaultId;
	const legacy = await readDurableAt(legacyStorageKey);
	if (!legacy) return null;
	const claimStorageKey = await legacyClaimKey(vaultId);
	const existingClaim = await durableSecretStore.get(claimStorageKey);
	if (existingClaim !== null && existingClaim !== storageKey) return null;
	if (existingClaim === null && !(await durableSecretStore.set(claimStorageKey, storageKey))) {
		throw new Error('Failed to reserve the legacy vault key for this account (fail closed).');
	}
	await persistDurableAt(storageKey, legacy);
	return legacy;
}

/** Caller must hold `serialized`; this function may read, claim, create, persist, and fill the cache. */
async function loadScopedKeyring(
	accountId: string,
	vaultId: string,
	create: boolean,
): Promise<VaultKeyring> {
	validateNamespace(accountId, vaultId);
	const memoryKey = cacheKey(accountId, vaultId);
	if (forgotten.has(memoryKey)) {
		throw new Error('Vault key custody was removed for this deleted account.');
	}
	const cached = cache.get(memoryKey);
	if (cached) return cached;

	const storageKey = await scopedStorageKey(accountId, vaultId);
	let keyring = await readDurableAt(storageKey);
	if (!keyring) keyring = await claimLegacyKeyring(accountId, vaultId, storageKey);
	if (!keyring && create) {
		if (!(await durableSecretStore.available())) {
			throw new Error(
				'Vault key custody requires an OS credential store; this device cannot durably hold the client key (fail closed).',
			);
		}
		keyring = createVaultKeyring();
		await persistDurableAt(storageKey, keyring);
	}
	if (!keyring) {
		throw new Error(
			'This account has no vault key on this device; the cloud artifact cannot be decrypted here (fail closed).',
		);
	}
	cache.set(memoryKey, keyring);
	return keyring;
}

async function getScopedKeyring(
	accountId: string,
	vaultId: string,
	create: boolean,
): Promise<VaultKeyring> {
	validateNamespace(accountId, vaultId);
	const memoryKey = cacheKey(accountId, vaultId);
	if (forgotten.has(memoryKey)) {
		throw new Error('Vault key custody was removed for this deleted account.');
	}
	const cached = cache.get(memoryKey);
	if (cached) return cached;
	return serialized(() => loadScopedKeyring(accountId, vaultId, create));
}

export interface VaultKeyManager {
	/** Whether this device can durably hold the client-held key (OS credential store present). */
	custodyAvailable(): Promise<boolean>;
	/** Seal a value under an account-scoped key and exact artifact context. */
	encrypt(
		context: VaultArtifactContext,
		plaintext: unknown,
	): Promise<ContextBoundEncryptedEnvelope>;
	/** Open only a context-bound envelope for this account/vault/artifact/revision. */
	decrypt(context: VaultArtifactContext, envelope: EncryptedEnvelope): Promise<unknown>;
	/** Rotate one account + vault key on participant revocation. */
	rotate(accountId: string, vaultId: string, revoked: ParticipantKeyHolding): Promise<void>;
	/** Forget one account + vault keyring from cache and the OS store. */
	forget(accountId: string, vaultId: string): Promise<void>;
	/**
	 * ADR-026 recovery-key export: seal this account/vault keyring under a user passphrase and return
	 * the serialized recovery file for the user to save. Creates the keyring if none exists yet (so a
	 * user can export BEFORE the first backup); fails closed where custody is unavailable.
	 */
	exportRecoveryFile(accountId: string, vaultId: string, passphrase: string): Promise<string>;
	/**
	 * ADR-026 recovery-key import: open a recovery file with its passphrase and install the keyring
	 * into this device's OS credential store. Merges conservatively with any existing keyring
	 * (existing epochs win; the current epoch never rolls backwards).
	 */
	importRecoveryFile(
		accountId: string,
		vaultId: string,
		fileText: string,
		passphrase: string,
	): Promise<void>;
}

export const vaultKeyManager: VaultKeyManager = {
	async custodyAvailable() {
		return durableSecretStore.available();
	},

	async encrypt(context, plaintext) {
		const keyring = await getScopedKeyring(context.accountId, context.vaultId, true);
		return encryptForKeyring(keyring, plaintext, context);
	},

	async decrypt(context, envelope) {
		const keyring = await getScopedKeyring(context.accountId, context.vaultId, false);
		return decryptFromKeyring(keyring, envelope, context);
	},

	async rotate(accountId, vaultId, revoked) {
		validateNamespace(accountId, vaultId);
		await serialized(async () => {
			// Read + rotate + persist as one serialized mutation. Concurrent participant removals must
			// advance two epochs, never mint competing keys for the same epoch and lose one write.
			const keyring = await loadScopedKeyring(accountId, vaultId, true);
			if (Object.keys(keyring.keys).length >= MAX_KEY_EPOCHS) {
				throw new Error(
					'The vault keyring reached its safe epoch limit; rotation stopped fail closed.',
				);
			}
			const { keyring: rotated } = rotateVaultKeyring(keyring, revoked);
			const storageKey = await scopedStorageKey(accountId, vaultId);
			await persistDurableAt(storageKey, rotated);
			cache.set(cacheKey(accountId, vaultId), rotated);
		});
	},

	async exportRecoveryFile(accountId, vaultId, passphrase) {
		const keyring = await getScopedKeyring(accountId, vaultId, true);
		const file = await sealKeyringRecoveryFile(keyring, passphrase);
		return JSON.stringify(file, null, 2);
	},

	async importRecoveryFile(accountId, vaultId, fileText, passphrase) {
		validateNamespace(accountId, vaultId);
		if (typeof fileText !== 'string' || fileText.length === 0 || fileText.length > 256 * 1024) {
			throw new Error('This is not a Lamplight recovery-key file (fail closed).');
		}
		let candidate: unknown;
		try {
			candidate = JSON.parse(fileText);
		} catch {
			throw new Error('This is not a Lamplight recovery-key file (fail closed).');
		}
		const imported = await openKeyringRecoveryFile(candidate, passphrase);
		const memoryKey = cacheKey(accountId, vaultId);
		if (forgotten.has(memoryKey)) {
			throw new Error('Vault key custody was removed for this deleted account.');
		}
		await serialized(async () => {
			if (!(await durableSecretStore.available())) {
				throw new Error(
					'Vault key custody requires an OS credential store; this device cannot durably hold the recovered key (fail closed).',
				);
			}
			const storageKey = await scopedStorageKey(accountId, vaultId);
			const existing = await readDurableAt(storageKey);
			const next = existing ? mergeKeyrings(existing, imported) : imported;
			await persistDurableAt(storageKey, next);
			cache.set(memoryKey, next);
		});
	},

	async forget(accountId, vaultId) {
		validateNamespace(accountId, vaultId);
		const memoryKey = cacheKey(accountId, vaultId);
		// Set this synchronously before joining the mutation queue. Work already ahead of this deletion
		// may finish, but no later backup can create or cache replacement custody in this app session.
		forgotten.add(memoryKey);
		await serialized(async () => {
			const storageKey = await scopedStorageKey(accountId, vaultId);
			cache.delete(memoryKey);
			if (!(await durableSecretStore.remove(storageKey))) {
				throw new Error('Could not remove this account’s vault key from the OS credential store.');
			}
			const claimStorageKey = await legacyClaimKey(vaultId);
			if ((await durableSecretStore.get(claimStorageKey)) === storageKey) {
				if (!(await durableSecretStore.remove(NS + vaultId))) {
					throw new Error('Could not remove the claimed legacy vault key.');
				}
				if (!(await durableSecretStore.remove(claimStorageKey))) {
					throw new Error('Could not remove the legacy vault-key claim.');
				}
			}
		});
	},
};

export const __testing = {
	clearCache(): void {
		cache.clear();
		forgotten.clear();
		mutationTail = Promise.resolve();
	},
	scopedStorageKey,
};
