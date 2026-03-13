import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	buildNotesExportPayload,
	buildObsidianImportPreview,
	bundleToMarkdownFiles,
	exportAllNotes,
	exportNote,
	folderFromRelativePath,
	noteToMarkdown,
	parseMarkdownFile,
	parseJsonBundle,
} from './export.js';
import { createNoteId, createFolderId, type Note } from '$lib/types/note.js';
import { notesState } from '$lib/state/notes.svelte.js';

function createNote(overrides: Partial<Note> = {}): Note {
	const now = new Date().toISOString();
	return {
		id: createNoteId('test-id'),
		title: 'Test Note',
		content: '# Hello\n\nWorld',
		folder: createFolderId('/'),
		tags: [],
		frontmatter: {},
		visibility: overrides.visibility ?? 'dm_only',
		createdAt: now,
		updatedAt: now,
		deleted: false,
		deletedAt: null,
		pinned: false,
		pinnedAt: null,
		...overrides,
	};
}

describe('noteToMarkdown', () => {
	it('generates YAML frontmatter with title', () => {
		const note = createNote({ title: 'Elminster' });
		const md = noteToMarkdown(note);
		expect(md).toContain('---');
		expect(md).toContain('title: "Elminster"');
	});

	it('includes tags in frontmatter', () => {
		const note = createNote({ tags: ['npc', 'waterdeep'] });
		const md = noteToMarkdown(note);
		expect(md).toContain('tags: [npc, waterdeep]');
	});

	it('includes folder when not root', () => {
		const note = createNote({ folder: createFolderId('/campaign/npcs') });
		const md = noteToMarkdown(note);
		expect(md).toContain('folder: "/campaign/npcs"');
	});

	it('omits folder when root', () => {
		const note = createNote({ folder: createFolderId('/') });
		const md = noteToMarkdown(note);
		expect(md).not.toContain('folder:');
	});

	it('includes note content after frontmatter', () => {
		const note = createNote({ content: '# My Heading\n\nParagraph text.' });
		const md = noteToMarkdown(note);
		expect(md).toContain('# My Heading\n\nParagraph text.');
		// Content comes after the closing ---
		const parts = md.split('---');
		expect(parts.length).toBe(3); // before ---, frontmatter, after ---
	});

	it('escapes double quotes in title', () => {
		const note = createNote({ title: 'The "Dragon" Inn' });
		const md = noteToMarkdown(note);
		expect(md).toContain('title: "The \\"Dragon\\" Inn"');
	});

	it('includes created and modified timestamps', () => {
		const note = createNote();
		const md = noteToMarkdown(note);
		expect(md).toContain('created:');
		expect(md).toContain('modified:');
	});
});

describe('parseMarkdownFile', () => {
	it('extracts title from frontmatter', () => {
		const content = '---\ntitle: "Barthen"\n---\n\n# Content';
		const result = parseMarkdownFile(content, 'test.md');
		expect(result.title).toBe('Barthen');
	});

	it('extracts tags from frontmatter', () => {
		const content = '---\ntags: [npc, merchant]\n---\n\nContent';
		const result = parseMarkdownFile(content, 'test.md');
		expect(result.tags).toEqual(['npc', 'merchant']);
	});

	it('uses filename as fallback title', () => {
		const result = parseMarkdownFile('Just content', 'my-cool-note.md');
		expect(result.title).toBe('my cool note');
	});

	it('extracts body content after frontmatter', () => {
		const content = '---\ntitle: Test\n---\n\n# Hello World';
		const result = parseMarkdownFile(content, 'test.md');
		expect(result.content).toBe('# Hello World');
	});

	it('handles content without frontmatter', () => {
		const content = '# Just a Heading\n\nSome text.';
		const result = parseMarkdownFile(content, 'test.md');
		expect(result.content).toBe(content);
	});
});

describe('parseJsonBundle', () => {
	it('parses a valid bundle', () => {
		const bundle = JSON.stringify({
			version: 1,
			notes: [
				{ title: 'Note 1', content: '# One', tags: ['npc'], folder: '/' },
				{ title: 'Note 2', content: '# Two', tags: [], folder: '/quests' },
			],
		});
		const result = parseJsonBundle(bundle);
		expect(result).toHaveLength(2);
		expect(result[0]?.title).toBe('Note 1');
		expect(result[1]?.folder).toBe('/quests');
	});

	it('throws on invalid format', () => {
		expect(() => parseJsonBundle(JSON.stringify({ invalid: true }))).toThrow(
			'Invalid export file format',
		);
	});

	it('defaults tags to empty array when missing', () => {
		const bundle = JSON.stringify({
			notes: [{ title: 'No Tags', content: 'Content', folder: '/' }],
		});
		const result = parseJsonBundle(bundle);
		expect(result[0]?.tags).toEqual([]);
	});
});

describe('buildNotesExportPayload', () => {
	it('returns null for empty exports', async () => {
		await expect(buildNotesExportPayload([])).resolves.toBeNull();
	});

	it('returns a portable markdown zip with validation report for multi-note exports', async () => {
		const payload = await buildNotesExportPayload([
			createNote({
				id: createNoteId('alpha'),
				title: 'Alpha Note',
				content: 'Link to [[Missing Note]]',
				folder: createFolderId('/campaign'),
			}),
			createNote({
				id: createNoteId('beta'),
				title: 'Beta Note',
				content: '# Beta',
				folder: createFolderId('/campaign'),
			}),
		]);

		expect(payload).not.toBeNull();
		expect(payload?.mimeType).toBe('application/zip');
		expect(payload?.filename).toBe('dndtools-markdown-export.zip');
		expect(payload?.profile).toBe('portable_markdown_zip');
		expect(payload?.validation?.unresolvedLinks).toBe(1);
		expect(payload?.content).toBeInstanceOf(Uint8Array);
		expect((payload?.content as Uint8Array).byteLength).toBeGreaterThan(0);
	});

	it('returns a markdown file for single-note exports', async () => {
		const payload = await buildNotesExportPayload([createNote({ title: 'Solo Export' })]);
		expect(payload?.mimeType).toBe('text/markdown');
		expect(payload?.filename).toBe('solo-export.md');
		expect(payload?.profile).toBe('single_markdown');
	});
});

describe('browser exports', () => {
	const originalCreateObjectURL = URL.createObjectURL;
	const originalRevokeObjectURL = URL.revokeObjectURL;

	beforeEach(() => {
		URL.createObjectURL = vi.fn(() => 'blob:test') as typeof URL.createObjectURL;
		URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;
	});

	it('exports a single note as markdown', () => {
		const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

		exportNote(createNote({ title: 'Solo Note' }));

		expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
		expect(click).toHaveBeenCalledTimes(1);
		expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
		click.mockRestore();
	});

	it('exports all active notes as an archive when multiple notes exist', async () => {
		const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
		notesState.notes = [
			createNote({ id: createNoteId('one'), title: 'First Note' }),
			createNote({ id: createNoteId('two'), title: 'Second Note', content: '[[Missing]]' }),
		];

		await exportAllNotes();

		expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
		expect(click).toHaveBeenCalledTimes(1);
		expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
		click.mockRestore();
	});

	it('skips browser download when there are no active notes', async () => {
		notesState.notes = [];

		await exportAllNotes();

		expect(URL.createObjectURL).not.toHaveBeenCalled();
	});

	afterEach(() => {
		notesState.notes = [];
		URL.createObjectURL = originalCreateObjectURL;
		URL.revokeObjectURL = originalRevokeObjectURL;
	});
});

describe('folderFromRelativePath', () => {
	it('extracts nested folder paths from webkitRelativePath', () => {
		expect(folderFromRelativePath('my-vault/campaign/npcs/elminster.md')).toBe('/campaign/npcs');
	});

	it('returns root for files at vault root', () => {
		expect(folderFromRelativePath('my-vault/session-log.md')).toBe('/');
	});
});

describe('bundleToMarkdownFiles', () => {
	it('converts bundle notes into markdown files with folder paths', () => {
		const bundle = JSON.stringify({
			notes: [
				{
					title: 'Town Square',
					content: '# Center',
					tags: ['location'],
					folder: '/places',
				},
			],
		});
		const files = bundleToMarkdownFiles(bundle);

		expect(files).toHaveLength(1);
		expect(files[0]?.relativePath).toBe('places/town-square.md');
		expect(files[0]?.content).toContain('title: Town Square');
		expect(files[0]?.content).toContain('# Center');
	});

	it('generates unique filenames for duplicate titles in the same folder', () => {
		const bundle = JSON.stringify({
			notes: [
				{ title: 'Duplicate', content: 'One', tags: [], folder: '/' },
				{ title: 'Duplicate', content: 'Two', tags: [], folder: '/' },
			],
		});
		const files = bundleToMarkdownFiles(bundle);

		expect(files.map((file) => file.relativePath)).toEqual(['duplicate.md', 'duplicate-2.md']);
	});

	it('throws on invalid bundle format', () => {
		expect(() => bundleToMarkdownFiles(JSON.stringify({ bad: true }))).toThrow(
			'Invalid export file format',
		);
	});
});

describe('buildObsidianImportPreview', () => {
	it('builds import candidates from markdown files and ignores non-markdown', () => {
		const preview = buildObsidianImportPreview(
			[
				{
					relativePath: 'my-vault/notes/alpha.md',
					content: '# Alpha',
				},
				{
					relativePath: 'my-vault/assets/map.png',
					content: 'binary',
				},
			],
			[],
		);

		expect(preview.markdownCount).toBe(1);
		expect(preview.candidates).toHaveLength(1);
		expect(preview.candidates[0]?.title).toBe('alpha');
		expect(preview.candidates[0]?.folder).toBe('/notes');
		expect(preview.skippedPaths).toEqual(['my-vault/assets/map.png']);
	});

	it('flags potential duplicate titles against existing notes', () => {
		const preview = buildObsidianImportPreview(
			[
				{
					relativePath: 'vault/session-log.md',
					content: '# Session Log',
				},
			],
			['session log'],
		);

		expect(preview.duplicateTitles).toEqual(['session log']);
	});
});
