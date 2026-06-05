import { describe, expect, it } from 'vitest';
import {
	capabilitySetGrants,
	computeEffectivePermissionsForActor,
	describeCapabilitySet,
	hasGrantedCapability,
	inheritedCapabilitySets,
	listGrantableCapabilitySets,
	previewGrantEffect,
	PERMISSION_STATE_SCHEMA_VERSION,
	type PermissionGrant,
	type PermissionState,
} from '../src';
import { DM_ACTOR, PLAYER_ACTOR } from '../src/testing/fixtures';

function grant(overrides: Partial<PermissionGrant>): PermissionGrant {
	return {
		id: overrides.id ?? 'grant-1',
		entityType: overrides.entityType ?? 'character',
		entityId: overrides.entityId ?? 'char-1',
		playerActorId: overrides.playerActorId ?? PLAYER_ACTOR.id,
		capabilitySet: overrides.capabilitySet ?? 'viewer',
		createdBy: overrides.createdBy ?? DM_ACTOR.id,
		createdAt: overrides.createdAt ?? '2026-06-04T00:00:00.000Z',
		expiresAt: overrides.expiresAt ?? null,
	};
}

function state(grants: PermissionGrant[] = []): PermissionState {
	return {
		actors: { [DM_ACTOR.id]: DM_ACTOR, [PLAYER_ACTOR.id]: PLAYER_ACTOR },
		grants,
		schemaVersion: PERMISSION_STATE_SCHEMA_VERSION,
	};
}

describe('PERM-006: capability-set inheritance', () => {
	it('owner on a character implies combat-participant, backstory-editor, and viewer', () => {
		const sets = inheritedCapabilitySets('character', 'owner');
		expect(sets).toEqual(
			expect.arrayContaining(['owner', 'combat-participant', 'backstory-editor', 'viewer']),
		);
		expect(capabilitySetGrants('character', 'owner', 'combat-participant')).toBe(true);
		expect(capabilitySetGrants('character', 'owner', 'viewer')).toBe(true);
	});

	it('combat-participant implies viewer but not owner or backstory-editor', () => {
		expect(capabilitySetGrants('character', 'combat-participant', 'viewer')).toBe(true);
		expect(capabilitySetGrants('character', 'combat-participant', 'owner')).toBe(false);
		expect(capabilitySetGrants('character', 'combat-participant', 'backstory-editor')).toBe(false);
	});

	it('AC2: viewer-only confers NO inherited write capability', () => {
		expect(capabilitySetGrants('character', 'viewer', 'combat-participant')).toBe(false);
		expect(capabilitySetGrants('character', 'viewer', 'owner')).toBe(false);
		expect(inheritedCapabilitySets('character', 'viewer')).toEqual(['viewer']);

		const player = hasGrantedCapability(
			state([grant({ capabilitySet: 'viewer' })]),
			PLAYER_ACTOR,
			'character',
			'char-1',
			'combat-participant',
		);
		expect(player).toBe(false);
	});

	it('applies the right inheritance graph per entity type (scene co-editor ⇒ viewer)', () => {
		expect(capabilitySetGrants('scene', 'co-editor', 'viewer')).toBe(true);
		expect(capabilitySetGrants('widget', 'manager', 'operator')).toBe(true);
		expect(capabilitySetGrants('widget', 'manager', 'viewer')).toBe(true);
		expect(capabilitySetGrants('note', 'section-editor', 'contributor')).toBe(true);
		expect(capabilitySetGrants('timer-widget', 'operator', 'viewer')).toBe(true);
	});

	it('AC1: a player with owner on a character effectively holds the inherited sets', () => {
		const ownerState = state([grant({ capabilitySet: 'owner' })]);
		for (const required of ['owner', 'combat-participant', 'backstory-editor', 'viewer'] as const) {
			expect(
				hasGrantedCapability(ownerState, PLAYER_ACTOR, 'character', 'char-1', required),
			).toBe(true);
		}
		// The effective permission surface includes the (single) owner grant; it is character-capable.
		const effective = computeEffectivePermissionsForActor(ownerState, PLAYER_ACTOR.id);
		expect(effective.canReadCharacterData).toBe(true);
		expect(effective.canWrite).toBe(true);
	});

	it('fails closed: an unknown capability set confers only itself, never elevated', () => {
		expect(inheritedCapabilitySets('character', 'mystery')).toEqual(['mystery']);
		expect(capabilitySetGrants('character', 'mystery', 'owner')).toBe(false);
	});
});

describe('PERM-005 / PERM-008: grantable named sets, explanations, and preview', () => {
	it('lists named capability sets with explanations for a character (not raw fields)', () => {
		const sets = listGrantableCapabilitySets('character');
		const names = sets.map((s) => s.capabilitySet);
		expect(names).toEqual(['owner', 'combat-participant', 'backstory-editor', 'viewer']);
		for (const descriptor of sets) {
			expect(descriptor.label.length).toBeGreaterThan(0);
			expect(descriptor.explanation.length).toBeGreaterThan(0);
			expect(Array.isArray(descriptor.allows)).toBe(true);
		}
	});

	it('AC2: a capability set not defined for the entity type is not offered / not grantable', () => {
		const noteSets = listGrantableCapabilitySets('note').map((s) => s.capabilitySet);
		expect(noteSets).not.toContain('owner');
		expect(describeCapabilitySet('note', 'owner')).toBeNull();
		expect(previewGrantEffect('note', 'owner').grantable).toBe(false);

		// An entity type with no schema offers nothing (fail closed).
		expect(listGrantableCapabilitySets('made-up')).toEqual([]);
	});

	it('AC1: combat-participant preview summarizes writable combat operations and excluded sets', () => {
		const preview = previewGrantEffect('character', 'combat-participant');
		expect(preview.grantable).toBe(true);
		expect(preview.writeCapable).toBe(true);
		// Effective sets include the inherited viewer.
		expect(preview.effectiveCapabilitySets).toEqual(
			expect.arrayContaining(['combat-participant', 'viewer']),
		);
		// Excluded sets surface what the grant withholds (owner, backstory-editor).
		expect(preview.excludedCapabilitySets).toEqual(
			expect.arrayContaining(['owner', 'backstory-editor']),
		);
		// The operation summary mentions combat operations, never raw entity field names.
		expect(preview.allowedOperations.join(' ').toLowerCase()).toMatch(/hp|combat|spell/);
	});

	it('owner preview shows it confers every set and excludes nothing', () => {
		const preview = previewGrantEffect('character', 'owner');
		expect(preview.effectiveCapabilitySets).toEqual(
			expect.arrayContaining(['owner', 'combat-participant', 'backstory-editor', 'viewer']),
		);
		expect(preview.excludedCapabilitySets).toEqual([]);
	});

	it('viewer preview is read-only and excludes the write-capable sets', () => {
		const preview = previewGrantEffect('character', 'viewer');
		expect(preview.writeCapable).toBe(false);
		expect(preview.effectiveCapabilitySets).toEqual(['viewer']);
		expect(preview.excludedCapabilitySets).toEqual(
			expect.arrayContaining(['owner', 'combat-participant', 'backstory-editor']),
		);
	});
});
