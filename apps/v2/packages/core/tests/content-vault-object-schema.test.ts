import { describe, expect, it } from 'vitest';
import {
	CHARACTER_STATE_SCHEMA_VERSION,
	MAP_STATE_SCHEMA_VERSION,
	SCENE_ENTITY_TYPE,
	VAULT_OBJECT_SCHEMAS,
	VAULT_OBJECT_SUBTYPES,
	dmOnlyFieldKeys,
	isSceneEntityType,
	isVaultObjectSubtype,
	listVaultObjectSchemas,
	validateObjectFrontmatter,
	vaultObjectSchema,
	type VaultObjectSubtype,
} from '../src';

/**
 * CONTENT-013 — the core VAULT OBJECT SUBTYPE SCHEMA REGISTRY. The catalog covers the ten required initial
 * subtypes, REFERENCES the already-built character/map/calendar models (it never re-models them), enforces
 * subtype schema + visibility defaults + revealing-field omission, and keeps SCENE in SceneState (never a
 * note-backed object subtype — Contract 4 / AC4).
 */

const EXPECTED_SUBTYPES: VaultObjectSubtype[] = [
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
];

describe('CONTENT-013 — Vault Object subtype registry (AC1: subtype schema set)', () => {
	it('covers exactly the ten initial v2 subtypes', () => {
		expect([...VAULT_OBJECT_SUBTYPES].sort()).toEqual([...EXPECTED_SUBTYPES].sort());
		expect(VAULT_OBJECT_SUBTYPES).toHaveLength(10);
	});

	it('lists a catalog summary row per subtype with a fail-closed dm-only visibility default', () => {
		const rows = listVaultObjectSchemas();
		expect(rows).toHaveLength(10);
		for (const row of rows) {
			// Every new object FAILS CLOSED to dm-only (AC1 visibility defaults).
			expect(row.defaultVisibility).toBe('dm-only');
		}
	});

	it('REFERENCES the already-built models by entity type + schema version (does not re-model them)', () => {
		// CRITICAL: character/map reference the existing models — they track their schema versions, proving
		// the registry is a catalog pointing at the canonical model, not a duplicate.
		expect(VAULT_OBJECT_SCHEMAS.character.modelReference).toEqual({
			entityType: 'character',
			schemaVersion: CHARACTER_STATE_SCHEMA_VERSION,
			module: 'state/character-state.ts',
		});
		expect(VAULT_OBJECT_SCHEMAS.map.modelReference).toEqual({
			entityType: 'map',
			schemaVersion: MAP_STATE_SCHEMA_VERSION,
			module: 'state/map-state.ts',
		});
		// calendar-event / timeline-event point at the calendar model.
		expect(VAULT_OBJECT_SCHEMAS['calendar-event'].modelReference?.module).toBe('state/calendar.ts');
		expect(VAULT_OBJECT_SCHEMAS['timeline-event'].modelReference?.module).toBe('state/calendar.ts');
	});

	it('marks the deferred subtypes as not-yet-fully-implemented but still schema-contracted', () => {
		const deferred: VaultObjectSubtype[] = [
			'handout',
			'timeline-event',
			'dice-table',
			'encounter',
			'audio-preset',
			'widget-package-ref',
		];
		for (const subtype of deferred) {
			expect(VAULT_OBJECT_SCHEMAS[subtype].modelImplemented).toBe(false);
			// They still declare a validated frontmatter contract (≥1 required field).
			expect(vaultObjectSchema(subtype)?.fields.some((f) => f.required)).toBe(true);
		}
		// note/character/map/calendar-event have full models referenced.
		expect(VAULT_OBJECT_SCHEMAS.note.modelImplemented).toBe(true);
		expect(VAULT_OBJECT_SCHEMAS.character.modelImplemented).toBe(true);
	});
});

describe('CONTENT-013 — Scene stays in SceneState (AC4)', () => {
	it('never registers a `scene` subtype', () => {
		expect(isVaultObjectSubtype('scene')).toBe(false);
		expect(vaultObjectSchema('scene')).toBeNull();
		expect((VAULT_OBJECT_SUBTYPES as readonly string[]).includes('scene')).toBe(false);
	});

	it('recognizes the Scene entity type so it is routed back to SceneState, not the object validator', () => {
		expect(isSceneEntityType(SCENE_ENTITY_TYPE)).toBe(true);
		expect(isSceneEntityType('scene')).toBe(true);
		expect(isSceneEntityType('note')).toBe(false);
	});

	it('REJECTS a Scene routed to the object validator (Scene is not a note-backed object subtype)', () => {
		const result = validateObjectFrontmatter('scene', {});
		expect(result.valid).toBe(false);
		expect(result.issues[0]?.code).toBe('scene-not-an-object');
	});
});

describe('CONTENT-013 — actor-filtered projection omits revealing fields (AC3)', () => {
	it('declares dm-only revealing/relationship fields on subtypes that have them', () => {
		// timeline-event has a dm-only relationship pointer; handout a dm-only cipher; encounter dm-only
		// participants; character dm-only notes.
		expect(dmOnlyFieldKeys('timeline-event')).toContain('relatedEntityId');
		expect(dmOnlyFieldKeys('handout')).toContain('cipher');
		expect(dmOnlyFieldKeys('encounter')).toContain('participantIds');
		expect(dmOnlyFieldKeys('character')).toContain('dmNotes');
		// note has no dm-only fields.
		expect(dmOnlyFieldKeys('note')).toEqual([]);
	});
});
