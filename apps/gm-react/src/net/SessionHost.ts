import { isCampaignOwnerRole } from '@dndtools/core';
import type { CoreCommand, CoreStateSlice, SyncOperation } from '@dndtools/core';
import type { SceneRuntime } from '../runtime/SceneRuntime';
import { PeerLink } from './PeerConnection';
import { exportKeyBase64, generateSessionKey } from './crypto';
import { buildPlayerData } from './viewModels';
import {
	parsePresenceBeatMessage,
	parseClientMessage,
	presenceBeatToSetPresencePayload,
	type ClientMessage,
	type PeerPresenceEntry,
	type PresenceMessage,
	type SnapshotMessage,
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
	role: 'player' | 'observer' | 'co-dm';
	connected: boolean;
	status: 'online' | 'away';
	hand: boolean;
	ready: boolean;
}

interface InternalPeer extends HostPeer {
	link: PeerLink;
	key: CryptoKey;
	lastDataJson: string | null;
	/** The device kind the peer announced in its join-time hello (feeds `session.set-presence`). */
	deviceKind: 'desktop' | 'web' | 'unknown';
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
	private readonly invitationTimers = new Map<string, ReturnType<typeof setTimeout>>();
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
		// A credential can never invent or elevate an identity: the actor must already exist with a
		// JOINABLE role. Every non-owner role joins remotely — player, observer, or the elevated co-DM
		// (whose snapshot carries the Co-DM tier). The campaign-owner DM runs the host and is never a peer.
		if (!actor || isCampaignOwnerRole(actor.role)) {
			throw new Error('Can only invite a registered player, observer, or Co-DM participant.');
		}
		if ([...this.peers.values()].some((peer) => peer.actorId === actorId)) {
			throw new Error(`${actor.displayName} is already invited or connected.`);
		}
		// The owner `dm` was rejected above, so the remaining role is a joinable peer role.
		const joinRole: 'player' | 'observer' | 'co-dm' =
			actor.role === 'co-dm' ? 'co-dm' : actor.role === 'observer' ? 'observer' : 'player';
		const key = await generateSessionKey();
		const { pc, channel, sdp } = await createOffer();
		const peerId = `peer-${this.sessionId}-${actorId}-${this.seq++}`;
		const link = new PeerLink(pc, channel, key);

		const peer: InternalPeer = {
			peerId,
			actorId,
			displayName: actor.displayName,
			role: joinRole,
			connected: false,
			status: 'away',
			hand: false,
			ready: false,
			link,
			key,
			lastDataJson: null,
			deviceKind: 'unknown',
		};
		this.peers.set(peerId, peer);
		this.pcByPeer.set(peer, pc);
		this.invitationTimers.set(
			peerId,
			setTimeout(() => {
				const waiting = this.peers.get(peerId);
				if (waiting && !waiting.connected) this.revoke(peerId);
			}, 120_000),
		);

		link.onStateChange((state) => {
			peer.connected = state === 'open';
			peer.status = state === 'open' ? 'online' : 'away';
			if (state === 'open') {
				this.clearInvitationTimer(peerId);
				void this.pushSnapshot(peer);
			}
			if (state === 'closed') {
				this.clearInvitationTimer(peerId);
				this.peers.delete(peerId);
				// The peer is gone: clear its ephemeral core presence entry (DM-authored offline clear).
				this.clearPeerPresence(peer);
			}
			this.broadcastPresence();
			this.changeHandler?.();
		});
		link.onMessage((value) => {
			const message = parseClientMessage(value);
			if (message) this.onPeerMessage(peer, message);
		});

		const offer: OfferPayload = {
			v: SIGNALING_VERSION,
			role: 'offer',
			sessionId: this.sessionId,
			actorId,
			displayName: actor.displayName,
			participantRole: joinRole,
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
		// Match the identity echoed from the offer. This keeps simultaneous manual/LAN invitations from
		// applying one player's SDP to another player's peer connection.
		const pending = [...this.peers.values()]
			.reverse()
			.find((p) => !p.connected && p.actorId === answer.actorId);
		if (!pending) throw new Error('No matching invitation is waiting for this answer.');
		await applyAnswer(this.pcOf(pending), answer.sdp);
	}

	/** Revoke a peer: drop its link so its key can no longer talk to the host (S7.3.4). */
	revoke(peerId: string): void {
		const peer = this.peers.get(peerId);
		if (!peer) return;
		this.clearInvitationTimer(peerId);
		peer.link.close();
		this.peers.delete(peerId);
		this.clearPeerPresence(peer);
		this.broadcastPresence();
		this.changeHandler?.();
	}

	stop(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
		for (const peer of this.peers.values()) peer.link.close();
		for (const timer of this.invitationTimers.values()) clearTimeout(timer);
		this.invitationTimers.clear();
		this.peers.clear();
		this.changeHandler?.();
	}

	// --- internals ---------------------------------------------------------------------------------

	private pcOf(peer: InternalPeer): RTCPeerConnection {
		const pc = this.pcByPeer.get(peer);
		if (!pc) throw new Error('Missing peer connection handle.');
		return pc;
	}

	private clearInvitationTimer(peerId: string): void {
		const timer = this.invitationTimers.get(peerId);
		if (timer) clearTimeout(timer);
		this.invitationTimers.delete(peerId);
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
				peer.deviceKind =
					message.deviceKind === 'desktop' || message.deviceKind === 'web'
						? message.deviceKind
						: 'unknown';
				void peer.link.send({
					kind: 'join-result',
					ok: true,
					sessionId: this.sessionId,
					actorId: peer.actorId,
					displayName: peer.displayName,
					role: peer.role,
				});
				void this.pushSnapshot(peer);
				// Record the just-joined peer's presence in the core presence model (as the peer itself).
				this.applyPeerPresence(peer, { status: 'online', device: peer.deviceKind });
				this.broadcastPresence();
				break;
			case 'command-request':
				void this.handleCommandRequest(peer, message.requestId, message.command);
				break;
			case 'presence-beat': {
				// Presence is a SIDE-CHANNEL: it never rides the command-request path (it is deliberately
				// NOT player-requestable), so validate it fail-closed here. The message carries no actor id;
				// the presence SUBJECT is always the authenticated sender — a peer can only report itself.
				const beat = parsePresenceBeatMessage(message);
				if (!beat) break; // malformed — drop, never partially apply
				peer.status = beat.status;
				peer.hand = Boolean(beat.hand);
				peer.ready = Boolean(beat.ready);
				this.applyPeerPresence(peer, presenceBeatToSetPresencePayload(beat, peer.deviceKind));
				this.broadcastPresence();
				this.changeHandler?.();
				break;
			}
			case 'ping':
				void peer.link.send({ kind: 'pong', t: message.t });
				break;
		}
	}

	/**
	 * Apply a peer's ephemeral presence to the CORE presence model via `session.set-presence`, STAMPED
	 * with the authenticated actor id bound at invite time (same trust rule as `handleCommandRequest`:
	 * nothing from the wire names an actor). Ephemeral + best-effort: the handler appends no durable op,
	 * and a rejection (e.g. the DM is previewing read-only) must never disturb the transport.
	 */
	private applyPeerPresence(
		peer: InternalPeer,
		payload: { status: 'online' | 'away'; device: 'desktop' | 'web' | 'unknown' },
	): void {
		void this.runtime
			.dispatch({ type: 'session.set-presence', actorId: peer.actorId, payload })
			.catch(() => {
				// Presence is ephemeral — a failed apply is dropped, never retried or surfaced to the peer.
			});
	}

	/** DM-authored CLEAR of a departed peer's presence entry (`targetActorId` + `status: 'offline'`). */
	private clearPeerPresence(peer: InternalPeer): void {
		const dm = Object.values(this.runtime.authoritativeState.permissions.actors).find(
			(a) => a.role === 'dm',
		);
		if (!dm) return;
		void this.runtime
			.dispatch({
				type: 'session.set-presence',
				actorId: dm.id,
				payload: { status: 'offline', targetActorId: peer.actorId },
			})
			.catch(() => {
				// Best-effort: a stale ephemeral entry expires with the session either way.
			});
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
