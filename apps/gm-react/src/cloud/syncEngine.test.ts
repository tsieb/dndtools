// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SceneRuntime } from '../runtime/SceneRuntime';

const mocks = vi.hoisted(() => ({
	token: '' as string | null,
	encrypt: vi.fn(async (_context: unknown, _value: unknown) => ({
		v: 2 as const,
		alg: 'AES-GCM' as const,
		epoch: 1,
		iv: 'a'.repeat(16),
		ct: 'b'.repeat(24),
		contentHash: 'c'.repeat(43),
		ctx: 'd'.repeat(43),
	})),
	decrypt: vi.fn(),
	restore: vi.fn(),
	validate: vi.fn((value: unknown) => value),
}));

vi.mock('./auth', () => ({ getIdToken: async () => mocks.token }));
vi.mock('./vaultKey', () => ({
	vaultKeyManager: {
		encrypt: mocks.encrypt,
		decrypt: mocks.decrypt,
	},
}));
vi.mock('../platform/storage/coreStore', () => ({
	restoreCoreState: mocks.restore,
	validateRestoredCoreState: mocks.validate,
}));

import { createSyncEngine, type SyncEngineStatus } from './syncEngine';

const fetchMock = vi.fn();

function tokenFor(sub: string): string {
	const payload = Buffer.from(JSON.stringify({ sub })).toString('base64url');
	return `e30.${payload}.signature`;
}

function runtimeStub(operations: unknown[] = []): SceneRuntime {
	return {
		authoritativeState: { sync: { operations } },
		onDispatched: vi.fn(() => vi.fn()),
		reloadFromStorage: vi.fn(),
		runExclusiveMaintenance: vi.fn(async (operation: () => Promise<unknown>) => operation()),
	} as unknown as SceneRuntime;
}

function snapshotResponse(revision = 0) {
	return {
		meta: {
			revision,
			size: 18,
			contentHash: 'c'.repeat(43),
			issuedAt: '2026-01-01T00:00:00.000Z',
		},
		envelope: {
			v: 2 as const,
			alg: 'AES-GCM' as const,
			epoch: 1,
			iv: 'a'.repeat(16),
			ct: 'b'.repeat(24),
			contentHash: 'c'.repeat(43),
			ctx: 'c'.repeat(43),
		},
	};
}

function restoredSlice(operationCount = 0) {
	return {
		sync: {
			operations: Array.from({ length: operationCount }, (_, revision) => ({
				id: `restored-${revision}`,
			})),
		},
	};
}

function engine(
	onStatus?: (status: SyncEngineStatus) => void,
	runtime: SceneRuntime = runtimeStub(),
) {
	return createSyncEngine({
		runtime,
		apiUrl: 'https://sync.example.com/dev',
		accountId: 'account-a',
		onStatus,
	});
}

beforeEach(() => {
	vi.stubGlobal('fetch', fetchMock);
	window.localStorage.clear();
	fetchMock.mockReset();
	mocks.encrypt.mockReset().mockImplementation(async (_context: unknown, _value: unknown) => ({
		v: 2 as const,
		alg: 'AES-GCM' as const,
		epoch: 1,
		iv: 'a'.repeat(16),
		ct: 'b'.repeat(24),
		contentHash: 'c'.repeat(43),
		ctx: 'd'.repeat(43),
	}));
	mocks.decrypt.mockReset();
	mocks.restore.mockReset().mockResolvedValue(undefined);
	mocks.validate.mockReset().mockImplementation((value: unknown) => value);
	mocks.token = tokenFor('account-a');
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('backup failure behavior', () => {
	it('propagates a user-triggered syncNow failure after recording it in status', async () => {
		fetchMock.mockRejectedValueOnce(new TypeError('network offline'));
		const backup = engine();

		await expect(backup.syncNow()).rejects.toThrow('network offline');
		expect(backup.getStatus()).toMatchObject({
			busy: false,
			lastError: 'network offline',
			lastSyncedAt: null,
		});
	});

	it('records but swallows a scheduled background failure', async () => {
		vi.useFakeTimers();
		fetchMock.mockRejectedValueOnce(new TypeError('background offline'));
		let latest: SyncEngineStatus | null = null;
		const backup = engine((status) => {
			latest = status;
		});

		backup.start();
		await vi.advanceTimersByTimeAsync(1_500);
		await Promise.resolve();

		expect(fetchMock).toHaveBeenCalledOnce();
		expect(latest).toMatchObject({ busy: false, lastError: 'background offline' });
		backup.stop();
	});

	it('reuses the exact encrypted snapshot body after a lost response', async () => {
		fetchMock
			.mockRejectedValueOnce(new TypeError('response lost after accept'))
			.mockResolvedValueOnce(new Response(null, { status: 200 }));
		const backup = engine();

		await expect(backup.syncNow()).rejects.toThrow(/response lost/i);
		const firstBody = fetchMock.mock.calls[0]?.[1]?.body;
		await expect(backup.syncNow()).resolves.toBeUndefined();
		const retryBody = fetchMock.mock.calls[1]?.[1]?.body;

		expect(retryBody).toBe(firstBody);
		expect(mocks.encrypt).toHaveBeenCalledOnce();
		expect(backup.getStatus()).toMatchObject({ busy: false, lastError: null });
	});

	it('recovers after restart when an accepted snapshot response was lost and ciphertext changes', async () => {
		mocks.encrypt
			.mockResolvedValueOnce({
				v: 2,
				alg: 'AES-GCM',
				epoch: 1,
				iv: 'a'.repeat(16),
				ct: 'b'.repeat(24),
				contentHash: 'c'.repeat(43),
				ctx: 'g'.repeat(43),
			})
			.mockResolvedValueOnce({
				v: 2,
				alg: 'AES-GCM',
				epoch: 1,
				iv: 'd'.repeat(16),
				ct: 'e'.repeat(24),
				contentHash: 'f'.repeat(43),
				ctx: 'h'.repeat(43),
			});
		fetchMock
			.mockRejectedValueOnce(new TypeError('response lost after accept'))
			.mockResolvedValueOnce(new Response(null, { status: 200 }));

		const beforeRestart = engine();
		await expect(beforeRestart.syncNow()).rejects.toThrow(/response lost/i);
		const firstBody = String(fetchMock.mock.calls[0]?.[1]?.body);

		const afterRestart = engine();
		await expect(afterRestart.syncNow()).resolves.toBeUndefined();
		const replayBody = String(fetchMock.mock.calls[1]?.[1]?.body);

		expect(replayBody).not.toBe(firstBody);
		expect(JSON.parse(firstBody).meta.revision).toBe(0);
		expect(JSON.parse(replayBody).meta.revision).toBe(0);
		expect(mocks.encrypt).toHaveBeenCalledTimes(2);
		expect(afterRestart.getStatus()).toMatchObject({ busy: false, lastError: null });
	});

	it('reuses an encrypted operation batch until its high-water advances', async () => {
		fetchMock
			.mockResolvedValueOnce(new Response(null, { status: 200 }))
			.mockRejectedValueOnce(new TypeError('operation response lost'))
			.mockResolvedValueOnce(new Response(null, { status: 200 }));
		const runtime = runtimeStub([
			{
				id: 'op-1',
				vaultId: 'primary',
				sourceId: 'device-1',
				actorId: 'actor-1',
				entityType: 'scene',
				entityId: 'scene-1',
				opType: 'update',
				dependencies: [],
				issuedAt: '2026-01-01T00:00:00.000Z',
				schemaVersion: 1,
			},
		]);
		const backup = engine(undefined, runtime);

		await expect(backup.syncNow()).rejects.toThrow(/operation response lost/i);
		const firstOperationBody = fetchMock.mock.calls[1]?.[1]?.body;
		await expect(backup.syncNow()).resolves.toBeUndefined();
		const retriedOperationBody = fetchMock.mock.calls[2]?.[1]?.body;

		expect(retriedOperationBody).toBe(firstOperationBody);
		expect(mocks.encrypt).toHaveBeenCalledTimes(2);
		expect(mocks.encrypt).toHaveBeenNthCalledWith(
			1,
			{ accountId: 'account-a', vaultId: 'primary', kind: 'snapshot', revision: 1 },
			expect.any(Object),
		);
		expect(mocks.encrypt).toHaveBeenNthCalledWith(
			2,
			{ accountId: 'account-a', vaultId: 'primary', kind: 'operation', revision: 0 },
			expect.objectContaining({ id: 'op-1' }),
		);
		expect(backup.getStatus().lastPushedRevision).toBe(0);
	});

	it('rejects if the token belongs to a different account before sending data', async () => {
		mocks.token = tokenFor('account-b');
		const backup = engine();

		await expect(backup.syncNow()).rejects.toThrow(/account changed/i);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('ignores the legacy v1 push high-water so old operations are upgraded to context-bound v2', async () => {
		window.localStorage.setItem('dndtools:react:cloud-pushed-rev:account-a:primary', '99');
		fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
		const runtime = runtimeStub([
			{
				id: 'op-upgrade',
				vaultId: 'primary',
				sourceId: 'device-1',
				actorId: 'actor-1',
				entityType: 'scene',
				entityId: 'scene-1',
				opType: 'update',
				dependencies: [],
				issuedAt: '2026-01-01T00:00:00.000Z',
				schemaVersion: 1,
			},
		]);

		await engine(undefined, runtime).syncNow();

		expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
			'https://sync.example.com/dev/vaults/primary/snapshot',
			'https://sync.example.com/dev/vaults/primary/operations',
		]);
		expect(
			window.localStorage.getItem('dndtools:react:cloud-pushed-rev-v2:account-a:primary'),
		).toBe('0');
	});
});

describe('restore safety', () => {
	it('decrypts with the exact snapshot context and validates before replacing local state', async () => {
		const restored = restoredSlice();
		mocks.decrypt.mockResolvedValue(restored);
		mocks.validate.mockReturnValue(restored);
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify(snapshotResponse()), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			}),
		);
		const runtime = runtimeStub();

		await expect(engine(undefined, runtime).restoreFromCloud()).resolves.toBe('restored');

		expect(mocks.decrypt).toHaveBeenCalledWith(
			{ accountId: 'account-a', vaultId: 'primary', kind: 'snapshot', revision: 0 },
			expect.objectContaining({ v: 2 }),
		);
		expect(mocks.validate).toHaveBeenCalledWith(restored);
		expect(mocks.restore).toHaveBeenCalledOnce();
		expect(runtime.runExclusiveMaintenance).toHaveBeenCalledOnce();
		expect(runtime.reloadFromStorage).toHaveBeenCalledOnce();
	});

	it('rejects invalid decrypted state before touching storage', async () => {
		const decrypted = restoredSlice();
		mocks.decrypt.mockResolvedValue(decrypted);
		mocks.validate.mockImplementation(() => {
			throw new Error('Cloud backup schema is unsupported; the local campaign was not changed.');
		});
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify(snapshotResponse()), { status: 200 }),
		);

		const backup = engine();
		await expect(backup.restoreFromCloud()).rejects.toThrow(/local campaign was not changed/i);
		expect(mocks.restore).not.toHaveBeenCalled();
		expect(backup.getStatus()).toMatchObject({
			busy: false,
			lastError: expect.stringMatching(/local campaign was not changed/i),
		});
	});

	it('rejects a snapshot whose operation count does not match its revision', async () => {
		const restored = restoredSlice();
		mocks.decrypt.mockResolvedValue(restored);
		mocks.validate.mockReturnValue(restored);
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify(snapshotResponse(1)), { status: 200 }),
		);

		await expect(engine().restoreFromCloud()).rejects.toThrow(/revision does not match/i);
		expect(mocks.restore).not.toHaveBeenCalled();
	});

	it('rolls storage back if the runtime cannot load the restored state', async () => {
		const restored = restoredSlice();
		mocks.decrypt.mockResolvedValue(restored);
		mocks.validate.mockReturnValue(restored);
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify(snapshotResponse()), { status: 200 }),
		);
		const runtime = runtimeStub();
		vi.mocked(runtime.reloadFromStorage)
			.mockRejectedValueOnce(new Error('runtime rejected restored state'))
			.mockResolvedValueOnce(undefined);

		await expect(engine(undefined, runtime).restoreFromCloud()).rejects.toThrow(
			/runtime rejected restored state/i,
		);
		expect(mocks.restore).toHaveBeenCalledTimes(2);
		expect(mocks.restore.mock.calls[0]?.[0]).toBe(restored);
		expect(mocks.restore.mock.calls[1]?.[0]).not.toBe(restored);
		expect(runtime.reloadFromStorage).toHaveBeenCalledTimes(2);
	});

	it('fails closed on a legacy unbound envelope without replacing storage', async () => {
		const legacy = snapshotResponse();
		legacy.envelope = {
			v: 1,
			alg: 'AES-GCM',
			epoch: 1,
			iv: 'a'.repeat(16),
			ct: 'b'.repeat(24),
			contentHash: 'c'.repeat(43),
		} as unknown as typeof legacy.envelope;
		mocks.decrypt.mockRejectedValueOnce(
			new Error('Legacy cloud ciphertext is not bound to an account and artifact context.'),
		);
		fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(legacy), { status: 200 }));

		await expect(engine().restoreFromCloud()).rejects.toThrow(/legacy cloud ciphertext/i);
		expect(mocks.restore).not.toHaveBeenCalled();
	});
});

describe('wire-size limits', () => {
	it('rejects an oversized encrypted snapshot before making a request', async () => {
		mocks.encrypt.mockResolvedValueOnce({
			v: 2,
			alg: 'AES-GCM',
			epoch: 1,
			iv: 'a'.repeat(16),
			ct: 'b'.repeat(4 * 1024 * 1024 + 1),
			contentHash: 'c'.repeat(43),
			ctx: 'd'.repeat(43),
		});

		await expect(engine().syncNow()).rejects.toThrow(/too large for a safe upload/i);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('splits encrypted operation records so every request stays under the request ceiling', async () => {
		const operations = Array.from({ length: 80 }, (_, revision) => ({
			id: `op-${revision}`,
			vaultId: 'primary',
			sourceId: 'device-1',
			actorId: 'actor-1',
			entityType: 'scene',
			entityId: `scene-${revision}`,
			opType: 'update',
			dependencies: [],
			issuedAt: '2026-01-01T00:00:00.000Z',
			schemaVersion: 1,
		}));
		mocks.encrypt.mockImplementation(async (context: unknown) => ({
			v: 2,
			alg: 'AES-GCM',
			epoch: 1,
			iv: 'a'.repeat(16),
			ct:
				typeof context === 'object' &&
				context !== null &&
				'kind' in context &&
				context.kind === 'operation'
					? 'b'.repeat(60_000)
					: 'b'.repeat(24),
			contentHash: 'c'.repeat(43),
			ctx: 'd'.repeat(43),
		}));
		fetchMock.mockImplementation(async () => new Response(null, { status: 200 }));

		await expect(engine(undefined, runtimeStub(operations)).syncNow()).resolves.toBeUndefined();

		const operationBodies = fetchMock.mock.calls
			.filter(([url]) => String(url).endsWith('/operations'))
			.map(([, init]) => String(init?.body));
		expect(operationBodies.length).toBeGreaterThan(1);
		for (const body of operationBodies) {
			expect(new TextEncoder().encode(body).byteLength).toBeLessThanOrEqual(4 * 1024 * 1024);
		}
	});

	it('rejects an operation over the server record limit before sending the operation batch', async () => {
		const operation = {
			id: 'oversized-op',
			vaultId: 'primary',
			sourceId: 'device-1',
			actorId: 'actor-1',
			entityType: 'scene',
			entityId: 'scene-1',
			opType: 'update',
			dependencies: [],
			issuedAt: '2026-01-01T00:00:00.000Z',
			schemaVersion: 1,
		};
		mocks.encrypt.mockImplementation(async (context: unknown) => ({
			v: 2,
			alg: 'AES-GCM',
			epoch: 1,
			iv: 'a'.repeat(16),
			ct:
				typeof context === 'object' &&
				context !== null &&
				'kind' in context &&
				context.kind === 'operation'
					? 'b'.repeat(90_000)
					: 'b'.repeat(24),
			contentHash: 'c'.repeat(43),
			ctx: 'd'.repeat(43),
		}));
		fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));

		await expect(engine(undefined, runtimeStub([operation])).syncNow()).rejects.toThrow(
			/one campaign change is too large/i,
		);
		expect(fetchMock).toHaveBeenCalledOnce();
		expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/\/snapshot$/);
	});

	it.each([
		['actor id', { actorId: 'actor with spaces' }],
		['timestamp', { issuedAt: 'not-a-timestamp' }],
	])('rejects an operation with a server-incompatible %s before upload', async (_label, patch) => {
		const operation = {
			id: 'invalid-op',
			vaultId: 'primary',
			sourceId: 'device-1',
			actorId: 'actor-1',
			entityType: 'scene',
			entityId: 'scene-1',
			opType: 'update',
			dependencies: [],
			issuedAt: '2026-01-01T00:00:00.000Z',
			schemaVersion: 1,
			...patch,
		};
		fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));

		await expect(engine(undefined, runtimeStub([operation])).syncNow()).rejects.toThrow(
			/actor or timestamp/i,
		);
		expect(fetchMock).toHaveBeenCalledOnce();
	});
});
