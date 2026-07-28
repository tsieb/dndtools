/**
 * SERVERLESS WebRTC signaling (Epic 7.3 S7.3.1, LAN / zero external servers).
 *
 * There is no signaling server. The DM (host) creates an OFFER, and the offer + the session key + the
 * joiner's identity are packed into a compact CONNECTION CODE (also renderable as a QR). The joiner
 * decodes it, creates an ANSWER, and hands the answer code back to the host (paste, or automatically over
 * the Electron mDNS bridge). Both sides then hold a direct WebRTC data channel.
 *
 * LAN-only: `RTCPeerConnection` is built with `iceServers: []` — NO STUN/TURN, nothing external is ever
 * contacted. Connectivity relies on host + mDNS `.local` ICE candidates, which resolve between peers on
 * the same network. Gathering is NON-TRICKLE: we wait for `icegatheringstate === 'complete'` so the whole
 * candidate set is baked into the single SDP blob the code carries (no out-of-band trickle channel needed).
 */

/** The connection metadata embedded in the DM's OFFER code (the joiner's filtered join credential). */
export interface OfferPayload {
	v: number;
	role: 'offer';
	sessionId: string;
	/** The participant actor id this invitation admits (the host binds the connection to it). */
	actorId: string;
	displayName: string;
	participantRole: 'player' | 'observer' | 'co-dm';
	/** The base64 AES-GCM session key. Holding this code is the credential (S7.3.4). */
	keyB64: string;
	sdp: string;
}

/** The joiner's ANSWER code (the key was already delivered in the offer, so only the SDP travels back). */
export interface AnswerPayload {
	v: number;
	role: 'answer';
	sessionId: string;
	/** Echoed from the offer so concurrent replies are applied to the intended participant. */
	actorId: string;
	sdp: string;
}

export const SIGNALING_VERSION = 1 as const;
export const MAX_CONNECTION_CODE_CHARS = 256 * 1024;
const MAX_SIGNALING_JSON_BYTES = 1024 * 1024;
const MAX_SDP_CHARS = 768 * 1024;

// LAN play leaves this empty (host candidates only). Internet remote play injects
// minted STUN/TURN via setRtcIceServers() BEFORE creating/accepting an offer, so
// the non-trickle gathered SDP carries server-reflexive + relay candidates. WebRTC
// media is governed by the CSP `webrtc` directive, not `connect-src`.
let RTC_CONFIG: RTCConfiguration = { iceServers: [] };

/** Set the STUN/TURN servers used for subsequent peer connections (cloud transport). */
export function setRtcIceServers(iceServers: RTCIceServer[]): void {
	RTC_CONFIG = { ...RTC_CONFIG, iceServers };
}

/** Clear injected ICE servers, returning to LAN-only (host candidates). */
export function clearRtcIceServers(): void {
	RTC_CONFIG = { iceServers: [] };
}

// LAN host candidates gather in well under a second, but allocating a TURN relay
// candidate over the internet (cold coturn, TCP fallback, loaded network) can take
// several seconds — so the cap is longer whenever ICE servers are configured.
const iceGatherCapMs = (): number =>
	RTC_CONFIG.iceServers && RTC_CONFIG.iceServers.length > 0 ? 8000 : 4000;

/** Resolve once ICE gathering is complete (or after a short cap — LAN host candidates gather fast). */
function waitForIceGatheringComplete(
	pc: RTCPeerConnection,
	capMs = iceGatherCapMs(),
): Promise<void> {
	if (pc.iceGatheringState === 'complete') return Promise.resolve();
	return new Promise((resolve) => {
		const done = () => {
			pc.removeEventListener('icegatheringstatechange', check);
			resolve();
		};
		const check = () => {
			if (pc.iceGatheringState === 'complete') done();
		};
		pc.addEventListener('icegatheringstatechange', check);
		// Safety cap: if the browser withholds the `complete` transition, proceed with what we have.
		setTimeout(done, capMs);
	});
}

export interface CreatedOffer {
	pc: RTCPeerConnection;
	channel: RTCDataChannel;
	/** The full offer SDP with all LAN candidates gathered (non-trickle). */
	sdp: string;
}

/** Host side: open a data channel, create + gather the offer. */
export async function createOffer(): Promise<CreatedOffer> {
	const pc = new RTCPeerConnection(RTC_CONFIG);
	const channel = pc.createDataChannel('dndtools-session', { ordered: true });
	const offer = await pc.createOffer();
	await pc.setLocalDescription(offer);
	await waitForIceGatheringComplete(pc);
	return { pc, channel, sdp: pc.localDescription?.sdp ?? offer.sdp ?? '' };
}

export interface AcceptedOffer {
	pc: RTCPeerConnection;
	/** Resolves with the data channel once the host's channel arrives. */
	channel: Promise<RTCDataChannel>;
	/** The full answer SDP with all LAN candidates gathered (non-trickle). */
	sdp: string;
}

/** Joiner side: accept the host's offer SDP and create + gather the answer. */
export async function acceptOfferCreateAnswer(offerSdp: string): Promise<AcceptedOffer> {
	const pc = new RTCPeerConnection(RTC_CONFIG);
	const channel = new Promise<RTCDataChannel>((resolve) => {
		pc.addEventListener('datachannel', (ev) => resolve(ev.channel));
	});
	await pc.setRemoteDescription({ type: 'offer', sdp: offerSdp });
	const answer = await pc.createAnswer();
	await pc.setLocalDescription(answer);
	await waitForIceGatheringComplete(pc);
	return { pc, channel, sdp: pc.localDescription?.sdp ?? answer.sdp ?? '' };
}

/** Host side: apply the joiner's answer SDP to finish the handshake. */
export async function applyAnswer(pc: RTCPeerConnection, answerSdp: string): Promise<void> {
	await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
}

// --- code encode / decode --------------------------------------------------------------------------

function bytesToBase64Url(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(s: string): Uint8Array {
	if (!/^[A-Za-z0-9_-]+$/.test(s)) throw new Error('Connection code contains invalid characters.');
	const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
	const binary = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	const out = new ArrayBuffer(bytes.byteLength);
	new Uint8Array(out).set(bytes);
	return out;
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
	// CompressionStream is available in Chromium/Electron; fall back to identity if absent.
	const CS = (globalThis as { CompressionStream?: typeof CompressionStream }).CompressionStream;
	if (!CS) return bytes;
	const stream = new Response(
		new Blob([toArrayBuffer(bytes)]).stream().pipeThrough(new CS('gzip')),
	);
	return new Uint8Array(await stream.arrayBuffer());
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
	const DS = (globalThis as { DecompressionStream?: typeof DecompressionStream })
		.DecompressionStream;
	if (!DS) {
		if (bytes.byteLength > MAX_SIGNALING_JSON_BYTES)
			throw new Error('Connection code is too large.');
		return bytes;
	}
	const reader = new Blob([toArrayBuffer(bytes)]).stream().pipeThrough(new DS('gzip')).getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > MAX_SIGNALING_JSON_BYTES) {
				await reader.cancel();
				throw new Error('Connection code expands beyond the allowed size.');
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	const output = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		output.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return output;
}

// A 1-byte header flags whether the body is gzipped, so decode works whether or not the platform had
// CompressionStream when the code was produced.
const FLAG_GZIP = 0x01;
const FLAG_RAW = 0x00;

function isBoundedString(value: unknown, max: number): value is string {
	return typeof value === 'string' && value.length > 0 && value.length <= max;
}

function validatePayload(value: unknown): OfferPayload | AnswerPayload {
	if (!value || typeof value !== 'object')
		throw new Error('That connection code is not valid — copy the full code and try again.');
	const rec = value as Record<string, unknown>;
	if (
		rec.v !== SIGNALING_VERSION ||
		!isBoundedString(rec.sessionId, 128) ||
		!isBoundedString(rec.actorId, 128) ||
		!isBoundedString(rec.sdp, MAX_SDP_CHARS)
	)
		throw new Error('That connection code is not valid — copy the full code and try again.');
	if (rec.role === 'answer') {
		return rec as unknown as AnswerPayload;
	}
	if (
		rec.role !== 'offer' ||
		!isBoundedString(rec.displayName, 160) ||
		!['player', 'observer', 'co-dm'].includes(String(rec.participantRole)) ||
		!isBoundedString(rec.keyB64, 256) ||
		!/^[A-Za-z0-9+/]+={0,2}$/.test(rec.keyB64)
	)
		throw new Error('That connection code is not valid — copy the full code and try again.');
	return rec as unknown as OfferPayload;
}

/** Encode a pairing payload to a compact, copy/paste- and QR-friendly connection code. */
export async function encodeCode(payload: OfferPayload | AnswerPayload): Promise<string> {
	const validated = validatePayload(payload);
	const json = new TextEncoder().encode(JSON.stringify(validated));
	if (json.byteLength > MAX_SIGNALING_JSON_BYTES)
		throw new Error('The connection details are too large to fit in a code.');
	const compressed = await gzip(json);
	const useGzip = compressed.length < json.length;
	const body = useGzip ? compressed : json;
	const out = new Uint8Array(body.length + 1);
	out[0] = useGzip ? FLAG_GZIP : FLAG_RAW;
	out.set(body, 1);
	return bytesToBase64Url(out);
}

/** Decode a connection code back to its pairing payload. Throws on a malformed code. */
export async function decodeCode<T extends OfferPayload | AnswerPayload>(code: string): Promise<T> {
	const trimmed = code.trim();
	if (trimmed.length > MAX_CONNECTION_CODE_CHARS) throw new Error('Connection code is too large.');
	const bytes = base64UrlToBytes(trimmed);
	if (bytes.length < 2)
		throw new Error('That connection code is too short — copy the full code from the invite.');
	const flag = bytes[0]!;
	if (flag !== FLAG_GZIP && flag !== FLAG_RAW)
		throw new Error('That code doesn’t look like a connection code — copy it from the invite.');
	const body = bytes.slice(1);
	const json = flag === FLAG_GZIP ? await gunzip(body) : body;
	if (json.byteLength > MAX_SIGNALING_JSON_BYTES) throw new Error('Connection code is too large.');
	let parsed: unknown;
	try {
		parsed = JSON.parse(new TextDecoder().decode(json));
	} catch {
		throw new Error('That connection code is not valid — copy the full code and try again.');
	}
	return validatePayload(parsed) as T;
}
