import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	__testing,
	loadCoreState,
	persistFullState,
	recoverPendingMigration,
	writeMigrationJournal,
} from '../../src/lib/platform/storage/scene-store';
import {
	DURABLE_STATE_DOCUMENT_IDS,
	TARGET_SCHEMA_VERSIONS,
	beginMigration,
	dispatchCommand,
	markCommitting,
	type CoreEnvironment,
	type CoreStateSlice,
	type DurableStateDocumentId,
} from '@dndtools/v2-core';
import { DM_ACTOR, buildInitialState, makeEnvironment } from '@dndtools/v2-core/testing';

let env: CoreEnvironment;
let state: CoreStateSlice;

const fromVersions = Object.fromEntries(DURABLE_STATE_DOCUMENT_IDS.map((id) => [id, 1])) as Record<
	DurableStateDocumentId,
	number | null
>;
const targetVersions = Object.fromEntries(
	DURABLE_STATE_DOCUMENT_IDS.map((id) => [id, TARGET_SCHEMA_VERSIONS[id]]),
) as Record<DurableStateDocumentId, number>;

beforeEach(async () => {
	env = makeEnvironment();
	state = buildInitialState(DM_ACTOR);
	await persistFullState(buildInitialState(), state);
});

afterEach(async () => {
	await __testing.closeDb();
	indexedDB.deleteDatabase(__testing.DB_NAME);
});

describe('PLAT-008 AC2: write-ahead recovery against the Dexie store', () => {
	it('rolls back to the safety snapshot when a migration died mid-write', async () => {
		// Persist a known-good Scene state, then capture it as a safety snapshot.
		const created = dispatchCommand(state, env, {
			type: 'scene.create',
			actorId: DM_ACTOR.id,
			payload: { name: 'Pre-migration Scene', visibility: 'dm-only' },
		});
		if (created.status !== 'accepted') throw new Error('create failed');
		await persistFullState(state, created.nextState);
		const goodScenes = created.nextState.scenes;

		// Begin a migration: write-ahead journal + safety snapshot of the good documents.
		const documents = Object.fromEntries(
			DURABLE_STATE_DOCUMENT_IDS.map((id) => [id, created.nextState[id]]),
		) as Record<DurableStateDocumentId, unknown>;
		const journal = markCommitting(
			beginMigration({
				migrationId: 'mig-1',
				startedAt: '2026-06-04T00:00:00.000Z',
				snapshotId: 'snap-1',
				fromVersions,
				targetVersions,
				documents,
			}),
		);
		await writeMigrationJournal(journal);

		// Simulate a corrupting mid-write: clobber the persisted Scene document directly.
		await __testing.putRawDocument(__testing.SCENE_STATE_KEY, {
			scenes: {},
			schemaVersion: goodScenes.schemaVersion,
		});

		// Restart: loading runs recovery, which rolls back to the snapshot, restoring the
		// pre-migration Scene document that the corrupting write destroyed.
		await __testing.closeDb();
		const reloaded = await loadCoreState();
		const scene = Object.values(reloaded.scenes.scenes)[0];
		expect(scene?.name).toBe('Pre-migration Scene');
	});

	it('clears a pending journal without rolling back when no write began', async () => {
		const documents = Object.fromEntries(
			DURABLE_STATE_DOCUMENT_IDS.map((id) => [id, state[id]]),
		) as Record<DurableStateDocumentId, unknown>;
		await writeMigrationJournal(
			beginMigration({
				migrationId: 'mig-2',
				startedAt: '2026-06-04T00:00:00.000Z',
				snapshotId: 'snap-2',
				fromVersions,
				targetVersions,
				documents,
			}),
		);
		const decision = await recoverPendingMigration();
		expect(decision.action).toBe('clear-journal');
		// A second recovery is a no-op (journal cleared).
		expect((await recoverPendingMigration()).action).toBe('none');
	});

	it('is a no-op on a clean start with no journal', async () => {
		const decision = await recoverPendingMigration();
		expect(decision.action).toBe('none');
	});
});
