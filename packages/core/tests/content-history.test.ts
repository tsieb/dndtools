import { describe, expect, it } from 'vitest';
import {
	buildInitialState,
	DM_ACTOR,
	PLAYER_ACTOR,
	makeEnvironment,
} from '../src/testing/fixtures';
import { dispatchCommand, getContentHistoryForActor, type CoreCommand } from '../src';
import { createOperationLog } from '../src/sync/operation-log';

function fixture() {
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
	const env = makeEnvironment();
	const run = (type: CoreCommand['type'], payload: unknown) => {
		const result = dispatchCommand(state, env, {
			type,
			actorId: DM_ACTOR.id,
			payload,
		} as CoreCommand);
		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') throw new Error(result.rejection.message);
		state = result.nextState;
		return result;
	};
	run('content.create-item', {
		kind: 'note',
		title: 'Journal',
		body: 'Original',
		visibility: 'dm-only',
	});
	const id = Object.keys(state.content.items)[0]!;
	const history = (actor = DM_ACTOR.id, now = state.sync.operations.at(-1)!.issuedAt) =>
		getContentHistoryForActor(state.content, state.permissions, state.sync, actor, id, now);
	return {
		run,
		id,
		history,
		get state() {
			return state;
		},
	};
}

describe('note revision history', () => {
	it('replays real commands deterministically and restores without rewinding', () => {
		const f = fixture();
		const initial = f.history()[0]!;
		f.run('content.update-item', {
			itemId: f.id,
			body: 'First edit',
			baseRevision: initial.revision,
		});
		f.run('content.update-item', {
			itemId: f.id,
			body: 'Second edit',
			baseRevision: initial.revision + 1,
		});
		const history = f.history();
		expect(history.map((row) => row.body)).toEqual(['Second edit', 'First edit', 'Original']);
		expect(history[0]!.lineDelta).toEqual({ added: 1, removed: 1 });
		const operations = JSON.parse(JSON.stringify(f.state.sync.operations));
		expect(
			getContentHistoryForActor(
				f.state.content,
				f.state.permissions,
				createOperationLog([...operations].reverse().concat(operations)),
				DM_ACTOR.id,
				f.id,
				f.state.sync.operations.at(-1)!.issuedAt,
			),
		).toEqual(history);
		f.run('content.update-item', {
			itemId: f.id,
			title: history[1]!.title,
			body: history[1]!.body,
			baseRevision: history[0]!.revision,
		});
		expect(f.history()[0]).toMatchObject({ body: 'First edit', revision: initial.revision + 3 });
		const before = f.state.content.items[f.id];
		f.run('content.update-item', {
			itemId: f.id,
			body: 'stale restore',
			baseRevision: initial.revision,
		});
		expect(f.state.content.items[f.id]).toEqual(before);
		expect(f.history()).toHaveLength(4);
	});

	it('never returns DM-only revisions, secret callouts, or hidden deltas to a player', () => {
		const f = fixture();
		f.run('content.update-item', { itemId: f.id, body: 'private\nprivate\nprivate' });
		expect(f.history(PLAYER_ACTOR.id)).toEqual([]);
		f.run('content.update-item', { itemId: f.id, body: 'Public\n\n> [!Secret]\n> hidden-canary' });
		f.run('content.set-item-visibility', { itemId: f.id, visibility: 'player-visible' });
		const player = f.history(PLAYER_ACTOR.id);
		expect(player).toHaveLength(1);
		expect(JSON.stringify(player)).not.toMatch(/private|hidden-canary|Original/);
		expect(player[0]!.lineDelta.removed).toBe(0);
		expect(f.history('unknown')).toEqual([]);
		f.run('content.set-item-visibility', { itemId: f.id, visibility: 'dm-only' });
		expect(f.history(PLAYER_ACTOR.id)).toEqual([]);
	});

	it('bounds results to 50 revisions and 30 days, and omits metadata-only legacy entries', () => {
		const f = fixture();
		for (let i = 0; i < 55; i++) f.run('content.update-item', { itemId: f.id, body: `Edit ${i}` });
		expect(f.history()).toHaveLength(50);
		const issued = Date.parse(f.state.sync.operations.at(-1)!.issuedAt);
		expect(f.history(DM_ACTOR.id, new Date(issued + 31 * 86400000).toISOString())).toEqual([]);
		const legacy = createOperationLog(
			f.state.sync.operations.map((op) => ({ ...op, value: { kind: 'note' } })),
		);
		expect(
			getContentHistoryForActor(
				f.state.content,
				f.state.permissions,
				legacy,
				DM_ACTOR.id,
				f.id,
				new Date(issued).toISOString(),
			),
		).toEqual([]);
	});

	it('checks shared membership at each revision and excludes deleted snapshots', () => {
		const f = fixture();
		f.run('content.set-item-visibility', {
			itemId: f.id,
			visibility: 'shared',
			sharedWith: [PLAYER_ACTOR.id],
		});
		expect(f.history(PLAYER_ACTOR.id)).toHaveLength(1);
		f.run('content.remove-item', { itemId: f.id });
		expect(f.history()).toEqual([]);
		f.run('content.restore-item', { itemId: f.id });
		expect(f.history(PLAYER_ACTOR.id)).toHaveLength(2);
	});
});
