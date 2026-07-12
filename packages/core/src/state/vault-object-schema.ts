import { CHARACTER_STATE_SCHEMA_VERSION } from './character-state';
import { MAP_STATE_SCHEMA_VERSION } from './map-state';
import { CALENDAR_SCHEMA_VERSION } from './calendar';
import { SCENE_STATE_SCHEMA_VERSION } from './scene-state';
import type { VisibilityLevel } from '../permissions/visibility-filter';

/**
 * CONTENT-013 — the core VAULT OBJECT SUBTYPE SCHEMA REGISTRY (a typed catalog, not a new storage model).
 *
 * A Vault Object is a NOTE-BACKED record (`ContentItem` with `kind: 'object'`): the same note + frontmatter
 * substrate the rest of CONTENT already uses (`state/content.ts`, `state/markdown.ts`). This module adds the
 * TYPED SUBTYPE CATALOG over that substrate. It is deliberately a REGISTRY that REFERENCES the models v2 has
 * already built, NOT a re-implementation:
 *
 *   - `character` REFERENCES the CHARACTER model (`state/character-state.ts`) by its entity type +
 *     schema version. Its full sheet lives in `CharacterState`; the object subtype only declares the
 *     note-backed frontmatter contract + a pointer to that model.
 *   - `map` REFERENCES the MAP model (`state/map-state.ts`) the same way.
 *   - `calendar-event` / `timeline-event` REFERENCE the CALENDAR model (`state/calendar.ts`): a dated note
 *     anchored to a campaign calendar definition.
 *   - `note` is the free-form base (no extra required fields beyond the common envelope).
 *   - `handout`, `dice-table`, `encounter`, `audio-preset`, `widget-package-ref`, and `faction` declare a
 *     frontmatter schema entry whose FULL feature model is deferred to its own later epic; this registry
 *     gives each a stable, validated frontmatter contract today so a note authored as that subtype is never
 *     silently mis-parsed.
 *
 * CRITICAL — SCENE IS NOT A VAULT OBJECT (Contract 4). A Scene is the spatial workspace and its state lives
 * in `SceneState`; it is validated through Scene rules, never as a note-backed object subtype. This module
 * NEVER registers a `scene` subtype. {@link isSceneEntityType} is exported so a caller can assert that a
 * Scene routed here is rejected and sent back to `SceneState`. `widget-package-ref` is a REFERENCE to a
 * widget package (a content pointer), distinct from the Scene/widget runtime state — it does not migrate
 * Scene state into the object model.
 *
 * Pure data + pure functions. No GUI, no storage, no clock. The validator (`state/vault-object.ts`) and the
 * actor-filtered projection compose this; the command layer enforces it before any durable write.
 */

export const VAULT_OBJECT_SCHEMA_REGISTRY_VERSION = 1 as const;

/**
 * The v2 Vault Object SUBTYPES: the ten initial subtypes required by CONTENT-013, plus `faction` (added for
 * the Campaign faction dossier surface — same note-backed contract, no new storage model). Scene is
 * intentionally ABSENT — it is not a note-backed object subtype (Contract 4).
 */
export type VaultObjectSubtype =
	| 'note'
	| 'character'
	| 'map'
	| 'handout'
	| 'calendar-event'
	| 'timeline-event'
	| 'dice-table'
	| 'encounter'
	| 'audio-preset'
	| 'widget-package-ref'
	| 'faction'
	| 'quest'
	| 'spell';

export const VAULT_OBJECT_SUBTYPES: readonly VaultObjectSubtype[] = [
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
] as const;

/**
 * The scalar/structural type of one declared frontmatter field. Deliberately a small, deterministic set
 * (mirrors the widget-data-schema field kinds the rest of v2 uses) — not a full type system.
 */
export type VaultObjectFieldType =
	| 'string'
	| 'number'
	| 'boolean'
	| 'string-array'
	| 'object'
	// An array of plain objects (e.g. quest objectives `{id, text, done}[]`). Serialized to
	// frontmatter as JSON entries; validated entry-by-entry as non-null, non-array objects.
	| 'object-array';

/**
 * The CLOSED set of declared field kinds, in stable order. The one source of truth the validator,
 * the command schemas, and the CUSTOM object-type authoring path all check against — an unknown kind
 * is rejected fail-closed (a custom type can never declare a field of a kind the projection/sync path
 * does not understand).
 */
export const VAULT_OBJECT_FIELD_TYPES: readonly VaultObjectFieldType[] = [
	'string',
	'number',
	'boolean',
	'string-array',
	'object',
	'object-array',
] as const;

/** Whether a string is one of the closed, understood field kinds (fail closed). */
export function isVaultObjectFieldType(value: string): value is VaultObjectFieldType {
	return (VAULT_OBJECT_FIELD_TYPES as readonly string[]).includes(value);
}

/** One declared frontmatter field of a subtype. */
export interface VaultObjectFieldSchema {
	/** The frontmatter key. */
	readonly key: string;
	readonly type: VaultObjectFieldType;
	/** Whether the field must be present + non-empty for the object to validate (fail closed). */
	readonly required: boolean;
	/** Short human description for the authoring GUI; never leaked to a non-DM. */
	readonly description: string;
	/**
	 * When true this field is REVEALING SCHEMA METADATA / a hidden relationship pointer that must be OMITTED
	 * from a non-DM actor-filtered projection (CONTENT-013 AC3) — e.g. a relationship pointer to another
	 * entity, or DM-authored secret. Defaults to false (a normal player-safe field).
	 */
	readonly dmOnly?: boolean;
}

/**
 * A typed REFERENCE from a subtype to the already-built model that owns its full feature set. The registry
 * does not duplicate that model; it points at it by entity type + schema version so a reader knows where the
 * canonical model lives and which version this catalog was built against.
 */
export interface VaultObjectModelReference {
	/** The canonical entity type the full model is addressed by (e.g. `character`, `map`). */
	readonly entityType: string;
	/** The schema version of the referenced model this registry entry tracks. */
	readonly schemaVersion: number;
	/** Where the full model lives, for traceability (never a runtime import target — a doc pointer). */
	readonly module: string;
}

/** The typed schema entry for ONE Vault Object subtype. Immutable. */
export interface VaultObjectSchema {
	readonly subtype: VaultObjectSubtype;
	readonly displayName: string;
	/** The frontmatter fields this subtype declares, beyond the common envelope. In stable order. */
	readonly fields: readonly VaultObjectFieldSchema[];
	/**
	 * The fail-closed visibility DEFAULT for a freshly-created object of this subtype (Contract 3 / AC1).
	 * Every subtype defaults to `dm-only` — a new object is never accidentally player-visible.
	 */
	readonly defaultVisibility: VisibilityLevel;
	/**
	 * When this subtype REFERENCES an already-built model, the pointer to it; `null` for subtypes that are
	 * purely note-backed frontmatter (`note`) or whose full model is deferred to a later epic.
	 */
	readonly modelReference: VaultObjectModelReference | null;
	/**
	 * Whether the FULL feature model for this subtype exists yet. `false` for the deferred subtypes
	 * (handout/timeline-event/dice-table/encounter/audio-preset/widget-package-ref) — they get a validated
	 * frontmatter contract here, but their full features are owned by a later epic.
	 */
	readonly modelImplemented: boolean;
}

/** Helper: a non-DM-visible field schema. */
function field(
	key: string,
	type: VaultObjectFieldType,
	required: boolean,
	description: string,
): VaultObjectFieldSchema {
	return { key, type, required, description };
}

/** Helper: a DM-only (revealing/relationship) field schema, omitted from non-DM projections. */
function dmOnlyField(
	key: string,
	type: VaultObjectFieldType,
	required: boolean,
	description: string,
): VaultObjectFieldSchema {
	return { key, type, required, description, dmOnly: true };
}

/**
 * THE published Vault Object subtype catalog (CONTENT-013). Authored once; the validator + projection +
 * authoring GUI all read it. `character`/`map`/`calendar-event`/`timeline-event` REFERENCE the already-built
 * models by entity type + schema version (they are NOT re-modeled here); the deferred subtypes declare a
 * minimal validated frontmatter contract whose full feature model a later epic owns.
 */
export const VAULT_OBJECT_SCHEMAS: Readonly<Record<VaultObjectSubtype, VaultObjectSchema>> =
	Object.freeze({
		note: {
			subtype: 'note',
			displayName: 'Note',
			fields: [],
			defaultVisibility: 'dm-only',
			modelReference: null,
			modelImplemented: true,
		},
		character: {
			subtype: 'character',
			displayName: 'Character',
			// The note-backed frontmatter envelope for a character object. The FULL sheet (ability scores,
			// combat, resources, advancement) lives in `CharacterState` — this is a pointer, not a copy.
			fields: [
				field('name', 'string', true, 'The character name.'),
				field('characterKind', 'string', true, 'npc | monster | sidekick | pc.'),
				field('characterId', 'string', false, 'The CharacterState entity id this object projects.'),
				dmOnlyField('dmNotes', 'string', false, 'DM-only notes; omitted from player projections.'),
			],
			defaultVisibility: 'dm-only',
			modelReference: {
				entityType: 'character',
				schemaVersion: CHARACTER_STATE_SCHEMA_VERSION,
				module: 'state/character-state.ts',
			},
			modelImplemented: true,
		},
		map: {
			subtype: 'map',
			displayName: 'Map',
			fields: [
				field('name', 'string', true, 'The map name.'),
				field('mapId', 'string', false, 'The MapState entity id this object projects.'),
			],
			defaultVisibility: 'dm-only',
			modelReference: {
				entityType: 'map',
				schemaVersion: MAP_STATE_SCHEMA_VERSION,
				module: 'state/map-state.ts',
			},
			modelImplemented: true,
		},
		'calendar-event': {
			subtype: 'calendar-event',
			displayName: 'Calendar event',
			// A dated note anchored to a campaign calendar definition (`state/calendar.ts`). The date VALUE
			// validation against the calendar is the calendar model's job; here we require the anchor field.
			fields: [
				field('title', 'string', true, 'The event title.'),
				field('calendarId', 'string', true, 'The campaign calendar this event is dated in.'),
				field('occursOn', 'string', true, 'The in-world date (YYYY-MM-DD in the calendar).'),
			],
			defaultVisibility: 'dm-only',
			modelReference: {
				entityType: 'calendar',
				schemaVersion: CALENDAR_SCHEMA_VERSION,
				module: 'state/calendar.ts',
			},
			modelImplemented: true,
		},
		'timeline-event': {
			subtype: 'timeline-event',
			displayName: 'Timeline event',
			fields: [
				field('title', 'string', true, 'The timeline event title.'),
				field('calendarId', 'string', true, 'The campaign calendar this event is dated in.'),
				field('occursOn', 'string', true, 'The in-world date (YYYY-MM-DD in the calendar).'),
				dmOnlyField('relatedEntityId', 'string', false, 'A DM-only relationship pointer; omitted from players.'),
			],
			defaultVisibility: 'dm-only',
			modelReference: {
				entityType: 'calendar',
				schemaVersion: CALENDAR_SCHEMA_VERSION,
				module: 'state/calendar.ts',
			},
			// The full timeline-event feature model is deferred to its own epic; the frontmatter is contracted.
			modelImplemented: false,
		},
		handout: {
			subtype: 'handout',
			displayName: 'Handout',
			fields: [
				field('title', 'string', true, 'The handout title.'),
				field('format', 'string', true, 'letter | image | map-fragment | cipher | rumor | document.'),
				dmOnlyField('cipher', 'string', false, 'A DM-only cipher/solution; omitted from player projections.'),
			],
			defaultVisibility: 'dm-only',
			modelReference: null,
			modelImplemented: false,
		},
		'dice-table': {
			subtype: 'dice-table',
			displayName: 'Dice table',
			fields: [
				field('title', 'string', true, 'The rollable table title.'),
				field('dice', 'string', true, 'The dice expression (e.g. 1d20).'),
				field('entries', 'string-array', true, 'The table result rows, in order.'),
			],
			defaultVisibility: 'dm-only',
			modelReference: null,
			modelImplemented: false,
		},
		encounter: {
			subtype: 'encounter',
			displayName: 'Encounter',
			fields: [
				field('title', 'string', true, 'The encounter title.'),
				field('difficulty', 'string', false, 'trivial | easy | medium | hard | deadly.'),
				dmOnlyField('participantIds', 'string-array', false, 'DM-only participant pointers; omitted from players.'),
			],
			defaultVisibility: 'dm-only',
			modelReference: null,
			modelImplemented: false,
		},
		'audio-preset': {
			subtype: 'audio-preset',
			displayName: 'Audio preset',
			fields: [
				field('title', 'string', true, 'The audio preset title.'),
				field('tracks', 'string-array', true, 'The track references in this preset.'),
			],
			defaultVisibility: 'dm-only',
			modelReference: null,
			modelImplemented: false,
		},
		'widget-package-ref': {
			subtype: 'widget-package-ref',
			displayName: 'Widget package reference',
			// A CONTENT POINTER to a widget package — NOT Scene/widget runtime state (which stays in
			// SceneState, Contract 4). It references a versioned package the vault can resolve.
			fields: [
				field('title', 'string', true, 'A human label for the referenced package.'),
				field('packageId', 'string', true, 'The widget package id this note references.'),
				field('packageVersion', 'string', false, 'The pinned package version, when applicable.'),
			],
			defaultVisibility: 'dm-only',
			modelReference: {
				entityType: 'widget-package',
				schemaVersion: SCENE_STATE_SCHEMA_VERSION,
				module: 'state/widget-package-state.ts',
			},
			modelImplemented: false,
		},
		faction: {
			subtype: 'faction',
			displayName: 'Faction',
			// A campaign faction dossier: an organized group with a stance toward the party. Prose (summary,
			// history, holdings) lives in the markdown body; these fields are the structured card/dossier data.
			fields: [
				field('name', 'string', true, 'The faction name.'),
				field('kind', 'string', false, 'cult | militia | guild | party | order | other.'),
				field('stance', 'string', false, 'hostile | neutral | friendly | allied.'),
				field('leader', 'string', false, 'The faction leader or figurehead.'),
				field('goals', 'string-array', false, 'The faction goals, in priority order.'),
				dmOnlyField('secret', 'string', false, 'A DM-only secret; omitted from player projections.'),
			],
			defaultVisibility: 'dm-only',
			modelReference: null,
			modelImplemented: false,
		},
		quest: {
			subtype: 'quest',
			displayName: 'Quest',
			// A campaign quest: a lifecycle status plus structured objectives. Prose (hooks, rewards,
			// journal) lives in the markdown body; these fields are the structured tracker data.
			fields: [
				field('title', 'string', true, 'The quest title.'),
				field('status', 'string', true, 'active | completed | failed | paused.'),
				field(
					'objectives',
					'object-array',
					false,
					'The quest objectives, each `{id, text, done}`, in order.',
				),
			],
			defaultVisibility: 'dm-only',
			modelReference: null,
			modelImplemented: true,
		},
		spell: {
			subtype: 'spell',
			displayName: 'Spell',
			// An SRD-compendium spell record (CHAR-008 detail vocabulary). The rules text lives in the
			// markdown body (`description` mirrors a short summary for card surfaces).
			fields: [
				field('name', 'string', true, 'The spell name.'),
				field('level', 'number', true, 'The spell level (0 = cantrip).'),
				field('school', 'string', false, 'The school of magic.'),
				field('castingTime', 'string', false, 'The casting time (e.g. 1 action).'),
				field('range', 'string', false, 'The range (e.g. 60 feet).'),
				field('components', 'string', false, 'The components (e.g. V, S, M).'),
				field('duration', 'string', false, 'The duration (e.g. Concentration, up to 1 minute).'),
				field('description', 'string', false, 'A short rules summary for card surfaces.'),
			],
			defaultVisibility: 'dm-only',
			modelReference: null,
			modelImplemented: true,
		},
	});

/** The entity type a Scene is addressed by — NEVER a Vault Object subtype (Contract 4). */
export const SCENE_ENTITY_TYPE = 'scene' as const;

/** Whether an id is the Scene entity type. A Scene routed to the object validator is rejected (Contract 4). */
export function isSceneEntityType(entityType: string): boolean {
	return entityType === SCENE_ENTITY_TYPE;
}

/** Whether a string is a registered BUILT-IN Vault Object subtype. Scene is never one. */
export function isVaultObjectSubtype(value: string): value is VaultObjectSubtype {
	return (VAULT_OBJECT_SUBTYPES as readonly string[]).includes(value);
}

/**
 * An immutable lookup of USER-DEFINED (custom) object-type schemas keyed by their type id, resolved
 * from a {@link CustomObjectTypeDefinition} map. A custom type is a FIRST-CLASS Vault Object subtype:
 * it flows through the SAME validate / sync / project path as a built-in, so it is presented to those
 * functions as an ordinary {@link VaultObjectSchema}. Built-in subtypes ALWAYS win over a custom id of
 * the same name (a custom id can never collide with a built-in — the define-type command rejects it —
 * but resolving built-in-first is the belt-and-braces fail-safe against a hostile persisted map).
 */
export type VaultObjectSchemaRegistry = Readonly<Record<string, VaultObjectSchema>>;

/**
 * Resolve the schema for a subtype from the BUILT-IN registry first, then the optional CUSTOM registry.
 * Returns `null` when the subtype is registered in neither (fail closed — an unknown subtype is never
 * silently treated as an open/free-form object).
 */
export function resolveVaultObjectSchema(
	subtype: string,
	customTypes?: VaultObjectSchemaRegistry,
): VaultObjectSchema | null {
	if (isVaultObjectSubtype(subtype)) return VAULT_OBJECT_SCHEMAS[subtype];
	if (customTypes && Object.prototype.hasOwnProperty.call(customTypes, subtype)) {
		return customTypes[subtype] ?? null;
	}
	return null;
}

/** Resolve the schema for a subtype, or `null` when it is not a registered subtype (fail closed). */
export function vaultObjectSchema(
	subtype: string,
	customTypes?: VaultObjectSchemaRegistry,
): VaultObjectSchema | null {
	return resolveVaultObjectSchema(subtype, customTypes);
}

/** The DM-only field keys of a subtype (the fields omitted from a non-DM projection). Pure. */
export function dmOnlyFieldKeys(subtype: VaultObjectSubtype): string[] {
	return VAULT_OBJECT_SCHEMAS[subtype].fields
		.filter((f) => f.dmOnly === true)
		.map((f) => f.key);
}

/** A read-only catalog row for the GUI/registry inspector. */
export interface VaultObjectSchemaSummary {
	subtype: VaultObjectSubtype;
	displayName: string;
	requiredFields: string[];
	dmOnlyFields: string[];
	defaultVisibility: VisibilityLevel;
	referencesModel: string | null;
	modelImplemented: boolean;
}

/** Summarize one subtype schema for the registry inspector. Pure. */
export function summarizeVaultObjectSchema(schema: VaultObjectSchema): VaultObjectSchemaSummary {
	return {
		subtype: schema.subtype,
		displayName: schema.displayName,
		requiredFields: schema.fields.filter((f) => f.required).map((f) => f.key),
		dmOnlyFields: schema.fields.filter((f) => f.dmOnly === true).map((f) => f.key),
		defaultVisibility: schema.defaultVisibility,
		referencesModel: schema.modelReference ? schema.modelReference.module : null,
		modelImplemented: schema.modelImplemented,
	};
}

/** The whole catalog as summary rows, in declared subtype order. The GUI renders this as a reference table. */
export function listVaultObjectSchemas(): VaultObjectSchemaSummary[] {
	return VAULT_OBJECT_SUBTYPES.map((subtype) =>
		summarizeVaultObjectSchema(VAULT_OBJECT_SCHEMAS[subtype]),
	);
}
