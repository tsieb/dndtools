// Durable secret store abstraction for cloud auth tokens (SEC-004). On Electron
// this is the OS-encrypted safeStorage bridge (window.dndtoolsSecureStore). On
// the web there is no OS keychain, so the fallback persists NOTHING — tokens live
// only in memory for the session (the user re-authenticates on reload) rather
// than being written in plaintext. This mirrors @dndtools/core secret-custody's
// requiredSecretLocation(osAvailable): os-credential-store else device-local.

export interface DurableSecretStore {
  /** Whether durable, encrypted persistence is available. */
  available(): Promise<boolean>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<boolean>;
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

interface ElectronSecureStoreBridge {
  available(): Promise<boolean>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<boolean>;
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

function electronBridge(): ElectronSecureStoreBridge | null {
  return (globalThis as unknown as { dndtoolsSecureStore?: ElectronSecureStoreBridge })
    .dndtoolsSecureStore ?? null;
}

// Web fallback — no durable persistence (see file header).
const memoryOnly: DurableSecretStore = {
  available: async () => false,
  get: async () => null,
  set: async () => false,
  remove: async () => {},
  keys: async () => [],
};

export const durableSecretStore: DurableSecretStore = electronBridge() ?? memoryOnly;
