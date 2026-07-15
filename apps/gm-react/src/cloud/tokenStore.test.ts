import { describe, it, expect, beforeEach, vi } from 'vitest';

// SecureTokenStore is the ICognitoStorage amazon-cognito-identity-js writes tokens
// into. It MUST hold tokens in memory synchronously, and only mirror them to durable
// storage when an OS-encrypted store is actually available (SEC-004: never persist
// secrets in plaintext). These tests pin that behaviour with a controllable fake
// durable store.

const durable = vi.hoisted(() => {
	const map = new Map<string, string>();
	const state: {
		available: boolean;
		bridgePresent: boolean;
		getOverride: ((key: string) => Promise<string | null>) | null;
		setOverride: ((key: string, value: string) => Promise<boolean>) | null;
		removeOverride: ((key: string) => Promise<boolean>) | null;
		keysOverride: (() => Promise<string[]>) | null;
	} = {
		available: false,
		bridgePresent: false,
		getOverride: null,
		setOverride: null,
		removeOverride: null,
		keysOverride: null,
	};
	return {
		map,
		state,
		store: {
			available: async () => state.available,
			get: async (k: string) =>
				state.getOverride ? state.getOverride(k) : map.has(k) ? map.get(k)! : null,
			set: async (k: string, v: string) => {
				if (state.setOverride) return state.setOverride(k, v);
				map.set(k, v);
				return true;
			},
			remove: async (k: string) => {
				if (state.removeOverride) return state.removeOverride(k);
				map.delete(k);
				return true;
			},
			keys: async () => (state.keysOverride ? state.keysOverride() : [...map.keys()]),
		},
	};
});

vi.mock('./secureStore', () => ({
	durableSecretStore: durable.store,
	get hasDurableSecretStoreBridge() {
		return durable.state.bridgePresent;
	},
}));

async function freshStore() {
	vi.resetModules();
	return (await import('./tokenStore')).tokenStore;
}

beforeEach(() => {
	durable.map.clear();
	durable.state.available = false;
	durable.state.bridgePresent = false;
	durable.state.getOverride = null;
	durable.state.setOverride = null;
	durable.state.removeOverride = null;
	durable.state.keysOverride = null;
});

describe('SecureTokenStore — memory semantics', () => {
	it('reads back what it wrote synchronously', async () => {
		const store = await freshStore();
		store.setItem('idToken', 'abc');
		expect(store.getItem('idToken')).toBe('abc');
	});

	it('returns null for an unknown key (not undefined — cognito checks === null)', async () => {
		const store = await freshStore();
		expect(store.getItem('missing')).toBeNull();
	});

	it('removeItem drops the key from memory', async () => {
		const store = await freshStore();
		store.setItem('k', 'v');
		store.removeItem('k');
		expect(store.getItem('k')).toBeNull();
	});
});

describe('SecureTokenStore — no durable store (web: memory only, SEC-004)', () => {
	it('does NOT mirror tokens to durable storage when none is available', async () => {
		const store = await freshStore();
		await store.hydrate(); // durable.available === false
		store.setItem('refreshToken', 'secret-refresh');
		await store.flush();
		// nothing persisted — a page reload would lose it (re-auth), never a plaintext leak
		expect(durable.map.size).toBe(0);
	});
});

describe('SecureTokenStore — durable store available (desktop)', () => {
	it('mirrors writes to the durable store under the cog: namespace', async () => {
		durable.state.available = true;
		durable.state.bridgePresent = true;
		const store = await freshStore();
		await store.hydrate();

		store.setItem('refreshToken', 'secret-refresh');
		await store.flush();
		expect(durable.map.get('cog:refreshToken')).toBe('secret-refresh');

		store.removeItem('refreshToken');
		await store.flush();
		expect(durable.map.has('cog:refreshToken')).toBe(false);
	});

	it('hydrate loads persisted namespaced tokens back into memory, ignoring foreign keys', async () => {
		durable.state.available = true;
		durable.state.bridgePresent = true;
		durable.map.set('cog:idToken', 'persisted-id');
		durable.map.set('cog:LastAuthUser', 'user@example.com');
		durable.map.set('unrelated:key', 'do-not-touch');

		const store = await freshStore();
		await store.hydrate();

		expect(store.getItem('idToken')).toBe('persisted-id');
		expect(store.getItem('LastAuthUser')).toBe('user@example.com');
		expect(store.getItem('key')).toBeNull(); // the non-cog: key was ignored
	});

	it('hydrate rejects corrupt credentials without exposing a partial session', async () => {
		durable.state.available = true;
		durable.state.bridgePresent = true;
		durable.state.keysOverride = async () => ['cog:idToken', 'cog:refreshToken'];
		durable.state.getOverride = async (key) => {
			if (key === 'cog:idToken') return 'partially-readable';
			throw new Error('ciphertext cannot be decrypted');
		};
		const store = await freshStore();

		await expect(store.hydrate()).rejects.toThrow(/ciphertext cannot be decrypted/i);
		expect(store.getItem('idToken')).toBeNull();
		expect(store.getItem('refreshToken')).toBeNull();
	});

	it('fails sign-out cleanup closed when a desktop store is temporarily unavailable', async () => {
		durable.state.bridgePresent = true;
		const store = await freshStore();
		await store.hydrate();
		store.setItem('refreshToken', 'memory-only');

		store.clear();
		await expect(store.flush()).rejects.toThrow(/durable Cognito token operation.*clear/i);
		expect(store.getItem('refreshToken')).toBeNull();
	});

	it('clear removes every namespaced token from the durable store', async () => {
		durable.state.available = true;
		const store = await freshStore();
		await store.hydrate();
		store.setItem('idToken', 'a');
		store.setItem('accessToken', 'b');
		await store.flush();

		store.clear();
		await store.flush();

		expect(store.getItem('idToken')).toBeNull();
		expect([...durable.map.keys()].filter((k) => k.startsWith('cog:'))).toEqual([]);
	});

	it('serializes a delayed write before removal and keeps flush pending through both', async () => {
		durable.state.available = true;
		const events: string[] = [];
		let releaseSet!: () => void;
		const setGate = new Promise<void>((resolve) => {
			releaseSet = resolve;
		});
		durable.state.setOverride = async (key, value) => {
			events.push('set:start');
			await setGate;
			durable.map.set(key, value);
			events.push('set:end');
			return true;
		};
		durable.state.removeOverride = async (key) => {
			events.push('remove:start');
			durable.map.delete(key);
			events.push('remove:end');
			return true;
		};
		const store = await freshStore();
		await store.hydrate();

		store.setItem('refreshToken', 'secret-refresh');
		store.removeItem('refreshToken');
		let flushed = false;
		const flush = store.flush().then(() => {
			flushed = true;
		});
		await vi.waitFor(() => expect(events).toEqual(['set:start']));
		expect(flushed).toBe(false);

		releaseSet();
		await flush;
		expect(events).toEqual(['set:start', 'set:end', 'remove:start', 'remove:end']);
		expect(durable.map.has('cog:refreshToken')).toBe(false);
	});

	it('clear sweeps namespaced durable keys that are not present in memory', async () => {
		durable.state.available = true;
		const store = await freshStore();
		await store.hydrate();
		durable.map.set('cog:orphanedRefreshToken', 'stale-secret');
		durable.map.set('vaultkey:keep', 'unrelated-secret');

		store.clear();
		await store.flush();

		expect(durable.map.has('cog:orphanedRefreshToken')).toBe(false);
		expect(durable.map.get('vaultkey:keep')).toBe('unrelated-secret');
	});

	it('flush rejects when durable removal cannot be proven', async () => {
		durable.state.available = true;
		durable.map.set('cog:refreshToken', 'persisted');
		durable.state.removeOverride = async () => false;
		const store = await freshStore();
		await store.hydrate();

		store.removeItem('refreshToken');

		await expect(store.flush()).rejects.toThrow(/durable Cognito token operation.*remove/i);
		expect(durable.map.get('cog:refreshToken')).toBe('persisted');
	});

	it('a successful final clear supersedes a transient earlier removal failure', async () => {
		durable.state.available = true;
		durable.map.set('cog:refreshToken', 'persisted');
		let attempts = 0;
		durable.state.removeOverride = async (key) => {
			attempts += 1;
			if (attempts === 1) return false;
			durable.map.delete(key);
			return true;
		};
		const store = await freshStore();
		await store.hydrate();

		store.removeItem('refreshToken');
		store.clear();

		await expect(store.flush()).resolves.toBeUndefined();
		expect(attempts).toBe(2);
		expect(durable.map.has('cog:refreshToken')).toBe(false);
	});
});
