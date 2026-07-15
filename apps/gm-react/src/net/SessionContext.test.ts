// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	auth: {
		current: null as unknown,
	},
	plan: { current: 'lantern' },
	runtime: {
		actors: [
			{ id: 'dm-1', displayName: 'Morgan', role: 'dm' },
			{ id: 'player-1', displayName: 'Ari', role: 'player' },
			{ id: 'codm-1', displayName: 'Sam', role: 'co-dm' },
		],
	},
	offerRequest: { current: null as ((requestId: string) => void) | null },
	answer: { current: null as ((answerCode: string) => void) | null },
	hostInvite: vi.fn(),
	hostStop: vi.fn(),
	hostRevoke: vi.fn(),
	advertise: vi.fn(async () => ({ ok: true })),
	stopAdvertise: vi.fn(async () => {}),
	prepareOffer: vi.fn(async () => {}),
	respondOffer: vi.fn(async () => true),
	close: vi.fn(),
	clearIce: vi.fn(),
}));

vi.mock('../runtime/RuntimeContext', () => ({ useRuntime: () => mocks.runtime }));
vi.mock('../cloud/AuthContext', () => ({ useAuth: () => mocks.auth.current }));
vi.mock('../cloud/entitlements', () => ({
	useEntitlements: () => ({ plan: mocks.plan.current }),
}));
vi.mock('../cloud/config', () => ({ isCloudConfigured: true }));
vi.mock('./discovery', () => ({ getDiscovery: () => null }));
vi.mock('./cloudCrypto', () => ({
	generateJoinPin: () => 'private-pin',
	encodeJoinCode: (sessionId: string, pin: string) => `${sessionId}:${pin}`,
	decodeJoinCode: () => ({ sessionId: 'session-1', pin: 'private-pin' }),
}));
vi.mock('./signaling', () => ({ clearRtcIceServers: mocks.clearIce }));
vi.mock('./cloudBridge', () => ({
	createCloudBridge: () => ({
		available: vi.fn(async () => true),
		advertise: mocks.advertise,
		stopAdvertise: mocks.stopAdvertise,
		browseStart: vi.fn(async () => {}),
		browseStop: vi.fn(async () => {}),
		connect: vi.fn(async () => {}),
		onOfferRequest: vi.fn((cb: (requestId: string) => void) => {
			mocks.offerRequest.current = cb;
			return () => {
				if (mocks.offerRequest.current === cb) mocks.offerRequest.current = null;
			};
		}),
		respondOffer: mocks.respondOffer,
		rejectOffer: vi.fn(async () => true),
		onAnswer: vi.fn((cb: (answerCode: string) => void) => {
			mocks.answer.current = cb;
			return () => {
				if (mocks.answer.current === cb) mocks.answer.current = null;
			};
		}),
		onOffer: vi.fn(() => () => {}),
		respondAnswer: vi.fn(async () => {}),
		onServices: vi.fn(() => () => {}),
		prepareOffer: mocks.prepareOffer,
		onError: vi.fn(() => () => {}),
		close: mocks.close,
	}),
}));
vi.mock('./SessionHost', () => ({
	SessionHost: class {
		readonly sessionId: string;
		connectedPeers: Array<{
			peerId: string;
			actorId: string;
			displayName: string;
			role: 'player' | 'observer' | 'co-dm';
			connected: boolean;
			status: 'online' | 'away';
			hand: boolean;
			ready: boolean;
		}> = [];

		constructor(_runtime: unknown, sessionId: string) {
			this.sessionId = sessionId;
		}

		onChange() {}

		async invite(actorId: string) {
			mocks.hostInvite(actorId);
			return {
				peerId: `peer-${actorId}`,
				actorId,
				displayName: actorId === 'codm-1' ? 'Sam' : 'Ari',
				offerCode: `offer-${actorId}`,
			};
		}

		async acceptAnswer() {}

		revoke(peerId: string) {
			mocks.hostRevoke(peerId);
		}

		stop() {
			mocks.hostStop();
		}
	},
}));
vi.mock('./SessionClient', () => ({
	SessionClient: class {
		onChange() {}
		getState() {
			return { status: 'idle', identity: null, data: null, presence: [], error: null };
		}
		leave() {}
	},
}));

import { SessionProvider, useSession } from './SessionContext';

type SessionValue = ReturnType<typeof useSession>;
let latest: SessionValue | null = null;
let root: Root;
let container: HTMLDivElement;

function Probe() {
	latest = useSession();
	return null;
}

function current(): SessionValue {
	if (!latest) throw new Error('Session probe has not rendered.');
	return latest;
}

function signedInAuth() {
	return {
		status: 'signed-in',
		requireAuth: vi.fn(async () => true),
		getIdToken: vi.fn(async () => 'id-token'),
	};
}

async function renderProvider() {
	await act(async () => {
		root.render(createElement(SessionProvider, null, createElement(Probe)));
	});
}

beforeEach(() => {
	(
		globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
	).IS_REACT_ACT_ENVIRONMENT = true;
	mocks.auth.current = signedInAuth();
	mocks.plan.current = 'lantern';
	mocks.offerRequest.current = null;
	mocks.answer.current = null;
	mocks.hostInvite.mockClear();
	mocks.hostStop.mockClear();
	mocks.hostRevoke.mockClear();
	mocks.advertise.mockReset().mockResolvedValue({ ok: true });
	mocks.stopAdvertise.mockReset().mockResolvedValue(undefined);
	mocks.prepareOffer.mockClear();
	mocks.respondOffer.mockReset().mockResolvedValue(true);
	mocks.close.mockClear();
	mocks.clearIce.mockClear();
	latest = null;
	container = document.createElement('div');
	document.body.append(container);
	root = createRoot(container);
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('online session admission', () => {
	it('queues an online requester without assigning anyone, then admits the explicit Co-DM choice', async () => {
		await renderProvider();
		await act(async () => {
			expect(await current().startHostingOnline()).toBe(true);
		});

		await act(async () => mocks.offerRequest.current?.('request-1'));
		expect(mocks.hostInvite).not.toHaveBeenCalled();
		expect(current().pendingJoins).toEqual([
			expect.objectContaining({ id: 'online:request-1', transport: 'online' }),
		]);

		await act(async () => current().approveJoin('online:request-1', 'codm-1'));
		expect(mocks.prepareOffer).toHaveBeenCalledOnce();
		expect(mocks.hostInvite).toHaveBeenCalledWith('codm-1');
		expect(mocks.respondOffer).toHaveBeenCalledWith('request-1', 'offer-codm-1');
		expect(current().pendingJoins).toEqual([]);
	});

	it('closes signaling and removes the online code on sign-out without stopping local hosting', async () => {
		await renderProvider();
		await act(async () => {
			await current().startHostingOnline();
		});
		expect(current().role).toBe('host');
		expect(current().onlineJoinCode).toContain('private-pin');

		mocks.auth.current = {
			status: 'signed-out',
			requireAuth: vi.fn(async () => false),
			getIdToken: vi.fn(async () => null),
		};
		await renderProvider();

		expect(mocks.close).toHaveBeenCalled();
		expect(mocks.clearIce).toHaveBeenCalled();
		expect(current().onlineJoinCode).toBeNull();
		expect(current().role).toBe('host');
		expect(mocks.hostStop).not.toHaveBeenCalled();
	});

	it('revokes the participant invitation when delivering the offer fails', async () => {
		await renderProvider();
		await act(async () => {
			await current().startHostingOnline();
			mocks.offerRequest.current?.('request-2');
		});
		mocks.respondOffer.mockResolvedValueOnce(false);

		await act(async () => {
			await expect(current().approveJoin('online:request-2', 'player-1')).rejects.toThrow(
				/expired/i,
			);
		});
		expect(mocks.hostRevoke).toHaveBeenCalledWith('peer-player-1');
		expect(current().pendingJoins).toEqual([]);
	});

	it('does not resurrect an advertisement that finishes after Stop hosting', async () => {
		let finishAdvertise!: (value: { ok: true }) => void;
		const delayedAdvertise = new Promise<{ ok: true }>((resolve) => {
			finishAdvertise = resolve;
		});
		mocks.advertise.mockReturnValueOnce(delayedAdvertise);
		await renderProvider();
		const starting = current().startHostingOnline();
		starting.catch(() => {});
		await act(async () => Promise.resolve());

		act(() => current().stopHosting());
		finishAdvertise({ ok: true });
		await act(async () => {
			await expect(starting).rejects.toThrow(/stopped/i);
		});
		expect(mocks.stopAdvertise).toHaveBeenCalled();
		expect(mocks.close).toHaveBeenCalled();
		expect(current().role).toBe('solo');
		expect(current().onlineJoinCode).toBeNull();
	});
});
