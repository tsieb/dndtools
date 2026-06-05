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

/**
 * MAP-005 / MAP-006 — a named, ordered map layer with INDEPENDENT visibility, DM-display, and
 * opacity axes plus tag/query metadata.
 *
 * The three presentation axes are deliberately separate fields so toggling one never disturbs the
 * others (MAP-006):
 *
 *   - `visibility` — the PLAYER-FACING visibility level (`dm-only` / `player-visible` / `shared`).
 *     This is the single field that decides what a player/observer may read; it is filtered through
 *     the same precedence model as every other entity (Contract 3, Axis 1). A `dm-only` layer is
 *     NEVER read into a player/observer context.
 *   - `enabled` — the DM's own AUTHORING-display toggle: whether the DM currently shows the layer on
 *     their canvas. It is purely a DM-side presentation flag and has no effect on player visibility.
 *   - `opacity` — render opacity (0..1), independent of both visibility and the DM-display toggle.
 *
 * `tags` and `query` are the searchable metadata used by the layer query (MAP-007); they describe
 * the layer (e.g. `region:northern-coast`, `type:poi`) and are never leaked to a non-DM context for
 * a hidden layer. `locked` rejects mutation fail-closed (MAP-005). `order` is the explicit render /
 * list order; lower renders first. `revision`/`updatedBy`/`updatedAt` make each layer mutation a
 * conflict-shaped, auditable durable change.
 */
export interface MapLayer {
	id: string;
	name: string;
	category: MapLayerCategory;
	/** PLAYER-FACING visibility. The only axis a non-DM read is filtered against. */
	visibility: SceneVisibility;
	/** DM authoring-display toggle. Independent of `visibility` and `opacity` (MAP-006). */
	enabled: boolean;
	/** Render opacity 0..1. Independent of `visibility` and `enabled` (MAP-006). */
	opacity: number;
	/** Searchable tags (e.g. `region:northern-coast`). Query metadata, never player-leaked. */
	tags: string[];
	/** Structured query metadata keyed by facet (e.g. `{ region: 'northern-coast' }`). */
	query: Record<string, string>;
	/** When true, the layer rejects mutation fail-closed until explicitly unlocked (MAP-005). */
	locked: boolean;
	/** Explicit render/list order; lower renders first. Reorder rewrites this (MAP-005). */
	order: number;
	/** Monotonic per-layer revision for conflict detection and auditability. */
	revision: number;
	/** Actor id of the last mutation. */
	updatedBy: string | null;
	/** ISO timestamp of the last mutation. */
	updatedAt: string | null;
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

/** The values a freshly authored or migrated layer fills in for the MAP-005 metadata fields. */
export interface MapLayerDefaults {
	tags?: string[];
	query?: Record<string, string>;
	locked?: boolean;
	order?: number;
	revision?: number;
	updatedBy?: string | null;
	updatedAt?: string | null;
}

/**
 * Normalize a partial/legacy layer record into a complete {@link MapLayer}, filling MAP-005 metadata
 * with safe defaults. Used by the demo seed and by any path that reads a pre-MAP-005 layer shape so
 * the metadata fields are always present (fail-closed: a missing `locked` is `false`, missing tags
 * are empty). This keeps older persisted maps readable without a destructive migration.
 */
export function normalizeMapLayer(
	layer: Omit<MapLayer, 'tags' | 'query' | 'locked' | 'order' | 'revision' | 'updatedBy' | 'updatedAt'> &
		MapLayerDefaults,
	index = 0,
): MapLayer {
	return {
		id: layer.id,
		name: layer.name,
		category: layer.category,
		visibility: layer.visibility,
		enabled: layer.enabled,
		opacity: layer.opacity,
		tags: [...(layer.tags ?? [])],
		query: { ...(layer.query ?? {}) },
		locked: layer.locked ?? false,
		order: layer.order ?? index,
		revision: layer.revision ?? 1,
		updatedBy: layer.updatedBy ?? null,
		updatedAt: layer.updatedAt ?? null,
	};
}

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
				normalizeMapLayer(
					{
						id: 'layer-terrain',
						name: 'Terrain',
						category: 'terrain',
						visibility: 'player-visible',
						enabled: true,
						opacity: 1,
						tags: ['region:north-road', 'type:terrain'],
						query: { region: 'north-road', type: 'terrain' },
					},
					0,
				),
				normalizeMapLayer(
					{
						id: 'layer-roads',
						name: 'Roads',
						category: 'roads',
						visibility: 'player-visible',
						enabled: true,
						opacity: 0.85,
						tags: ['region:north-road', 'type:roads'],
						query: { region: 'north-road', type: 'roads' },
					},
					1,
				),
				normalizeMapLayer(
					{
						id: 'layer-hidden-camps',
						name: 'Hidden Camps',
						category: 'dm-annotations',
						visibility: 'dm-only',
						enabled: true,
						opacity: 1,
						tags: ['region:coast', 'type:poi'],
						query: { region: 'coast', type: 'poi' },
					},
					2,
				),
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
				normalizeMapLayer(
					{
						id: 'layer-rooms',
						name: 'Rooms',
						category: 'base',
						visibility: 'player-visible',
						enabled: true,
						opacity: 1,
						tags: ['type:base'],
						query: { type: 'base' },
					},
					0,
				),
				normalizeMapLayer(
					{
						id: 'layer-fog',
						name: 'Fog of War',
						category: 'fog',
						visibility: 'shared',
						enabled: true,
						opacity: 0.7,
						tags: ['type:fog'],
						query: { type: 'fog' },
					},
					1,
				),
				normalizeMapLayer(
					{
						id: 'layer-secret-ambush',
						name: 'Secret Ambush',
						category: 'dm-annotations',
						visibility: 'dm-only',
						enabled: true,
						opacity: 1,
						tags: ['type:poi'],
						query: { type: 'poi' },
					},
					2,
				),
			],
		},
	];

	return {
		schemaVersion: MAP_STATE_SCHEMA_VERSION,
		maps: Object.fromEntries(maps.map((map) => [map.id, map])),
	};
}
