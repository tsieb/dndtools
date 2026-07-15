/**
 * Renderer-side access to the Electron LAN discovery bridge (Epic 7.3 mDNS auto-discovery). The bridge
 * is exposed by `electron/preload.cjs` as `window.dndtoolsDiscovery`. It is ABSENT in the web build and
 * in a packaged app built without the discovery module — callers MUST treat `getDiscovery()` returning
 * `null` as "no auto-discovery; use the manual connection codes." So the web build stays fully functional
 * and the desktop build gains discoverable LAN join when available. Discovery is not admission: the
 * host must approve each nearby request before an invitation is released.
 *
 * The renderer only ever handles opaque offer/answer code strings here (produced by SessionHost /
 * SessionClient, and already AES-GCM sealed at the message layer) — it never sees sockets or Node APIs.
 */

export interface DiscoveredService {
	sessionId: string;
	name: string;
	host: string;
	port: number;
}

export interface DiscoveryBridge {
	available(): Promise<boolean>;
	/** Advertise a table. `pin` is used by cloud pairing; LAN admission requires host approval. */
	advertise(sessionId: string, name: string, pin?: string): Promise<{ ok: boolean; port?: number }>;
	stopAdvertise(): Promise<void>;
	browseStart(): Promise<void>;
	browseStop(): Promise<void>;
	/** Join a table. `pin` is the cloud-only join secret (from the DM's join code). */
	connect(service: DiscoveredService, pin?: string): Promise<void>;
	/** Host: a joiner needs an offer code; reply via `respondOffer`. Returns an unsubscribe. */
	onOfferRequest(cb: (reqId: string) => void): () => void;
	respondOffer(reqId: string, offerCode: string): Promise<boolean>;
	rejectOffer(reqId: string): Promise<boolean>;
	/** Host: the joiner returned an answer code. Returns an unsubscribe. */
	onAnswer(cb: (answerCode: string) => void): () => void;
	/** Joiner: an offer arrived; reply via `respondAnswer`. Returns an unsubscribe. */
	onOffer(cb: (reqId: string, offerCode: string) => void): () => void;
	respondAnswer(reqId: string, answerCode: string): Promise<void>;
	/** Joiner: the discovered-services roster. Returns an unsubscribe. */
	onServices(cb: (services: DiscoveredService[]) => void): () => void;
}

/** The discovery bridge, or null when running without the Electron LAN bridge (web / degraded). */
export function getDiscovery(): DiscoveryBridge | null {
	const bridge = (globalThis as { dndtoolsDiscovery?: DiscoveryBridge }).dndtoolsDiscovery;
	return bridge ?? null;
}
