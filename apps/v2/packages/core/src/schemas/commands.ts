import { z } from 'zod';
import {
	playerViewAssignmentSchema,
	sceneBackgroundSchema,
	sceneVisibilitySchema,
	sectionLayoutRegionSchema,
	widgetBindingSchema,
	widgetDockSchema,
} from './scene';
import { widgetPackageDefinitionSchema } from './widget-package';

const idSchema = z.string().min(1);

export const createSceneInputSchema = z
	.object({
		name: z.string().min(1, 'Scene name is required'),
		description: z.string().default(''),
		tags: z.array(z.string().min(1)).default([]),
		visibility: sceneVisibilitySchema.default('dm-only'),
		visualSettings: z
			.object({
				background: sceneBackgroundSchema.default('paper'),
				accentColor: z.string().min(1).optional(),
			})
			.strict()
			.default({ background: 'paper' as const }),
		sharingTargets: z.array(idSchema).default([]),
		playerViewAssignments: z.array(playerViewAssignmentSchema).default([]),
		asTemplate: z.boolean().default(false),
	})
	.strict();

export const updateSceneMetadataInputSchema = z
	.object({
		sceneId: idSchema,
		name: z.string().min(1).optional(),
		description: z.string().optional(),
		tags: z.array(z.string().min(1)).optional(),
		visibility: sceneVisibilitySchema.optional(),
		visualSettings: z
			.object({
				background: sceneBackgroundSchema.optional(),
				accentColor: z.string().min(1).optional(),
			})
			.strict()
			.optional(),
		sharingTargets: z.array(idSchema).optional(),
		playerViewAssignments: z.array(playerViewAssignmentSchema).optional(),
	})
	.strict();

export const setSceneSectionsInputSchema = z
	.object({
		sceneId: idSchema,
		sections: z.array(sectionLayoutRegionSchema),
	})
	.strict();

export const saveSceneTemplateInputSchema = z
	.object({
		sourceSceneId: idSchema,
		templateName: z.string().min(1),
	})
	.strict();

export const instantiateSceneTemplateInputSchema = z
	.object({
		templateSceneId: idSchema,
		newSceneName: z.string().min(1),
	})
	.strict();

export const addWidgetInputSchema = z
	.object({
		sceneId: idSchema,
		widget: z
			.object({
				type: z.string().min(1),
				version: z.string().min(1),
				layout: z
					.object({
						x: z.number().finite(),
						y: z.number().finite(),
						w: z.number().finite().positive(),
						h: z.number().finite().positive(),
					})
					.strict(),
				configuration: z.record(z.string(), z.unknown()).default({}),
				localState: z.record(z.string(), z.unknown()).default({}),
				binding: z.union([z.literal(null), widgetBindingSchema]).default(null),
				sectionId: idSchema.optional(),
			})
			.strict(),
	})
	.strict();

export const moveWidgetInputSchema = z
	.object({
		sceneId: idSchema,
		widgetInstanceId: idSchema,
		x: z.number().finite(),
		y: z.number().finite(),
	})
	.strict();

export const resizeWidgetInputSchema = z
	.object({
		sceneId: idSchema,
		widgetInstanceId: idSchema,
		w: z.number().finite().positive(),
		h: z.number().finite().positive(),
	})
	.strict();

export const layerWidgetInputSchema = z
	.object({
		sceneId: idSchema,
		widgetInstanceId: idSchema,
		z: z.number().int(),
	})
	.strict();

export const groupWidgetsInputSchema = z
	.object({
		sceneId: idSchema,
		widgetInstanceIds: z.array(idSchema).min(2),
	})
	.strict();

export const dockWidgetInputSchema = z
	.object({
		sceneId: idSchema,
		widgetInstanceId: idSchema,
		dock: widgetDockSchema,
	})
	.strict();

export const pinWidgetInputSchema = z
	.object({
		sceneId: idSchema,
		widgetInstanceId: idSchema,
		pinned: z.boolean(),
	})
	.strict();

export const setWidgetFocusOrderInputSchema = z
	.object({
		sceneId: idSchema,
		widgetInstanceId: idSchema,
		focusOrder: z.union([z.literal(null), z.number().int().nonnegative()]),
	})
	.strict();

export const destroyWidgetInputSchema = z
	.object({
		sceneId: idSchema,
		widgetInstanceId: idSchema,
	})
	.strict();

export const configureWidgetInputSchema = z
	.object({
		sceneId: idSchema,
		widgetInstanceId: idSchema,
		configuration: z.record(z.string(), z.unknown()).optional(),
		binding: z.union([z.literal(null), widgetBindingSchema]).optional(),
	})
	.strict()
	.refine((value) => value.configuration !== undefined || value.binding !== undefined, {
		message: 'Configuration or binding is required.',
	});

export const moveGroupInputSchema = z
	.object({
		sceneId: idSchema,
		groupId: idSchema,
		deltaX: z.number().finite(),
		deltaY: z.number().finite(),
	})
	.strict();

export const installWidgetPackageInputSchema = z
	.object({
		package: widgetPackageDefinitionSchema,
	})
	.strict();

export const enableWidgetPackageInputSchema = z
	.object({
		packageId: idSchema,
	})
	.strict();

export const disableWidgetPackageInputSchema = z
	.object({
		packageId: idSchema,
		reason: z.string().min(1).default('Disabled by widget manager.'),
	})
	.strict();

export const removeWidgetPackageInputSchema = z
	.object({
		packageId: idSchema,
	})
	.strict();

export const upgradeWidgetPackageInputSchema = z
	.object({
		package: widgetPackageDefinitionSchema,
	})
	.strict();

export const dispatchWidgetCommandInputSchema = z
	.object({
		sceneId: idSchema,
		widgetInstanceId: idSchema,
		commandType: z.string().min(1),
		payload: z.record(z.string(), z.unknown()).default({}),
		expectedRevision: z.number().int().nonnegative(),
	})
	.strict();

export const ensureCommandCenterHomeInputSchema = z
	.object({
		name: z.string().min(1).optional(),
	})
	.strict()
	.default({});

export const saveCommandCenterPresetInputSchema = z
	.object({
		name: z.string().min(1, 'Preset name is required'),
	})
	.strict();

export const applyCommandCenterPresetInputSchema = z
	.object({
		presetId: idSchema,
	})
	.strict();

const projectionTargetSchema = z
	.object({
		kind: z.enum(['scene', 'widget-subset', 'handout', 'map-region', 'display-state']),
		sceneId: idSchema,
		sectionIds: z.union([z.literal(null), z.array(idSchema).min(1)]).default(null),
		widgetInstanceIds: z.union([z.literal(null), z.array(idSchema).min(1)]).default(null),
		displayState: z.union([z.literal(null), z.record(z.string(), z.unknown())]).default(null),
		mapRegion: z
			.union([z.literal(null), z.object({ mapId: idSchema, regionId: idSchema }).strict()])
			.default(null),
	})
	.strict();

export const projectPlayerViewInputSchema = z
	.object({
		playerActorIds: z.array(idSchema).min(1),
		target: projectionTargetSchema,
		connectionState: z.enum(['connected', 'offline']).default('connected'),
	})
	.strict();

export const revokePlayerViewInputSchema = z
	.object({
		playerActorIds: z.array(idSchema).min(1),
	})
	.strict();

export const setSessionWorkflowInputSchema = z
	.object({
		workflow: z.enum(['idle', 'prep', 'active', 'paused', 'ending', 'recap', 'archived']),
		activeSceneId: z.union([z.literal(null), idSchema]).optional(),
	})
	.strict();

export const updateSessionCombatInputSchema = z
	.object({
		encounterId: z.union([z.literal(null), idSchema]).default(null),
		round: z.number().int().nonnegative().default(0),
		turn: z.number().int().nonnegative().default(0),
		combatantIds: z.array(idSchema).default([]),
	})
	.strict();

export const recordSessionDiceInputSchema = z
	.object({
		expression: z.string().min(1),
		total: z.number().finite(),
	})
	.strict();

export const setActiveMapInputSchema = z
	.object({
		mapId: idSchema,
		regionId: z.union([z.literal(null), idSchema]).default(null),
		widgetInstanceId: idSchema.optional(),
	})
	.strict();

export const projectActiveMapInputSchema = z
	.object({
		playerActorIds: z.array(idSchema).min(1),
		connectionState: z.enum(['connected', 'offline']).default('connected'),
	})
	.strict();

// MAP-005 / MAP-006 / MAP-007: durable map-layer mutations. Every layer mutation is a DM-only
// Processing-Core command appended through the storage adapter + command lifecycle (no GUI reaches
// storage directly). The layer category and player-facing visibility reuse the shared map/scene
// enums so the layer query and projection consistency audit speak the same vocabulary.
const mapLayerCategorySchema = z.enum([
	'base',
	'terrain',
	'roads',
	'poi',
	'fog',
	'dm-annotations',
	'player-overlay',
]);

export const createMapLayerInputSchema = z
	.object({
		mapId: idSchema,
		name: z.string().min(1, 'Layer name is required'),
		category: mapLayerCategorySchema.default('dm-annotations'),
		// `visibility` is the PLAYER-FACING visibility level (MAP-006). Defaults to `dm-only`
		// (fail closed): a freshly created layer is hidden from players until explicitly revealed.
		visibility: sceneVisibilitySchema.default('dm-only'),
		// `enabled` is the DM-display toggle, independent of visibility/opacity (MAP-006).
		enabled: z.boolean().default(true),
		opacity: z.number().min(0).max(1).default(1),
		tags: z.array(z.string().min(1)).default([]),
		query: z.record(z.string().min(1), z.string()).default({}),
		locked: z.boolean().default(false),
		atOrder: z.number().int().nonnegative().optional(),
	})
	.strict();

// MAP-001 — create a map entity with name, scale, projection metadata, default visibility, and an
// initial layer set. DEFAULT VISIBILITY FAILS CLOSED to `dm-only` when omitted. Inputs are validated
// fail-closed: a non-positive/non-finite scale or an unknown projection is rejected by these refines
// before any state mutation. The initial layer set may be empty in the payload — the handler seeds a
// default base layer so a map always has at least one layer.
const mapScaleSchema = z
	.object({
		unitsPerMap: z.number().finite().positive(),
		unit: z.string().min(1, 'A scale unit label is required'),
	})
	.strict();

const mapProjectionSchema = z
	.object({
		// The enum IS the fail-closed gate: any projection outside the supported set is rejected.
		kind: z.enum(['flat', 'equirectangular', 'web-mercator']),
		rotationDegrees: z.number().finite().default(0),
	})
	.strict();

const initialMapLayerSchema = z
	.object({
		name: z.string().min(1, 'Layer name is required'),
		category: mapLayerCategorySchema.default('base'),
		// Each initial layer's player-facing visibility also fails closed to `dm-only` when omitted.
		visibility: sceneVisibilitySchema.default('dm-only'),
		enabled: z.boolean().default(true),
		opacity: z.number().min(0).max(1).default(1),
		tags: z.array(z.string().min(1)).default([]),
		query: z.record(z.string().min(1), z.string()).default({}),
	})
	.strict();

export const createMapInputSchema = z
	.object({
		name: z.string().min(1, 'Map name is required'),
		description: z.string().default(''),
		// MAP-001: default visibility FAILS CLOSED to `dm-only` when unspecified.
		visibility: sceneVisibilitySchema.default('dm-only'),
		scale: z.union([z.literal(null), mapScaleSchema]).default(null),
		projection: mapProjectionSchema.default({ kind: 'flat' as const, rotationDegrees: 0 }),
		// The initial layer set. Empty ⇒ the handler seeds a single default base layer.
		initialLayers: z.array(initialMapLayerSchema).default([]),
	})
	.strict();

// MAP-002 — a native map asset import (image/SVG). The bytes arrive as a number array (a serialized
// Uint8Array) so the payload is JSON-validatable at the boundary; the handler hashes them into a
// content-addressed asset id (identical bytes dedupe). Size/MIME are validated fail-closed in the
// reducer BEFORE any storage mutation (MAP-002 AC2).
const importAssetBytesSchema = z.array(z.number().int().min(0).max(255));

const importAssetMetaSchema = z
	.object({
		mimeType: z.string().min(1),
		fileName: z.string().min(1),
		dimensions: z
			.union([
				z.literal(null),
				z
					.object({
						width: z.number().int().positive(),
						height: z.number().int().positive(),
					})
					.strict(),
			])
			.default(null),
		maxBytes: z.number().int().positive().optional(),
	})
	.strict();

export const importMapAssetInputSchema = z
	.object({
		mapId: idSchema,
		bytes: importAssetBytesSchema,
		asset: importAssetMetaSchema,
	})
	.strict();

const importElementKindSchema = z.enum([
	'dimensions',
	'grid',
	'background-image',
	'walls',
	'lights',
	'notes',
	'layers',
	'tokens',
]);

// MAP-020 — commit a previewed import as a TRANSACTION. The payload re-runs preview + staging in the
// handler; an external `formatId` with no declared adapter is rejected fail-closed and writes nothing
// (no partial map). A native import carries asset bytes; an external import declares element kinds the
// adapter classifies. `mapId` targets an existing map to attach assets to, or is absent to create a
// fresh imported map.
export const commitMapImportInputSchema = z
	.object({
		mapId: z.union([z.literal(null), idSchema]).default(null),
		mapName: z.string().min(1).optional(),
		formatId: z.union([z.literal(null), z.string().min(1)]).default(null),
		bytes: z.union([z.literal(null), importAssetBytesSchema]).default(null),
		asset: z.union([z.literal(null), importAssetMetaSchema]).default(null),
		declaredElements: z.array(importElementKindSchema).default([]),
	})
	.strict()
	.refine((value) => value.mapId !== null || value.mapName !== undefined, {
		message: 'Provide an existing mapId to attach to, or a mapName to create an imported map.',
	});

export const renameMapLayerInputSchema = z
	.object({
		mapId: idSchema,
		layerId: idSchema,
		name: z.string().min(1, 'Layer name is required'),
	})
	.strict();

export const reorderMapLayerInputSchema = z
	.object({
		mapId: idSchema,
		layerId: idSchema,
		toOrder: z.number().int().nonnegative(),
	})
	.strict();

export const duplicateMapLayerInputSchema = z
	.object({
		mapId: idSchema,
		layerId: idSchema,
	})
	.strict();

export const lockMapLayerInputSchema = z
	.object({
		mapId: idSchema,
		layerId: idSchema,
		locked: z.boolean(),
	})
	.strict();

export const deleteMapLayerInputSchema = z
	.object({
		mapId: idSchema,
		layerId: idSchema,
	})
	.strict();

// MAP-006: each presentation axis is its own command so toggling one never touches the others and
// the durable operation/path records exactly which axis changed.
export const setMapLayerVisibilityInputSchema = z
	.object({
		mapId: idSchema,
		layerId: idSchema,
		visibility: sceneVisibilitySchema,
	})
	.strict();

export const setMapLayerEnabledInputSchema = z
	.object({
		mapId: idSchema,
		layerId: idSchema,
		enabled: z.boolean(),
	})
	.strict();

export const setMapLayerOpacityInputSchema = z
	.object({
		mapId: idSchema,
		layerId: idSchema,
		opacity: z.number().min(0).max(1),
	})
	.strict();

// MAP-007: tag/query metadata is editable as a unit so the layer query reads consistent facets.
export const setMapLayerTagsInputSchema = z
	.object({
		mapId: idSchema,
		layerId: idSchema,
		tags: z.array(z.string().min(1)).default([]),
		query: z.record(z.string().min(1), z.string()).default({}),
	})
	.strict();

// MAP-003 — a painted/generated feature in normalized (0..1) map space. The same shape the renderer
// draws and the same shape carried in the durable op's before/after capture (so the op is replayable
// on another device). Coordinates are bounded to normalized space at validation time.
const mapFeatureSchema = z
	.object({
		id: idSchema,
		kind: z.enum(['stroke', 'fill', 'marker', 'room', 'wall', 'road']),
		points: z.array(z.object({ x: z.number().finite(), y: z.number().finite() }).strict()).min(1),
		style: z.string().min(1),
	})
	.strict();

// MAP-003 — a draw/paint edit. The command carries BOTH the BEFORE content (the optimistic-concurrency
// base + undo target) AND the AFTER content (the new layer content). Capturing both makes the edit
// undoable (the inverse swaps before/after) and sync-replayable (the op carries enough to apply/merge
// on another device). `before` is required so undo can restore the exact prior state.
export const editMapLayerInputSchema = z
	.object({
		mapId: idSchema,
		layerId: idSchema,
		before: z.array(mapFeatureSchema),
		after: z.array(mapFeatureSchema),
	})
	.strict();

// MAP-004 — procedural generation from EXPLICIT parameters + an explicit seed. Generation is
// deterministic: the same parameters (including `seed`) produce identical layers. `idPrefix` makes the
// generated layer/feature ids reproducible too (no random/time ids). Dimensions are capped in the
// reducer so generation stays bounded for the prototype.
export const generateMapLayersInputSchema = z
	.object({
		mapId: idSchema,
		kind: z.enum(['terrain', 'settlement', 'dungeon']),
		seed: z.union([z.number().finite(), z.string().min(1)]),
		width: z.number().int(),
		height: z.number().int(),
		density: z.number().min(0).max(1).default(0.5),
		visibility: sceneVisibilitySchema.default('dm-only'),
		idPrefix: z.string().min(1),
	})
	.strict();

// MAP-008 / MAP-017 — embed a child map inside a parent at a configured transform + transition.
// The transform is validated fail-closed (finite position, positive scale, finite rotation) and the
// threshold is bounded to (0, 1]. The CYCLE and MAX-DEPTH checks are graph-level and run in the
// reducer (`state/map-nesting.ts`) against the whole map graph, not here. The embed stores ONLY the
// child id — never the child's name/content — so the child's independent permission model is preserved.
const mapEmbedTransformSchema = z
	.object({
		position: z.object({ x: z.number().finite(), y: z.number().finite() }).strict(),
		// Positive scale keeps the child↔parent transform invertible (no degenerate footprint).
		scale: z.number().finite().positive(),
		rotationDegrees: z.number().finite().default(0),
	})
	.strict();

const mapTransitionBehaviorSchema = z.enum(['zoom', 'instant', 'fade']);

export const embedChildMapInputSchema = z
	.object({
		parentMapId: idSchema,
		childMapId: idSchema,
		transform: mapEmbedTransformSchema,
		transitionBehavior: mapTransitionBehaviorSchema.default('zoom'),
		// Defaulted in the handler when omitted; bounded to (0, 1] when present.
		transitionThreshold: z.number().finite().gt(0).max(1).optional(),
	})
	.strict();

export const updateMapEmbedInputSchema = z
	.object({
		parentMapId: idSchema,
		embedId: idSchema,
		transform: mapEmbedTransformSchema.optional(),
		transitionBehavior: mapTransitionBehaviorSchema.optional(),
		transitionThreshold: z.number().finite().gt(0).max(1).optional(),
	})
	.strict()
	.refine(
		(value) =>
			value.transform !== undefined ||
			value.transitionBehavior !== undefined ||
			value.transitionThreshold !== undefined,
		{ message: 'Provide at least one of transform, transitionBehavior, or transitionThreshold.' },
	);

export const removeMapEmbedInputSchema = z
	.object({
		parentMapId: idSchema,
		embedId: idSchema,
	})
	.strict();

// PERM-004: grant ONE named capability set to ONE player on ONE entity. The capability set is a
// named string validated against the per-entity-type system schema in the reducer (PERM-005), NOT a
// raw field list — the schema only constrains shape here. Expiry is optional ISO; absent ⇒ never
// expires. `idempotencyKey` lets a re-submitted grant command de-duplicate.
export const grantCapabilitySetInputSchema = z
	.object({
		entityType: z.string().min(1),
		entityId: idSchema,
		playerActorId: idSchema,
		capabilitySet: z.string().min(1),
		expiresAt: z.union([z.literal(null), z.string().min(1)]).default(null),
	})
	.strict();

// MAP-010 / MAP-011 / MAP-013 / MAP-019 — durable map ANNOTATION commands. A normalized point is
// strictly in [0,1] map space at the boundary, so an out-of-bounds annotation is rejected fail-closed
// before any state mutation (it survives scale/projection — MAP-010 AC2). POI/route/token visibility
// is the annotation's OWN player-facing level, independent of map/layer (MAP-011), defaulting closed
// to `dm-only`.
const normalizedPointSchema = z
	.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
	.strict();

const normalizedRegionSchema = z
	.object({
		x: z.number().min(0).max(1),
		y: z.number().min(0).max(1),
		w: z.number().gt(0).max(1),
		h: z.number().gt(0).max(1),
	})
	.strict();

const mapPoiCategorySchema = z.enum([
	'settlement',
	'landmark',
	'dungeon',
	'quest',
	'hazard',
	'shop',
	'npc',
	'note',
	'other',
]);

export const createMapPoiInputSchema = z
	.object({
		mapId: idSchema,
		layerId: idSchema,
		label: z.string().min(1, 'POI label is required'),
		category: mapPoiCategorySchema.default('other'),
		position: normalizedPointSchema,
		visibility: sceneVisibilitySchema.default('dm-only'),
		notes: z.string().default(''),
		linkedEntityType: z.union([z.literal(null), z.string().min(1)]).default(null),
		linkedEntityId: z.union([z.literal(null), idSchema]).default(null),
	})
	.strict();

export const updateMapPoiInputSchema = z
	.object({
		mapId: idSchema,
		poiId: idSchema,
		label: z.string().min(1).optional(),
		category: mapPoiCategorySchema.optional(),
		position: normalizedPointSchema.optional(),
		visibility: sceneVisibilitySchema.optional(),
		notes: z.string().optional(),
		layerId: idSchema.optional(),
		linkedEntityType: z.union([z.literal(null), z.string().min(1)]).optional(),
		linkedEntityId: z.union([z.literal(null), idSchema]).optional(),
	})
	.strict();

export const deleteMapPoiInputSchema = z
	.object({ mapId: idSchema, poiId: idSchema })
	.strict();

const routeWaypointSchema = z
	.object({
		id: idSchema,
		position: normalizedPointSchema,
		linkedEntityType: z.union([z.literal(null), z.string().min(1)]).default(null),
		linkedEntityId: z.union([z.literal(null), idSchema]).default(null),
	})
	.strict();

export const createMapRouteInputSchema = z
	.object({
		mapId: idSchema,
		layerId: idSchema,
		label: z.string().min(1, 'Route label is required'),
		visibility: sceneVisibilitySchema.default('dm-only'),
		waypoints: z.array(routeWaypointSchema).min(2, 'A route needs at least two waypoints'),
	})
	.strict();

export const updateMapRouteInputSchema = z
	.object({
		mapId: idSchema,
		routeId: idSchema,
		label: z.string().min(1).optional(),
		visibility: sceneVisibilitySchema.optional(),
		waypoints: z.array(routeWaypointSchema).min(2).optional(),
	})
	.strict();

export const deleteMapRouteInputSchema = z
	.object({ mapId: idSchema, routeId: idSchema })
	.strict();

// MAP-012 — fog reveal/conceal is an APPEND-ONLY durable op (a later op overrides an earlier overlap),
// so the op-log replays deterministically and syncs to player views. `connectionState` drives the
// delivery status (queued when offline) exactly like active-map projection.
export const appendMapFogInputSchema = z
	.object({
		mapId: idSchema,
		layerId: idSchema,
		kind: z.enum(['reveal', 'conceal']),
		region: normalizedRegionSchema,
		visibility: sceneVisibilitySchema.default('shared'),
		connectionState: z.enum(['connected', 'offline']).default('connected'),
	})
	.strict();

export const removeMapFogInputSchema = z
	.object({ mapId: idSchema, fogId: idSchema })
	.strict();

// MAP-019 — combat token lifecycle. A token records its linked actor, normalized position, size (grid
// cells), visibility, and optional controlling player (who may move it beyond the DM — MAP-019 AC4).
export const createMapTokenInputSchema = z
	.object({
		mapId: idSchema,
		layerId: idSchema,
		label: z.string().min(1, 'Token label is required'),
		linkedActorId: z.union([z.literal(null), idSchema]).default(null),
		position: normalizedPointSchema,
		size: z.number().gt(0).default(1),
		visibility: sceneVisibilitySchema.default('dm-only'),
		controllerActorId: z.union([z.literal(null), idSchema]).default(null),
	})
	.strict();

export const moveMapTokenInputSchema = z
	.object({
		mapId: idSchema,
		tokenId: idSchema,
		position: normalizedPointSchema,
	})
	.strict();

export const updateMapTokenInputSchema = z
	.object({
		mapId: idSchema,
		tokenId: idSchema,
		label: z.string().min(1).optional(),
		visibility: sceneVisibilitySchema.optional(),
		size: z.number().gt(0).optional(),
		controllerActorId: z.union([z.literal(null), idSchema]).optional(),
		linkedActorId: z.union([z.literal(null), idSchema]).optional(),
	})
	.strict();

export const deleteMapTokenInputSchema = z
	.object({ mapId: idSchema, tokenId: idSchema })
	.strict();

// MAP-014 — explicit combat overlay MODE commands with declared prerequisite gating. Entering a mode
// whose prerequisite is unmet is blocked with a reason UNLESS `autoSatisfyPrerequisites` is set (then
// the prerequisite visual state, e.g. grid visibility, is enabled). The gate is enforced fail-closed.
export const setMapOverlayModeInputSchema = z
	.object({
		mapId: idSchema,
		mode: z.enum(['none', 'grid-align', 'token', 'range', 'area-of-effect', 'combat']),
		autoSatisfyPrerequisites: z.boolean().default(false),
	})
	.strict();

export const configureMapOverlayInputSchema = z
	.object({
		mapId: idSchema,
		gridVisible: z.boolean().optional(),
		gridSize: z.number().int().gt(0).optional(),
		tokensEnabled: z.boolean().optional(),
		unitsPerCell: z.number().gt(0).optional(),
	})
	.strict()
	.refine(
		(value) =>
			value.gridVisible !== undefined ||
			value.gridSize !== undefined ||
			value.tokensEnabled !== undefined ||
			value.unitsPerCell !== undefined,
		{ message: 'Provide at least one overlay setting to configure.' },
	);

// PERM-004: revoke a single grant by id.
export const revokeGrantInputSchema = z
	.object({
		grantId: idSchema,
	})
	.strict();

// PERM-013: transfer a SINGULAR capability assignment (e.g. character `owner`) to a new holder.
// The reducer atomically revokes the prior holder's singular grant as it issues the new one.
export const transferOwnershipInputSchema = z
	.object({
		entityType: z.string().min(1),
		entityId: idSchema,
		toPlayerActorId: idSchema,
		capabilitySet: z.string().min(1).default('owner'),
		expiresAt: z.union([z.literal(null), z.string().min(1)]).default(null),
	})
	.strict();

// --- CHAR-001 / CHAR-002 / CHAR-013 — character command input schemas ---------------------------

const characterVisibilitySchema = z.enum(['dm-only', 'player-visible', 'shared']);

const abilityScoresSchema = z
	.object({
		str: z.number().int().optional(),
		dex: z.number().int().optional(),
		con: z.number().int().optional(),
		int: z.number().int().optional(),
		wis: z.number().int().optional(),
		cha: z.number().int().optional(),
	})
	.strict();

const characterAttackInputSchema = z
	.object({
		id: idSchema.optional(),
		name: z.string().min(1, 'Attack name is required'),
		detail: z.string().default(''),
	})
	.strict();

const characterCombatInputSchema = z
	.object({
		hp: z.number().int().optional(),
		maxHp: z.number().int().optional(),
		tempHp: z.number().int().nonnegative().optional(),
		ac: z.number().int().optional(),
		conditions: z.array(z.string().min(1)).optional(),
	})
	.strict();

// CHAR-001 — DM quick-create of an NPC/monster/sidekick with simplified stat + combat fields. The
// `kind` enum excludes `pc` (a PC is created through the guided draft flow, not quick-create).
// VISIBILITY DEFAULTS FAIL CLOSED to `dm-only` when omitted.
export const quickCreateCharacterInputSchema = z
	.object({
		kind: z.enum(['npc', 'monster', 'sidekick']),
		name: z.string().min(1, 'Character name is required'),
		visibility: characterVisibilitySchema.default('dm-only'),
		abilityScores: abilityScoresSchema.default({}),
		attacks: z.array(characterAttackInputSchema).default([]),
		combat: characterCombatInputSchema.default({}),
		data: z.record(z.string(), z.unknown()).default({}),
		dmOnlyFields: z.array(z.string().min(1)).default([]),
	})
	.strict();

// CHAR-013 — the DM creates a PC draft assigned to exactly one owner.
export const createCharacterDraftInputSchema = z
	.object({
		ownerActorId: idSchema,
		name: z.string().default(''),
		visibility: characterVisibilitySchema.default('dm-only'),
	})
	.strict();

// CHAR-013 — atomically transfer a draft to a new single owner (revokes the prior owner in one step).
export const transferCharacterDraftInputSchema = z
	.object({
		draftId: idSchema,
		toOwnerActorId: idSchema,
	})
	.strict();

// CHAR-013 — revoke (delete) an unfinalized draft.
export const revokeCharacterDraftInputSchema = z
	.object({
		draftId: idSchema,
	})
	.strict();

// CHAR-002 — the draft owner saves one guided-flow step. `expectedRevision` guards a stale resume.
export const updateCharacterDraftStepInputSchema = z
	.object({
		draftId: idSchema,
		stepId: z.string().min(1),
		values: z.record(z.string(), z.unknown()).default({}),
		expectedRevision: z.number().int().nonnegative().optional(),
	})
	.strict();

// CHAR-002 — the draft owner finalizes a fully-valid draft into a usable character.
export const finalizeCharacterDraftInputSchema = z
	.object({
		draftId: idSchema,
	})
	.strict();

// CHAR-004 / CHAR-005 — edit ANY single character field through a VALIDATED command, attributed in
// history (CHAR-005). The path is a free string here (the reducer validates it against the known
// editable-path set fail-closed); the value is constrained to the scalar/array shapes a field can
// hold. `baseRevision` is the revision the editor read before editing: a stale base on a path another
// author changed concurrently surfaces a same-path CONFLICT rather than silent overwrite (CHAR-004).
export const editCharacterFieldInputSchema = z
	.object({
		characterId: idSchema,
		path: z.string().min(1),
		value: z.union([
			z.string(),
			z.number(),
			z.boolean(),
			z.null(),
			z.array(z.string().min(1)),
		]),
		baseRevision: z.number().int().nonnegative().optional(),
	})
	.strict();

// CHAR-004 — the DM resolves an unresolved same-path conflict by selecting the local or remote value.
// Resolution is itself a validated command that records the chosen value and creates a new revision
// (Contract 2 Conflict Model rule 7).
export const resolveCharacterConflictInputSchema = z
	.object({
		characterId: idSchema,
		conflictId: idSchema,
		choice: z.enum(['local', 'remote']),
	})
	.strict();

// CHAR-001 / CHAR-007 (foundation) — set a character's combat field through a validated command so a
// bound widget refreshes. Restricted to the combat surface; deeper sheet edits land in later epics.
export const setCharacterCombatInputSchema = z
	.object({
		characterId: idSchema,
		hp: z.number().int().optional(),
		maxHp: z.number().int().optional(),
		tempHp: z.number().int().nonnegative().optional(),
		ac: z.number().int().optional(),
		conditions: z.array(z.string().min(1)).optional(),
	})
	.strict()
	.refine(
		(value) =>
			value.hp !== undefined ||
			value.maxHp !== undefined ||
			value.tempHp !== undefined ||
			value.ac !== undefined ||
			value.conditions !== undefined,
		{ message: 'Provide at least one combat field to update.' },
	);

// --- CHAR-007 — session combat-resource updates (owner OR combat-participant; session-active) ----

const restKindSchema = z.enum(['short', 'long']);
const rechargeSchema = z.enum(['short', 'long', 'none']);

// CHAR-007 — a single combat-resource update issued DURING A SESSION by a character owner or an
// authorized combat participant. One discriminated payload per resource so each carries exactly the
// fields it needs and the durable op records precisely what changed. Gated on the session workflow
// being `active` and on owner/combat-participant authority in the handler (fail closed).
export const updateCombatResourceInputSchema = z.discriminatedUnion('kind', [
	z.object({ characterId: idSchema, kind: z.literal('hp'), delta: z.number().int() }).strict(),
	z
		.object({ characterId: idSchema, kind: z.literal('temp-hp'), value: z.number().int().nonnegative() })
		.strict(),
	z
		.object({
			characterId: idSchema,
			kind: z.literal('condition'),
			condition: z.string().min(1),
			present: z.boolean(),
		})
		.strict(),
	z
		.object({
			characterId: idSchema,
			kind: z.literal('death-save'),
			outcome: z.enum(['success', 'failure', 'reset']),
		})
		.strict(),
	z
		.object({
			characterId: idSchema,
			kind: z.literal('concentration'),
			effect: z.union([z.literal(null), z.string().min(1)]),
		})
		.strict(),
	z
		.object({ characterId: idSchema, kind: z.literal('spell-slot'), level: z.number().int().min(0).max(9) })
		.strict(),
	z
		.object({
			characterId: idSchema,
			kind: z.literal('class-resource'),
			resourceId: idSchema,
			amount: z.number().int().positive(),
		})
		.strict(),
]);

// --- CHAR-008 — owner-managed spell/resource structure + rest recovery ---------------------------

// CHAR-008 — declare/update the max spell slots for a level (owner-only). `expended` is optional;
// it is clamped into the new max in the reducer.
export const setSpellSlotsInputSchema = z
	.object({
		characterId: idSchema,
		level: z.number().int().min(0).max(9),
		max: z.number().int().nonnegative(),
		expended: z.number().int().nonnegative().optional(),
	})
	.strict();

// CHAR-008 — declare/update a class resource and which rest restores it (owner-only).
export const setClassResourceInputSchema = z
	.object({
		characterId: idSchema,
		id: idSchema,
		name: z.string().min(1),
		max: z.number().int().nonnegative(),
		recharge: rechargeSchema,
		expended: z.number().int().nonnegative().optional(),
	})
	.strict();

// CHAR-008 — add/update a known spell and its prepared flag (owner-only).
export const setCharacterSpellInputSchema = z
	.object({
		characterId: idSchema,
		id: idSchema,
		name: z.string().min(1),
		level: z.number().int().min(0).max(9),
		prepared: z.boolean(),
	})
	.strict();

// CHAR-008 — apply a SHORT or LONG rest; recovery is deterministic in the reducer (owner-only).
export const restCharacterInputSchema = z
	.object({
		characterId: idSchema,
		rest: restKindSchema,
	})
	.strict();

// --- CHAR-009 — staged-then-commit level-up / advancement (owner-only) ---------------------------

const advancementModeSchema = z.enum(['xp', 'milestone']);

// CHAR-009 — adjust a character's XP total (owner-only). Drives XP-mode eligibility.
export const setCharacterXpInputSchema = z
	.object({
		characterId: idSchema,
		xp: z.number().int().nonnegative(),
	})
	.strict();

// CHAR-009 — OPEN a staged advancement draft on a character (owner-only). Eligibility (XP threshold
// or milestone) is checked fail-closed in the handler before the draft is opened.
export const openAdvancementInputSchema = z
	.object({
		characterId: idSchema,
		mode: advancementModeSchema,
	})
	.strict();

// CHAR-009 — set the staged level-up choices on the in-progress draft (owner-only). Validation runs
// against the merged draft; the character revision is NOT finalized here (staged-then-commit).
export const setAdvancementChoicesInputSchema = z
	.object({
		characterId: idSchema,
		className: z.string().min(1).optional(),
		hitPointsGained: z.number().int().optional(),
		subclass: z.string().min(1).optional(),
		abilityOrFeat: z.string().min(1).optional(),
	})
	.strict()
	.refine(
		(value) =>
			value.className !== undefined ||
			value.hitPointsGained !== undefined ||
			value.subclass !== undefined ||
			value.abilityOrFeat !== undefined,
		{ message: 'Provide at least one advancement choice.' },
	);

// CHAR-009 — COMMIT the staged advancement. Rejected fail-closed unless the draft passes validation;
// an invalid/incomplete advancement does not partially mutate the character (no-partial-commit).
export const commitAdvancementInputSchema = z
	.object({
		characterId: idSchema,
	})
	.strict();

// CHAR-009 — CANCEL an in-progress advancement draft (owner-only), discarding the staged choices.
export const cancelAdvancementInputSchema = z
	.object({
		characterId: idSchema,
	})
	.strict();

// --- CHAR-011 — party records (marching order + party inventory) --------------------------------

const journalEntryKindSchema = z.enum([
	'bookmark',
	'npc-impression',
	'personal-quest',
	'session-highlight',
	'note',
]);

// CHAR-011 — set the party marching order (an ordered list of character ids). DM-only authoring.
export const setMarchingOrderInputSchema = z
	.object({
		order: z.array(idSchema),
	})
	.strict();

// CHAR-011 — add/update a party-inventory item. DM-only. Visibility fails closed to `dm-only`.
export const upsertPartyInventoryItemInputSchema = z
	.object({
		id: idSchema.optional(),
		name: z.string().min(1, 'Item name is required'),
		detail: z.string().default(''),
		visibility: characterVisibilitySchema.default('dm-only'),
		sharedWith: z.array(idSchema).default([]),
	})
	.strict();

// CHAR-011 — remove a party-inventory item. DM-only.
export const removePartyInventoryItemInputSchema = z
	.object({
		itemId: idSchema,
	})
	.strict();

// --- CHAR-012 / CHAR-016 — character journal ----------------------------------------------------

// CHAR-012 — add a journal entry to a character's journal (owner or DM). Visibility fails closed to
// `shared`-to-owner when omitted (CHAR-016 AC1); the body is optional (a bookmark may be title-only).
export const addJournalEntryInputSchema = z
	.object({
		characterId: idSchema,
		kind: journalEntryKindSchema,
		title: z.string().min(1, 'A journal entry title is required'),
		body: z.string().default(''),
		visibility: characterVisibilitySchema.optional(),
		sharedWith: z.array(idSchema).default([]),
	})
	.strict();

// CHAR-012 — update a journal entry's content (owner or DM). Visibility is changed separately.
export const updateJournalEntryInputSchema = z
	.object({
		characterId: idSchema,
		entryId: idSchema,
		title: z.string().min(1).optional(),
		body: z.string().optional(),
		kind: journalEntryKindSchema.optional(),
	})
	.strict()
	.refine(
		(value) =>
			value.title !== undefined || value.body !== undefined || value.kind !== undefined,
		{ message: 'Provide at least one journal field to update.' },
	);

// CHAR-016 — change a journal entry's per-entry visibility (owner or DM). The explicit visibility
// change is the cross-surface invalidation trigger.
export const setJournalEntryVisibilityInputSchema = z
	.object({
		characterId: idSchema,
		entryId: idSchema,
		visibility: characterVisibilitySchema,
		sharedWith: z.array(idSchema).optional(),
	})
	.strict();

// CHAR-012 — remove a journal entry (owner or DM).
export const removeJournalEntryInputSchema = z
	.object({
		characterId: idSchema,
		entryId: idSchema,
	})
	.strict();

// --- CONTENT-011 — calendar/custom-time content -------------------------------------------------

const contentVisibilitySchema = z.enum(['dm-only', 'player-visible', 'shared']);
const contentItemKindSchema = z.enum(['note', 'object']);

// A custom-calendar date VALUE: 1-based month/day ordinals into a referenced calendar definition.
// The calendar id must be non-empty; range/validity against the calendar is enforced in the command
// layer (it has the definition). The year is any integer (pre-epoch years are allowed).
const customDateSchema = z
	.object({
		calendarId: idSchema,
		year: z.number().int(),
		month: z.number().int().min(1),
		day: z.number().int().min(1),
	})
	.strict();

const calendarMonthSchema = z
	.object({
		id: idSchema,
		name: z.string().min(1, 'A month name is required'),
		days: z.number().int().min(1, 'A month must have at least one day'),
	})
	.strict();

const timelineReferenceInputSchema = z
	.object({
		id: idSchema.optional(),
		label: z.string().min(1, 'A timeline reference label is required'),
		date: customDateSchema,
		targetId: idSchema.optional(),
	})
	.strict();

// CONTENT-011 — define (or replace) a campaign calendar definition (authorized editor only).
export const defineCalendarInputSchema = z
	.object({
		id: idSchema,
		name: z.string().min(1, 'A calendar name is required'),
		months: z.array(calendarMonthSchema).min(1, 'A calendar requires at least one month'),
		weekdays: z.array(z.string().min(1)).optional(),
		epochLabel: z.string().optional(),
	})
	.strict();

// CONTENT-011 — create a calendar-aware content item (note/object). Visibility fails closed to
// `dm-only` when omitted; date fields/timeline refs are validated against their calendar at dispatch.
export const createContentItemInputSchema = z
	.object({
		kind: contentItemKindSchema,
		title: z.string().min(1, 'A content title is required'),
		body: z.string().default(''),
		fields: z.record(z.string(), z.unknown()).default({}),
		dateFields: z.record(z.string(), customDateSchema).default({}),
		timelineRefs: z.array(timelineReferenceInputSchema).default([]),
		visibility: contentVisibilitySchema.optional(),
		sharedWith: z.array(idSchema).default([]),
	})
	.strict();

// CONTENT-011 — update a content item's content/fields/dates/timeline refs (authorized editor only).
export const updateContentItemInputSchema = z
	.object({
		itemId: idSchema,
		title: z.string().min(1).optional(),
		body: z.string().optional(),
		fields: z.record(z.string(), z.unknown()).optional(),
		dateFields: z.record(z.string(), customDateSchema).optional(),
		timelineRefs: z.array(timelineReferenceInputSchema).optional(),
	})
	.strict()
	.refine(
		(value) =>
			value.title !== undefined ||
			value.body !== undefined ||
			value.fields !== undefined ||
			value.dateFields !== undefined ||
			value.timelineRefs !== undefined,
		{ message: 'Provide at least one content field to update.' },
	);

// CONTENT-011 — change a content item's per-item visibility (the cross-surface invalidation trigger).
export const setContentItemVisibilityInputSchema = z
	.object({
		itemId: idSchema,
		visibility: contentVisibilitySchema,
		sharedWith: z.array(idSchema).optional(),
	})
	.strict();

// CONTENT-011 — remove a content item (authorized editor only). Soft-delete: the item is tombstoned
// and recoverable via `content.restore-item`, not purged.
export const removeContentItemInputSchema = z
	.object({
		itemId: idSchema,
	})
	.strict();

// CONTENT-001 — restore a soft-deleted content item (authorized editor only).
export const restoreContentItemInputSchema = z
	.object({
		itemId: idSchema,
	})
	.strict();

// --- CONTENT-005 — structured Vault Objects (note-backed, schema-validated frontmatter) ---------

const vaultObjectSubtypeSchema = z.enum([
	'note',
	'character',
	'map',
	'handout',
	'calendar-event',
	'timeline-event',
	'dice-table',
	'encounter',
	'audio-preset',
	'widget-package-ref',
]);

// CONTENT-005 — create a structured Vault Object as a note-backed content item (DM-only authoring). The
// frontmatter `fields` are validated against the subtype schema at dispatch (fail closed); the body is the
// markdown prose. Visibility fails closed to the subtype default (dm-only) when omitted.
export const createVaultObjectInputSchema = z
	.object({
		subtype: vaultObjectSubtypeSchema,
		title: z.string().min(1, 'A title is required'),
		fields: z.record(z.string(), z.unknown()).default({}),
		body: z.string().default(''),
		visibility: contentVisibilitySchema.optional(),
		sharedWith: z.array(idSchema).default([]),
	})
	.strict();

// CONTENT-005 — update a structured Vault Object's frontmatter fields and/or body (authorized editor). The
// merged frontmatter is re-validated against the subtype schema at dispatch (fail closed: no invalid revision
// is committed).
export const updateVaultObjectInputSchema = z
	.object({
		itemId: idSchema,
		title: z.string().min(1).optional(),
		fields: z.record(z.string(), z.unknown()).optional(),
		body: z.string().optional(),
	})
	.strict()
	.refine(
		(value) => value.title !== undefined || value.fields !== undefined || value.body !== undefined,
		{ message: 'Provide at least one field to update.' },
	);

// --- CONTENT-006 — wikilink lifecycle (rename-propagation, repair) ------------------------------

// CONTENT-006 — RENAME a wikilink target: rename the target note's title AND propagate the rename to every
// referring link in the actor's visible notes (authorized editor). Old/new titles are required + distinct.
export const renameWikilinkTargetInputSchema = z
	.object({
		itemId: idSchema,
		newTitle: z.string().min(1, 'A new title is required'),
	})
	.strict();

// CONTENT-006 — REPAIR a broken wikilink in a note body: rewrite a broken target to a chosen visible, available
// fix target (authorized editor). Refused fail-closed when the broken source is unavailable or the fix does
// not resolve.
export const repairWikilinkInputSchema = z
	.object({
		itemId: idSchema,
		brokenTarget: z.string().min(1, 'The broken target is required'),
		fixTargetTitle: z.string().min(1, 'A fix target title is required'),
	})
	.strict();

// --- CONTENT-007 / CONTENT-008 — import/export --------------------------------------------------

const importSourceKindSchema = z.enum(['markdown-archive', 'obsidian-vault']);
const importConflictPolicySchema = z.enum(['skip', 'overwrite', 'keep-both']);
const contentExportModeSchema = z.enum(['portable', 'dm-backup']);

// One archive file: a relative path + its raw markdown TEXT (ADR-014: operate on provided text content,
// no real filesystem picker). Both path and text are required; empty text is allowed (an empty note).
const importArchiveFileSchema = z
	.object({
		path: z.string().min(1, 'An archive file path is required'),
		text: z.string(),
	})
	.strict();

// CONTENT-007 — commit a transactional, resumable import (DM-only). `appliedEntryIds` lets a RESUMED
// import declare which steps a prior partial run already wrote, so they are not re-applied (AC2).
export const commitContentImportInputSchema = z
	.object({
		sourceKind: importSourceKindSchema,
		policy: importConflictPolicySchema,
		files: z.array(importArchiveFileSchema).default([]),
		appliedEntryIds: z.array(z.string().min(1)).default([]),
	})
	.strict();

// CONTENT-008 — export portable markdown + validation report (DM-only). `portableViewerActorId` is the
// representative player whose visibility the PORTABLE filter is evaluated against; ignored for dm-backup.
export const exportContentInputSchema = z
	.object({
		mode: contentExportModeSchema,
		portableViewerActorId: z.string().default(''),
	})
	.strict();

// --- CONTENT-012 — source-specific constraints (acknowledged write-back) ------------------------

const contentSourceIdSchema = z.enum(['local-markdown', 'obsidian', 'google-docs']);

// CONTENT-012 — write a note's content back to a target SOURCE (DM-only authoring). The Processing Core
// re-runs the PURE constraint check from `noteText` + `source`; a write that would lose/downgrade
// detected structures is rejected unless `acknowledgmentToken` EXACTLY matches the check's token (the
// human acknowledged precisely this loss). `acknowledgmentToken` is omitted/null for a faithful write.
export const writeContentToSourceInputSchema = z
	.object({
		itemId: idSchema,
		source: contentSourceIdSchema,
		noteText: z.string(),
		acknowledgmentToken: z.string().min(1).nullish(),
	})
	.strict();
