import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	PlatformBoundaryRejectionError,
	__testing,
	loadCoreState,
	persistFullState,
	storagePort,
} from '../../src/lib/platform/storage/scene-store';
import { dispatchCommand, type CoreStateSlice } from '@dndtools/v2-core';
import { DM_ACTOR, buildInitialState, makeEnvironment } from '@dndtools/v2-core/testing';

let state: CoreStateSlice;

beforeEach(async () => {
	state = buildInitialState(DM_ACTOR);
	await persistFullState(buildInitialState(), state);
});

afterEach(async () => {
	await __testing.closeDb();
	indexedDB.deleteDatabase(__testing.DB_NAME);
});

describe('PLAT-006: the GUI-facing storage port exposes only named methods', () => {
	it('exposes exactly the named StoragePort methods', () => {
		expect(Object.keys(storagePort).sort()).toEqual([
			'loadCoreState',
			'persistFullState',
			'recoverPendingMigration',
			'resetCoreStorage',
		]);
	});
});

describe('PLAT-007: persistFullState validates at the platform-service boundary', () => {
	it('persists a well-formed state slice produced by an accepted command', async () => {
		const result = dispatchCommand(state, makeEnvironment(), {
			type: 'scene.create',
			actorId: DM_ACTOR.id,
			payload: { name: 'Boundary Scene', visibility: 'dm-only' },
		});
		if (result.status !== 'accepted') throw new Error('create failed');
		await persistFullState(state, result.nextState);
		const reloaded = await loadCoreState();
		expect(Object.values(reloaded.scenes.scenes).some((s) => s.name === 'Boundary Scene')).toBe(
			true,
		);
	});

	it('rejects a malformed next slice with a structured boundary error before writing', async () => {
		// `previous` is valid, `next` is structurally broken (missing durable documents).
		const brokenNext = { schemaVersion: 1 } as unknown as CoreStateSlice;
		await expect(persistFullState(state, brokenNext)).rejects.toBeInstanceOf(
			PlatformBoundaryRejectionError,
		);
		// The valid baseline still loads — the rejected write never touched storage.
		const reloaded = await loadCoreState();
		expect(reloaded).toBeDefined();
	});

	it('boundary error carries the offending method and a code', async () => {
		const brokenNext = 123 as unknown as CoreStateSlice;
		try {
			await persistFullState(state, brokenNext);
			throw new Error('expected rejection');
		} catch (error) {
			expect(error).toBeInstanceOf(PlatformBoundaryRejectionError);
			const boundary = error as PlatformBoundaryRejectionError;
			expect(boundary.method).toBe('storage.persistFullState');
			expect(boundary.code).toBe('invalid-payload');
		}
	});
});
