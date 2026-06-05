import { describe, expect, it } from 'vitest';
import {
	PERMISSION_STATE_SCHEMA_VERSION,
	SYNC_OPERATION_SCHEMA_VERSION,
	createCommandLifecycle,
	getSyncStatus,
	markFailure,
	markPending,
	type DiagnosticsContextInput,
	type PermissionState,
	type SyncOperation,
	type SyncStatusView,
} from '../src';
import { DM_ACTOR, OBSERVER_ACTOR, PLAYER_ACTOR } from '../src/testing/fixtures';

/**
 * SYNC-010 — the user inspects sync status (pending outbound, inbound revisions, conflicts, source
 * health, retry actions) WITHOUT raw storage knowledge. These tests prove the derivation over the
 * op-log substrate + PLAT diagnostics, and that the view is non-leaking (structural conflicts only).
 */

function permissions(): PermissionState {
	return {
		actors: {
			[DM_ACTOR.id]: DM_ACTOR,
			[PLAYER_ACTOR.id]: PLAYER_ACTOR,
			[OBSERVER_ACTOR.id]: OBSERVER_ACTOR,
		},
		grants: [],
		schemaVersion: PERMISSION_STATE_SCHEMA_VERSION,
	};
}

function context(overrides: Partial<DiagnosticsContextInput> = {}): DiagnosticsContextInput {
	return {
		appVersion: '0.2.0',
		platformProfileId: 'desktop',
		generatedAt: '2026-06-05T12:00:00.000Z',
		online: true,
		syncSources: [
			{
				sourceId: 'local-vault',
				kind: 'local-vault',
				displayName: 'Local Vault',
				state: 'connected',
				detail: null,
				pendingOperations: 0,
				lastSyncedAt: '2026-06-05T11:59:00.000Z',
			},
		],
		capabilities: [],
		schema: [],
		environment: {},
		...overrides,
	};
}

function op(overrides: Partial<SyncOperation>): SyncOperation {
	return {
		id: overrides.id ?? 'op-1',
		vaultId: 'vault',
		sourceId: 'local-vault',
		actorId: 'actor-dm',
		entityType: 'scene',
		entityId: 'scene-1',
		opType: 'scene.update-metadata',
		dependencies: [],
		issuedAt: '2026-06-05T10:00:00.000Z',
		schemaVersion: SYNC_OPERATION_SCHEMA_VERSION,
		...overrides,
	};
}

function asStatus(result: ReturnType<typeof getSyncStatus>): SyncStatusView {
	if (result.kind !== 'sync-status') throw new Error(`expected sync-status, got ${result.kind}`);
	return result;
}

describe('SYNC-010 sync status derivation', () => {
	it('denies an unknown actor (fail closed)', () => {
		const result = getSyncStatus(permissions(), 'actor-ghost', {
			context: context(),
			operations: [],
		});
		expect(result).toEqual({ kind: 'denied', reason: 'unknown-actor' });
	});

	it('AC1: queued offline operations are visible as pending outbound with affected sources', () => {
		const ops = [
			op({ id: 'a', entityId: 'scene-1' }),
			op({ id: 'b', entityId: 'scene-2', opType: 'scene.add-widget' }),
		];
		const status = asStatus(
			getSyncStatus(permissions(), DM_ACTOR.id, {
				context: context({ online: false }),
				operations: ops,
			}),
		);
		expect(status.pendingOutboundCount).toBe(2);
		expect(status.pendingOutbound).toHaveLength(1);
		expect(status.pendingOutbound[0]!.sourceId).toBe('local-vault');
		expect(status.pendingOutbound[0]!.affectedEntityCount).toBe(2);
		// A retry action for the queued work is offered.
		const retry = status.retryActions.find((a) => a.action === 'retry-pending');
		expect(retry?.available).toBe(true);
	});

	it('acknowledged operations are no longer pending outbound', () => {
		const ops = [op({ id: 'a' }), op({ id: 'b' })];
		const status = asStatus(
			getSyncStatus(permissions(), DM_ACTOR.id, {
				context: context(),
				operations: ops,
				acknowledgedOperationIds: new Set(['a']),
			}),
		);
		expect(status.pendingOutboundCount).toBe(1);
		expect(status.pendingOutbound[0]!.operations[0]!.operationId).toBe('b');
	});

	it('surfaces inbound revisions supplied by the (deferred) transport', () => {
		const status = asStatus(
			getSyncStatus(permissions(), DM_ACTOR.id, {
				context: context(),
				operations: [],
				inboundRevisions: [
					{
						sourceId: 'local-vault',
						entityType: 'character',
						entityId: 'char-1',
						revision: 4,
						receivedAt: '2026-06-05T11:00:00.000Z',
					},
				],
			}),
		);
		expect(status.inboundRevisions).toHaveLength(1);
		expect(status.inboundRevisions[0]!.revision).toBe(4);
	});

	it('derives structural conflicts from conflict-shaped ops and marks them resolved', () => {
		const conflict = op({
			id: 'c1',
			entityType: 'character',
			entityId: 'char-1',
			opType: 'character.field-conflict',
			path: 'characters/char-1/conflicts/conf-1',
			// A conflict op carries the conflict record; only structural fields are read by the view.
			value: { id: 'conf-1', reason: 'same-scalar-path', localValue: 'SECRET-HP', remoteValue: 99 },
		});
		const resolution = op({
			id: 'r1',
			entityType: 'character',
			entityId: 'char-1',
			opType: 'character.resolve-conflict',
			value: { conflictId: 'conf-1' },
		});

		const unresolved = asStatus(
			getSyncStatus(permissions(), DM_ACTOR.id, { context: context(), operations: [conflict] }),
		);
		expect(unresolved.conflicts).toHaveLength(1);
		expect(unresolved.unresolvedConflictCount).toBe(1);
		expect(unresolved.conflicts[0]!.reason).toBe('same-scalar-path');
		// The conflict view must NOT leak the conflicting values.
		expect(JSON.stringify(unresolved.conflicts)).not.toContain('SECRET-HP');
		expect(JSON.stringify(unresolved.conflicts)).not.toContain('99');
		// A conflict op is a status record, not a pending WRITE.
		expect(unresolved.pendingOutboundCount).toBe(0);
		expect(unresolved.retryActions.find((a) => a.action === 'resolve-conflicts')?.available).toBe(
			true,
		);

		const resolved = asStatus(
			getSyncStatus(permissions(), DM_ACTOR.id, {
				context: context(),
				operations: [conflict, resolution],
			}),
		);
		expect(resolved.unresolvedConflictCount).toBe(0);
		expect(resolved.conflicts[0]!.resolved).toBe(true);
	});

	it('AC2: a source auth failure surfaces source health + reauthorization guidance', () => {
		const status = asStatus(
			getSyncStatus(permissions(), DM_ACTOR.id, {
				context: context({
					syncSources: [
						{
							sourceId: 'gdocs',
							kind: 'google-docs',
							displayName: 'Google Docs',
							state: 'error',
							detail: null,
							pendingOperations: 2,
							lastSyncedAt: null,
						},
					],
				}),
				operations: [op({ id: 'a', sourceId: 'gdocs' })],
			}),
		);
		expect(status.health).toBe('unhealthy');
		const source = status.sources.find((s) => s.sourceId === 'gdocs')!;
		expect(source.state).toBe('error');
		expect(source.remediation).toMatch(/re-?authenticate|reconnect/i);
		const reauth = status.retryActions.find((a) => a.action === 'reauthorize-source')!;
		expect(reauth.available).toBe(true);
		expect(reauth.detail).toMatch(/local work stays available/i);
	});

	it('retry reuses the PLAT-018 lifecycle: a failed command makes retry-pending available', () => {
		const failed = markFailure(markPending(createCommandLifecycle('scene.add-widget')), 'boom');
		const status = asStatus(
			getSyncStatus(permissions(), DM_ACTOR.id, {
				context: context(),
				operations: [],
				commandLifecycles: [failed],
			}),
		);
		expect(status.retryActions.find((a) => a.action === 'retry-pending')?.available).toBe(true);
	});

	it('a player can inspect their own sync status (player-safe, structural only)', () => {
		const status = asStatus(
			getSyncStatus(permissions(), PLAYER_ACTOR.id, {
				context: context(),
				operations: [op({ id: 'a' })],
			}),
		);
		expect(status.role).toBe('player');
		expect(status.pendingOutboundCount).toBe(1);
	});
});
