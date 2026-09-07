import { describe, expect, it } from 'vitest';
import { dispatchCommand, type CoreCommand, type CoreStateSlice } from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

function initial(): CoreStateSlice {
	return buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
}

function rename(payload: Record<string, unknown>, actorId = DM_ACTOR.id): CoreCommand {
	return { type: 'permission.rename-actor', actorId, payload };
}

describe('permission.rename-actor command', () => {
	it('the DM renames their own seat: name changes, role untouched, durable op + event', () => {
		const result = dispatchCommand(
			initial(),
			makeEnvironment(),
			rename({ targetActorId: DM_ACTOR.id, displayName: '  Jade  ' }),
		);
		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') return;
		const dm = result.nextState.permissions.actors[DM_ACTOR.id]!;
		expect(dm.displayName).toBe('Jade');
		expect(dm.role).toBe('dm');
		expect(result.operationIds).toHaveLength(1);
		const op = result.nextState.sync.operations.at(-1)!;
		expect(op.opType).toBe('permission.rename-actor');
		expect(op.entityType).toBe('permission-actor');
		expect(result.events).toEqual([
			{
				kind: 'permission.actor-renamed',
				targetActorId: DM_ACTOR.id,
				displayName: 'Jade',
				previousDisplayName: DM_ACTOR.displayName,
				actorId: DM_ACTOR.id,
			},
		]);
	});

	it('the owner DM may rename any participant', () => {
		const result = dispatchCommand(
			initial(),
			makeEnvironment(),
			rename({ targetActorId: PLAYER_ACTOR.id, displayName: 'Renamed Player' }),
		);
		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') return;
		expect(result.nextState.permissions.actors[PLAYER_ACTOR.id]!.displayName).toBe(
			'Renamed Player',
		);
	});

	it('a player may rename themselves but nobody else (fail closed)', () => {
		const self = dispatchCommand(
			initial(),
			makeEnvironment(),
			rename({ targetActorId: PLAYER_ACTOR.id, displayName: 'Me' }, PLAYER_ACTOR.id),
		);
		expect(self.status).toBe('accepted');

		const other = dispatchCommand(
			initial(),
			makeEnvironment(),
			rename({ targetActorId: OBSERVER_ACTOR.id, displayName: 'Nope' }, PLAYER_ACTOR.id),
		);
		expect(other.status).toBe('rejected');
		if (other.status !== 'rejected') return;
		expect(other.rejection.code).toBe('actor-not-authorized');
	});

	it('rejects blank / over-long names and unknown targets without touching state', () => {
		const state = initial();
		for (const payload of [
			{ targetActorId: DM_ACTOR.id, displayName: '   ' },
			{ targetActorId: DM_ACTOR.id, displayName: 'x'.repeat(61) },
			{ targetActorId: 'ghost', displayName: 'Ghost' },
		]) {
			const result = dispatchCommand(state, makeEnvironment(), rename(payload));
			expect(result.status).toBe('rejected');
			expect(result.nextState).toBe(state);
		}
	});

	it('an unchanged name is accepted idempotently with no op', () => {
		const result = dispatchCommand(
			initial(),
			makeEnvironment(),
			rename({ targetActorId: DM_ACTOR.id, displayName: DM_ACTOR.displayName }),
		);
		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') return;
		expect(result.operationIds).toHaveLength(0);
	});
});
