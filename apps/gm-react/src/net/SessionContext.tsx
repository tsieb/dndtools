import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from 'react';
import { useRuntime } from '../runtime/RuntimeContext';
import { useAuth } from '../cloud/AuthContext';
import { isCloudConfigured } from '../cloud/config';
import { SessionHost, type HostInvitation, type HostPeer } from './SessionHost';
import { SessionClient, type ClientState, type JoinedIdentity } from './SessionClient';
import type { CommandRequest } from './messages';
import { getDiscovery, type DiscoveryBridge, type DiscoveredService } from './discovery';
import { createCloudBridge, type CloudBridge } from './cloudBridge';
import { generateJoinPin, encodeJoinCode, decodeJoinCode } from './cloudCrypto';
import { clearRtcIceServers } from './signaling';

/**
 * The P2P session role of THIS device:
 *  - `solo`   — not connected; the DM plays locally (the default, fully-functional offline mode),
 *  - `host`   — hosting a table; connected players receive player-safe snapshots,
 *  - `joined` — joined a remote table as a player/observer; renders replicated snapshots.
 */
export type SessionRole = 'solo' | 'host' | 'joined';

export interface SessionContextValue {
	role: SessionRole;
	// Host
	peers: HostPeer[];
	startHosting: () => void;
	invite: (actorId: string) => Promise<HostInvitation>;
	acceptAnswer: (answerCode: string) => Promise<void>;
	revoke: (peerId: string) => void;
	stopHosting: () => void;
	// Client
	client: ClientState | null;
	join: (offerCode: string) => Promise<{ answerCode: string; joined: Promise<JoinedIdentity> }>;
	requestCommand: (command: CommandRequest) => Promise<{ ok: boolean; message?: string }>;
	sendPresenceBeat: (patch: { status?: 'online' | 'away'; hand?: boolean; ready?: boolean }) => void;
	leave: () => void;
	// LAN auto-discovery (Electron only; empty/no-op elsewhere)
	discoveryAvailable: boolean;
	discovered: DiscoveredService[];
	browseTables: () => void;
	stopBrowseTables: () => void;
	connectDiscovered: (service: DiscoveredService) => Promise<void>;
	// Cloud (internet) remote play — auth-gated, only when cloud is configured.
	cloudAvailable: boolean;
	/** Resolves true only if the table is actually being advertised online (false on cancel/failure). */
	startHostingOnline: () => Promise<boolean>;
	/**
	 * The out-of-band online join code (session id + join PIN) the DM shares so an invited player
	 * can connect. Null until hosting online starts. Possession of this code is the join credential.
	 */
	onlineJoinCode: string | null;
	/** Join an online table using the DM's shared join code (decodes to session id + PIN). */
	connectOnlineByCode: (joinCode: string) => Promise<void>;
}

const SessionCtx = createContext<SessionContextValue | null>(null);

function randomSessionId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return `sess-${crypto.randomUUID()}`;
	}
	return `sess-${Math.random().toString(36).slice(2)}`;
}

/**
 * Provides P2P session state to the tree. Sits INSIDE RuntimeProvider (it hosts the real runtime) and is
 * inert until the DM starts hosting or a player joins — so the solo/offline experience is unchanged.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
	const runtime = useRuntime();
	const hostRef = useRef<SessionHost | null>(null);
	const clientRef = useRef<SessionClient | null>(null);

	const [role, setRole] = useState<SessionRole>('solo');
	const [peers, setPeers] = useState<HostPeer[]>([]);
	const [client, setClient] = useState<ClientState | null>(null);
	const [discovered, setDiscovered] = useState<DiscoveredService[]>([]);
	const [onlineJoinCode, setOnlineJoinCode] = useState<string | null>(null);
	const discoveryCleanup = useRef<Array<() => void>>([]);
	const discovery = getDiscovery();
	const auth = useAuth();
	const cloudBridgeRef = useRef<CloudBridge | null>(null);
	// Whether the cloud bridge is already wired for hosting (avoids double-advertise),
	// plus the live unsubscribe handles for the cloud browse/join listeners so they
	// can be torn down independently of the host-side discoveryCleanup array.
	const cloudWiredRef = useRef(false);
	const cloudOfferOffRef = useRef<(() => void) | null>(null);
	const getCloudBridge = useCallback((): CloudBridge => {
		if (!cloudBridgeRef.current) cloudBridgeRef.current = createCloudBridge(() => auth.getIdToken());
		return cloudBridgeRef.current;
	}, [auth]);
	const teardownCloudBridge = useCallback(() => {
		cloudOfferOffRef.current?.();
		cloudOfferOffRef.current = null;
		cloudBridgeRef.current?.close();
		cloudBridgeRef.current = null;
		cloudWiredRef.current = false;
		// Cloud sessions inject internet STUN/TURN into the shared RTC config; clear
		// it so a subsequent LAN-only session gathers host candidates only (privacy).
		clearRtcIceServers();
	}, []);

	// Wire a host to a discovery bridge (LAN mDNS OR cloud WS — same DiscoveryBridge interface): advertise
	// the table and, when a joiner arrives, auto-invite the first participant without a live peer and accept
	// their answer. The offer/answer codes are opaque and already AES-GCM sealed regardless of bridge.
	const ensureHost = useCallback((): SessionHost => {
		if (hostRef.current) return hostRef.current;
		const host = new SessionHost(runtime, randomSessionId());
		host.onChange(() => setPeers(host.connectedPeers));
		hostRef.current = host;
		setRole('host');
		setPeers(host.connectedPeers);
		return host;
	}, [runtime]);

	const wireHost = useCallback(
		async (host: SessionHost, bridge: DiscoveryBridge, name: string, pin = '') => {
			const offAsk = bridge.onOfferRequest(async (reqId) => {
				const taken = new Set(host.connectedPeers.map((p) => p.actorId));
				const target = runtime.actors.find(
					(a) => (a.role === 'player' || a.role === 'observer') && !taken.has(a.id),
				);
				if (!target) return;
				// The offer embeds the session key but is sealed to the joiner under the PIN-bound
				// key (cloud) — a joiner without the PIN cannot open it or complete the handshake,
				// so auto-selecting the first open seat here does not admit an uninvited stranger.
				const inv = await host.invite(target.id);
				setPeers(host.connectedPeers);
				await bridge.respondOffer(reqId, inv.offerCode);
			});
			const offAns = bridge.onAnswer(async (answerCode) => {
				try {
					await host.acceptAnswer(answerCode);
				} catch {
					/* stale/duplicate answer — ignore */
				}
			});
			discoveryCleanup.current.push(offAsk, offAns);
			// Advertise last, and await it so callers learn whether hosting actually
			// started (the cloud bridge can reject: no token, unreachable, timeout).
			await bridge.advertise(host.sessionId, name, pin);
		},
		[runtime],
	);

	const startHosting = useCallback(() => {
		if (hostRef.current) return;
		const host = ensureHost();
		// LAN advertise is fire-and-forget; swallow its rejection so it can't become
		// an unhandled promise rejection.
		if (discovery) void wireHost(host, discovery, 'DND Tools table').catch(() => {});
	}, [discovery, ensureHost, wireHost]);

	// Make the table joinable over the internet (auth-gated). Can be combined with LAN
	// hosting. Returns true only once the table is actually advertised online.
	const startHostingOnline = useCallback(async (): Promise<boolean> => {
		if (!isCloudConfigured) return false;
		if (cloudWiredRef.current) return true; // already joinable online — don't double-wire
		if (!(await auth.requireAuth())) return false;
		const host = ensureHost();
		// Mint a per-session join secret (the cloud admission credential) and publish the
		// out-of-band join code the DM shares. The secret is folded into the pairing key and
		// never transits the relay.
		const pin = generateJoinPin();
		await wireHost(host, getCloudBridge(), 'DND Tools table', pin);
		cloudWiredRef.current = true;
		setOnlineJoinCode(encodeJoinCode(host.sessionId, pin));
		return true;
	}, [auth, ensureHost, wireHost, getCloudBridge]);

	const invite = useCallback(async (actorId: string) => {
		if (!hostRef.current) throw new Error('Start hosting first.');
		const inv = await hostRef.current.invite(actorId);
		setPeers(hostRef.current.connectedPeers);
		return inv;
	}, []);

	const acceptAnswer = useCallback(async (answerCode: string) => {
		if (!hostRef.current) throw new Error('Start hosting first.');
		await hostRef.current.acceptAnswer(answerCode);
	}, []);

	const revoke = useCallback((peerId: string) => {
		hostRef.current?.revoke(peerId);
		setPeers(hostRef.current?.connectedPeers ?? []);
	}, []);

	const stopHosting = useCallback(() => {
		hostRef.current?.stop();
		hostRef.current = null;
		setPeers([]);
		for (const off of discoveryCleanup.current) off();
		discoveryCleanup.current = [];
		void discovery?.stopAdvertise();
		setOnlineJoinCode(null);
		// Close the authenticated signaling socket and clear injected ICE servers,
		// rather than leaving them alive for the server-side connection TTL. The
		// server deletes the room on $disconnect.
		teardownCloudBridge();
		setRole((r) => (r === 'host' ? 'solo' : r));
	}, [discovery, teardownCloudBridge]);

	const browseTables = useCallback(() => {
		if (!discovery) return;
		const off = discovery.onServices((services) => setDiscovered(services));
		discoveryCleanup.current.push(off);
		void discovery.browseStart();
	}, [discovery]);

	const stopBrowseTables = useCallback(() => {
		void discovery?.browseStop();
		setDiscovered([]);
	}, [discovery]);

	const join = useCallback(async (offerCode: string) => {
		let c = clientRef.current;
		if (!c) {
			c = new SessionClient();
			c.onChange((s) => setClient({ ...s }));
			clientRef.current = c;
		}
		const result = await c.join(offerCode);
		setRole('joined');
		setClient(c.getState());
		return result;
	}, []);

	const requestCommand = useCallback(async (command: CommandRequest) => {
		if (!clientRef.current) return { ok: false, message: 'Not connected to a table.' };
		return clientRef.current.requestCommand(command);
	}, []);

	const sendPresenceBeat = useCallback(
		(patch: { status?: 'online' | 'away'; hand?: boolean; ready?: boolean }) => {
			clientRef.current?.sendPresenceBeat(patch);
		},
		[],
	);

	const leave = useCallback(() => {
		clientRef.current?.leave();
		clientRef.current = null;
		setClient(null);
		// Drop the cloud join listener + socket and reset injected ICE servers so a
		// later LAN session isn't left with internet relay candidates.
		teardownCloudBridge();
		setRole((r) => (r === 'joined' ? 'solo' : r));
	}, [teardownCloudBridge]);

	const connectDiscovered = useCallback(
		async (service: DiscoveredService) => {
			if (!discovery) return;
			// The host will send us an offer over the LAN rendezvous; join with it and return the answer.
			const off = discovery.onOffer(async (reqId, offerCode) => {
				const { answerCode } = await join(offerCode);
				await discovery.respondAnswer(reqId, answerCode);
			});
			discoveryCleanup.current.push(off);
			await discovery.connect(service);
		},
		[discovery, join],
	);

	// --- Cloud (internet) join via the DM's out-of-band join code, auth-gated. -------
	// There is deliberately NO global browse: a stranger's live session is not discoverable.
	// The joiner must hold the DM's join code (session id + PIN); the PIN gates admission.
	const connectOnlineByCode = useCallback(
		async (joinCode: string) => {
			if (!isCloudConfigured) return;
			// decodeJoinCode throws on a malformed code — surfaced to the caller's catch.
			const { sessionId, pin } = decodeJoinCode(joinCode);
			if (!(await auth.requireAuth())) return;
			const bridge = getCloudBridge();
			// The host sends us an offer over the cloud rendezvous; join with it and return the answer.
			// Replace any prior handler so a second connect can't fire two joins on one offer.
			cloudOfferOffRef.current?.();
			cloudOfferOffRef.current = bridge.onOffer(async (reqId, offerCode) => {
				const { answerCode } = await join(offerCode);
				await bridge.respondAnswer(reqId, answerCode);
			});
			await bridge.connect({ sessionId, name: 'Online table', host: 'cloud', port: 0 }, pin);
		},
		[auth, getCloudBridge, join],
	);

	const value = useMemo<SessionContextValue>(
		() => ({
			role,
			peers,
			startHosting,
			invite,
			acceptAnswer,
			revoke,
			stopHosting,
			client,
			join,
			requestCommand,
			sendPresenceBeat,
			leave,
			discoveryAvailable: discovery !== null,
			discovered,
			browseTables,
			stopBrowseTables,
			connectDiscovered,
			cloudAvailable: isCloudConfigured,
			startHostingOnline,
			onlineJoinCode,
			connectOnlineByCode,
		}),
		[
			role,
			peers,
			startHosting,
			invite,
			acceptAnswer,
			revoke,
			stopHosting,
			client,
			join,
			requestCommand,
			sendPresenceBeat,
			leave,
			discovery,
			discovered,
			browseTables,
			stopBrowseTables,
			connectDiscovered,
			startHostingOnline,
			onlineJoinCode,
			connectOnlineByCode,
		],
	);

	return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession(): SessionContextValue {
	const ctx = useContext(SessionCtx);
	if (!ctx) throw new Error('useSession must be used within a SessionProvider');
	return ctx;
}
