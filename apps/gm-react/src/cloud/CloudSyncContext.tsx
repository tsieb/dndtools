// CloudSyncProvider — owns the cloud sync ENGINE lifecycle and exposes a small hook the Settings UI
// drives. The engine only exists (and only touches the network) when: the sync backend is configured,
// the user is signed in, this device can hold the client key (custody), and the user has opted in.
// Everything else stays local-first. The CORE decides whether sync MAY be enabled (via the SYNC-017
// gate under the release-approved model); this provider just reflects that and wires the transport.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRuntime } from '../runtime/RuntimeContext';
import { useAuth } from './AuthContext';
import { cloudConfig, isSyncConfigured } from './config';
import { cloudSyncIntent, getCloudSyncStatus, setCloudSyncEnabled, type CloudSyncStatus } from './cloudSync';
import { createSyncEngine, type CloudSyncEngine, type SyncEngineStatus } from './syncEngine';

interface CloudSyncContextValue {
	/** Whether the sync backend is configured in this build at all. */
	available: boolean;
	/** The core gate + device-custody status (canEnableOnThisDevice, custodyAvailable). */
	gate: CloudSyncStatus | null;
	/** The user's opt-in intent (reflected; the engine runs only when this + auth + custody all hold). */
	enabled: boolean;
	/** Live engine status (busy / last-synced / last-error / high-water). Null until the engine runs. */
	engineStatus: SyncEngineStatus | null;
	/** Opt in: prompts sign-in if needed, then enables (fails closed if the device can't hold the key). */
	enable(): Promise<void>;
	/** Opt out: stops the engine (local data untouched; cloud copy remains until overwritten/expired). */
	disable(): Promise<void>;
	/** Force a snapshot + op-tail push now. */
	syncNow(): Promise<void>;
	/** Fresh-device restore from the latest cloud snapshot. */
	restore(): Promise<'restored' | 'no-snapshot'>;
	/** Re-read the core gate + custody status (e.g. after sign-in). */
	refresh(): Promise<void>;
}

const CloudSyncCtx = createContext<CloudSyncContextValue | null>(null);

export function CloudSyncProvider({ children }: { children: ReactNode }) {
	const runtime = useRuntime();
	const auth = useAuth();
	const [gate, setGate] = useState<CloudSyncStatus | null>(null);
	const [enabled, setEnabled] = useState<boolean>(cloudSyncIntent());
	const [engineStatus, setEngineStatus] = useState<SyncEngineStatus | null>(null);
	const engineRef = useRef<CloudSyncEngine | null>(null);

	const refresh = useCallback(async () => {
		if (!isSyncConfigured) return;
		setGate(await getCloudSyncStatus());
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh, auth.status]);

	// Engine lifecycle: run only when configured + signed-in + opted-in. The gate's custody check is
	// what makes this fail closed on the web (no OS keychain → canEnableOnThisDevice is false).
	useEffect(() => {
		const canRun = isSyncConfigured && auth.status === 'signed-in' && enabled && gate?.canEnableOnThisDevice;
		if (canRun && !engineRef.current) {
			const engine = createSyncEngine({
				runtime,
				apiUrl: cloudConfig.syncApiUrl,
				onStatus: (s) => setEngineStatus(s),
			});
			engineRef.current = engine;
			setEngineStatus(engine.getStatus());
			engine.start();
		} else if (!canRun && engineRef.current) {
			engineRef.current.stop();
			engineRef.current = null;
			setEngineStatus(null);
		}
	}, [runtime, auth.status, enabled, gate?.canEnableOnThisDevice]);

	useEffect(() => () => engineRef.current?.stop(), []);

	const enable = useCallback(async () => {
		const ok = await auth.requireAuth();
		if (!ok) return;
		await setCloudSyncEnabled(true); // throws fail-closed if custody/model won't allow it
		setEnabled(true);
		await refresh();
	}, [auth, refresh]);

	const disable = useCallback(async () => {
		await setCloudSyncEnabled(false);
		setEnabled(false);
		await refresh();
	}, [refresh]);

	const syncNow = useCallback(async () => {
		await engineRef.current?.syncNow();
	}, []);

	const restore = useCallback(async () => {
		if (!engineRef.current) throw new Error('Cloud sync is not active on this device.');
		return engineRef.current.restoreFromCloud();
	}, []);

	const value = useMemo<CloudSyncContextValue>(
		() => ({ available: isSyncConfigured, gate, enabled, engineStatus, enable, disable, syncNow, restore, refresh }),
		[gate, enabled, engineStatus, enable, disable, syncNow, restore, refresh],
	);

	return <CloudSyncCtx.Provider value={value}>{children}</CloudSyncCtx.Provider>;
}

export function useCloudSync(): CloudSyncContextValue {
	const ctx = useContext(CloudSyncCtx);
	if (!ctx) throw new Error('useCloudSync must be used within <CloudSyncProvider>');
	return ctx;
}
