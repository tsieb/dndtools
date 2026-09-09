import { describe, expect, it } from 'vitest';
import {
	connectionState,
	hostConnectionSummary,
	peerPresence,
	rosterPresence,
} from './sessionStatus';
import type { HostPeer } from './SessionHost';
import type { ClientStatus } from './SessionClient';

// RC-CLD-3.1 — the host/join panel's readings. These are the honesty rules of the panel: it never
// describes a link as healthier than the transport reports, and it never gives a player whose link
// DROPPED the same words as one who has not arrived yet.

function peer(patch: Partial<HostPeer> = {}): HostPeer {
	return {
		peerId: 'peer-1',
		actorId: 'actor-1',
		displayName: 'Rin',
		role: 'player',
		connected: true,
		status: 'online',
		hand: false,
		ready: false,
		...patch,
	};
}

describe('connectionState', () => {
	const statuses: ClientStatus[] = ['idle', 'connecting', 'live', 'reconnecting', 'closed'];

	it('reads every transport status, with a distinct label and shape for each', () => {
		const labels = statuses.map((status) => connectionState(status).label);
		const icons = statuses.map((status) => connectionState(status).icon);
		expect(new Set(labels).size).toBe(statuses.length);
		// Distinct shapes so the reading survives grayscale (A11Y-011).
		expect(new Set(icons).size).toBe(statuses.length);
	});

	it('only calls the link connected when the transport says live', () => {
		expect(connectionState('live').tone).toBe('ok');
		for (const status of statuses.filter((s) => s !== 'live')) {
			expect(connectionState(status).tone).not.toBe('ok');
		}
	});

	it('marks the two states the player should wait through, and only those', () => {
		expect(statuses.filter((s) => connectionState(s).pending)).toEqual([
			'connecting',
			'reconnecting',
		]);
	});

	it('marks only a closed link as ended, and tells the player how to get back in', () => {
		expect(statuses.filter((s) => connectionState(s).ended)).toEqual(['closed']);
		expect(connectionState('closed').detail).toMatch(/ask your DM/i);
	});

	it('never shouts', () => {
		for (const status of statuses) {
			const state = connectionState(status);
			expect(state.label).not.toContain('!');
			expect(state.detail).not.toContain('!');
		}
	});
});

describe('peerPresence', () => {
	it('reports an open link as online', () => {
		expect(peerPresence(peer())).toEqual({ label: 'Online', tone: 'ok', badges: [] });
	});

	it('reports a peer that is not on the link as not connected, never as "Invited"', () => {
		const reading = peerPresence(peer({ connected: false }));
		expect(reading).toEqual({ label: 'Not connected', tone: 'muted', badges: [] });
	});

	it('drops stale hints once the peer is off the link', () => {
		expect(peerPresence(peer({ connected: false, hand: true, ready: true })).badges).toEqual([]);
	});

	it('surfaces away, a raised hand and readiness for a connected peer', () => {
		const reading = peerPresence(peer({ status: 'away', hand: true, ready: true }));
		expect(reading.label).toBe('Away');
		expect(reading.tone).toBe('warn');
		expect(reading.badges).toEqual(['Hand raised', 'Ready']);
	});
});

describe('rosterPresence', () => {
	it('reads a projected roster entry the same way the host reads its own peers', () => {
		expect(rosterPresence({ actorId: 'a', displayName: 'Rin', status: 'online' })).toEqual({
			label: 'Online',
			tone: 'ok',
			badges: [],
		});
		expect(
			rosterPresence({ actorId: 'a', displayName: 'Rin', status: 'away', hand: true }),
		).toEqual({ label: 'Away', tone: 'warn', badges: ['Hand raised'] });
	});
});

describe('hostConnectionSummary', () => {
	it('says so plainly when nobody has joined', () => {
		expect(hostConnectionSummary([])).toBe('No players yet');
	});

	it('counts only peers whose link is actually open', () => {
		expect(
			hostConnectionSummary([
				peer({ peerId: 'a' }),
				peer({ peerId: 'b', connected: false }),
				peer({ peerId: 'c' }),
			]),
		).toBe('2 of 3 players connected');
	});
});
