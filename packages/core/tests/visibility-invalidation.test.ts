import { describe, expect, it } from 'vitest';
import {
	buildVisibilityCache,
	computeActorVisibilityFingerprint,
	computeVisibilityMetadataFingerprint,
	filterEntityForActor,
	invalidateVisibilityCache,
	isVisibilityCacheEntryValid,
	PERMISSION_STATE_SCHEMA_VERSION,
	toConsistencyEntityRecords,
	type EntityVisibilityMetadata,
	type PermissionState,
	type VisibilityCacheInputs,
	type VisibilitySurfaceRef,
} from '../src';
import {
	buildCapabilityCache,
	invalidateCapabilityCache,
} from '../src/permissions/capability-cache';
import { DM_ACTOR, OBSERVER_ACTOR, PLAYER_ACTOR } from '../src/testing/fixtures';

const PLAYER_B = { id: 'actor-player-b', role: 'player' as const, displayName: 'Player B' };
const NOTE_ID = 'note-1';

function state(grants: PermissionState['grants'] = []): PermissionState {
	return {
		actors: {
			[DM_ACTOR.id]: DM_ACTOR,
			[PLAYER_ACTOR.id]: PLAYER_ACTOR,
			[PLAYER_B.id]: PLAYER_B,
			[OBSERVER_ACTOR.id]: OBSERVER_ACTOR,
		},
		grants,
		schemaVersion: PERMISSION_STATE_SCHEMA_VERSION,
	};
}

const SURFACES: VisibilitySurfaceRef[] = [
	{ entityType: 'note', entityId: NOTE_ID },
	{ entityType: 'note', entityId: NOTE_ID, sectionId: 'secret-plans' },
	{ entityType: 'note', entityId: NOTE_ID, fieldPath: 'note.dmNotes' },
];

function inputs(
	metadata: EntityVisibilityMetadata[],
	grants: PermissionState['grants'] = [],
): VisibilityCacheInputs {
	return { permissions: state(grants), metadata, surfaces: SURFACES };
}

const CONTENT = {
	sectionIds: ['intro', 'secret-plans'],
	fields: { 'note.title': 'T', 'note.dmNotes': 'secret' },
};

describe('PERM-012: metadata fingerprint changes on any granularity edit', () => {
	it('a section-level change changes the metadata fingerprint', () => {
		const before = [{ entityType: 'note', entityId: NOTE_ID, entity: { level: 'player-visible' as const } }];
		const after: EntityVisibilityMetadata[] = [
			{
				entityType: 'note',
				entityId: NOTE_ID,
				entity: { level: 'player-visible' },
				sections: { 'secret-plans': { level: 'dm-only' } },
			},
		];
		expect(computeVisibilityMetadataFingerprint(before)).not.toBe(
			computeVisibilityMetadataFingerprint(after),
		);
	});

	it('a field-level change changes the metadata fingerprint', () => {
		const before: EntityVisibilityMetadata[] = [
			{ entityType: 'note', entityId: NOTE_ID, entity: { level: 'player-visible' } },
		];
		const after: EntityVisibilityMetadata[] = [
			{
				entityType: 'note',
				entityId: NOTE_ID,
				entity: { level: 'player-visible' },
				fields: { 'note.dmNotes': { level: 'dm-only' } },
			},
		];
		expect(computeVisibilityMetadataFingerprint(before)).not.toBe(
			computeVisibilityMetadataFingerprint(after),
		);
	});

	it('an unchanged metadata set produces a stable fingerprint', () => {
		const meta: EntityVisibilityMetadata[] = [
			{
				entityType: 'note',
				entityId: NOTE_ID,
				entity: { level: 'player-visible' },
				sections: { a: { level: 'dm-only' } },
			},
		];
		expect(computeVisibilityMetadataFingerprint(meta)).toBe(
			computeVisibilityMetadataFingerprint([...meta]),
		);
	});
});

describe('PERM-012 AC1: narrowing a section invalidates exactly the affected actors', () => {
	it('section player-visible -> dm-only invalidates players, not the DM', () => {
		const before = buildVisibilityCache(
			inputs([
				{
					entityType: 'note',
					entityId: NOTE_ID,
					entity: { level: 'player-visible' },
					sections: { 'secret-plans': { level: 'player-visible' } },
				},
			]),
		);
		const result = invalidateVisibilityCache(
			before,
			inputs([
				{
					entityType: 'note',
					entityId: NOTE_ID,
					entity: { level: 'player-visible' },
					sections: { 'secret-plans': { level: 'dm-only' } },
				},
			]),
		);
		expect(result.invalidatedActorIds).toContain(PLAYER_ACTOR.id);
		expect(result.invalidatedActorIds).toContain(PLAYER_B.id);
		expect(result.invalidatedActorIds).toContain(OBSERVER_ACTOR.id);
		// The DM sees everything, so a visibility narrowing never changes the DM's surface.
		expect(result.invalidatedActorIds).not.toContain(DM_ACTOR.id);
	});

	it('a now-hidden section immediately disappears from the affected actor computed surface', () => {
		const meta: EntityVisibilityMetadata = {
			entityType: 'note',
			entityId: NOTE_ID,
			entity: { level: 'player-visible' },
			sections: { 'secret-plans': { level: 'dm-only' } },
		};
		const filtered = filterEntityForActor(meta, CONTENT, PLAYER_ACTOR, state());
		expect(filtered.visibleSectionIds).toEqual(['intro']);
		expect(filtered.visibleSectionIds).not.toContain('secret-plans');
	});

	it('a stale cache entry is NOT served after the surface is narrowed (fail closed)', () => {
		const beforeInputs = inputs([
			{ entityType: 'note', entityId: NOTE_ID, entity: { level: 'player-visible' } },
		]);
		const cache = buildVisibilityCache(beforeInputs);
		// Entry is valid against the inputs it was built from.
		expect(isVisibilityCacheEntryValid(cache, PLAYER_ACTOR.id, beforeInputs)).toBe(true);
		// After narrowing the entity to dm-only, the OLD cache entry is stale and must not be served.
		const afterInputs = inputs([
			{ entityType: 'note', entityId: NOTE_ID, entity: { level: 'dm-only' } },
		]);
		expect(isVisibilityCacheEntryValid(cache, PLAYER_ACTOR.id, afterInputs)).toBe(false);
	});

	it('a field-level narrowing invalidates the player whose field surface changed', () => {
		const before = buildVisibilityCache(
			inputs([
				{ entityType: 'note', entityId: NOTE_ID, entity: { level: 'player-visible' } },
			]),
		);
		const result = invalidateVisibilityCache(
			before,
			inputs([
				{
					entityType: 'note',
					entityId: NOTE_ID,
					entity: { level: 'player-visible' },
					fields: { 'note.dmNotes': { level: 'dm-only' } },
				},
			]),
		);
		expect(result.invalidatedActorIds).toContain(PLAYER_ACTOR.id);
	});
});

describe('PERM-012: shared-delivery revocation invalidates exactly the de-delivered actor', () => {
	it('removing an actor from sharedWith invalidates that actor and immediately hides the content', () => {
		const before = buildVisibilityCache(
			inputs([
				{
					entityType: 'note',
					entityId: NOTE_ID,
					entity: { level: 'shared', sharedWith: [PLAYER_ACTOR.id, PLAYER_B.id] },
				},
			]),
		);
		const after = inputs([
			{
				entityType: 'note',
				entityId: NOTE_ID,
				entity: { level: 'shared', sharedWith: [PLAYER_B.id] },
			},
		]);
		const result = invalidateVisibilityCache(before, after);
		expect(result.invalidatedActorIds).toContain(PLAYER_ACTOR.id);
		// Player B still delivered -> unchanged.
		expect(result.invalidatedActorIds).not.toContain(PLAYER_B.id);
		// And Player A's computed surface is now hidden.
		const meta = after.metadata[0]!;
		expect(filterEntityForActor(meta, CONTENT, PLAYER_ACTOR, state()).visible).toBe(false);
		expect(filterEntityForActor(meta, CONTENT, PLAYER_B, state()).visible).toBe(true);
	});

	it('revoking a viewer grant on shared content re-fingerprints and hides it', () => {
		const grant = {
			id: 'g',
			entityType: 'note' as const,
			entityId: NOTE_ID,
			playerActorId: PLAYER_ACTOR.id,
			capabilitySet: 'viewer' as const,
			createdBy: DM_ACTOR.id,
			createdAt: '2026-06-03T00:00:00.000Z',
		};
		const meta: EntityVisibilityMetadata[] = [
			{ entityType: 'note', entityId: NOTE_ID, entity: { level: 'shared' } },
		];
		const withGrant = computeActorVisibilityFingerprint(
			PLAYER_ACTOR,
			meta,
			SURFACES,
			state([grant]),
		);
		const withoutGrant = computeActorVisibilityFingerprint(
			PLAYER_ACTOR,
			meta,
			SURFACES,
			state([]),
		);
		expect(withGrant).not.toBe(withoutGrant);
	});
});

describe('PERM-012 AC2: reconnect re-evaluates visibility before serving cached data', () => {
	it('an actor missing from a rebuilt cache is treated as invalidated (must recompute)', () => {
		const i = inputs([
			{ entityType: 'note', entityId: NOTE_ID, entity: { level: 'player-visible' } },
		]);
		const cache = { entries: {} }; // empty cache == reconnecting fresh
		expect(isVisibilityCacheEntryValid(cache, PLAYER_ACTOR.id, i)).toBe(false);
		const result = invalidateVisibilityCache(cache, i);
		expect(result.invalidatedActorIds).toContain(PLAYER_ACTOR.id);
	});

	it('an actor who left the session is dropped from the next cache', () => {
		const i = inputs([
			{ entityType: 'note', entityId: NOTE_ID, entity: { level: 'player-visible' } },
		]);
		const full = buildVisibilityCache(i);
		const reduced: VisibilityCacheInputs = {
			permissions: {
				actors: { [DM_ACTOR.id]: DM_ACTOR, [PLAYER_ACTOR.id]: PLAYER_ACTOR },
				grants: [],
				schemaVersion: PERMISSION_STATE_SCHEMA_VERSION,
			},
			metadata: i.metadata,
			surfaces: SURFACES,
		};
		const result = invalidateVisibilityCache(full, reduced);
		expect(result.invalidatedActorIds).toContain(PLAYER_B.id);
		expect(result.cache.entries[PLAYER_B.id]).toBeUndefined();
	});
});

describe('PERM-012: entity-level bridge feeds the EXISTING capability cache (reuse, no duplication)', () => {
	it('toConsistencyEntityRecords maps entity-level visibility for the capability cache', () => {
		const records = toConsistencyEntityRecords([
			{ entityType: 'note', entityId: NOTE_ID, entity: { level: 'player-visible' } },
			{
				entityType: 'character',
				entityId: 'c1',
				entity: { level: 'shared', sharedWith: [PLAYER_ACTOR.id] },
				// section/field rules are intentionally NOT mapped (entity-grain bridge only).
				sections: { s: { level: 'dm-only' } },
			},
			{ entityType: 'note', entityId: 'n2' }, // no rule -> fail closed dm-only
		]);
		expect(records).toContainEqual({
			entityType: 'note',
			entityId: NOTE_ID,
			visibility: 'player-visible',
		});
		expect(records).toContainEqual({
			entityType: 'character',
			entityId: 'c1',
			visibility: 'shared',
			sharedWith: [PLAYER_ACTOR.id],
		});
		expect(records).toContainEqual({ entityType: 'note', entityId: 'n2', visibility: 'dm-only' });
	});

	it('hiding a granted entity through the bridge invalidates that player in the capability cache', () => {
		const grant = {
			id: 'g',
			entityType: 'note' as const,
			entityId: NOTE_ID,
			playerActorId: PLAYER_ACTOR.id,
			capabilitySet: 'viewer' as const,
			createdBy: DM_ACTOR.id,
			createdAt: '2026-06-03T00:00:00.000Z',
		};
		const perms = state([grant]);
		const before = buildCapabilityCache({
			permissions: perms,
			entities: toConsistencyEntityRecords([
				{ entityType: 'note', entityId: NOTE_ID, entity: { level: 'player-visible' } },
			]),
		});
		const result = invalidateCapabilityCache(before, {
			permissions: perms,
			entities: toConsistencyEntityRecords([
				{ entityType: 'note', entityId: NOTE_ID, entity: { level: 'dm-only' } },
			]),
		});
		expect(result.invalidatedActorIds).toContain(PLAYER_ACTOR.id);
	});
});
