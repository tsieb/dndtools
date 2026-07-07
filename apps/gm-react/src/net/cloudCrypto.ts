/**
 * Cloud-relay pairing crypto (internet remote play). The cloud signaling server is an
 * UNTRUSTED relay, but the LAN/QR pairing code embeds the raw AES-GCM session key
 * (`OfferPayload.keyB64`) and the SDP. Over LAN/QR that code travels out-of-band and the
 * relay never sees it — but the cloud bridge relays the SAME code through the signaling
 * server. To keep the session key off the wire, the cloud bridge performs an ephemeral
 * ECDH (P-256) key agreement and encrypts the offer/answer codes with the derived key:
 * the relay only ever sees each side's ephemeral PUBLIC key plus AES-GCM ciphertext,
 * never the session key or SDP.
 *
 * Ephemeral keys are non-extractable and per-pairing (a fresh pair each join), so there
 * is nothing to persist and nothing to leak. This defeats a passive/curious relay (and
 * anything reading its logs).
 *
 * ADMISSION + ACTIVE-MITM: the derived key is additionally bound to an out-of-band shared
 * secret (the session's join PIN) mixed into the HKDF salt. A joiner that does not hold the
 * PIN derives a DIFFERENT key and therefore cannot open the sealed offer (which carries the
 * raw session key) nor complete the handshake — so the PIN is the cloud admission credential,
 * restoring the "possession of the code is the credential" trust model that LAN/QR gets for
 * free from out-of-band exchange. Because the relay never learns the PIN and cannot compute
 * the ECDH shared secret, it also cannot brute-force the PIN offline nor mount the active
 * key-substitution MITM that bare ECDH left open. The app-layer per-invitation AES-GCM seal
 * (net/crypto.ts) remains the inner layer regardless.
 *
 * WebCrypto only (crypto.subtle) — works in the web build and the Electron renderer, no
 * dependency, no CSP connect-src implication.
 */

const subtle = (): SubtleCrypto => {
	if (typeof crypto === 'undefined' || !crypto.subtle) {
		throw new Error('WebCrypto (crypto.subtle) is unavailable in this environment.');
	}
	return crypto.subtle;
};

/** Copy into a fresh ArrayBuffer-backed buffer (TS 6 typed-array/BufferSource strictness). */
function ab(bytes: Uint8Array): ArrayBuffer {
	const out = new ArrayBuffer(bytes.byteLength);
	new Uint8Array(out).set(bytes);
	return out;
}

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

export interface EcdhKeyPair {
	/** base64 raw P-256 public key, safe to hand to the (untrusted) relay. */
	publicKeyB64: string;
	/** non-extractable private key — never leaves this device. */
	privateKey: CryptoKey;
}

/** Mint a fresh, non-extractable ephemeral ECDH (P-256) key pair for one pairing. */
export async function generateEcdhKeyPair(): Promise<EcdhKeyPair> {
	const kp = await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, [
		'deriveBits',
	]);
	const raw = new Uint8Array(await subtle().exportKey('raw', kp.publicKey));
	return { publicKeyB64: bytesToBase64(raw), privateKey: kp.privateKey };
}

// HKDF context label — pins this key schedule to this app + version so a derived key can
// never be confused with one from another protocol using the same ECDH secret.
const HKDF_INFO = 'dndtools-cloud-pairing-v1';

/**
 * Derive the shared AES-GCM wrapping key from our private key, the peer's public key, AND the
 * out-of-band session join PIN. The PIN is folded into the HKDF salt: the same ECDH secret with
 * a different PIN yields a different key, so a joiner that lacks the PIN cannot produce the key
 * that opens the sealed offer/answer. Route: ECDH → shared bits → HKDF-SHA256(salt = sha256(pin))
 * → AES-256-GCM. The relay sees only public keys + ciphertext and never the PIN, so it can
 * neither derive the key nor brute-force the PIN offline (it lacks the ECDH private halves).
 */
export async function deriveWrapKey(
	privateKey: CryptoKey,
	peerPublicKeyB64: string,
	pin: string,
): Promise<CryptoKey> {
	const peer = await subtle().importKey(
		'raw',
		ab(base64ToBytes(peerPublicKeyB64)),
		{ name: 'ECDH', namedCurve: 'P-256' },
		false,
		[],
	);
	// ECDH → raw shared secret bits (not a key), so we can run them through HKDF with the PIN.
	const sharedBits = await subtle().deriveBits({ name: 'ECDH', public: peer }, privateKey, 256);
	const hkdfKey = await subtle().importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
	// Salt = sha256(PIN): binds the out-of-band admission secret into the key schedule.
	const salt = new Uint8Array(await subtle().digest('SHA-256', ab(new TextEncoder().encode(pin))));
	return subtle().deriveKey(
		{
			name: 'HKDF',
			hash: 'SHA-256',
			salt: ab(salt),
			info: ab(new TextEncoder().encode(HKDF_INFO)),
		},
		hkdfKey,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt'],
	);
}

/** Mint a strong (128-bit) random join secret, base64url, shared out-of-band inside the join code. */
export function generateJoinPin(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	return toB64Url(bytesToBase64(bytes));
}

const toB64Url = (b64: string): string => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64Url = (u: string): string => u.replace(/-/g, '+').replace(/_/g, '/');

/**
 * The single out-of-band "online join code" the DM shares (copy/QR), bundling the session id
 * with its join PIN so the joiner needs exactly one string — mirroring the LAN invite code.
 * base64url of a compact JSON tuple; opaque to anyone without it.
 */
export function encodeJoinCode(sessionId: string, pin: string): string {
	const json = JSON.stringify({ s: sessionId, p: pin });
	return toB64Url(bytesToBase64(new TextEncoder().encode(json)));
}

/** Reverse {@link encodeJoinCode}. Throws on a malformed code. */
export function decodeJoinCode(code: string): { sessionId: string; pin: string } {
	let obj: unknown;
	try {
		obj = JSON.parse(new TextDecoder().decode(base64ToBytes(fromB64Url(code.trim()))));
	} catch {
		throw new Error('That online join code is not valid.');
	}
	const rec = obj as { s?: unknown; p?: unknown };
	if (typeof rec?.s !== 'string' || typeof rec?.p !== 'string' || !rec.s) {
		throw new Error('That online join code is not valid.');
	}
	return { sessionId: rec.s, pin: rec.p };
}

/** AES-GCM seal a code string with a fresh 96-bit IV → compact "<ivB64>.<ctB64>". */
export async function wrapCode(key: CryptoKey, plaintext: string): Promise<string> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ct = new Uint8Array(
		await subtle().encrypt({ name: 'AES-GCM', iv: ab(iv) }, key, ab(new TextEncoder().encode(plaintext))),
	);
	return `${bytesToBase64(iv)}.${bytesToBase64(ct)}`;
}

/** Reverse {@link wrapCode}. Throws on a malformed frame or authentication failure. */
export async function unwrapCode(key: CryptoKey, sealed: string): Promise<string> {
	const dot = sealed.indexOf('.');
	if (dot < 0) throw new Error('Malformed wrapped code.');
	const iv = base64ToBytes(sealed.slice(0, dot));
	const ct = base64ToBytes(sealed.slice(dot + 1));
	const pt = new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: ab(iv) }, key, ab(ct)));
	return new TextDecoder().decode(pt);
}
