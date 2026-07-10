import { describe, expect, it } from 'vitest';
import {
	ensureFolderPermission,
	importFromFolder,
	isSafeRelativePath,
	planNotesPush,
	serializeNoteForPush,
	writeBack,
	type FsDirHandleLike,
	type FsFileHandleLike,
	type PushPlanNote,
} from './fsSource';

// --- mock File System Access handles (the structural types the module is written against) --------

interface MockFile extends FsFileHandleLike {
	written: string[];
}

function fileHandle(name: string, text = ''): MockFile {
	const written: string[] = [];
	return {
		kind: 'file',
		name,
		written,
		getFile: async () => ({ text: async () => text }),
		createWritable: async () => ({
			write: async (data: string) => {
				written.push(data);
			},
			close: async () => {},
		}),
	};
}

interface MockDir extends FsDirHandleLike {
	children: Map<string, MockDir | MockFile>;
}

function dirHandle(name: string, entries: Array<MockDir | MockFile> = []): MockDir {
	const children = new Map<string, MockDir | MockFile>(entries.map((e) => [e.name, e]));
	return {
		kind: 'directory',
		name,
		children,
		async *values() {
			yield* children.values();
		},
		getDirectoryHandle: async (dirName: string, options?: { create?: boolean }) => {
			const existing = children.get(dirName);
			if (existing?.kind === 'directory') return existing;
			if (!options?.create) throw new Error(`no directory ${dirName}`);
			const created = dirHandle(dirName);
			children.set(dirName, created);
			return created;
		},
		getFileHandle: async (fileName: string, options?: { create?: boolean }) => {
			const existing = children.get(fileName);
			if (existing?.kind === 'file') return existing;
			if (!options?.create) throw new Error(`no file ${fileName}`);
			const created = fileHandle(fileName);
			children.set(fileName, created);
			return created;
		},
	};
}

// --- folder walk -----------------------------------------------------------------------------------

describe('importFromFolder', () => {
	it('walks nested markdown files into name-sorted {path, text} entries', async () => {
		const root = dirHandle('vault', [
			fileHandle('zeta.md', 'Z'),
			fileHandle('alpha.md', 'A'),
			dirHandle('lore', [fileHandle('pier.markdown', 'P'), fileHandle('image.png', 'binary')]),
		]);
		const result = await importFromFolder(root);
		expect(result.truncated).toBe(false);
		expect(result.files).toEqual([
			{ path: 'alpha.md', text: 'A' },
			{ path: 'lore/pier.markdown', text: 'P' },
			{ path: 'zeta.md', text: 'Z' },
		]);
	});

	it('skips hidden files and hidden directories entirely', async () => {
		const root = dirHandle('vault', [
			fileHandle('.hidden.md', 'nope'),
			dirHandle('.obsidian', [fileHandle('config.md', 'nope')]),
			fileHandle('kept.md', 'yes'),
		]);
		const result = await importFromFolder(root);
		expect(result.files).toEqual([{ path: 'kept.md', text: 'yes' }]);
	});

	it('caps the file count and reports the walk as truncated', async () => {
		const root = dirHandle('vault', [fileHandle('a.md', '1'), fileHandle('b.md', '2'), fileHandle('c.md', '3')]);
		const result = await importFromFolder(root, { maxFiles: 2 });
		expect(result.fileCount).toBe(2);
		expect(result.truncated).toBe(true);
	});

	it('stops descending past the depth cap', async () => {
		const deep = dirHandle('d1', [dirHandle('d2', [fileHandle('deep.md', 'x')])]);
		const root = dirHandle('vault', [deep, fileHandle('top.md', 't')]);
		const result = await importFromFolder(root, { maxDepth: 2 });
		expect(result.files.map((f) => f.path)).toEqual(['d1/d2/deep.md', 'top.md']);
		const shallow = await importFromFolder(root, { maxDepth: 1 });
		expect(shallow.files.map((f) => f.path)).toEqual(['top.md']);
	});
});

// --- write-back --------------------------------------------------------------------------------------

describe('isSafeRelativePath', () => {
	it('accepts plain nested relative paths', () => {
		expect(isSafeRelativePath('note.md')).toBe(true);
		expect(isSafeRelativePath('lore/deep/note.md')).toBe(true);
	});

	it('rejects escapes, absolute paths, hidden segments, and separators tricks', () => {
		expect(isSafeRelativePath('')).toBe(false);
		expect(isSafeRelativePath('/etc/passwd')).toBe(false);
		expect(isSafeRelativePath('../outside.md')).toBe(false);
		expect(isSafeRelativePath('lore/../../outside.md')).toBe(false);
		expect(isSafeRelativePath('lore\\note.md')).toBe(false);
		expect(isSafeRelativePath('.obsidian/config.md')).toBe(false);
		expect(isSafeRelativePath('lore//note.md')).toBe(false);
		expect(isSafeRelativePath('./note.md')).toBe(false);
	});
});

describe('writeBack', () => {
	it('creates intermediate directories and writes the markdown', async () => {
		const root = dirHandle('vault');
		await writeBack(root, 'lore/deep/pier.md', '# Pier\n');
		const lore = root.children.get('lore') as MockDir;
		const deep = lore.children.get('deep') as MockDir;
		const file = deep.children.get('pier.md') as MockFile;
		expect(file.written).toEqual(['# Pier\n']);
	});

	it('overwrites an existing file in place', async () => {
		const existing = fileHandle('note.md', 'old');
		const root = dirHandle('vault', [existing]);
		await writeBack(root, 'note.md', 'new');
		expect(existing.written).toEqual(['new']);
	});

	it('refuses unsafe paths before touching any handle', async () => {
		const root = dirHandle('vault');
		await expect(writeBack(root, '../escape.md', 'x')).rejects.toThrow(/unsafe path/);
		expect(root.children.size).toBe(0);
	});
});

// --- permission re-checks ------------------------------------------------------------------------------

describe('ensureFolderPermission', () => {
	const base = dirHandle('vault');

	it('passes silently when queryPermission already reports granted', async () => {
		const handle: FsDirHandleLike = { ...base, queryPermission: async () => 'granted' };
		expect(await ensureFolderPermission(handle, 'read')).toBe(true);
	});

	it('fails closed on an explicit denial without prompting', async () => {
		let prompted = false;
		const handle: FsDirHandleLike = {
			...base,
			queryPermission: async () => 'denied',
			requestPermission: async () => {
				prompted = true;
				return 'granted';
			},
		};
		expect(await ensureFolderPermission(handle, 'readwrite')).toBe(false);
		expect(prompted).toBe(false);
	});

	it('re-requests honestly when the grant lapsed to prompt', async () => {
		const handle: FsDirHandleLike = {
			...base,
			queryPermission: async () => 'prompt',
			requestPermission: async () => 'granted',
		};
		expect(await ensureFolderPermission(handle, 'readwrite')).toBe(true);
	});

	it('fails closed when no permission surface exists or the check throws', async () => {
		expect(await ensureFolderPermission(base, 'read')).toBe(false);
		const throwing: FsDirHandleLike = {
			...base,
			queryPermission: async () => {
				throw new Error('boom');
			},
		};
		expect(await ensureFolderPermission(throwing, 'read')).toBe(false);
	});
});

// --- push plan (CONTENT-012 pre-write checks) ----------------------------------------------------------

function note(overrides: Partial<PushPlanNote> = {}): PushPlanNote {
	return {
		id: 'note-1',
		title: 'The Pier',
		body: 'Brackish water.',
		fields: {},
		visibility: 'dm-only',
		...overrides,
	};
}

describe('serializeNoteForPush', () => {
	it('emits title, user fields, aliases/tags lists, and the NAMESPACED visibility', () => {
		const text = serializeNoteForPush(
			note({
				fields: { region: 'coast', aliases: ['Old Pier'], tags: ['location'], secretObj: { nested: true } },
			}),
		);
		expect(text).toContain('title: The Pier');
		expect(text).toContain('region: coast');
		expect(text).toContain('aliases: [Old Pier]');
		expect(text).toContain('tags: [location]');
		expect(text).toContain('dndtools.visibility: dm-only');
		expect(text).not.toContain('secretObj'); // non-portable field values are dropped
		expect(text).toContain('Brackish water.');
	});
});

describe('planNotesPush', () => {
	it('needs no acknowledgment for a faithful local-markdown push', () => {
		const plan = planNotesPush([note()], 'local-markdown');
		expect(plan.entries).toHaveLength(1);
		expect(plan.requiresAcknowledgment).toBe(false);
		expect(plan.entries[0].check.acknowledgmentToken).toBeNull();
		expect(plan.entries[0].path).toBe('the-pier.md');
	});

	it('flags wikilinks as lossy for local-markdown and carries the acknowledgment token', () => {
		const plan = planNotesPush([note({ body: 'See [[The Harbor]].' })], 'local-markdown');
		expect(plan.requiresAcknowledgment).toBe(true);
		expect(plan.lossyFeatures).toContain('wikilinks');
		expect(plan.entries[0].check.acknowledgmentToken).toMatch(/^local-markdown::/);
	});

	it('always requires acknowledgment for google-docs (namespaced metadata is dropped)', () => {
		const plan = planNotesPush([note()], 'google-docs');
		expect(plan.requiresAcknowledgment).toBe(true);
		expect(plan.droppedFeatures).toContain('dndtools-namespaced-metadata');
	});

	it('dedupes colliding slugs and falls back to the item id for unsluggable titles', () => {
		const plan = planNotesPush(
			[
				note({ id: 'a', title: 'Pier' }),
				note({ id: 'b', title: 'Pier!' }),
				note({ id: 'c', title: '★★★' }),
			],
			'local-markdown',
		);
		expect(plan.entries.map((e) => e.path)).toEqual(['pier.md', 'pier-2.md', 'c.md']);
	});

	it('unions the loss summary across entries but keeps per-entry tokens', () => {
		const plan = planNotesPush(
			[note({ id: 'a', body: 'plain' }), note({ id: 'b', body: '[[Linked]]' })],
			'local-markdown',
		);
		expect(plan.lossyEntries).toHaveLength(1);
		expect(plan.entries[0].check.acknowledgmentToken).toBeNull();
		expect(plan.entries[1].check.acknowledgmentToken).not.toBeNull();
	});
});
