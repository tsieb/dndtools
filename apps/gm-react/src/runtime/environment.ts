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
		sourceId: 'local-vault',
		ids: browserIdGenerator,
		clock: browserClock,
		mapImportAdapters: MAP_IMPORT_ADAPTERS,
	};
}
