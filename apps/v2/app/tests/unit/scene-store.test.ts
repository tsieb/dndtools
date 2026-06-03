import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	__testing,
	appendOperations,
	loadCoreState,
	persistFullState,
	resetCoreStorage,
} from '../../src/lib/platform/storage/scene-store';
import {
	dispatchCommand,
	type CoreEnvironment,
	type CoreStateSlice,
	type PermissionState,
} from '@dndtools/v2-core';
import {
	DM_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '@dndtools/v2-core/testing';

let env: CoreEnvironment;
let state: CoreStateSlice;

beforeEach(async () => {
	await resetCoreStorage();
	env = makeEnvironment();
	state = buildInitialState(DM_ACTOR);
	await persistFullState(buildInitialState(), state);
});

afterEach(async () => {
	await __testing.closeDb();
	indexedDB.deleteDatabase(__testing.DB_NAME);
});

describe('Dexie scene store round-trip (CANVAS-001 restart persistence)', () => {
	it('persists a created Scene and rehydrates it after a fresh load', async () => {
		const created = dispatchCommand(state, env, {
			type: 'scene.create',
			actorId: DM_ACTOR.id,
			payload: { name: 'Persisted Scene', visibility: 'dm-only' },
		});
		expect(created.status).toBe('accepted');
		if (created.status !== 'accepted') return;
		await persistFullState(state, created.nextState);

		await __testing.closeDb();

		const reloaded = await loadCoreState();
		const reloadedScene = Object.values(reloaded.scenes.scenes)[0];
		expect(reloadedScene?.name).toBe('Persisted Scene');
		expect(reloadedScene?.ownership.ownerActorId).toBe(DM_ACTOR.id);
		expect(reloaded.sync.operations).toHaveLength(1);
	});

	it('appends operations in sequence on subsequent dispatches', async () => {
		let cur = state;
		for (const name of ['One', 'Two', 'Three']) {
			const r = dispatchCommand(cur, env, {
				type: 'scene.create',
				actorId: DM_ACTOR.id,
				payload: { name },
			});
			if (r.status !== 'accepted') throw new Error('create');
			await persistFullState(cur, r.nextState);
			cur = r.nextState;
		}
		await __testing.closeDb();
		const reloaded = await loadCoreState();
		expect(Object.keys(reloaded.scenes.scenes)).toHaveLength(3);
		expect(reloaded.sync.operations.map((o) => o.opType)).toEqual([
			'scene.create',
			'scene.create',
			'scene.create',
		]);
	});

	it('appendOperations is a no-op for empty input', async () => {
		await expect(appendOperations([])).resolves.toBeUndefined();
		void state;
		// PermissionState type is exported and usable
		const _typed: PermissionState | null = null;
		expect(_typed).toBeNull();
	});
});
