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
	dispatchCommand,
	validateReplayBatch,
	validateReplayOperation,
	type CoreStateSlice,
	type EntityVisibilityMetadata,
	type SyncOperation,
} from '../src';

/**
 * SYNC-011 — fail-closed replay validation across every dimension.
 *
 * Each test crafts a queued/remote op and proves that the failing dimension rejects (or defers) it
 * fail-closed, and that a valid op accepts. The validator reuses the PERM visibility/grant model and
 * the canonical-shape + schema-version checks; it never applies a rejected op.
 */

const env = makeEnvironment();

/** Build a state with a real character target + a player who owns it via a grant. */
function buildReplayState(): { state: CoreStateSlice; characterId: string } {
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
	const created = dispatchCommand(state, env, {
		type: 'character.quick-create',
		actorId: DM_ACTOR.id,
		payload: { name: 'Ally NPC', kind: 'sidekick', visibility: 'player-visible' },
	});
	if (created.status !== 'accepted') throw new Error('quick-create rejected');
	state = created.nextState;
	const characterId = (
		created.events.find((e) => e.kind === 'character.created') as { characterId: string }
	).characterId;
	// Grant the player a combat-participant capability on the character so a permitted write applies.
	state = {
		...state,
		permissions: {
			...state.permissions,
			grants: [
				{
					id: 'grant-1',
					entityType: 'character',
					entityId: characterId,
					playerActorId: PLAYER_ACTOR.id,
					capabilitySet: 'combat-participant',
					createdBy: DM_ACTOR.id,
					createdAt: '2026-06-05T00:00:00.000Z',
					expiresAt: null,
				},
			],
		},
	};
	return { state, characterId };
}

function makeOp(overrides: Partial<SyncOperation>): SyncOperation {
	return {
		id: overrides.id ?? 'op-replay-1',
		vaultId: 'vault-test',
		sourceId: 'local-vault',
		actorId: overrides.actorId ?? DM_ACTOR.id,
		entityType: overrides.entityType ?? 'character',
		entityId: overrides.entityId ?? 'missing',
		opType: overrides.opType ?? 'character.edit-field',
		path: overrides.path,
		value: overrides.value,
		beforeRevision: overrides.beforeRevision,
		afterRevision: overrides.afterRevision,
		dependencies: overrides.dependencies ?? [],
		issuedAt: overrides.issuedAt ?? '2026-06-05T00:01:00.000Z',
		schemaVersion: overrides.schemaVersion ?? SYNC_OPERATION_SCHEMA_VERSION,
	};
}

const PLAYER_VISIBLE: EntityVisibilityMetadata = {
	entityType: 'character',
	entityId: '',
	entity: { level: 'player-visible' },
};

describe('SYNC-011 replay validation rejects each bad dimension fail-closed', () => {
	it('a fully valid DM op against an existing target accepts', () => {
		const { state, characterId } = buildReplayState();
		const op = makeOp({ entityId: characterId, actorId: DM_ACTOR.id, path: `characters/${characterId}` });
		const result = validateReplayOperation(op, state, { appliedOperationIds: new Set() });
		expect(result.outcome).toBe('accept');
		expect(result.reason).toBeNull();
	});

	it('rejects a malformed (non-conformant) operation', () => {
		const { state } = buildReplayState();
		const result = validateReplayOperation(
			{ id: 'x', opType: 'character.edit' },
			state,
			{ appliedOperationIds: new Set() },
		);
		expect(result.outcome).toBe('reject');
		expect(result.reason).toBe('malformed-operation');
	});

	it('rejects an operation with an unsupported (future) schema version', () => {
		const { state, characterId } = buildReplayState();
		const op = makeOp({
			entityId: characterId,
			schemaVersion: (SYNC_OPERATION_SCHEMA_VERSION + 1) as SyncOperation['schemaVersion'],
		});
		const result = validateReplayOperation(op, state, { appliedOperationIds: new Set() });
		expect(result.outcome).toBe('reject');
		expect(result.reason).toBe('unsupported-schema-version');
	});

	it('DEFERS an operation whose dependency is not yet applied, with a structured reason', () => {
		const { state, characterId } = buildReplayState();
		const op = makeOp({ entityId: characterId, dependencies: ['op-earlier-not-applied'] });
		const result = validateReplayOperation(op, state, { appliedOperationIds: new Set() });
		expect(result.outcome).toBe('defer');
		expect(result.reason).toBe('unsatisfied-dependency');
		expect(result.unsatisfiedDependencies).toEqual(['op-earlier-not-applied']);
	});

	it('applies the dependent op once its dependency is in the applied set', () => {
		const { state, characterId } = buildReplayState();
		const op = makeOp({ entityId: characterId, dependencies: ['op-earlier'] });
		const result = validateReplayOperation(op, state, {
			appliedOperationIds: new Set(['op-earlier']),
		});
		expect(result.outcome).toBe('accept');
	});

	it('rejects an operation whose target entity does not exist (never writes to a missing entity)', () => {
		const { state } = buildReplayState();
		const op = makeOp({ entityId: 'never-existed' });
		const result = validateReplayOperation(op, state, { appliedOperationIds: new Set() });
		expect(result.outcome).toBe('reject');
		expect(result.reason).toBe('target-missing');
	});

	it('resolves target existence through recorded identity metadata (survives a rename)', () => {
		const { state } = buildReplayState();
		// The live slice has no entity `renamed-id`, but recorded identity metadata declares it lives —
		// replay resolves through identity, not title, so a renamed entity still resolves (AC2).
		const op = makeOp({ entityId: 'renamed-id', actorId: DM_ACTOR.id });
		const result = validateReplayOperation(op, state, {
			appliedOperationIds: new Set(),
			targetEntityIds: { character: new Set(['renamed-id']) },
		});
		expect(result.outcome).toBe('accept');
	});

	it('rejects an operation issued by an unknown actor', () => {
		const { state, characterId } = buildReplayState();
		const op = makeOp({ entityId: characterId, actorId: 'ghost-actor' });
		const result = validateReplayOperation(op, state, { appliedOperationIds: new Set() });
		expect(result.outcome).toBe('reject');
		expect(result.reason).toBe('unknown-actor');
	});

	it('rejects a non-DM op against a target the actor cannot SEE (visibility)', () => {
		const { state, characterId } = buildReplayState();
		const op = makeOp({ entityId: characterId, actorId: PLAYER_ACTOR.id });
		// dm-only visibility metadata ⇒ the player cannot see the target ⇒ rejected fail-closed.
		const result = validateReplayOperation(op, state, {
			appliedOperationIds: new Set(),
			visibilityMetadata: {
				entityType: 'character',
				entityId: characterId,
				entity: { level: 'dm-only' },
			},
			requiredCapability: 'combat-participant',
		});
		expect(result.outcome).toBe('reject');
		expect(result.reason).toBe('not-visible');
	});

	it('rejects a visible op the actor lacks WRITE permission for (permission)', () => {
		const { state, characterId } = buildReplayState();
		// The observer can SEE a player-visible character but holds no write grant ⇒ not-permitted.
		const op = makeOp({ entityId: characterId, actorId: OBSERVER_ACTOR.id });
		const result = validateReplayOperation(op, state, {
			appliedOperationIds: new Set(),
			visibilityMetadata: { ...PLAYER_VISIBLE, entityId: characterId },
			requiredCapability: 'combat-participant',
		});
		expect(result.outcome).toBe('reject');
		expect(result.reason).toBe('not-permitted');
	});

	it('accepts a non-DM op the actor is permitted to write (visible + granted)', () => {
		const { state, characterId } = buildReplayState();
		// The player is player-visible (can see) AND holds a combat-participant grant (can write).
		const op = makeOp({ entityId: characterId, actorId: PLAYER_ACTOR.id });
		const result = validateReplayOperation(op, state, {
			appliedOperationIds: new Set(),
			visibilityMetadata: { ...PLAYER_VISIBLE, entityId: characterId },
			requiredCapability: 'combat-participant',
		});
		expect(result.outcome).toBe('accept');
	});

	it('rejects a non-DM write with no declared required capability (fail closed to DM-only)', () => {
		const { state, characterId } = buildReplayState();
		const op = makeOp({ entityId: characterId, actorId: PLAYER_ACTOR.id });
		const result = validateReplayOperation(op, state, {
			appliedOperationIds: new Set(),
			visibilityMetadata: { ...PLAYER_VISIBLE, entityId: characterId },
			// no requiredCapability ⇒ treated as a DM-only write ⇒ a non-DM is rejected.
		});
		expect(result.outcome).toBe('reject');
		expect(result.reason).toBe('not-permitted');
	});
});

describe('SYNC-011 replay batch threads dependencies and applies idempotently', () => {
	it('applies an op then its dependent within the same batch; defers an orphan dependency', () => {
		const { state, characterId } = buildReplayState();
		const first = makeOp({ id: 'op-a', entityId: characterId, actorId: DM_ACTOR.id });
		const dependent = makeOp({
			id: 'op-b',
			entityId: characterId,
			actorId: DM_ACTOR.id,
			dependencies: ['op-a'],
		});
		const orphan = makeOp({
			id: 'op-c',
			entityId: characterId,
			actorId: DM_ACTOR.id,
			dependencies: ['op-never'],
		});
		const batch = validateReplayBatch([first, dependent, orphan], state, new Set());
		expect(batch.appliedIds).toEqual(['op-a', 'op-b']);
		expect(batch.deferredIds).toEqual(['op-c']);
		expect(batch.rejectedIds).toEqual([]);
		expect(batch.appliedOperationIds.has('op-a')).toBe(true);
		expect(batch.appliedOperationIds.has('op-b')).toBe(true);
	});

	it('a duplicate op id in the same batch is applied idempotently (no double-apply)', () => {
		const { state, characterId } = buildReplayState();
		const op = makeOp({ id: 'op-dup', entityId: characterId, actorId: DM_ACTOR.id });
		const batch = validateReplayBatch([op, op], state, new Set());
		// Both accept, but the applied-id set holds the id once (idempotent).
		expect(batch.entries.every((e) => e.result.outcome === 'accept')).toBe(true);
		expect([...batch.appliedOperationIds].filter((id) => id === 'op-dup')).toHaveLength(1);
	});

	it('rejects a bad op in a batch without blocking the good ops around it', () => {
		const { state, characterId } = buildReplayState();
		const good = makeOp({ id: 'op-good', entityId: characterId, actorId: DM_ACTOR.id });
		const bad = makeOp({ id: 'op-bad', entityId: 'missing', actorId: DM_ACTOR.id });
		const batch = validateReplayBatch([good, bad], state, new Set());
		expect(batch.appliedIds).toEqual(['op-good']);
		expect(batch.rejectedIds).toEqual(['op-bad']);
	});
});
