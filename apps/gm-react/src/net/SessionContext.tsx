import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from 'react';
import { useRuntime } from '../runtime/RuntimeContext';
import { useAuth } from '../cloud/AuthContext';
import { useEntitlements } from '../cloud/entitlements';
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

export interface PendingJoinRequest {
	/** Stable UI id; the transport's opaque request id is kept out of React state. */
	id: string;
	transport: 'nearby' | 'online';
	expiresAt: number;
}

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
	sendPresenceBeat: (patch: {
		status?: 'online' | 'away';
		hand?: boolean;
		ready?: boolean;
	}) => void;
	leave: () => void;
	// LAN auto-discovery (Electron only; empty/no-op elsewhere)
	discoveryAvailable: boolean;
	discovered: DiscoveredService[];
	/** Nearby and online devices waiting for explicit DM approval and participant assignment. */
	pendingJoins: PendingJoinRequest[];
	browseTables: () => void;
	stopBrowseTables: () => void;
	connectDiscovered: (service: DiscoveredService) => Promise<void>;
	approveJoin: (requestId: string, actorId: string) => Promise<void>;
	rejectJoin: (requestId: string) => Promise<void>;
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
	const [pendingJoins, setPendingJoins] = useState<PendingJoinRequest[]>([]);
	const [onlineJoinCode, setOnlineJoinCode] = useState<string | null>(null);
	const browseOffRef = useRef<(() => void) | null>(null);
	const discovery = getDiscovery();
	const auth = useAuth();
	const entitlements = useEntitlements();
	const cloudIncludedInPlan = entitlements.plan !== 'hearth';
	const cloudBridgeRef = useRef<CloudBridge | null>(null);
	const cloudWiredRef = useRef(false);
	const cloudOfferOffRef = useRef<(() => void) | null>(null);
	const cloudErrorOffRef = useRef<(() => void) | null>(null);
	const cloudModeRef = useRef<'host' | 'joiner' | null>(null);
	const onlineClientRef = useRef(false);
	const onlineStartRef = useRef<Promise<boolean> | null>(null);
	const lifecycleRef = useRef(0);
	const hostWireCleanupRef = useRef(new Map<DiscoveryBridge, () => void>());
	const pendingJoinRef = useRef(
		new Map<
			string,
			{
				requestId: string;
				transport: 'nearby' | 'online';
				bridge: DiscoveryBridge;
				host: SessionHost;
				timer: ReturnType<typeof setTimeout>;
			}
		>(),
	);

	const removePendingJoin = useCallback((id: string) => {
		const pending = pendingJoinRef.current.get(id);
		if (pending) clearTimeout(pending.timer);
		pendingJoinRef.current.delete(id);
		setPendingJoins((current) => current.filter((request) => request.id !== id));
	}, []);

	const queuePendingJoin = useCallback(
		(
			requestId: string,
			transport: 'nearby' | 'online',
			bridge: DiscoveryBridge,
			host: SessionHost,
		) => {
			const id = `${transport}:${requestId}`;
			if (pendingJoinRef.current.has(id)) return;
			const lifetimeMs = transport === 'nearby' ? 60_500 : 90_000;
			const expiresAt = Date.now() + lifetimeMs;
			const timer = setTimeout(() => {
				const pending = pendingJoinRef.current.get(id);
				if (!pending) return;
				removePendingJoin(id);
				void pending.bridge.rejectOffer(pending.requestId).catch(() => {});
			}, lifetimeMs);
			pendingJoinRef.current.set(id, { requestId, transport, bridge, host, timer });
			setPendingJoins((current) => [...current, { id, transport, expiresAt }]);
		},
		[removePendingJoin],
	);
	const getCloudBridge = useCallback((): CloudBridge => {
		if (!cloudBridgeRef.current)
			cloudBridgeRef.current = createCloudBridge(() => auth.getIdToken());
		return cloudBridgeRef.current;
	}, [auth]);
	const teardownCloudBridge = useCallback(() => {
		cloudOfferOffRef.current?.();
		cloudOfferOffRef.current = null;
		cloudErrorOffRef.current?.();
		cloudErrorOffRef.current = null;
		const bridge = cloudBridgeRef.current;
		if (bridge) {
			hostWireCleanupRef.current.get(bridge)?.();
			for (const [id, pending] of pendingJoinRef.current) {
				if (pending.bridge === bridge) removePendingJoin(id);
			}
			bridge.close();
		}
		cloudBridgeRef.current = null;
		cloudWiredRef.current = false;
		cloudModeRef.current = null;
		// Cloud sessions inject internet STUN/TURN into the shared RTC config; clear
		// it so a subsequent LAN-only session gathers host candidates only (privacy).
		clearRtcIceServers();
	}, [removePendingJoin]);

	// Wire a host to either rendezvous transport. Discovery proves only that a device can reach the
	// rendezvous; every request still waits for the DM to select a registered participant explicitly.
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
		async (
			host: SessionHost,
			bridge: DiscoveryBridge,
			name: string,
			pin = '',
			transport: 'nearby' | 'online' = 'nearby',
		) => {
			if (hostWireCleanupRef.current.has(bridge)) return;
			let active = true;
			const offAsk = bridge.onOfferRequest((requestId) => {
				if (!active || hostRef.current !== host) {
					void bridge.rejectOffer(requestId).catch(() => {});
					return;
				}
				queuePendingJoin(requestId, transport, bridge, host);
			});
			const offAns = bridge.onAnswer(async (answerCode) => {
				if (!active || hostRef.current !== host) return;
				try {
					await host.acceptAnswer(answerCode);
				} catch {
					/* stale/duplicate answer — ignore */
				}
			});
			const cleanup = () => {
				if (!active) return;
				active = false;
				offAsk();
				offAns();
				if (hostWireCleanupRef.current.get(bridge) === cleanup) {
					hostWireCleanupRef.current.delete(bridge);
				}
			};
			// Register cleanup before the first await so Stop cannot race a slow advertise and leave
			// listeners or a late-opened socket behind.
			hostWireCleanupRef.current.set(bridge, cleanup);
			// Advertise last, and await it so callers learn whether hosting actually
			// started (the cloud bridge can reject: no token, unreachable, timeout).
			try {
				await bridge.advertise(host.sessionId, name, pin);
				if (!active || hostRef.current !== host) {
					await bridge.stopAdvertise().catch(() => {});
					throw new Error('Hosting was stopped before the table became available.');
				}
			} catch (error) {
				cleanup();
				throw error;
			}
		},
		[queuePendingJoin],
	);

	const startHosting = useCallback(() => {
		if (hostRef.current) return;
		const host = ensureHost();
		// LAN advertise is fire-and-forget; swallow its rejection so it can't become
		// an unhandled promise rejection.
		if (discovery) void wireHost(host, discovery, 'DND Tools table', '', 'nearby').catch(() => {});
	}, [discovery, ensureHost, wireHost]);

	// Make the table joinable over the internet (auth-gated). Can be combined with LAN
	// hosting. Returns true only once the table is actually advertised online.
	const startHostingOnline = useCallback(async (): Promise<boolean> => {
		if (!isCloudConfigured || !cloudIncludedInPlan) return false;
		if (cloudWiredRef.current) return true; // already joinable online — don't double-wire
		if (onlineStartRef.current) return onlineStartRef.current;
		const lifecycle = lifecycleRef.current;
		const start = (async () => {
			if (!(await auth.requireAuth())) return false;
			if (lifecycle !== lifecycleRef.current) return false;
			const hadHost = hostRef.current !== null;
			const host = ensureHost();
			const bridge = getCloudBridge();
			cloudModeRef.current = 'host';
			// Mint a per-session join secret. It is folded into the pairing key and never
			// transits the signaling relay; the same code remains valid only while this host runs.
			const pin = generateJoinPin();
			try {
				await wireHost(host, bridge, 'DND Tools table', pin, 'online');
				if (lifecycle !== lifecycleRef.current || hostRef.current !== host) {
					throw new Error('Hosting was stopped before the table became available.');
				}
				cloudWiredRef.current = true;
				setOnlineJoinCode(encodeJoinCode(host.sessionId, pin));
				cloudErrorOffRef.current?.();
				cloudErrorOffRef.current = bridge.onError(() => {
					setOnlineJoinCode(null);
					teardownCloudBridge();
				});
				return true;
			} catch (error) {
				setOnlineJoinCode(null);
				teardownCloudBridge();
				if (!hadHost && hostRef.current === host) {
					host.stop();
					hostRef.current = null;
					setPeers([]);
					setRole('solo');
				}
				throw error;
			}
		})();
		onlineStartRef.current = start;
		try {
			return await start;
		} finally {
			if (onlineStartRef.current === start) onlineStartRef.current = null;
		}
	}, [auth, cloudIncludedInPlan, ensureHost, wireHost, getCloudBridge, teardownCloudBridge]);

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

	const approveJoin = useCallback(
		async (id: string, actorId: string) => {
			const pending = pendingJoinRef.current.get(id);
			const host = hostRef.current;
			if (!pending || !host || pending.host !== host) {
				throw new Error('That join request is no longer waiting.');
			}
			let invitation: HostInvitation | null = null;
			try {
				if (pending.transport === 'online') {
					await (pending.bridge as CloudBridge).prepareOffer();
				}
				invitation = await host.invite(actorId);
				const delivered = await pending.bridge.respondOffer(
					pending.requestId,
					invitation.offerCode,
				);
				if (!delivered) throw new Error('That join request expired. Ask the player to try again.');
				setPeers(host.connectedPeers);
			} catch (error) {
				if (invitation) host.revoke(invitation.peerId);
				await pending.bridge.rejectOffer(pending.requestId).catch(() => {});
				throw error;
			} finally {
				removePendingJoin(id);
			}
		},
		[removePendingJoin],
	);

	const rejectJoin = useCallback(
		async (id: string) => {
			const pending = pendingJoinRef.current.get(id);
			if (!pending) return;
			try {
				await pending.bridge.rejectOffer(pending.requestId);
			} finally {
				removePendingJoin(id);
			}
		},
		[removePendingJoin],
	);

	const revoke = useCallback((peerId: string) => {
		hostRef.current?.revoke(peerId);
		setPeers(hostRef.current?.connectedPeers ?? []);
	}, []);

	const stopHosting = useCallback(() => {
		lifecycleRef.current += 1;
		hostRef.current?.stop();
		hostRef.current = null;
		setPeers([]);
		for (const cleanup of [...hostWireCleanupRef.current.values()]) cleanup();
		hostWireCleanupRef.current.clear();
		browseOffRef.current?.();
		browseOffRef.current = null;
		void discovery?.browseStop();
		setDiscovered([]);
		void discovery?.stopAdvertise();
		for (const [id, pending] of pendingJoinRef.current) {
			void pending.bridge.rejectOffer(pending.requestId).catch(() => {});
			removePendingJoin(id);
		}
		setOnlineJoinCode(null);
		// Close the authenticated signaling socket and clear injected ICE servers,
		// rather than leaving them alive for the server-side connection TTL. The
		// server deletes the room on $disconnect.
		teardownCloudBridge();
		setRole((r) => (r === 'host' ? 'solo' : r));
	}, [discovery, removePendingJoin, teardownCloudBridge]);

	const browseTables = useCallback(() => {
		if (!discovery) return;
		browseOffRef.current?.();
		browseOffRef.current = discovery.onServices((services) => setDiscovered(services));
		void discovery.browseStart();
	}, [discovery]);

	const stopBrowseTables = useCallback(() => {
		browseOffRef.current?.();
		browseOffRef.current = null;
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
		onlineClientRef.current = false;
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
			let off = () => {};
			off = discovery.onOffer(async (reqId, offerCode) => {
				try {
					const { answerCode } = await join(offerCode);
					await discovery.respondAnswer(reqId, answerCode);
				} finally {
					off();
				}
			});
			try {
				await discovery.connect(service);
			} catch (error) {
				off();
				throw error;
			}
		},
		[discovery, join],
	);

	useEffect(
		() => () => {
			browseOffRef.current?.();
			for (const cleanup of [...hostWireCleanupRef.current.values()]) cleanup();
			hostWireCleanupRef.current.clear();
			for (const pending of pendingJoinRef.current.values()) clearTimeout(pending.timer);
			pendingJoinRef.current.clear();
			void discovery?.browseStop();
			void discovery?.stopAdvertise();
			hostRef.current?.stop();
			clientRef.current?.leave();
			teardownCloudBridge();
		},
		[discovery, teardownCloudBridge],
	);

	// --- Cloud (internet) join via the DM's out-of-band join code, auth-gated. -------
	// There is deliberately NO global browse: a stranger's live session is not discoverable.
	// The joiner must hold the DM's join code (session id + PIN); the PIN gates admission.
	const connectOnlineByCode = useCallback(
		async (joinCode: string) => {
			if (!isCloudConfigured) throw new Error('Online play is not configured in this build.');
			if (!cloudIncludedInPlan) {
				throw new Error(
					'Internet remote play is included in the Lantern and Beacon preview plans.',
				);
			}
			// decodeJoinCode throws on a malformed code — surfaced to the caller's catch.
			const { sessionId, pin } = decodeJoinCode(joinCode);
			if (!(await auth.requireAuth())) throw new Error('Sign in to join an online table.');
			const bridge = getCloudBridge();
			cloudModeRef.current = 'joiner';
			// Wait for all three stages: the host's explicit approval, our sealed answer reaching the
			// host, and the WebRTC channel admitting the selected participant. No stage can hang forever.
			cloudOfferOffRef.current?.();
			cloudErrorOffRef.current?.();
			let approvalTimer: ReturnType<typeof setTimeout> | null = null;
			try {
				await new Promise<void>((resolve, reject) => {
					let settled = false;
					const finish = (error?: Error) => {
						if (settled) return;
						settled = true;
						if (approvalTimer) clearTimeout(approvalTimer);
						if (error) reject(error);
						else resolve();
					};
					approvalTimer = setTimeout(
						() =>
							finish(
								new Error('The DM did not approve this request in time. Ask them to try again.'),
							),
						90_000,
					);
					cloudErrorOffRef.current = bridge.onError((error) => finish(error));
					cloudOfferOffRef.current = bridge.onOffer((requestId, offerCode) => {
						void (async () => {
							const { answerCode, joined } = await join(offerCode);
							await bridge.respondAnswer(requestId, answerCode);
							await Promise.race([
								joined,
								new Promise<never>((_, rejectJoined) =>
									setTimeout(
										() =>
											rejectJoined(
												new Error('The direct connection did not open. Please try again.'),
											),
										30_000,
									),
								),
							]);
							finish();
						})().catch((error) =>
							finish(error instanceof Error ? error : new Error('Could not join the table.')),
						);
					});
					void bridge
						.connect({ sessionId, name: 'Online table', host: 'cloud', port: 0 }, pin)
						.catch((error) =>
							finish(
								error instanceof Error ? error : new Error('Could not reach the online table.'),
							),
						);
				});
				// Signaling is no longer needed after WebRTC is live; close it and clear the
				// temporary relay configuration without disturbing the established data channel.
				onlineClientRef.current = true;
				teardownCloudBridge();
			} catch (error) {
				clientRef.current?.leave();
				clientRef.current = null;
				onlineClientRef.current = false;
				setClient(null);
				setRole((current) => (current === 'joined' ? 'solo' : current));
				teardownCloudBridge();
				throw error;
			} finally {
				if (approvalTimer) clearTimeout(approvalTimer);
				cloudOfferOffRef.current?.();
				cloudOfferOffRef.current = null;
				cloudErrorOffRef.current?.();
				cloudErrorOffRef.current = null;
			}
		},
		[auth, cloudIncludedInPlan, getCloudBridge, join, teardownCloudBridge],
	);

	useEffect(() => {
		if (auth.status === 'signed-in' && cloudIncludedInPlan) return;
		if (!cloudBridgeRef.current && !onlineClientRef.current) return;
		const mode = cloudModeRef.current;
		setOnlineJoinCode(null);
		if (mode === 'joiner' || onlineClientRef.current) {
			clientRef.current?.leave();
			clientRef.current = null;
			onlineClientRef.current = false;
			setClient(null);
			setRole((current) => (current === 'joined' ? 'solo' : current));
		}
		teardownCloudBridge();
	}, [auth.status, cloudIncludedInPlan, teardownCloudBridge]);

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
			pendingJoins,
			browseTables,
			stopBrowseTables,
			connectDiscovered,
			approveJoin,
			rejectJoin,
			cloudAvailable: isCloudConfigured && cloudIncludedInPlan,
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
			pendingJoins,
			browseTables,
			stopBrowseTables,
			connectDiscovered,
			approveJoin,
			rejectJoin,
			startHostingOnline,
			onlineJoinCode,
			connectOnlineByCode,
			cloudIncludedInPlan,
		],
	);

	return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession(): SessionContextValue {
	const ctx = useContext(SessionCtx);
	if (!ctx) throw new Error('useSession must be used within a SessionProvider');
	return ctx;
}
