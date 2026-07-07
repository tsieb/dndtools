import { describe, it, expect, beforeEach, vi } from 'vitest';

// SecureTokenStore is the ICognitoStorage amazon-cognito-identity-js writes tokens
// into. It MUST hold tokens in memory synchronously, and only mirror them to durable
// storage when an OS-encrypted store is actually available (SEC-004: never persist
// secrets in plaintext). These tests pin that behaviour with a controllable fake
// durable store.

const durable = vi.hoisted(() => {
	const map = new Map<string, string>();
	const state = { available: false };
	return {
		map,
		state,
		store: {
			available: async () => state.available,
			get: async (k: string) => (map.has(k) ? map.get(k)! : null),
			set: async (k: string, v: string) => {
				map.set(k, v);
				return true;
			},
			remove: async (k: string) => {
				map.delete(k);
			},
			keys: async () => [...map.keys()],
		},
	};
});

vi.mock('./secureStore', () => ({ durableSecretStore: durable.store }));

async function freshStore() {
	vi.resetModules();
	return (await import('./tokenStore')).tokenStore;
}

beforeEach(() => {
	durable.map.clear();
	durable.state.available = false;
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
		// nothing persisted — a page reload would lose it (re-auth), never a plaintext leak
		expect(durable.map.size).toBe(0);
	});
});

describe('SecureTokenStore — durable store available (desktop)', () => {
	it('mirrors writes to the durable store under the cog: namespace', async () => {
		durable.state.available = true;
		const store = await freshStore();
		await store.hydrate();

		store.setItem('refreshToken', 'secret-refresh');
		expect(durable.map.get('cog:refreshToken')).toBe('secret-refresh');

		store.removeItem('refreshToken');
		expect(durable.map.has('cog:refreshToken')).toBe(false);
	});

	it('hydrate loads persisted namespaced tokens back into memory, ignoring foreign keys', async () => {
		durable.state.available = true;
		durable.map.set('cog:idToken', 'persisted-id');
		durable.map.set('cog:LastAuthUser', 'user@example.com');
		durable.map.set('unrelated:key', 'do-not-touch');

		const store = await freshStore();
		await store.hydrate();

		expect(store.getItem('idToken')).toBe('persisted-id');
		expect(store.getItem('LastAuthUser')).toBe('user@example.com');
		expect(store.getItem('key')).toBeNull(); // the non-cog: key was ignored
	});

	it('clear removes every namespaced token from the durable store', async () => {
		durable.state.available = true;
		const store = await freshStore();
		await store.hydrate();
		store.setItem('idToken', 'a');
		store.setItem('accessToken', 'b');

		store.clear();

		expect(store.getItem('idToken')).toBeNull();
		expect([...durable.map.keys()].filter((k) => k.startsWith('cog:'))).toEqual([]);
	});
});
