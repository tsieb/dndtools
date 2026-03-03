import { describe, expect, it } from 'vitest';
import type { Note } from '$lib/types/note.js';
import { createFolderId, createNoteId } from '$lib/types/note.js';
import { normalizeWorldCalendar } from '$lib/domain/world-calendar.js';
import { buildCampaignTimeline } from './campaign-timeline.js';

function note(overrides: Partial<Note>): Note {
	return {
		id: createNoteId('note-1'),
		title: 'Note',
		content: 'body',
		folder: createFolderId('/'),
		tags: [],
		frontmatter: {},
		visibility: overrides.visibility ?? 'dm_only',
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		deleted: false,
		deletedAt: null,
		pinned: false,
		pinnedAt: null,
		...overrides,
	};
}

describe('buildCampaignTimeline', () => {
	it('renders world events and linked session logs in chronological order', () => {
		const calendar = normalizeWorldCalendar({});
		const timelineNote = note({
			id: createNoteId('timeline-1'),
			title: 'Kingdom Falls',
			tags: ['arc:war'],
			frontmatter: {
				dndtools: {
					object: {
						kind: 'timeline_event',
						summary: 'The capital was breached.',
						data: {
							worldDateOffset: 12,
							summary: 'The capital was breached.',
							involvedObjectIds: ['npc-scout'],
							arcTag: 'war',
							resolutionStatus: 'pending_resolution',
						},
					},
				},
			},
		});
		const npcNote = note({
			id: createNoteId('npc-scout'),
			title: 'Scout Captain',
			frontmatter: {
				dndtools: {
					object: {
						kind: 'npc',
						data: { disposition: 'active' },
					},
				},
			},
		});
		const sessionNote = note({
			id: createNoteId('session-7'),
			title: 'Session 7',
			tags: ['session'],
			frontmatter: { worldDate: 12, timelineEventId: 'timeline-1' },
			content: 'Players escaped through the aqueduct.',
		});

		const entries = buildCampaignTimeline([timelineNote, sessionNote, npcNote], calendar);
		expect(entries).toHaveLength(2);
		expect(entries[0]?.kind).toBe('timeline_event');
		expect(entries[1]?.kind).toBe('session_note');
		expect(entries[1]?.linkedTimelineEventId).toBe('timeline-1');
		expect(entries[1]?.arcTag).toBe('war');
		expect(entries[1]?.participantNames).toEqual(['Scout Captain']);
	});

	it('supports arc and participant filters', () => {
		const calendar = normalizeWorldCalendar({});
		const notes = [
			note({
				id: createNoteId('timeline-war'),
				title: 'War Arc Event',
				frontmatter: {
					dndtools: {
						object: {
							kind: 'timeline_event',
							data: {
								worldDateOffset: 5,
								arcTag: 'war',
								involvedObjectIds: ['npc-1'],
								consequences: [],
							},
						},
					},
				},
			}),
			note({
				id: createNoteId('timeline-city'),
				title: 'City Arc Event',
				frontmatter: {
					dndtools: {
						object: {
							kind: 'timeline_event',
							data: {
								worldDateOffset: 6,
								arcTag: 'city',
								involvedObjectIds: ['npc-2'],
								consequences: [],
							},
						},
					},
				},
			}),
		];

		expect(buildCampaignTimeline(notes, calendar, { arcTag: 'war' })).toHaveLength(1);
		expect(buildCampaignTimeline(notes, calendar, { participantObjectId: 'npc-2' })).toHaveLength(
			1,
		);
	});
});
