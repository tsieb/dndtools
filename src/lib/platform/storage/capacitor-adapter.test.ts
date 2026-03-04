import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createNoteId, type Note } from '$lib/types/note.js';
import { createVaultObjectId, type VaultObject } from '$lib/types/object.js';
import { CapacitorStorageAdapter } from './capacitor-adapter.js';

const fileStore = new Map<string, string>();

vi.mock('@capacitor/filesystem', () => ({
	Directory: {
		Data: 'DATA',
	},
	Encoding: {
		UTF8: 'utf8',
	},
	Filesystem: {
		mkdir: vi.fn(async () => undefined),
		readFile: vi.fn(async ({ path }: { path: string }) => {
			if (!fileStore.has(path)) {
				throw new Error('File does not exist');
			}
			return { data: fileStore.get(path) ?? '' };
		}),
		writeFile: vi.fn(async ({ path, data }: { path: string; data: string }) => {
			fileStore.set(path, data);
			return undefined;
		}),
	},
}));

function note(seed: string, overrides: Partial<Note> = {}): Note {
	const timestamp = `2026-03-03T00:00:0${seed}Z`;
	return {
		id: createNoteId(`note-${seed}`),
		title: `Note ${seed}`,
		content: `# Note ${seed}`,
		folder: '/notes' as Note['folder'],
		tags: [],
		frontmatter: {},
		visibility: 'dm_only',
		createdAt: timestamp,
		updatedAt: timestamp,
		deleted: false,
		deletedAt: null,
		pinned: false,
		pinnedAt: null,
		...overrides,
	};
}

function npcObject(name: string): VaultObject {
	return {
		id: createVaultObjectId('obj-npc-1'),
		type: 'npc',
		name,
		summary: `${name} summary`,
		tags: ['npc'],
		visibility: 'dm_only',
		relationships: [],
		createdAt: '2026-03-03T00:00:00Z',
		updatedAt: '2026-03-03T00:00:00Z',
		data: {
			role: 'ally',
			goals: [],
			secrets: [],
		},
	};
}

describe('CapacitorStorageAdapter', () => {
	beforeEach(() => {
		fileStore.clear();
	});

	it('persists notes to filesystem-backed state', async () => {
		const adapter = new CapacitorStorageAdapter({ vaultRoot: 'tmp/test-vault-a' });
		await adapter.initialize();
		await adapter.saveNote(note('1'));

		const nextAdapter = new CapacitorStorageAdapter({ vaultRoot: 'tmp/test-vault-a' });
		await nextAdapter.initialize();
		const notes = await nextAdapter.getAllNotes();

		expect(notes).toHaveLength(1);
		expect(String(notes[0]?.id)).toBe('note-1');
	});

	it('computes related suggestions without MCP sidecar', async () => {
		const adapter = new CapacitorStorageAdapter({ vaultRoot: 'tmp/test-vault-b' });
		await adapter.initialize();
		const alpha = note('1', { tags: ['quest'] });
		const beta = note('2', { tags: ['quest'] });
		await adapter.saveNote(alpha);
		await adapter.saveNote(beta);
		await adapter.setLinksFrom(alpha.id, [
			{
				sourceId: alpha.id,
				targetId: beta.id,
				displayText: beta.title,
				position: 0,
			},
		]);

		const suggestions = await adapter.suggestRelatedNotes([alpha.id], 5);
		expect(suggestions.length).toBeGreaterThan(0);
		expect(String(suggestions[0]?.noteId)).toBe(String(beta.id));
	});

	it('tracks object history and supports revert', async () => {
		const adapter = new CapacitorStorageAdapter({ vaultRoot: 'tmp/test-vault-c' });
		await adapter.initialize();
		await adapter.saveObject(npcObject('Arannis'));
		await adapter.saveObject(npcObject('Arannis the Bold'));

		const history = await adapter.getObjectHistory(createVaultObjectId('obj-npc-1'));
		expect(history).toHaveLength(1);
		expect(history[0]?.reason).toBe('save');
		expect(history[0]?.object.name).toBe('Arannis');

		const reverted = await adapter.revertObjectToHistory(
			createVaultObjectId('obj-npc-1'),
			history[0]!.id,
		);
		expect(reverted?.name).toBe('Arannis');
	});

	it('restores deleted notes from safety snapshots', async () => {
		const adapter = new CapacitorStorageAdapter({ vaultRoot: 'tmp/test-vault-d' });
		await adapter.initialize();
		const seed = note('4');
		await adapter.saveNote(seed);
		const snapshot = await adapter.createSafetySnapshot('test');
		await adapter.deleteNote(seed.id);

		const restoreResult = await adapter.restoreDeletedFromSnapshot(snapshot.id);
		const restored = await adapter.getNote(seed.id);

		expect(restoreResult.restored).toBe(1);
		expect(restored?.deleted).toBe(false);
	});
});
