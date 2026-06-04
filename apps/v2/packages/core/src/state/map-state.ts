import type { SceneVisibility } from './scene-state';

export const MAP_STATE_SCHEMA_VERSION = 1 as const;

export type MapLayerCategory =
	| 'base'
	| 'terrain'
	| 'roads'
	| 'poi'
	| 'fog'
	| 'dm-annotations'
	| 'player-overlay';

export interface MapLayer {
	id: string;
	name: string;
	category: MapLayerCategory;
	visibility: SceneVisibility;
	enabled: boolean;
	opacity: number;
}

export interface MapRegion {
	id: string;
	name: string;
	bounds: { x: number; y: number; w: number; h: number };
}

export interface MapEntity {
	id: string;
	name: string;
	description: string;
	visibility: SceneVisibility;
	layers: MapLayer[];
	regions: MapRegion[];
	defaultRegionId: string | null;
	updatedAt: string;
	revision: number;
}

export interface MapState {
	maps: Record<string, MapEntity>;
	schemaVersion: typeof MAP_STATE_SCHEMA_VERSION;
}

export const EMPTY_MAP_STATE: MapState = Object.freeze({
	maps: {},
	schemaVersion: MAP_STATE_SCHEMA_VERSION,
});

/**
 * Local prototype maps give the Command Center an offline demo vault until the
 * MAP creation epics provide authoring commands. Tests can still use
 * EMPTY_MAP_STATE when they need a blank vault.
 */
export function createDemoMapState(now = '2026-06-03T00:00:00.000Z'): MapState {
	const maps: MapEntity[] = [
		{
			id: 'map-western-reaches',
			name: 'Western Reaches',
			description: 'Regional travel map for the current campaign arc.',
			visibility: 'player-visible',
			defaultRegionId: 'region-north-road',
			updatedAt: now,
			revision: 1,
			regions: [
				{
					id: 'region-north-road',
					name: 'North Road',
					bounds: { x: 0.12, y: 0.18, w: 0.32, h: 0.22 },
				},
				{ id: 'region-coast', name: 'Storm Coast', bounds: { x: 0.5, y: 0.2, w: 0.3, h: 0.28 } },
			],
			layers: [
				{
					id: 'layer-terrain',
					name: 'Terrain',
					category: 'terrain',
					visibility: 'player-visible',
					enabled: true,
					opacity: 1,
				},
				{
					id: 'layer-roads',
					name: 'Roads',
					category: 'roads',
					visibility: 'player-visible',
					enabled: true,
					opacity: 0.85,
				},
				{
					id: 'layer-hidden-camps',
					name: 'Hidden Camps',
					category: 'dm-annotations',
					visibility: 'dm-only',
					enabled: true,
					opacity: 1,
				},
			],
		},
		{
			id: 'map-ruined-keep',
			name: 'Ruined Keep',
			description: 'Encounter map with a player-safe ground floor region.',
			visibility: 'shared',
			defaultRegionId: 'region-ground-floor',
			updatedAt: now,
			revision: 1,
			regions: [
				{
					id: 'region-ground-floor',
					name: 'Ground Floor',
					bounds: { x: 0.08, y: 0.1, w: 0.46, h: 0.42 },
				},
				{
					id: 'region-secret-cellar',
					name: 'Secret Cellar',
					bounds: { x: 0.58, y: 0.52, w: 0.28, h: 0.26 },
				},
			],
			layers: [
				{
					id: 'layer-rooms',
					name: 'Rooms',
					category: 'base',
					visibility: 'player-visible',
					enabled: true,
					opacity: 1,
				},
				{
					id: 'layer-fog',
					name: 'Fog of War',
					category: 'fog',
					visibility: 'shared',
					enabled: true,
					opacity: 0.7,
				},
				{
					id: 'layer-secret-ambush',
					name: 'Secret Ambush',
					category: 'dm-annotations',
					visibility: 'dm-only',
					enabled: true,
					opacity: 1,
				},
			],
		},
	];

	return {
		schemaVersion: MAP_STATE_SCHEMA_VERSION,
		maps: Object.fromEntries(maps.map((map) => [map.id, map])),
	};
}
