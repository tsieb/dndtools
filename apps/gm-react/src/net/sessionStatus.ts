import type { ClientStatus } from './SessionClient';
import type { HostPeer } from './SessionHost';
import type { PeerPresenceEntry } from './messages';

/**
 * Presentational derivations for the host/join panel (RC-CLD-3.1). Pure and DOM-free so the panel's
 * honesty rules stay unit-testable: a link is never described as healthier than the transport says,
 * and a player whose link DROPPED is never reported with the same words as one who never arrived.
 */

/** Which semantic status family a reading paints with. `muted` is "nothing is wrong, nothing is live". */
export type StatusTone = 'ok' | 'info' | 'warn' | 'error' | 'muted';

export interface ConnectionState {
	label: string;
	detail: string;
	tone: StatusTone;
	/** Semantic icon name (distinct shapes, so the reading survives grayscale — A11Y-011). */
	icon: 'success' | 'loading' | 'warning' | 'error' | 'connection';
	/** The transport is still working on its own: the player waits rather than re-entering a code. */
	pending: boolean;
	/** The link is gone for good: the only way back is a fresh invite from the DM. */
	ended: boolean;
}

const CONNECTION: Record<ClientStatus, ConnectionState> = {
	idle: {
		label: 'Not connected',
		detail: 'Pick a table nearby, or paste the code your DM sent you.',
		tone: 'muted',
		icon: 'connection',
		pending: false,
		ended: false,
	},
	connecting: {
		label: 'Connecting',
		detail: 'Waiting for your DM to admit this device and choose your participant.',
		tone: 'info',
		icon: 'loading',
		pending: true,
		ended: false,
	},
	live: {
		label: 'Connected',
		detail: 'The table is arriving live on this device.',
		tone: 'ok',
		icon: 'success',
		pending: false,
		ended: false,
	},
	reconnecting: {
		label: 'Reconnecting',
		detail:
			'The link went quiet. It picks back up on its own if the table returns; if it does not, ask your DM for a new invite.',
		tone: 'warn',
		icon: 'warning',
		pending: true,
		ended: false,
	},
	closed: {
		label: 'Disconnected',
		detail: 'The link closed. Ask your DM for a fresh invite or join code, then join again.',
		tone: 'error',
		icon: 'error',
		pending: false,
		ended: true,
	},
};

/** The player-side reading of the live link, straight from the transport's own status. */
export function connectionState(status: ClientStatus): ConnectionState {
	return CONNECTION[status];
}

export interface PresenceReading {
	label: string;
	tone: StatusTone;
	/** Coarse hints the peer broadcasts about itself; dropped once the peer is off the link. */
	badges: string[];
}

function presenceBadges(peer: { hand?: boolean; ready?: boolean }): string[] {
	const badges: string[] = [];
	if (peer.hand) badges.push('Hand raised');
	if (peer.ready) badges.push('Ready');
	return badges;
}

/**
 * A host-side participant row. An invited-but-absent peer and a peer whose link dropped are both
 * simply not connected — the panel used to print "Invited" for a DROPPED player, which reads as
 * "they never arrived", and it kept showing their last raised hand after they were gone.
 */
export function peerPresence(peer: HostPeer): PresenceReading {
	if (!peer.connected) return { label: 'Not connected', tone: 'muted', badges: [] };
	if (peer.status === 'away') return { label: 'Away', tone: 'warn', badges: presenceBadges(peer) };
	return { label: 'Online', tone: 'ok', badges: presenceBadges(peer) };
}

/** The same reading for a player-side roster entry (the host projects only what this viewer may see). */
export function rosterPresence(entry: PeerPresenceEntry): PresenceReading {
	if (entry.status === 'away')
		return { label: 'Away', tone: 'warn', badges: presenceBadges(entry) };
	return { label: 'Online', tone: 'ok', badges: presenceBadges(entry) };
}

/** "3 of 5 players connected" — the host's one-line read, counting only links that are actually open. */
export function hostConnectionSummary(peers: readonly HostPeer[]): string {
	if (peers.length === 0) return 'No players yet';
	const connected = peers.filter((peer) => peer.connected).length;
	return `${connected} of ${peers.length} players connected`;
}
