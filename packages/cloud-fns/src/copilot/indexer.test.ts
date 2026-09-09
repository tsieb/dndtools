import { beforeEach, describe, expect, it, vi } from 'vitest';
import { indexCopilotSnapshot, type CopilotIndexerPorts } from './indexer';

const gate = vi.hoisted(() => ({ approved: false }));
vi.mock('@dndtools/core', async (importOriginal) => {
	const core = await importOriginal<typeof import('@dndtools/core')>();
	return {
		...core,
		get DNDTOOLS_CLOUD_ENHANCED_SECURITY_DECISION_RECORD() {
			return { ...core.DNDTOOLS_CLOUD_ENHANCED_SECURITY_DECISION_RECORD, approved: gate.approved };
		},
	};
});
const scope = { accountId: 'account', vaultId: 'vault', actorId: 'dm' };
const snapshot = {
	revision: 'r1',
	chunks: [{ sourceId: 'note', chunkId: 'note:secret', text: 'A secret.' }],
};
function ports(): CopilotIndexerPorts {
	return {
		authorize: vi.fn().mockResolvedValue({ role: 'dm', registeredMode: 'cloud-enhanced' }),
		readSnapshotForActor: vi.fn().mockResolvedValue(snapshot),
		embed: vi.fn().mockResolvedValue([[1, 0]]),
		replaceIfCurrent: vi.fn().mockResolvedValue(true),
	};
}
beforeEach(() => {
	gate.approved = false;
});
describe('Copilot indexer security and replacement contract', () => {
	it('uses the shipped unapproved record and performs zero I/O', async () => {
		const core = await vi.importActual<typeof import('@dndtools/core')>('@dndtools/core');
		expect(core.DNDTOOLS_CLOUD_ENHANCED_SECURITY_DECISION_RECORD.approved).toBe(false);
		const p = ports();
		await expect(indexCopilotSnapshot(scope, p)).rejects.toThrow('security review');
		for (const fn of Object.values(p)) expect(fn).not.toHaveBeenCalled();
	});
	it.each([
		{ role: 'dm', registeredMode: undefined },
		{ role: 'dm', registeredMode: 'private-e2ee' },
		{ role: 'player', registeredMode: 'cloud-enhanced' },
		{ role: null, registeredMode: 'cloud-enhanced' },
	])('blocks content reads for unauthorized server registration %#', async (access) => {
		gate.approved = true;
		const p = ports();
		vi.mocked(p.authorize).mockResolvedValue(access as Awaited<ReturnType<typeof p.authorize>>);
		await expect(indexCopilotSnapshot(scope, p)).rejects.toThrow('access is unavailable');
		expect(p.readSnapshotForActor).not.toHaveBeenCalled();
		expect(p.embed).not.toHaveBeenCalled();
		expect(p.replaceIfCurrent).not.toHaveBeenCalled();
	});
	it('keeps account, vault, actor and revision on the atomic replacement', async () => {
		gate.approved = true;
		const p = ports();
		await expect(indexCopilotSnapshot(scope, p)).resolves.toEqual({
			revision: 'r1',
			chunkCount: 1,
		});
		expect(p.authorize).toHaveBeenCalledWith(scope);
		expect(p.readSnapshotForActor).toHaveBeenCalledWith(scope);
		expect(p.embed).toHaveBeenCalledWith(scope, ['A secret.']);
		expect(p.replaceIfCurrent).toHaveBeenCalledWith(scope, snapshot, [[1, 0]]);
	});
	it('clears deleted content without an embedding call', async () => {
		gate.approved = true;
		const p = ports();
		const empty = { revision: 'r2', chunks: [] };
		vi.mocked(p.readSnapshotForActor).mockResolvedValue(empty);
		await indexCopilotSnapshot(scope, p);
		expect(p.embed).not.toHaveBeenCalled();
		expect(p.replaceIfCurrent).toHaveBeenCalledWith(scope, empty, []);
	});
	it.each([[], [[NaN]], [[Infinity]], [[0, 0]], [[1], [1]], [[]]].map((vectors) => ({ vectors })))(
		'rejects bad vectors %#',
		async ({ vectors }) => {
			gate.approved = true;
			const p = ports();
			vi.mocked(p.embed).mockResolvedValue(vectors);
			await expect(indexCopilotSnapshot(scope, p)).rejects.toThrow('Invalid Copilot embeddings');
			expect(p.replaceIfCurrent).not.toHaveBeenCalled();
		},
	);
	it('batches at 32 and rejects dimension drift between batches', async () => {
		gate.approved = true;
		const p = ports();
		vi.mocked(p.readSnapshotForActor).mockResolvedValue({
			revision: 'r1',
			chunks: Array.from({ length: 33 }, (_, i) => ({
				...snapshot.chunks[0],
				chunkId: `chunk-${i}`,
			})),
		});
		vi.mocked(p.embed)
			.mockResolvedValueOnce(Array.from({ length: 32 }, () => [1, 0]))
			.mockResolvedValueOnce([[1]]);
		await expect(indexCopilotSnapshot(scope, p)).rejects.toThrow('Invalid Copilot embeddings');
		expect(vi.mocked(p.embed).mock.calls.map(([, texts]) => texts.length)).toEqual([32, 1]);
		expect(p.replaceIfCurrent).not.toHaveBeenCalled();
	});
	it('does not report a stale replacement as success', async () => {
		gate.approved = true;
		const p = ports();
		vi.mocked(p.replaceIfCurrent).mockResolvedValue(false);
		await expect(indexCopilotSnapshot(scope, p)).rejects.toThrow('index changed');
	});
	it.each([
		{ role: 'dm', registeredMode: 'private-e2ee' },
		{ role: 'dm', registeredMode: undefined },
		{ role: 'player', registeredMode: 'cloud-enhanced' },
		{ role: null, registeredMode: 'cloud-enhanced' },
	] as const)(
		'stops disclosure when access changes during the snapshot read %#',
		async (access) => {
			gate.approved = true;
			const p = ports();
			vi.mocked(p.readSnapshotForActor).mockImplementation(async () => {
				vi.mocked(p.authorize).mockResolvedValue(access);
				return snapshot;
			});
			await expect(indexCopilotSnapshot(scope, p)).rejects.toThrow('access is unavailable');
			expect(p.embed).not.toHaveBeenCalled();
			expect(p.replaceIfCurrent).not.toHaveBeenCalled();
		},
	);
	it.each([1, 33])('stops after revocation during embedding of %i chunks', async (count) => {
		gate.approved = true;
		const p = ports();
		vi.mocked(p.readSnapshotForActor).mockResolvedValue({
			revision: 'r1',
			chunks: Array.from({ length: count }, (_, i) => ({
				...snapshot.chunks[0],
				chunkId: `chunk-${i}`,
			})),
		});
		vi.mocked(p.embed).mockImplementation(async (_scope, texts) => {
			vi.mocked(p.authorize).mockResolvedValue({ role: 'dm', registeredMode: 'private-e2ee' });
			return texts.map(() => [1, 0]);
		});
		await expect(indexCopilotSnapshot(scope, p)).rejects.toThrow('access is unavailable');
		expect(p.embed).toHaveBeenCalledTimes(1);
		expect(p.replaceIfCurrent).not.toHaveBeenCalled();
	});
	it('rechecks access before replacing an empty snapshot', async () => {
		gate.approved = true;
		const p = ports();
		vi.mocked(p.readSnapshotForActor).mockImplementation(async () => {
			vi.mocked(p.authorize).mockResolvedValue({ role: null, registeredMode: undefined });
			return { revision: 'r2', chunks: [] };
		});
		await expect(indexCopilotSnapshot(scope, p)).rejects.toThrow('access is unavailable');
		expect(p.embed).not.toHaveBeenCalled();
		expect(p.replaceIfCurrent).not.toHaveBeenCalled();
	});
	it('fails closed if refreshing server authorization fails', async () => {
		gate.approved = true;
		const p = ports();
		vi.mocked(p.readSnapshotForActor).mockImplementation(async () => {
			vi.mocked(p.authorize).mockRejectedValue(new Error('Authorization unavailable.'));
			return snapshot;
		});
		await expect(indexCopilotSnapshot(scope, p)).rejects.toThrow('Authorization unavailable');
		expect(p.embed).not.toHaveBeenCalled();
		expect(p.replaceIfCurrent).not.toHaveBeenCalled();
	});
	it('rechecks the release gate after an in-flight authorization lookup', async () => {
		gate.approved = true;
		const p = ports();
		vi.mocked(p.authorize).mockImplementation(async () => {
			gate.approved = false;
			return { role: 'dm', registeredMode: 'cloud-enhanced' };
		});
		await expect(indexCopilotSnapshot(scope, p)).rejects.toThrow('security review');
		expect(p.readSnapshotForActor).not.toHaveBeenCalled();
		expect(p.embed).not.toHaveBeenCalled();
		expect(p.replaceIfCurrent).not.toHaveBeenCalled();
	});
	it('performs no further I/O when the release gate closes during a snapshot read', async () => {
		gate.approved = true;
		const p = ports();
		vi.mocked(p.readSnapshotForActor).mockImplementation(async () => {
			gate.approved = false;
			vi.mocked(p.authorize).mockClear();
			return snapshot;
		});
		await expect(indexCopilotSnapshot(scope, p)).rejects.toThrow('security review');
		expect(p.authorize).not.toHaveBeenCalled();
		expect(p.embed).not.toHaveBeenCalled();
		expect(p.replaceIfCurrent).not.toHaveBeenCalled();
	});
	it('binds every adapter call to the original scope across asynchronous work', async () => {
		gate.approved = true;
		const p = ports();
		const input = { ...scope };
		vi.mocked(p.authorize).mockImplementation(async () => {
			Object.assign(input, {
				accountId: 'other-account',
				vaultId: 'other-vault',
				actorId: 'player',
			});
			return { role: 'dm', registeredMode: 'cloud-enhanced' };
		});
		await expect(indexCopilotSnapshot(input, p)).resolves.toEqual({
			revision: 'r1',
			chunkCount: 1,
		});
		for (const [authorizedScope] of vi.mocked(p.authorize).mock.calls) {
			expect(authorizedScope).toEqual(scope);
			expect(Object.isFrozen(authorizedScope)).toBe(true);
		}
		expect(p.readSnapshotForActor).toHaveBeenCalledWith(scope);
		expect(p.embed).toHaveBeenCalledWith(scope, ['A secret.']);
		expect(p.replaceIfCurrent).toHaveBeenCalledWith(scope, snapshot, [[1, 0]]);
	});
	it('does not report success if the atomic writer rejects a concurrent revocation', async () => {
		gate.approved = true;
		const p = ports();
		vi.mocked(p.replaceIfCurrent).mockRejectedValue(new Error('Copilot access is unavailable.'));
		await expect(indexCopilotSnapshot(scope, p)).rejects.toThrow('access is unavailable');
	});
});
