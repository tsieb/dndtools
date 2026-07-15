import { describe, it, expect } from 'vitest';

// The presence SIDE-CHANNEL protocol (COLLAB-004 over P2P). Presence deliberately does NOT ride the
// player command-request path — the host validates the dedicated `presence-beat` message fail-closed
// with `parsePresenceBeatMessage`, then maps it to the `session.set-presence` payload it dispatches
// under the STAMPED authenticated identity. These tests pin the pure protocol pieces: a malformed
// beat is dropped whole (never partially applied), and the wire shape can never name an actor.

import {
	parsePresenceBeatMessage,
	parseClientMessage,
	parseHostMessage,
	presenceBeatToSetPresencePayload,
	PEER_PRESENCE_STATUSES,
} from './messages';

describe('peer message validation', () => {
	it('accepts a bounded player request and rejects missing or oversized fields', () => {
		expect(
			parseClientMessage({
				kind: 'command-request',
				requestId: 'req-1',
				command: { type: 'dice.roll', payload: { formula: '1d20' } },
			}),
		).not.toBeNull();
		expect(
			parseClientMessage({ kind: 'command-request', requestId: 'req-1', command: null }),
		).toBeNull();
		expect(
			parseClientMessage({
				kind: 'command-request',
				requestId: 'x'.repeat(129),
				command: { type: 'dice.roll', payload: {} },
			}),
		).toBeNull();
	});

	it('rejects malformed host state and unknown message kinds', () => {
		expect(parseHostMessage({ kind: 'snapshot', seq: 2, data: {} })).not.toBeNull();
		expect(parseHostMessage({ kind: 'snapshot', seq: -1, data: {} })).toBeNull();
		expect(parseHostMessage({ kind: 'presence', entries: new Array(501).fill({}) })).toBeNull();
		expect(parseHostMessage({ kind: 'surprise', value: true })).toBeNull();
	});
});

describe('parsePresenceBeatMessage', () => {
	it('accepts a minimal beat (status only)', () => {
		expect(parsePresenceBeatMessage({ kind: 'presence-beat', status: 'online' })).toEqual({
			kind: 'presence-beat',
			status: 'online',
		});
	});

	it('accepts hand/ready boolean hints and preserves explicit false', () => {
		expect(
			parsePresenceBeatMessage({ kind: 'presence-beat', status: 'away', hand: true, ready: false }),
		).toEqual({ kind: 'presence-beat', status: 'away', hand: true, ready: false });
	});

	it('accepts every broadcastable status and nothing else', () => {
		for (const status of PEER_PRESENCE_STATUSES) {
			expect(parsePresenceBeatMessage({ kind: 'presence-beat', status })).not.toBeNull();
		}
		// `offline` is host-derived from the link state — a peer may never CLAIM it (or anything unknown).
		expect(parsePresenceBeatMessage({ kind: 'presence-beat', status: 'offline' })).toBeNull();
		expect(parsePresenceBeatMessage({ kind: 'presence-beat', status: 'ONLINE' })).toBeNull();
		expect(parsePresenceBeatMessage({ kind: 'presence-beat', status: 7 })).toBeNull();
	});

	it('fails closed on a wrong kind, a missing status, or a non-object', () => {
		expect(parsePresenceBeatMessage({ kind: 'command-request', status: 'online' })).toBeNull();
		expect(parsePresenceBeatMessage({ kind: 'presence-beat' })).toBeNull();
		expect(parsePresenceBeatMessage(null)).toBeNull();
		expect(parsePresenceBeatMessage(undefined)).toBeNull();
		expect(parsePresenceBeatMessage('presence-beat')).toBeNull();
	});

	it('drops the WHOLE beat when a hint is malformed (never partially applies)', () => {
		expect(
			parsePresenceBeatMessage({ kind: 'presence-beat', status: 'online', hand: 'yes' }),
		).toBeNull();
		expect(
			parsePresenceBeatMessage({ kind: 'presence-beat', status: 'online', ready: 1 }),
		).toBeNull();
	});

	it('re-emits ONLY the protocol fields — injected extras (e.g. an actorId) never survive parsing', () => {
		const parsed = parsePresenceBeatMessage({
			kind: 'presence-beat',
			status: 'online',
			hand: true,
			actorId: 'actor-dm', // a spoof attempt: presence's subject is ALWAYS the authenticated sender
			targetActorId: 'actor-other',
		});
		expect(parsed).toEqual({ kind: 'presence-beat', status: 'online', hand: true });
		expect(parsed && 'actorId' in parsed).toBe(false);
	});
});

describe('presenceBeatToSetPresencePayload', () => {
	it('maps status from the beat and device from the join-time hello (never the beat)', () => {
		const beat = parsePresenceBeatMessage({ kind: 'presence-beat', status: 'away', hand: true })!;
		expect(presenceBeatToSetPresencePayload(beat, 'web')).toEqual({
			status: 'away',
			device: 'web',
		});
		expect(presenceBeatToSetPresencePayload(beat, 'desktop')).toEqual({
			status: 'away',
			device: 'desktop',
		});
	});

	it('produces a payload that carries NO actor identity — the dispatch site stamps it', () => {
		const beat = parsePresenceBeatMessage({ kind: 'presence-beat', status: 'online' })!;
		const payload = presenceBeatToSetPresencePayload(beat, 'unknown');
		expect(Object.keys(payload).sort()).toEqual(['device', 'status']);
	});
});
