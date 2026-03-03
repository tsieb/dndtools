import { describe, expect, it } from 'vitest';
import type { Note } from '$lib/types/note.js';
import type { VaultObject } from '$lib/types/object.js';
import { createFolderId, createNoteId } from '$lib/types/note.js';
import { createVaultObjectId } from '$lib/types/object.js';
import { normalizeWorldCalendar } from '$lib/domain/world-calendar.js';
import { getSessionDayOffset, syncSessionTimelineLink } from './session-timeline.js';

function note(overrides: Partial<Note>): Note {
	return {
		id: createNoteId('session-1'),
		title: 'Session 9',
		content: 'Discovered the hidden gate.',
		folder: createFolderId('/sessions'),
		tags: ['session'],
		frontmatter: { worldDate: 10 },
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		deleted: false,
		deletedAt: null,
		pinned: false,
		pinnedAt: null,
		...overrides,
	};
}

describe('session-timeline helpers', () => {
	it('parses session world date offsets from numeric and ISO frontmatter', () => {
		const calendar = normalizeWorldCalendar({});
		expect(getSessionDayOffset(note({ frontmatter: { worldDate: 14 } }), calendar)).toBe(14);
		expect(
			getSessionDayOffset(note({ frontmatter: { worldDateISO: '0001-01-03' } }), calendar),
		).toBe(2);
	});

	it('creates and links a timeline event for a session note without linkage', async () => {
		const objects = new Map<string, VaultObject>();
		const sessionNote = note({});
		const result = await syncSessionTimelineLink(
			{
				getSetting: async () => ({ currentDayOffset: 0 }),
				getObject: async (id) => objects.get(String(id)) ?? null,
				saveObject: async (object) => {
					objects.set(String(object.id), object);
				},
			},
			sessionNote,
		);

		expect(result).toBeTruthy();
		expect(result?.timelineEventCreated).toBe(true);
		expect(result?.linkedTimelineEventId).toBe('session-1-timeline');
		expect(result?.nextFrontmatter).toMatchObject({ timelineEventId: 'session-1-timeline' });

		const created = objects.get('session-1-timeline');
		expect(created?.type).toBe('timeline_event');
		if (!created || created.type !== 'timeline_event') return;
		expect(created.data.worldDateOffset).toBe(10);
		expect(created.data.linkedSessionNoteId).toBe('session-1');
	});

	it('reuses preferred timeline id and updates existing timeline metadata', async () => {
		const existingTimeline: VaultObject = {
			id: createVaultObjectId('session-1-timeline'),
			type: 'timeline_event',
			name: 'Session 1 Timeline',
			summary: '',
			tags: ['timeline'],
			relationships: [],
			data: {
				worldDateOffset: 1,
				involvedObjectIds: [],
				consequences: [],
				resolutionStatus: 'resolved',
			},
			createdAt: '2026-01-01T00:00:00.000Z',
			updatedAt: '2026-01-01T00:00:00.000Z',
		};
		const objects = new Map<string, VaultObject>([[String(existingTimeline.id), existingTimeline]]);
		const sessionNote = note({
			frontmatter: { worldDate: 22 },
			// Simulate content parse dropping linkage key; helper should recover via preferred id.
		});

		const result = await syncSessionTimelineLink(
			{
				getSetting: async () => ({ currentDayOffset: 0 }),
				getObject: async (id) => objects.get(String(id)) ?? null,
				saveObject: async (object) => {
					objects.set(String(object.id), object);
				},
			},
			sessionNote,
		);

		expect(result?.timelineEventCreated).toBe(false);
		expect(result?.timelineEventUpdated).toBe(true);
		expect(result?.linkedTimelineEventId).toBe('session-1-timeline');
		expect(result?.nextFrontmatter).toMatchObject({ timelineEventId: 'session-1-timeline' });
		expect(objects.get('session-1-timeline')?.updatedAt).not.toBe(existingTimeline.updatedAt);
	});
});
