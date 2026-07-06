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
	startHostingOnline: () => Promise<void>;
	cloudSessions: DiscoveredService[];
	browseOnline: () => Promise<void>;
	stopBrowseOnline: () => void;
	connectOnline: (service: DiscoveredService) => Promise<void>;
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
	const [cloudSessions, setCloudSessions] = useState<DiscoveredService[]>([]);
	const discoveryCleanup = useRef<Array<() => void>>([]);
	const discovery = getDiscovery();
	const auth = useAuth();
	const cloudBridgeRef = useRef<CloudBridge | null>(null);
	const getCloudBridge = useCallback((): CloudBridge => {
		if (!cloudBridgeRef.current) cloudBridgeRef.current = createCloudBridge(() => auth.getIdToken());
		return cloudBridgeRef.current;
	}, [auth]);

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
		(host: SessionHost, bridge: DiscoveryBridge, name: string) => {
			void bridge.advertise(host.sessionId, name);
			const offAsk = bridge.onOfferRequest(async (reqId) => {
				const taken = new Set(host.connectedPeers.map((p) => p.actorId));
				const target = runtime.actors.find(
					(a) => (a.role === 'player' || a.role === 'observer') && !taken.has(a.id),
				);
				if (!target) return;
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
		},
		[runtime],
	);

	const startHosting = useCallback(() => {
		if (hostRef.current) return;
		const host = ensureHost();
		if (discovery) wireHost(host, discovery, 'DND Tools table');
	}, [discovery, ensureHost, wireHost]);

	// Make the table joinable over the internet (auth-gated). Can be combined with LAN hosting.
	const startHostingOnline = useCallback(async () => {
		if (!isCloudConfigured) return;
		if (!(await auth.requireAuth())) return;
		const host = ensureHost();
		wireHost(host, getCloudBridge(), 'DND Tools table');
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
		void cloudBridgeRef.current?.stopAdvertise();
		setRole((r) => (r === 'host' ? 'solo' : r));
	}, [discovery]);

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
		setRole((r) => (r === 'joined' ? 'solo' : r));
	}, []);

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

	// --- Cloud (internet) counterparts of browse/connect, auth-gated. -------
	const browseOnline = useCallback(async () => {
		if (!isCloudConfigured) return;
		if (!(await auth.requireAuth())) return;
		const bridge = getCloudBridge();
		const off = bridge.onServices((services) => setCloudSessions(services));
		discoveryCleanup.current.push(off);
		await bridge.browseStart();
	}, [auth, getCloudBridge]);

	const stopBrowseOnline = useCallback(() => {
		void cloudBridgeRef.current?.browseStop();
		setCloudSessions([]);
	}, []);

	const connectOnline = useCallback(
		async (service: DiscoveredService) => {
			if (!isCloudConfigured) return;
			if (!(await auth.requireAuth())) return;
			const bridge = getCloudBridge();
			// The host sends us an offer over the cloud rendezvous; join with it and return the answer.
			const off = bridge.onOffer(async (reqId, offerCode) => {
				const { answerCode } = await join(offerCode);
				await bridge.respondAnswer(reqId, answerCode);
			});
			discoveryCleanup.current.push(off);
			await bridge.connect(service);
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
			cloudSessions,
			browseOnline,
			stopBrowseOnline,
			connectOnline,
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
			cloudSessions,
			browseOnline,
			stopBrowseOnline,
			connectOnline,
		],
	);

	return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession(): SessionContextValue {
	const ctx = useContext(SessionCtx);
	if (!ctx) throw new Error('useSession must be used within a SessionProvider');
	return ctx;
}
