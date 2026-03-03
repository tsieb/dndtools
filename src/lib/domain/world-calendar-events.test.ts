import { describe, expect, it } from 'vitest';
import type { Note } from '$lib/types/note.js';
import { createFolderId, createNoteId } from '$lib/types/note.js';
import { normalizeWorldCalendar } from '$lib/domain/world-calendar.js';
import {
	buildCalendarEventCountMap,
	collectCalendarEventEntries,
} from './world-calendar-events.js';

function note(overrides: Partial<Note>): Note {
	return {
		id: createNoteId('note-1'),
		title: 'Note',
		content: 'content',
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

describe('world-calendar-events', () => {
	it('collects timeline and session events with offsets', () => {
		const calendar = normalizeWorldCalendar({});
		const timeline = note({
			id: createNoteId('timeline-1'),
			title: 'Coronation',
			frontmatter: {
				dndtools: {
					object: {
						kind: 'timeline_event',
						data: {
							worldDateOffset: 12,
							summary: 'The king was crowned.',
						},
					},
				},
			},
		});
		const session = note({
			id: createNoteId('session-1'),
			title: 'Session 3',
			tags: ['session'],
			frontmatter: { worldDate: 15 },
		});

		const events = collectCalendarEventEntries([timeline, session], calendar);
		expect(events).toHaveLength(2);
		expect(events.map((event) => event.kind)).toEqual(['timeline_event', 'session_note']);
		expect(events.map((event) => event.dayOffset)).toEqual([12, 15]);
	});

	it('filters and counts date range results', () => {
		const calendar = normalizeWorldCalendar({});
		const events = collectCalendarEventEntries(
			[
				note({
					id: createNoteId('session-a'),
					title: 'Session A',
					tags: ['session'],
					frontmatter: { worldDate: 2 },
				}),
				note({
					id: createNoteId('session-b'),
					title: 'Session B',
					tags: ['session'],
					frontmatter: { worldDate: 2 },
				}),
				note({
					id: createNoteId('session-c'),
					title: 'Session C',
					tags: ['session'],
					frontmatter: { worldDate: 8 },
				}),
			],
			calendar,
			{ fromDayOffset: 1, toDayOffset: 4 },
		);
		expect(events).toHaveLength(2);
		const counts = buildCalendarEventCountMap(events);
		expect(counts.get(2)).toBe(2);
	});
});
