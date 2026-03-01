import { describe, expect, it } from 'vitest';
import { createNoteId, createFolderId, type Note } from '$lib/types/note.js';
import {
	analyzeLinkIssues,
	buildVaultUnresolvedLinkReport,
	disambiguateWikilinkTarget,
	findUnresolvedLinks,
	renameWikilinkTarget,
} from './unresolved-links.js';

function createNote(title: string, content = '', overrides: Partial<Note> = {}): Note {
	return {
		id: createNoteId(title.toLowerCase().replace(/\s+/g, '-')),
		title,
		content,
		folder: createFolderId('/'),
		tags: [],
		frontmatter: {},
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		deleted: false,
		deletedAt: null,
		pinned: false,
		pinnedAt: null,
		...overrides,
	};
}

describe('findUnresolvedLinks', () => {
	it('groups unresolved links and tracks usage count', () => {
		const result = findUnresolvedLinks('[[Alpha]] [[Alpha]] [[Gamma]]', [createNote('Gamma')]);
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({ title: 'Alpha', count: 2, targetKind: 'title' });
	});

	it('returns title and alias based suggestions', () => {
		const result = findUnresolvedLinks('[[Wat]]', [
			createNote('Waterdeep'),
			createNote('Port of Splendors', '', { frontmatter: { aliases: ['Waterside Docks'] } }),
		]);
		expect(result[0]?.suggestions.map((entry) => `${entry.title}:${entry.matchedBy}`)).toContain(
			'Waterdeep:title',
		);
		expect(result[0]?.suggestions.map((entry) => `${entry.title}:${entry.matchedBy}`)).toContain(
			'Port of Splendors:alias',
		);
	});
});

describe('analyzeLinkIssues', () => {
	it('reports ambiguous links and includes folder context candidates', () => {
		const notes = [
			createNote('Harbor', '', { folder: createFolderId('/city') }),
			createNote('Harbor', '', { id: createNoteId('harbor-2'), folder: createFolderId('/ports') }),
			createNote('Log', 'Visit [[Harbor]].'),
		];

		const report = analyzeLinkIssues(notes[2]!.content, notes);
		expect(report.unresolved).toHaveLength(0);
		expect(report.ambiguous).toHaveLength(1);
		expect(report.ambiguous[0]?.candidates).toHaveLength(2);
		expect(report.ambiguous[0]?.candidates.map((candidate) => candidate.folder)).toEqual([
			'/city',
			'/ports',
		]);
	});
});

describe('renameWikilinkTarget', () => {
	it('renames wikilink targets without touching display aliases', () => {
		const content = '[[Old|Shown]] and [[Old]]';
		const result = renameWikilinkTarget(content, 'Old', 'New');
		expect(result).toBe('[[New|Shown]] and [[New]]');
	});
});

describe('disambiguateWikilinkTarget', () => {
	it('converts title links to stable note id links while preserving display text', () => {
		const content = '[[Harbor|Dock Ward]] and [[Harbor]]';
		const result = disambiguateWikilinkTarget(content, 'Harbor', 'note-harbor', 'Harbor');
		expect(result).toBe('[[note:note-harbor|Dock Ward]] and [[note:note-harbor|Harbor]]');
	});
});

describe('buildVaultUnresolvedLinkReport', () => {
	it('includes source context snippets and unresolved target counts', () => {
		const notes = [
			createNote('Session Log', 'The party visited [[Missing Place]].'),
			createNote('Archive', 'Reference [[Missing Place]] for continuity.'),
		];

		const report = buildVaultUnresolvedLinkReport(notes);
		expect(report).toHaveLength(2);
		expect(report[0]).toMatchObject({
			targetLabel: 'Missing Place',
			targetKind: 'title',
		});
		expect(report[0]?.contexts[0]?.includes('Missing Place')).toBe(true);
	});
});
