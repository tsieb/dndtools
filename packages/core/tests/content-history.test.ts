import { describe, expect, it } from 'vitest';
import {
	buildInitialState,
	DM_ACTOR,
	PLAYER_ACTOR,
	makeEnvironment,
} from '../src/testing/fixtures';
import { dispatchCommand, getContentHistoryForActor, type CoreCommand } from '../src';
import { filterCatchUpStream, filterReplicationStream } from '../src/collab/replication-filter';
import { contentItemVisibilityMetadata } from '../src/state/content';
import { CONTENT_REVISION_PATCH_MAX_BYTES } from '../src/queries/content-history';
import { CONTENT_HISTORY_ENTITY_TYPE, createOperationLog } from '../src/sync/operation-log';

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

	it('keeps private snapshots out of serialized live and catch-up player streams', () => {
		const f = fixture();
		f.run('content.update-item', { itemId: f.id, body: 'PRIVATE-HISTORY-CANARY' });
		f.run('content.update-item', { itemId: f.id, body: 'Public text' });
		f.run('content.set-item-visibility', { itemId: f.id, visibility: 'player-visible' });
		const streams = () => {
			const metadata = contentItemVisibilityMetadata(f.state.content.items[f.id]!);
			const resolve = (op: (typeof f.state.sync.operations)[number]) =>
				op.entityType === metadata.entityType && op.entityId === metadata.entityId
					? metadata
					: undefined;
			// Exercise the actual wire shape, including after durable serialization/reload.
			const operations = JSON.parse(JSON.stringify(f.state.sync.operations));
			return [
				filterReplicationStream(operations, PLAYER_ACTOR, resolve, f.state.permissions),
				filterCatchUpStream(operations, PLAYER_ACTOR, resolve, new Set(), f.state.permissions),
			];
		};
		for (const stream of streams()) {
			expect(stream.delivered.length).toBeGreaterThan(0);
			expect(JSON.stringify(stream.delivered)).not.toContain('PRIVATE-HISTORY-CANARY');
			expect(stream.delivered.every((op) => op.entityType === 'content-item')).toBe(true);
		}
		f.run('content.update-item', {
			itemId: f.id,
			body: 'Public text\n\n> [!Secret]\n> SECRET-CALLOUT-CANARY',
		});
		f.run('content.remove-item', { itemId: f.id });
		f.run('content.restore-item', { itemId: f.id });
		for (const stream of streams()) {
			expect(JSON.stringify(stream.delivered)).not.toMatch(
				/PRIVATE-HISTORY-CANARY|SECRET-CALLOUT-CANARY|snapshot/,
			);
		}
		expect(JSON.stringify(f.history())).toContain('PRIVATE-HISTORY-CANARY');
		expect(JSON.stringify(f.history(PLAYER_ACTOR.id))).not.toMatch(
			/PRIVATE-HISTORY-CANARY|SECRET-CALLOUT-CANARY/,
		);
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

	it('stores bounded reverse deltas, never whole bodies, so cloud-backup caps hold', () => {
		const f = fixture();
		const historyOps = () =>
			f.state.sync.operations.filter((op) => op.entityType === CONTENT_HISTORY_ENTITY_TYPE);
		const bytes = (ops: readonly unknown[]) => new TextEncoder().encode(JSON.stringify(ops)).length;
		// A 60 KB paste records nothing of the pasted text (its reverse is a deletion).
		const big = 'lorem ipsum dolor sit amet\n'.repeat(2300);
		f.run('content.update-item', { itemId: f.id, body: big });
		expect(bytes([historyOps().at(-1)])).toBeLessThan(1024);
		// 200 autosaves while typing into a 60 KB note stay tiny (was ~20 KB per save as snapshots).
		const baseline = bytes(historyOps());
		let body = big;
		for (let i = 0; i < 200; i++) {
			body = `${body.slice(0, 30_000)}x${body.slice(30_000)}`;
			f.run('content.update-item', { itemId: f.id, body });
		}
		expect(bytes(historyOps()) - baseline).toBeLessThan(200 * 1024);
		expect(f.history()[0]!.body).toBe(body);
		expect(f.history()[1]!.body).toBe(body.replace('x', ''));
		// Deleting more than the cap records a gap; history stops there instead of storing the body.
		f.run('content.update-item', { itemId: f.id, body: 'short' });
		const gap = historyOps().at(-1)!;
		expect((gap.value as { back: unknown }).back).toBeNull();
		expect(bytes([gap])).toBeLessThan(1024);
		expect(f.history().map((row) => row.body)).toEqual(['short']);
		// Every recorded op stays far below the 64 KiB per-op ciphertext cap.
		for (const op of historyOps())
			expect(bytes([op])).toBeLessThan(CONTENT_REVISION_PATCH_MAX_BYTES + 1024);
	});

	it('restores exact prose across titles and astral characters', () => {
		const f = fixture();
		f.run('content.update-item', { itemId: f.id, title: 'Log 🐉', body: 'a🐉b\nline two' });
		f.run('content.update-item', { itemId: f.id, body: 'a🐲b\nline 2' });
		f.run('content.update-item', { itemId: f.id, title: 'Log', body: '' });
		expect(f.history().map((row) => [row.title, row.body])).toEqual([
			['Log', ''],
			['Log 🐉', 'a🐲b\nline 2'],
			['Log 🐉', 'a🐉b\nline two'],
			['Journal', 'Original'],
		]);
	});

	it('ends history at an unrecorded prose change instead of reconstructing wrong text', () => {
		const f = fixture();
		f.run('content.update-item', { itemId: f.id, body: 'one' });
		const item = f.state.content.items[f.id]!;
		const tampered = { ...f.state.content, items: { [f.id]: { ...item, body: 'elsewhere' } } };
		expect(
			getContentHistoryForActor(
				tampered,
				f.state.permissions,
				f.state.sync,
				DM_ACTOR.id,
				f.id,
				f.state.sync.operations.at(-1)!.issuedAt,
			),
		).toEqual([]);
	});
});
