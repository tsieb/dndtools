import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The cloud DiscoveryBridge relays the SAME opaque offer/answer codes as the LAN
// bridge, but over the Cognito-gated signaling WebSocket. These tests drive it
// against a fake WebSocket so we can assert the exact wire protocol, the one-shot
// request/response waiters, TURN refresh → setRtcIceServers, and auth gating —
// with no real socket or cloud config.

vi.mock('../cloud/config', () => ({
	cloudConfig: {
		signalingWsUrl: 'wss://signal.example.com/dev',
		region: 'ca-central-1',
		userPoolId: 'pool',
		userPoolClientId: 'client',
	},
	isCloudConfigured: true,
}));
vi.mock('./signaling', () => ({
	setRtcIceServers: vi.fn(),
	clearRtcIceServers: vi.fn(),
}));

import { createCloudBridge } from './cloudBridge';
import { clearRtcIceServers, setRtcIceServers } from './signaling';
import { generateEcdhKeyPair, deriveWrapKey, wrapCode, unwrapCode } from './cloudCrypto';

// --- fake WebSocket -------------------------------------------------------------
type Listener = (ev: unknown) => void;
class FakeWebSocket {
	static OPEN = 1;
	static CLOSED = 3;
	static instances: FakeWebSocket[] = [];
	url: string;
	readyState = 0;
	sent: Record<string, unknown>[] = [];
	private listeners: Record<string, Listener[]> = {};
	constructor(url: string) {
		this.url = url;
		FakeWebSocket.instances.push(this);
	}
	addEventListener(type: string, cb: Listener) {
		(this.listeners[type] ??= []).push(cb);
	}
	send(data: string) {
		this.sent.push(JSON.parse(data));
	}
	close() {
		this.readyState = FakeWebSocket.CLOSED;
		this.emit('close', {});
	}
	// --- test drivers ---
	emit(type: string, ev: unknown) {
		(this.listeners[type] ?? []).forEach((cb) => cb(ev));
	}
	open() {
		this.readyState = FakeWebSocket.OPEN;
		this.emit('open', {});
	}
	deliver(obj: unknown) {
		this.emit('message', { data: JSON.stringify(obj) });
	}
	get lastSent() {
		return this.sent.at(-1);
	}
}

const flush = async (n = 3) => {
	for (let i = 0; i < n; i++) await Promise.resolve();
	// Several macrotask turns so chained async WebCrypto (ECDH derive → AES-GCM
	// open, in the cloud bridge's transparent code wrap) has time to settle.
	for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r));
};

async function waitForAction(sock: FakeWebSocket, action: string): Promise<void> {
	for (let attempt = 0; attempt < 50; attempt += 1) {
		if (sock.lastSent?.action === action) return;
		await new Promise((resolve) => setTimeout(resolve, 2));
	}
	throw new Error(`Timed out waiting for client action ${action}.`);
}
const token = () => Promise.resolve<string | null>('id-token');

let originalWS: unknown;
beforeEach(() => {
	FakeWebSocket.instances = [];
	originalWS = (globalThis as Record<string, unknown>).WebSocket;
	(globalThis as Record<string, unknown>).WebSocket = FakeWebSocket;
	vi.mocked(setRtcIceServers).mockClear();
	vi.mocked(clearRtcIceServers).mockClear();
});
afterEach(() => {
	(globalThis as Record<string, unknown>).WebSocket = originalWS;
});

/** Kick an op, let the socket be created, open it, and return the live fake socket. */
async function withOpenSocket(
	kick: () => Promise<unknown>,
): Promise<{ p: Promise<unknown>; sock: FakeWebSocket }> {
	const p = kick();
	p.catch(() => {}); // avoid unhandled-rejection noise before we await
	await flush();
	const sock = FakeWebSocket.instances.at(-1)!;
	sock.open();
	await flush();
	return { p, sock };
}

describe('createCloudBridge — connection & auth', () => {
	it('opens the signaling socket with the id token in the query string', async () => {
		const bridge = createCloudBridge(token);
		const { p, sock } = await withOpenSocket(() => bridge.browseStart());
		expect(sock.url).toBe('wss://signal.example.com/dev?token=id-token');
		await p;
	});

	it('refuses to connect when signed out (no id token)', async () => {
		const bridge = createCloudBridge(() => Promise.resolve(null));
		await expect(bridge.browseStart()).rejects.toThrow(/sign in/i);
		expect(FakeWebSocket.instances).toHaveLength(0);
	});

	it('available() is true only when configured AND holding a token', async () => {
		expect(await createCloudBridge(token).available()).toBe(true);
		expect(await createCloudBridge(() => Promise.resolve(null)).available()).toBe(false);
	});
});

describe('createCloudBridge — advertise (host)', () => {
	it('refreshes TURN then advertises, resolving once the server acks', async () => {
		const bridge = createCloudBridge(token);
		const { p, sock } = await withOpenSocket(() => bridge.advertise('sess-1', 'Strahd'));

		// First it asks for TURN creds...
		expect(sock.sent[0]).toEqual({ action: 'turnCredentials' });
		const ICE = [{ urls: 'turn:203.0.113.10:3478', username: 'u', credential: 'c' }];
		sock.deliver({ type: 'turn-credentials', iceServers: ICE });
		await flush();

		// ...injects them into the RTC config, then sends advertise.
		expect(setRtcIceServers).toHaveBeenCalledWith(ICE);
		expect(sock.lastSent).toEqual({ action: 'advertise', sessionId: 'sess-1', name: 'Strahd' });

		sock.deliver({ type: 'advertised', sessionId: 'sess-1' });
		await expect(p).resolves.toEqual({ ok: true });
	});

	it('refreshes TURN again immediately before each approved host offer', async () => {
		const bridge = createCloudBridge(token);
		const { p, sock } = await withOpenSocket(() => bridge.advertise('sess-1', 'Strahd'));
		sock.deliver({
			type: 'turn-credentials',
			ttl: 3600,
			iceServers: [{ urls: 'turn:first' }],
		});
		await flush();
		sock.deliver({ type: 'advertised', sessionId: 'sess-1' });
		await p;

		const prepare = bridge.prepareOffer();
		await flush();
		expect(sock.lastSent).toEqual({ action: 'turnCredentials' });
		sock.deliver({
			type: 'turn-credentials',
			ttl: 3600,
			iceServers: [{ urls: 'turn:fresh' }],
		});
		await prepare;
		expect(setRtcIceServers).toHaveBeenLastCalledWith([{ urls: 'turn:fresh' }]);
	});
});

describe('createCloudBridge — browse (client)', () => {
	it('delivers advertised services to onServices subscribers', async () => {
		const bridge = createCloudBridge(token);
		const services: unknown[] = [];
		bridge.onServices((s) => services.push(...s));

		const { p, sock } = await withOpenSocket(() => bridge.browseStart());
		expect(sock.lastSent).toEqual({ action: 'browse' });

		sock.deliver({
			type: 'services',
			services: [{ sessionId: 's-1', name: 'One', host: 'cloud', port: 0 }],
		});
		expect(services).toEqual([{ sessionId: 's-1', name: 'One', host: 'cloud', port: 0 }]);
		await p;
	});

	it('connect() refreshes TURN and sends a join for the chosen service', async () => {
		const bridge = createCloudBridge(token);
		const { p, sock } = await withOpenSocket(() =>
			bridge.connect({ sessionId: 's-1', name: 'One', host: 'cloud', port: 0 }),
		);

		expect(sock.sent[0]).toEqual({ action: 'turnCredentials' });
		sock.deliver({ type: 'turn-credentials', iceServers: [{ urls: 'turn:x' }] });
		await waitForAction(sock, 'join');
		// The join now carries the joiner's ephemeral ECDH public key (for the E2E code wrap).
		const join = sock.lastSent as { action: string; sessionId: string; pubKey: string };
		expect(join.action).toBe('join');
		expect(join.sessionId).toBe('s-1');
		expect(typeof join.pubKey).toBe('string');
		expect(join.pubKey.length).toBeGreaterThan(0);
		await p;
	});
});

describe('createCloudBridge — offer/answer relay callbacks', () => {
	async function connectedBridge() {
		const bridge = createCloudBridge(token);
		const { sock } = await withOpenSocket(() => bridge.browseStart());
		return { bridge, sock };
	}

	it('fires onOfferRequest with the requesting connection id (host side)', async () => {
		const { bridge, sock } = await connectedBridge();
		const reqIds: string[] = [];
		bridge.onOfferRequest((id) => reqIds.push(id));
		sock.deliver({ type: 'offer-request', reqId: 'player-conn' });
		expect(reqIds).toEqual(['player-conn']);
	});

	// Joiner side, full ECDH round-trip: connect mints the joiner key; the test plays the
	// host (derives the shared key from the joiner's public key, seals the offer). The relay
	// must never see plaintext — only ciphertext + public keys.
	it('E2E-decrypts a relayed offer and re-seals the answer (client side)', async () => {
		const PIN = 'shared-join-secret';
		const bridge = createCloudBridge(token);
		const { p, sock } = await withOpenSocket(() =>
			bridge.connect({ sessionId: 's-1', name: 'One', host: 'cloud', port: 0 }, PIN),
		);
		sock.deliver({ type: 'turn-credentials', iceServers: [{ urls: 'turn:x' }] });
		await waitForAction(sock, 'join');
		const join = sock.lastSent as { action: string; pubKey: string };
		expect(join.action).toBe('join');

		// Host (played by the test): derive the shared key from the SAME join PIN and seal an offer.
		const hostKp = await generateEcdhKeyPair();
		const hostWrap = await deriveWrapKey(hostKp.privateKey, join.pubKey, PIN);
		const sealedOffer = await wrapCode(hostWrap, 'OFFER-PLAINTEXT');
		expect(sealedOffer).not.toContain('OFFER-PLAINTEXT'); // wire carries ciphertext only

		const got: Array<[string, string]> = [];
		bridge.onOffer((reqId, code) => got.push([reqId, code]));
		sock.deliver({
			type: 'offer',
			reqId: 'player-conn',
			offerCode: sealedOffer,
			pubKey: hostKp.publicKeyB64,
		});
		await vi.waitFor(() => {
			expect(got).toEqual([['player-conn', 'OFFER-PLAINTEXT']]);
		}); // decrypted for SessionClient

		// The answer the joiner sends back must be sealed with the same shared key.
		await bridge.respondAnswer('player-conn', 'ANSWER-PLAINTEXT');
		const ans = sock.lastSent as { action: string; reqId: string; answerCode: string };
		expect(ans.action).toBe('answer');
		expect(ans.reqId).toBe('player-conn');
		expect(ans.answerCode).not.toContain('ANSWER-PLAINTEXT');
		expect(await unwrapCode(hostWrap, ans.answerCode)).toBe('ANSWER-PLAINTEXT');
		await p;
	});

	// Admission gate: a joiner holding the WRONG join PIN derives a different key and cannot open
	// the host's sealed offer, so the session key never reaches it and onOffer never fires with
	// plaintext — an uninvited user reaching the rendezvous still gets nothing usable.
	it('a wrong join PIN cannot open the relayed offer (no admission)', async () => {
		const bridge = createCloudBridge(token);
		const { p, sock } = await withOpenSocket(() =>
			bridge.connect({ sessionId: 's-1', name: 'One', host: 'cloud', port: 0 }, 'WRONG-PIN'),
		);
		sock.deliver({ type: 'turn-credentials', iceServers: [{ urls: 'turn:x' }] });
		await waitForAction(sock, 'join');
		const join = sock.lastSent as { action: string; pubKey: string };

		// Host seals the offer under the REAL PIN.
		const hostKp = await generateEcdhKeyPair();
		const hostWrap = await deriveWrapKey(hostKp.privateKey, join.pubKey, 'REAL-PIN');
		const sealedOffer = await wrapCode(hostWrap, 'OFFER-PLAINTEXT');

		const got: Array<[string, string]> = [];
		const errors: string[] = [];
		bridge.onOffer((reqId, code) => got.push([reqId, code]));
		bridge.onError((error) => errors.push(error.message));
		sock.deliver({
			type: 'offer',
			reqId: 'player-conn',
			offerCode: sealedOffer,
			pubKey: hostKp.publicKeyB64,
		});
		await vi.waitFor(() => {
			expect(errors).toEqual([
				'The DM did not accept this join code. Check the code and ask them to try again.',
			]);
		});
		// The joiner could not decrypt — no plaintext offer surfaced to SessionClient.
		expect(got).toEqual([]);
		await p;
	});

	it('sends an encrypted decline that the requester can authenticate', async () => {
		const { bridge, sock } = await connectedBridge();
		const joinerKp = await generateEcdhKeyPair();
		sock.deliver({
			type: 'offer-request',
			reqId: 'declined-player',
			pubKey: joinerKp.publicKeyB64,
		});
		await flush();

		await expect(bridge.rejectOffer('declined-player')).resolves.toBe(true);
		const refusal = sock.lastSent as {
			action: string;
			reqId: string;
			offerCode: string;
			pubKey: string;
		};
		expect(refusal.action).toBe('offer');
		expect(refusal.offerCode).not.toContain('declined');
		const key = await deriveWrapKey(joinerKp.privateKey, refusal.pubKey, '');
		expect(await unwrapCode(key, refusal.offerCode)).toBe('dndtools:join-declined:v1');
	});

	// Host side, full ECDH round-trip: an offer-request delivers the joiner's public key; the
	// test plays the joiner (derives the same key, opens the offer, seals the answer).
	it('seals a relayed offer and E2E-decrypts the answer (host side)', async () => {
		const { bridge, sock } = await connectedBridge();

		// Joiner (played by the test) mints its ephemeral key and "sends" it via offer-request.
		const joinerKp = await generateEcdhKeyPair();
		sock.deliver({ type: 'offer-request', reqId: 'player-conn', pubKey: joinerKp.publicKeyB64 });
		await flush();

		await bridge.respondOffer('player-conn', 'OFFER#1');
		const offer = sock.lastSent as {
			action: string;
			reqId: string;
			offerCode: string;
			pubKey: string;
		};
		expect(offer.action).toBe('offer');
		expect(offer.reqId).toBe('player-conn');
		expect(offer.offerCode).not.toContain('OFFER#1'); // sealed on the wire
		expect(typeof offer.pubKey).toBe('string');

		// Joiner derives the shared key and opens the offer. The bridge-as-host was not advertised
		// with a PIN here, so both sides use the empty default — the round-trip still exercises the
		// PIN-bound HKDF path (see the wrong-PIN test below for the admission gate).
		const joinerWrap = await deriveWrapKey(joinerKp.privateKey, offer.pubKey, '');
		expect(await unwrapCode(joinerWrap, offer.offerCode)).toBe('OFFER#1');

		// Joiner seals an answer with that key; the host bridge must decrypt it for SessionHost.
		const answers: string[] = [];
		bridge.onAnswer((code) => answers.push(code));
		const sealedAnswer = await wrapCode(joinerWrap, 'ANSWER#1');
		sock.deliver({ type: 'answer', reqId: 'player-conn', answerCode: sealedAnswer });
		await vi.waitFor(() => {
			expect(answers).toEqual(['ANSWER#1']);
		});
	});

	it('respondOffer fails closed if it never saw the joiner public key', async () => {
		const { bridge } = await connectedBridge();
		await expect(bridge.respondOffer('unknown-conn', 'OFFER#1')).rejects.toThrow(/joiner key/i);
	});

	it('unsubscribes cleanly (returned disposer stops further callbacks)', async () => {
		const { bridge, sock } = await connectedBridge();
		const hits: string[] = [];
		const off = bridge.onOfferRequest((id) => hits.push(id));
		off();
		sock.deliver({ type: 'offer-request', reqId: 'ignored' });
		expect(hits).toEqual([]);
	});
});

describe('createCloudBridge — teardown', () => {
	it('close() rejects any in-flight waiter and drops the socket', async () => {
		const bridge = createCloudBridge(token);
		// advertise parks on the turn-credentials waiter; close() should reject it.
		const p = bridge.advertise('s-1', 'Game');
		p.catch(() => {});
		await flush();
		const sock = FakeWebSocket.instances.at(-1)!;
		sock.open();
		await flush(); // now waiting for 'turn-credentials'

		bridge.close();
		await expect(p).rejects.toThrow(/closed/i);
		expect(sock.readyState).toBe(FakeWebSocket.CLOSED);
		expect(clearRtcIceServers).toHaveBeenCalled();
	});

	it('cannot resurrect a socket that opens after close()', async () => {
		const bridge = createCloudBridge(token);
		const pending = bridge.browseStart();
		pending.catch(() => {});
		await flush();
		const sock = FakeWebSocket.instances.at(-1)!;

		bridge.close();
		await expect(pending).rejects.toThrow(/cancelled|closed|reach/i);
		sock.open();
		await flush();
		expect(sock.readyState).toBe(FakeWebSocket.CLOSED);
		expect(sock.sent).toEqual([]);
	});
});
