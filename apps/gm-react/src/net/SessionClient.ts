import { PeerLink, type LinkState } from './PeerConnection';
import { importKeyBase64 } from './crypto';
import {
	acceptOfferCreateAnswer,
	decodeCode,
	encodeCode,
	SIGNALING_VERSION,
	type AnswerPayload,
	type OfferPayload,
} from './signaling';
import type { CommandRequest, HostMessage, PeerPresenceEntry } from './messages';
import type { PlayerData } from './viewModels';

export type ClientStatus = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'closed';

/** The identity the host admitted this device as (from the join handshake). */
export interface JoinedIdentity {
	sessionId: string;
	actorId: string;
	displayName: string;
	role: 'player' | 'observer';
}

export interface ClientState {
	status: ClientStatus;
	identity: JoinedIdentity | null;
	data: PlayerData | null;
	presence: PeerPresenceEntry[];
	error: string | null;
}

/**
 * SessionClient — the joined-player-side P2P orchestrator. It holds NO authoritative vault; it renders
 * the player-safe {@link PlayerData} snapshots the host pushes, and sends command REQUESTS (intent) plus
 * ephemeral presence beats. It never claims an actor id — the host binds and stamps identity.
 *
 * Serverless join: decode the DM's offer code, produce an answer code to hand back (paste or mDNS), then
 * live over the direct WebRTC data channel.
 */
export class SessionClient {
	private link: PeerLink | null = null;
	private state: ClientState = {
		status: 'idle',
		identity: null,
		data: null,
		presence: [],
		error: null,
	};
	private changeHandler: ((state: ClientState) => void) | null = null;
	private readonly pending = new Map<string, (ok: boolean, message?: string) => void>();

	onChange(handler: (state: ClientState) => void): void {
		this.changeHandler = handler;
	}

	getState(): ClientState {
		return this.state;
	}

	private update(patch: Partial<ClientState>): void {
		this.state = { ...this.state, ...patch };
		this.changeHandler?.(this.state);
	}

	/**
	 * Begin joining from the DM's offer code. Returns the ANSWER code to hand back to the host (out of
	 * band — paste or the Electron mDNS bridge). `joined` resolves once the host admits the device.
	 */
	async join(offerCode: string): Promise<{ answerCode: string; joined: Promise<JoinedIdentity> }> {
		this.update({ status: 'connecting', error: null });
		let offer: OfferPayload;
		try {
			offer = await decodeCode<OfferPayload>(offerCode);
		} catch {
			this.update({ status: 'idle', error: 'That connection code is not valid.' });
			throw new Error('Invalid connection code.');
		}
		if (offer.role !== 'offer') {
			this.update({ status: 'idle', error: 'That code is not a session invitation.' });
			throw new Error('Not an offer code.');
		}

		const key = await importKeyBase64(offer.keyB64);
		const accepted = await acceptOfferCreateAnswer(offer.sdp);

		const joined = new Promise<JoinedIdentity>((resolve, reject) => {
			void accepted.channel.then((channel) => {
				const link = new PeerLink(accepted.pc, channel, key);
				this.link = link;
				// Announce readiness once the channel is open (the host replies with `join-result`).
				const announce = () => {
					void link.send({
						kind: 'hello',
						protocolVersion: SIGNALING_VERSION,
						displayName: offer.displayName,
						deviceKind: detectDeviceKind(),
					});
				};
				link.onStateChange((s) => {
					this.onLinkState(s);
					if (s === 'open') announce();
				});
				link.onMessage((message) => this.onHostMessage(message as HostMessage, resolve, reject));
				if (link.state === 'open') announce();
			});
		});

		const answer: AnswerPayload = {
			v: SIGNALING_VERSION,
			role: 'answer',
			sessionId: offer.sessionId,
			sdp: accepted.sdp,
		};
		return { answerCode: await encodeCode(answer), joined };
	}

	/** Request an action at the table. Resolves true if the host accepted, false (with message) if not. */
	requestCommand(command: CommandRequest): Promise<{ ok: boolean; message?: string }> {
		if (!this.link || this.state.status === 'closed') {
			return Promise.resolve({ ok: false, message: 'Not connected to the table.' });
		}
		const requestId = randomId();
		return new Promise((resolve) => {
			this.pending.set(requestId, (ok, message) => resolve({ ok, message }));
			void this.link!.send({ kind: 'command-request', requestId, command });
			// Fail the request if the host never acks (e.g. link dropped mid-flight).
			setTimeout(() => {
				if (this.pending.delete(requestId)) resolve({ ok: false, message: 'The table did not respond.' });
			}, 8000);
		});
	}

	sendPresenceBeat(patch: { status?: 'online' | 'away'; hand?: boolean; ready?: boolean }): void {
		void this.link?.send({
			kind: 'presence-beat',
			status: patch.status ?? 'online',
			hand: patch.hand,
			ready: patch.ready,
		});
	}

	leave(): void {
		this.link?.close();
		this.link = null;
		this.update({ status: 'closed' });
	}

	// --- internals ---------------------------------------------------------------------------------

	private onLinkState(state: LinkState): void {
		if (state === 'closed') this.update({ status: 'closed' });
		else if (state === 'connecting') this.update({ status: 'reconnecting' });
	}

	private onHostMessage(
		message: HostMessage,
		resolveJoin: (id: JoinedIdentity) => void,
		rejectJoin: (err: Error) => void,
	): void {
		switch (message.kind) {
			case 'join-result':
				if (message.ok) {
					const identity: JoinedIdentity = {
						sessionId: message.sessionId,
						actorId: message.actorId,
						displayName: message.displayName,
						role: message.role,
					};
					this.update({ status: 'live', identity });
					resolveJoin(identity);
				} else {
					this.update({ status: 'closed', error: message.message });
					rejectJoin(new Error(message.message));
				}
				break;
			case 'snapshot':
				this.update({ status: 'live', data: message.data });
				break;
			case 'presence':
				this.update({ presence: message.entries });
				break;
			case 'command-ack': {
				const resolve = this.pending.get(message.requestId);
				if (resolve) {
					this.pending.delete(message.requestId);
					resolve(message.ok, message.message);
				}
				break;
			}
			case 'rekey':
				// A future key rotation would import and swap here; per-invitation keys make this optional.
				break;
			case 'pong':
				break;
		}
	}
}

function detectDeviceKind(): 'desktop' | 'web' | 'unknown' {
	if (typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent)) return 'desktop';
	if (typeof window !== 'undefined') return 'web';
	return 'unknown';
}

function randomId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
	return `req-${Math.random().toString(36).slice(2)}`;
}
