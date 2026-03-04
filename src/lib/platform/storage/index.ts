import type { StorageAdapter } from '$lib/types/storage.js';
import { Capacitor } from '@capacitor/core';
import { SyncAwareStorageAdapter } from '$lib/platform/storage/sync-adapter.js';
import { syncState } from '$lib/state/sync.svelte.js';

let adapter: StorageAdapter | null = null;
let initPromise: Promise<void> | null = null;

export type StorageRuntime = 'electron' | 'capacitor' | 'indexeddb';

export function detectStorageRuntime(): StorageRuntime {
	if (typeof window !== 'undefined' && window.dndtoolsDesktop) {
		return 'electron';
	}
	return Capacitor.isNativePlatform() ? 'capacitor' : 'indexeddb';
}

async function createAdapter(): Promise<StorageAdapter> {
	const runtime = detectStorageRuntime();
	if (runtime === 'electron') {
		const module = await import('./electron-adapter.js');
		return new module.ElectronStorageAdapter();
	}
	if (runtime === 'capacitor') {
		const module = await import('./capacitor-adapter.js');
		return new module.CapacitorStorageAdapter();
	}
	const module = await import('./indexeddb-adapter.js');
	return new module.IndexedDbStorageAdapter();
}

/** Initialize storage adapter once at app startup. */
export async function initStorage(): Promise<void> {
	if (adapter) {
		return;
	}

	if (!initPromise) {
		initPromise = (async () => {
			const baseAdapter = await createAdapter();
			await baseAdapter.initialize();
			await syncState.initialize(baseAdapter);
			adapter = new SyncAwareStorageAdapter(baseAdapter, syncState);
		})().catch((error) => {
			initPromise = null;
			throw error;
		});
	}

	await initPromise;
}

/** Get the singleton storage adapter instance. */
export function getStorage(): StorageAdapter {
	if (!adapter) {
		throw new Error('Storage not initialized. Call initStorage() first.');
	}
	return adapter;
}

/** Replace the storage adapter (mainly for tests). */
export function setStorage(newAdapter: StorageAdapter): void {
	adapter = newAdapter;
	initPromise = null;
}
