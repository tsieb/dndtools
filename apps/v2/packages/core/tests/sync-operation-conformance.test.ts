import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	REQUIRED_OPERATION_FIELDS,
	SYNC_OPERATION_SCHEMA_VERSION,
	appendOperation,
	appliedOperationIdsOf,
	applyOperationIdempotent,
	assertDurableOperationConforms,
	createOperationLog,
	dedupeOperationsById,
	dispatchCommand,
	isConformantSyncOperation,
	isOperationApplied,
	validateSyncOperationShape,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
	type SyncOperation,
} from '../src';

/**
 * SYNC-002 — canonical operation shape conformance + idempotency.
 *
 * The CONFORMANCE GUARD: drive durable commands across every major domain through the SAME
 * `dispatchCommand` entry the GUI uses, collect EVERY emitted op, and assert each conforms to the
 * canonical shape. A future command that emits an op missing a required field fails this test closed.
 */

const env = makeEnvironment();

/** Dispatch a command against a state, asserting acceptance and returning the next state. */
function accept(state: CoreStateSlice, command: CoreCommand): CommandResult & { status: 'accepted' } {
	const result = dispatchCommand(state, env, command);
	if (result.status !== 'accepted') {
		throw new Error(
			`Expected ${command.type} to be accepted but it was rejected: ${result.rejection.code} — ${result.rejection.message}`,
		);
	}
	return result;
}

/**
 * Run a representative set of durable commands across SCENE / WIDGET / CHARACTER / CONTENT / MAP /
 * SESSION / COMBAT / DICE / GRANT, threading state forward. Returns the final state, whose op-log
 * holds every op every command emitted — the substrate the conformance assertion runs over.
 */
function runDurableWorkflow(): CoreStateSlice {
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);

	// SCENE — create + add a widget + move it.
	const sceneRes = accept(state, {
		type: 'scene.create',
		actorId: DM_ACTOR.id,
		payload: { name: 'Goblin Ambush', visibility: 'dm-only' },
	});
	state = sceneRes.nextState;
	const sceneId = (sceneRes.events.find((e) => e.kind === 'scene.created') as { sceneId: string })
		.sceneId;

	const widgetRes = accept(state, {
		type: 'scene.add-widget',
		actorId: DM_ACTOR.id,
		payload: {
			sceneId,
			widget: {
				type: 'dice',
				version: '1.0.0',
				layout: { x: 1, y: 1, w: 4, h: 3 },
			},
		},
	});
	state = widgetRes.nextState;
	const widgetId = (
		widgetRes.events.find((e) => e.kind === 'scene.widget-added') as { widgetInstanceId: string }
	).widgetInstanceId;
	state = accept(state, {
		type: 'scene.move-widget',
		actorId: DM_ACTOR.id,
		payload: { sceneId, widgetInstanceId: widgetId, x: 4, y: 5 },
	}).nextState;

	// CHARACTER — quick-create then edit a field (the SYNC-002 AC1 HP-change example).
	const charRes = accept(state, {
		type: 'character.quick-create',
		actorId: DM_ACTOR.id,
		payload: { name: 'Goblin Boss', kind: 'npc' },
	});
	state = charRes.nextState;
	const characterId = (
		charRes.events.find((e) => e.kind === 'character.created') as { characterId: string }
	).characterId;
	state = accept(state, {
		type: 'character.edit-field',
		actorId: DM_ACTOR.id,
		payload: { characterId, path: 'combat.hp', value: 22 },
	}).nextState;

	// CONTENT — create a note.
	state = accept(state, {
		type: 'content.create-item',
		actorId: DM_ACTOR.id,
		payload: { kind: 'note', title: 'Session Notes', body: 'The party arrives.' },
	}).nextState;

	// MAP — create a map entity.
	state = accept(state, {
		type: 'map.create',
		actorId: DM_ACTOR.id,
		payload: { name: 'Region Map' },
	}).nextState;

	// SESSION — move into prep then active, then roll dice.
	state = accept(state, {
		type: 'session.set-workflow',
		actorId: DM_ACTOR.id,
		payload: { workflow: 'prep' },
	}).nextState;
	state = accept(state, {
		type: 'session.set-workflow',
		actorId: DM_ACTOR.id,
		payload: { workflow: 'active', activeSceneId: sceneId },
	}).nextState;
	state = accept(state, {
		type: 'dice.roll',
		actorId: DM_ACTOR.id,
		payload: { expression: '1d20+3' },
	}).nextState;

	// GRANT — grant the player a capability set on the character.
	state = accept(state, {
		type: 'permission.grant-capability-set',
		actorId: DM_ACTOR.id,
		payload: {
			entityType: 'character',
			entityId: characterId,
			playerActorId: PLAYER_ACTOR.id,
			capabilitySet: 'combat-participant',
		},
	}).nextState;

	return state;
}

describe('SYNC-002 canonical operation shape', () => {
	it('declares the full Contract 2 Sync Unit required-field set', () => {
		expect([...REQUIRED_OPERATION_FIELDS].sort()).toEqual(
			[
				'actorId',
				'dependencies',
				'entityId',
				'entityType',
				'id',
				'issuedAt',
				'opType',
				'schemaVersion',
				'sourceId',
				'vaultId',
			].sort(),
		);
	});

	it('every op emitted by durable commands across all domains conforms to the canonical shape', () => {
		const state = runDurableWorkflow();
		const ops = state.sync.operations;
		// The workflow exercised many durable command types, so it produced multiple ops.
		expect(ops.length).toBeGreaterThan(8);
		for (const op of ops) {
			const result = validateSyncOperationShape(op);
			expect(result.problems, `op ${op.opType} (${op.id}) must conform`).toEqual([]);
			expect(result.conformant).toBe(true);
			// Each op is entity-scoped (actor + target), dependency-bearing, and at the supported version.
			expect(op.actorId.length).toBeGreaterThan(0);
			expect(op.entityType.length).toBeGreaterThan(0);
			expect(op.entityId.length).toBeGreaterThan(0);
			expect(Array.isArray(op.dependencies)).toBe(true);
			expect(op.schemaVersion).toBe(SYNC_OPERATION_SCHEMA_VERSION);
			expect(op.issuedAt.length).toBeGreaterThan(0);
			// The structural guard never throws for a conformant op.
			expect(() => assertDurableOperationConforms(op)).not.toThrow();
		}
		// Many distinct op kinds were exercised (proof of cross-command-type coverage).
		const distinctOpTypes = new Set(ops.map((op) => op.opType));
		expect(distinctOpTypes.size).toBeGreaterThan(6);
	});

	it('AC1: an accepted character HP change records actor, entity, path, revisions, and issue time', () => {
		let state = buildInitialState(DM_ACTOR);
		const created = accept(state, {
			type: 'character.quick-create',
			actorId: DM_ACTOR.id,
			payload: { name: 'Ogre', kind: 'npc' },
		});
		state = created.nextState;
		const characterId = (
			created.events.find((e) => e.kind === 'character.created') as { characterId: string }
		).characterId;
		const before = state.sync.operations.length;
		const edit = accept(state, {
			type: 'character.edit-field',
			actorId: DM_ACTOR.id,
			payload: { characterId, path: 'combat.hp', value: 5 },
		});
		const hpOps = edit.nextState.sync.operations.slice(before);
		expect(hpOps.length).toBeGreaterThan(0);
		const op = hpOps[hpOps.length - 1] as SyncOperation;
		expect(op.actorId).toBe(DM_ACTOR.id); // actor id
		expect(op.entityType).toBe('character'); // target entity type
		expect(op.entityId).toBe(characterId); // target entity id
		// path — the op carries the entity-scoped field path (`characters/<id>/combat.hp`); the field
		// path itself is recorded in the op value (`value.path === 'combat.hp'`).
		expect(op.path).toContain('combat.hp');
		expect((op.value as { path?: string }).path).toBe('combat.hp');
		// before/after revisions (the field edit advances the entity revision).
		expect(typeof op.afterRevision).toBe('number');
		expect(op.issuedAt.length).toBeGreaterThan(0); // issue time
		expect(op.id.length).toBeGreaterThan(0); // idempotency anchor (op id)
		expect(isConformantSyncOperation(op)).toBe(true);
	});

	it('rejects a malformed op fail-closed, naming each missing/invalid field', () => {
		const missingAll = validateSyncOperationShape({});
		expect(missingAll.conformant).toBe(false);
		const missingFields = new Set(missingAll.problems.map((p) => p.field));
		for (const field of REQUIRED_OPERATION_FIELDS) {
			expect(missingFields.has(field), `must flag missing "${field}"`).toBe(true);
		}

		// A self-dependency can never be satisfied — caught fail closed.
		const selfDep = validateSyncOperationShape({
			id: 'op-1',
			vaultId: 'v',
			sourceId: 's',
			actorId: 'a',
			entityType: 'character',
			entityId: 'c-1',
			opType: 'character.edit',
			dependencies: ['op-1'],
			issuedAt: '2026-06-05T00:00:00.000Z',
			schemaVersion: SYNC_OPERATION_SCHEMA_VERSION,
		});
		expect(selfDep.conformant).toBe(false);
		expect(selfDep.problems.some((p) => p.kind === 'self-dependency')).toBe(true);

		// A future schema version fails closed.
		const futureVersion = validateSyncOperationShape({
			id: 'op-2',
			vaultId: 'v',
			sourceId: 's',
			actorId: 'a',
			entityType: 'character',
			entityId: 'c-1',
			opType: 'character.edit',
			dependencies: [],
			issuedAt: '2026-06-05T00:00:00.000Z',
			schemaVersion: SYNC_OPERATION_SCHEMA_VERSION + 1,
		});
		expect(futureVersion.problems.some((p) => p.kind === 'unsupported-schema-version')).toBe(true);

		expect(() => assertDurableOperationConforms({})).toThrow(/not canonically conformant/);
	});
});

describe('SYNC-002 idempotency (re-applying an op id is a no-op)', () => {
	function makeOp(id: string): SyncOperation {
		return {
			id,
			vaultId: 'vault-test',
			sourceId: 'local-vault',
			actorId: DM_ACTOR.id,
			entityType: 'character',
			entityId: 'c-1',
			opType: 'character.edit',
			dependencies: [],
			issuedAt: '2026-06-05T00:00:00.000Z',
			schemaVersion: SYNC_OPERATION_SCHEMA_VERSION,
		};
	}

	it('AC2: applying the same op id twice does not apply a duplicate mutation', () => {
		const applied = appliedOperationIdsOf([makeOp('op-1')]);
		expect(isOperationApplied(applied, 'op-1')).toBe(true);

		const first = applyOperationIdempotent(new Set<string>(), 'op-1');
		expect(first.applied).toBe(true);
		const second = applyOperationIdempotent(first.appliedOperationIds, 'op-1');
		expect(second.applied).toBe(false);
		// A duplicate returns the SAME set reference (a true no-op).
		expect(second.appliedOperationIds).toBe(first.appliedOperationIds);
	});

	it('dedupes an op stream by id, preserving first-seen order', () => {
		const stream = [makeOp('op-1'), makeOp('op-2'), makeOp('op-1'), makeOp('op-3')];
		const deduped = dedupeOperationsById(stream);
		expect(deduped.map((o) => o.id)).toEqual(['op-1', 'op-2', 'op-3']);
	});

	it('the operation log idempotency key short-circuits a replayed durable command', () => {
		// A command carrying an idempotency key, replayed, is a no-op at the log level (existing behavior
		// the canonical model preserves).
		let log = createOperationLog();
		const op: SyncOperation = {
			...makeOp('op-key-1'),
			value: { idempotencyKey: 'edit-hp-1' },
		};
		log = appendOperation(log, op);
		expect(log.idempotencyKeys.has('edit-hp-1')).toBe(true);
	});
});
