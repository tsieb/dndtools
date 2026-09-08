import { useSyncExternalStore } from 'react';
import type { SharedImportPayload } from './capabilities';

/**
 * RC-PLT-2.2 — the queue between the Android share target and the renderer.
 *
 * A share arrives from outside the app, at any moment, on a screen the DM did not choose. It is
 * therefore never applied on arrival: it is parked here, one at a time, and the platform layer
 * offers it for review. Nothing enters the vault until the DM says so.
 */

export interface PendingSharedImport {
	/** Distinguishes two shares of the same file so a re-share re-opens the review. */
	id: number;
	share: SharedImportPayload;
}

let pending: PendingSharedImport | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function announce(): void {
	for (const listener of [...listeners]) listener();
}

/** Park a shared file for review, replacing any share the DM has not answered yet. */
export function offerSharedImport(share: SharedImportPayload): PendingSharedImport {
	pending = { id: nextId++, share };
	announce();
	return pending;
}

export function clearSharedImport(): void {
	if (pending === null) return;
	pending = null;
	announce();
}

export function getSharedImport(): PendingSharedImport | null {
	return pending;
}

/** Notified whenever the pending share changes. Returns the unsubscribe. */
export function subscribeSharedImport(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/** The share awaiting review, or null. Re-renders when a new share arrives. */
export function useSharedImport(): PendingSharedImport | null {
	return useSyncExternalStore(subscribeSharedImport, getSharedImport, getSharedImport);
}

/** Test-only reset for the module-scoped queue. */
export function resetSharedImportForTest(): void {
	pending = null;
	nextId = 1;
	listeners.clear();
}

// DEV-only: Android's share target cannot be driven from a desktop browser, so the e2e suite
// delivers a share through this hook. `import.meta.env` is injected by Vite; production builds
// never define it, so the hook cannot exist in a shipped app.
if (import.meta.env?.DEV) {
	(globalThis as typeof globalThis & { __dndtoolsOfferShare__?: unknown }).__dndtoolsOfferShare__ =
		offerSharedImport;
}

/**
 * A shared file is untrusted text. Anything that is not JSON is reported as such rather than
 * guessed at, so the review can name the problem instead of showing an empty install plan.
 */
export function parseSharedJson(text: string): { ok: true; value: unknown } | { ok: false } {
	try {
		return { ok: true, value: JSON.parse(text) as unknown };
	} catch {
		return { ok: false };
	}
}
