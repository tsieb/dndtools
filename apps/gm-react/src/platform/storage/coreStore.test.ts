import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dexie from 'dexie';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { dispatchCommand, type CoreCommand, type CoreStateSlice } from '@dndtools/core';
import {
	__testing,
	loadCoreState,
	persistFullState,
	resetCoreStorage,
	restoreCoreState,
} from './coreStore';

const ACTOR = 'dm-1';
const env = {
	vaultId: 'local-default',
	sourceId: 'test-device',
	ids: (() => {
		let next = 0;
		return () => `id-${(next += 1)}`;
	})(),
	clock: () => '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
	const factory = new IDBFactory();
	globalThis.indexedDB = factory;
	Dexie.dependencies.indexedDB = factory;
	Dexie.dependencies.IDBKeyRange = IDBKeyRange;
});

afterEach(async () => {
	vi.restoreAllMocks();
	await __testing.closeDb();
});

/** A loaded (empty) vault with a DM seat, the way `SceneRuntime.ensureDefaultActor` prepares it. */
async function loadedWithDm(): Promise<CoreStateSlice> {
	const loaded = await loadCoreState();
	return {
		...loaded,
		permissions: {
			...loaded.permissions,
			actors: { [ACTOR]: { id: ACTOR, role: 'dm', displayName: 'DM' } },
		},
	};
}

function createScene(name: string): CoreCommand {
	return { type: 'scene.create', actorId: ACTOR, payload: { name, visibility: 'dm-only' } };
}

function accepted(state: CoreStateSlice, command: CoreCommand): CoreStateSlice {
	const result = dispatchCommand(state, env, command);
	if (result.status !== 'accepted') throw new Error(result.rejection.message);
	return result.nextState;
}

/** Document keys written through `Table.put` since the spy was installed. */
function putSpy(): () => string[] {
	const spy = vi.spyOn(__testing.getDb().documents, 'put');
	// `spyOn` on an already-spied method returns the same spy, so start each count from zero.
	spy.mockClear();
	return () =>
		spy.mock.calls
			.map((call) => (call[0] as { key?: string }).key)
			.filter((key): key is string => typeof key === 'string')
			.sort();
}

const ALL_DOCUMENTS = [
	__testing.SCENE_STATE_KEY,
	__testing.MAP_STATE_KEY,
	__testing.PERMISSION_STATE_KEY,
	__testing.SESSION_STATE_KEY,
	__testing.WIDGET_PACKAGE_STATE_KEY,
	__testing.COMMAND_CENTER_STATE_KEY,
	__testing.CHARACTER_STATE_KEY,
	'content-state',
	'encounter-state',
	'audio-state',
	'mcp-policy-state',
	'systems-state',
].sort();

describe('persistFullState writes what changed', () => {
	it('writes every slice document on the first commit after a load, then only the changed slices', async () => {
		const before = await loadedWithDm();
		const first = accepted(before, createScene('Harbor'));
		const written = putSpy();
		await persistFullState(before, first);
		expect(written()).toEqual(ALL_DOCUMENTS);

		const second = accepted(first, createScene('Keep'));
		const writtenSecond = putSpy();
		await persistFullState(first, second);
		// `scene.create` touches the scene slice; everything else kept its reference and is on disk.
		expect(writtenSecond()).toEqual([__testing.SCENE_STATE_KEY]);

		// The vault reloads with both commits, and the whole log, intact.
		await __testing.closeDb();
		const reloaded = await loadCoreState();
		expect(
			Object.values(reloaded.scenes.scenes)
				.map((scene) => scene.name)
				.sort(),
		).toEqual(['Harbor', 'Keep']);
		expect(reloaded.sync.operations.length).toBe(second.sync.operations.length);
	});

	it('forgets what is on disk after a reload, restore or reset, so the next commit rewrites everything', async () => {
		const before = await loadedWithDm();
		const first = accepted(before, createScene('Harbor'));
		await persistFullState(before, first);

		// Reload: the runtime now holds freshly hydrated objects; nothing of them is known to be on disk.
		const reloaded = await loadCoreState();
		const next = accepted(reloaded, createScene('Keep'));
		const afterReload = putSpy();
		await persistFullState(reloaded, next);
		expect(afterReload()).toEqual(ALL_DOCUMENTS);

		// Restore replaces the documents table wholesale; the in-memory slices are stale by definition.
		await restoreCoreState(
			structuredClone({ ...next, sync: { operations: next.sync.operations } }),
		);
		const restored = await loadCoreState();
		const afterRestore = accepted(restored, createScene('Tower'));
		const writtenAfterRestore = putSpy();
		await persistFullState(restored, afterRestore);
		expect(writtenAfterRestore()).toEqual(ALL_DOCUMENTS);

		// Reset wipes the table: a commit that reuses references from before the wipe must still write.
		await resetCoreStorage();
		const wiped = await loadCoreState();
		const afterReset = accepted(
			{ ...wiped, permissions: afterRestore.permissions },
			createScene('Harbor'),
		);
		const writtenAfterReset = putSpy();
		await persistFullState(wiped, afterReset);
		expect(writtenAfterReset()).toEqual(ALL_DOCUMENTS);
	});

	it('does not remember a commit whose transaction failed', async () => {
		const before = await loadedWithDm();
		const first = accepted(before, createScene('Harbor'));
		const failing = vi
			.spyOn(__testing.getDb().operations, 'bulkPut')
			.mockRejectedValueOnce(new Error('quota exceeded'));
		await expect(persistFullState(before, first)).rejects.toThrow('quota exceeded');
		failing.mockRestore();
		// The retry writes every document: the failed transaction proved nothing about the disk.
		const written = putSpy();
		await persistFullState(before, first);
		expect(written()).toEqual(ALL_DOCUMENTS);
		await __testing.closeDb();
		expect(Object.keys((await loadCoreState()).scenes.scenes)).toHaveLength(1);
	});

	it('still refuses a durable change that appended no operation', async () => {
		const before = await loadedWithDm();
		const first = accepted(before, createScene('Harbor'));
		await persistFullState(before, first);
		const tampered: CoreStateSlice = {
			...first,
			scenes: { ...first.scenes, scenes: {} },
		};
		await expect(persistFullState(first, tampered)).rejects.toThrow(
			'Durable state changed without an accepted Processing Core operation.',
		);
	});

	it('validates only the appended operations at the boundary, and rejects a malformed one', async () => {
		const before = await loadedWithDm();
		const first = accepted(before, createScene('Harbor'));
		const [op] = first.sync.operations.slice(before.sync.operations.length);
		const malformed: CoreStateSlice = {
			...first,
			sync: {
				...first.sync,
				operations: [...before.sync.operations, { ...op!, entityId: '' }],
			},
		};
		await expect(persistFullState(before, malformed)).rejects.toMatchObject({
			name: 'PlatformBoundaryRejectionError',
			code: 'invalid-payload',
		});
	});
});
