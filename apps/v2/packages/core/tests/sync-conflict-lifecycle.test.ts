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
	conflictLifecycleIsStructuralOnly,
	conflictedEntityKeys,
	deriveVaultConflicts,
	dispatchCommand,
	entityIsEditableDespiteOtherConflicts,
	entityPublicationStatus,
	getConflictLifecycle,
	isEntityConflicted,
	publicationStatusForEntity,
	resolveVaultConflict,
	unresolvedConflicts,
	type Actor,
	type CommandResult,
	type ConflictLifecycleView,
	type CoreEnvironment,
	type CoreStateSlice,
	type SyncOperation,
	type VaultConflictRecord,
} from '../src';

/**
 * SYNC-006 / SYNC-013 — the vault-wide conflict LIFECYCLE.
 *
 * These tests prove the durable conflict-record model derived from the op-log substrate (DETECT →
 * PERSIST → DISPLAY → RESOLVE), the load-bearing per-entity ISOLATION guarantee, the non-DM
 * publication gate + non-leak, and the DM-authorized administrative resolution (explicit selected
 * value + source revisions + notes + audit → non-conflicted revision) with its fail-closed negatives.
 */

const PLAYER_B: Actor = { id: 'actor-player-b', role: 'player', displayName: 'Player B' };

function withActors(...actors: Actor[]): CoreStateSlice {
	return buildInitialState(DM_ACTOR, PLAYER_ACTOR, PLAYER_B, OBSERVER_ACTOR, ...actors);
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

/** A minimal conflict-shaped detection op (the generalized SYNC conflict shape with per-side revisions). */
function conflictOp(overrides: Partial<SyncOperation> & { value?: unknown }): SyncOperation {
	return {
		id: overrides.id ?? 'op-conflict',
		vaultId: 'vault',
		sourceId: 'local-vault',
		actorId: overrides.actorId ?? DM_ACTOR.id,
		entityType: overrides.entityType ?? 'note',
		entityId: overrides.entityId ?? 'note-1',
		opType: overrides.opType ?? 'note.field-conflict',
		path: overrides.path,
		value: overrides.value,
		beforeRevision: overrides.beforeRevision,
		afterRevision: overrides.afterRevision,
		dependencies: [],
		issuedAt: overrides.issuedAt ?? '2026-06-05T10:00:00.000Z',
		schemaVersion: SYNC_OPERATION_SCHEMA_VERSION,
	};
}

function buildConflictRecord(overrides: Partial<VaultConflictRecord> = {}): VaultConflictRecord {
	const ops = [
		conflictOp({
			id: 'detect-1',
			entityType: overrides.entityType ?? 'note',
			entityId: overrides.entityId ?? 'note-1',
			path: overrides.path ?? 'frontmatter.status',
			value: {
				id: overrides.id ?? 'conf-1',
				reason: overrides.reason ?? 'same-scalar-path',
				ancestorRevision: overrides.ancestorRevision ?? 2,
				local: overrides.local ?? { revision: 3, value: 'draft', authorActorId: PLAYER_ACTOR.id },
				remote: overrides.remote ?? { revision: 3, value: 'published', authorActorId: DM_ACTOR.id },
			},
		}),
	];
	const [record] = deriveVaultConflicts(ops, ops);
	return record!;
}

describe('SYNC-006 — durable vault conflict records derived from the op-log', () => {
	it('AC1: a same-scalar-path divergence reconstructs a record with ancestor, local, remote, reason, revisions', () => {
		const op = conflictOp({
			id: 'op-1',
			entityType: 'note',
			entityId: 'note-1',
			path: 'frontmatter.status',
			value: {
				id: 'conf-1',
				reason: 'same-scalar-path',
				ancestorRevision: 4,
				local: { revision: 5, value: 'draft', authorActorId: PLAYER_ACTOR.id },
				remote: { revision: 5, value: 'published', authorActorId: DM_ACTOR.id },
			},
		});
		const [record] = deriveVaultConflicts([op], [op]);
		expect(record).toBeDefined();
		expect(record!.id).toBe('conf-1');
		expect(record!.entityType).toBe('note');
		expect(record!.entityId).toBe('note-1');
		expect(record!.path).toBe('frontmatter.status');
		expect(record!.reason).toBe('same-scalar-path');
		expect(record!.ancestorRevision).toBe(4);
		expect(record!.local).toEqual({ revision: 5, value: 'draft', authorActorId: PLAYER_ACTOR.id });
		expect(record!.remote).toEqual({ revision: 5, value: 'published', authorActorId: DM_ACTOR.id });
		expect(record!.resolvedAt).toBeNull();
	});

	it('a matching resolution op marks the record resolved and attaches the audit (idempotent: first wins)', () => {
		const detect = conflictOp({ id: 'd1', value: { id: 'conf-1', local: { revision: 2, value: 'a' }, remote: { revision: 2, value: 'b' } } });
		const resolveOnce = conflictOp({
			id: 'r1',
			opType: 'note.resolve-conflict',
			actorId: DM_ACTOR.id,
			afterRevision: 3,
			value: { conflictId: 'conf-1', selectedValue: 'a', resolvedLocalRevision: 2, resolvedRemoteRevision: 2, resultingRevision: 3, notes: 'kept the draft' },
		});
		const resolveAgain = conflictOp({ id: 'r2', opType: 'note.resolve-conflict', actorId: DM_ACTOR.id, value: { conflictId: 'conf-1', selectedValue: 'b', resultingRevision: 9 } });
		const ops = [detect, resolveOnce, resolveAgain];
		const [record] = deriveVaultConflicts(ops, ops);
		expect(record!.resolvedAt).not.toBeNull();
		// First resolution wins (idempotent replay): the second op does not overwrite the record.
		expect(record!.resolution!.selectedValue).toBe('a');
		expect(record!.resolution!.resultingRevision).toBe(3);
		expect(record!.resolution!.notes).toBe('kept the draft');
		expect(record!.resolution!.resolverActorId).toBe(DM_ACTOR.id);
	});

	it('AC2: per-entity ISOLATION — an unresolved conflict on entity A leaves unrelated entity B unaffected', () => {
		const conflictA = conflictOp({ id: 'dA', entityType: 'note', entityId: 'note-A', value: { id: 'conf-A', local: { revision: 2, value: 'x' }, remote: { revision: 2, value: 'y' } } });
		const ops = [conflictA];
		const conflicts = deriveVaultConflicts(ops, ops);

		// Entity A is conflicted; unrelated entity B is not.
		expect(isEntityConflicted(conflicts, 'note', 'note-A')).toBe(true);
		expect(isEntityConflicted(conflicts, 'note', 'note-B')).toBe(false);
		expect(isEntityConflicted(conflicts, 'character', 'char-1')).toBe(false);

		// A's revision is blocked for non-DM publication; B is fully publishable.
		expect(publicationStatusForEntity(conflicts, 'note', 'note-A')).toBe('conflicted');
		expect(publicationStatusForEntity(conflicts, 'note', 'note-B')).toBe('publishable');

		// B remains editable; the isolation invariant holds regardless of A's conflict.
		expect(entityIsEditableDespiteOtherConflicts(conflicts, 'note', 'note-B')).toBe(true);
		expect(conflictedEntityKeys(conflicts)).toEqual(['note:note-A']);
	});

	it('AC3: an unresolved conflict makes the entity revision `conflicted`; resolution makes it publishable', () => {
		const detect = conflictOp({ id: 'd1', entityType: 'note', entityId: 'note-1', value: { id: 'conf-1', local: { revision: 2, value: 'a' }, remote: { revision: 2, value: 'b' } } });
		expect(entityPublicationStatus([detect], 'note', 'note-1')).toBe('conflicted');

		const resolve = conflictOp({ id: 'r1', opType: 'note.resolve-conflict', value: { conflictId: 'conf-1', selectedValue: 'a', resultingRevision: 3 } });
		expect(entityPublicationStatus([detect, resolve], 'note', 'note-1')).toBe('publishable');
	});

	it('unresolvedConflicts filters out resolved records', () => {
		const detect1 = conflictOp({ id: 'd1', entityId: 'n1', value: { id: 'c1', local: { revision: 1, value: 'a' }, remote: { revision: 1, value: 'b' } } });
		const detect2 = conflictOp({ id: 'd2', entityId: 'n2', value: { id: 'c2', local: { revision: 1, value: 'a' }, remote: { revision: 1, value: 'b' } } });
		const resolve1 = conflictOp({ id: 'r1', opType: 'note.resolve-conflict', value: { conflictId: 'c1', selectedValue: 'a', resultingRevision: 2 } });
		const ops = [detect1, detect2, resolve1];
		expect(unresolvedConflicts(deriveVaultConflicts(ops, ops)).map((c) => c.id)).toEqual(['c2']);
	});
});

describe('SYNC-006 — actor-filtered conflict-lifecycle DISPLAY (non-leak)', () => {
	function asView(result: ReturnType<typeof getConflictLifecycle>): ConflictLifecycleView {
		if (result.kind !== 'conflict-lifecycle') throw new Error(`expected view, got ${result.kind}`);
		return result;
	}

	const SECRET_LOCAL = 'SECRET-DRAFT-VALUE';
	const SECRET_REMOTE = 'SECRET-PUBLISHED-VALUE';

	function permissionsAndOps() {
		const state = withActors();
		const ops = [
			conflictOp({
				id: 'd1',
				entityType: 'note',
				entityId: 'note-1',
				path: 'frontmatter.status',
				value: {
					id: 'conf-1',
					reason: 'same-scalar-path',
					ancestorRevision: 2,
					local: { revision: 3, value: SECRET_LOCAL, authorActorId: PLAYER_ACTOR.id },
					remote: { revision: 3, value: SECRET_REMOTE, authorActorId: DM_ACTOR.id },
				},
			}),
		];
		return { permissions: state.permissions, ops };
	}

	it('fails closed for an unknown actor', () => {
		const { permissions, ops } = permissionsAndOps();
		expect(getConflictLifecycle(permissions, 'actor-ghost', { operations: ops })).toEqual({
			kind: 'denied',
			reason: 'unknown-actor',
		});
	});

	it('the DM sees the full record (diverging values + revisions)', () => {
		const { permissions, ops } = permissionsAndOps();
		const view = asView(getConflictLifecycle(permissions, DM_ACTOR.id, { operations: ops }));
		expect(view.role).toBe('dm');
		expect(view.unresolvedCount).toBe(1);
		expect(view.conflictedEntityKeys).toEqual(['note:note-1']);
		expect(view.dmDetail).toHaveLength(1);
		expect(view.dmDetail[0]!.local.value).toBe(SECRET_LOCAL);
		expect(view.dmDetail[0]!.remote.value).toBe(SECRET_REMOTE);
		expect(view.dmDetail[0]!.local.revision).toBe(3);
	});

	it('a player/observer sees only structural facts — NEVER the conflicting values', () => {
		const { permissions, ops } = permissionsAndOps();
		for (const actorId of [PLAYER_ACTOR.id, OBSERVER_ACTOR.id]) {
			const view = asView(getConflictLifecycle(permissions, actorId, { operations: ops }));
			expect(view.dmDetail).toHaveLength(0);
			expect(view.entries).toHaveLength(1);
			expect(view.entries[0]!.reason).toBe('same-scalar-path');
			expect(view.entries[0]!.publication).toBe('conflicted');
			// The non-leak guarantee: no conflicting value appears anywhere in the non-DM view.
			expect(conflictLifecycleIsStructuralOnly(view, [SECRET_LOCAL, SECRET_REMOTE])).toBe(true);
			expect(JSON.stringify(view)).not.toContain(SECRET_LOCAL);
			expect(JSON.stringify(view)).not.toContain(SECRET_REMOTE);
		}
	});
});

describe('SYNC-013 — DM-authorized resolution (pure policy)', () => {
	it('produces a resolved record + audit from explicit value + matching source revisions + notes', () => {
		const record = buildConflictRecord({
			local: { revision: 3, value: 'draft', authorActorId: PLAYER_ACTOR.id },
			remote: { revision: 3, value: 'published', authorActorId: DM_ACTOR.id },
		});
		const result = resolveVaultConflict(
			[record],
			{
				conflictId: record.id,
				selectedValue: 'published',
				sourceLocalRevision: 3,
				sourceRemoteRevision: 3,
				notes: 'DM chose the published value',
			},
			4,
			{ resolverActorId: DM_ACTOR.id, resolutionOperationId: 'op-r', now: '2026-06-05T12:00:00.000Z' },
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.resolved.resolvedAt).toBe('2026-06-05T12:00:00.000Z');
		expect(result.audit.selectedValue).toBe('published');
		expect(result.audit.resolvedLocalRevision).toBe(3);
		expect(result.audit.resolvedRemoteRevision).toBe(3);
		expect(result.audit.resultingRevision).toBe(4);
		expect(result.audit.notes).toBe('DM chose the published value');
		expect(result.audit.resolverActorId).toBe(DM_ACTOR.id);
	});

	it('fails closed when the source revisions are stale (do not match the actual conflict)', () => {
		const record = buildConflictRecord({
			local: { revision: 5, value: 'draft', authorActorId: PLAYER_ACTOR.id },
			remote: { revision: 5, value: 'published', authorActorId: DM_ACTOR.id },
		});
		const result = resolveVaultConflict(
			[record],
			{ conflictId: record.id, selectedValue: 'draft', sourceLocalRevision: 2, sourceRemoteRevision: 2 },
			6,
			{ resolverActorId: DM_ACTOR.id, resolutionOperationId: 'op-r', now: '2026-06-05T12:00:00.000Z' },
		);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toBe('stale-source-revision');
	});

	it('fails closed for an unknown conflict id and an already-resolved conflict', () => {
		const record = buildConflictRecord();
		expect(
			resolveVaultConflict([record], { conflictId: 'nope', selectedValue: 'x', sourceLocalRevision: 3, sourceRemoteRevision: 3 }, 4, {
				resolverActorId: DM_ACTOR.id,
				resolutionOperationId: 'op-r',
				now: 'now',
			}),
		).toMatchObject({ ok: false, error: 'conflict-not-found' });

		const resolved: VaultConflictRecord = { ...record, resolvedAt: 'earlier', resolution: null };
		expect(
			resolveVaultConflict([resolved], { conflictId: record.id, selectedValue: 'x', sourceLocalRevision: 3, sourceRemoteRevision: 3 }, 4, {
				resolverActorId: DM_ACTOR.id,
				resolutionOperationId: 'op-r',
				now: 'now',
			}),
		).toMatchObject({ ok: false, error: 'conflict-already-resolved' });
	});
});

describe('SYNC-013 — DM-authorized resolution COMMAND over a real character conflict', () => {
	function setupCharacterConflict(env: CoreEnvironment): { state: CoreStateSlice; characterId: string; conflict: VaultConflictRecord } {
		const created = accepted(
			dispatchCommand(withActors(), env, {
				type: 'character.quick-create',
				actorId: DM_ACTOR.id,
				payload: { kind: 'sidekick', name: 'Pip', visibility: 'player-visible', combat: { hp: 10, maxHp: 10, ac: 12 }, data: { backstory: 'origin' } },
			}),
		);
		const characterId = Object.keys(created.nextState.characters.characters)[0]!;
		const granted = accepted(
			dispatchCommand(created.nextState, env, {
				type: 'permission.grant-capability-set',
				actorId: DM_ACTOR.id,
				payload: { entityType: 'character', entityId: characterId, playerActorId: PLAYER_ACTOR.id, capabilitySet: 'owner' },
			}),
		);
		const baseRevision = granted.nextState.characters.characters[characterId]!.revision;
		const byOwner = accepted(
			dispatchCommand(granted.nextState, env, {
				type: 'character.edit-field',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId, path: 'data.backstory', value: 'Owner version.', baseRevision },
			}),
		);
		const byDm = accepted(
			dispatchCommand(byOwner.nextState, env, {
				type: 'character.edit-field',
				actorId: DM_ACTOR.id,
				payload: { characterId, path: 'data.backstory', value: 'DM version.', baseRevision },
			}),
		);
		const conflicts = deriveVaultConflicts(byDm.nextState.sync.operations, byDm.nextState.sync.operations);
		const conflict = conflicts.find((c) => c.resolvedAt === null)!;
		expect(conflict).toBeDefined();
		return { state: byDm.nextState, characterId, conflict };
	}

	it('a real character same-path conflict surfaces as a durable VAULT conflict record', () => {
		const { conflict } = setupCharacterConflict(makeEnvironment());
		expect(conflict.entityType).toBe('character');
		expect(conflict.reason).toBe('same-scalar-path');
		expect(conflict.path).toBe('data.backstory');
		expect(conflict.local.value).toBe('Owner version.');
		expect(conflict.remote.value).toBe('DM version.');
		// Per-side revisions reconstructed so a resolution can reference them.
		expect(conflict.local.revision).toBeGreaterThan(0);
		expect(conflict.remote.revision).toBeGreaterThan(0);
	});

	it('AC1 fail-closed: a non-DM (player) attempting `conflict.resolve` is rejected; the conflict remains', () => {
		const env = makeEnvironment();
		const { state, characterId, conflict } = setupCharacterConflict(env);
		const result = rejected(
			dispatchCommand(state, env, {
				type: 'conflict.resolve',
				actorId: PLAYER_ACTOR.id,
				payload: {
					entityType: 'character',
					entityId: characterId,
					conflictId: conflict.id,
					selectedValue: 'Owner version.',
					sourceLocalRevision: conflict.local.revision,
					sourceRemoteRevision: conflict.remote.revision,
				},
			}),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
		// The conflict is still unresolved and available for the DM.
		const after = deriveVaultConflicts(state.sync.operations, state.sync.operations);
		expect(isEntityConflicted(after, 'character', characterId)).toBe(true);
	});

	it('AC1 fail-closed: an observer is rejected too', () => {
		const env = makeEnvironment();
		const { state, characterId, conflict } = setupCharacterConflict(env);
		const result = rejected(
			dispatchCommand(state, env, {
				type: 'conflict.resolve',
				actorId: OBSERVER_ACTOR.id,
				payload: { entityType: 'character', entityId: characterId, conflictId: conflict.id, selectedValue: 'x', sourceLocalRevision: conflict.local.revision, sourceRemoteRevision: conflict.remote.revision },
			}),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});

	it('fail-closed: a stale source-revision pair is rejected (revision-conflict)', () => {
		const env = makeEnvironment();
		const { state, characterId, conflict } = setupCharacterConflict(env);
		const result = rejected(
			dispatchCommand(state, env, {
				type: 'conflict.resolve',
				actorId: DM_ACTOR.id,
				payload: { entityType: 'character', entityId: characterId, conflictId: conflict.id, selectedValue: 'Owner version.', sourceLocalRevision: 0, sourceRemoteRevision: 0 },
			}),
		);
		expect(result.rejection.code).toBe('revision-conflict');
	});

	it('the DM resolves with explicit value + source revisions + notes → non-conflicted revision + audit', () => {
		const env = makeEnvironment();
		const { state, characterId, conflict } = setupCharacterConflict(env);
		const resolved = accepted(
			dispatchCommand(state, env, {
				type: 'conflict.resolve',
				actorId: DM_ACTOR.id,
				payload: {
					entityType: 'character',
					entityId: characterId,
					conflictId: conflict.id,
					selectedValue: 'DM version.',
					sourceLocalRevision: conflict.local.revision,
					sourceRemoteRevision: conflict.remote.revision,
					notes: 'Adopting the DM-authored backstory after review.',
				},
			}),
		);
		expect(resolved.operationIds).toHaveLength(1);
		expect(resolved.events[0]).toMatchObject({ kind: 'conflict.resolved', entityType: 'character', entityId: characterId, conflictId: conflict.id });

		// After resolution the entity is NON-conflicted; the audit records who/what/when + selected value.
		const after = deriveVaultConflicts(resolved.nextState.sync.operations, resolved.nextState.sync.operations);
		expect(isEntityConflicted(after, 'character', characterId)).toBe(false);
		const record = after.find((c) => c.id === conflict.id)!;
		expect(record.resolvedAt).not.toBeNull();
		expect(record.resolution!.resolverActorId).toBe(DM_ACTOR.id);
		expect(record.resolution!.selectedValue).toBe('DM version.');
		expect(record.resolution!.notes).toBe('Adopting the DM-authored backstory after review.');
		expect(record.resolution!.resultingRevision).toBeGreaterThan(conflict.remote.revision);
	});

	it('AC2 idempotent: a second `conflict.resolve` after resolution is rejected (invalid-state), no second revision', () => {
		const env = makeEnvironment();
		const { state, characterId, conflict } = setupCharacterConflict(env);
		const resolved = accepted(
			dispatchCommand(state, env, {
				type: 'conflict.resolve',
				actorId: DM_ACTOR.id,
				payload: { entityType: 'character', entityId: characterId, conflictId: conflict.id, selectedValue: 'DM version.', sourceLocalRevision: conflict.local.revision, sourceRemoteRevision: conflict.remote.revision },
			}),
		);
		const second = rejected(
			dispatchCommand(resolved.nextState, env, {
				type: 'conflict.resolve',
				actorId: DM_ACTOR.id,
				payload: { entityType: 'character', entityId: characterId, conflictId: conflict.id, selectedValue: 'Owner version.', sourceLocalRevision: conflict.local.revision, sourceRemoteRevision: conflict.remote.revision },
			}),
		);
		expect(second.rejection.code).toBe('invalid-state');
		// No second resolution op appended (idempotent).
		const resolveOps = second.nextState.sync.operations.filter((o) => o.opType.endsWith('resolve-conflict'));
		expect(resolveOps).toHaveLength(1);
	});

	it('ISOLATION over real ops: resolving entity A does not disturb a concurrent conflict on entity B', () => {
		const env = makeEnvironment();
		const { state: stateA, characterId: charA, conflict: conflictA } = setupCharacterConflict(env);
		// Inject an independent unresolved conflict on a different entity B into the same op-log.
		const stateB: CoreStateSlice = {
			...stateA,
			sync: {
				...stateA.sync,
				operations: [
					...stateA.sync.operations,
					conflictOp({ id: 'dB', entityType: 'note', entityId: 'note-B', path: 'frontmatter.status', value: { id: 'conf-B', local: { revision: 2, value: 'x', authorActorId: PLAYER_ACTOR.id }, remote: { revision: 2, value: 'y', authorActorId: DM_ACTOR.id } } }),
				],
			},
		};
		const before = deriveVaultConflicts(stateB.sync.operations, stateB.sync.operations);
		expect(conflictedEntityKeys(before).sort()).toEqual([`character:${charA}`, 'note:note-B'].sort());

		const resolved = accepted(
			dispatchCommand(stateB, env, {
				type: 'conflict.resolve',
				actorId: DM_ACTOR.id,
				payload: { entityType: 'character', entityId: charA, conflictId: conflictA.id, selectedValue: 'DM version.', sourceLocalRevision: conflictA.local.revision, sourceRemoteRevision: conflictA.remote.revision },
			}),
		);
		const after = deriveVaultConflicts(resolved.nextState.sync.operations, resolved.nextState.sync.operations);
		// A is resolved; B is untouched and still conflicted.
		expect(isEntityConflicted(after, 'character', charA)).toBe(false);
		expect(isEntityConflicted(after, 'note', 'note-B')).toBe(true);
		expect(conflictedEntityKeys(after)).toEqual(['note:note-B']);
	});
});
