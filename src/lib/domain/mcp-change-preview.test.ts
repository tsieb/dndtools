import { describe, expect, it } from 'vitest';
import { buildMcpChangePreview } from './mcp-change-preview.js';
import { createFolderId, createNoteId, type Note } from '$lib/types/note.js';
import type { McpChangeRecord } from '$lib/types/mcp.js';

function makeNote(overrides: Partial<Note> = {}): Note {
	return {
		id: createNoteId('note-a'),
		title: 'Before',
		content: 'Old content with [[Town]].',
		folder: createFolderId('/'),
		tags: ['session'],
		frontmatter: {},
		createdAt: '2026-02-01T00:00:00.000Z',
		updatedAt: '2026-02-01T00:00:00.000Z',
		deleted: false,
		deletedAt: null,
		pinned: false,
		pinnedAt: null,
		...overrides,
	};
}

function makeChange(before: Note | null, after: Note | null): McpChangeRecord {
	return {
		id: 'change-1',
		createdAt: '2026-02-01T00:00:00.000Z',
		resolvedAt: null,
		source: 'mcp',
		type: 'update',
		status: 'pending',
		noteId: 'note-a',
		title: after?.title ?? before?.title ?? 'Unknown',
		summary: 'Update note',
		before: before ? { note: before } : null,
		after: after ? { note: after } : null,
	};
}

describe('buildMcpChangePreview', () => {
	it('captures semantic rename and link-impact metadata', () => {
		const before = makeNote();
		const after = makeNote({
			title: 'After',
			content: 'New content with [[Dungeon]].',
			updatedAt: '2026-02-02T00:00:00.000Z',
		});
		const preview = buildMcpChangePreview(makeChange(before, after));

		expect(preview.semantic.titleChanged).toBe(true);
		expect(preview.semantic.structural).toBe(true);
		expect(preview.linkImpact.added).toBe(1);
		expect(preview.linkImpact.removed).toBe(1);
		expect(preview.summary).toContain('Semantic: rename');
		expect(preview.summary).toContain('Links: +1 -1');
	});

	it('classifies pure content edits as non-structural', () => {
		const before = makeNote();
		const after = makeNote({
			content: 'Old content with [[Town]].\nAdded line.',
			updatedAt: '2026-02-02T00:00:00.000Z',
		});
		const preview = buildMcpChangePreview(makeChange(before, after));

		expect(preview.semantic.structural).toBe(false);
		expect(preview.semantic.titleChanged).toBe(false);
		expect(preview.summary).toContain('Semantic: content update');
	});
});
