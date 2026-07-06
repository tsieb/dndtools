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
			role: 'player' | 'observer';
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
