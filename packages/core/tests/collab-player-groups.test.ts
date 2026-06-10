import { describe, expect, it } from 'vitest';
import {
	dispatchCommand,
	getHandoutForActor,
	groupMembershipGrantsNoCapability,
	hasGrantedCapability,
	resolveDeliveryTarget,
	type CommandResult,
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
import type { CoreEnvironment } from '../src/commands/types';
import type { Actor } from '../src/state/permission-state';

/**
 * COLLAB-012 — Player Groups are DELIVERY/PROJECTION TARGETS ONLY. The critical, hard-asserted invariant:
 * adding a player to a group grants ZERO permission. A group only EXPANDS the recipient list; each
 * recipient's access is still governed solely by their role/grants/visibility.
 */

const PLAYER_B: Actor = { id: 'actor-player-b', role: 'player', displayName: 'Player B' };

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got rejected: ${result.rejection.message}`);
	}
	return result;
}

function dispatch(state: CoreStateSlice, env: CoreEnvironment, command: CoreCommand): CommandResult {
	return dispatchCommand(state, env, command);
}

function activeSession(env: CoreEnvironment): { state: CoreStateSlice; sceneId: string } {
	const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR, PLAYER_B, OBSERVER_ACTOR);
	const home = accept(
		dispatch(base, env, { type: 'command-center.ensure-home', actorId: DM_ACTOR.id, payload: {} }),
	).nextState;
	const sceneId = home.commandCenter.homeSceneId!;
	const active = accept(
		dispatch(home, env, {
			type: 'session.set-workflow',
			actorId: DM_ACTOR.id,
			payload: { workflow: 'active', activeSceneId: sceneId },
		}),
	).nextState;
	return { state: active, sceneId };
}

function createGroup(
	state: CoreStateSlice,
	env: CoreEnvironment,
	memberActorIds: string[],
): { state: CoreStateSlice; groupId: string } {
	const result = accept(
		dispatch(state, env, {
			type: 'session.create-player-group',
			actorId: DM_ACTOR.id,
			payload: { name: 'The Front Line', memberActorIds },
		}),
	);
	const groupId = Object.keys(result.nextState.session.playerGroups)[0]!;
	return { state: result.nextState, groupId };
}

describe('COLLAB-012 Player Groups (delivery-only, no permission)', () => {
	it('a handout delivered to a GROUP reaches only its CURRENT members (AC1)', () => {
		const env = makeEnvironment();
		const { state, sceneId } = activeSession(env);
		const { state: withGroup, groupId } = createGroup(state, env, [PLAYER_ACTOR.id]);

		const delivered = accept(
			dispatch(withGroup, env, {
				type: 'session.deliver-handout',
				actorId: DM_ACTOR.id,
				payload: {
					title: 'Map fragment',
					kind: 'map-fragment',
					sceneId,
					groupIds: [groupId],
					sections: [{ heading: 'Fragment', body: 'A torn corner of a map.', visibility: 'player-visible' }],
				},
			}),
		).nextState;
		const handoutId = Object.keys(delivered.session.handouts)[0]!;

		// Player A (a member) receives it; Player B (not a member) does NOT.
		expect(getHandoutForActor(delivered.session, delivered.permissions, PLAYER_ACTOR.id, handoutId).kind).toBe(
			'available',
		);
		expect(getHandoutForActor(delivered.session, delivered.permissions, PLAYER_B.id, handoutId)).toEqual({
			kind: 'unavailable',
		});
		// The delivery resolved to the individual member (recorded against the actor id, not the group).
		expect(delivered.session.handouts[handoutId]!.recipientActorIds).toEqual([PLAYER_ACTOR.id]);
	});

	it('adding a player to a group grants ZERO permission (the critical invariant)', () => {
		const env = makeEnvironment();
		const { state, sceneId } = activeSession(env);
		// Deliver a handout to Player A ONLY (NOT via the group).
		const delivered = accept(
			dispatch(state, env, {
				type: 'session.deliver-handout',
				actorId: DM_ACTOR.id,
				payload: {
					title: 'Secret rumor',
					kind: 'rumor',
					sceneId,
					recipientActorIds: [PLAYER_ACTOR.id],
					sections: [{ heading: 'Rumor', body: 'The mayor is a doppelganger.', visibility: 'player-visible' }],
				},
			}),
		).nextState;
		const handoutId = Object.keys(delivered.session.handouts)[0]!;
		// Player B cannot see it yet (not a recipient).
		expect(getHandoutForActor(delivered.session, delivered.permissions, PLAYER_B.id, handoutId)).toEqual({
			kind: 'unavailable',
		});

		// Now create a group containing BOTH players and Player B — and add Player B to it.
		const { state: withGroup } = createGroup(delivered, env, [PLAYER_ACTOR.id, PLAYER_B.id]);

		// HARD ASSERTION: Player B STILL cannot see the prior handout. Group membership delivered nothing.
		expect(getHandoutForActor(withGroup.session, withGroup.permissions, PLAYER_B.id, handoutId)).toEqual({
			kind: 'unavailable',
		});
		// The prior handout's recipient set is unchanged — membership never retroactively delivered (AC2).
		expect(withGroup.session.handouts[handoutId]!.recipientActorIds).toEqual([PLAYER_ACTOR.id]);

		// And Player B gained NO capability on ANY entity from the membership.
		const playerB = withGroup.permissions.actors[PLAYER_B.id]!;
		expect(hasGrantedCapability(withGroup.permissions, playerB, 'character', 'char-hero', 'viewer')).toBe(false);
		expect(hasGrantedCapability(withGroup.permissions, playerB, 'scene', sceneId, 'co-editor')).toBe(false);
		// No grants were created at all by group management.
		expect(withGroup.permissions.grants).toEqual([]);
	});

	it('groupMembershipGrantsNoCapability proves membership confers nothing across the group', () => {
		const env = makeEnvironment();
		const { state } = activeSession(env);
		const { state: withGroup, groupId } = createGroup(state, env, [PLAYER_ACTOR.id, PLAYER_B.id]);
		const group = withGroup.session.playerGroups[groupId]!;

		// A permission predicate that (correctly) ignores group membership: the decision is identical with
		// and without considering the group → proof that membership grants nothing.
		const canViewHero = (actor: Actor): boolean =>
			hasGrantedCapability(withGroup.permissions, actor, 'character', 'char-hero', 'viewer');
		expect(
			groupMembershipGrantsNoCapability(group, withGroup.permissions, canViewHero, canViewHero),
		).toBe(true);

		// A membership-AWARE predicate (the bug this guards against) is detected as a leak.
		const membershipAware = (actor: Actor): boolean => group.memberActorIds.includes(actor.id);
		expect(
			groupMembershipGrantsNoCapability(group, withGroup.permissions, membershipAware, canViewHero),
		).toBe(false);
	});

	it('updating membership changes delivery only, before later queued deliveries (AC3)', () => {
		const env = makeEnvironment();
		const { state, sceneId } = activeSession(env);
		const { state: withGroup, groupId } = createGroup(state, env, [PLAYER_ACTOR.id]);

		// Update the group to ADD Player B (membership change applied first).
		const updated = accept(
			dispatch(withGroup, env, {
				type: 'session.update-player-group',
				actorId: DM_ACTOR.id,
				payload: { groupId, memberActorIds: [PLAYER_ACTOR.id, PLAYER_B.id] },
			}),
		).nextState;
		expect(updated.session.playerGroups[groupId]!.memberActorIds.sort()).toEqual(
			[PLAYER_ACTOR.id, PLAYER_B.id].sort(),
		);

		// A LATER delivery to the group now reaches BOTH members (the membership change took effect first).
		const delivered = accept(
			dispatch(updated, env, {
				type: 'session.deliver-handout',
				actorId: DM_ACTOR.id,
				payload: {
					title: 'Group note',
					kind: 'note',
					sceneId,
					groupIds: [groupId],
					sections: [{ heading: 'Note', body: 'Meet at dawn.', visibility: 'player-visible' }],
				},
			}),
		).nextState;
		const handoutId = Object.keys(delivered.session.handouts)[0]!;
		expect(delivered.session.handouts[handoutId]!.recipientActorIds.sort()).toEqual(
			[PLAYER_ACTOR.id, PLAYER_B.id].sort(),
		);
	});

	it('resolveDeliveryTarget fails closed: unknown group → no recipients; DM/observer-as-member skipped', () => {
		const env = makeEnvironment();
		const { state } = activeSession(env);
		const { state: withGroup, groupId } = createGroup(state, env, [PLAYER_ACTOR.id, OBSERVER_ACTOR.id]);

		// Observer IS a deliverable participant (player-safe content can target observers); DM is never one.
		const resolved = resolveDeliveryTarget(
			{ recipientActorIds: [DM_ACTOR.id], groupIds: [groupId, 'group-ghost'] },
			withGroup.session.playerGroups,
			withGroup.permissions,
		);
		expect(resolved.recipientActorIds).toEqual([PLAYER_ACTOR.id, OBSERVER_ACTOR.id].sort());
		expect(resolved.unknownGroupIds).toEqual(['group-ghost']);
		expect(resolved.skippedActorIds).toEqual([DM_ACTOR.id]);
	});

	it('fails closed: a player cannot manage groups; the DM cannot add itself / unknown actors', () => {
		const env = makeEnvironment();
		const { state } = activeSession(env);

		// A player cannot create a group.
		const byPlayer = dispatch(state, env, {
			type: 'session.create-player-group',
			actorId: PLAYER_ACTOR.id,
			payload: { name: 'Mine', memberActorIds: [] },
		});
		expect(byPlayer.status).toBe('rejected');
		if (byPlayer.status === 'rejected') expect(byPlayer.rejection.code).toBe('actor-not-authorized');

		// The DM cannot add itself as a member.
		const withDm = dispatch(state, env, {
			type: 'session.create-player-group',
			actorId: DM_ACTOR.id,
			payload: { name: 'Bad', memberActorIds: [DM_ACTOR.id] },
		});
		expect(withDm.status).toBe('rejected');

		// Unknown member rejects.
		const withGhost = dispatch(state, env, {
			type: 'session.create-player-group',
			actorId: DM_ACTOR.id,
			payload: { name: 'Bad', memberActorIds: ['actor-ghost'] },
		});
		expect(withGhost.status).toBe('rejected');
	});
});
