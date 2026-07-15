// CloudSyncProvider — owns the encrypted off-device BACKUP engine lifecycle and exposes a small hook
// the Settings UI drives. The engine exists (and touches the network) only when the backup
// backend is configured,
// the user is signed in, this device can hold the client key (custody), and the user has opted in.
// Everything else stays local-first. The CORE decides whether sync MAY be enabled (via the SYNC-017
// gate under the release-approved model); this provider just reflects that and wires the transport.

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
import { useAuth } from './AuthContext';
import { currentUser } from './auth';
import { useEntitlements } from './entitlements';
import { cloudConfig, isSyncConfigured } from './config';
import {
	cloudSyncIntent,
	getCloudSyncStatus,
	retryPendingCloudKeyDeletions,
	setCloudSyncEnabled,
	type CloudSyncStatus,
} from './cloudSync';
import { createSyncEngine, type CloudSyncEngine, type SyncEngineStatus } from './syncEngine';

interface CloudSyncContextValue {
	/** Whether the encrypted-backup backend is configured in this build at all. */
	available: boolean;
	/** Whether the current preview plan includes encrypted off-device backup. */
	includedInPlan: boolean;
	/** The core gate + device-custody status (canEnableOnThisDevice, custodyAvailable). */
	gate: CloudSyncStatus | null;
	/** This account's opt-in intent (the engine runs only when this + auth + custody all hold). */
	enabled: boolean;
	/** Live engine status (busy / last-synced / last-error / high-water). Null until the engine runs. */
	engineStatus: SyncEngineStatus | null;
	/** Opt in: prompts sign-in if needed, then enables (fails closed if the device can't hold the key). */
	enable(): Promise<void>;
	/** Opt out: stops the engine (local data untouched; cloud copy remains until overwritten/expired). */
	disable(): Promise<void>;
	/** Force an encrypted snapshot + op-tail backup now; rejects when the backup fails. */
	syncNow(): Promise<void>;
	/** Manually restore using the latest cloud snapshot and the same device-held vault key. */
	restore(): Promise<'restored' | 'no-snapshot'>;
	/** Re-read the core gate + custody status (e.g. after sign-in). */
	refresh(): Promise<void>;
}

const CloudSyncCtx = createContext<CloudSyncContextValue | null>(null);

export function CloudSyncProvider({ children }: { children: ReactNode }) {
	const runtime = useRuntime();
	const auth = useAuth();
	const entitlements = useEntitlements();
	const accountId = auth.status === 'signed-in' && auth.user?.sub ? auth.user.sub : null;
	const includedInPlan = entitlements.plan !== 'hearth';
	const [gateState, setGateState] = useState<{
		accountId: string | null;
		gate: CloudSyncStatus | null;
	}>({ accountId: null, gate: null });
	const [intentState, setIntentState] = useState<{
		accountId: string | null;
		enabled: boolean;
	}>(() => ({ accountId, enabled: cloudSyncIntent(accountId) }));
	const [engineStatus, setEngineStatus] = useState<SyncEngineStatus | null>(null);
	const engineRef = useRef<CloudSyncEngine | null>(null);
	const engineAccountRef = useRef<string | null>(null);
	const activeAccountRef = useRef(accountId);
	const gateRequestRef = useRef(0);
	activeAccountRef.current = accountId;

	useEffect(() => {
		void retryPendingCloudKeyDeletions().catch(() => {
			// Best-effort launch cleanup. The durable retry marker remains for the next launch.
		});
	}, []);

	const gate = gateState.accountId === accountId ? gateState.gate : null;
	const enabled = intentState.accountId === accountId && accountId !== null && intentState.enabled;

	const refresh = useCallback(async () => {
		const requestId = ++gateRequestRef.current;
		if (!isSyncConfigured || !accountId) {
			setGateState({ accountId: null, gate: null });
			return;
		}
		try {
			const next = await getCloudSyncStatus(accountId);
			if (requestId === gateRequestRef.current && activeAccountRef.current === accountId)
				setGateState({ accountId, gate: next });
		} catch (error) {
			if (requestId === gateRequestRef.current && activeAccountRef.current === accountId)
				setGateState({ accountId, gate: null });
			throw error;
		}
	}, [accountId]);

	useEffect(() => {
		setIntentState({ accountId, enabled: cloudSyncIntent(accountId) });
		setGateState({ accountId, gate: null });
		void refresh().catch(() => {
			// Fail closed. A user-triggered refresh still receives the rejection.
		});
	}, [accountId, refresh]);

	// Engine lifecycle: run only when configured + signed-in + opted-in. The gate's custody check is
	// what makes this fail closed on the web (no OS keychain → canEnableOnThisDevice is false).
	useEffect(() => {
		const canRun =
			isSyncConfigured &&
			includedInPlan &&
			auth.status === 'signed-in' &&
			enabled &&
			gate?.canEnableOnThisDevice;
		if (engineRef.current && (!canRun || engineAccountRef.current !== accountId)) {
			engineRef.current.stop();
			engineRef.current = null;
			engineAccountRef.current = null;
			setEngineStatus(null);
		}
		if (canRun && accountId && !engineRef.current) {
			const engineAccountId = accountId;
			const engine = createSyncEngine({
				runtime,
				apiUrl: cloudConfig.syncApiUrl,
				accountId: engineAccountId,
				onStatus: (s) => {
					if (activeAccountRef.current === engineAccountId) setEngineStatus(s);
				},
			});
			engineRef.current = engine;
			engineAccountRef.current = engineAccountId;
			setEngineStatus(engine.getStatus());
			engine.start();
		}
	}, [runtime, accountId, auth.status, enabled, includedInPlan, gate?.canEnableOnThisDevice]);

	useEffect(
		() => () => {
			engineRef.current?.stop();
			engineRef.current = null;
			engineAccountRef.current = null;
		},
		[],
	);

	const enable = useCallback(async () => {
		if (!includedInPlan) {
			throw new Error(
				'Encrypted cloud backup is included in the Lantern and Beacon preview plans.',
			);
		}
		const ok = await auth.requireAuth();
		if (!ok) return;
		const targetAccountId = activeAccountRef.current ?? (await currentUser())?.sub ?? null;
		if (!targetAccountId) throw new Error('Sign in before enabling encrypted cloud backup.');
		const nextGate = await setCloudSyncEnabled(true, targetAccountId);
		setIntentState({ accountId: targetAccountId, enabled: true });
		if (activeAccountRef.current === targetAccountId)
			setGateState({ accountId: targetAccountId, gate: nextGate });
	}, [auth, includedInPlan]);

	const disable = useCallback(async () => {
		const targetAccountId = activeAccountRef.current;
		if (!targetAccountId) {
			setIntentState({ accountId: null, enabled: false });
			setGateState({ accountId: null, gate: null });
			return;
		}
		if (engineAccountRef.current === targetAccountId) {
			engineRef.current?.stop();
			engineRef.current = null;
			engineAccountRef.current = null;
			setEngineStatus(null);
		}
		setIntentState({ accountId: targetAccountId, enabled: false });
		const nextGate = await setCloudSyncEnabled(false, targetAccountId);
		if (activeAccountRef.current === targetAccountId)
			setGateState({ accountId: targetAccountId, gate: nextGate });
	}, []);

	const syncNow = useCallback(async () => {
		if (!accountId || !engineRef.current || engineAccountRef.current !== accountId)
			throw new Error('Encrypted cloud backup is not active for this account.');
		await engineRef.current.syncNow();
	}, [accountId]);

	const restore = useCallback(async () => {
		if (!accountId || !engineRef.current || engineAccountRef.current !== accountId)
			throw new Error('Encrypted cloud backup is not active for this account.');
		return engineRef.current.restoreFromCloud();
	}, [accountId]);

	const value = useMemo<CloudSyncContextValue>(
		() => ({
			available: isSyncConfigured,
			includedInPlan,
			gate,
			enabled: enabled && includedInPlan,
			engineStatus,
			enable,
			disable,
			syncNow,
			restore,
			refresh,
		}),
		[includedInPlan, gate, enabled, engineStatus, enable, disable, syncNow, restore, refresh],
	);

	return <CloudSyncCtx.Provider value={value}>{children}</CloudSyncCtx.Provider>;
}

export function useCloudSync(): CloudSyncContextValue {
	const ctx = useContext(CloudSyncCtx);
	if (!ctx) throw new Error('useCloudSync must be used within <CloudSyncProvider>');
	return ctx;
}
