import type { CoreCommand, CoreStateSlice, SyncOperation } from '@dndtools/core';
import type { SceneRuntime } from '../runtime/SceneRuntime';
import { PeerLink } from './PeerConnection';
import { exportKeyBase64, generateSessionKey, importKeyBase64 } from './crypto';
import { buildPlayerData, type PlayerData } from './viewModels';
import type {
	ClientMessage,
	PeerPresenceEntry,
	PresenceMessage,
	SnapshotMessage,
} from './messages';
import {
	applyAnswer,
	createOffer,
	decodeCode,
	encodeCode,
	SIGNALING_VERSION,
	type AnswerPayload,
	type OfferPayload,
} from './signaling';

/**
 * The command-type prefixes a joined participant may REQUEST. The host re-stamps the authenticated
 * actor id and the Core re-enforces per-command authority (owner/grant), so this is a defence-in-depth
 * allow-list, not the sole gate: `dice.*` (roll at the table) and `character.*` (edit one's OWN sheet —
 * the Core rejects edits to a character the actor does not own). Everything else is refused at the host.
 */
const PLAYER_REQUESTABLE_PREFIXES = ['dice.', 'character.'] as const;

function isPlayerRequestable(type: string): boolean {
	return PLAYER_REQUESTABLE_PREFIXES.some((p) => type.startsWith(p));
}

/** A connected (or invited-but-not-yet-connected) participant on the host side. */
export interface HostPeer {
	peerId: string;
	actorId: string;
	displayName: string;
	role: 'player' | 'observer';
	connected: boolean;
	status: 'online' | 'away';
	hand: boolean;
	ready: boolean;
}

interface InternalPeer extends HostPeer {
	link: PeerLink;
	key: CryptoKey;
	lastDataJson: string | null;
}

export interface HostInvitation {
	peerId: string;
	actorId: string;
	displayName: string;
	/** The connection code (also renderable as a QR) the DM hands to the player. */
	offerCode: string;
}

/**
 * SessionHost — the DM-side P2P orchestrator. It is authoritative: it owns the real `SceneRuntime`, and
 * every player is a NON-authoritative view fed player-safe {@link PlayerData} snapshots. It:
 *   - mints per-player invitations (each with its own AES-GCM key — the credential),
 *   - on each accepted host dispatch (the runtime's op-growth signal), recomputes and pushes each
 *     connected player's snapshot (debounced by content equality),
 *   - relays player command-requests under the STAMPED authenticated actor id (closing the actorId-spoof
 *     gap: a peer's claimed id is never trusted),
 *   - projects presence per viewer, and
 *   - revokes a peer by dropping its link (its key can no longer talk to the host).
 *
 * LAN-only, zero external servers: signaling is the serverless offer/answer code exchange.
 */
export class SessionHost {
	readonly sessionId: string;
	private readonly runtime: SceneRuntime;
	private readonly peers = new Map<string, InternalPeer>();
	private unsubscribe: (() => void) | null = null;
	private seq = 0;
	private changeHandler: (() => void) | null = null;
	// `applyAnswer` needs the RTCPeerConnection, which PeerLink owns privately; thread it per-peer.
	private readonly pcByPeer = new WeakMap<InternalPeer, RTCPeerConnection>();

	constructor(runtime: SceneRuntime, sessionId: string) {
		this.runtime = runtime;
		this.sessionId = sessionId;
		this.unsubscribe = runtime.onDispatched((ops, next) => this.onOpGrowth(ops, next));
	}

	/** Subscribe to peer-roster changes (for the host UI). */
	onChange(handler: () => void): void {
		this.changeHandler = handler;
	}

	get connectedPeers(): HostPeer[] {
		return [...this.peers.values()].map((p) => ({
			peerId: p.peerId,
			actorId: p.actorId,
			displayName: p.displayName,
			role: p.role,
			connected: p.connected,
			status: p.status,
			hand: p.hand,
			ready: p.ready,
		}));
	}

	/**
	 * Mint an invitation for a REGISTERED participant actor. Fail closed: the actor must already exist in
	 * the permission roster with a joinable role (a credential can never invent or elevate an identity —
	 * the same identity rule `collab/session-join.ts` enforces). Returns the offer code to hand to the player.
	 */
	async invite(actorId: string): Promise<HostInvitation> {
		const actor = this.runtime.authoritativeState.permissions.actors[actorId];
		if (!actor || (actor.role !== 'player' && actor.role !== 'observer')) {
			throw new Error('Can only invite a registered player or observer participant.');
		}
		const key = await generateSessionKey();
		const { pc, channel, sdp } = await createOffer();
		const peerId = `peer-${this.sessionId}-${actorId}-${this.seq++}`;
		const link = new PeerLink(pc, channel, key);

		const peer: InternalPeer = {
			peerId,
			actorId,
			displayName: actor.displayName,
			role: actor.role,
			connected: false,
			status: 'away',
			hand: false,
			ready: false,
			link,
			key,
			lastDataJson: null,
		};
		this.peers.set(peerId, peer);
		this.pcByPeer.set(peer, pc);

		link.onStateChange((state) => {
			peer.connected = state === 'open';
			peer.status = state === 'open' ? 'online' : 'away';
			if (state === 'open') void this.pushSnapshot(peer);
			if (state === 'closed') this.peers.delete(peerId);
			this.broadcastPresence();
			this.changeHandler?.();
		});
		link.onMessage((message) => this.onPeerMessage(peer, message as ClientMessage));

		const offer: OfferPayload = {
			v: SIGNALING_VERSION,
			role: 'offer',
			sessionId: this.sessionId,
			actorId,
			displayName: actor.displayName,
			participantRole: actor.role,
			keyB64: await exportKeyBase64(key),
			sdp,
		};
		this.changeHandler?.();
		return { peerId, actorId, displayName: actor.displayName, offerCode: await encodeCode(offer) };
	}

	/** Apply a joiner's answer code to complete the handshake for the matching pending invitation. */
	async acceptAnswer(answerCode: string): Promise<void> {
		const answer = await decodeCode<AnswerPayload>(answerCode);
		if (answer.role !== 'answer' || answer.sessionId !== this.sessionId) {
			throw new Error('This answer code does not match the current session.');
		}
		// Find the most recent not-yet-connected invite to apply the answer to.
		const pending = [...this.peers.values()].reverse().find((p) => !p.connected);
		if (!pending) throw new Error('No pending invitation is waiting for an answer.');
		await applyAnswer(this.pcOf(pending), answer.sdp);
	}

	/** Revoke a peer: drop its link so its key can no longer talk to the host (S7.3.4). */
	revoke(peerId: string): void {
		const peer = this.peers.get(peerId);
		if (!peer) return;
		peer.link.close();
		this.peers.delete(peerId);
		this.broadcastPresence();
		this.changeHandler?.();
	}

	stop(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
		for (const peer of this.peers.values()) peer.link.close();
		this.peers.clear();
		this.changeHandler?.();
	}

	// --- internals ---------------------------------------------------------------------------------

	private pcOf(peer: InternalPeer): RTCPeerConnection {
		const pc = this.pcByPeer.get(peer);
		if (!pc) throw new Error('Missing peer connection handle.');
		return pc;
	}

	private onOpGrowth(_ops: SyncOperation[], next: CoreStateSlice): void {
		for (const peer of this.peers.values()) {
			if (peer.connected) void this.pushSnapshot(peer, next);
		}
	}

	private async pushSnapshot(peer: InternalPeer, state?: CoreStateSlice): Promise<void> {
		const slice = state ?? this.runtime.authoritativeState;
		const data = buildPlayerData(slice, peer.actorId);
		const json = JSON.stringify(data);
		if (json === peer.lastDataJson) return; // no visible change for this player — skip the send
		peer.lastDataJson = json;
		const message: SnapshotMessage = { kind: 'snapshot', seq: this.seq++, data };
		await peer.link.send(message);
	}

	private onPeerMessage(peer: InternalPeer, message: ClientMessage): void {
		switch (message.kind) {
			case 'hello':
				// The identity was bound at invite time from the registered roster (fail-closed). Confirm and
				// send the first snapshot.
				void peer.link.send({
					kind: 'join-result',
					ok: true,
					sessionId: this.sessionId,
					actorId: peer.actorId,
					displayName: peer.displayName,
					role: peer.role,
				});
				void this.pushSnapshot(peer);
				this.broadcastPresence();
				break;
			case 'command-request':
				void this.handleCommandRequest(peer, message.requestId, message.command);
				break;
			case 'presence-beat':
				peer.status = message.status;
				peer.hand = Boolean(message.hand);
				peer.ready = Boolean(message.ready);
				this.broadcastPresence();
				this.changeHandler?.();
				break;
			case 'ping':
				void peer.link.send({ kind: 'pong', t: message.t });
				break;
		}
	}

	private async handleCommandRequest(
		peer: InternalPeer,
		requestId: string,
		command: { type: string; payload: unknown },
	): Promise<void> {
		if (!isPlayerRequestable(command.type)) {
			await peer.link.send({
				kind: 'command-ack',
				requestId,
				ok: false,
				message: 'That action is not permitted from a player device.',
			});
			return;
		}
		// STAMP the authenticated actor id — never trust a client-supplied actorId. The Core then enforces
		// this actor's real authority (owner/grant), rejecting anything they may not do.
		const stamped = {
			type: command.type,
			actorId: peer.actorId,
			payload: command.payload,
		} as unknown as CoreCommand;
		try {
			const result = await this.runtime.dispatch(stamped);
			await peer.link.send(
				result.status === 'accepted'
					? { kind: 'command-ack', requestId, ok: true }
					: { kind: 'command-ack', requestId, ok: false, message: result.rejection.message },
			);
		} catch (error) {
			await peer.link.send({
				kind: 'command-ack',
				requestId,
				ok: false,
				message: error instanceof Error ? error.message : 'The table could not apply your action.',
			});
		}
	}

	private broadcastPresence(): void {
		const entries: PeerPresenceEntry[] = [...this.peers.values()]
			.filter((p) => p.connected)
			.map((p) => ({
				actorId: p.actorId,
				displayName: p.displayName,
				status: p.status,
				hand: p.hand,
				ready: p.ready,
			}));
		const message: PresenceMessage = { kind: 'presence', entries };
		for (const peer of this.peers.values()) {
			if (peer.connected) void peer.link.send(message);
		}
	}
}
