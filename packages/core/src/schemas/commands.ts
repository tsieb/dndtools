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
// RC-SYS-1.3 — the system-package command inputs (append-only block at the end of this module).
import { systemPackageSchema } from './system-package';
import { SCENE_CARD_FLAVOR_MAX_LENGTH } from '../state/scene-card';
import {
	CUSTOM_OBJECT_TYPE_ID_PATTERN,
	CUSTOM_OBJECT_TYPE_MAX_FIELDS,
	CUSTOM_OBJECT_TYPE_MAX_LABEL,
} from '../state/custom-object-type';
import { isSafeRemoteMediaUrl } from '../security/content-safety';

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

// SOFT-DELETE a scene (tombstone; mirrors content.remove-item). DM-only. The reducer guards the
// ACTIVE scene and the Command Center HOME scene fail-closed (they can never be deleted).
export const deleteSceneInputSchema = z
	.object({
		sceneId: idSchema,
	})
	.strict();

// RESTORE a soft-deleted scene (the undo counterpart of scene.delete). DM-only.
export const restoreSceneInputSchema = z
	.object({
		sceneId: idSchema,
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

// UX-CMD-008 — the auto-save snapshot / restore commands take no caller payload; they operate on the
// single last-known-good slot and the current home Scene.
export const commandCenterAutoSaveInputSchema = z.object({}).strict().default({});

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
		playerActorIds: z.array(idSchema).default([]),
		/**
		 * COLLAB-012 — Player Group ids to project to. Each group is resolved to its CURRENT members at
		 * projection time (delivery-only; membership grants no permission). Resolved members are unioned with
		 * `playerActorIds`. At least one explicit player OR group must resolve to a recipient.
		 */
		groupIds: z.array(idSchema).default([]),
		target: projectionTargetSchema,
		connectionState: z.enum(['connected', 'offline']).default('connected'),
	})
	.strict();

export const revokePlayerViewInputSchema = z
	.object({
		playerActorIds: z.array(idSchema).min(1),
	})
	.strict();

// COLLAB-012 — PLAYER GROUP management (DM-only). A group is a DELIVERY/PROJECTION TARGET ONLY; membership
// confers NO permission. Members must be registered participants (players/observers), never the DM.
export const createPlayerGroupInputSchema = z
	.object({
		/** Reuse an existing group id (idempotent create), or omit to create a new one. */
		groupId: idSchema.optional(),
		name: z.string().min(1, 'A player group needs a name.'),
		memberActorIds: z.array(idSchema).default([]),
	})
	.strict();

export const updatePlayerGroupInputSchema = z
	.object({
		groupId: idSchema,
		/** New name (optional — omit to leave unchanged). */
		name: z.string().min(1).optional(),
		/** The FULL replacement member set (optional — omit to leave membership unchanged). */
		memberActorIds: z.array(idSchema).optional(),
	})
	.strict();

export const deletePlayerGroupInputSchema = z
	.object({
		groupId: idSchema,
	})
	.strict();

// I11 S11.2.1–S11.2.4 — SCENE CARD (atmosphere) command inputs. All DM-only (authority enforced in the
// reducer). A card is presentation content only (title/mood/hero image/flavor/audio ref/visibility); the
// queue + active display + player push live on the same slice. Enums mirror the closed sets in
// `state/scene-card.ts`; flavor is bounded to SCENE_CARD_FLAVOR_MAX_LENGTH.
const sceneCardMoodSchema = z.enum(['combat', 'exploration', 'mystery', 'social', 'rest']);
const sceneCardVisibilitySchema = z.enum(['dm-only', 'player-visible']);
const sceneCardTransitionStyleSchema = z.enum(['crossfade', 'slide', 'cut']);
const sceneCardHeroImageSchema = z
	.object({
		kind: z.enum(['vault-asset', 'url']),
		ref: z.string().min(1).max(2048),
	})
	.strict()
	.superRefine((image, context) => {
		if (image.kind === 'url' && !isSafeRemoteMediaUrl(image.ref)) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['ref'],
				message: 'A hero image must use an absolute http(s) URL without embedded credentials.',
			});
		}
	});
const sceneCardFlavorSchema = z.string().max(SCENE_CARD_FLAVOR_MAX_LENGTH);

export const createSceneCardInputSchema = z
	.object({
		/** Reuse an existing id (idempotent create) or omit to mint a new one. */
		cardId: idSchema.optional(),
		title: z.string().min(1, 'A scene card needs a title.'),
		mood: sceneCardMoodSchema.default('exploration'),
		heroImage: z.union([z.null(), sceneCardHeroImageSchema]).default(null),
		flavorText: sceneCardFlavorSchema.default(''),
		audioAssociationId: z.union([z.null(), idSchema]).default(null),
		visibility: sceneCardVisibilitySchema.default('dm-only'),
	})
	.strict();

export const updateSceneCardInputSchema = z
	.object({
		cardId: idSchema,
		title: z.string().min(1).optional(),
		mood: sceneCardMoodSchema.optional(),
		/** Provide `null` to clear the hero image; omit to leave unchanged. */
		heroImage: z.union([z.null(), sceneCardHeroImageSchema]).optional(),
		flavorText: sceneCardFlavorSchema.optional(),
		/** Provide `null` to clear the audio cue; omit to leave unchanged. */
		audioAssociationId: z.union([z.null(), idSchema]).optional(),
	})
	.strict();

export const deleteSceneCardInputSchema = z.object({ cardId: idSchema }).strict();

export const restoreSceneCardInputSchema = z.object({ cardId: idSchema }).strict();

export const setSceneCardVisibilityInputSchema = z
	.object({
		cardId: idSchema,
		visibility: sceneCardVisibilitySchema,
	})
	.strict();

// Activate a card onto the display (or `null` to clear the display). A player-visible activation pushes.
export const activateSceneCardInputSchema = z
	.object({
		cardId: z.union([z.null(), idSchema]),
	})
	.strict();

export const setSceneCardTransitionInputSchema = z
	.object({
		transitionStyle: sceneCardTransitionStyleSchema,
	})
	.strict();

export const enqueueSceneCardInputSchema = z.object({ cardId: idSchema }).strict();

export const dequeueSceneCardInputSchema = z.object({ cardId: idSchema }).strict();

// Full replacement of the queue order (a permutation of currently-queued live cards).
export const reorderSceneCardQueueInputSchema = z
	.object({
		queue: z.array(idSchema),
	})
	.strict();

// Advance the queue: activate the head card and remove it from the queue. No arguments.
export const advanceSceneCardQueueInputSchema = z.object({}).strict();

export const setSessionWorkflowInputSchema = z
	.object({
		workflow: z.enum(['idle', 'prep', 'active', 'paused', 'ending', 'recap', 'archived']),
		activeSceneId: z.union([z.literal(null), idSchema]).optional(),
	})
	.strict();

export const recordSessionDiceInputSchema = z
	.object({
		expression: z.string().min(1),
		total: z.number().finite(),
	})
	.strict();

// SES-001 — recover an archived Session State back into recap review. `archiveId` is optional: absent
// recovers the session's current `recapArchiveId` (the most recent archive). The reducer fails closed
// when no archive is available or the id is unknown.
export const recoverSessionInputSchema = z
	.object({
		archiveId: idSchema.optional(),
	})
	.strict();

// SES-003 — roll a dice expression / macro / inline roll through the shared dice command. The OUTCOME is
// computed ONCE in the Processing Core from a recorded seed (never supplied by the GUI), so it is
// reproducible. An optional explicit `seed` makes a roll deterministic for tests/replay; absent ⇒ the
// command derives a seed from the env. Visibility composes with PERM (a `dm-only`/secret roll is never
// exposed to players).
const diceRollVisibilitySchema = z.enum(['session-visible', 'dm-only', 'shared']);

export const rollDiceInputSchema = z
	.object({
		expression: z.string().min(1, 'A dice expression is required.'),
		/** Resolve `expression` as a macro NAME against the supplied macros before parsing. */
		macros: z
			.array(z.object({ name: z.string().min(1), expression: z.string().min(1) }).strict())
			.default([]),
		/** Treat `expression` as a macro reference (`@name`) and resolve it before rolling. */
		asMacro: z.boolean().default(false),
		/** Mark this as an inline roll (embedded in text). Affects only the recorded source kind. */
		inline: z.boolean().default(false),
		visibility: diceRollVisibilitySchema.default('session-visible'),
		sharedWith: z.array(idSchema).default([]),
		/**
		 * SES-003 AC4 — Player Group ids to expand into individual sharedWith recipients (delivery-only;
		 * membership confers no permission). Unknown group ids are rejected fail-closed.
		 */
		groupIds: z.array(idSchema).default([]),
		label: z.string().max(120).optional(),
		/** Optional explicit seed for deterministic/reproducible rolls (tests, replay). */
		seed: z.union([z.number().finite(), z.string().min(1)]).optional(),
	})
	.strict();

// SES-008 — draw a rollable table (a `dice-table` Vault Object) as a session asset. The draw is
// deterministic from the recorded seed; the selected row is recorded in session history, attributed.
export const rollTableInputSchema = z
	.object({
		tableItemId: idSchema,
		visibility: diceRollVisibilitySchema.default('session-visible'),
		sharedWith: z.array(idSchema).default([]),
		/**
		 * SES-003 AC4 — Player Group ids to expand into individual sharedWith recipients (delivery-only;
		 * membership confers no permission). Unknown group ids are rejected fail-closed.
		 */
		groupIds: z.array(idSchema).default([]),
		label: z.string().max(120).optional(),
		seed: z.union([z.number().finite(), z.string().min(1)]).optional(),
	})
	.strict();

// SES-008 — append an already-recorded roll/table result to a note (by reference through the existing
// content write path). Note history records the actor + source roll.
export const appendRollToNoteInputSchema = z
	.object({
		rollId: idSchema,
		itemId: idSchema,
	})
	.strict();

// SES-004 — HANDOUT delivery. The DM authors a handout (title + ordered sections, each with its own
// visibility) and DELIVERS it as a Scene widget to SELECTED recipients (players/observers). The reducer
// is DM-only + active-session-gated; visibility is enforced at read time so non-recipients receive
// nothing. `revealedSectionIds` drives optional/progressive reveal.
const handoutSectionVisibilitySchema = z.enum(['shared', 'player-visible', 'dm-only']);

const handoutSectionInputSchema = z
	.object({
		id: idSchema.optional(),
		heading: z.string().min(1, 'A handout section needs a heading.'),
		body: z.string().default(''),
		visibility: handoutSectionVisibilitySchema.default('shared'),
	})
	.strict();

// COLLAB-007 — the content kind a handout carries (handout/image/note/map-fragment/cipher/rumor).
const handoutKindSchema = z.enum(['handout', 'image', 'note', 'map-fragment', 'cipher', 'rumor']);

export const deliverHandoutInputSchema = z
	.object({
		/** Reuse an existing handout by id (re-deliver / add recipients), or omit to create a new one. */
		handoutId: idSchema.optional(),
		/** COLLAB-007 — the content kind. Default `handout`. Descriptive; does not change delivery rules. */
		kind: handoutKindSchema.default('handout'),
		title: z.string().min(1, 'A handout needs a title.'),
		sections: z.array(handoutSectionInputSchema).min(1, 'A handout needs at least one section.'),
		/** The Scene the handout widget is delivered onto. */
		sceneId: idSchema,
		/** Explicit recipients (players/observers). Each receives a handout widget; non-recipients do not. */
		recipientActorIds: z.array(idSchema).default([]),
		/**
		 * COLLAB-012 — Player Group ids to deliver to. Each group is resolved to its CURRENT members at
		 * delivery time (delivery-only; membership grants no permission). Resolved members are unioned with
		 * the explicit recipients. At least one explicit recipient OR group must resolve to a recipient.
		 */
		groupIds: z.array(idSchema).default([]),
		/**
		 * COLLAB-007 — recipients granted PERSISTENT access (keep the handout despite revocation/session end).
		 * Must be a subset of the resolved recipients. Default: none persistent (session-only).
		 */
		persistentRecipientActorIds: z.array(idSchema).default([]),
		/** Section ids revealed at delivery time (progressive reveal). Default: none revealed yet. */
		revealedSectionIds: z.array(idSchema).default([]),
		connectionState: z.enum(['connected', 'offline']).default('connected'),
	})
	.strict();

export const revealHandoutSectionInputSchema = z
	.object({
		handoutId: idSchema,
		sectionId: idSchema,
		/** true ⇒ reveal the section to recipients; false ⇒ re-conceal it (progressive reveal). */
		revealed: z.boolean().default(true),
	})
	.strict();

// COLLAB-007 — the RECIPIENT acknowledges receipt of a handout (the "opened" confirmation). Only a current,
// non-sealed recipient may acknowledge their OWN delivery.
export const acknowledgeHandoutInputSchema = z
	.object({
		handoutId: idSchema,
	})
	.strict();

// COLLAB-007 — the DM REVOKES a handout from selected recipients (sealed/unavailable unless persistent).
export const revokeHandoutInputSchema = z
	.object({
		handoutId: idSchema,
		/** Recipients to revoke. Default empty ⇒ revoke ALL non-persistent recipients. */
		recipientActorIds: z.array(idSchema).default([]),
		connectionState: z.enum(['connected', 'offline']).default('connected'),
	})
	.strict();

// SES-007 — QUICK-REFERENCE panels. The DM PINS content BY REFERENCE (note / stat block / rules snippet /
// open thread / session context). DM-only. Durable pin state survives route changes; a pinned target that
// becomes hidden/deleted degrades to an unavailable state at read time (no leak).
const quickReferenceKindSchema = z.enum([
	'note',
	'stat-block',
	'rules-snippet',
	'open-thread',
	'session-context',
]);

export const pinQuickReferenceInputSchema = z
	.object({
		kind: quickReferenceKindSchema,
		label: z.string().min(1, 'A quick-reference panel needs a label.'),
		/** The referenced target id. `session-context` panels carry a null target. */
		targetId: z.union([z.literal(null), idSchema]).default(null),
	})
	.strict();

export const unpinQuickReferenceInputSchema = z
	.object({
		panelId: idSchema,
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
		/** MAP-021 — explicit layer id (undo/replay path). Omitted ⇒ minted; a collision rejects. */
		id: idSchema.optional(),
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

// Rename / re-describe a map entity (mirrors scene.update-metadata). DM-only; at least one field.
export const updateMapMetadataInputSchema = z
	.object({
		mapId: idSchema,
		name: z.string().min(1).optional(),
		description: z.string().optional(),
	})
	.strict()
	.refine((value) => value.name !== undefined || value.description !== undefined, {
		message: 'Provide at least one metadata field to update.',
	});

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
		/** MAP-021 — explicit id for the COPY (undo/replay path). Omitted ⇒ minted; a collision rejects. */
		id: idSchema.optional(),
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

// MAP-021 — the FULL feature schema: every {@link MapFeatureKind} the generator fleet and the paint
// tools emit, plus the bounded `props` record. It is deliberately SEPARATE from `mapFeatureSchema`
// above: `map.edit-layer` is shipped and its payload shape is frozen, so the new incremental commands
// (and only they) accept the extended kinds/props. `props` is a flat record of PRIMITIVES — the same
// bound `MapFeatureProps` declares — so a `.strict()` payload can never smuggle an arbitrary nested
// object graph into durable state.
const mapFeaturePropsSchema = z.record(
	z.string().min(1),
	z.union([z.string(), z.number().finite(), z.boolean()]),
);

const mapFeatureKindSchema = z.enum([
	'stroke',
	'fill',
	'marker',
	'room',
	'wall',
	'road',
	'polygon',
	'door',
	'light',
	'water',
	'text',
	'prop',
]);

const mapFeatureV2Schema = z
	.object({
		id: idSchema,
		kind: mapFeatureKindSchema,
		points: z.array(z.object({ x: z.number().finite(), y: z.number().finite() }).strict()).min(1),
		style: z.string().min(1),
		props: mapFeaturePropsSchema.optional(),
	})
	.strict();

// MAP-021 — INCREMENTAL feature commands. `map.edit-layer` carries the layer's whole before+after
// content in BOTH the payload and the durable op; on a generated layer holding thousands of features
// that is a five-figure write per brush stroke. These three carry only the DELTA. Each is DM-only,
// rejects a locked layer fail-closed, and appends exactly one op whose value is the delta.
export const addMapFeaturesInputSchema = z
	.object({
		mapId: idSchema,
		layerId: idSchema,
		features: z.array(mapFeatureV2Schema).min(1),
		/**
		 * Optional insertion index per feature (aligned with `features`). Absent ⇒ appended. Present ⇒
		 * each feature is spliced back in at its index — which is how undoing a `map.remove-features`
		 * restores the EXACT prior array order rather than dumping the features back at the end.
		 */
		indices: z.union([z.literal(null), z.array(z.number().int().nonnegative())]).default(null),
	})
	.strict();

export const updateMapFeaturesInputSchema = z
	.object({
		mapId: idSchema,
		layerId: idSchema,
		/** Replacement features, matched to the layer's content BY ID. An unknown id rejects fail-closed. */
		features: z.array(mapFeatureV2Schema).min(1),
	})
	.strict();

export const removeMapFeaturesInputSchema = z
	.object({
		mapId: idSchema,
		layerId: idSchema,
		featureIds: z.array(idSchema).min(1),
	})
	.strict();

// MAP-021 — REGISTRY-DRIVEN generation. The payload names a generator by id and hands it a seed + a raw
// param record; `resolveParams` validates that record against the generator's DECLARED param specs
// (fail-closed, naming the offending knob), so this schema deliberately does NOT re-declare the params —
// a generator's knobs live in exactly one place (its `ParamSpec[]`) and can never drift from a duplicate
// schema here. The durable op records `{generatorId, generatorVersion, seed, params}` and NOT the
// geometry, so a replaying device re-runs the generator and gets byte-identical layers.
export const generateMapInputSchema = z
	.object({
		mapId: idSchema,
		generatorId: z.string().min(1),
		seed: z.union([z.number().finite(), z.string().min(1)]),
		params: z.record(z.string().min(1), z.unknown()).default({}),
		/** Deterministic id prefix for every generated layer/feature id. Never a clock, never a counter. */
		idPrefix: z.string().min(1),
		visibility: sceneVisibilitySchema.default('dm-only'),
		/**
		 * REPLAY GUARD. When a device replays a recorded generate op it passes the op's recorded
		 * `generatorVersion`; if the local generator has since been bumped its PRNG call order (and so its
		 * geometry) differs, and the replay would SILENTLY produce a different map. Supplying the recorded
		 * version turns that into an explicit `generator-version-mismatch` rejection. Absent on a fresh
		 * run (the handler records the current version).
		 */
		generatorVersion: z.number().int().nonnegative().optional(),
		/** Existing layers this run REPLACES (a re-roll in place). Requires `replace: true`. */
		targetLayerIds: z.union([z.literal(null), z.array(idSchema)]).default(null),
		replace: z.boolean().default(false),
	})
	.strict();

// MAP-021 — AUTO-DERIVATION. Walls/doors/lights are a pure function of the floor geometry the source
// layers already hold (the boundary of the floor union IS the wall set), so this command is what turns
// any generator's — or any hand-drawn — floors into a VTT-exportable scene with working line-of-sight.
const deriveOptionsSchema = z
	.object({
		wallThickness: z.number().finite().positive().optional(),
		simplifyTolerance: z.number().finite().positive().optional(),
		resolution: z.number().int().min(16).max(1024).optional(),
		corridorWidth: z.number().finite().positive().optional(),
		doorChance: z.number().min(0).max(1).optional(),
		secretDoorChance: z.number().min(0).max(1).optional(),
		archwayChance: z.number().min(0).max(1).optional(),
		portcullisChance: z.number().min(0).max(1).optional(),
		lockedChance: z.number().min(0).max(1).optional(),
		openChance: z.number().min(0).max(1).optional(),
		doorWidth: z.number().finite().positive().max(1).optional(),
		torchSpacing: z.number().finite().positive().max(1).optional(),
		lightRadius: z.number().finite().positive().max(1).optional(),
		lightDimRadius: z.number().finite().positive().max(1).optional(),
		lightColor: z.string().min(1).optional(),
		lightWallOffset: z.number().finite().positive().max(1).optional(),
	})
	.strict();

export const deriveMapFeaturesInputSchema = z
	.object({
		mapId: idSchema,
		/** The layers whose FLOOR geometry (rooms/chambers/polygons + corridor centrelines) is read. */
		sourceLayerIds: z.array(idSchema).min(1),
		/** The layer the derived features are written to. Absent/null ⇒ a new layer is created. */
		targetLayerId: z.union([z.literal(null), idSchema]).default(null),
		walls: z.boolean().default(true),
		doors: z.boolean().default(true),
		lights: z.boolean().default(true),
		seed: z.union([z.number().finite(), z.string().min(1)]),
		/** Deterministic id prefix for the derived features (`<prefix>-wall-3`, `<prefix>-door-1`, …). */
		idPrefix: z.string().min(1),
		/** Player-facing visibility of a NEWLY CREATED target layer. Fails closed to `dm-only`. */
		visibility: sceneVisibilitySchema.default('dm-only'),
		options: deriveOptionsSchema.default({}),
	})
	.strict();

// MAP-021 — DELETE a map. DM-only. Refuses fail-closed to ORPHAN an embed: while any other map embeds
// this one, the delete is rejected (the parent would keep a reference to a map that no longer exists,
// which every consumer would then have to guess about). `force` deletes it anyway AND removes those
// embeds from their parents, so the graph is left consistent either way — never dangling.
export const deleteMapInputSchema = z
	.object({
		mapId: idSchema,
		force: z.boolean().default(false),
	})
	.strict();

// MAP-021 — scale and projection were WRITE-ONCE at `map.create`, so a DM who picked `feet` for a
// regional map had to DELETE it and start over. These two make them editable, with exactly the same
// fail-closed validation `map.create` applies (a non-positive/non-finite scale or an unknown projection
// is rejected before any mutation).
export const setMapScaleInputSchema = z
	.object({
		mapId: idSchema,
		/** Null clears the scale (distance/travel-time then read as unavailable rather than guessed). */
		scale: z.union([z.literal(null), mapScaleSchema]),
	})
	.strict();

export const setMapProjectionInputSchema = z
	.object({
		mapId: idSchema,
		projection: mapProjectionSchema,
	})
	.strict();

// MAP-021 — REGION CRUD. `MapRegion` shipped as a type with two readers (`session.set-active-map` frames
// the player view on one, `MapEntity.defaultRegionId` names the one a map opens on) and NO writer, so
// no region could ever be authored. Bounds are validated fail-closed inside normalized [0,1] space.
const mapRegionBoundsSchema = z
	.object({
		x: z.number().min(0).max(1),
		y: z.number().min(0).max(1),
		w: z.number().gt(0).max(1),
		h: z.number().gt(0).max(1),
	})
	.strict();

export const createMapRegionInputSchema = z
	.object({
		mapId: idSchema,
		/** Explicit region id. Omitted ⇒ minted. Supplied when REPLAYING or UNDOING (the id must match). */
		id: idSchema.optional(),
		name: z.string().min(1, 'Region name is required'),
		bounds: mapRegionBoundsSchema,
		/** Make this the map's default region (the one it opens on). */
		makeDefault: z.boolean().default(false),
	})
	.strict();

export const updateMapRegionInputSchema = z
	.object({
		mapId: idSchema,
		regionId: idSchema,
		name: z.string().min(1).optional(),
		bounds: mapRegionBoundsSchema.optional(),
	})
	.strict()
	.refine((value) => value.name !== undefined || value.bounds !== undefined, {
		message: 'Provide at least one region field to update.',
	});

export const deleteMapRegionInputSchema = z
	.object({
		mapId: idSchema,
		regionId: idSchema,
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

// A fog-region SHAPE in normalized (0..1) map space: the original axis-aligned rectangle, a polygon
// (3..256 vertices), or a brush stroke (1..256 points swept by a disc of `radius`). A discriminated
// union so each shape validates exactly its own fields.
const fogRectRegionSchema = z
	.object({
		shape: z.literal('rect'),
		x: z.number().min(0).max(1),
		y: z.number().min(0).max(1),
		w: z.number().gt(0).max(1),
		h: z.number().gt(0).max(1),
	})
	.strict();

const fogPolygonRegionSchema = z
	.object({
		shape: z.literal('polygon'),
		points: z.array(normalizedPointSchema).min(3).max(256),
	})
	.strict();

const fogStrokeRegionSchema = z
	.object({
		shape: z.literal('stroke'),
		points: z.array(normalizedPointSchema).min(1).max(256),
		radius: z.number().min(0).max(0.5),
	})
	.strict();

/**
 * BACK-COMPAT (critical): fog ops persisted/replayed from BEFORE shaped regions carry a PLAIN
 * `{x,y,w,h}` rectangle with no `shape` tag. The preprocess step canonicalizes that legacy form to
 * `{shape:'rect',…}` BEFORE the union validates, so op-log replay of old `map.append-fog` payloads
 * still validates and composes identically to an explicit rect.
 */
const normalizedRegionSchema = z.preprocess(
	(value) => {
		if (
			typeof value === 'object' &&
			value !== null &&
			!Array.isArray(value) &&
			!('shape' in value) &&
			'x' in value &&
			'y' in value &&
			'w' in value &&
			'h' in value
		) {
			return { shape: 'rect', ...value };
		}
		return value;
	},
	z.discriminatedUnion('shape', [
		fogRectRegionSchema,
		fogPolygonRegionSchema,
		fogStrokeRegionSchema,
	]),
);

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

/**
 * MAP-021 — every map `create-*` command accepts an OPTIONAL explicit `id`. Omitted (the normal
 * authoring path) the id is minted from `env.ids()`. Supplied, the record is created WITH that id and a
 * collision is rejected fail-closed. This is what makes a create invertible: `buildMapInverse` runs
 * against the state BEFORE the command, so it cannot know an id the handler is about to mint — the
 * inverse of `map.delete-poi` must recreate the POI under its ORIGINAL id, and an undo/redo pair must
 * not mint a fresh id on every cycle. The editor supplies the id; the id never comes from a clock or
 * `Math.random`.
 */
export const createMapPoiInputSchema = z
	.object({
		mapId: idSchema,
		id: idSchema.optional(),
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

export const deleteMapPoiInputSchema = z.object({ mapId: idSchema, poiId: idSchema }).strict();

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
		id: idSchema.optional(),
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

export const deleteMapRouteInputSchema = z.object({ mapId: idSchema, routeId: idSchema }).strict();

// MAP-012 — fog reveal/conceal is an APPEND-ONLY durable op (a later op overrides an earlier overlap),
// so the op-log replays deterministically and syncs to player views. `connectionState` drives the
// delivery status (queued when offline) exactly like active-map projection.
export const appendMapFogInputSchema = z
	.object({
		mapId: idSchema,
		id: idSchema.optional(),
		layerId: idSchema,
		kind: z.enum(['reveal', 'conceal']),
		region: normalizedRegionSchema,
		/** Optional soft-edge feather width (0..0.2, normalized units) for the renderer. */
		feather: z.number().min(0).max(0.2).optional(),
		visibility: sceneVisibilitySchema.default('shared'),
		connectionState: z.enum(['connected', 'offline']).default('connected'),
	})
	.strict();

export const removeMapFogInputSchema = z.object({ mapId: idSchema, fogId: idSchema }).strict();

// MAP-019 — combat token lifecycle. A token records its linked actor, normalized position, size (grid
// cells), visibility, and optional controlling player (who may move it beyond the DM — MAP-019 AC4).
export const createMapTokenInputSchema = z
	.object({
		mapId: idSchema,
		id: idSchema.optional(),
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

export const deleteMapTokenInputSchema = z.object({ mapId: idSchema, tokenId: idSchema }).strict();

// MAP-021 — the durable LAYER-SET RESTORE: remove the named layers, upsert the supplied layer
// snapshots, re-apply an explicit order map, and do the same for the POIs a generation seeded. It exists
// because several map mutations are only exactly invertible at layer granularity (a generate created N
// layers AND planted POIs; a delete-layer destroyed a layer's whole content AND repacked every other
// layer's order), and `buildMapInverse` must return ONE command. It carries only the records it actually
// restores — never the whole map.
const mapLayerSnapshotSchema = z
	.object({
		id: idSchema,
		name: z.string().min(1),
		category: mapLayerCategorySchema,
		visibility: sceneVisibilitySchema,
		enabled: z.boolean(),
		opacity: z.number().min(0).max(1),
		tags: z.array(z.string().min(1)),
		query: z.record(z.string().min(1), z.string()),
		locked: z.boolean(),
		content: z.array(mapFeatureV2Schema),
		order: z.number().int().nonnegative(),
		revision: z.number().int().nonnegative(),
		updatedBy: z.union([z.literal(null), idSchema]),
		updatedAt: z.union([z.literal(null), z.string().min(1)]),
	})
	.strict();

/** A full POI record. A generation seeds real POIs alongside its layers, so undoing it must remove them. */
const mapPoiSnapshotSchema = z
	.object({
		id: idSchema,
		layerId: idSchema,
		label: z.string().min(1),
		category: mapPoiCategorySchema,
		position: normalizedPointSchema,
		visibility: sceneVisibilitySchema,
		notes: z.string(),
		linkedEntityType: z.union([z.literal(null), z.string().min(1)]),
		linkedEntityId: z.union([z.literal(null), idSchema]),
		revision: z.number().int().nonnegative(),
		updatedBy: z.union([z.literal(null), idSchema]),
		updatedAt: z.union([z.literal(null), z.string().min(1)]),
	})
	.strict();

export const restoreMapLayersInputSchema = z
	.object({
		mapId: idSchema,
		removeLayerIds: z.array(idSchema).default([]),
		restoreLayers: z.array(mapLayerSnapshotSchema).default([]),
		/**
		 * The POIs a generation seeded alongside its layers. A `map.generate` is ONE act — layers plus the
		 * POIs it planted — so its undo has to be one act too, or an undone dungeon leaves its entrance and
		 * boss-chamber markers floating on an empty map.
		 */
		removePoiIds: z.array(idSchema).default([]),
		restorePois: z.array(mapPoiSnapshotSchema).default([]),
		/** Explicit `layerId → order` map re-applied after the restore, so a repacked order is undone. */
		order: z
			.union([z.literal(null), z.record(z.string().min(1), z.number().int().nonnegative())])
			.default(null),
	})
	.strict()
	.refine(
		(value) =>
			value.removeLayerIds.length > 0 ||
			value.restoreLayers.length > 0 ||
			value.removePoiIds.length > 0 ||
			value.restorePois.length > 0,
		{ message: 'Provide at least one layer or POI to remove or restore.' },
	);

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

// PERM-011 (Co-DM) — assign a BASE ROLE to an existing participant actor. Owner-only (the DM);
// the reducer refuses to touch the owner's own row or to mint/settle a `dm` role (ownership moves
// only through `permission.transfer-ownership`). The assignable roles are the non-owner base roles.
// `coDmSeatLimit` is the caller's plan entitlement (co-DM seats): the reducer fails closed when
// promoting to `co-dm` would exceed it, so an over-seat promotion can never be replayed in.
export const assignRoleInputSchema = z
	.object({
		targetActorId: idSchema,
		role: z.enum(['co-dm', 'player', 'observer']),
		/** Plan entitlement for co-DM seats (0 on plans without them). Enforced only for `co-dm`. */
		coDmSeatLimit: z.number().int().nonnegative().default(0),
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
		value: z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string().min(1))]),
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

// SYNC-013 — the VAULT-WIDE, DM-authorized conflict resolution administrative command. It references
// the durable conflict record (any entity type), the ACTUAL source revisions being resolved (a stale
// pair is rejected fail-closed), an EXPLICIT selected value, and an OPTIONAL note. Resolution is itself
// a validated command that records the selected value + audit and produces a non-conflicted revision
// (Contract 2 Conflict Model rule 7). `selectedValue` accepts any JSON value: the conflicting payload
// for any entity type (character field, note frontmatter, etc.) is entity-agnostic.
export const resolveVaultConflictInputSchema = z
	.object({
		entityType: z.string().min(1),
		entityId: idSchema,
		conflictId: idSchema,
		selectedValue: z.unknown(),
		sourceLocalRevision: z.number().int().nonnegative(),
		sourceRemoteRevision: z.number().int().nonnegative(),
		notes: z.string().max(2000).optional(),
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
		.object({
			characterId: idSchema,
			kind: z.literal('temp-hp'),
			value: z.number().int().nonnegative(),
		})
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
		.object({
			characterId: idSchema,
			kind: z.literal('spell-slot'),
			level: z.number().int().min(0).max(9),
		})
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

// CHAR-008 — add/update a known spell and its prepared flag (owner-only). The optional DETAIL fields
// (SRD-style) are all-optional patches: an omitted field preserves the recorded detail.
export const setCharacterSpellInputSchema = z
	.object({
		characterId: idSchema,
		id: idSchema,
		name: z.string().min(1),
		level: z.number().int().min(0).max(9),
		prepared: z.boolean(),
		castingTime: z.string().min(1).optional(),
		range: z.string().min(1).optional(),
		components: z.string().min(1).optional(),
		duration: z.string().min(1).optional(),
		school: z.string().min(1).optional(),
	})
	.strict();

// --- Character sheet extensions — proficiencies / attacks / sharing ------------------------------

// Set a character's structured PROFICIENCY state (owner or DM). Every facet is an optional patch;
// `proficiencyBonus: null` means "derive from level" (the standard 5e progression — see
// `queries/character-query.ts`). `hitDice.spent` is clamped into `total` by the reducer.
export const setCharacterProficienciesInputSchema = z
	.object({
		characterId: idSchema,
		skills: z.record(z.string().min(1), z.enum(['none', 'proficient', 'expertise'])).optional(),
		saves: z.array(z.string().min(1)).optional(),
		proficiencyBonus: z.union([z.literal(null), z.number().int().min(0).max(20)]).optional(),
		hitDice: z
			.object({
				die: z.string().min(1),
				total: z.number().int().nonnegative(),
				spent: z.number().int().nonnegative(),
			})
			.strict()
			.optional(),
	})
	.strict()
	.refine(
		(value) =>
			value.skills !== undefined ||
			value.saves !== undefined ||
			value.proficiencyBonus !== undefined ||
			value.hitDice !== undefined,
		{ message: 'Provide at least one proficiency field to update.' },
	);

// REPLACE a character's attack list (post-create add/edit/remove — the GUI edits the list and submits
// the full replacement). Owner or DM. An entry without an id is a NEW attack (the handler assigns one).
export const updateCharacterAttacksInputSchema = z
	.object({
		characterId: idSchema,
		attacks: z.array(characterAttackInputSchema).max(50),
	})
	.strict();

// Set a character's SHARING (entity visibility + explicit `sharedWith` delivery list). DM-only —
// widening a character's audience is a DM authority (fail-closed visibility model, Contract 3).
export const setCharacterSharingInputSchema = z
	.object({
		characterId: idSchema,
		visibility: characterVisibilitySchema.optional(),
		sharedWith: z.array(idSchema).optional(),
	})
	.strict()
	.refine((value) => value.visibility !== undefined || value.sharedWith !== undefined, {
		message: 'Provide a visibility level and/or a sharedWith list.',
	});

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

// CHAR-011 / I10 S10.4.2 — add/update a party-inventory item. DM-only. Visibility fails closed to
// `dm-only`. Optional structured `quantity`/`weight` (S10.4.2) drive the stash encumbrance baseline.
export const upsertPartyInventoryItemInputSchema = z
	.object({
		id: idSchema.optional(),
		name: z.string().min(1, 'Item name is required'),
		detail: z.string().default(''),
		quantity: z.number().int().min(0).optional(),
		weight: z.number().min(0).optional(),
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

// --- I10 S10.1.3 / S10.4.2 — structured equipment / currency / encumbrance ----------------------

// The five 5e coin denominations. Every field optional so a currency command carries only the coins
// it changes (set replaces them; adjust applies signed deltas — see setCurrencyInputSchema).
const currencySetSchema = z
	.object({
		cp: z.number().int().min(0).optional(),
		sp: z.number().int().min(0).optional(),
		ep: z.number().int().min(0).optional(),
		gp: z.number().int().min(0).optional(),
		pp: z.number().int().min(0).optional(),
	})
	.strict();

const currencyAdjustSchema = z
	.object({
		cp: z.number().int().optional(),
		sp: z.number().int().optional(),
		ep: z.number().int().optional(),
		gp: z.number().int().optional(),
		pp: z.number().int().optional(),
	})
	.strict();

// Optional armor metadata: an equipped item with `armor` set contributes to the derived AC (S10.1.3).
const equipmentArmorSchema = z
	.object({
		category: z.enum(['light', 'medium', 'heavy', 'shield']),
		baseAc: z.number().int().min(0).max(40),
		addDex: z.boolean(),
		maxDexBonus: z.number().int().min(0).max(20).nullable(),
	})
	.strict();

// S10.1.3 — add/update an equipment item (owner or DM). No `id` ⇒ a NEW item (the handler assigns
// one); an id ⇒ PATCH the item in place (an omitted optional field preserves its value).
export const upsertEquipmentItemInputSchema = z
	.object({
		characterId: idSchema,
		id: idSchema.optional(),
		name: z.string().min(1, 'Item name is required').max(120),
		quantity: z.number().int().min(0).optional(),
		weight: z.number().min(0).optional(),
		equipped: z.boolean().optional(),
		attuned: z.boolean().optional(),
		vaultObjectId: idSchema.nullable().optional(),
		container: z.string().max(80).nullable().optional(),
		armor: equipmentArmorSchema.nullable().optional(),
		notes: z.string().max(500).optional(),
	})
	.strict();

// S10.1.3 — remove an equipment item (owner or DM).
export const removeEquipmentItemInputSchema = z
	.object({
		characterId: idSchema,
		itemId: idSchema,
	})
	.strict();

// S10.1.3 — move an equipment item to a container/slot (or `null` for loose). Owner or DM.
export const moveEquipmentItemInputSchema = z
	.object({
		characterId: idSchema,
		itemId: idSchema,
		container: z.string().max(80).nullable(),
	})
	.strict();

// S10.1.3 — set or adjust a character's coin purse (owner or DM). `set` replaces the supplied
// denominations; `adjust` applies signed deltas (fail-closed on insufficient funds). `consolidate`
// re-expresses the purse in the fewest coins afterwards.
export const setCurrencyInputSchema = z
	.object({
		characterId: idSchema,
		mode: z.enum(['set', 'adjust']).default('set'),
		currency: z.union([currencySetSchema, currencyAdjustSchema]).optional(),
		consolidate: z.boolean().optional(),
	})
	.strict()
	.refine((value) => value.currency !== undefined || value.consolidate === true, {
		message: 'Provide currency changes and/or consolidate.',
	});

// S10.4.2 — CLAIM an item from the shared party stash into a character's personal equipment. Any
// connected participant may do this for a character they may edit (owner or DM). The item leaves the
// stash and becomes an equipment line on the character.
export const claimPartyInventoryItemInputSchema = z
	.object({
		characterId: idSchema,
		itemId: idSchema,
		/** How many to claim; defaults to the whole stack. Fewer ⇒ the stash keeps the remainder. */
		quantity: z.number().int().min(1).optional(),
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
		(value) => value.title !== undefined || value.body !== undefined || value.kind !== undefined,
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
		/**
		 * CONTENT-001 AC5 — the revision the editor was working from. When supplied and stale (less than
		 * the current item revision), the command detects a concurrent edit and records a durable
		 * `content.item-conflict` op for DM resolution rather than silently clobbering the other editor's
		 * work. Omitting it skips the check (callers that do not need conflict detection may omit it).
		 */
		baseRevision: z.number().int().nonnegative().optional(),
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

// --- CONTENT-009 — granular visibility (section / field) -----------------------------------------

// CONTENT-009 — a single visibility RULE: a level + (only for `shared`) the explicit delivery list. The
// command/reducer coerce the level fail-closed and drop `sharedWith` for non-`shared` levels.
const visibilityRuleSchema = z
	.object({
		level: contentVisibilitySchema,
		sharedWith: z.array(idSchema).optional(),
	})
	.strict();

// CONTENT-009 — set (or clear, when `rule` is null) ONE SECTION's visibility override on a content item
// (authorized editor). Clearing re-inherits the entity default. `sectionId` names the section.
export const setContentSectionVisibilityInputSchema = z
	.object({
		itemId: idSchema,
		sectionId: idSchema,
		rule: visibilityRuleSchema.nullable(),
	})
	.strict();

// CONTENT-009 — set (or clear) ONE FIELD's visibility override on a content item (authorized editor).
// `fieldKey` is the bare structured-field key (addressed as `fields.<key>` internally). `sectionId`
// attributes the field to a section so a hidden section hides it (omit to leave attribution unchanged,
// `null` to clear it).
export const setContentFieldVisibilityInputSchema = z
	.object({
		itemId: idSchema,
		fieldKey: z.string().min(1, 'A field key is required'),
		rule: visibilityRuleSchema.nullable(),
		sectionId: idSchema.nullable().optional(),
	})
	.strict();

// --- CONTENT-010 — embeds (typed references, never copies) ---------------------------------------

const contentEmbedKindSchema = z.enum(['object-card', 'note-section', 'render-block']);

// CONTENT-010 — embed a TYPED REFERENCE to a target item in a host note (authorized editor). Stores only
// the target id + projection; a `note-section` embed requires a `sectionId`. The host never clones the
// target's data (validated by tests against the stored host content).
export const addContentEmbedInputSchema = z
	.object({
		hostItemId: idSchema,
		targetItemId: idSchema,
		kind: contentEmbedKindSchema,
		sectionId: idSchema.optional(),
	})
	.strict()
	.refine((value) => value.kind !== 'note-section' || value.sectionId !== undefined, {
		message: 'A note-section embed requires a sectionId.',
		path: ['sectionId'],
	});

// CONTENT-010 — remove an embed reference from a host (authorized editor). Never deletes the target.
export const removeContentEmbedInputSchema = z
	.object({
		hostItemId: idSchema,
		embedId: idSchema,
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
	'faction',
	'quest',
	'spell',
]);

// A USER-DEFINED (custom) object-type id: the reserved `custom:<slug>` namespace, distinct from every
// built-in subtype. The type's EXISTENCE is enforced at dispatch (it must resolve in the custom registry,
// else `object-schema-invalid`); this only admits the well-formed shape so an instance can name a custom type.
const customObjectTypeIdSchema = z.string().regex(CUSTOM_OBJECT_TYPE_ID_PATTERN);

// The subtype an instance names: a built-in subtype OR a well-formed custom type id (both flow through the
// same schema-validated create/update path).
const vaultObjectInstanceSubtypeSchema = z.union([
	vaultObjectSubtypeSchema,
	customObjectTypeIdSchema,
]);

// CONTENT-005 — create a structured Vault Object as a note-backed content item (DM-only authoring). The
// frontmatter `fields` are validated against the subtype schema at dispatch (fail closed); the body is the
// markdown prose. Visibility fails closed to the subtype default (dm-only) when omitted.
export const createVaultObjectInputSchema = z
	.object({
		subtype: vaultObjectInstanceSubtypeSchema,
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

// --- CONTENT-005 (custom types) — user-defined object types --------------------------------------

// One declared field of a custom object type. `type` is admitted as a string here and validated against the
// CLOSED field-kind set at dispatch (so the authoring UI gets a precise `unknown-field-kind` issue rather
// than an opaque zod enum error). Key/uniqueness/reserved-key checks also run in the state validator.
const customObjectFieldDraftSchema = z
	.object({
		key: z.string().min(1, 'A field key is required'),
		type: z.string().min(1, 'A field kind is required'),
		required: z.boolean().optional(),
		description: z.string().optional(),
		dmOnly: z.boolean().optional(),
	})
	.strict();

// CONTENT-005 — DEFINE a new user-defined object type (DM-only). The id must be a well-formed `custom:<slug>`
// (it can never collide with a built-in subtype); the full draft is structurally validated at dispatch and a
// define is refused fail-closed if a type already exists under the id.
export const defineCustomObjectTypeInputSchema = z
	.object({
		id: customObjectTypeIdSchema,
		label: z.string().min(1, 'A type label is required').max(CUSTOM_OBJECT_TYPE_MAX_LABEL),
		fields: z.array(customObjectFieldDraftSchema).max(CUSTOM_OBJECT_TYPE_MAX_FIELDS).default([]),
		defaultVisibility: contentVisibilitySchema.optional(),
	})
	.strict();

// CONTENT-005 — UPDATE an existing user-defined object type (DM-only). Replaces the label / field schema /
// default visibility of the type at `id`; the definition's revision is bumped and its createdAt/author are
// preserved. The target must already exist.
export const updateCustomObjectTypeInputSchema = z
	.object({
		id: customObjectTypeIdSchema,
		label: z.string().min(1, 'A type label is required').max(CUSTOM_OBJECT_TYPE_MAX_LABEL),
		fields: z.array(customObjectFieldDraftSchema).max(CUSTOM_OBJECT_TYPE_MAX_FIELDS).default([]),
		defaultVisibility: contentVisibilitySchema.optional(),
	})
	.strict();

// CONTENT-005 — DELETE a user-defined object type (DM-only). Refused fail-closed while any LIVE instance of
// the type still exists (never orphans an instance); the DM must remove the instances first.
export const deleteCustomObjectTypeInputSchema = z
	.object({
		id: customObjectTypeIdSchema,
	})
	.strict();

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
		/**
		 * Optional export SCOPE: item types to include — an item KIND (`note`/`object`) or a structured
		 * object SUBTYPE (`quest`, `faction`, …). Applied AFTER the visibility filter (narrows only,
		 * never widens visibility). Omitted ⇒ all types.
		 */
		itemTypes: z.array(z.string().min(1)).optional(),
		/** Optional export SCOPE: explicit item ids to include. Applied AFTER visibility (narrows only). */
		itemIds: z.array(idSchema).optional(),
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

// --- CONTENT-003 — create content from a TEMPLATE (variables, starter presets, validate-before-write) ---

// CONTENT-003 — create a note/object FROM A STARTER PRESET (DM-only authoring). The preset is rendered with
// the supplied variables and the GENERATED content is validated through the EXISTING pipeline BEFORE the
// write; a missing required variable or invalid generated content is rejected fail-closed (no write).
// `variables` maps declared variable names → string values. `visibility` is optional and fails closed to
// `dm-only`; a template can never silently widen visibility.
export const createFromTemplateInputSchema = z
	.object({
		presetId: z.string().min(1, 'A template preset id is required'),
		variables: z.record(z.string(), z.string()).default({}),
		visibility: contentVisibilitySchema.optional(),
		sharedWith: z.array(idSchema).default([]),
	})
	.strict();

// --- CONTENT-004 — insert a SNIPPET into a note (no bypass of validation/visibility/sanitization) ---

const snippetInsertPositionSchema = z.enum(['before', 'after', 'at-caret']);

// CONTENT-004 — insert a built-in snippet into an existing note (authorized editor). The snippet body is
// inserted into the note's body and the RESULT is validated through the EXISTING validator before the
// write; an invalid result is rejected fail-closed. The snippet carries NO visibility — the note's
// visibility is preserved (a snippet can never widen it). `caret` is the optional insertion offset.
export const insertSnippetInputSchema = z
	.object({
		itemId: idSchema,
		snippetId: z.string().min(1, 'A snippet id is required'),
		position: snippetInsertPositionSchema.default('after'),
		caret: z.number().int().min(0).optional(),
	})
	.strict();

// --- SES-002 — RUN COMBAT (initiative / rounds / turns / per-combatant resources / encounter log) ---

const combatantKindSchema = z.enum(['character', 'npc', 'monster']);

// SES-002 — one combatant row when starting combat (DM-run). For a character combatant the resources
// seed from the character's current combat block; `maxHp`/`ac`/`initiative` seed otherwise.
const startCombatantSchema = z
	.object({
		id: idSchema.optional(),
		kind: combatantKindSchema,
		name: z.string().min(1, 'A combatant name is required'),
		characterId: z.union([z.literal(null), idSchema]).optional(),
		ac: z.number().int().nonnegative().default(10),
		initiative: z.number().int().default(0),
		maxHp: z.number().int().nonnegative().default(0),
		hidden: z.boolean().default(false),
		placeholder: z.union([z.literal(null), z.string().min(1)]).optional(),
		notes: z.string().default(''),
	})
	.strict();

// SES-002 — start combat (roll initiative). Either an `encounterId` (SES-006 link by reference, whose
// combatant selection seeds the order) or an explicit `combatants` list, or both (the list overrides).
export const startCombatInputSchema = z
	.object({
		encounterId: z.union([z.literal(null), idSchema]).optional(),
		combatants: z.array(startCombatantSchema).default([]),
	})
	.strict();

// SES-002 — advance to the next turn (wraps to the next round). No payload fields needed.
export const advanceCombatTurnInputSchema = z.object({}).strict();

// UX-SES-006 — return to the previous turn (the undo for an accidental advance; wraps back to the
// last combatant of the previous round). No payload fields needed.
export const previousCombatTurnInputSchema = z.object({}).strict();

// SES-002 — apply a per-combatant resource DURING combat. Owner/combat-participant authority + the
// active-session gate are enforced in the handler (fail closed). Reuses the CHAR-007 resource kinds.
export const applyCombatResourceInputSchema = z.discriminatedUnion('kind', [
	z.object({ combatantId: idSchema, kind: z.literal('hp'), delta: z.number().int() }).strict(),
	z
		.object({
			combatantId: idSchema,
			kind: z.literal('temp-hp'),
			value: z.number().int().nonnegative(),
		})
		.strict(),
	z
		.object({
			combatantId: idSchema,
			kind: z.literal('condition'),
			condition: z.string().min(1),
			present: z.boolean(),
		})
		.strict(),
	z
		.object({
			combatantId: idSchema,
			kind: z.literal('death-save'),
			outcome: z.enum(['success', 'failure', 'reset']),
		})
		.strict(),
	z
		.object({
			combatantId: idSchema,
			kind: z.literal('concentration'),
			effect: z.union([z.literal(null), z.string().min(1)]),
		})
		.strict(),
	// UX-SES-005 — resolve the at-0-HP confirmation: `value: true` ⇒ "Yes — defeated" (the defeated
	// treatment applies while HP ≤ 0); `value: false` ⇒ "No — keep at 0" (dying, death saves active).
	z.object({ combatantId: idSchema, kind: z.literal('defeated'), value: z.boolean() }).strict(),
]);

// UX-SES-008 — add combatant(s) to RUNNING combat (DM-only). `quantity` > 1 is a MASS add: the rows
// are created as "[Name] 1" … "[Name] N" (max 20 per row). A blank initiative auto-rolls 1d20
// deterministically from the recorded operation id. `hidden` rows fail closed to the default
// "Unknown creature" placeholder so the player tracker shows a placeholder, never a gap that moves.
const addCombatantRowSchema = z
	.object({
		kind: combatantKindSchema,
		name: z.string().min(1, 'A combatant name is required'),
		characterId: z.union([z.literal(null), idSchema]).optional(),
		ac: z.number().int().nonnegative().default(10),
		/** Omitted/null ⇒ auto-roll 1d20 (recorded deterministically). */
		initiative: z.union([z.literal(null), z.number().int()]).optional(),
		maxHp: z.number().int().nonnegative().default(0),
		hidden: z.boolean().default(false),
		placeholder: z.union([z.literal(null), z.string().min(1)]).optional(),
		quantity: z.number().int().min(1).max(20).default(1),
	})
	.strict();

export const addCombatantsInputSchema = z
	.object({
		combatants: z.array(addCombatantRowSchema).min(1, 'Provide at least one combatant to add.'),
	})
	.strict();

// UX-SES-008 — remove a combatant from running combat (DM-only; the GUI confirms first). Not
// destructive to any linked character record.
export const removeCombatantInputSchema = z.object({ combatantId: idSchema }).strict();

// UX-SES-008 — move a combatant one position earlier/later in the initiative order (the explicit,
// keyboard-accessible reorder control). The active combatant stays active across the move.
export const reorderCombatantInputSchema = z
	.object({ combatantId: idSchema, direction: z.enum(['earlier', 'later']) })
	.strict();

// UX-SES-008 — toggle a combatant hidden/visible mid-combat. Hiding without a placeholder fails
// closed to "Unknown creature" so the player tracker renders a placeholder row, never the identity.
export const setCombatantVisibilityInputSchema = z
	.object({
		combatantId: idSchema,
		hidden: z.boolean(),
		placeholder: z.union([z.literal(null), z.string().min(1)]).optional(),
	})
	.strict();

// ── RC-MAP-1.1 — session combat TOKENS (place / move / remove) ──────────────────────────────────
// A token says where a combatant is standing while combat runs. Positions are NORMALIZED (0..1 on
// each axis), the same vector model every other map annotation uses — never pixels. `size` is the
// footprint in grid cells (1 = Medium). `facing` is degrees clockwise from north, and is optional
// because most creatures have no meaningful facing.
const normalizedAxisSchema = z.number().min(0).max(1);
const combatTokenSizeSchema = z.number().positive().max(20);
const combatTokenFacingSchema = z.number().min(0).lt(360);

export const placeCombatTokenInputSchema = z
	.object({
		combatantId: idSchema,
		mapId: idSchema,
		x: normalizedAxisSchema,
		y: normalizedAxisSchema,
		size: combatTokenSizeSchema.default(1),
		facing: combatTokenFacingSchema.optional(),
	})
	.strict();

// A MOVE only changes where the combatant stands (and optionally which way they face / how big their
// footprint is); the map is fixed by the placement. Moving a combatant to a different map is a
// re-placement, not a move, so `mapId` is deliberately absent here.
export const moveCombatTokenInputSchema = z
	.object({
		combatantId: idSchema,
		x: normalizedAxisSchema,
		y: normalizedAxisSchema,
		size: combatTokenSizeSchema.optional(),
		facing: z.union([z.literal(null), combatTokenFacingSchema]).optional(),
	})
	.strict();

export const removeCombatTokenInputSchema = z.object({ combatantId: idSchema }).strict();

// ── RC-MAP-1.2 — session combat AoE TEMPLATES (place / remove) ──────────────────────────────────
// A template is the shape an area of effect covers while combat runs. Its origin is NORMALIZED like
// every other map annotation; its SIZE is in TABLE UNITS (feet), because "20-foot radius" is what the
// spell says and what stays true at any zoom. `rotation` is degrees clockwise from north and is
// ignored for a sphere. `width` is a line's width and is meaningless on the other three shapes, so it
// is optional and defaults to 5 feet at the command layer.
const templateKindSchema = z.enum(['sphere', 'cone', 'line', 'cube']);
const templateSizeSchema = z.number().positive().max(1000);

export const placeCombatTemplateInputSchema = z
	.object({
		kind: templateKindSchema,
		mapId: idSchema,
		label: z.string().min(1).max(80),
		x: normalizedAxisSchema,
		y: normalizedAxisSchema,
		rotation: z.number().min(0).lt(360).default(0),
		size: templateSizeSchema,
		width: templateSizeSchema.optional(),
		sourceCombatantId: z.union([z.literal(null), idSchema]).optional(),
	})
	.strict();

export const removeCombatTemplateInputSchema = z.object({ templateId: idSchema }).strict();

// SES-002 — end combat, persisting the durable encounter log. Optional closing note.
export const endCombatInputSchema = z
	.object({
		note: z.string().optional(),
	})
	.strict();

// --- SES-006 — BUILD ENCOUNTERS (combatant selection / challenge guidance / terrain / loot / links) ---

const encounterCombatantSelectionSchema = z
	.object({
		id: idSchema.optional(),
		kind: combatantKindSchema,
		name: z.string().min(1, 'A combatant name is required'),
		characterId: z.union([z.literal(null), idSchema]).optional(),
		challengeRating: z.number().nonnegative().default(0),
		quantity: z.number().int().positive().default(1),
		maxHp: z.number().int().nonnegative().default(0),
		ac: z.number().int().nonnegative().default(10),
		initiative: z.number().int().default(0),
		hidden: z.boolean().default(false),
	})
	.strict();

const partyContextSchema = z
	.object({
		size: z.number().int().positive().default(4),
		averageLevel: z.number().int().min(1).max(20).default(1),
	})
	.strict();

const encounterSpecialActionSchema = z
	.object({
		id: idSchema.optional(),
		kind: z.enum(['legendary', 'lair']),
		name: z.string().min(1),
		detail: z.string().default(''),
	})
	.strict();

const encounterLootItemSchema = z
	.object({
		id: idSchema.optional(),
		name: z.string().min(1),
		detail: z.string().default(''),
	})
	.strict();

const sessionLogLinkSchema = z
	.object({
		id: idSchema.optional(),
		kind: z.enum(['note', 'encounter-log', 'session-log']),
		targetId: idSchema,
		label: z.string().default(''),
	})
	.strict();

// SES-006 — build a durable encounter (DM-only). Combatant selection + party context drive the
// deterministic challenge guidance; session-log links are references (target ids only).
export const buildEncounterInputSchema = z
	.object({
		title: z.string().min(1, 'An encounter title is required'),
		combatants: z.array(encounterCombatantSelectionSchema).default([]),
		party: partyContextSchema.optional(),
		terrainNotes: z.string().default(''),
		specialActions: z.array(encounterSpecialActionSchema).default([]),
		loot: z.array(encounterLootItemSchema).default([]),
		sessionLogLinks: z.array(sessionLogLinkSchema).default([]),
	})
	.strict();

// SES-006 — update an existing encounter (DM-only). All build facets are optional patches.
export const updateEncounterInputSchema = z
	.object({
		encounterId: idSchema,
		title: z.string().min(1).optional(),
		combatants: z
			.array(
				encounterCombatantSelectionSchema.extend({
					id: idSchema,
					challengeRating: z.number().nonnegative(),
					quantity: z.number().int().positive(),
					maxHp: z.number().int().nonnegative(),
					ac: z.number().int().nonnegative(),
					initiative: z.number().int(),
					characterId: z.union([z.literal(null), idSchema]),
					hidden: z.boolean(),
				}),
			)
			.optional(),
		party: partyContextSchema.optional(),
		terrainNotes: z.string().optional(),
		specialActions: z
			.array(encounterSpecialActionSchema.extend({ id: idSchema, detail: z.string() }))
			.optional(),
		loot: z.array(encounterLootItemSchema.extend({ id: idSchema, detail: z.string() })).optional(),
		sessionLogLinks: z
			.array(sessionLogLinkSchema.extend({ id: idSchema, label: z.string() }))
			.optional(),
	})
	.strict();

// --- SES-012 — campaign calendar continuity ------------------------------------------------------

// SES-012 — set the CAMPAIGN CURRENT DATE in campaign-calendar terms. The date is validated against its
// referenced calendar definition at dispatch (it must be a real date in that calendar); the canonical
// stable rendering is derived by the CONTENT-011 formatter at read time (never stored as a string).
export const setCampaignDateInputSchema = z
	.object({
		date: customDateSchema,
	})
	.strict();

// SES-012 — kind of entity a calendar link references. Each resolves through the matching actor-filtered
// read at link-resolution time (a hidden/deleted target degrades to unavailable — no leak).
const calendarLinkKindSchema = z.enum(['note', 'session', 'map', 'event', 'handout']);

// SES-012 — LINK a campaign date to a target (note/session/map/event/handout) BY REFERENCE (DM-only). The
// link stores ONLY the reference (kind + target id) + the anchoring date + a label — never a content copy.
// A `session`/`event` link MAY omit `targetId` (a bare dated marker). The date is validated against its
// calendar at dispatch.
export const linkCalendarDateInputSchema = z
	.object({
		kind: calendarLinkKindSchema,
		label: z.string().min(1, 'A calendar link needs a label.'),
		date: customDateSchema,
		/** The referenced target id. `note`/`map`/`event`/`handout` require it; `session`/`event` may omit. */
		targetId: z.union([z.literal(null), idSchema]).default(null),
	})
	.strict();

// SES-012 — remove a calendar link by id (DM-only).
export const unlinkCalendarDateInputSchema = z
	.object({
		linkId: idSchema,
	})
	.strict();

// --- SRCH-003 / SRCH-004 — search filters + saved searches ---------------------------------------

// SRCH-003 — the searchable SOURCEs and CONTENT TYPEs (the facet enums). An unknown value in a list is
// pruned by `normalizeSearchFilter` (the reducer never widens a search from a malformed facet list).
const searchSourceSchema = z.enum(['local-markdown', 'obsidian', 'google-docs']);
const searchContentTypeSchema = z.enum(['note', 'object', 'poi']);

// SRCH-003 — the inclusive custom-date RANGE facet. Either bound may be open (`null`); both, when present,
// are interpreted in `calendarId`. The bounds reuse the CONTENT-011 `customDateSchema` value shape.
const searchDateRangeSchema = z
	.object({
		calendarId: idSchema,
		from: z.union([z.literal(null), customDateSchema]).default(null),
		to: z.union([z.literal(null), customDateSchema]).default(null),
	})
	.strict();

// SRCH-003 — the VISIBILITY-SAFE RELATIONSHIP facet. Anchors results to artifacts related to one entity
// (a content item or a POI). The relationship is resolved over the actor's VISIBLE graph only at read time.
const searchRelationshipSchema = z
	.object({
		anchorKind: z.enum(['content', 'poi']),
		anchorId: idSchema,
	})
	.strict();

// SRCH-003 — the full FACETED SEARCH FILTER. EVERY facet is optional; an empty filter matches all visible
// artifacts. The reducer normalizes this (trims/dedupes/prunes) into the canonical shape it persists/runs.
export const searchFilterSchema = z
	.object({
		query: z.string().optional(),
		sources: z.array(searchSourceSchema).optional(),
		contentTypes: z.array(searchContentTypeSchema).optional(),
		tags: z.array(z.string()).optional(),
		folder: z.string().optional(),
		dateRange: searchDateRangeSchema.optional(),
		relationship: searchRelationshipSchema.optional(),
	})
	.strict();

// SRCH-004 — CREATE a saved search (DM-only). Visibility fails closed to `dm-only` so DM-only criteria are
// never exposed to players (SRCH-004 AC2). `searchId` is optional (idempotent create / reuse an id).
export const createSavedSearchInputSchema = z
	.object({
		searchId: idSchema.optional(),
		name: z.string().min(1, 'A saved search needs a name.'),
		filter: searchFilterSchema.default({}),
		visibility: contentVisibilitySchema.default('dm-only'),
		sharedWith: z.array(idSchema).default([]),
		pinned: z.boolean().default(false),
	})
	.strict();

// SRCH-004 — UPDATE a saved search (DM-only). Every field is an optional patch; omit to leave unchanged.
export const updateSavedSearchInputSchema = z
	.object({
		searchId: idSchema,
		name: z.string().min(1).optional(),
		filter: searchFilterSchema.optional(),
		visibility: contentVisibilitySchema.optional(),
		sharedWith: z.array(idSchema).optional(),
		pinned: z.boolean().optional(),
	})
	.strict();

// SRCH-004 — PIN / UNPIN a saved search to the Command Center (DM-only). A focused command so the pin
// state is an explicit, auditable change (SRCH-004 AC1).
export const pinSavedSearchInputSchema = z
	.object({
		searchId: idSchema,
		pinned: z.boolean(),
	})
	.strict();

// SRCH-004 — DELETE a saved search by id (DM-only).
export const deleteSavedSearchInputSchema = z
	.object({
		searchId: idSchema,
	})
	.strict();

// AUDIO-004 — license metadata for an imported/updated audio asset. The kind is a CLOSED enum (never free
// text) so the licensing gate fails closed; the note/attribution are verbatim free text (preserved, never
// fabricated). An omitted kind leaves the asset `unknown` (flagged for review).
const audioLicenseSchema = z
	.object({
		kind: z
			.enum(['unknown', 'owned', 'cc0', 'cc-by', 'royalty-free', 'licensed', 'restricted'])
			.optional(),
		licenseNote: z.string().optional(),
		attribution: z.string().optional(),
	})
	.strict();

// AUDIO-004 — IMPORT a local audio asset into the library. `bytes` are validated + content-hashed in the
// handler; an empty/oversized/non-native-MIME file is rejected fail-closed before any write. The license
// defaults to `unknown` (review gate armed) when omitted.
export const importAudioAssetInputSchema = z
	.object({
		sourceId: idSchema,
		bytes: importAssetBytesSchema,
		mimeType: z.string().min(1),
		fileName: z.string().min(1),
		title: z.string().optional(),
		license: audioLicenseSchema.optional(),
		tags: z.array(z.string()).optional(),
		maxBytes: z.number().int().positive().optional(),
	})
	.strict();

// AUDIO-004 — UPDATE an existing asset's license/tags/title metadata (DM-only). Bytes/hash are immutable
// (content-addressed); only the authored metadata changes. Every field is an optional patch.
export const updateAudioAssetMetadataInputSchema = z
	.object({
		assetId: idSchema,
		title: z.string().optional(),
		license: audioLicenseSchema.optional(),
		tags: z.array(z.string()).optional(),
	})
	.strict();

// AUDIO-009 / AUDIO-010 — CONFIGURE (create or update) an audio source. An UNSUPPORTED type is rejected
// fail-closed in the handler (no source record, no playback state). The cache behavior is the AUDIO-010
// prerequisite: omitting it leaves playback DISABLED until declared.
export const configureAudioSourceInputSchema = z
	.object({
		sourceId: idSchema.optional(),
		type: z.string().min(1),
		displayName: z.string().min(1),
		url: z.union([z.literal(null), z.string().min(1)]).optional(),
		cacheBehavior: z.enum(['local', 'cache-required', 'none', 'undeclared']).optional(),
		licenseNote: z.string().optional(),
	})
	.strict();

// AUDIO-011 — one Scene audio PRESET reference inside a package (a track by asset id and/or source id,
// plus an optional pinned device-local output route). References only — never asset bytes (Contract 4).
const audioPackagePresetSchema = z
	.object({
		id: idSchema,
		label: z.string().min(1),
		assetId: z.union([z.literal(null), idSchema]).default(null),
		sourceId: z.union([z.literal(null), idSchema]).default(null),
		outputRouteId: z.union([z.literal(null), z.string().min(1)]).default(null),
	})
	.strict();

// AUDIO-011 — VALIDATE a Scene audio package for an import/export commit. The handler runs the fail-closed
// validation; a package with any BLOCKING finding (missing asset/license, unsupported stream) is reported
// and refused before commit.
export const validateAudioPackageInputSchema = z
	.object({
		direction: z.enum(['import', 'export']),
		presets: z.array(audioPackagePresetSchema),
	})
	.strict();

// AUDIO-005 — CONFIGURE (create or update) an atmosphere AUTOMATION RULE (DM-only). The trigger + action
// are CLOSED enums (an undeclared trigger/action is rejected fail-closed in the handler); the referenced
// source/asset must exist in the library (fail closed). `triggerScopeId` null ⇒ fires for any occurrence
// of the trigger kind; an asset is required for a local/bundled play (validated in the handler).
export const configureAudioAutomationInputSchema = z
	.object({
		ruleId: idSchema.optional(),
		label: z.string().optional(),
		enabled: z.boolean().optional(),
		trigger: z.enum(['combat-start', 'map-reveal', 'scene-activation', 'handout-delivery']),
		triggerScopeId: z.union([z.literal(null), z.string().min(1)]).optional(),
		action: z.enum(['play', 'crossfade', 'stop']),
		sourceId: idSchema,
		assetId: z.union([z.literal(null), idSchema]).optional(),
	})
	.strict();

// AUDIO-005 — DELETE an automation rule by id (DM-only). Fail closed: a missing rule id is rejected.
export const deleteAudioAutomationInputSchema = z
	.object({
		ruleId: idSchema,
	})
	.strict();

// AUDIO-001 — ASSOCIATE (create or update) a SCENE / MAP / MAP-LAYER audio cue (DM-only). The target kind +
// preset kind are CLOSED enums; the referenced source/asset must exist in the library (fail closed in the
// handler). A `map-layer` association MUST carry a `layerId`; a scene/map association must NOT (validated in
// the handler). A local/bundled cue requires an asset; a web-stream cue may omit it (the stream is the track).
export const associateSceneAudioInputSchema = z
	.object({
		associationId: idSchema.optional(),
		label: z.string().optional(),
		presetKind: z.enum(['ambient', 'playlist', 'preset']).optional(),
		targetKind: z.enum(['scene', 'map', 'map-layer']),
		targetId: idSchema,
		layerId: z.union([z.literal(null), z.string().min(1)]).optional(),
		sourceId: idSchema,
		assetId: z.union([z.literal(null), idSchema]).optional(),
	})
	.strict();

// AUDIO-001 — DISASSOCIATE (remove) an audio association by id (DM-only). Fail closed: a missing id is rejected.
export const disassociateSceneAudioInputSchema = z
	.object({
		associationId: idSchema,
	})
	.strict();

// AUDIO-002 / AUDIO-003 — PLAY (or crossfade into) a track on the SESSION-OWNED audio playback state
// (DM-only). The source/asset is validated through the existing AUDIO-009/010/004 gates in the handler; an
// out-of-scope/offline/unlicensed track is rejected and NO playback state is created (fail closed). The
// per-device availability inputs let the handler reuse the offline gate without any network I/O. The
// authoritative session volume defaults to full; crossfade defaults to an immediate cut.
export const playSessionAudioInputSchema = z
	.object({
		sourceId: idSchema,
		assetId: z.union([z.literal(null), idSchema]).optional(),
		volume: z.number().min(0).max(1).optional(),
		crossfadeSeconds: z.number().min(0).optional(),
		assetLocallyAvailable: z.boolean().optional(),
		assetCached: z.boolean().optional(),
		cacheEvicted: z.boolean().optional(),
		online: z.boolean().optional(),
	})
	.strict();

// AUDIO-002 — set the AUTHORITATIVE session volume (0..1) on the active track (DM-only). This is the SESSION
// volume, never a participant's device-local volume (AUDIO-002 AC3). Fail closed: rejected when no track.
export const setSessionAudioVolumeInputSchema = z
	.object({
		volume: z.number().min(0).max(1),
	})
	.strict();

// AUDIO-002 / AUDIO-003 — project the session's active audio to players (DM-only). An offline participant's
// projection is marked `queued` (undelivered) rather than blocking local playback (AUDIO-003 AC3).
export const projectSessionAudioInputSchema = z
	.object({
		playerActorIds: z.array(idSchema),
		connectionState: z.enum(['connected', 'offline']),
	})
	.strict();

// Set (create/update) one AMBIENCE LAYER on the session-owned audio state (DM-only) — a secondary
// looping bed mixed under the primary track. References a configured source BY ID (validated through
// the AUDIO-009/010 gates in the handler, fail closed). Mirrors `session.audio.set-volume`.
export const setAmbienceLayerInputSchema = z
	.object({
		layerId: idSchema,
		sourceId: idSchema,
		volume: z.number().min(0).max(1).default(1),
		muted: z.boolean().default(false),
	})
	.strict();

// Remove an ambience layer by id (DM-only). Fail closed: an unknown layer id is rejected.
export const removeAmbienceLayerInputSchema = z
	.object({
		layerId: idSchema,
	})
	.strict();

// Record the DM-selected audio OUTPUT DEVICE for the session host (DM-only). `deviceId: null` selects
// the platform default. The label is display-only (e.g. "USB speakers"); per-participant routing stays
// device-local in the degradation model (`audio-degradation.ts`).
export const setAudioOutputDeviceInputSchema = z
	.object({
		deviceId: z.union([z.literal(null), z.string().min(1)]),
		label: z.string().min(1).optional(),
	})
	.strict();

// AUDIO-014 (Epic 11.3) — APPLY an audio PRESET / scene package to the SESSION-OWNED audio (DM-only). The
// preset id resolves to a built-in library preset OR a user preset; the handler drives the SAME session
// audio model (primary track + ambience layers) through the EXISTING AUDIO-009/010/004 gates, fail closed —
// only a layer bound to a ready, licensed, available source becomes audible (never a guessed track). The
// optional device inputs feed the AUDIO-010 availability gate (default online + locally available).
export const applyAudioPresetInputSchema = z
	.object({
		presetId: idSchema,
		assetLocallyAvailable: z.boolean().optional(),
		assetCached: z.boolean().optional(),
		cacheEvicted: z.boolean().optional(),
		online: z.boolean().optional(),
	})
	.strict();

// AUDIO-014 (Epic 11.3) — SAVE the CURRENT session audio (primary track + ambience layers) as a named,
// categorized USER preset / scene package (DM-only). `presetId` optional: absent creates a new preset;
// present UPDATES an existing user preset (a built-in id is refused). The category is validated by the
// fail-closed `buildAudioPreset` builder (an undeclared category is rejected), never here.
export const saveAudioPresetInputSchema = z
	.object({
		name: z.string().min(1).max(120),
		category: z.string().min(1),
		presetId: idSchema.optional(),
	})
	.strict();

// AUDIO-014 (Epic 11.3) — DELETE a USER audio preset / scene package by id (DM-only). Fail closed: a
// built-in preset id is refused (shipped code, non-deletable — copy to customize) and an unknown id is
// rejected (nothing to remove).
export const deleteAudioPresetInputSchema = z
	.object({
		presetId: idSchema,
	})
	.strict();

// SES-009 — AUTHOR a recap onto a session archive (DM-only). `archiveId` optional: absent targets the
// session's current `recapArchiveId` (the most recent archive). Fail closed when no archive resolves.
export const authorRecapInputSchema = z
	.object({
		archiveId: idSchema.optional(),
		markdown: z.string().max(100_000),
	})
	.strict();

// Set (or clear) THIS actor's ephemeral session PRESENCE (COLLAB-004). A player may set ONLY their
// own presence; the DM may additionally CLEAR another participant's stale entry by naming
// `targetActorId` with `status: 'offline'`. Presence is EPHEMERAL: the handler never appends a
// durable op, and the host resets presence on session start/end.
export const setPresenceInputSchema = z
	.object({
		status: z.enum(['online', 'away', 'offline']).default('online'),
		device: z.enum(['desktop', 'tablet', 'mobile', 'web', 'unknown']).default('unknown'),
		activeSceneId: idSchema.optional(),
		cursor: z
			.object({
				sceneId: idSchema,
				widgetInstanceId: idSchema.optional(),
				x: z.number().finite(),
				y: z.number().finite(),
			})
			.strict()
			.optional(),
		selection: z
			.object({
				sceneId: idSchema,
				widgetInstanceIds: z.array(idSchema),
			})
			.strict()
			.optional(),
		/** DM-only: the participant whose presence to CLEAR (requires `status: 'offline'`). */
		targetActorId: idSchema.optional(),
	})
	.strict();

// SWITCH the active campaign SYSTEM PACKAGE (DM-only). The handler re-runs the pure dry-run
// (`queries/system-switch-query.ts`) and FAILS CLOSED when the vault cannot migrate or the switch
// would DROP widget content, unless the DM explicitly acknowledged the loss.
export const switchSystemPackageInputSchema = z
	.object({
		packageId: idSchema,
		/** Explicit acknowledgment of the dry-run's destructive findings (required when any exist). */
		acknowledgeLoss: z.boolean().default(false),
	})
	.strict();

// ---------------------------------------------------------------------------------------------------
// MCP-003 / MCP-009 / MCP-011 — MCP IDENTITY, POLICY, and STAGED-WRITE command inputs. Every one of these
// is a DM-only administrative command; the handler re-checks DM authority. These schemas validate ONLY the
// command input shape — the staged-write commit re-validates the underlying tool payload at approval time.
// ---------------------------------------------------------------------------------------------------

const mcpPolicyModeSchema = z.enum(['disabled', 'strict_review', 'balanced', 'trusted_direct']);

// MCP-001 — flip the vault-wide MASTER ENABLE switch. Enabling is an EXPLICIT DM action (the integration is
// off by default); disabling cleanly removes all agent capability. The single boolean carries no other
// policy — per-agent modes/allowlists are unchanged, but no tool resolves while the master switch is off.
export const setMcpEnabledInputSchema = z
	.object({
		enabled: z.boolean(),
	})
	.strict();

// MCP-011 — bind an MCP agent CONNECTION to a SCOPED registered actor. The bound actor must exist (the
// handler rejects an unknown actor fail-closed). A binding confers no capability; it only names whose
// view the agent speaks as. The label is a DM-facing description.
export const setMcpAgentBindingInputSchema = z
	.object({
		agentId: idSchema,
		actorId: idSchema,
		label: z.string().default(''),
	})
	.strict();

// MCP-011 — remove an agent binding (the agent can no longer resolve to an actor, so every later tool call
// is denied fail-closed). Any of the agent's still-pending proposals are expired by the handler.
export const removeMcpAgentBindingInputSchema = z
	.object({
		agentId: idSchema,
	})
	.strict();

// MCP-009 — configure a per-agent POLICY: the mode, the explicit tool allowlist (empty ⇒ deny all), and
// whether the agent's writes appear in audit history. An unknown mode is rejected by the enum (fail closed).
export const setMcpAgentPolicyInputSchema = z
	.object({
		agentId: idSchema,
		mode: mcpPolicyModeSchema,
		allowedToolIds: z.array(idSchema).default([]),
		auditVisible: z.boolean().default(true),
	})
	.strict();

// MCP-009 — set the vault-wide DEFAULT posture a never-configured agent inherits. Restricted to the two
// SAFE defaults the requirement names (`strict_review` or `disabled`) — never `balanced`/`trusted_direct`.
export const setMcpVaultDefaultInputSchema = z
	.object({
		mode: z.enum(['strict_review', 'disabled']),
	})
	.strict();

// MCP-003 — approve a staged write proposal. The handler RE-VALIDATES authority + schema and commits the
// captured command through the EXISTING authorized dispatch (a grant revoked since staging blocks it). An
// optional idempotency key is forwarded to the dispatch (idempotent commit; a double-approve is rejected).
export const approveMcpProposalInputSchema = z
	.object({
		proposalId: idSchema,
		idempotencyKey: z.string().min(1).optional(),
	})
	.strict();

// MCP-003 — reject a staged write proposal. No durable mutation occurs; the proposal becomes terminal so it
// can never be approved later (fail closed).
export const rejectMcpProposalInputSchema = z
	.object({
		proposalId: idSchema,
	})
	.strict();

// ---------------------------------------------------------------------------------------------------
// RC-SYS-1.3 — SYSTEM PACKAGE command inputs (append-only block).
//
// The rules system a campaign plays is DM-authored durable state, so every one of these is DM-only and
// every one validates FAIL-CLOSED: the package body is the same `.strict()` `systemPackageSchema` the
// slice persists, so a package that could not be stored can never be defined either. The `custom:` id
// namespace (ADR-023) is enforced in the handler, where the rejection can name the built-in it would
// have shadowed.
// ---------------------------------------------------------------------------------------------------

// SELECT the active rules system. `acknowledgeLoss` is the DM's explicit answer to the
// `previewSystemPackageSelect` dry-run and is REQUIRED whenever the dry-run reports drops with
// characters behind them — a system change never silently strands character data.
export const selectSystemPackageInputSchema = z
	.object({
		packageId: idSchema,
		acknowledgeLoss: z.boolean().default(false),
	})
	.strict();

// DEFINE a new DM-authored system package. The whole package arrives at once (there is no partial
// draft state in the slice); its id must be in the `custom:` namespace and must not already exist.
export const defineSystemPackageInputSchema = z
	.object({
		package: systemPackageSchema,
	})
	.strict();

// UPDATE an existing DM-authored package, whole-body. `packageId` is carried separately from the body
// so a rename attempt is a rejection rather than a silent second package.
export const updateSystemPackageInputSchema = z
	.object({
		packageId: idSchema,
		package: systemPackageSchema,
	})
	.strict();

// DELETE a DM-authored package. Refused while it is active, and refused while any character carries a
// resource it defines (the handler explains which) — a delete never orphans character data.
export const deleteSystemPackageInputSchema = z
	.object({
		packageId: idSchema,
	})
	.strict();

// FORK any installed package (built-in included) into a new DM-authored copy. `packageId` is optional:
// omitted, the handler mints one in the `custom:` namespace from the environment's id generator, so a
// fork is deterministic under replay.
export const forkSystemPackageInputSchema = z
	.object({
		sourcePackageId: idSchema,
		packageId: idSchema.optional(),
		displayName: z.string().min(1).max(120).optional(),
	})
	.strict();

// --- RC-SYS-2.2 — package-driven resources ------------------------------------------------------

// End-of-scene recovery: clears every resource the active package recovers on `scene` (owner or DM).
export const recoverSceneInputSchema = z
	.object({
		characterId: idSchema,
	})
	.strict();

// Add a resource the ACTIVE system package declares, at the maximum its formula gives (owner or DM).
export const addSystemResourceInputSchema = z
	.object({
		characterId: idSchema,
		key: z.string().min(1).max(80),
	})
	.strict();

// --- RC-WID-1.5 — WIDGET PACKAGE TRUST REVIEW (append-only block) -------------------------------

// The DM's trust decision for an installed widget package. `hostPermissions` carries ONE decision
// per permission the package requests; a permission left out stays at its current (installed =
// denied) decision, so an omission can never widen access. `trustState` is the package-level
// verdict, and `acknowledgeRecommendation` is the explicit override the handler demands before a
// package the review summary recommends denying can be trusted.
export const reviewWidgetPackageInputSchema = z
	.object({
		packageId: idSchema,
		trustState: z.enum(['trusted', 'denied']),
		hostPermissions: z
			.partialRecord(
				z.enum(['filesystem', 'clipboard', 'network', 'source-adapter', 'asset', 'external-link']),
				z.enum(['approved', 'denied']),
			)
			.default({}),
		acknowledgeRecommendation: z.boolean().default(false),
		note: z.string().max(500).optional(),
	})
	.strict();

// --- RC-CAN-1.2 — RESTORE A DESTROYED WIDGET (append-only block) --------------------------------

// Put a destroyed widget instance back on its scene from its tombstone. Addressed by the instance id
// the destroy left behind, so an undo restores the SAME widget (identity, layout, config, binding),
// never a fresh copy.
export const restoreWidgetInputSchema = z
	.object({
		sceneId: idSchema,
		widgetInstanceId: idSchema,
	})
	.strict();

// --- RC-MAP-1.4 — MARK THE PARTY'S ATLAS LOCATION (append-only block) ---------------------------

// Set where the party currently stands: one map + a normalized (0..1) position on it, matching the
// combat-token placement convention (`placeCombatTokenInputSchema`).
export const markPartyInputSchema = z
	.object({
		mapId: idSchema,
		x: z.number().min(0).max(1),
		y: z.number().min(0).max(1),
	})
	.strict();

// --- RC-AI-2.2 — RESOLVE A STAGED WRITE'S THREE-WAY CONFLICT (append-only block) --------------------
// The DM picks ONE side of a diverged note rewrite. The merged text is NOT accepted from the caller:
// the handler recomputes it from the Core's own three-way record, so a client can never smuggle prose
// into the vault under the guise of "the merge" — the same reason approval re-dispatches the captured
// payload rather than a client-supplied one.
export const resolveMcpProposalConflictInputSchema = z
	.object({
		proposalId: idSchema,
		resolution: z.enum(['keep-ai', 'keep-mine', 'merge']),
	})
	.strict();
