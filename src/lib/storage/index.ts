import type { StorageAdapter } from '$lib/types/storage.js';
import { IndexedDBAdapter } from './indexeddb-adapter.js';

let adapter: StorageAdapter | null = null;

/** Get the singleton storage adapter instance */
export function getStorage(): StorageAdapter {
	if (!adapter) {
		adapter = new IndexedDBAdapter();
	}
	return adapter;
}

/** Replace the storage adapter (useful for testing) */
export function setStorage(newAdapter: StorageAdapter): void {
	adapter = newAdapter;
}
