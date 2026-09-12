import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoreCommand, CoreStateSlice } from '@dndtools/core';

const mocks = vi.hoisted(() => ({
	loadCoreState: vi.fn(),
	persistFullState: vi.fn(),
	seedDemoContent: vi.fn(),
}));

vi.mock('../platform/storage/coreStore', () => ({
	loadCoreState: mocks.loadCoreState,
	persistFullState: mocks.persistFullState,
}));
vi.mock('./demo-seed', () => ({ seedDemoContent: mocks.seedDemoContent }));

import { SceneRuntime } from './SceneRuntime';

function runtime(): SceneRuntime {
	return new SceneRuntime({
		env: {
			vaultId: 'local-default',
			sourceId: 'test-device',
			ids: () => 'test-id',
			clock: () => '2026-01-01T00:00:00.000Z',
		},
		defaultActorId: 'actor-dm',
	});
}

/** A runtime whose ids are unique, for tests that create more than one entity. */
function countingRuntime(): SceneRuntime {
	let next = 0;
	return new SceneRuntime({
		env: {
			vaultId: 'local-default',
			sourceId: 'test-device',
			ids: () => `test-id-${(next += 1)}`,
			clock: () => '2026-01-01T00:00:00.000Z',
		},
		defaultActorId: 'actor-dm',
	});
}

interface SeedTarget {
	readonly state: CoreStateSlice;
	readonly defaultActorId: string;
	dispatch(command: CoreCommand): Promise<{ status: string }>;
}

function createScene(actorId: string, name: string): CoreCommand {
	return { type: 'scene.create', actorId, payload: { name, visibility: 'dm-only' } };
}

function sceneNames(state: CoreStateSlice): string[] {
	return Object.values(state.scenes.scenes)
		.map((scene) => scene.name)
		.sort();
}

beforeEach(() => {
	mocks.loadCoreState.mockReset();
	mocks.persistFullState.mockReset();
	mocks.seedDemoContent.mockReset();
});

describe('SceneRuntime durable-mutation serialization', () => {
	it('coalesces concurrent initial loads instead of racing hydration and demo seeding', async () => {
		let rejectLoad!: (error: Error) => void;
		mocks.loadCoreState.mockImplementationOnce(
			() =>
				new Promise((_, reject) => {
					rejectLoad = reject;
				}),
		);
		const scene = runtime();

		const first = scene.load();
		const second = scene.load();
		expect(second).toBe(first);
		expect(mocks.loadCoreState).toHaveBeenCalledTimes(1);

		rejectLoad(new Error('storage unavailable'));
		await Promise.all([first, second]);
		expect(scene.hasLoadError).toBe(true);
	});

	it('runs maintenance actions one at a time in invocation order', async () => {
		const scene = runtime();
		const order: string[] = [];
		let releaseFirst!: () => void;
		const firstGate = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		const first = scene.runExclusiveMaintenance(async () => {
			order.push('first:start');
			await firstGate;
			order.push('first:end');
		});
		const second = scene.runExclusiveMaintenance(async () => {
			order.push('second:start');
		});

		await vi.waitFor(() => expect(order).toEqual(['first:start']));
		releaseFirst();
		await Promise.all([first, second]);
		expect(order).toEqual(['first:start', 'first:end', 'second:start']);
	});

	it('propagates authoritative reload failures so a restore can roll back', async () => {
		mocks.loadCoreState.mockRejectedValueOnce(new Error('storage hydration failed'));
		const scene = runtime();

		await expect(scene.reloadFromStorage()).rejects.toThrow(/storage hydration failed/i);
		expect(scene.hasLoadError).toBe(true);
		expect(scene.lastError).toMatch(/storage hydration failed/i);
	});

	it('keeps an intentionally empty restored vault free of demo maps and participants', async () => {
		const stored = structuredClone(runtime().authoritativeState);
		mocks.loadCoreState.mockResolvedValueOnce(stored);
		const scene = runtime();

		await scene.reloadFromStorage();

		expect(scene.authoritativeState.maps.maps).toEqual({});
		expect(Object.keys(scene.authoritativeState.permissions.actors)).toEqual(['actor-dm']);
	});

	it('still adds the first-run demo fixtures during an initial load', async () => {
		const stored = structuredClone(runtime().authoritativeState);
		mocks.loadCoreState.mockResolvedValueOnce(stored);
		const scene = runtime();

		await scene.load();

		expect(Object.keys(scene.authoritativeState.maps.maps).length).toBeGreaterThan(0);
		expect(scene.authoritativeState.permissions.actors['actor-player']?.role).toBe('player');
	});
});

describe('SceneRuntime first-run demo seed', () => {
	it('runs every seed command through the core but commits them as one durable write', async () => {
		mocks.loadCoreState.mockResolvedValueOnce(structuredClone(runtime().authoritativeState));
		mocks.seedDemoContent.mockImplementationOnce(async (rt: SeedTarget) => {
			for (const name of ['Harbor', 'Keep']) {
				const result = await rt.dispatch(createScene(rt.defaultActorId, name));
				expect(result.status).toBe('accepted');
			}
			// A later seed command reads the state the earlier ones produced.
			expect(sceneNames(rt.state)).toEqual(['Harbor', 'Keep']);
			// The core still rejects what it would reject from a DM.
			const rejected = await rt.dispatch(createScene('actor-nobody', 'Forged'));
			expect(rejected.status).toBe('rejected');
			return true;
		});
		const scene = countingRuntime();
		const replicated: number[] = [];
		scene.onDispatched((operations) => replicated.push(operations.length));

		await scene.load();

		expect(scene.loaded).toBe(true);
		expect(mocks.persistFullState).toHaveBeenCalledTimes(1);
		const [previous, next] = mocks.persistFullState.mock.calls[0] as [
			CoreStateSlice,
			CoreStateSlice,
		];
		expect(sceneNames(previous)).toEqual([]);
		expect(next).toBe(scene.authoritativeState);
		expect(sceneNames(next)).toEqual(['Harbor', 'Keep']);
		// Every accepted seed operation is in the one commit and replicated once, together.
		const appended = next.sync.operations.length - previous.sync.operations.length;
		expect(appended).toBeGreaterThanOrEqual(2);
		expect(replicated).toEqual([appended]);
	});

	it('leaves the vault as it was when the seed commit fails', async () => {
		mocks.loadCoreState.mockResolvedValueOnce(structuredClone(runtime().authoritativeState));
		mocks.seedDemoContent.mockImplementationOnce(async (rt: SeedTarget) => {
			await rt.dispatch(createScene(rt.defaultActorId, 'Harbor'));
			return true;
		});
		mocks.persistFullState.mockRejectedValueOnce(new Error('quota exceeded'));
		const scene = countingRuntime();
		const replicated: number[] = [];
		scene.onDispatched((operations) => replicated.push(operations.length));

		await scene.load();

		// Best-effort, like a rejected seed command: the app still loads, with nothing half-seeded.
		expect(scene.loaded).toBe(true);
		expect(scene.hasLoadError).toBe(false);
		expect(sceneNames(scene.authoritativeState)).toEqual([]);
		expect(replicated).toEqual([]);
	});

	it('holds other commands until the seed has committed', async () => {
		mocks.loadCoreState.mockResolvedValueOnce(structuredClone(runtime().authoritativeState));
		let seedStarted = false;
		let releaseSeed!: () => void;
		const seedGate = new Promise<void>((resolve) => {
			releaseSeed = resolve;
		});
		mocks.seedDemoContent.mockImplementationOnce(async (rt: SeedTarget) => {
			await rt.dispatch(createScene(rt.defaultActorId, 'Harbor'));
			seedStarted = true;
			await seedGate;
			return true;
		});
		const scene = countingRuntime();

		const loading = scene.load();
		await vi.waitFor(() => expect(seedStarted).toBe(true));
		const other = scene.dispatch(createScene('actor-dm', 'Other'));
		releaseSeed();
		await Promise.all([loading, other]);

		expect(mocks.persistFullState).toHaveBeenCalledTimes(2);
		const [seedCommit, otherCommit] = mocks.persistFullState.mock.calls as Array<
			[CoreStateSlice, CoreStateSlice]
		>;
		expect(sceneNames(seedCommit[1])).toEqual(['Harbor']);
		// The later command was built on the committed seed, never on a half-seeded state.
		expect(otherCommit[0]).toBe(seedCommit[1]);
		expect(sceneNames(scene.authoritativeState)).toEqual(['Harbor', 'Other']);
	});
});
