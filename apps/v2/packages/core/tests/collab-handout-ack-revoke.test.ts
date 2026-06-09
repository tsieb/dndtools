import { describe, expect, it } from 'vitest';
import {
	dispatchCommand,
	getHandoutForActor,
	getHandoutStatusForDm,
	handoutRecipientSealed,
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
 * COLLAB-007 — the DM delivers handouts/images/notes/map-fragments/ciphers/rumors to SELECTED players with
 * DELIVERY ACKNOWLEDGEMENT and REVOCATION STATE. Hard assertions: ack recorded; revoke → SEALED/unavailable
 * to the recipient (unless persistent); non-recipient never receives content.
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
			kind: 'cipher',
			title: 'The cryptic letter',
			sceneId,
			recipientActorIds,
			sections: [
				{ id: 'sec-open', heading: 'Opening', body: 'A sealed letter.', visibility: 'player-visible' },
			],
			...extra,
		},
	});
}

describe('COLLAB-007 handout acknowledgement + revocation', () => {
	it('carries the content kind and records a recipient ACKNOWLEDGEMENT (delivered/opened status)', () => {
		const env = makeEnvironment();
		const { state, sceneId } = activeSession(env);
		const delivered = accept(deliver(state, env, sceneId, [PLAYER_ACTOR.id])).nextState;
		const handoutId = Object.keys(delivered.session.handouts)[0]!;

		// The recipient sees the handout with its kind; not yet acknowledged.
		const before = getHandoutForActor(delivered.session, delivered.permissions, PLAYER_ACTOR.id, handoutId);
		expect(before.kind).toBe('available');
		if (before.kind === 'available') {
			expect(before.handoutKind).toBe('cipher');
			expect(before.acknowledged).toBe(false);
		}

		// The recipient acknowledges receipt.
		const acked = accept(
			dispatch(delivered, env, {
				type: 'session.acknowledge-handout',
				actorId: PLAYER_ACTOR.id,
				payload: { handoutId },
			}),
		).nextState;
		const after = getHandoutForActor(acked.session, acked.permissions, PLAYER_ACTOR.id, handoutId);
		expect(after.kind === 'available' && after.acknowledged).toBe(true);

		// The DM status surface shows the per-recipient delivered/opened status.
		const status = getHandoutStatusForDm(acked.session, acked.permissions, DM_ACTOR.id);
		expect(status).toHaveLength(1);
		const recipient = status[0]!.recipients.find((r) => r.recipientActorId === PLAYER_ACTOR.id)!;
		expect(recipient.acknowledged).toBe(true);
		expect(recipient.acknowledgedAt).not.toBeNull();
		expect(recipient.revoked).toBe(false);

		// A non-DM gets an empty status surface (DM-only audit).
		expect(getHandoutStatusForDm(acked.session, acked.permissions, PLAYER_ACTOR.id)).toEqual([]);
	});

	it('REVOKES a handout → the recipient is SEALED/unavailable; a non-recipient was never able to see it', () => {
		const env = makeEnvironment();
		const { state, sceneId } = activeSession(env);
		const delivered = accept(deliver(state, env, sceneId, [PLAYER_ACTOR.id])).nextState;
		const handoutId = Object.keys(delivered.session.handouts)[0]!;

		// Player A (recipient) can see it; Player B (non-recipient) cannot — and never could.
		expect(getHandoutForActor(delivered.session, delivered.permissions, PLAYER_ACTOR.id, handoutId).kind).toBe(
			'available',
		);
		expect(getHandoutForActor(delivered.session, delivered.permissions, PLAYER_B.id, handoutId)).toEqual({
			kind: 'unavailable',
		});

		// The DM revokes Player A.
		const revoked = accept(
			dispatch(delivered, env, {
				type: 'session.revoke-handout',
				actorId: DM_ACTOR.id,
				payload: { handoutId, recipientActorIds: [PLAYER_ACTOR.id] },
			}),
		).nextState;

		// Player A is now SEALED: the read returns unavailable, indistinguishable from a non-recipient.
		const handout = revoked.session.handouts[handoutId]!;
		const playerA = revoked.permissions.actors[PLAYER_ACTOR.id]!;
		expect(handoutRecipientSealed(handout, playerA)).toBe(true);
		const sealed = getHandoutForActor(revoked.session, revoked.permissions, PLAYER_ACTOR.id, handoutId);
		expect(sealed).toEqual({ kind: 'unavailable' });
		// No content leak: the sealed result carries no title/sections.
		expect(JSON.stringify(sealed)).not.toContain('cryptic');

		// The DM still sees the handout + the revoked status.
		const status = getHandoutStatusForDm(revoked.session, revoked.permissions, DM_ACTOR.id);
		const recipient = status[0]!.recipients.find((r) => r.recipientActorId === PLAYER_ACTOR.id)!;
		expect(recipient.revoked).toBe(true);
		expect(recipient.sealed).toBe(true);

		// A sealed recipient can no longer acknowledge (fail closed; cannot probe existence).
		const ackAfterRevoke = dispatch(revoked, env, {
			type: 'session.acknowledge-handout',
			actorId: PLAYER_ACTOR.id,
			payload: { handoutId },
		});
		expect(ackAfterRevoke.status).toBe('rejected');
	});

	it('PERSISTENT access survives revocation (the COLLAB-010 exception applied to handouts)', () => {
		const env = makeEnvironment();
		const { state, sceneId } = activeSession(env);
		// Deliver to Player A with PERSISTENT access.
		const delivered = accept(
			deliver(state, env, sceneId, [PLAYER_ACTOR.id], { persistentRecipientActorIds: [PLAYER_ACTOR.id] }),
		).nextState;
		const handoutId = Object.keys(delivered.session.handouts)[0]!;

		// Revoke (whole handout): a persistent recipient is NOT sealed — they keep the content.
		const revoked = accept(
			dispatch(delivered, env, {
				type: 'session.revoke-handout',
				actorId: DM_ACTOR.id,
				payload: { handoutId },
			}),
		).nextState;
		const handout = revoked.session.handouts[handoutId]!;
		const playerA = revoked.permissions.actors[PLAYER_ACTOR.id]!;
		expect(handoutRecipientSealed(handout, playerA)).toBe(false);
		const view = getHandoutForActor(revoked.session, revoked.permissions, PLAYER_ACTOR.id, handoutId);
		expect(view.kind).toBe('available');
		if (view.kind === 'available') expect(view.persistent).toBe(true);
	});

	it('re-delivering to a revoked recipient CLEARS the seal (replay/recovery order)', () => {
		const env = makeEnvironment();
		const { state, sceneId } = activeSession(env);
		const delivered = accept(deliver(state, env, sceneId, [PLAYER_ACTOR.id])).nextState;
		const handoutId = Object.keys(delivered.session.handouts)[0]!;
		const revoked = accept(
			dispatch(delivered, env, {
				type: 'session.revoke-handout',
				actorId: DM_ACTOR.id,
				payload: { handoutId },
			}),
		).nextState;
		expect(getHandoutForActor(revoked.session, revoked.permissions, PLAYER_ACTOR.id, handoutId)).toEqual({
			kind: 'unavailable',
		});

		// Re-deliver the SAME handout to Player A: the seal is cleared, the handout is available again.
		const redelivered = accept(deliver(revoked, env, sceneId, [PLAYER_ACTOR.id], { handoutId })).nextState;
		expect(getHandoutForActor(redelivered.session, redelivered.permissions, PLAYER_ACTOR.id, handoutId).kind).toBe(
			'available',
		);
		const handout = redelivered.session.handouts[handoutId]!;
		expect(handout.revocations.some((r) => r.recipientActorId === PLAYER_ACTOR.id)).toBe(false);
	});

	it('AC3: offline delivery and revocation record deliveryStatus queued; replay order + persistent grant determine final visibility', () => {
		const env = makeEnvironment();
		const { state, sceneId } = activeSession(env);

		// Deliver OFFLINE → deliveryStatus must be 'queued'.
		const delivered = accept(
			deliver(state, env, sceneId, [PLAYER_ACTOR.id], { connectionState: 'offline' }),
		).nextState;
		const handoutId = Object.keys(delivered.session.handouts)[0]!;
		const handoutAfterDeliver = delivered.session.handouts[handoutId]!;
		expect(handoutAfterDeliver.deliveries[0]!.deliveryStatus).toBe('queued');

		// Despite the 'queued' flag, the player immediately sees the handout in local state.
		expect(getHandoutForActor(delivered.session, delivered.permissions, PLAYER_ACTOR.id, handoutId).kind).toBe(
			'available',
		);

		// Revoke OFFLINE → deliveryStatus on the op must also be 'queued'; player is sealed.
		const revoked = accept(
			dispatch(delivered, env, {
				type: 'session.revoke-handout',
				actorId: DM_ACTOR.id,
				payload: { handoutId, connectionState: 'offline' },
			}),
		).nextState;
		expect(getHandoutForActor(revoked.session, revoked.permissions, PLAYER_ACTOR.id, handoutId)).toEqual({
			kind: 'unavailable',
		});

		// Re-deliver OFFLINE (recovery order) → seal cleared; player sees it again; delivery status queued.
		const redelivered = accept(
			deliver(revoked, env, sceneId, [PLAYER_ACTOR.id], { handoutId, connectionState: 'offline' }),
		).nextState;
		expect(getHandoutForActor(redelivered.session, redelivered.permissions, PLAYER_ACTOR.id, handoutId).kind).toBe(
			'available',
		);
		const ho = redelivered.session.handouts[handoutId]!;
		const lastDelivery = ho.deliveries[ho.deliveries.length - 1]!;
		expect(lastDelivery.deliveryStatus).toBe('queued');
		expect(ho.revocations.some((r) => r.recipientActorId === PLAYER_ACTOR.id)).toBe(false);

		// Persistent grant: deliver offline with persistent, revoke offline → retained.
		const persistentDelivered = accept(
			deliver(state, env, sceneId, [PLAYER_ACTOR.id], {
				persistentRecipientActorIds: [PLAYER_ACTOR.id],
				connectionState: 'offline',
			}),
		).nextState;
		const persistentId = Object.keys(persistentDelivered.session.handouts)[0]!;
		const revokedPersistent = accept(
			dispatch(persistentDelivered, env, {
				type: 'session.revoke-handout',
				actorId: DM_ACTOR.id,
				payload: { handoutId: persistentId, connectionState: 'offline' },
			}),
		).nextState;
		expect(
			getHandoutForActor(revokedPersistent.session, revokedPersistent.permissions, PLAYER_ACTOR.id, persistentId).kind,
		).toBe('available');
	});

	it('fails closed: a player cannot revoke; the DM cannot acknowledge; persistent must be a recipient', () => {
		const env = makeEnvironment();
		const { state, sceneId } = activeSession(env);
		const delivered = accept(deliver(state, env, sceneId, [PLAYER_ACTOR.id])).nextState;
		const handoutId = Object.keys(delivered.session.handouts)[0]!;

		// A player cannot revoke (DM-only).
		const playerRevoke = dispatch(delivered, env, {
			type: 'session.revoke-handout',
			actorId: PLAYER_ACTOR.id,
			payload: { handoutId },
		});
		expect(playerRevoke.status).toBe('rejected');
		if (playerRevoke.status === 'rejected') expect(playerRevoke.rejection.code).toBe('actor-not-authorized');

		// The DM cannot acknowledge a delivery.
		const dmAck = dispatch(delivered, env, {
			type: 'session.acknowledge-handout',
			actorId: DM_ACTOR.id,
			payload: { handoutId },
		});
		expect(dmAck.status).toBe('rejected');

		// A non-recipient cannot acknowledge (treated as not-found — no probe).
		const nonRecipientAck = dispatch(delivered, env, {
			type: 'session.acknowledge-handout',
			actorId: PLAYER_B.id,
			payload: { handoutId },
		});
		expect(nonRecipientAck.status).toBe('rejected');

		// Persistence cannot be granted to a non-recipient.
		const badPersistent = deliver(delivered, env, sceneId, [PLAYER_ACTOR.id], {
			handoutId,
			persistentRecipientActorIds: [PLAYER_B.id],
		});
		expect(badPersistent.status).toBe('rejected');
	});
});
