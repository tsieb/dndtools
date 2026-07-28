import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
	encodeCode,
	decodeCode,
	setRtcIceServers,
	clearRtcIceServers,
	createOffer,
	type OfferPayload,
	type AnswerPayload,
} from './signaling';

// signaling.ts is the transport seam shared by LAN and internet play. Two things
// matter for the online path: (1) the offer/answer wire codes round-trip exactly
// (players hold them as opaque credentials), and (2) minted STUN/TURN servers
// injected via setRtcIceServers actually reach the RTCPeerConnection so the gathered
// SDP carries internet-reachable candidates.

const offer: OfferPayload = {
	v: 1,
	role: 'offer',
	sessionId: 'sess-123',
	actorId: 'actor-7',
	displayName: 'Aria the Bold',
	participantRole: 'player',
	keyB64: 'YWJjZGVmZ2hpamtsbW5vcA==',
	sdp: 'v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n',
};

const answer: AnswerPayload = {
	v: 1,
	role: 'answer',
	sessionId: 'sess-123',
	actorId: 'actor-7',
	sdp: 'v=0\r\na=answer\r\n',
};

describe('connection code encode/decode', () => {
	it('round-trips an offer payload exactly', async () => {
		expect(await decodeCode<OfferPayload>(await encodeCode(offer))).toEqual(offer);
	});

	it('round-trips an answer payload exactly', async () => {
		expect(await decodeCode<AnswerPayload>(await encodeCode(answer))).toEqual(answer);
	});

	it('emits URL-safe base64 (no +, /, or = padding) so it survives QR and copy/paste', async () => {
		const code = await encodeCode(offer);
		expect(code).not.toMatch(/[+/=]/);
	});

	it('round-trips a large, compressible payload (exercises the gzip path)', async () => {
		const big: OfferPayload = { ...offer, sdp: 'a=candidate\r\n'.repeat(400) };
		const code = await encodeCode(big);
		// The gzip flag should have kicked in for a highly repetitive body.
		expect(code.length).toBeLessThan(big.sdp.length);
		expect(await decodeCode<OfferPayload>(code)).toEqual(big);
	});

	it('throws on a code that is too short to be valid (decodes to < 2 bytes)', async () => {
		await expect(decodeCode('AA')).rejects.toThrow(/too short/i);
	});

	it('rejects oversized input before base64 allocation', async () => {
		await expect(decodeCode('A'.repeat(256 * 1024 + 1))).rejects.toThrow(/too large/i);
	});

	it('rejects structurally incomplete payloads', async () => {
		const malformed = { ...answer, actorId: '' };
		await expect(encodeCode(malformed as AnswerPayload)).rejects.toThrow(/not valid/i);
	});
});

describe('ICE server injection (internet remote play)', () => {
	const ICE: RTCIceServer[] = [
		{ urls: 'stun:stun.l.google.com:19302' },
		{ urls: ['turn:203.0.113.10:3478?transport=udp'], username: '123:opaque', credential: 'hmac' },
	];

	// Minimal RTCPeerConnection that captures the config it was constructed with and
	// reports ICE gathering as already complete so createOffer resolves synchronously.
	class FakeRTCPeerConnection {
		static lastConfig: RTCConfiguration | undefined;
		iceGatheringState = 'complete';
		localDescription = { sdp: 'FAKE_OFFER_SDP' };
		constructor(config?: RTCConfiguration) {
			FakeRTCPeerConnection.lastConfig = config;
		}
		createDataChannel() {
			return {} as RTCDataChannel;
		}
		async createOffer() {
			return { type: 'offer', sdp: 'FAKE_OFFER_SDP' } as RTCSessionDescriptionInit;
		}
		async setLocalDescription() {}
		addEventListener() {}
		removeEventListener() {}
	}

	let originalRTC: unknown;
	beforeEach(() => {
		originalRTC = (globalThis as Record<string, unknown>).RTCPeerConnection;
		(globalThis as Record<string, unknown>).RTCPeerConnection = FakeRTCPeerConnection;
		FakeRTCPeerConnection.lastConfig = undefined;
	});
	afterEach(() => {
		(globalThis as Record<string, unknown>).RTCPeerConnection = originalRTC;
		clearRtcIceServers();
	});

	it('defaults to no ICE servers (LAN-only, nothing external contacted)', async () => {
		await createOffer();
		expect(FakeRTCPeerConnection.lastConfig?.iceServers).toEqual([]);
	});

	it('injects minted STUN/TURN servers into the peer connection for subsequent offers', async () => {
		setRtcIceServers(ICE);
		await createOffer();
		expect(FakeRTCPeerConnection.lastConfig?.iceServers).toEqual(ICE);
	});

	it('clearRtcIceServers reverts to LAN-only', async () => {
		setRtcIceServers(ICE);
		clearRtcIceServers();
		await createOffer();
		expect(FakeRTCPeerConnection.lastConfig?.iceServers).toEqual([]);
	});
});
