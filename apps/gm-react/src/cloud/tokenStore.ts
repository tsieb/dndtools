// A synchronous ICognitoStorage (what amazon-cognito-identity-js requires) backed
// by an in-memory Map, mirrored asynchronously to the OS-encrypted durable store.
// amazon-cognito-identity-js persists tokens (id/access/refresh, LastAuthUser,
// clockDrift) here. Writes update memory synchronously and fire-and-forget to the
// durable store; hydrate() loads the durable copy back into memory at startup so
// a returning desktop user is auto-recognised from their (encrypted) refresh token.
import type { ICognitoStorage } from 'amazon-cognito-identity-js';
import { durableSecretStore } from './secureStore';

const NS = 'cog:'; // namespace persisted keys so we only touch our own

class SecureTokenStore implements ICognitoStorage {
  private mem = new Map<string, string>();
  private durable = false;

  setItem(key: string, value: string): void {
    this.mem.set(key, value);
    if (this.durable) void durableSecretStore.set(NS + key, value);
  }

  getItem(key: string): string | null {
    return this.mem.has(key) ? this.mem.get(key)! : null;
  }

  removeItem(key: string): void {
    this.mem.delete(key);
    if (this.durable) void durableSecretStore.remove(NS + key);
  }

  clear(): void {
    if (this.durable) for (const k of this.mem.keys()) void durableSecretStore.remove(NS + k);
    this.mem.clear();
  }

  /** Load any persisted tokens into memory. Call once before reading auth state. */
  async hydrate(): Promise<void> {
    this.durable = await durableSecretStore.available();
    if (!this.durable) return;
    for (const nsKey of await durableSecretStore.keys()) {
      if (!nsKey.startsWith(NS)) continue;
      const value = await durableSecretStore.get(nsKey);
      if (value !== null) this.mem.set(nsKey.slice(NS.length), value);
    }
  }
}

export const tokenStore = new SecureTokenStore();
