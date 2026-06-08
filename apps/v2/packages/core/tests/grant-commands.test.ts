import { describe, expect, it } from 'vitest';
import {
	computeEffectivePermissionsForActor,
	dispatchCommand,
	hasGrantedCapability,
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

function grantCommand(payload: Record<string, unknown>, actorId = DM_ACTOR.id): CoreCommand {
	return { type: 'permission.grant-capability-set', actorId, payload };
}

function transferCommand(payload: Record<string, unknown>, actorId = DM_ACTOR.id): CoreCommand {
	return { type: 'permission.transfer-ownership', actorId, payload };
}

describe('PERM-004: grant a capability set (durable command)', () => {
	it('AC1: the DM granting section-editor on a note section creates a durable grant record + operation', () => {
		const env = makeEnvironment();
		const result = dispatchCommand(initial(), env, grantCommand({
			entityType: 'note-section',
			entityId: 'note-1#intro',
			playerActorId: PLAYER_ACTOR.id,
			capabilitySet: 'section-editor',
		}));

		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') return;
		// One durable operation was appended (routed through the operation log, not direct storage).
		expect(result.operationIds).toHaveLength(1);
		const op = result.nextState.sync.operations.at(-1)!;
		expect(op.opType).toBe('permission.grant-capability-set');
		expect(op.entityType).toBe('permission-grant');

		const grant = result.nextState.permissions.grants[0]!;
		expect(grant).toMatchObject({
			entityType: 'note-section',
			entityId: 'note-1#intro',
			playerActorId: PLAYER_ACTOR.id,
			capabilitySet: 'section-editor',
			createdBy: DM_ACTOR.id,
			expiresAt: null,
		});
		expect(grant.createdAt).toBeTruthy();
		expect(grant.updatedAt).toBeTruthy();

		// The player now effectively holds section-editor (and its inherited sets) on that section.
		expect(
			hasGrantedCapability(
				result.nextState.permissions,
				PLAYER_ACTOR,
				'note-section',
				'note-1#intro',
				'section-editor',
			),
		).toBe(true);
	});

	it('AC2: an expired grant is inert — the player holds no capability from it', () => {
		const env = makeEnvironment({ clock: () => '2026-06-04T12:00:00.000Z' });
		// Author with a future expiry so the grant is accepted...
		const result = dispatchCommand(initial(), env, grantCommand({
			entityType: 'note-section',
			entityId: 'note-1#intro',
			playerActorId: PLAYER_ACTOR.id,
			capabilitySet: 'section-editor',
			expiresAt: '2026-06-04T13:00:00.000Z',
		}));
		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') return;

		// ...but evaluated AFTER expiry it confers nothing.
		const afterExpiry = '2026-06-04T14:00:00.000Z';
		expect(
			hasGrantedCapability(
				result.nextState.permissions,
				PLAYER_ACTOR,
				'note-section',
				'note-1#intro',
				'section-editor',
				afterExpiry,
			),
		).toBe(false);
		// Still active just before expiry.
		expect(
			hasGrantedCapability(
				result.nextState.permissions,
				PLAYER_ACTOR,
				'note-section',
				'note-1#intro',
				'viewer',
				'2026-06-04T12:30:00.000Z',
			),
		).toBe(true);
		const effective = computeEffectivePermissionsForActor(
			result.nextState.permissions,
			PLAYER_ACTOR.id,
			afterExpiry,
		);
		expect(effective.expiredGrants).toHaveLength(1);
		expect(effective.effectiveGrants).toHaveLength(0);
	});

	it('rejects a grant authored by a non-DM (fail closed)', () => {
		const env = makeEnvironment();
		const result = dispatchCommand(
			initial(),
			env,
			grantCommand(
				{
					entityType: 'note-section',
					entityId: 'note-1#intro',
					playerActorId: PLAYER_2.id,
					capabilitySet: 'section-editor',
				},
				PLAYER_ACTOR.id,
			),
		);
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') return;
		expect(result.rejection.code).toBe('actor-not-authorized');
	});

	it('rejects an unknown capability set for the entity type (PERM-005, fail closed)', () => {
		const env = makeEnvironment();
		const result = dispatchCommand(initial(), env, grantCommand({
			entityType: 'character',
			entityId: 'char-1',
			playerActorId: PLAYER_ACTOR.id,
			capabilitySet: 'super-admin',
		}));
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') return;
		expect(result.rejection.code).toBe('invalid-payload');
		expect(result.rejection.message).toMatch(/not defined/i);
	});

	it('rejects a grant on an entity type with no capability schema (fail closed)', () => {
		const env = makeEnvironment();
		const result = dispatchCommand(initial(), env, grantCommand({
			entityType: 'made-up-thing',
			entityId: 'x-1',
			playerActorId: PLAYER_ACTOR.id,
			capabilitySet: 'viewer',
		}));
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') return;
		expect(result.rejection.message).toMatch(/no capability schema/i);
	});

	it('rejects a grant targeting an Observer (observers cannot receive grants)', () => {
		const env = makeEnvironment();
		const result = dispatchCommand(initial(), env, grantCommand({
			entityType: 'character',
			entityId: 'char-1',
			playerActorId: OBSERVER_ACTOR.id,
			capabilitySet: 'owner',
		}));
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') return;
		expect(result.rejection.message).toMatch(/observer/i);
	});

	it('rejects a grant targeting an unknown actor (fail closed)', () => {
		const env = makeEnvironment();
		const result = dispatchCommand(initial(), env, grantCommand({
			entityType: 'character',
			entityId: 'char-1',
			playerActorId: 'ghost-actor',
			capabilitySet: 'owner',
		}));
		expect(result.status).toBe('rejected');
	});

	it('rejects a grant whose expiry is already in the past (fail closed)', () => {
		const env = makeEnvironment({ clock: () => '2026-06-04T12:00:00.000Z' });
		const result = dispatchCommand(initial(), env, grantCommand({
			entityType: 'character',
			entityId: 'char-1',
			playerActorId: PLAYER_ACTOR.id,
			capabilitySet: 'owner',
			expiresAt: '2026-06-04T11:00:00.000Z',
		}));
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') return;
		expect(result.rejection.message).toMatch(/future/i);
	});

	it('rejects a grant with a malformed (unparseable) expiry (fail closed)', () => {
		const env = makeEnvironment();
		const result = dispatchCommand(initial(), env, grantCommand({
			entityType: 'character',
			entityId: 'char-1',
			playerActorId: PLAYER_ACTOR.id,
			capabilitySet: 'owner',
			expiresAt: 'not-a-date',
		}));
		expect(result.status).toBe('rejected');
	});

	it('AC3: revoking a grant removes it and the player loses the capability (cache invalidation upstream)', () => {
		const env = makeEnvironment();
		const granted = dispatchCommand(initial(), env, grantCommand({
			entityType: 'character',
			entityId: 'char-1',
			playerActorId: PLAYER_ACTOR.id,
			capabilitySet: 'combat-participant',
		}));
		expect(granted.status).toBe('accepted');
		if (granted.status !== 'accepted') return;
		const grantId = granted.nextState.permissions.grants[0]!.id;

		const revoked = dispatchCommand(granted.nextState, env, {
			type: 'permission.revoke-grant',
			actorId: DM_ACTOR.id,
			payload: { grantId },
		});
		expect(revoked.status).toBe('accepted');
		if (revoked.status !== 'accepted') return;
		expect(revoked.nextState.permissions.grants).toHaveLength(0);
		expect(
			hasGrantedCapability(
				revoked.nextState.permissions,
				PLAYER_ACTOR,
				'character',
				'char-1',
				'combat-participant',
			),
		).toBe(false);
	});

	it('re-granting the same key is idempotent (upsert in place, no duplicate)', () => {
		const env = makeEnvironment();
		const once = dispatchCommand(initial(), env, grantCommand({
			entityType: 'character',
			entityId: 'char-1',
			playerActorId: PLAYER_ACTOR.id,
			capabilitySet: 'viewer',
		}));
		if (once.status !== 'accepted') throw new Error('expected accepted');
		const twice = dispatchCommand(once.nextState, env, grantCommand({
			entityType: 'character',
			entityId: 'char-1',
			playerActorId: PLAYER_ACTOR.id,
			capabilitySet: 'viewer',
		}));
		if (twice.status !== 'accepted') throw new Error('expected accepted');
		expect(twice.nextState.permissions.grants).toHaveLength(1);
		// The original id/createdAt are preserved across the re-grant.
		expect(twice.nextState.permissions.grants[0]!.id).toBe(once.nextState.permissions.grants[0]!.id);
	});
});

describe('PERM-013: transfer character ownership atomically', () => {
	function withOwner(env = makeEnvironment()): CoreStateSlice {
		const result = dispatchCommand(initial(), env, grantCommand({
			entityType: 'character',
			entityId: 'char-1',
			playerActorId: PLAYER_ACTOR.id,
			capabilitySet: 'owner',
		}));
		if (result.status !== 'accepted') throw new Error('seed grant failed');
		return result.nextState;
	}

	it('AC1: transferring ownership revokes the prior owner and creates the new owner in ONE command', () => {
		const env = makeEnvironment();
		const state = withOwner(env);
		expect(state.permissions.grants).toHaveLength(1);

		const result = dispatchCommand(state, env, transferCommand({
			entityType: 'character',
			entityId: 'char-1',
			toPlayerActorId: PLAYER_2.id,
			capabilitySet: 'owner',
		}));
		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') return;

		// Exactly one owner exists at all times — the prior owner grant is gone, the new one present.
		const ownerGrants = result.nextState.permissions.grants.filter(
			(g) => g.entityType === 'character' && g.entityId === 'char-1' && g.capabilitySet === 'owner',
		);
		expect(ownerGrants).toHaveLength(1);
		expect(ownerGrants[0]!.playerActorId).toBe(PLAYER_2.id);

		// Player A no longer owns; Player B does. No window with zero or two owners.
		expect(
			hasGrantedCapability(result.nextState.permissions, PLAYER_ACTOR, 'character', 'char-1', 'owner'),
		).toBe(false);
		expect(
			hasGrantedCapability(result.nextState.permissions, PLAYER_2, 'character', 'char-1', 'owner'),
		).toBe(true);

		// One atomic durable operation describes the whole transfer.
		const op = result.nextState.sync.operations.at(-1)!;
		expect(op.opType).toBe('permission.transfer-ownership');
		const value = op.value as { revokedGrantIds: string[]; toPlayerActorId: string };
		expect(value.toPlayerActorId).toBe(PLAYER_2.id);
		expect(value.revokedGrantIds).toHaveLength(1);

		const event = result.events.find((e) => e.kind === 'permission.ownership-transferred');
		expect(event).toBeTruthy();
	});

	it('atomicity: the new owner grant and prior-owner revoke are both in the SAME next state', () => {
		const env = makeEnvironment();
		const state = withOwner(env);
		const priorOwnerGrantId = state.permissions.grants[0]!.id;

		const result = dispatchCommand(state, env, transferCommand({
			entityType: 'character',
			entityId: 'char-1',
			toPlayerActorId: PLAYER_2.id,
		}));
		if (result.status !== 'accepted') throw new Error('expected accepted');

		// The prior grant id is absent and the new holder grant exists — in one transition.
		expect(result.nextState.permissions.grants.some((g) => g.id === priorOwnerGrantId)).toBe(false);
		expect(
			result.nextState.permissions.grants.some(
				(g) => g.playerActorId === PLAYER_2.id && g.capabilitySet === 'owner',
			),
		).toBe(true);
		// The transfer never produces an intermediate state with two owners.
		const distinctOwners = new Set(
			result.nextState.permissions.grants
				.filter((g) => g.entityId === 'char-1' && g.capabilitySet === 'owner')
				.map((g) => g.playerActorId),
		);
		expect(distinctOwners.size).toBe(1);
	});

	it('AC2: a transfer that would leave two owners is impossible — defaults to a clean single owner', () => {
		// Construct a corrupt prior state with TWO owners by direct state injection (the grant
		// command now correctly rejects a second owner; this state simulates legacy/corrupt data).
		const env = makeEnvironment();
		const seeded = withOwner(env);
		const PLAYER_3 = { id: 'actor-player-3', role: 'player' as const, displayName: 'Player Three' };
		// Inject a second owner grant directly to simulate the corrupt state.
		const corruptState: CoreStateSlice = {
			...seeded,
			permissions: {
				...seeded.permissions,
				actors: {
					...seeded.permissions.actors,
					[PLAYER_2.id]: PLAYER_2,
					[PLAYER_3.id]: PLAYER_3,
				},
				grants: [
					...seeded.permissions.grants,
					{
						id: 'grant-corrupt-owner-2' as import('../src').GrantId,
						entityType: 'character',
						entityId: 'char-1',
						playerActorId: PLAYER_2.id,
						capabilitySet: 'owner' as import('../src').CapabilitySet,
						createdBy: DM_ACTOR.id,
						createdAt: '2026-01-01T00:00:00.000Z',
						expiresAt: null,
					},
				],
			},
		};
		// Two owners now exist (an invalid state the consistency audit would flag).
		expect(
			corruptState.permissions.grants.filter(
				(g) => g.entityId === 'char-1' && g.capabilitySet === 'owner',
			),
		).toHaveLength(2);

		const transferred = dispatchCommand(corruptState, env, transferCommand({
			entityType: 'character',
			entityId: 'char-1',
			toPlayerActorId: PLAYER_3.id,
		}));
		expect(transferred.status).toBe('accepted');
		if (transferred.status !== 'accepted') return;
		// The transfer revokes BOTH prior owners and leaves exactly one — never two.
		const owners = transferred.nextState.permissions.grants.filter(
			(g) => g.entityId === 'char-1' && g.capabilitySet === 'owner',
		);
		expect(owners).toHaveLength(1);
		expect(owners[0]!.playerActorId).toBe(PLAYER_3.id);
	});

	it('rejects transferring a NON-singular capability (transfer is for singular assignments only)', () => {
		const env = makeEnvironment();
		const result = dispatchCommand(initial(), env, transferCommand({
			entityType: 'character',
			entityId: 'char-1',
			toPlayerActorId: PLAYER_2.id,
			capabilitySet: 'combat-participant',
		}));
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') return;
		expect(result.rejection.message).toMatch(/singular/i);
	});

	it('rejects a transfer authored by a non-DM (fail closed)', () => {
		const env = makeEnvironment();
		const result = dispatchCommand(
			withOwner(),
			env,
			transferCommand(
				{ entityType: 'character', entityId: 'char-1', toPlayerActorId: PLAYER_2.id },
				PLAYER_ACTOR.id,
			),
		);
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') return;
		expect(result.rejection.code).toBe('actor-not-authorized');
	});

	it('rejects a transfer to an Observer (fail closed)', () => {
		const env = makeEnvironment();
		const result = dispatchCommand(withOwner(), env, transferCommand({
			entityType: 'character',
			entityId: 'char-1',
			toPlayerActorId: OBSERVER_ACTOR.id,
		}));
		expect(result.status).toBe('rejected');
	});
});
