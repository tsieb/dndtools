import { describe, it, expect, afterEach, vi } from 'vitest';

// durableSecretStore resolves to the Electron OS-encrypted bridge when present, and
// otherwise to a memory-only fallback that persists NOTHING (SEC-004: no plaintext
// secrets on disk on the web). The choice is made at import time from a global the
// Electron preload installs, so each test re-imports with the global set/unset.

type G = Record<string, unknown>;
const KEY = 'dndtoolsSecureStore';

async function importFresh() {
	vi.resetModules();
	return import('./secureStore');
}

afterEach(() => {
	delete (globalThis as G)[KEY];
});

describe('durableSecretStore fallback (web — no Electron bridge)', () => {
	it('reports unavailable and persists nothing', async () => {
		delete (globalThis as G)[KEY];
		const { durableSecretStore } = await importFresh();

		expect(await durableSecretStore.available()).toBe(false);
		expect(await durableSecretStore.set('k', 'v')).toBe(false); // write is refused
		expect(await durableSecretStore.get('k')).toBeNull(); // and nothing comes back
		expect(await durableSecretStore.keys()).toEqual([]);
		expect(await durableSecretStore.remove('k')).toBe(false);
	});
});

describe('durableSecretStore (Electron — OS-encrypted bridge present)', () => {
	it('delegates to the injected secure-store bridge', async () => {
		const bridge = {
			available: vi.fn(async () => true),
			get: vi.fn(async () => 'stored-value'),
			set: vi.fn(async () => true),
			remove: vi.fn(async () => true),
			keys: vi.fn(async () => ['cog:idToken']),
		};
		(globalThis as G)[KEY] = bridge;

		const { durableSecretStore } = await importFresh();

		expect(await durableSecretStore.available()).toBe(true);
		expect(await durableSecretStore.get('cog:idToken')).toBe('stored-value');
		expect(await durableSecretStore.set('cog:idToken', 'x')).toBe(true);
		expect(await durableSecretStore.remove('cog:idToken')).toBe(true);
		expect(await durableSecretStore.keys()).toEqual(['cog:idToken']);
		expect(bridge.set).toHaveBeenCalledWith('cog:idToken', 'x');
	});
});

describe('Android Keystore adapter', () => {
	it('maps the shared credential interface onto the custom Capacitor plugin', async () => {
		const plugin = {
			get: vi.fn(async () => ({ value: 'ciphertext-backed-value' })),
			set: vi.fn(async () => ({ ok: true })),
			delete: vi.fn(async () => ({ ok: true })),
			clear: vi.fn(async () => ({ ok: true })),
			keys: vi.fn(async () => ({ keys: ['cog:idToken'] })),
		};
		const { createAndroidDurableSecretStore } = await importFresh();
		const store = createAndroidDurableSecretStore(plugin);

		await expect(store.available()).resolves.toBe(true);
		await expect(store.get('cog:idToken')).resolves.toBe('ciphertext-backed-value');
		await expect(store.set('cog:idToken', 'token')).resolves.toBe(true);
		await expect(store.remove('cog:idToken')).resolves.toBe(true);
		await expect(store.keys()).resolves.toEqual(['cog:idToken']);
		expect(plugin.set).toHaveBeenCalledWith({ key: 'cog:idToken', value: 'token' });
		expect(plugin.delete).toHaveBeenCalledWith({ key: 'cog:idToken' });
	});

	it('reports unavailable when the native plugin cannot reach the Keystore', async () => {
		const { createAndroidDurableSecretStore } = await importFresh();
		const store = createAndroidDurableSecretStore({
			get: vi.fn(),
			set: vi.fn(),
			delete: vi.fn(),
			clear: vi.fn(),
			keys: vi.fn(async () => {
				throw new Error('keystore unavailable');
			}),
		});
		await expect(store.available()).resolves.toBe(false);
	});
});
