import type { RawStorageUsageEntry } from '@dndtools/core';

/**
 * RC-ENG-6.1 — collect a raw storage-usage snapshot for the Diagnostics view. Bytes only, never a
 * path or filename (`packages/core/src/diagnostics/storage-usage.ts` owns turning this into the
 * safe by-category totals). `navigator.storage.estimate()` gives the browser's overall usage/quota
 * for the origin; `localStorage` is measured directly since it is not part of that estimate on every
 * engine. Fails closed to an empty snapshot when either API is unavailable (jsdom in tests, or a
 * browser without the Storage API) rather than throwing.
 */
export async function collectStorageUsage(): Promise<RawStorageUsageEntry[]> {
	const entries: RawStorageUsageEntry[] = [];

	try {
		if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
			const estimate = await navigator.storage.estimate();
			if (typeof estimate.usage === 'number' && estimate.usage > 0) {
				entries.push({ category: 'vault', bytes: estimate.usage });
			}
		}
	} catch {
		// Fail closed: no estimate is better than a thrown diagnostics screen.
	}

	try {
		if (typeof window !== 'undefined' && window.localStorage) {
			let bytes = 0;
			for (let i = 0; i < window.localStorage.length; i++) {
				const key = window.localStorage.key(i);
				if (key === null) continue;
				bytes += key.length + (window.localStorage.getItem(key)?.length ?? 0);
			}
			if (bytes > 0) entries.push({ category: 'cache', bytes });
		}
	} catch {
		// Fail closed.
	}

	return entries;
}
