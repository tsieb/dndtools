import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	loadCoreState: vi.fn(),
}));

vi.mock('../platform/storage/coreStore', () => ({
	loadCoreState: mocks.loadCoreState,
	persistFullState: vi.fn(),
}));
vi.mock('./demo-seed', () => ({ seedDemoContent: vi.fn() }));

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

beforeEach(() => {
	mocks.loadCoreState.mockReset();
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
