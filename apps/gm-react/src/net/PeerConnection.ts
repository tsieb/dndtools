import { open, seal } from './crypto';
import type { PeerMessage } from './messages';

export type LinkState = 'connecting' | 'open' | 'closed';

/**
 * A single encrypted peer link: one WebRTC data channel + its session key. It owns exactly the wire
 * concerns — seal on send, open on receive, connection-state tracking, close — and NO application logic
 * (SessionHost / SessionClient supply that). A frame that fails to decrypt (wrong/rotated key, garbled
 * bytes) is dropped silently rather than crashing the link.
 */
export class PeerLink {
	private key: CryptoKey;
	private readonly pc: RTCPeerConnection;
	private readonly channel: RTCDataChannel;
	private messageHandler: ((message: PeerMessage) => void) | null = null;
	private stateHandler: ((state: LinkState) => void) | null = null;
	private closed = false;

	constructor(pc: RTCPeerConnection, channel: RTCDataChannel, key: CryptoKey) {
		this.pc = pc;
		this.channel = channel;
		this.key = key;

		channel.onmessage = (ev: MessageEvent) => {
			if (typeof ev.data !== 'string') return;
			void this.receive(ev.data);
		};
		channel.onopen = () => this.stateHandler?.('open');
		channel.onclose = () => this.markClosed();
		pc.onconnectionstatechange = () => {
			const s = pc.connectionState;
			if (s === 'failed' || s === 'disconnected' || s === 'closed') this.markClosed();
		};
	}

	get state(): LinkState {
		if (this.closed) return 'closed';
		return this.channel.readyState === 'open' ? 'open' : 'connecting';
	}

	onMessage(handler: (message: PeerMessage) => void): void {
		this.messageHandler = handler;
	}

	onStateChange(handler: (state: LinkState) => void): void {
		this.stateHandler = handler;
	}

	/** Rotate the session key used for subsequent seal/open (S7.3.4 rekey). */
	setKey(key: CryptoKey): void {
		this.key = key;
	}

	async send(message: PeerMessage): Promise<void> {
		if (this.closed || this.channel.readyState !== 'open') return;
		try {
			this.channel.send(await seal(this.key, message));
		} catch {
			// A send failure (channel raced to closed) is non-fatal; state handlers will report the close.
		}
	}

	private async receive(data: string): Promise<void> {
		try {
			const message = await open(this.key, data);
			this.messageHandler?.(message);
		} catch {
			// Undecryptable/garbled frame — drop it (a revoked peer's frames land here).
		}
	}

	private markClosed(): void {
		if (this.closed) return;
		this.closed = true;
		this.stateHandler?.('closed');
	}

	close(): void {
		this.markClosed();
		try {
			this.channel.close();
		} catch {
			/* already closing */
		}
		try {
			this.pc.close();
		} catch {
			/* already closing */
		}
	}
}
