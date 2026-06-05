import { describe, expect, it } from 'vitest';
import {
	dispatchCommand,
	getHandoutDeliveryHistory,
	getHandoutForActor,
	getHandoutsForActor,
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
 * SES-004 — the DM delivers a handout as a Scene widget to SELECTED players with delivery history,
 * visibility enforcement (NON-recipients receive nothing), and optional/progressive reveal. The hard
 * assertion: a non-recipient (and an observer) NEVER receives any handout content.
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

function deliver(
	state: CoreStateSlice,
	env: CoreEnvironment,
	sceneId: string,
	recipientActorIds: string[],
	extra: Record<string, unknown> = {},
): CommandResult {
	return dispatch(state, env, {
		type: 'session.deliver-handout',
		actorId: DM_ACTOR.id,
		payload: {
			title: 'The cryptic letter',
			sceneId,
			recipientActorIds,
			sections: [
				{ id: 'sec-open', heading: 'Opening', body: 'You find a sealed letter.', visibility: 'player-visible' },
				{ id: 'sec-cipher', heading: 'Cipher', body: 'XJQ ZTP RVL', visibility: 'shared' },
				{ id: 'sec-dm', heading: 'DM notes', body: 'It is a trap.', visibility: 'dm-only' },
			],
			...extra,
		},
	});
}

describe('SES-004 handout delivery', () => {
	it('delivers a handout to Player A as a widget; Player B does NOT receive it (AC1, non-leak)', () => {
		const env = makeEnvironment();
		const { state, sceneId } = activeSession(env);
		const result = accept(deliver(state, env, sceneId, [PLAYER_ACTOR.id], { revealedSectionIds: ['sec-cipher'] }));
		const next = result.nextState;

		// A handout widget was added to the scene, referencing the handout by id (no content clone).
		const handoutWidget = next.scenes.scenes[sceneId]!.widgets.find((w) => w.type === 'handout');
		expect(handoutWidget).toBeDefined();
		const handoutId = handoutWidget!.configuration.handoutId as string;
		expect(Object.keys(next.session.handouts)).toContain(handoutId);

		// Player A (recipient) receives the handout with the player-visible + revealed shared sections; the
		// dm-only section is omitted.
		const forA = getHandoutForActor(next.session, next.permissions, PLAYER_ACTOR.id, handoutId);
		expect(forA.kind).toBe('available');
		if (forA.kind === 'available') {
			expect(forA.sections.map((s) => s.id)).toEqual(['sec-open', 'sec-cipher']);
			expect(forA.sections.find((s) => s.id === 'sec-dm')).toBeUndefined();
			expect(forA.isRecipient).toBe(true);
		}

		// Player B (non-recipient) receives NOTHING: unavailable, no title/sections/count leak.
		const forB = getHandoutForActor(next.session, next.permissions, PLAYER_B.id, handoutId);
		expect(forB).toEqual({ kind: 'unavailable' });
		expect(getHandoutsForActor(next.session, next.permissions, PLAYER_B.id)).toEqual([]);

		// An observer who is not a recipient also receives nothing (fail closed).
		expect(getHandoutForActor(next.session, next.permissions, OBSERVER_ACTOR.id, handoutId)).toEqual({
			kind: 'unavailable',
		});
	});

	it('excludes a hidden (unrevealed shared) section from the recipient payload (AC2)', () => {
		const env = makeEnvironment();
		const { state, sceneId } = activeSession(env);
		// Deliver WITHOUT revealing the cipher section.
		const result = accept(deliver(state, env, sceneId, [PLAYER_ACTOR.id]));
		const next = result.nextState;
		const handoutId = Object.keys(next.session.handouts)[0]!;

		const forA = getHandoutForActor(next.session, next.permissions, PLAYER_ACTOR.id, handoutId);
		expect(forA.kind).toBe('available');
		if (forA.kind === 'available') {
			// Only the player-visible section is delivered; the unrevealed shared section is withheld.
			expect(forA.sections.map((s) => s.id)).toEqual(['sec-open']);
		}

		// The DM sees every section regardless of reveal state.
		const forDm = getHandoutForActor(next.session, next.permissions, DM_ACTOR.id, handoutId);
		expect(forDm.kind).toBe('available');
		if (forDm.kind === 'available') {
			expect(forDm.sections.map((s) => s.id)).toEqual(['sec-open', 'sec-cipher', 'sec-dm']);
		}
	});

	it('progressively reveals a shared section to recipients (optional reveal)', () => {
		const env = makeEnvironment();
		const { state, sceneId } = activeSession(env);
		const delivered = accept(deliver(state, env, sceneId, [PLAYER_ACTOR.id]));
		const handoutId = Object.keys(delivered.nextState.session.handouts)[0]!;

		// Before reveal: cipher withheld from Player A.
		const before = getHandoutForActor(
			delivered.nextState.session,
			delivered.nextState.permissions,
			PLAYER_ACTOR.id,
			handoutId,
		);
		expect(before.kind === 'available' && before.sections.some((s) => s.id === 'sec-cipher')).toBe(false);

		// Reveal the cipher section.
		const revealed = accept(
			dispatch(delivered.nextState, env, {
				type: 'session.reveal-handout-section',
				actorId: DM_ACTOR.id,
				payload: { handoutId, sectionId: 'sec-cipher', revealed: true },
			}),
		).nextState;
		const after = getHandoutForActor(revealed.session, revealed.permissions, PLAYER_ACTOR.id, handoutId);
		expect(after.kind === 'available' && after.sections.some((s) => s.id === 'sec-cipher')).toBe(true);

		// Re-conceal it: the section is withheld again (reveal is reversible).
		const concealed = accept(
			dispatch(revealed, env, {
				type: 'session.reveal-handout-section',
				actorId: DM_ACTOR.id,
				payload: { handoutId, sectionId: 'sec-cipher', revealed: false },
			}),
		).nextState;
		const reconcealed = getHandoutForActor(concealed.session, concealed.permissions, PLAYER_ACTOR.id, handoutId);
		expect(reconcealed.kind === 'available' && reconcealed.sections.some((s) => s.id === 'sec-cipher')).toBe(
			false,
		);
	});

	it('records DELIVERY HISTORY (who received what, when), DM-only', () => {
		const env = makeEnvironment();
		const { state, sceneId } = activeSession(env);
		const first = accept(deliver(state, env, sceneId, [PLAYER_ACTOR.id]));
		const handoutId = Object.keys(first.nextState.session.handouts)[0]!;
		// Re-deliver the SAME handout to Player B (adds to the audience + history).
		const second = accept(deliver(first.nextState, env, sceneId, [PLAYER_B.id], { handoutId }));

		const history = getHandoutDeliveryHistory(second.nextState.session, second.nextState.permissions, DM_ACTOR.id);
		expect(history).toHaveLength(2);
		expect(history.map((row) => row.delivery.recipientActorId).sort()).toEqual(
			[PLAYER_ACTOR.id, PLAYER_B.id].sort(),
		);
		expect(history.every((row) => row.delivery.deliveredBy === DM_ACTOR.id)).toBe(true);
		expect(history.every((row) => typeof row.delivery.deliveredAt === 'string')).toBe(true);

		// Both Player A and Player B are now recipients of the handout.
		expect(second.nextState.session.handouts[handoutId]!.recipientActorIds.sort()).toEqual(
			[PLAYER_ACTOR.id, PLAYER_B.id].sort(),
		);

		// A non-DM gets an EMPTY delivery history (the audit is DM-only).
		expect(getHandoutDeliveryHistory(second.nextState.session, second.nextState.permissions, PLAYER_ACTOR.id)).toEqual(
			[],
		);
	});

	it('fails closed: a player cannot deliver, delivery requires an active session, and bad recipients reject', () => {
		const env = makeEnvironment();
		const { state, sceneId } = activeSession(env);

		// A player cannot deliver a handout (DM-only).
		const byPlayer = dispatch(state, env, {
			type: 'session.deliver-handout',
			actorId: PLAYER_ACTOR.id,
			payload: {
				title: 'x',
				sceneId,
				recipientActorIds: [PLAYER_B.id],
				sections: [{ heading: 'h', body: 'b', visibility: 'shared' }],
			},
		});
		expect(byPlayer.status).toBe('rejected');
		if (byPlayer.status === 'rejected') expect(byPlayer.rejection.code).toBe('actor-not-authorized');

		// The DM as a recipient is rejected (the DM is not a delivery target).
		const dmRecipient = deliver(state, env, sceneId, [DM_ACTOR.id]);
		expect(dmRecipient.status).toBe('rejected');
		if (dmRecipient.status === 'rejected') expect(dmRecipient.rejection.code).toBe('invalid-payload');

		// Delivery requires an active session.
		const idleBase = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const idleHome = accept(
			dispatch(idleBase, env, { type: 'command-center.ensure-home', actorId: DM_ACTOR.id, payload: {} }),
		).nextState;
		const idleScene = idleHome.commandCenter.homeSceneId!;
		const idleDeliver = deliver(idleHome, env, idleScene, [PLAYER_ACTOR.id]);
		expect(idleDeliver.status).toBe('rejected');
		if (idleDeliver.status === 'rejected') expect(idleDeliver.rejection.code).toBe('invalid-state');
	});
});
