import { describe, expect, it } from 'vitest';
import {
	countCoDmActors,
	dispatchCommand,
	evaluateSceneVisibility,
	actorCanAuthorScene,
	hasDmAuthority,
	isCampaignOwnerRole,
	listScenesForActor,
	parsePreviewParam,
	permissionsWithPreviewActors,
	resolvePreviewActor,
	PREVIEW_CODM_ACTOR_ID,
	type Actor,
	type CoreCommand,
	type CoreStateSlice,
} from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	buildPermissionState,
	makeEnvironment,
} from '../src/testing/fixtures';

const PLAYER_2: Actor = { id: 'actor-player-2', role: 'player', displayName: 'Player Two' };

function initial(): CoreStateSlice {
	return buildInitialState(DM_ACTOR, PLAYER_ACTOR, PLAYER_2, OBSERVER_ACTOR);
}

function assignCommand(payload: Record<string, unknown>, actorId = DM_ACTOR.id): CoreCommand {
	return { type: 'permission.assign-role', actorId, payload };
}

// ── The role-authority helpers (the two gates every policy site branches on) ──────────────────────
describe('Co-DM: role-authority helpers', () => {
	it('hasDmAuthority is true for dm AND co-dm, false for player/observer/garbage', () => {
		expect(hasDmAuthority('dm')).toBe(true);
		expect(hasDmAuthority('co-dm')).toBe(true);
		expect(hasDmAuthority('player')).toBe(false);
		expect(hasDmAuthority('observer')).toBe(false);
		expect(hasDmAuthority(null)).toBe(false);
		expect(hasDmAuthority('nonsense')).toBe(false);
	});

	it('isCampaignOwnerRole is true for dm ONLY — never a co-dm (fail closed)', () => {
		expect(isCampaignOwnerRole('dm')).toBe(true);
		expect(isCampaignOwnerRole('co-dm')).toBe(false);
		expect(isCampaignOwnerRole('player')).toBe(false);
		expect(isCampaignOwnerRole(undefined)).toBe(false);
	});

	it('countCoDmActors counts only the co-dm role', () => {
		const permissions = buildPermissionState(
			DM_ACTOR,
			{ id: 'a', role: 'co-dm', displayName: 'A' },
			{ id: 'b', role: 'co-dm', displayName: 'B' },
			PLAYER_ACTOR,
		);
		expect(countCoDmActors(permissions)).toBe(2);
	});
});

// ── permission.assign-role command ────────────────────────────────────────────────────────────────
describe('Co-DM: permission.assign-role command', () => {
	it('the owner DM promotes a player to co-dm (within seats): role changes + durable op + event', () => {
		const env = makeEnvironment();
		const result = dispatchCommand(
			initial(),
			env,
			assignCommand({ targetActorId: PLAYER_ACTOR.id, role: 'co-dm', coDmSeatLimit: 1 }),
		);
		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') return;
		expect(result.nextState.permissions.actors[PLAYER_ACTOR.id]!.role).toBe('co-dm');
		expect(result.operationIds).toHaveLength(1);
		const op = result.nextState.sync.operations.at(-1)!;
		expect(op.opType).toBe('permission.assign-role');
		expect(op.entityType).toBe('permission-actor');
		expect(result.events).toContainEqual(
			expect.objectContaining({
				kind: 'permission.role-assigned',
				targetActorId: PLAYER_ACTOR.id,
				role: 'co-dm',
				previousRole: 'player',
			}),
		);
	});

	it('a promotion that would EXCEED the plan seat limit is rejected (fail closed)', () => {
		const env = makeEnvironment();
		// One co-dm already present; limit is 1.
		const state = buildInitialState(
			DM_ACTOR,
			{ id: 'actor-codm', role: 'co-dm', displayName: 'Existing Co-DM' },
			PLAYER_ACTOR,
		);
		const result = dispatchCommand(
			state,
			env,
			assignCommand({ targetActorId: PLAYER_ACTOR.id, role: 'co-dm', coDmSeatLimit: 1 }),
		);
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') return;
		expect(result.rejection.message).toMatch(/seat/i);
		// Nothing changed.
		expect(result.nextState.permissions.actors[PLAYER_ACTOR.id]!.role).toBe('player');
	});

	it('promoting to co-dm on a plan with ZERO co-dm seats is rejected with an upgrade message', () => {
		const env = makeEnvironment();
		const result = dispatchCommand(
			initial(),
			env,
			assignCommand({ targetActorId: PLAYER_ACTOR.id, role: 'co-dm', coDmSeatLimit: 0 }),
		);
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') return;
		expect(result.rejection.message).toMatch(/no Co-DM seats/i);
	});

	it('a co-DM cannot assign roles — only the campaign owner may (fail closed)', () => {
		const env = makeEnvironment();
		const state = buildInitialState(
			DM_ACTOR,
			{ id: 'actor-codm', role: 'co-dm', displayName: 'Co-DM' },
			PLAYER_ACTOR,
		);
		const result = dispatchCommand(
			state,
			env,
			assignCommand({ targetActorId: PLAYER_ACTOR.id, role: 'co-dm', coDmSeatLimit: 3 }, 'actor-codm'),
		);
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') return;
		expect(result.rejection.code).toBe('actor-not-authorized');
	});

	it('a player cannot assign roles either', () => {
		const env = makeEnvironment();
		const result = dispatchCommand(
			initial(),
			env,
			assignCommand({ targetActorId: PLAYER_2.id, role: 'co-dm', coDmSeatLimit: 3 }, PLAYER_ACTOR.id),
		);
		expect(result.status).toBe('rejected');
	});

	it('the campaign owner’s own role cannot be reassigned here', () => {
		const env = makeEnvironment();
		const result = dispatchCommand(
			initial(),
			env,
			assignCommand({ targetActorId: DM_ACTOR.id, role: 'player', coDmSeatLimit: 1 }),
		);
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') return;
		expect(result.rejection.message).toMatch(/owner/i);
	});

	it('assigning the dm role is impossible (schema forbids it — ownership transfer is separate)', () => {
		const env = makeEnvironment();
		const result = dispatchCommand(
			initial(),
			env,
			assignCommand({ targetActorId: PLAYER_ACTOR.id, role: 'dm', coDmSeatLimit: 1 }),
		);
		expect(result.status).toBe('rejected');
	});

	it('an unknown target actor is rejected', () => {
		const env = makeEnvironment();
		const result = dispatchCommand(
			initial(),
			env,
			assignCommand({ targetActorId: 'actor-nope', role: 'player', coDmSeatLimit: 1 }),
		);
		expect(result.status).toBe('rejected');
	});

	it('demoting a co-dm back to player frees the seat (a subsequent promotion succeeds)', () => {
		const env = makeEnvironment();
		let state = buildInitialState(
			DM_ACTOR,
			{ id: 'actor-codm', role: 'co-dm', displayName: 'Co-DM' },
			PLAYER_ACTOR,
		);
		// Demote the existing co-dm.
		const demote = dispatchCommand(
			state,
			env,
			assignCommand({ targetActorId: 'actor-codm', role: 'player', coDmSeatLimit: 1 }),
		);
		expect(demote.status).toBe('accepted');
		if (demote.status !== 'accepted') return;
		state = demote.nextState;
		expect(countCoDmActors(state.permissions)).toBe(0);
		// Now the single seat is free again.
		const promote = dispatchCommand(
			state,
			env,
			assignCommand({ targetActorId: PLAYER_ACTOR.id, role: 'co-dm', coDmSeatLimit: 1 }),
		);
		expect(promote.status).toBe('accepted');
	});

	it('a no-op assignment (same role) is accepted without churning the op-log', () => {
		const env = makeEnvironment();
		const result = dispatchCommand(
			initial(),
			env,
			assignCommand({ targetActorId: PLAYER_ACTOR.id, role: 'player', coDmSeatLimit: 1 }),
		);
		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') return;
		expect(result.operationIds).toHaveLength(0);
	});
});

// ── Read/author authority: a co-DM sees DM-only content and can author, but cannot administer ────────
describe('Co-DM: sees DM-only content + authors, but cannot grant', () => {
	function withDmOnlyScene(): { state: CoreStateSlice; sceneId: string } {
		const env = makeEnvironment();
		const created = dispatchCommand(initial(), env, {
			type: 'scene.create',
			actorId: DM_ACTOR.id,
			payload: { name: 'Villain Lair', visibility: 'dm-only' },
		});
		if (created.status !== 'accepted') throw new Error('scene create failed');
		const sceneId = Object.keys(created.nextState.scenes.scenes)[0]!;
		// Promote the player to co-dm.
		const promoted = dispatchCommand(created.nextState, env, {
			type: 'permission.assign-role',
			actorId: DM_ACTOR.id,
			payload: { targetActorId: PLAYER_ACTOR.id, role: 'co-dm', coDmSeatLimit: 1 },
		});
		if (promoted.status !== 'accepted') throw new Error('promote failed');
		return { state: promoted.nextState, sceneId };
	}

	it('a co-dm sees a dm-only scene that a player cannot', () => {
		const { state, sceneId } = withDmOnlyScene();
		const scene = state.scenes.scenes[sceneId]!;
		const coDm = state.permissions.actors[PLAYER_ACTOR.id]!;
		expect(coDm.role).toBe('co-dm');

		expect(evaluateSceneVisibility(scene, coDm, state.permissions).kind).toBe('visible');
		expect(evaluateSceneVisibility(scene, OBSERVER_ACTOR, state.permissions).kind).toBe('hidden');

		// And through the list read model: the co-dm's list contains the dm-only scene; a player's does not.
		const coDmScenes = listScenesForActor(state.scenes, state.permissions, PLAYER_ACTOR.id);
		expect(coDmScenes.some((s) => s.id === sceneId)).toBe(true);
		const observerScenes = listScenesForActor(state.scenes, state.permissions, OBSERVER_ACTOR.id);
		expect(observerScenes.some((s) => s.id === sceneId)).toBe(false);
	});

	it('a co-dm may author scenes (actorCanAuthorScene) like a DM', () => {
		const { state } = withDmOnlyScene();
		const coDm = state.permissions.actors[PLAYER_ACTOR.id]!;
		expect(actorCanAuthorScene(coDm)).toBe(true);
		expect(actorCanAuthorScene(OBSERVER_ACTOR)).toBe(false);
	});

	it('a co-dm CANNOT grant a capability set — grants are owner-only', () => {
		const { state, sceneId } = withDmOnlyScene();
		const env = makeEnvironment();
		const result = dispatchCommand(state, env, {
			type: 'permission.grant-capability-set',
			actorId: PLAYER_ACTOR.id, // now a co-dm
			payload: {
				entityType: 'scene',
				entityId: sceneId,
				playerActorId: PLAYER_2.id,
				capabilitySet: 'viewer',
			},
		});
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') return;
		expect(result.rejection.code).toBe('actor-not-authorized');
	});
});

// ── Preview-as co-DM ─────────────────────────────────────────────────────────────────────────────
describe('Co-DM: preview-as machinery', () => {
	it('parsePreviewParam accepts co-dm', () => {
		expect(parsePreviewParam('co-dm')).toBe('co-dm');
		expect(parsePreviewParam('dm')).toBeNull();
		expect(parsePreviewParam('nonsense')).toBeNull();
	});

	it('resolvePreviewActor for co-dm yields the reserved generic co-dm actor with an elevated role', () => {
		const permissions = buildPermissionState(DM_ACTOR, PLAYER_ACTOR);
		const resolved = resolvePreviewActor(permissions, { role: 'co-dm' });
		expect(resolved.role).toBe('co-dm');
		expect(resolved.actorId).toBe(PREVIEW_CODM_ACTOR_ID);
		expect(resolved.label).toBe('Co-DM');
		expect(resolved.specific).toBe(false);

		const projected = permissionsWithPreviewActors(permissions);
		expect(projected.actors[PREVIEW_CODM_ACTOR_ID]!.role).toBe('co-dm');
		// The reserved co-dm actor has full dm-authority read.
		expect(hasDmAuthority(projected.actors[PREVIEW_CODM_ACTOR_ID]!.role)).toBe(true);
	});

	it('a specific co-dm actor is honoured only when it truly holds the co-dm role', () => {
		const coDm: Actor = { id: 'actor-codm', role: 'co-dm', displayName: 'Vex' };
		const permissions = buildPermissionState(DM_ACTOR, coDm, PLAYER_ACTOR);
		const specific = resolvePreviewActor(permissions, { role: 'co-dm', playerActorId: coDm.id });
		expect(specific.specific).toBe(true);
		expect(specific.actorId).toBe(coDm.id);
		expect(specific.label).toBe('Vex (Co-DM)');

		// A player id requested as co-dm falls back to the generic reserved actor (fail closed).
		const fallback = resolvePreviewActor(permissions, { role: 'co-dm', playerActorId: PLAYER_ACTOR.id });
		expect(fallback.specific).toBe(false);
		expect(fallback.actorId).toBe(PREVIEW_CODM_ACTOR_ID);
	});
});
