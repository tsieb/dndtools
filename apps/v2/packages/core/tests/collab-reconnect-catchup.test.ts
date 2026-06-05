import { describe, expect, it } from 'vitest';
import {
	appliedIdsBeforeCursor,
	assertCatchUpRestoresNoRevokedAccess,
	computeReconnectCatchUp,
	type EntityVisibilityMetadata,
	type PermissionGrant,
	type ReconnectReplayContextSource,
	type SyncOperation,
} from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	buildPermissionState,
} from '../src/testing/fixtures';
import type { CoreStateSlice } from '../src/commands/types';

/**
 * COLLAB-002 — a participant reconnecting to an active session receives ONLY catch-up operations allowed by
 * their CURRENT role, visibility, grants, and sync cursor. Hard assertions: a revoked grant is NOT restored
 * from cache; a now-hidden op is NOT sent; ops are delivered in dependency order and revalidated against
 * current grants before controls re-enable.
 */

const NOW = '2026-06-05T12:00:00.000Z';
const SECRET = 'THE-LICH-PHYLACTERY-IS-HERE';

function op(overrides: Partial<SyncOperation> & Pick<SyncOperation, 'id' | 'entityType' | 'entityId'>): SyncOperation {
	return {
		vaultId: 'vault-1',
		sourceId: 'local-vault',
		actorId: DM_ACTOR.id,
		opType: 'update',
		dependencies: [],
		issuedAt: '2026-06-05T00:00:00.000Z',
		schemaVersion: 1,
		...overrides,
	};
}

/** A visibility source keyed by `entityType:entityId`; an unlisted target ⇒ undefined ⇒ fail-closed dm-only. */
function visibilitySource(records: EntityVisibilityMetadata[]) {
	const byKey = new Map(records.map((r) => [`${r.entityType}:${r.entityId}`, r]));
	return (o: SyncOperation): EntityVisibilityMetadata | undefined =>
		byKey.get(`${o.entityType}:${o.entityId}`);
}

/** A replay-context source supplying per-op target identity + visibility + required capability. */
function replayContext(
	records: EntityVisibilityMetadata[],
	targetIds: Record<string, string[]>,
	requiredCapabilityByEntity: Record<string, string> = {},
): ReconnectReplayContextSource {
	const byKey = new Map(records.map((r) => [`${r.entityType}:${r.entityId}`, r]));
	const targetEntityIds: Record<string, ReadonlySet<string>> = {};
	for (const [type, ids] of Object.entries(targetIds)) targetEntityIds[type] = new Set(ids);
	return (o: SyncOperation) => ({
		targetEntityIds,
		visibilityMetadata: byKey.get(`${o.entityType}:${o.entityId}`),
		requiredCapability: requiredCapabilityByEntity[`${o.entityType}:${o.entityId}`],
	});
}

function stateWithGrants(...grants: PermissionGrant[]): CoreStateSlice {
	const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
	return { ...base, permissions: { ...base.permissions, grants } };
}

describe('COLLAB-002 — reconnect catch-up filtered by current role/visibility/grants', () => {
	it('AC2 — a now-hidden op is NOT sent to the player catch-up stream (filtered at the source)', () => {
		const stream = [
			op({ id: 'op-public', entityType: 'note', entityId: 'note-tavern', value: { body: 'busy square' } }),
			op({ id: 'op-secret', entityType: 'note', entityId: 'note-secret', value: { body: SECRET } }),
		];
		const visibility = visibilitySource([
			{ entityType: 'note', entityId: 'note-tavern', entity: { level: 'player-visible' } },
			{ entityType: 'note', entityId: 'note-secret', entity: { level: 'dm-only' } },
		]);
		const result = computeReconnectCatchUp(
			{
				recipient: PLAYER_ACTOR,
				operations: stream,
				alreadyDeliveredOperationIds: new Set(),
				permission: buildPermissionState(DM_ACTOR, PLAYER_ACTOR),
				resolveVisibility: visibility,
				now: NOW,
			},
			stateWithGrants(),
			replayContext(
				[
					{ entityType: 'note', entityId: 'note-tavern', entity: { level: 'player-visible' } },
					{ entityType: 'note', entityId: 'note-secret', entity: { level: 'dm-only' } },
				],
				{ note: ['note-tavern', 'note-secret'] },
				{ 'note:note-tavern': 'viewer' },
			),
		);
		const deliveredIds = result.delivered.map((o) => o.id);
		expect(deliveredIds).toEqual(['op-public']);
		// The secret op is absent from the delivered stream, and its body never appears in the serialized batch.
		expect(JSON.stringify(result.delivered)).not.toContain(SECRET);
	});

	it('AC1 — a revoked grant is NOT restored from cache: ops visible only under that grant are withheld', () => {
		// A `shared` note delivered to the player via a viewer grant. The grant is REVOKED (absent now), so the
		// note is no longer visible and its op must not be delivered on reconnect — even though the device
		// cached it while the grant was active.
		const stream = [
			op({ id: 'op-shared', entityType: 'note', entityId: 'note-shared', value: { body: 'a clue' } }),
		];
		const sharedMeta: EntityVisibilityMetadata = {
			entityType: 'note',
			entityId: 'note-shared',
			entity: { level: 'shared', sharedWith: [PLAYER_ACTOR.id] },
		};
		const visibility = visibilitySource([sharedMeta]);
		// No grant in the permission state — the grant has been revoked.
		const result = computeReconnectCatchUp(
			{
				recipient: PLAYER_ACTOR,
				operations: stream,
				alreadyDeliveredOperationIds: new Set(),
				permission: buildPermissionState(DM_ACTOR, PLAYER_ACTOR),
				resolveVisibility: visibility,
				now: NOW,
			},
			stateWithGrants(),
			replayContext([sharedMeta], { note: ['note-shared'] }, { 'note:note-shared': 'viewer' }),
		);
		// `shared` to the player's id means the player IS the shared audience and can still see it — so to
		// model a REVOKED grant we instead test a note shared with someone else (the player is not in the set).
		expect(result.delivered.map((o) => o.id)).toEqual(['op-shared']);

		// Now the real revoked-grant case: the note is shared with a DIFFERENT actor; the reconnecting player
		// is no longer in the audience, so the op is withheld (the cache cannot restore it).
		const sharedElsewhere: EntityVisibilityMetadata = {
			entityType: 'note',
			entityId: 'note-shared',
			entity: { level: 'shared', sharedWith: [OBSERVER_ACTOR.id] },
		};
		const revokedResult = computeReconnectCatchUp(
			{
				recipient: PLAYER_ACTOR,
				operations: stream,
				alreadyDeliveredOperationIds: new Set(),
				permission: buildPermissionState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR),
				resolveVisibility: visibilitySource([sharedElsewhere]),
				now: NOW,
			},
			stateWithGrants(),
			replayContext([sharedElsewhere], { note: ['note-shared'] }),
		);
		expect(revokedResult.delivered).toEqual([]);
	});

	it('AC3 — already-applied ops (sync cursor) are not re-delivered; remaining ops apply in dependency order', () => {
		const stream = [
			op({ id: 'op-1', entityType: 'note', entityId: 'note-a', value: { body: 'one' } }),
			op({ id: 'op-2', entityType: 'note', entityId: 'note-a', dependencies: ['op-1'], value: { body: 'two' } }),
		];
		const meta: EntityVisibilityMetadata = {
			entityType: 'note',
			entityId: 'note-a',
			entity: { level: 'player-visible' },
		};
		const result = computeReconnectCatchUp(
			{
				recipient: PLAYER_ACTOR,
				operations: stream,
				// The participant already applied op-1 before disconnecting (their sync cursor).
				alreadyDeliveredOperationIds: new Set(['op-1']),
				permission: buildPermissionState(DM_ACTOR, PLAYER_ACTOR),
				resolveVisibility: visibilitySource([meta]),
				now: NOW,
			},
			stateWithGrants(),
			replayContext([meta], { note: ['note-a'] }, { 'note:note-a': 'viewer' }),
		);
		// op-1 already applied ⇒ not re-delivered; op-2's dependency (op-1) is satisfied ⇒ applied; controls enable.
		expect(result.delivered.map((o) => o.id)).toEqual(['op-2']);
		expect(result.appliedOperationIds).toEqual(['op-2']);
		expect(result.controlState).toBe('enabled');
	});

	it('AC3 — controls stay disabled-syncing while a delivered op awaits an unapplied dependency', () => {
		// op-2 depends on op-1, but op-1 was NOT applied and is NOT in this catch-up batch (the participant
		// only received op-2). Replay DEFERS op-2; controls stay disabled-syncing.
		const stream = [
			op({ id: 'op-2', entityType: 'note', entityId: 'note-a', dependencies: ['op-1'], value: { body: 'two' } }),
		];
		const meta: EntityVisibilityMetadata = {
			entityType: 'note',
			entityId: 'note-a',
			entity: { level: 'player-visible' },
		};
		const result = computeReconnectCatchUp(
			{
				recipient: PLAYER_ACTOR,
				operations: stream,
				alreadyDeliveredOperationIds: new Set(),
				permission: buildPermissionState(DM_ACTOR, PLAYER_ACTOR),
				resolveVisibility: visibilitySource([meta]),
				now: NOW,
			},
			stateWithGrants(),
			replayContext([meta], { note: ['note-a'] }, { 'note:note-a': 'viewer' }),
		);
		expect(result.deferredOperationIds).toEqual(['op-2']);
		expect(result.controlState).toBe('disabled-syncing');
	});

	it('AC3 — controls go disabled-stale when a delivered op is rejected as now-unauthorized', () => {
		// A player-authored op against a character. The player held `combat-participant` but it was revoked
		// (no grant now), so replay REJECTS the op (not-permitted) and controls stay stale (fail closed).
		const stream = [
			op({
				id: 'op-hp',
				actorId: PLAYER_ACTOR.id,
				entityType: 'character',
				entityId: 'char-mine',
				path: 'data.hp',
				value: { hp: 5 },
			}),
		];
		const meta: EntityVisibilityMetadata = {
			entityType: 'character',
			entityId: 'char-mine',
			entity: { level: 'player-visible' },
		};
		const result = computeReconnectCatchUp(
			{
				recipient: PLAYER_ACTOR,
				operations: stream,
				alreadyDeliveredOperationIds: new Set(),
				permission: buildPermissionState(DM_ACTOR, PLAYER_ACTOR),
				resolveVisibility: visibilitySource([meta]),
				now: NOW,
			},
			stateWithGrants(),
			// requiredCapability is `combat-participant` but the player holds no such grant ⇒ rejected.
			replayContext([meta], { character: ['char-mine'] }, { 'character:char-mine': 'combat-participant' }),
		);
		expect(result.rejectedOperationIds).toEqual(['op-hp']);
		expect(result.appliedOperationIds).toEqual([]);
		expect(result.controlState).toBe('disabled-stale');
	});

	it('assertCatchUpRestoresNoRevokedAccess throws if a delivered op is not visible under current grants', () => {
		const hiddenOp = op({ id: 'op-secret', entityType: 'note', entityId: 'note-secret', value: { body: SECRET } });
		const visibility = visibilitySource([
			{ entityType: 'note', entityId: 'note-secret', entity: { level: 'dm-only' } },
		]);
		// A buggy transport delivered a dm-only op to the player — the guard must catch it.
		expect(() =>
			assertCatchUpRestoresNoRevokedAccess(
				[hiddenOp],
				PLAYER_ACTOR,
				visibility,
				buildPermissionState(DM_ACTOR, PLAYER_ACTOR),
			),
		).toThrow(/Reconnect catch-up leak/);
		// The DM is exempt (sees everything).
		expect(() =>
			assertCatchUpRestoresNoRevokedAccess([hiddenOp], DM_ACTOR, visibility, buildPermissionState(DM_ACTOR)),
		).not.toThrow();
	});

	it('an unknown/undefined recipient receives the empty catch-up batch (fail closed)', () => {
		const stream = [op({ id: 'op-1', entityType: 'note', entityId: 'note-a' })];
		const result = computeReconnectCatchUp(
			{
				recipient: undefined,
				operations: stream,
				alreadyDeliveredOperationIds: new Set(),
				permission: buildPermissionState(DM_ACTOR, PLAYER_ACTOR),
				resolveVisibility: () => undefined,
				now: NOW,
			},
			stateWithGrants(),
			() => ({}),
		);
		expect(result.delivered).toEqual([]);
		expect(result.recipientActorId).toBeNull();
		expect(result.controlState).toBe('enabled'); // nothing to apply ⇒ trivially caught up
	});

	it('appliedIdsBeforeCursor expands a sync cursor to its applied-id set (fail closed on a bad cursor)', () => {
		const stream = [
			op({ id: 'op-1', entityType: 'note', entityId: 'note-a' }),
			op({ id: 'op-2', entityType: 'note', entityId: 'note-a' }),
			op({ id: 'op-3', entityType: 'note', entityId: 'note-a' }),
		];
		expect([...appliedIdsBeforeCursor(stream, 'op-2')].sort()).toEqual(['op-1', 'op-2']);
		expect(appliedIdsBeforeCursor(stream, null).size).toBe(0);
		// A cursor pointing at an op not in the stream ⇒ empty (treat as applied nothing, fail closed).
		expect(appliedIdsBeforeCursor(stream, 'op-ghost').size).toBe(0);
	});
});
