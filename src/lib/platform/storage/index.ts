import type { StorageAdapter } from '$lib/types/storage.js';

let adapter: StorageAdapter | null = null;
let initPromise: Promise<void> | null = null;

async function createAdapter(): Promise<StorageAdapter> {
	const { ElectronStorageAdapter } = await import('./electron-adapter.js');
	return new ElectronStorageAdapter();
}

/** Initialize storage adapter once at app startup. */
export async function initStorage(): Promise<void> {
	if (adapter) {
		return;
	}

	if (!initPromise) {
		initPromise = (async () => {
			adapter = await createAdapter();
			await adapter.initialize();
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
