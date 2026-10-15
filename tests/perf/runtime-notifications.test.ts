import { beforeEach, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({ load: vi.fn(), persist: vi.fn() }));
vi.mock('../../apps/gm-react/src/platform/storage/coreStore', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../apps/gm-react/src/platform/storage/coreStore')>()),
	loadCoreState: storage.load,
	persistFullState: storage.persist,
	activeLocalVaultId: () => 'primary',
}));
import { SceneRuntime } from '../../apps/gm-react/src/runtime/SceneRuntime';

async function loadedRuntime() {
	let id = 0;
	const runtime = new SceneRuntime({
		defaultActorId: 'dm',
		env: {
			vaultId: 'perf-test',
			sourceId: 'local',
			ids: () => `id-${++id}`,
			clock: () => '2026-09-19T00:00:00.000Z',
		},
	});
	storage.load.mockResolvedValue(structuredClone(runtime.authoritativeState));
	await runtime.reloadFromStorage();
	return runtime;
}

beforeEach(() => {
	storage.load.mockReset();
	storage.persist.mockReset();
});

it('notifies every subscriber synchronously with the new version and preview state', async () => {
	const runtime = await loadedRuntime();
	const version = runtime.getVersion();
	const observed: Array<[number, boolean]> = [];
	const unsubscribe = runtime.subscribe(() => {
		observed.push([runtime.getVersion(), runtime.readOnly]);
	});
	const other = vi.fn();
	runtime.subscribe(other);
	runtime.enterPreview({ role: 'player' });
	expect(observed).toEqual([[version + 1, true]]);
	expect(other).toHaveBeenCalledTimes(1);
	unsubscribe();
	runtime.exitPreview();
	expect(observed).toHaveLength(1);
	expect(other).toHaveBeenCalledTimes(2);
	expect(runtime.readOnly).toBe(false);
});

it('retains one durable replication event per command and does not notify before persistence', async () => {
	const runtime = await loadedRuntime();
	let finish!: () => void;
	storage.persist.mockImplementationOnce(
		() =>
			new Promise<void>((resolve) => {
				finish = resolve;
			}),
	);
	const subscriber = vi.fn();
	const replicated = vi.fn();
	runtime.subscribe(subscriber);
	runtime.onDispatched(replicated);
	const first = runtime.dispatch({
		type: 'scene.create',
		actorId: 'dm',
		payload: { name: 'First', visibility: 'dm-only' },
	});
	const second = runtime.dispatch({
		type: 'scene.create',
		actorId: 'dm',
		payload: { name: 'Second', visibility: 'dm-only' },
	});
	await vi.waitFor(() => expect(storage.persist).toHaveBeenCalledTimes(1));
	expect(subscriber).not.toHaveBeenCalled();
	expect(replicated).not.toHaveBeenCalled();
	finish();
	await Promise.all([first, second]);
	expect(subscriber).toHaveBeenCalledTimes(2);
	expect(replicated).toHaveBeenCalledTimes(2);
	expect(replicated.mock.calls[0][1]).not.toBe(replicated.mock.calls[1][1]);
});

it('notifies rollback and failure without replicating a failed durable write', async () => {
	const runtime = await loadedRuntime();
	const before = runtime.authoritativeState;
	storage.persist.mockRejectedValueOnce(new Error('disk full'));
	const observed: unknown[] = [];
	runtime.subscribe(() => observed.push([runtime.authoritativeState, runtime.lastError]));
	const replicated = vi.fn();
	runtime.onDispatched(replicated);
	await expect(
		runtime.dispatch({
			type: 'scene.create',
			actorId: 'dm',
			payload: { name: 'Lost', visibility: 'dm-only' },
		}),
	).rejects.toThrow('disk full');
	expect(observed).toEqual([[before, 'disk full']]);
	expect(replicated).not.toHaveBeenCalled();
});
