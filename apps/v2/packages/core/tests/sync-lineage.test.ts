import { describe, expect, it } from 'vitest';
import {
	MIGRATION_JOURNAL_SCHEMA_VERSION,
	PERMISSION_STATE_SCHEMA_VERSION,
	SYNC_OPERATION_SCHEMA_VERSION,
	actorCanViewSyncLineage,
	getDmSyncLineage,
	getSyncFreshness,
	syncLineageIsStructuralOnly,
	type MigrationJournalEntry,
	type PermissionState,
	type SyncOperation,
} from '../src';
import { DM_ACTOR, OBSERVER_ACTOR, PLAYER_ACTOR } from '../src/testing/fixtures';

/**
 * SYNC-014 — sync status exposes source version history, compacted snapshot lineage, and recovery
 * checkpoints to an authorized DM, WITHOUT exposing hidden content to unauthorized actors. A
 * player/observer sees only non-leaking freshness. These tests prove the non-leak with hard assertions.
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

function op(overrides: Partial<SyncOperation>): SyncOperation {
	return {
		id: overrides.id ?? 'op-1',
		vaultId: 'vault',
		sourceId: 'local-vault',
		actorId: 'actor-dm',
		entityType: 'map',
		entityId: 'map-1',
		opType: 'map.edit-layer',
		dependencies: [],
		issuedAt: '2026-06-05T10:00:00.000Z',
		schemaVersion: SYNC_OPERATION_SCHEMA_VERSION,
		...overrides,
	};
}

function journalEntry(overrides: Partial<MigrationJournalEntry> = {}): MigrationJournalEntry {
	return {
		migrationId: 'mig-1',
		phase: 'committing',
		startedAt: '2026-06-05T09:00:00.000Z',
		committedAt: null,
		rolledBackAt: null,
		targetVersions: { scenes: 2 } as MigrationJournalEntry['targetVersions'],
		snapshot: {
			id: 'snap-1',
			migrationId: 'mig-1',
			createdAt: '2026-06-05T09:00:00.000Z',
			fromVersions: { scenes: 1 } as MigrationJournalEntry['snapshot']['fromVersions'],
			// The snapshot documents carry hidden CONTENT; the lineage view must never read it.
			documents: { scenes: { title: 'The Secret Lair', secretNote: 'TOPSECRET' } } as Record<
				string,
				unknown
			> as MigrationJournalEntry['snapshot']['documents'],
		},
		schemaVersion: MIGRATION_JOURNAL_SCHEMA_VERSION,
		...overrides,
	};
}

describe('SYNC-014 authority gate', () => {
	it('only the DM may view the structural lineage', () => {
		expect(actorCanViewSyncLineage(permissions(), DM_ACTOR.id)).toBe(true);
		expect(actorCanViewSyncLineage(permissions(), PLAYER_ACTOR.id)).toBe(false);
		expect(actorCanViewSyncLineage(permissions(), OBSERVER_ACTOR.id)).toBe(false);
		expect(actorCanViewSyncLineage(permissions(), 'actor-ghost')).toBe(false);
	});

	it('an unknown actor is denied (fail closed)', () => {
		expect(getDmSyncLineage(permissions(), 'actor-ghost', { operations: [] })).toEqual({
			kind: 'denied',
			reason: 'unknown-actor',
		});
		expect(
			getSyncFreshness(permissions(), 'actor-ghost', {
				online: true,
				hasActiveSource: true,
				pendingOperations: 0,
			}),
		).toEqual({ kind: 'denied', reason: 'unknown-actor' });
	});
});

describe('SYNC-014 AC1 DM structural lineage', () => {
	it('exposes per-entity version history (retained operation range + revisions)', () => {
		const ops = [
			op({ id: 'o1', entityId: 'map-1', beforeRevision: 1, afterRevision: 2 }),
			op({ id: 'o2', entityId: 'map-1', beforeRevision: 2, afterRevision: 3 }),
			op({ id: 'o3', entityType: 'scene', entityId: 'scene-1', afterRevision: 1 }),
		];
		const result = getDmSyncLineage(permissions(), DM_ACTOR.id, { operations: ops });
		if (result.kind !== 'sync-lineage') throw new Error('expected DM lineage');
		const mapHistory = result.entityHistory.find((h) => h.entityId === 'map-1')!;
		expect(mapHistory.earliestRevision).toBe(1);
		expect(mapHistory.latestRevision).toBe(3);
		expect(mapHistory.retainedOperationCount).toBe(2);
		expect(mapHistory.retainedOperationIds).toEqual(['o1', 'o2']);
	});

	it('exposes compacted snapshot lineage + recovery checkpoints from the migration journal', () => {
		const committed = journalEntry({
			migrationId: 'mig-0',
			phase: 'committed',
			committedAt: '2026-06-05T08:30:00.000Z',
			snapshot: { ...journalEntry().snapshot, id: 'snap-0', migrationId: 'mig-0' },
		});
		const inFlight = journalEntry(); // phase 'committing' => recovery checkpoint
		const result = getDmSyncLineage(permissions(), DM_ACTOR.id, {
			operations: [],
			migrationJournal: [committed, inFlight],
		});
		if (result.kind !== 'sync-lineage') throw new Error('expected DM lineage');
		expect(result.snapshotLineage).toHaveLength(2);
		expect(result.snapshotLineage.map((c) => c.snapshotId)).toEqual(['snap-0', 'snap-1']);
		expect(result.recoveryCheckpoints.map((c) => c.snapshotId)).toEqual(['snap-1']);
		expect(result.snapshotLineage[1]!.documentIds).toEqual(['scenes']);
	});

	it('the structural lineage never carries snapshot CONTENT (hard non-leak assertion)', () => {
		const result = getDmSyncLineage(permissions(), DM_ACTOR.id, {
			operations: [op({ id: 'o1', beforeRevision: 1, afterRevision: 2 })],
			migrationJournal: [journalEntry()],
		});
		if (result.kind !== 'sync-lineage') throw new Error('expected DM lineage');
		const serialized = JSON.stringify(result);
		expect(serialized).not.toContain('TOPSECRET');
		expect(serialized).not.toContain('The Secret Lair');
		expect(syncLineageIsStructuralOnly(result)).toBe(true);
	});

	it('syncLineageIsStructuralOnly rejects a view that smuggled a value field', () => {
		const result = getDmSyncLineage(permissions(), DM_ACTOR.id, { operations: [] });
		if (result.kind !== 'sync-lineage') throw new Error('expected DM lineage');
		const tampered = {
			...result,
			entityHistory: [
				{ ...result.entityHistory[0], value: 'leaked' } as unknown,
			] as typeof result.entityHistory,
		};
		expect(syncLineageIsStructuralOnly(tampered as typeof result)).toBe(false);
	});
});

describe('SYNC-014 AC2 player/observer non-leaking freshness', () => {
	it('a player who calls the DM lineage is routed to a non-leaking freshness summary', () => {
		const result = getDmSyncLineage(permissions(), PLAYER_ACTOR.id, {
			operations: [op({ id: 'o1', beforeRevision: 1, afterRevision: 2 })],
			migrationJournal: [journalEntry()],
		});
		// Never the structural lineage.
		expect(result.kind).toBe('sync-freshness');
		if (result.kind !== 'sync-freshness') return;
		// And it must not reveal any hidden revision/snapshot/content detail.
		const serialized = JSON.stringify(result);
		expect(serialized).not.toContain('TOPSECRET');
		expect(serialized).not.toContain('The Secret Lair');
		expect(serialized).not.toContain('snap-1');
		expect(serialized).not.toMatch(/revision/i);
	});

	it('reports coarse freshness states from device-local signals only', () => {
		const upToDate = getSyncFreshness(permissions(), PLAYER_ACTOR.id, {
			online: true,
			hasActiveSource: true,
			pendingOperations: 0,
		});
		expect(upToDate.kind === 'sync-freshness' && upToDate.freshness).toBe('up-to-date');

		const syncing = getSyncFreshness(permissions(), PLAYER_ACTOR.id, {
			online: true,
			hasActiveSource: true,
			pendingOperations: 3,
		});
		expect(syncing.kind === 'sync-freshness' && syncing.freshness).toBe('syncing');

		const stale = getSyncFreshness(permissions(), PLAYER_ACTOR.id, {
			online: false,
			hasActiveSource: true,
			pendingOperations: 0,
		});
		expect(stale.kind === 'sync-freshness' && stale.freshness).toBe('stale');

		const unavailable = getSyncFreshness(permissions(), OBSERVER_ACTOR.id, {
			online: true,
			hasActiveSource: false,
			pendingOperations: 0,
		});
		expect(unavailable.kind === 'sync-freshness' && unavailable.freshness).toBe('unavailable');
	});
});
