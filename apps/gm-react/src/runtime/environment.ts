import { createMapImportAdapterRegistry, type CoreEnvironment } from '@dndtools/core';

function browserIdGenerator(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function browserClock(): string {
	return new Date().toISOString();
}

/**
 * A STABLE, per-device source id. Every durable `SyncOperation` carries `sourceId` as its device of
 * origin (op provenance). Two devices must never share a source id — otherwise, once P2P replication is
 * live, ops from different machines become indistinguishable. The prototype previously hardcoded
 * `'local-vault'` on every device; we now mint a random id once and persist it device-locally so op
 * provenance is unique per install while staying deterministic across reloads on the same device.
 */
const DEVICE_SOURCE_ID_KEY = 'dndtools:react:device-source-id';

export function deviceSourceId(): string {
	try {
		if (typeof window !== 'undefined' && window.localStorage) {
			const existing = window.localStorage.getItem(DEVICE_SOURCE_ID_KEY);
			if (existing) return existing;
			const minted = `src-${browserIdGenerator()}`;
			window.localStorage.setItem(DEVICE_SOURCE_ID_KEY, minted);
			return minted;
		}
	} catch {
		// localStorage unavailable (private mode / SSR) — fall through to a volatile id.
	}
	return `src-${browserIdGenerator()}`;
}

/**
 * MAP-002 / MAP-020 — the DECLARED external map-format import adapters for the prototype. One adapter
 * (`vtt-scene`) is declared so the import flow can demonstrate a working adapter with a capability
 * summary and unsupported-element diagnostics. Any OTHER external format is undeclared, so its import
 * is rejected fail-closed. Mirrors the production runtime's adapter registry.
 */
export const MAP_IMPORT_ADAPTERS = createMapImportAdapterRegistry([
	{
		formatId: 'vtt-scene',
		displayName: 'Virtual Tabletop Scene',
		version: '1.0.0',
		elementSupport: {
			dimensions: 'importable',
			'background-image': 'importable',
			grid: 'importable',
			walls: 'lossy',
			notes: 'lossy',
			lights: 'unsupported',
			tokens: 'unsupported',
		},
	},
]);

export function defaultEnvironment(): CoreEnvironment {
	return {
		vaultId: 'local-default',
		sourceId: deviceSourceId(),
		ids: browserIdGenerator,
		clock: browserClock,
		mapImportAdapters: MAP_IMPORT_ADAPTERS,
	};
}
