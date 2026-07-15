import type { CoreCommand } from '@dndtools/core';
import type { PlayerData } from './viewModels';

/**
 * The P2P wire protocol between a DM HOST and a joined PLAYER, carried over one WebRTC data channel per
 * peer. Every `PeerMessage` is JSON-serialized and then AES-GCM sealed with the peer's session key
 * before it hits the channel (see `crypto.ts`) — the shapes here are the PLAINTEXT payloads.
 *
 * Design rules baked into the protocol:
 *   - DM→player carries STATE (a player-safe {@link PlayerData} snapshot), never raw operations — the
 *     snapshot is filtered by construction, so a hidden op can never reach a player (see viewModels.ts).
 *   - player→DM carries INTENT (a command REQUEST with NO trusted actor id). The host stamps the
 *     authenticated participant id before dispatching, so a peer can never act as another actor.
 *   - Presence is EPHEMERAL: it flows as its own message kind and never enters the durable op-log.
 */

export const PEER_PROTOCOL_VERSION = 1 as const;

/** A coarse online status broadcast for presence (mirrors the core PresenceOnlineStatus vocabulary). */
export type PeerPresenceStatus = 'online' | 'away';

/** One participant as projected to a viewer for the presence roster (no hidden participants). */
export interface PeerPresenceEntry {
	actorId: string;
	displayName: string;
	status: PeerPresenceStatus;
	/** Optional coarse hint the DM raises: is the player's hand up / are they ready. UI hint only. */
	hand?: boolean;
	ready?: boolean;
}

/** A player's request to act. Carries the command TYPE + PAYLOAD but never a trusted `actorId`. */
export interface CommandRequest {
	/** The command discriminant, e.g. `dice.roll`. The payload is the matching command payload. */
	type: CoreCommand['type'];
	payload: unknown;
}

// --- Host → Player ---------------------------------------------------------------------------------

/** The outcome of the join handshake, filtered for the joiner (COLLAB-001). */
export type JoinResultMessage =
	| {
			kind: 'join-result';
			ok: true;
			sessionId: string;
			/** The authenticated participant actor id the host bound this connection to. */
			actorId: string;
			displayName: string;
			role: 'player' | 'observer' | 'co-dm';
	  }
	| { kind: 'join-result'; ok: false; reason: string; message: string };

/** A full player-safe view-model snapshot. `seq` is monotonic so the client can drop stale frames. */
export interface SnapshotMessage {
	kind: 'snapshot';
	seq: number;
	data: PlayerData;
}

/** The host's response to a `command-request` (accepted, or rejected with the core's message). */
export interface CommandAckMessage {
	kind: 'command-ack';
	requestId: string;
	ok: boolean;
	/** Present when `ok` is false — the core rejection message, surfaced to the player as a toast. */
	message?: string;
}

/** The presence roster projected for THIS viewer (never includes a participant they may not see). */
export interface PresenceMessage {
	kind: 'presence';
	entries: PeerPresenceEntry[];
}

/** A session-key rotation: the new key (base64) sealed with the CURRENT key. */
export interface RekeyMessage {
	kind: 'rekey';
	key: string;
}

export interface PongMessage {
	kind: 'pong';
	t: number;
}

export type HostMessage =
	| JoinResultMessage
	| SnapshotMessage
	| CommandAckMessage
	| PresenceMessage
	| RekeyMessage
	| PongMessage;

// --- Player → Host ---------------------------------------------------------------------------------

/** The player announces readiness after the channel opens; the host replies with `join-result`. */
export interface HelloMessage {
	kind: 'hello';
	protocolVersion: number;
	displayName: string;
	deviceKind: 'desktop' | 'web' | 'unknown';
}

/** A player's intent to act — relayed to the host's authoritative runtime under the stamped identity. */
export interface CommandRequestMessage {
	kind: 'command-request';
	requestId: string;
	command: CommandRequest;
}

/** An ephemeral presence heartbeat (status + optional hand/ready hints). Never durable. */
export interface PresenceBeatMessage {
	kind: 'presence-beat';
	status: PeerPresenceStatus;
	hand?: boolean;
	ready?: boolean;
}

/** The presence statuses a peer may broadcast (`offline` is host-derived from the link, never claimed). */
export const PEER_PRESENCE_STATUSES: readonly PeerPresenceStatus[] = Object.freeze([
	'online',
	'away',
]);

/**
 * FAIL-CLOSED validation of an incoming presence beat. Presence is a SIDE-CHANNEL: it deliberately does
 * NOT ride the player command-request path (it is not in `PLAYER_REQUESTABLE_PREFIXES` and must never
 * be), so the host validates it here instead of relying on the core command gate. The message carries NO
 * actor id by construction — the presence SUBJECT is always the authenticated sender, so a peer can only
 * ever report its own presence. Returns the validated message, or `null` for anything malformed
 * (unknown status, non-boolean hints, wrong kind, non-object) — a malformed beat is dropped, never
 * partially applied.
 */
export function parsePresenceBeatMessage(value: unknown): PresenceBeatMessage | null {
	if (typeof value !== 'object' || value === null) return null;
	const v = value as Record<string, unknown>;
	if (v.kind !== 'presence-beat') return null;
	if (!(PEER_PRESENCE_STATUSES as readonly unknown[]).includes(v.status)) return null;
	if (v.hand !== undefined && typeof v.hand !== 'boolean') return null;
	if (v.ready !== undefined && typeof v.ready !== 'boolean') return null;
	const message: PresenceBeatMessage = {
		kind: 'presence-beat',
		status: v.status as PeerPresenceStatus,
	};
	if (v.hand !== undefined) message.hand = v.hand;
	if (v.ready !== undefined) message.ready = v.ready;
	return message;
}

/**
 * Map a validated presence beat to the `session.set-presence` command PAYLOAD the host applies locally,
 * stamped with the authenticated sender's identity at the dispatch site (never an id from the wire).
 * `device` comes from the peer's join-time hello, not the beat. Pure, so the protocol mapping is testable
 * without a live transport.
 */
export function presenceBeatToSetPresencePayload(
	beat: PresenceBeatMessage,
	device: 'desktop' | 'web' | 'unknown',
): { status: PeerPresenceStatus; device: 'desktop' | 'web' | 'unknown' } {
	return { status: beat.status, device };
}

export interface PingMessage {
	kind: 'ping';
	t: number;
}

export type ClientMessage =
	| HelloMessage
	| CommandRequestMessage
	| PresenceBeatMessage
	| PingMessage;

export type PeerMessage = HostMessage | ClientMessage;

const boundedString = (value: unknown, max: number): value is string =>
	typeof value === 'string' && value.length > 0 && value.length <= max;
const finiteNumber = (value: unknown): value is number =>
	typeof value === 'number' && Number.isFinite(value);

/** Validate messages received by the authoritative host before any application handler sees them. */
export function parseClientMessage(value: unknown): ClientMessage | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const rec = value as Record<string, unknown>;
	switch (rec.kind) {
		case 'hello':
			if (
				rec.protocolVersion !== PEER_PROTOCOL_VERSION ||
				!boundedString(rec.displayName, 160) ||
				!['desktop', 'web', 'unknown'].includes(String(rec.deviceKind))
			)
				return null;
			return rec as unknown as HelloMessage;
		case 'command-request': {
			if (!boundedString(rec.requestId, 128) || !rec.command || typeof rec.command !== 'object')
				return null;
			const command = rec.command as Record<string, unknown>;
			if (!boundedString(command.type, 128) || !('payload' in command)) return null;
			return rec as unknown as CommandRequestMessage;
		}
		case 'presence-beat':
			return parsePresenceBeatMessage(rec);
		case 'ping':
			return finiteNumber(rec.t) ? (rec as unknown as PingMessage) : null;
		default:
			return null;
	}
}

/** Validate host messages before they can mutate the joined player's replicated UI state. */
export function parseHostMessage(value: unknown): HostMessage | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const rec = value as Record<string, unknown>;
	switch (rec.kind) {
		case 'join-result':
			if (typeof rec.ok !== 'boolean') return null;
			if (!rec.ok) {
				return boundedString(rec.reason, 128) && boundedString(rec.message, 500)
					? (rec as unknown as JoinResultMessage)
					: null;
			}
			return boundedString(rec.sessionId, 128) &&
				boundedString(rec.actorId, 128) &&
				boundedString(rec.displayName, 160) &&
				['player', 'observer', 'co-dm'].includes(String(rec.role))
				? (rec as unknown as JoinResultMessage)
				: null;
		case 'snapshot':
			return Number.isSafeInteger(rec.seq) &&
				Number(rec.seq) >= 0 &&
				rec.data !== null &&
				typeof rec.data === 'object'
				? (rec as unknown as SnapshotMessage)
				: null;
		case 'command-ack':
			return boundedString(rec.requestId, 128) &&
				typeof rec.ok === 'boolean' &&
				(rec.message === undefined ||
					(typeof rec.message === 'string' && rec.message.length <= 500))
				? (rec as unknown as CommandAckMessage)
				: null;
		case 'presence': {
			if (!Array.isArray(rec.entries) || rec.entries.length > 500) return null;
			const valid = rec.entries.every((entry) => {
				if (!entry || typeof entry !== 'object') return false;
				const item = entry as Record<string, unknown>;
				return (
					boundedString(item.actorId, 128) &&
					boundedString(item.displayName, 160) &&
					(PEER_PRESENCE_STATUSES as readonly unknown[]).includes(item.status) &&
					(item.hand === undefined || typeof item.hand === 'boolean') &&
					(item.ready === undefined || typeof item.ready === 'boolean')
				);
			});
			return valid ? (rec as unknown as PresenceMessage) : null;
		}
		case 'rekey':
			return boundedString(rec.key, 128) ? (rec as unknown as RekeyMessage) : null;
		case 'pong':
			return finiteNumber(rec.t) ? (rec as unknown as PongMessage) : null;
		default:
			return null;
	}
}
