import type { PeerMessage } from './messages';

/**
 * P2P application-layer message encryption (Epic 7.3 S7.3.4). Each session/invitation carries a
 * short-lived 256-bit AES-GCM key; every data-channel message is sealed with it. The key is exchanged
 * out-of-band inside the pairing payload (connection code / QR / mDNS handshake), so both peers share it
 * before the channel opens — every byte on the channel is encrypted from the first message.
 *
 * This is LAN-P2P transport crypto (a credential + revocation mechanism: whoever holds the key can talk;
 * the DM rotates or drops it to revoke a peer). It is intentionally DISTINCT from — and does not touch —
 * the deferred CLOUD storage crypto gated by `sync/cloud-sync-gate.ts` (SYNC-017), which governs at-rest
 * S3 artifacts and stays gated closed.
 *
 * Uses only `crypto.subtle` (WebCrypto), available in the web build and the Electron renderer alike —
 * no third-party dependency, no CSP `connect-src` implication.
 */

const subtle = (): SubtleCrypto => {
	if (typeof crypto === 'undefined' || !crypto.subtle) {
		throw new Error('WebCrypto (crypto.subtle) is unavailable in this environment.');
	}
	return crypto.subtle;
};

function bytesToBase64(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
	return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
	const binary = atob(b64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

/**
 * Copy bytes into a fresh, guaranteed-`ArrayBuffer`-backed buffer. Under TS 6's stricter typed-array
 * lib, `TextEncoder.encode()` and `Uint8Array` are typed as `ArrayBufferLike`-backed, which WebCrypto's
 * `BufferSource` parameters reject; this normalizes them at the boundary.
 */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	const out = new ArrayBuffer(bytes.byteLength);
	new Uint8Array(out).set(bytes);
	return out;
}

/** Mint a fresh, extractable 256-bit AES-GCM session key. */
export async function generateSessionKey(): Promise<CryptoKey> {
	return subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

/** Export a key to base64 raw bytes, for embedding in the pairing payload. */
export async function exportKeyBase64(key: CryptoKey): Promise<string> {
	const raw = new Uint8Array(await subtle().exportKey('raw', key));
	return bytesToBase64(raw);
}

/** Import a base64 raw AES-GCM key received in a pairing payload. */
export async function importKeyBase64(b64: string): Promise<CryptoKey> {
	return subtle().importKey('raw', toArrayBuffer(base64ToBytes(b64)), { name: 'AES-GCM' }, true, [
		'encrypt',
		'decrypt',
	]);
}

/**
 * Seal a message: JSON-encode, AES-GCM encrypt with a fresh random 96-bit IV, and return a compact
 * `"<ivB64>.<ctB64>"` string safe to put on the data channel.
 */
export async function seal(key: CryptoKey, message: PeerMessage): Promise<string> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const plaintext = new TextEncoder().encode(JSON.stringify(message));
	const ct = new Uint8Array(
		await subtle().encrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, toArrayBuffer(plaintext)),
	);
	return `${bytesToBase64(iv)}.${bytesToBase64(ct)}`;
}

/**
 * Open a sealed message. Throws if the ciphertext is malformed or the key is wrong (AES-GCM
 * authentication failure) — the caller treats a throw as a hostile/garbled frame and drops it. A peer
 * that has been revoked (its key rotated away) can no longer produce frames this opens.
 */
export async function open(key: CryptoKey, sealed: string): Promise<PeerMessage> {
	const dot = sealed.indexOf('.');
	if (dot < 0) throw new Error('Malformed sealed frame.');
	const iv = base64ToBytes(sealed.slice(0, dot));
	const ct = base64ToBytes(sealed.slice(dot + 1));
	const plaintext = new Uint8Array(
		await subtle().decrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, toArrayBuffer(ct)),
	);
	return JSON.parse(new TextDecoder().decode(plaintext)) as PeerMessage;
}
