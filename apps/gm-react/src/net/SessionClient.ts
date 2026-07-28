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
import {
	parseHostMessage,
	type CommandRequest,
	type HostMessage,
	type PeerPresenceEntry,
} from './messages';
import type { PlayerData } from './viewModels';
import { getPlatformCapabilities } from '../platform/capabilities';

export type ClientStatus = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'closed';

/** The identity the host admitted this device as (from the join handshake). */
export interface JoinedIdentity {
	sessionId: string;
	actorId: string;
	displayName: string;
	role: 'player' | 'observer' | 'co-dm';
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
	private cancelJoin: ((error: Error) => void) | null = null;

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
		this.cancelJoin?.(new Error('A new connection attempt replaced the previous one.'));
		this.link?.close();
		this.link = null;
		this.update({
			status: 'connecting',
			identity: null,
			data: null,
			presence: [],
			error: null,
		});
		let offer: OfferPayload;
		try {
			offer = await decodeCode<OfferPayload>(offerCode);
		} catch {
			this.update({ status: 'idle', error: 'That connection code is not valid.' });
			throw new Error('Invalid connection code.');
		}
		if (offer.role !== 'offer') {
			this.update({ status: 'idle', error: 'That code is not a session invitation.' });
			throw new Error('That code is not a session invitation.');
		}

		try {
			const key = await importKeyBase64(offer.keyB64);
			const accepted = await acceptOfferCreateAnswer(offer.sdp);
			let settled = false;
			let timeout: ReturnType<typeof setTimeout>;
			let failJoin = (_error: Error) => {};
			const joined = new Promise<JoinedIdentity>((resolve, reject) => {
				const resolveOnce = (identity: JoinedIdentity) => {
					if (settled) return;
					settled = true;
					clearTimeout(timeout);
					this.cancelJoin = null;
					resolve(identity);
				};
				failJoin = (error: Error) => {
					if (settled) return;
					settled = true;
					clearTimeout(timeout);
					this.cancelJoin = null;
					this.link?.close();
					this.link = null;
					accepted.pc.close();
					this.update({ status: 'closed', error: error.message });
					reject(error);
				};
				this.cancelJoin = failJoin;
				timeout = setTimeout(
					() => failJoin(new Error('The host did not finish the connection in time.')),
					120_000,
				);
				void accepted.channel
					.then((channel) => {
						if (settled) {
							channel.close();
							return;
						}
						const link = new PeerLink(accepted.pc, channel, key);
						this.link = link;
						// Announce readiness once the channel is open (the host replies with `join-result`).
						const announce = () => {
							void link
								.send({
									kind: 'hello',
									protocolVersion: SIGNALING_VERSION,
									displayName: offer.displayName,
									deviceKind: detectDeviceKind(),
								})
								.catch(() => failJoin(new Error('Could not reach the host.')));
						};
						link.onStateChange((state) => {
							this.onLinkState(state);
							if (state === 'open') announce();
							else if (state === 'closed' && !settled) {
								failJoin(new Error('The direct connection closed before the host admitted you.'));
							}
						});
						link.onMessage((value) => {
							const message = parseHostMessage(value);
							if (message) this.onHostMessage(message, resolveOnce, failJoin);
						});
						if (link.state === 'open') announce();
					})
					.catch(() => failJoin(new Error('The host did not open a direct connection.')));
			});
			// Manual-code callers may display the answer before they observe `joined`; keep a rejected
			// attempt from becoming an unhandled promise while still returning the original promise.
			void joined.catch(() => {});

			const answer: AnswerPayload = {
				v: SIGNALING_VERSION,
				role: 'answer',
				sessionId: offer.sessionId,
				actorId: offer.actorId,
				sdp: accepted.sdp,
			};
			try {
				return { answerCode: await encodeCode(answer), joined };
			} catch (error) {
				failJoin(new Error('Could not create the reply code.'));
				throw error;
			}
		} catch (error) {
			const normalized = error instanceof Error ? error : new Error('Could not join the table.');
			if (this.state.status === 'connecting') {
				this.update({ status: 'idle', error: normalized.message });
			}
			throw normalized;
		}
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
				if (this.pending.delete(requestId))
					resolve({ ok: false, message: 'The table did not respond.' });
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
		this.cancelJoin?.(new Error('You left the table.'));
		this.cancelJoin = null;
		this.link?.close();
		this.link = null;
		for (const resolve of this.pending.values()) resolve(false, 'The table connection closed.');
		this.pending.clear();
		this.update({ status: 'closed', error: null });
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
	const runtimeKind = getPlatformCapabilities().runtimeKind;
	if (runtimeKind === 'electron') return 'desktop';
	if (runtimeKind === 'web' || runtimeKind === 'android') return 'web';
	return 'unknown';
}

function randomId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
		return crypto.randomUUID();
	return `req-${Math.random().toString(36).slice(2)}`;
}
