import { z } from 'zod';
import { SCENE_SCHEMA_VERSION, SCENE_STATE_SCHEMA_VERSION } from '../state/scene-state';

const idSchema = z.string().min(1);
const actorIdSchema = idSchema;
const isoTimestamp = z.string().min(1);

export const sceneVisibilitySchema = z.enum(['dm-only', 'shared', 'player-visible']);
export const sceneBackgroundSchema = z.enum(['paper', 'parchment', 'dark', 'grid']);
export const widgetDockSchema = z.union([
	z.literal(null),
	z.enum(['left', 'right', 'top', 'bottom']),
]);

export const widgetBindingSchema = z
	.object({
		source: z
			.object({
				entityType: z.string().min(1),
				entityId: z.string().min(1),
				selector: z.string().min(1).optional(),
			})
			.strict(),
		mode: z.enum(['read', 'operate', 'manage', 'observe']),
		requiredCapability: z.enum(['manager', 'operator', 'viewer']),
	})
	.strict();

export const widgetLayoutSchema = z
	.object({
		x: z.number().finite(),
		y: z.number().finite(),
		w: z.number().finite().positive(),
		h: z.number().finite().positive(),
		z: z.number().int(),
		groupId: z.union([z.literal(null), idSchema]),
		dock: widgetDockSchema,
		pinned: z.boolean(),
		focusOrder: z.union([z.literal(null), z.number().int().nonnegative()]),
	})
	.strict();

export const widgetDisabledStateSchema = z
	.object({
		reason: z.enum(['package-disabled', 'package-removed', 'migration-failed']),
		packageId: z.union([z.literal(null), idSchema]),
		diagnosticId: z.union([z.literal(null), idSchema]),
		message: z.string().min(1),
		previousVersion: z.union([z.literal(null), z.string().min(1)]),
		disabledAt: isoTimestamp,
	})
	.strict();

export const widgetInstanceSchema = z
	.object({
		id: idSchema,
		type: z.string().min(1),
		version: z.string().min(1),
		layout: widgetLayoutSchema,
		configuration: z.record(z.string(), z.unknown()),
		localState: z.record(z.string(), z.unknown()),
		binding: z.union([z.literal(null), widgetBindingSchema]),
		disabled: z.union([z.literal(null), widgetDisabledStateSchema]),
	})
	.strict();

export const sectionLayoutRegionSchema = z
	.object({
		id: idSchema,
		name: z.string().min(1),
		bounds: z
			.object({
				x: z.number().finite(),
				y: z.number().finite(),
				w: z.number().finite().positive(),
				h: z.number().finite().positive(),
			})
			.strict(),
		widgetInstanceIds: z.array(idSchema),
	})
	.strict();

export const playerViewAssignmentSchema = z
	.object({
		playerActorId: actorIdSchema,
		sectionIds: z.union([z.literal(null), z.array(idSchema).min(1)]),
	})
	.strict();

export const sceneTemplateMetaSchema = z
	.object({
		isTemplate: z.boolean(),
		instantiatedFromTemplateSceneId: z.union([z.literal(null), idSchema]),
	})
	.strict();

export const sceneOwnershipSchema = z
	.object({
		ownerActorId: actorIdSchema,
		createdAt: isoTimestamp,
		updatedAt: isoTimestamp,
		revision: z.number().int().nonnegative(),
	})
	.strict();

export const sceneVisualSettingsSchema = z
	.object({
		background: sceneBackgroundSchema,
		accentColor: z.string().min(1).optional(),
	})
	.strict();

export const sceneSchema = z
	.object({
		id: idSchema,
		name: z.string().min(1, 'Scene name is required'),
		description: z.string(),
		tags: z.array(z.string().min(1)),
		visibility: sceneVisibilitySchema,
		visualSettings: sceneVisualSettingsSchema,
		ownership: sceneOwnershipSchema,
		sharingTargets: z.array(actorIdSchema),
		playerViewAssignments: z.array(playerViewAssignmentSchema),
		templateMeta: sceneTemplateMetaSchema,
		sections: z.array(sectionLayoutRegionSchema),
		widgets: z.array(widgetInstanceSchema),
		schemaVersion: z.literal(SCENE_SCHEMA_VERSION),
	})
	.strict();

export const sceneStateSchema = z
	.object({
		scenes: z.record(idSchema, sceneSchema),
		schemaVersion: z.literal(SCENE_STATE_SCHEMA_VERSION),
	})
	.strict();

export type SceneInput = z.input<typeof sceneSchema>;
export type SceneParsed = z.output<typeof sceneSchema>;
