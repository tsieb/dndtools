import type { CloudStoredArtifact } from './key-custody';
import type { ServerVisibleField } from './cloud-security-model';
import { rotateKeyOnRevocation, type KeyRotationResult, type ParticipantKeyHolding } from './key-custody';

/**
 * ADR-017 — CONCRETE CLIENT-HELD E2EE FOR CLOUD ARTIFACTS. This is the real cryptography that ADR-014
 * / ADR-015 explicitly DEFERRED: AES-256-GCM authenticated encryption of every cloud-bound artifact
 * (operation values, snapshots, asset blobs) with a CLIENT-HELD key, keyed by a monotonic KEY EPOCH
 * (SEC-012). Its existence is what makes the declared {@link CloudSyncSecurityModel} /
 * {@link CloudSecurityDecisionRecord} TRUTHFUL, so the fail-closed SYNC-017 / SEC-009 gates can open.
 *
 * Uses the standard WebCrypto `SubtleCrypto` API on `globalThis.crypto`, which is present in browsers,
 * in the Node 20 Lambda runtime, AND in the vitest runner — so the SAME encryption code runs on every
 * client and the envelope shape is shared with the server, which only ever STORES/RELAYS ciphertext and
 * NEVER decrypts (it holds no key material). Unlike the pure-policy modules (`key-custody`,
 * `cloud-security-model`), this module deliberately DOES touch a crypto API — it is the crypto seam.
 *
 * Key model (forward-secure on rotation): each epoch has its OWN independent random 256-bit content
 * key, held client-side in a {@link VaultKeyring}. A participant only ever receives the epoch keys they
 * are authorized for; on revocation the keyring rotates to a FRESH random key at a new epoch (composing
 * the logical {@link rotateKeyOnRevocation} epoch math) that the revoked party never holds — so content
 * encrypted under the new epoch is cryptographically undecryptable to them, not merely policy-blocked.
 */

export const VAULT_CRYPTO_SCHEMA_VERSION = 1 as const;
/** The AEAD used for all cloud artifacts. AES-GCM gives confidentiality + integrity (auth tag). */
export const VAULT_CRYPTO_ALG = 'AES-GCM' as const;
const AES_KEY_BITS = 256;
const AES_KEY_BYTES = AES_KEY_BITS / 8;
const GCM_IV_BYTES = 12; // 96-bit IV is the AES-GCM standard (NIST SP 800-38D).

/**
 * A sealed cloud artifact. Every field is OPAQUE to the server: `iv`/`ct`/`contentHash` are random-
 * looking base64url (no `/`, `+`, or `.` — so the diagnostics redaction guard never mistakes ciphertext
 * for a path/JWT/secret and flags it as a leak), `epoch` is an integer, and there is NO plaintext. The
 * whole envelope is stored/relayed as ciphertext; only the surrounding routing metadata (vault id,
 * participant id, revision, size, content hash, timestamp) is ever server-visible.
 */
export interface EncryptedEnvelope {
	/** Envelope schema version, for forward migration. */
	v: typeof VAULT_CRYPTO_SCHEMA_VERSION;
	/** The AEAD algorithm. Pinned to AES-GCM. */
	alg: typeof VAULT_CRYPTO_ALG;
	/** The key epoch this artifact was sealed under (SEC-012). Selects the decryption key from the keyring. */
	epoch: number;
	/** base64url of the 96-bit random GCM IV (unique per encryption; never reused under a key). */
	iv: string;
	/** base64url of the AES-GCM ciphertext (includes the authentication tag). */
	ct: string;
	/** base64url SHA-256 of the ciphertext — the `content-hash` server-visible metadata class (dedupe/integrity). */
	contentHash: string;
}

/**
 * A CLIENT-HELD keyring: the epoch → content-key material this device is authorized to read, plus the
 * current epoch new content is sealed under. Key material is raw 256-bit bytes (base64url) held ONLY in
 * the OS credential store / device-local encrypted storage — never synced, exported, logged, or placed
 * in the op log (SEC-004). The server never receives it.
 */
export interface VaultKeyring {
	schemaVersion: typeof VAULT_CRYPTO_SCHEMA_VERSION;
	/** The epoch new artifacts are sealed under. Content is decryptable only for epochs present in `keys`. */
	currentEpoch: number;
	/** epoch → base64url raw 256-bit key material. A missing epoch ⇒ this device cannot decrypt it (fail closed). */
	keys: Record<number, string>;
}

// --- base64url (no padding) — path/JWT/secret-safe encoding for ciphertext ------------------------

function toBase64Url(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
	// btoa is available in browsers, Node 16+, and workers; produce URL-safe, unpadded output.
	const base64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64');
	return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
	const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
	const binary = typeof atob === 'function' ? atob(base64) : Buffer.from(base64, 'base64').toString('binary');
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

/**
 * Copy bytes into a fresh, definitely-`ArrayBuffer`-backed view. TypeScript's typed-array generics
 * distinguish `Uint8Array<ArrayBuffer>` from `Uint8Array<ArrayBufferLike>` (a `TextEncoder`/`SharedArrayBuffer`
 * result is the latter); WebCrypto's `BufferSource` wants the former, so we normalize at each call site.
 */
function ab(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
	const out = new Uint8Array(bytes.length);
	out.set(bytes);
	return out;
}

function subtle(): SubtleCrypto {
	const c = globalThis.crypto;
	if (!c?.subtle) {
		// Fail closed: without WebCrypto there is no E2EE, so cloud sync must not proceed.
		throw new Error('WebCrypto SubtleCrypto is unavailable; cloud E2EE cannot proceed (fail closed).');
	}
	return c.subtle;
}

function randomBytes(length: number): Uint8Array {
	const c = globalThis.crypto;
	if (!c?.getRandomValues) throw new Error('WebCrypto getRandomValues is unavailable (fail closed).');
	return c.getRandomValues(new Uint8Array(length));
}

// --- Key material -------------------------------------------------------------------------------

/** Generate a fresh random 256-bit content-key material (one epoch's key). Raw bytes, device-local only. */
export function generateContentKeyMaterial(): Uint8Array {
	return randomBytes(AES_KEY_BYTES);
}

async function importAesKey(material: Uint8Array, usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
	if (material.length !== AES_KEY_BYTES) {
		throw new Error(`Vault content key must be ${AES_KEY_BYTES} bytes; got ${material.length} (fail closed).`);
	}
	// Non-extractable: once imported the raw key cannot be read back out of the CryptoKey.
	return subtle().importKey('raw', ab(material), { name: VAULT_CRYPTO_ALG }, false, [usage]);
}

// --- Keyring lifecycle (composes the SEC-012 epoch math) -----------------------------------------

/** Create a fresh single-epoch keyring at epoch 0 with a new random content key. */
export function createVaultKeyring(): VaultKeyring {
	return {
		schemaVersion: VAULT_CRYPTO_SCHEMA_VERSION,
		currentEpoch: 0,
		keys: { 0: toBase64Url(generateContentKeyMaterial()) },
	};
}

export interface KeyringRotationResult {
	/** The rotated keyring: a fresh random key added at the new current epoch (old keys retained to read old content). */
	keyring: VaultKeyring;
	/** The logical epoch-holding math for the revoked participant (SEC-012 AC1), for the custody records. */
	rotation: KeyRotationResult;
}

/**
 * Rotate the keyring on a participant's revocation: bump the epoch (via the SEC-012 {@link rotateKeyOnRevocation})
 * and mint a FRESH random content key for the new epoch. The revoked participant never receives the new key, so
 * anything sealed under the new epoch is cryptographically undecryptable to them. Pure w.r.t. the input keyring
 * (returns a new object); the only side effect is generating fresh random key material.
 */
export function rotateVaultKeyring(
	keyring: VaultKeyring,
	revokedHolding: ParticipantKeyHolding,
): KeyringRotationResult {
	const rotation = rotateKeyOnRevocation(keyring.currentEpoch, revokedHolding);
	return {
		keyring: {
			...keyring,
			currentEpoch: rotation.newCurrentEpoch,
			keys: { ...keyring.keys, [rotation.newCurrentEpoch]: toBase64Url(generateContentKeyMaterial()) },
		},
		rotation,
	};
}

/** The raw key material for an epoch, or null when this device does not hold it (fail closed on decrypt). */
function keyMaterialForEpoch(keyring: VaultKeyring, epoch: number): Uint8Array | null {
	const material = keyring.keys[epoch];
	return material ? fromBase64Url(material) : null;
}

// --- Encrypt / decrypt --------------------------------------------------------------------------

/**
 * Seal a value into an {@link EncryptedEnvelope} under the keyring's CURRENT epoch. The plaintext is
 * JSON-serialized, encrypted with AES-256-GCM under a fresh random IV, and content-hashed. The returned
 * envelope carries NO plaintext and is safe to hand to the (untrusted) server.
 */
export async function encryptForKeyring(keyring: VaultKeyring, plaintext: unknown): Promise<EncryptedEnvelope> {
	const material = keyMaterialForEpoch(keyring, keyring.currentEpoch);
	if (!material) throw new Error(`Keyring has no key for its current epoch ${keyring.currentEpoch} (fail closed).`);
	return sealWithKeyMaterial(material, keyring.currentEpoch, plaintext);
}

/** Lower-level seal: encrypt `plaintext` under explicit `keyMaterial` at `epoch`. Used by the keyring path and tests. */
export async function sealWithKeyMaterial(
	keyMaterial: Uint8Array,
	epoch: number,
	plaintext: unknown,
): Promise<EncryptedEnvelope> {
	const key = await importAesKey(keyMaterial, 'encrypt');
	const iv = randomBytes(GCM_IV_BYTES);
	const data = new TextEncoder().encode(JSON.stringify(plaintext ?? null));
	const cipher = new Uint8Array(await subtle().encrypt({ name: VAULT_CRYPTO_ALG, iv: ab(iv) }, key, ab(data)));
	const contentHash = new Uint8Array(await subtle().digest('SHA-256', cipher));
	return {
		v: VAULT_CRYPTO_SCHEMA_VERSION,
		alg: VAULT_CRYPTO_ALG,
		epoch,
		iv: toBase64Url(iv),
		ct: toBase64Url(cipher),
		contentHash: toBase64Url(contentHash),
	};
}

/**
 * Open an {@link EncryptedEnvelope} using the keyring's key for the envelope's epoch. Throws fail-closed
 * when this device does not hold that epoch's key (revocation lockout) or when the AES-GCM auth tag fails
 * (tamper / wrong key). Returns the original JSON value.
 */
export async function decryptFromKeyring(keyring: VaultKeyring, envelope: EncryptedEnvelope): Promise<unknown> {
	const material = keyMaterialForEpoch(keyring, envelope.epoch);
	if (!material) {
		throw new Error(
			`This device holds no key for epoch ${envelope.epoch}; the artifact is undecryptable here (fail closed).`,
		);
	}
	return openWithKeyMaterial(material, envelope);
}

/** Lower-level open: decrypt `envelope` under explicit `keyMaterial`. AES-GCM verifies integrity (throws on tamper/wrong key). */
export async function openWithKeyMaterial(keyMaterial: Uint8Array, envelope: EncryptedEnvelope): Promise<unknown> {
	if (envelope.alg !== VAULT_CRYPTO_ALG) throw new Error(`Unsupported envelope algorithm ${envelope.alg} (fail closed).`);
	const key = await importAesKey(keyMaterial, 'decrypt');
	const iv = fromBase64Url(envelope.iv);
	const cipher = fromBase64Url(envelope.ct);
	const plain = new Uint8Array(await subtle().decrypt({ name: VAULT_CRYPTO_ALG, iv: ab(iv) }, key, ab(cipher)));
	return JSON.parse(new TextDecoder().decode(plain));
}

// --- Bridges to the SEC-009 / SEC-012 server-visibility + trust-boundary guards -------------------
// These let a cloud-publish path (and the tests) PROVE the E2EE claim: the envelope is ciphertext and the
// only server-visible metadata it contributes is content-hash + operation-size (both allowed classes).

/** Shape an envelope as a `ciphertext`-class stored artifact for {@link evaluateServerTrustBoundary}. */
export function envelopeAsStoredArtifact(id: string, envelope: EncryptedEnvelope): CloudStoredArtifact {
	// The stored value is the whole opaque envelope; every field is random/hash/int — no plaintext content.
	return { id, dataClass: 'ciphertext', value: envelope };
}

/**
 * The server-visible METADATA an envelope contributes, for {@link assertServerSeesOnlyAllowedMetadata}: the
 * ciphertext content hash (`content-hash`) and the ciphertext byte size (`operation-size`). Both are allowed
 * classes; neither carries plaintext. Routing metadata (vault/participant/revision/timestamp) is added by the
 * caller from the surrounding operation, not from the envelope.
 */
export function envelopeServerVisibleFields(envelope: EncryptedEnvelope): ServerVisibleField[] {
	return [
		{ field: 'contentHash', metadataClass: 'content-hash', value: envelope.contentHash },
		{ field: 'operationSize', metadataClass: 'operation-size', value: fromBase64Url(envelope.ct).length },
	];
}
