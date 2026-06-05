import type { SceneVisibility } from './scene-state';
import type { MapAsset } from './map-assets';

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
 * MAP-003 / MAP-004 — a single piece of painted/generated layer content.
 *
 * A feature is the atomic unit of map editing: a brush stroke, a filled cell, a placed marker, or a
 * generated room/wall/road segment. It is a PLAIN, SERIALIZABLE, DETERMINISTIC record (no functions,
 * no ambient values) so two devices replaying the same edit/generate operation produce byte-identical
 * content (Contract 2). Coordinates are normalized map space (0..1) like POIs, so a feature stays
 * anchored regardless of render zoom.
 *
 * `id` is stable for the feature's lifetime — an edit that "moves" a feature replaces the whole
 * content array (the command captures before+after), it does not mutate a feature in place. `kind`
 * tells the renderer how to draw the geometry; `points` carries the geometry in normalized space.
 */
export interface MapFeature {
	id: string;
	kind: 'stroke' | 'fill' | 'marker' | 'room' | 'wall' | 'road';
	/** Normalized (0..1) point list. A stroke/road/wall is a polyline; a fill/room is a rect's two
	 *  corners; a marker is a single point. */
	points: Array<{ x: number; y: number }>;
	/** Stable style token (e.g. `terrain:forest`, `ink:black`). Presentation metadata, not geometry. */
	style: string;
}

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
	/**
	 * MAP-003 / MAP-004 — the painted/generated CONTENT of the layer, in render order. Empty for a
	 * freshly created metadata-only layer; a paint edit (MAP-003) or a generation (MAP-004) fills it.
	 * Because content lives ON the layer, a generated layer is immediately editable by the same paint
	 * command, and a `dm-only` layer's content is filtered out of a non-DM read by the existing layer
	 * query (a non-DM never receives a dm-only layer at all, so its content never leaks).
	 */
	content: MapFeature[];
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

/**
 * MAP-001 — physical scale of a map: how many real-world units one normalized unit (the full map
 * width, 0..1) represents. Drives MAP-013 distance/travel-time math downstream. Validated fail-closed
 * (positive, finite) at creation.
 */
export interface MapScale {
	/** Real-world distance spanned by the full normalized width (0..1). */
	unitsPerMap: number;
	/** The unit label, e.g. `miles`, `feet`, `meters`. Free-form but required (non-empty). */
	unit: string;
}

/**
 * MAP-001 — projection metadata describing how normalized map space maps to a display surface. The
 * prototype renders flat images, so the supported projections are deliberately small; an unknown
 * projection is rejected fail-closed at creation rather than silently accepted.
 */
export type MapProjectionKind = 'flat' | 'equirectangular' | 'web-mercator';

export interface MapProjection {
	kind: MapProjectionKind;
	/** Optional rotation in degrees applied to the projected surface (0 when unspecified). */
	rotationDegrees: number;
}

/** The projection kinds the prototype understands. An import/create with any other kind fails closed. */
export const SUPPORTED_MAP_PROJECTIONS: readonly MapProjectionKind[] = Object.freeze([
	'flat',
	'equirectangular',
	'web-mercator',
]);

export interface MapEntity {
	id: string;
	name: string;
	description: string;
	visibility: SceneVisibility;
	/** MAP-001 — physical scale; null when the DM did not specify one. */
	scale: MapScale | null;
	/** MAP-001 — projection metadata; defaults to a flat projection. */
	projection: MapProjection;
	layers: MapLayer[];
	regions: MapRegion[];
	/**
	 * MAP-002 — content-addressed map asset ids referenced by this map (the background image/SVG and
	 * any imported scene assets). The asset records live in `MapState.assets`, keyed by content hash,
	 * so the SAME bytes referenced by two maps are a single deduplicated asset record.
	 */
	assetIds: string[];
	defaultRegionId: string | null;
	updatedAt: string;
	revision: number;
}

export interface MapState {
	maps: Record<string, MapEntity>;
	/**
	 * MAP-002 — content-addressed asset records, keyed by the asset id (its content hash). Identical
	 * bytes dedupe to one entry here regardless of how many maps reference them.
	 */
	assets: Record<string, MapAsset>;
	schemaVersion: typeof MAP_STATE_SCHEMA_VERSION;
}

export const DEFAULT_MAP_PROJECTION: MapProjection = Object.freeze({
	kind: 'flat',
	rotationDegrees: 0,
});

export const EMPTY_MAP_STATE: MapState = Object.freeze({
	maps: {},
	assets: {},
	schemaVersion: MAP_STATE_SCHEMA_VERSION,
});

/**
 * Normalize a partial/legacy {@link MapEntity} into a complete record, filling the MAP-001/MAP-002
 * fields with safe defaults so a pre-MAP-001 persisted map stays readable without a destructive
 * migration. Fail-closed: a missing projection is `flat`, a missing scale is `null`, missing assets
 * are an empty list.
 */
export function normalizeMapEntity(
	map: Omit<MapEntity, 'scale' | 'projection' | 'assetIds'> &
		Partial<Pick<MapEntity, 'scale' | 'projection' | 'assetIds'>>,
): MapEntity {
	return {
		id: map.id,
		name: map.name,
		description: map.description,
		visibility: map.visibility,
		scale: map.scale ?? null,
		projection: map.projection ?? { ...DEFAULT_MAP_PROJECTION },
		layers: map.layers,
		regions: map.regions,
		assetIds: [...(map.assetIds ?? [])],
		defaultRegionId: map.defaultRegionId,
		updatedAt: map.updatedAt,
		revision: map.revision,
	};
}

/** The values a freshly authored or migrated layer fills in for the MAP-005 metadata fields. */
export interface MapLayerDefaults {
	tags?: string[];
	query?: Record<string, string>;
	locked?: boolean;
	content?: MapFeature[];
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
	layer: Omit<
		MapLayer,
		'tags' | 'query' | 'locked' | 'content' | 'order' | 'revision' | 'updatedBy' | 'updatedAt'
	> &
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
		content: (layer.content ?? []).map((feature) => ({
			...feature,
			points: feature.points.map((point) => ({ ...point })),
		})),
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
		normalizeMapEntity({
			id: 'map-western-reaches',
			name: 'Western Reaches',
			description: 'Regional travel map for the current campaign arc.',
			visibility: 'player-visible',
			scale: { unitsPerMap: 120, unit: 'miles' },
			projection: { kind: 'flat', rotationDegrees: 0 },
			assetIds: [],
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
		}),
		normalizeMapEntity({
			id: 'map-ruined-keep',
			name: 'Ruined Keep',
			description: 'Encounter map with a player-safe ground floor region.',
			visibility: 'shared',
			scale: { unitsPerMap: 200, unit: 'feet' },
			projection: { kind: 'flat', rotationDegrees: 0 },
			assetIds: [],
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
		}),
	];

	return {
		schemaVersion: MAP_STATE_SCHEMA_VERSION,
		assets: {},
		maps: Object.fromEntries(maps.map((map) => [map.id, map])),
	};
}
