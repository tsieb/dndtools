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
		expect(p.embed).toHaveBeenCalledWith(['A secret.']);
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
		expect(vi.mocked(p.embed).mock.calls.map(([texts]) => texts.length)).toEqual([32, 1]);
		expect(p.replaceIfCurrent).not.toHaveBeenCalled();
	});
	it('does not report a stale replacement as success', async () => {
		gate.approved = true;
		const p = ports();
		vi.mocked(p.replaceIfCurrent).mockResolvedValue(false);
		await expect(indexCopilotSnapshot(scope, p)).rejects.toThrow('index changed');
	});
});
