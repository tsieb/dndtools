import { describe, expect, it } from 'vitest';
import {
	CAPABILITY_SCHEMA_VERSION,
	PERMISSION_STATE_SCHEMA_VERSION,
	buildCapabilityCache,
	computeCapabilityFingerprint,
	invalidateCapabilityCache,
	isCapabilityCacheEntryValid,
	type CapabilityCacheInputs,
	type ConsistencyEntityRecord,
	type PermissionGrant,
	type PermissionState,
} from '../src';
import { DM_ACTOR, OBSERVER_ACTOR, PLAYER_ACTOR } from '../src/testing/fixtures';

const PLAYER_2 = { id: 'actor-player-2', role: 'player' as const, displayName: 'Player Two' };

function grant(overrides: Partial<PermissionGrant>): PermissionGrant {
	return {
		id: overrides.id ?? 'grant-1',
		entityType: overrides.entityType ?? 'note',
		entityId: overrides.entityId ?? 'note-1',
		playerActorId: overrides.playerActorId ?? PLAYER_ACTOR.id,
		capabilitySet: overrides.capabilitySet ?? 'section-editor',
		createdBy: overrides.createdBy ?? DM_ACTOR.id,
		createdAt: overrides.createdAt ?? '2026-06-04T00:00:00.000Z',
	};
}

function state(grants: PermissionGrant[] = [], roleOverrides: Partial<PermissionState> = {}): PermissionState {
	return {
		actors: roleOverrides.actors ?? {
			[DM_ACTOR.id]: DM_ACTOR,
			[PLAYER_ACTOR.id]: PLAYER_ACTOR,
			[PLAYER_2.id]: PLAYER_2,
			[OBSERVER_ACTOR.id]: OBSERVER_ACTOR,
		},
		grants,
		schemaVersion: PERMISSION_STATE_SCHEMA_VERSION,
	};
}

function inputs(
	permissions: PermissionState,
	entities: ConsistencyEntityRecord[] = [],
	version?: string,
): CapabilityCacheInputs {
	return { permissions, entities, capabilitySchemaVersion: version };
}

describe('PERM-009: deterministic capability fingerprint', () => {
	it('is stable across identical inputs and changes when a grant changes', () => {
		const a = computeCapabilityFingerprint(PLAYER_ACTOR.id, inputs(state([grant({ id: 'g1' })])));
		const b = computeCapabilityFingerprint(PLAYER_ACTOR.id, inputs(state([grant({ id: 'g1' })])));
		expect(a).toBe(b);
		const c = computeCapabilityFingerprint(
			PLAYER_ACTOR.id,
			inputs(state([grant({ id: 'g1', capabilitySet: 'contributor' })])),
		);
		expect(c).not.toBe(a);
	});

	it('builds an entry for every participant', () => {
		const cache = buildCapabilityCache(inputs(state()));
		expect(Object.keys(cache.entries).sort()).toEqual(
			[DM_ACTOR.id, OBSERVER_ACTOR.id, PLAYER_ACTOR.id, PLAYER_2.id].sort(),
		);
		expect(cache.capabilitySchemaVersion).toBe(CAPABILITY_SCHEMA_VERSION);
	});
});

describe('PERM-009: a grant change invalidates exactly the affected participant', () => {
	it('AC1: revoking a player grant invalidates only that player', () => {
		const before = state([
			grant({ id: 'g-player', playerActorId: PLAYER_ACTOR.id }),
			grant({ id: 'g-player2', playerActorId: PLAYER_2.id }),
		]);
		const cache = buildCapabilityCache(inputs(before));

		// Revoke only PLAYER_ACTOR's grant.
		const after = state([grant({ id: 'g-player2', playerActorId: PLAYER_2.id })]);
		const result = invalidateCapabilityCache(cache, inputs(after));

		expect(result.invalidatedActorIds).toEqual([PLAYER_ACTOR.id]);
		expect(result.failedClosed).toBe(false);
		// The revoked player's next check must fail closed (entry stale until recomputed).
		expect(isCapabilityCacheEntryValid(cache, PLAYER_ACTOR.id, inputs(after))).toBe(false);
		// The untouched player stays valid.
		expect(isCapabilityCacheEntryValid(cache, PLAYER_2.id, inputs(after))).toBe(true);
	});

	it('adding a grant invalidates only the granted player', () => {
		const before = state();
		const cache = buildCapabilityCache(inputs(before));
		const after = state([grant({ id: 'g-new', playerActorId: PLAYER_2.id })]);
		const result = invalidateCapabilityCache(cache, inputs(after));
		expect(result.invalidatedActorIds).toEqual([PLAYER_2.id]);
	});
});

describe('PERM-009: a visibility change invalidates the affected participant', () => {
	it('hiding an entity a player has a grant on invalidates that player', () => {
		const permissions = state([
			grant({ id: 'g-note', entityType: 'note', entityId: 'note-1', playerActorId: PLAYER_ACTOR.id }),
		]);
		const visible: ConsistencyEntityRecord[] = [
			{ entityType: 'note', entityId: 'note-1', visibility: 'player-visible' },
		];
		const cache = buildCapabilityCache(inputs(permissions, visible));

		const hidden: ConsistencyEntityRecord[] = [
			{ entityType: 'note', entityId: 'note-1', visibility: 'dm-only' },
		];
		const result = invalidateCapabilityCache(cache, inputs(permissions, hidden));
		expect(result.invalidatedActorIds).toContain(PLAYER_ACTOR.id);
		// A player WITHOUT a grant on that entity is unaffected.
		expect(result.invalidatedActorIds).not.toContain(PLAYER_2.id);
	});
});

describe('PERM-009: a role change invalidates the affected participant', () => {
	it('demoting a player to observer invalidates that participant', () => {
		const before = state([], {
			actors: { [DM_ACTOR.id]: DM_ACTOR, [PLAYER_ACTOR.id]: PLAYER_ACTOR },
		});
		const cache = buildCapabilityCache(inputs(before));
		const after = state([], {
			actors: {
				[DM_ACTOR.id]: DM_ACTOR,
				[PLAYER_ACTOR.id]: { ...PLAYER_ACTOR, role: 'observer' },
			},
		});
		const result = invalidateCapabilityCache(cache, inputs(after));
		expect(result.invalidatedActorIds).toEqual([PLAYER_ACTOR.id]);
		expect(result.failedClosed).toBe(false);
	});
});

describe('PERM-009: an ownership change invalidates the affected participants', () => {
	it('transferring character ownership invalidates both old and new owner', () => {
		const before = state([
			grant({
				id: 'g-owner',
				entityType: 'character',
				entityId: 'hero',
				capabilitySet: 'owner',
				playerActorId: PLAYER_ACTOR.id,
			}),
		]);
		const entities: ConsistencyEntityRecord[] = [
			{ entityType: 'character', entityId: 'hero', visibility: 'player-visible' },
		];
		const cache = buildCapabilityCache(inputs(before, entities));

		const after = state([
			grant({
				id: 'g-owner-2',
				entityType: 'character',
				entityId: 'hero',
				capabilitySet: 'owner',
				playerActorId: PLAYER_2.id,
			}),
		]);
		const result = invalidateCapabilityCache(cache, inputs(after, entities));
		expect(result.invalidatedActorIds.sort()).toEqual([PLAYER_ACTOR.id, PLAYER_2.id].sort());
	});
});

describe('PERM-009: a capability schema-version change fails closed and invalidates everyone', () => {
	it('bumping the capability schema version invalidates ALL participants', () => {
		const permissions = state();
		const cache = buildCapabilityCache(inputs(permissions, [], '1'));
		const result = invalidateCapabilityCache(cache, inputs(permissions, [], '2'));
		expect(result.failedClosed).toBe(true);
		expect(result.invalidatedActorIds.sort()).toEqual(
			[DM_ACTOR.id, OBSERVER_ACTOR.id, PLAYER_ACTOR.id, PLAYER_2.id].sort(),
		);
		// Every entry now reads invalid against the new version.
		for (const id of Object.keys(permissions.actors)) {
			expect(isCapabilityCacheEntryValid(cache, id, inputs(permissions, [], '2'))).toBe(false);
		}
	});
});

describe('PERM-009: no change invalidates nothing', () => {
	it('re-running with identical inputs invalidates no one', () => {
		const permissions = state([grant({ id: 'g1' })]);
		const cache = buildCapabilityCache(inputs(permissions));
		const result = invalidateCapabilityCache(cache, inputs(permissions));
		expect(result.invalidatedActorIds).toEqual([]);
		expect(result.failedClosed).toBe(false);
	});
});

describe('PERM-009 AC2: a reconnecting participant re-evaluates before catch-up', () => {
	it('a participant offline during revocation reads as invalid on reconnect', () => {
		// Cache captured at join.
		const atJoin = state([grant({ id: 'g-op', entityType: 'widget', entityId: 'w', capabilitySet: 'operator' })]);
		const joinEntities: ConsistencyEntityRecord[] = [
			{ entityType: 'widget', entityId: 'w', visibility: 'player-visible' },
		];
		const cache = buildCapabilityCache(inputs(atJoin, joinEntities));

		// While offline, the DM revokes the operator grant.
		const afterRevoke = state([]);

		// On reconnect, the cached entry must be treated as invalid (fail closed) so role/grants are
		// re-evaluated before catch-up operations are delivered.
		expect(isCapabilityCacheEntryValid(cache, PLAYER_ACTOR.id, inputs(afterRevoke, joinEntities))).toBe(
			false,
		);
	});

	it('a removed participant is invalidated and dropped from the next cache', () => {
		const before = state([], {
			actors: { [DM_ACTOR.id]: DM_ACTOR, [PLAYER_ACTOR.id]: PLAYER_ACTOR },
		});
		const cache = buildCapabilityCache(inputs(before));
		const after = state([], { actors: { [DM_ACTOR.id]: DM_ACTOR } });
		const result = invalidateCapabilityCache(cache, inputs(after));
		expect(result.invalidatedActorIds).toContain(PLAYER_ACTOR.id);
		expect(result.cache.entries[PLAYER_ACTOR.id]).toBeUndefined();
	});
});

describe('PERM-009: an adversarial observer grant does not change the observer fingerprint surface', () => {
	it('an observer fingerprint reflects the DROPPED grant so revoking the bogus grant still invalidates', () => {
		// An observer with a forged write grant: the grant is dropped, but it must still be part of
		// the fingerprint so that removing the stale record invalidates the observer entry.
		const withBogus = state([
			grant({
				id: 'g-bogus',
				entityType: 'scene',
				entityId: 's',
				capabilitySet: 'co-editor',
				playerActorId: OBSERVER_ACTOR.id,
			}),
		]);
		const cache = buildCapabilityCache(inputs(withBogus));
		const cleaned = state([]);
		const result = invalidateCapabilityCache(cache, inputs(cleaned));
		expect(result.invalidatedActorIds).toContain(OBSERVER_ACTOR.id);
	});
});
