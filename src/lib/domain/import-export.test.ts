import { describe, expect, it } from 'vitest';
import {
	buildMarkdownExportEntries,
	buildObsidianImportPreview,
	normalizeObsidianWikilinks,
	restoreNotesFromMarkdownFiles,
	validateUnresolvedLinks,
} from './import-export.js';
import { createFolderId, createNoteId, type Note } from '$lib/types/note.js';

function makeNote(overrides: Partial<Note> = {}): Note {
	const now = '2026-03-01T00:00:00.000Z';
	return {
		id: createNoteId('note-1'),
		title: 'Sample Note',
		content: 'Base content',
		folder: createFolderId('/'),
		tags: [],
		frontmatter: {},
		createdAt: now,
		updatedAt: now,
		deleted: false,
		deletedAt: null,
		pinned: false,
		pinnedAt: null,
		...overrides,
	};
}

describe('normalizeObsidianWikilinks', () => {
	it('maps .md wikilinks and image embeds', () => {
		const normalized = normalizeObsidianWikilinks(
			'See [[Session-1.md]] and ![[maps/city.png]] plus [[Quest#Hook]]',
		);
		expect(normalized.content).toContain('[[Session-1]]');
		expect(normalized.content).toContain('![city](assets/city.png)');
		expect(normalized.manualResolutionHints).toContain('Quest#Hook');
		expect(normalized.mappedEmbeds).toBe(1);
	});
});

describe('buildObsidianImportPreview', () => {
	it('preserves custom frontmatter keys and reports duplicate titles', () => {
		const preview = buildObsidianImportPreview(
			[
				{
					relativePath: 'vault/notes/session-1.md',
					content: '---\ntitle: "Session One"\nstatus: draft\ntags: [Log]\n---\n\nBody',
				},
				{
					relativePath: 'vault/notes/session-one.md',
					content: '# Session One',
				},
			],
			['Session One'],
		);
		expect(preview.markdownCount).toBe(2);
		expect(preview.duplicateTitles).toContain('Session One');
		expect(preview.candidates[0]?.frontmatter).toMatchObject({ status: 'draft' });
	});
});

describe('buildMarkdownExportEntries', () => {
	it('produces deterministic file paths with stable IDs', () => {
		const entries = buildMarkdownExportEntries(
			[
				makeNote({
					id: createNoteId('note-b'),
					title: 'Beta',
					folder: createFolderId('/campaign'),
					frontmatter: { zeta: 1, alpha: 2 },
				}),
				makeNote({
					id: createNoteId('note-a'),
					title: 'Alpha',
					folder: createFolderId('/campaign'),
				}),
			],
			{ deterministic: true },
		);

		expect(entries[0]?.relativePath).toBe('notes/campaign/alpha--note-a.md');
		expect(entries[1]?.relativePath).toBe('notes/campaign/beta--note-b.md');
		expect(entries[1]?.content).toContain('id: note-b');
		expect(entries[1]?.content).toContain('alpha: 2');
		expect(entries[1]?.content).toContain('zeta: 1');
	});
});

describe('restoreNotesFromMarkdownFiles', () => {
	it('reconstructs note metadata from exported markdown files', () => {
		const entries = buildMarkdownExportEntries(
			[
				makeNote({
					id: createNoteId('note-restore'),
					title: 'Restore Me',
					folder: createFolderId('/world'),
					tags: ['npc'],
				}),
			],
			{ deterministic: false },
		);
		const restored = restoreNotesFromMarkdownFiles(
			entries.map((entry) => ({
				relativePath: entry.relativePath,
				content: entry.content,
			})),
		);
		expect(restored).toHaveLength(1);
		expect(restored[0]?.title).toBe('Restore Me');
		expect(String(restored[0]?.folder)).toBe('/world');
	});
});

describe('validateUnresolvedLinks', () => {
	it('flags unresolved wikilinks and ignores resolved ones', () => {
		const notes = [
			makeNote({
				id: createNoteId('a'),
				title: 'A',
				content: '[[B]] [[Missing Link]]',
			}),
			makeNote({
				id: createNoteId('b'),
				title: 'B',
				content: 'Body',
			}),
		];
		const issues = validateUnresolvedLinks(notes);
		expect(issues.some((issue) => issue.target === 'Missing Link')).toBe(true);
		expect(issues.some((issue) => issue.target === 'B')).toBe(false);
	});
});
