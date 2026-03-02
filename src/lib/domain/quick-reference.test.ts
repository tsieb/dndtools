import { describe, expect, it } from 'vitest';
import { createFolderId, createNoteId, type Note } from '$lib/types/note.js';
import {
	buildQuickReferenceEntityRecords,
	searchQuickReferenceEntities,
} from '$lib/domain/quick-reference.js';

function makeNote(overrides: Partial<Note> = {}): Note {
	return {
		id: createNoteId('note-default'),
		title: 'Default Note',
		content: 'Line one\nLine two\nLine three\nLine four',
		folder: createFolderId('/campaign'),
		filePath: undefined,
		tags: [],
		frontmatter: {},
		createdAt: '2026-03-02T00:00:00.000Z',
		updatedAt: '2026-03-02T00:00:00.000Z',
		deleted: false,
		deletedAt: null,
		pinned: false,
		pinnedAt: null,
		...overrides,
	};
}

describe('quick-reference entity indexing', () => {
	it('builds object-backed records with key stats and preview lines', () => {
		const npc = makeNote({
			id: createNoteId('npc-1'),
			title: 'Sildar Hallwinter',
			content: '# Sildar\nVeteran emissary\nTrusted ally\nKnows Neverwinter',
			tags: ['npc', 'session'],
			frontmatter: {
				dndtools: {
					object: {
						kind: 'npc',
						summary: 'Veteran ally',
						data: {
							role: 'Guide',
							armorClass: 16,
							hitPoints: 27,
							goals: [],
							secrets: [],
						},
					},
				},
			},
		});
		const records = buildQuickReferenceEntityRecords([npc]);
		expect(records).toHaveLength(1);
		expect(records[0]?.type).toBe('npc');
		expect(records[0]?.typeLabel).toBe('NPC');
		expect(records[0]?.keyStats).toEqual(expect.arrayContaining(['Role Guide', 'AC 16', 'HP 27']));
		expect(records[0]?.previewLines).toEqual(['Sildar', 'Veteran emissary', 'Trusted ally']);
	});

	it('uses rule type for non-object notes and supports type search', () => {
		const rule = makeNote({
			id: createNoteId('rule-1'),
			title: 'Sneak Attack Rule',
			tags: ['rule'],
			frontmatter: { type: 'rule' },
		});
		const records = buildQuickReferenceEntityRecords([rule]);
		expect(records[0]?.type).toBe('rule');
		expect(records[0]?.typeLabel).toBe('rule');
		const hits = searchQuickReferenceEntities(records, 'rule');
		expect(hits.map((entry) => entry.noteId)).toEqual(['rule-1']);
	});

	it('ranks title prefix matches above loose content matches', () => {
		const goblin = makeNote({
			id: createNoteId('goblin'),
			title: 'Goblin Scout',
			content: 'Skirmisher in the woods',
		});
		const misc = makeNote({
			id: createNoteId('misc'),
			title: 'Camp Notes',
			content: 'Watch for goblin patrols in this area.',
		});
		const records = buildQuickReferenceEntityRecords([misc, goblin]);
		const hits = searchQuickReferenceEntities(records, 'goblin');
		expect(hits.map((entry) => entry.noteId)).toEqual(['goblin', 'misc']);
	});
});
