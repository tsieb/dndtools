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
import { SessionHost, type HostInvitation, type HostPeer } from './SessionHost';
import { SessionClient, type ClientState, type JoinedIdentity } from './SessionClient';
import type { CommandRequest } from './messages';
import { getDiscovery, type DiscoveredService } from './discovery';

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
	const discoveryCleanup = useRef<Array<() => void>>([]);
	const discovery = getDiscovery();

	const startHosting = useCallback(() => {
		if (hostRef.current) return;
		const host = new SessionHost(runtime, randomSessionId());
		host.onChange(() => setPeers(host.connectedPeers));
		hostRef.current = host;
		setRole('host');
		setPeers(host.connectedPeers);

		// LAN auto-discovery (Electron): advertise the table and answer code-free join handshakes. When a
		// joiner arrives, auto-invite the first participant without a live peer; accept their answer.
		if (discovery) {
			void discovery.advertise(host.sessionId, 'DND Tools table');
			const offAsk = discovery.onOfferRequest(async (reqId) => {
				const taken = new Set(host.connectedPeers.map((p) => p.actorId));
				const target = runtime.actors.find(
					(a) => (a.role === 'player' || a.role === 'observer') && !taken.has(a.id),
				);
				if (!target) return;
				const inv = await host.invite(target.id);
				setPeers(host.connectedPeers);
				await discovery.respondOffer(reqId, inv.offerCode);
			});
			const offAns = discovery.onAnswer(async (answerCode) => {
				try {
					await host.acceptAnswer(answerCode);
				} catch {
					/* stale/duplicate answer — ignore */
				}
			});
			discoveryCleanup.current.push(offAsk, offAns);
		}
	}, [runtime, discovery]);

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
		],
	);

	return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession(): SessionContextValue {
	const ctx = useContext(SessionCtx);
	if (!ctx) throw new Error('useSession must be used within a SessionProvider');
	return ctx;
}
