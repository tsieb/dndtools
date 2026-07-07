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
vi.mock('./signaling', () => ({ setRtcIceServers: vi.fn() }));

import { createCloudBridge } from './cloudBridge';
import { setRtcIceServers } from './signaling';

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
	await new Promise((r) => setTimeout(r));
};
const token = () => Promise.resolve<string | null>('id-token');

let originalWS: unknown;
beforeEach(() => {
	FakeWebSocket.instances = [];
	originalWS = (globalThis as Record<string, unknown>).WebSocket;
	(globalThis as Record<string, unknown>).WebSocket = FakeWebSocket;
	vi.mocked(setRtcIceServers).mockClear();
});
afterEach(() => {
	(globalThis as Record<string, unknown>).WebSocket = originalWS;
});

/** Kick an op, let the socket be created, open it, and return the live fake socket. */
async function withOpenSocket(kick: () => Promise<unknown>): Promise<{ p: Promise<unknown>; sock: FakeWebSocket }> {
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
});

describe('createCloudBridge — browse (client)', () => {
	it('delivers advertised services to onServices subscribers', async () => {
		const bridge = createCloudBridge(token);
		const services: unknown[] = [];
		bridge.onServices((s) => services.push(...s));

		const { p, sock } = await withOpenSocket(() => bridge.browseStart());
		expect(sock.lastSent).toEqual({ action: 'browse' });

		sock.deliver({ type: 'services', services: [{ sessionId: 's-1', name: 'One', host: 'cloud', port: 0 }] });
		expect(services).toEqual([{ sessionId: 's-1', name: 'One', host: 'cloud', port: 0 }]);
		await p;
	});

	it('connect() refreshes TURN and sends a join for the chosen service', async () => {
		const bridge = createCloudBridge(token);
		const { p, sock } = await withOpenSocket(() => bridge.connect({ sessionId: 's-1', name: 'One', host: 'cloud', port: 0 }));

		expect(sock.sent[0]).toEqual({ action: 'turnCredentials' });
		sock.deliver({ type: 'turn-credentials', iceServers: [{ urls: 'turn:x' }] });
		await flush();
		expect(sock.lastSent).toEqual({ action: 'join', sessionId: 's-1' });
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

	it('fires onOffer with reqId + opaque offer code (client side)', async () => {
		const { bridge, sock } = await connectedBridge();
		const got: Array<[string, string]> = [];
		bridge.onOffer((reqId, code) => got.push([reqId, code]));
		sock.deliver({ type: 'offer', reqId: 'player-conn', offerCode: 'OPAQUE-OFFER' });
		expect(got).toEqual([['player-conn', 'OPAQUE-OFFER']]);
	});

	it('fires onAnswer with the opaque answer code (host side)', async () => {
		const { bridge, sock } = await connectedBridge();
		const answers: string[] = [];
		bridge.onAnswer((code) => answers.push(code));
		sock.deliver({ type: 'answer', answerCode: 'OPAQUE-ANSWER' });
		expect(answers).toEqual(['OPAQUE-ANSWER']);
	});

	it('respondOffer / respondAnswer send the opaque codes with routing ids', async () => {
		const { bridge, sock } = await connectedBridge();
		await bridge.respondOffer('player-conn', 'OFFER#1');
		expect(sock.lastSent).toEqual({ action: 'offer', reqId: 'player-conn', offerCode: 'OFFER#1' });
		await bridge.respondAnswer('player-conn', 'ANSWER#1');
		expect(sock.lastSent).toEqual({ action: 'answer', reqId: 'player-conn', answerCode: 'ANSWER#1' });
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
	});
});
