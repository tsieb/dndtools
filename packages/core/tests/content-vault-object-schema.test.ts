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
 * subtypes (plus the later-added `faction`, `quest`, and `spell`), REFERENCES the already-built character/map/calendar models (it never re-models them), enforces
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
	'faction',
	'quest',
	'spell',
];

describe('CONTENT-013 — Vault Object subtype registry (AC1: subtype schema set)', () => {
	it('covers exactly the ten initial v2 subtypes plus faction, quest, and spell', () => {
		expect([...VAULT_OBJECT_SUBTYPES].sort()).toEqual([...EXPECTED_SUBTYPES].sort());
		expect(VAULT_OBJECT_SUBTYPES).toHaveLength(13);
	});

	it('lists a catalog summary row per subtype with a fail-closed dm-only visibility default', () => {
		const rows = listVaultObjectSchemas();
		expect(rows).toHaveLength(13);
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
			'faction',
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

describe('CONTENT-013 — unknown subtype rejected with structured diagnostic (AC2)', () => {
	it('REJECTS an unregistered non-scene subtype with a structured unknown-subtype diagnostic', () => {
		// The `scene` subtype has its own special rejection path (`scene-not-an-object`). This test
		// proves that any OTHER unregistered subtype hits the `unknown-subtype` path — the second half
		// of AC2 ("rejected with a structured diagnostic rather than partially interpreted").
		const result = validateObjectFrontmatter('goblin-table', {});
		expect(result.valid).toBe(false);
		expect(result.subtype).toBeNull();
		expect(result.issues).toHaveLength(1);
		expect(result.issues[0]?.code).toBe('unknown-subtype');
		// Non-leaking: the message names the subtype token itself, not a raw field value.
		expect(result.issues[0]?.message).toContain('goblin-table');
	});

	it('isVaultObjectSubtype returns false for any unregistered subtype', () => {
		expect(isVaultObjectSubtype('goblin-table')).toBe(false);
		expect(isVaultObjectSubtype('unknown')).toBe(false);
		expect(isVaultObjectSubtype('')).toBe(false);
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
		// faction has a dm-only secret.
		expect(dmOnlyFieldKeys('faction')).toContain('secret');
		// note has no dm-only fields.
		expect(dmOnlyFieldKeys('note')).toEqual([]);
	});
});

describe('faction — the Campaign faction dossier subtype (note-backed, pattern-consistent)', () => {
	it('validates a well-formed faction frontmatter', () => {
		const result = validateObjectFrontmatter('faction', {
			name: 'Brine Hand',
			kind: 'cult',
			stance: 'hostile',
			leader: 'Mother Sild',
			goals: ['Wake what sleeps below the vaults', 'Keep the shipment route open'],
			secret: 'Sild translates for the cult rather than leading it.',
		});
		expect(result.valid).toBe(true);
		expect(result.subtype).toBe('faction');
		expect(result.issues).toEqual([]);
	});

	it('fails closed on a missing name, a wrong-typed goals value, and an undeclared field', () => {
		const result = validateObjectFrontmatter('faction', {
			goals: 'not-an-array',
			powerLevel: 3,
		});
		expect(result.valid).toBe(false);
		const codes = result.issues.map((issue) => issue.code).sort();
		expect(codes).toEqual(['missing-required-field', 'undeclared-field', 'wrong-type']);
	});

	it('defaults to dm-only visibility and declares no model reference (full model deferred)', () => {
		const schema = vaultObjectSchema('faction');
		expect(schema?.defaultVisibility).toBe('dm-only');
		expect(schema?.modelReference).toBeNull();
		expect(schema?.modelImplemented).toBe(false);
	});
});
