import { describe, expect, it } from 'vitest';
import {
	buildCapabilityCache,
	computeEffectivePermissionsForActor,
	dispatchCommand,
	invalidateCapabilityCache,
	type CapabilityCacheInputs,
	type CoreCommand,
	type CoreStateSlice,
} from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

const PLAYER_2 = { id: 'actor-player-2', role: 'player' as const, displayName: 'Player Two' };

function initial(): CoreStateSlice {
	return buildInitialState(DM_ACTOR, PLAYER_ACTOR, PLAYER_2, OBSERVER_ACTOR);
}

function cacheInputs(state: CoreStateSlice): CapabilityCacheInputs {
	return { permissions: state.permissions, entities: [] };
}

describe('PERM-004 AC3 / Contract 3 rule 4: grant changes invalidate affected participant caches', () => {
	it('granting a capability invalidates exactly the granted player', () => {
		const env = makeEnvironment();
		const before = initial();
		const cache = buildCapabilityCache(cacheInputs(before));

		const granted = dispatchCommand(before, env, {
			type: 'permission.grant-capability-set',
			actorId: DM_ACTOR.id,
			payload: {
				entityType: 'character',
				entityId: 'char-1',
				playerActorId: PLAYER_ACTOR.id,
				capabilitySet: 'combat-participant',
			},
		} satisfies CoreCommand);
		expect(granted.status).toBe('accepted');
		if (granted.status !== 'accepted') return;

		const result = invalidateCapabilityCache(cache, cacheInputs(granted.nextState));
		expect(result.invalidatedActorIds).toContain(PLAYER_ACTOR.id);
		// Other participants are untouched.
		expect(result.invalidatedActorIds).not.toContain(PLAYER_2.id);
		expect(result.invalidatedActorIds).not.toContain(DM_ACTOR.id);
	});

	it('transferring ownership invalidates BOTH the prior and new owner', () => {
		const env = makeEnvironment();
		const owned = dispatchCommand(initial(), env, {
			type: 'permission.grant-capability-set',
			actorId: DM_ACTOR.id,
			payload: {
				entityType: 'character',
				entityId: 'char-1',
				playerActorId: PLAYER_ACTOR.id,
				capabilitySet: 'owner',
			},
		} satisfies CoreCommand);
		if (owned.status !== 'accepted') throw new Error('seed failed');
		const cache = buildCapabilityCache(cacheInputs(owned.nextState));

		const transferred = dispatchCommand(owned.nextState, env, {
			type: 'permission.transfer-ownership',
			actorId: DM_ACTOR.id,
			payload: { entityType: 'character', entityId: 'char-1', toPlayerActorId: PLAYER_2.id },
		} satisfies CoreCommand);
		if (transferred.status !== 'accepted') throw new Error('transfer failed');

		const result = invalidateCapabilityCache(cache, cacheInputs(transferred.nextState));
		expect(result.invalidatedActorIds).toContain(PLAYER_ACTOR.id);
		expect(result.invalidatedActorIds).toContain(PLAYER_2.id);
	});

	it('revoking a grant invalidates the affected player', () => {
		const env = makeEnvironment();
		const granted = dispatchCommand(initial(), env, {
			type: 'permission.grant-capability-set',
			actorId: DM_ACTOR.id,
			payload: {
				entityType: 'character',
				entityId: 'char-1',
				playerActorId: PLAYER_ACTOR.id,
				capabilitySet: 'combat-participant',
			},
		} satisfies CoreCommand);
		if (granted.status !== 'accepted') throw new Error('seed failed');
		const cache = buildCapabilityCache(cacheInputs(granted.nextState));
		const grantId = granted.nextState.permissions.grants[0]!.id;

		const revoked = dispatchCommand(granted.nextState, env, {
			type: 'permission.revoke-grant',
			actorId: DM_ACTOR.id,
			payload: { grantId },
		} satisfies CoreCommand);
		if (revoked.status !== 'accepted') throw new Error('revoke failed');

		const result = invalidateCapabilityCache(cache, cacheInputs(revoked.nextState));
		expect(result.invalidatedActorIds).toContain(PLAYER_ACTOR.id);
	});
});

describe('PERM-006 + role-cap interaction: inheritance never elevates an Observer', () => {
	it('an owner grant on an Observer is dropped — no inherited write/character access', () => {
		const env = makeEnvironment();
		// Force an adversarial owner grant onto the Observer (the command would reject this; here we
		// inject it directly to prove the effective-surface computation still caps the observer).
		const seeded = initial();
		const forged: CoreStateSlice = {
			...seeded,
			permissions: {
				...seeded.permissions,
				grants: [
					{
						id: 'forged-owner',
						entityType: 'character',
						entityId: 'char-1',
						playerActorId: OBSERVER_ACTOR.id,
						capabilitySet: 'owner',
						createdBy: DM_ACTOR.id,
						createdAt: '2026-06-04T00:00:00.000Z',
						expiresAt: null,
					},
				],
			},
		};
		void env;
		const effective = computeEffectivePermissionsForActor(forged.permissions, OBSERVER_ACTOR.id);
		expect(effective.role).toBe('observer');
		expect(effective.canWrite).toBe(false);
		expect(effective.canReadCharacterData).toBe(false);
		expect(effective.effectiveGrants).toHaveLength(0);
		expect(effective.droppedGrants).toHaveLength(1);
	});
});
