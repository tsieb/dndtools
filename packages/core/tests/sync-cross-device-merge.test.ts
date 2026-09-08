import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	SYNC_OPERATION_SCHEMA_VERSION,
	deriveVaultConflicts,
	dispatchCommand,
	getConflictLifecycle,
	isConflictDetectionOpType,
	isMergeConflictOpType,
	mergeConflictId,
	planCrossDeviceMerge,
	summarizeMergePlan,
	type CommandResult,
	type CoreStateSlice,
	type SyncOperation,
} from '../src';

/**
 * RC-CLD-2.4 — cross-device merge sync.
 *
 * Two devices hold the same vault. These tests prove the comparison between their op-logs classifies
 * every case honestly, that a real divergence becomes a durable conflict record on the SAME substrate
 * the existing DM resolution already closes, and that re-running the merge never duplicates a record.
 */

function op(id: string, entityId: string, overrides: Partial<SyncOperation> = {}): SyncOperation {
	return {
		id,
		vaultId: 'vault-1',
		sourceId: 'device-a',
		actorId: DM_ACTOR.id,
		entityType: 'scene',
		entityId,
		opType: 'scene.update',
		path: `scene/${entityId}/name`,
		value: { name: id },
		dependencies: [],
		issuedAt: '2026-09-07T10:00:00.000Z',
		schemaVersion: SYNC_OPERATION_SCHEMA_VERSION,
		...overrides,
	};
}

function accepted(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	expect(result.status).toBe('accepted');
	if (result.status !== 'accepted') throw new Error('expected accepted');
	return result;
}

function rejected(result: CommandResult): Extract<CommandResult, { status: 'rejected' }> {
	expect(result.status).toBe('rejected');
	if (result.status !== 'rejected') throw new Error('expected rejected');
	return result;
}

/** A vault whose op-log already holds `ops`, as if this device had authored them. */
function stateWithOps(ops: SyncOperation[]): CoreStateSlice {
	const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
	return { ...base, sync: { operations: ops, idempotencyKeys: new Set<string>() } };
}

describe('planCrossDeviceMerge', () => {
	it('reports up-to-date when both devices hold the same history', () => {
		const shared = [op('op-1', 'scene-1'), op('op-2', 'scene-2')];
		const plan = planCrossDeviceMerge({ localOperations: shared, remoteOperations: shared });
		expect(plan.outcome).toBe('up-to-date');
		expect(plan.agreedRevision).toBe(1);
		expect(plan.incoming).toHaveLength(0);
		expect(plan.outgoing).toHaveLength(0);
		expect(plan.divergences).toHaveLength(0);
	});

	it('reports fast-forward when the cloud strictly contains this device’s history', () => {
		const local = [op('op-1', 'scene-1')];
		const remote = [op('op-1', 'scene-1'), op('op-2', 'scene-2'), op('op-3', 'scene-3')];
		const plan = planCrossDeviceMerge({ localOperations: local, remoteOperations: remote });
		expect(plan.outcome).toBe('fast-forward');
		expect(plan.incoming.map((entry) => entry.id)).toEqual(['op-2', 'op-3']);
		expect(plan.outgoing).toHaveLength(0);
		expect(plan.divergences).toHaveLength(0);
		expect(plan.agreedRevision).toBe(0);
	});

	it('reports push-only when this device is ahead', () => {
		const plan = planCrossDeviceMerge({
			localOperations: [op('op-1', 'scene-1'), op('op-2', 'scene-2')],
			remoteOperations: [op('op-1', 'scene-1')],
		});
		expect(plan.outcome).toBe('push-only');
		expect(plan.outgoing.map((entry) => entry.id)).toEqual(['op-2']);
		expect(plan.incoming).toHaveLength(0);
	});

	it('names every entity both devices changed, with each side’s newest operation', () => {
		const plan = planCrossDeviceMerge({
			localOperations: [
				op('op-1', 'scene-1'),
				op('local-a', 'scene-1', { value: { name: 'Local first' } }),
				op('local-b', 'scene-1', { value: { name: 'Local newest' } }),
				op('local-c', 'scene-9'),
			],
			remoteOperations: [
				op('op-1', 'scene-1'),
				op('remote-a', 'scene-1', { sourceId: 'device-b', value: { name: 'Remote newest' } }),
				op('remote-b', 'scene-7', { sourceId: 'device-b' }),
			],
		});
		expect(plan.outcome).toBe('diverged');
		expect(plan.agreedRevision).toBe(0);
		expect(plan.divergences).toHaveLength(1);
		const divergence = plan.divergences[0]!;
		expect(divergence.entityKey).toBe('scene:scene-1');
		// The NEWEST edit per side is what the DM is asked to choose between.
		expect(divergence.local.operationId).toBe('local-b');
		expect(divergence.remote.operationId).toBe('remote-a');
		expect(divergence.local.revision).toBe(2);
		expect(divergence.remote.revision).toBe(1);
		expect(divergence.ancestorRevision).toBe(0);
		expect(divergence.path).toBe('scene/scene-1/name');
		// scene-9 and scene-7 were each touched by one device only — nothing contradicts them.
		expect(summarizeMergePlan(plan)).toEqual({
			outcome: 'diverged',
			incomingCount: 2,
			outgoingCount: 3,
			conflictCount: 1,
			agreedRevision: 0,
		});
	});

	it('leaves the path unset when the two sides changed different fields of one entity', () => {
		const plan = planCrossDeviceMerge({
			localOperations: [op('local-a', 'scene-1', { path: 'scene/scene-1/name' })],
			remoteOperations: [op('remote-a', 'scene-1', { path: 'scene/scene-1/description' })],
		});
		expect(plan.divergences[0]!.path).toBeNull();
	});

	it('compares only the tails when a base revision is supplied', () => {
		const plan = planCrossDeviceMerge({
			localOperations: [op('local-a', 'scene-1')],
			remoteOperations: [op('remote-a', 'scene-1')],
			baseRevision: 41,
		});
		expect(plan.agreedRevision).toBe(41);
		expect(plan.divergences[0]!.local.revision).toBe(42);
		expect(plan.divergences[0]!.remote.revision).toBe(42);
	});

	it('derives the same conflict id from the same pair of operations', () => {
		const build = () =>
			planCrossDeviceMerge({
				localOperations: [op('local-a', 'scene-1')],
				remoteOperations: [op('remote-a', 'scene-1')],
			});
		expect(build().divergences[0]!.conflictId).toBe(build().divergences[0]!.conflictId);
		expect(build().divergences[0]!.conflictId).toBe(mergeConflictId('local-a', 'remote-a'));
	});

	it('orders divergences by entity, not by the order the cloud happened to store them', () => {
		const plan = planCrossDeviceMerge({
			localOperations: [op('l-1', 'scene-b'), op('l-2', 'scene-a')],
			remoteOperations: [op('r-1', 'scene-b'), op('r-2', 'scene-a')],
		});
		expect(plan.divergences.map((entry) => entry.entityKey)).toEqual([
			'scene:scene-a',
			'scene:scene-b',
		]);
	});
});

describe('sync.merge-remote', () => {
	const remoteTail = [
		op('remote-a', 'scene-1', { sourceId: 'device-b', value: { name: 'Tablet' } }),
	];

	it('records a durable conflict the existing lifecycle derives and the DM can resolve', () => {
		const state = stateWithOps([op('local-a', 'scene-1', { value: { name: 'Laptop' } })]);
		const result = accepted(
			dispatchCommand(state, makeEnvironment(), {
				type: 'sync.merge-remote',
				actorId: DM_ACTOR.id,
				payload: { remoteOperations: remoteTail },
			}),
		);
		expect(result.operationIds).toHaveLength(1);
		expect(result.events).toEqual([
			{
				kind: 'sync.merge-recorded',
				actorId: DM_ACTOR.id,
				outcome: 'diverged',
				agreedRevision: -1,
				incomingCount: 1,
				outgoingCount: 1,
				conflictCount: 1,
				recordedConflictCount: 1,
			},
		]);

		const recorded = result.nextState.sync.operations.at(-1)!;
		expect(recorded.opType).toBe('scene.merge-conflict');
		expect(isMergeConflictOpType(recorded.opType)).toBe(true);
		// It satisfies the lifecycle's detection test, so it needs no second derivation path.
		expect(isConflictDetectionOpType(recorded.opType)).toBe(true);

		const conflicts = deriveVaultConflicts(
			result.nextState.sync.operations,
			result.nextState.sync.operations,
		);
		expect(conflicts).toHaveLength(1);
		expect(conflicts[0]!.reason).toBe('source-revision-diverged');
		expect(conflicts[0]!.resolvedAt).toBeNull();
		expect(conflicts[0]!.local.value).toEqual({ name: 'Laptop' });
		expect(conflicts[0]!.remote.value).toEqual({ name: 'Tablet' });

		const resolved = accepted(
			dispatchCommand(result.nextState, makeEnvironment(), {
				type: 'conflict.resolve',
				actorId: DM_ACTOR.id,
				payload: {
					entityType: 'scene',
					entityId: 'scene-1',
					conflictId: conflicts[0]!.id,
					selectedValue: { name: 'Tablet' },
					sourceLocalRevision: conflicts[0]!.local.revision,
					sourceRemoteRevision: conflicts[0]!.remote.revision,
				},
			}),
		);
		const view = getConflictLifecycle(resolved.nextState.permissions, DM_ACTOR.id, {
			operations: resolved.nextState.sync.operations,
		});
		expect(view.kind).toBe('conflict-lifecycle');
		if (view.kind !== 'conflict-lifecycle') throw new Error('expected a view');
		expect(view.unresolvedCount).toBe(0);
	});

	it('is idempotent: merging the same cloud tail twice records the conflict once', () => {
		const state = stateWithOps([op('local-a', 'scene-1')]);
		const first = accepted(
			dispatchCommand(state, makeEnvironment(), {
				type: 'sync.merge-remote',
				actorId: DM_ACTOR.id,
				payload: { remoteOperations: remoteTail },
			}),
		);
		const second = accepted(
			dispatchCommand(first.nextState, makeEnvironment(), {
				type: 'sync.merge-remote',
				actorId: DM_ACTOR.id,
				payload: { remoteOperations: remoteTail },
			}),
		);
		expect(second.operationIds).toHaveLength(0);
		expect(second.nextState.sync.operations).toHaveLength(first.nextState.sync.operations.length);
		expect(
			deriveVaultConflicts(second.nextState.sync.operations, second.nextState.sync.operations),
		).toHaveLength(1);
	});

	it('records nothing when the cloud strictly contains this device’s history', () => {
		const state = stateWithOps([op('op-1', 'scene-1')]);
		const result = accepted(
			dispatchCommand(state, makeEnvironment(), {
				type: 'sync.merge-remote',
				actorId: DM_ACTOR.id,
				payload: { remoteOperations: [op('op-1', 'scene-1'), op('op-2', 'scene-2')] },
			}),
		);
		expect(result.operationIds).toHaveLength(0);
		expect(result.nextState.sync.operations).toHaveLength(1);
		expect(result.events[0]).toMatchObject({ outcome: 'fast-forward', conflictCount: 0 });
	});

	it('is DM-only', () => {
		const state = stateWithOps([op('local-a', 'scene-1')]);
		const result = rejected(
			dispatchCommand(state, makeEnvironment(), {
				type: 'sync.merge-remote',
				actorId: PLAYER_ACTOR.id,
				payload: { remoteOperations: remoteTail },
			}),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});

	it('rejects a malformed cloud operation rather than deriving a conflict from it', () => {
		const state = stateWithOps([op('local-a', 'scene-1')]);
		const result = rejected(
			dispatchCommand(state, makeEnvironment(), {
				type: 'sync.merge-remote',
				actorId: DM_ACTOR.id,
				payload: { remoteOperations: [{ id: 'remote-a', entityType: 'scene' }] },
			}),
		);
		expect(result.rejection.code).toBe('invalid-payload');
	});

	it('rejects a base revision past the end of this device’s history', () => {
		const state = stateWithOps([op('local-a', 'scene-1')]);
		const result = rejected(
			dispatchCommand(state, makeEnvironment(), {
				type: 'sync.merge-remote',
				actorId: DM_ACTOR.id,
				payload: { remoteOperations: remoteTail, baseRevision: 40 },
			}),
		);
		expect(result.rejection.code).toBe('revision-conflict');
	});
});
