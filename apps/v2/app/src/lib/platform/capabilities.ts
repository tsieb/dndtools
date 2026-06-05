/**
 * Platform capability probes (Contract 1: Platform Services own access to browser APIs).
 *
 * These functions read browser/native primitives (`indexedDB`, `navigator`) so that GUI
 * components never touch those primitives directly (PLAT-006). Feature components branch on
 * the returned capability facts, not on the raw globals. This module is an explicitly
 * owned, scoped platform-access surface (PLAT-012) and is allowlisted in the boundary
 * exception manifest.
 */

/** Whether durable browser storage (IndexedDB) is reachable on this profile. */
export function storageAvailable(): boolean {
	return typeof indexedDB !== 'undefined';
}

/** Whether the device currently reports an online network connection. */
export function isOnline(): boolean {
	return typeof navigator === 'undefined' ? true : navigator.onLine;
}
