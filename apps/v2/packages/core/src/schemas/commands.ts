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
