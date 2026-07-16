// Durable secret store abstraction for cloud auth tokens (SEC-004). Electron uses
// safeStorage, Android uses an Android-Keystore-backed custom Capacitor plugin, and
// ordinary web builds persist nothing. This mirrors @dndtools/core secret custody:
// OS credential store when available, otherwise memory/session only.

import {
	DndtoolsSecureStore,
	getElectronSecureStoreBridge,
	getPlatformCapabilities,
	type NativeSecureStorePlugin,
} from '../platform/capabilities';

export interface DurableSecretStore {
	/** Whether durable, encrypted persistence is available. */
	available(): Promise<boolean>;
	get(key: string): Promise<string | null>;
	set(key: string, value: string): Promise<boolean>;
	/** True only when the durable copy was removed successfully. */
	remove(key: string): Promise<boolean>;
	keys(): Promise<string[]>;
}

interface ElectronSecureStoreBridge {
	available(): Promise<boolean>;
	get(key: string): Promise<string | null>;
	set(key: string, value: string): Promise<boolean>;
	remove(key: string): Promise<boolean>;
	keys(): Promise<string[]>;
}

/** Web fallback — no durable persistence (see file header). */
export const memoryOnlySecretStore: DurableSecretStore = {
	available: async () => false,
	get: async () => null,
	set: async () => false,
	remove: async () => false,
	keys: async () => [],
};

/** Adapt the typed native plugin without leaking Capacitor calls into auth/features. */
export function createAndroidDurableSecretStore(
	plugin: NativeSecureStorePlugin,
): DurableSecretStore {
	return {
		available: async () => {
			try {
				await plugin.keys();
				return true;
			} catch {
				return false;
			}
		},
		get: async (key) => (await plugin.get({ key })).value,
		set: async (key, value) => (await plugin.set({ key, value })).ok,
		remove: async (key) => (await plugin.delete({ key })).ok,
		keys: async () => (await plugin.keys()).keys,
	};
}

const capabilities = getPlatformCapabilities();
const bridge = getElectronSecureStoreBridge<ElectronSecureStoreBridge>();
const androidStore = createAndroidDurableSecretStore(DndtoolsSecureStore);

/** Distinguishes session-only web storage from a native encrypted-store integration. */
export const hasDurableSecretStoreBridge = capabilities.secureStorage.available;
export const durableSecretStore: DurableSecretStore =
	capabilities.runtimeKind === 'android' && capabilities.nativeBridgeAvailable
		? androidStore
		: (bridge ?? memoryOnlySecretStore);
