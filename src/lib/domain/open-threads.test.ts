import { describe, expect, it } from 'vitest';
import type { Note } from '$lib/types/note.js';
import { createFolderId, createNoteId } from '$lib/types/note.js';
import { normalizeWorldCalendar } from '$lib/domain/world-calendar.js';
import { buildOpenThreadsReport } from './open-threads.js';

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

describe('buildOpenThreadsReport', () => {
	it('derives open quests, unresolved NPCs, and pending timeline events', () => {
		const calendar = normalizeWorldCalendar({});
		const report = buildOpenThreadsReport(
			[
				note({
					id: createNoteId('quest-open'),
					title: 'Recover the Relic',
					frontmatter: {
						dndtools: {
							object: {
								kind: 'quest',
								data: {
									status: 'active',
									objective: 'Recover the relic from the ruins',
								},
							},
						},
					},
				}),
				note({
					id: createNoteId('quest-closed'),
					title: 'Archived Quest',
					frontmatter: {
						dndtools: {
							object: {
								kind: 'quest',
								data: {
									status: 'resolved',
								},
							},
						},
					},
				}),
				note({
					id: createNoteId('npc-open'),
					title: 'Warden Kael',
					frontmatter: {
						dndtools: {
							object: {
								kind: 'npc',
								data: {
									disposition: 'unknown',
								},
							},
						},
					},
				}),
				note({
					id: createNoteId('timeline-pending'),
					title: 'The Gate Trembles',
					tags: ['pending-resolution', 'arc:rift'],
					frontmatter: {
						dndtools: {
							object: {
								kind: 'timeline_event',
								data: {
									worldDateOffset: 40,
									resolutionStatus: 'pending_resolution',
									summary: 'The planar gate is unstable.',
									involvedObjectIds: [],
									consequences: [],
								},
							},
						},
					},
				}),
			],
			calendar,
		);

		expect(report.totals.quests).toBe(1);
		expect(report.totals.npcs).toBe(1);
		expect(report.totals.timelineEvents).toBe(1);
		expect(report.totals.all).toBe(3);
		expect(report.timelineEvents[0]?.arcTag).toBe('rift');
	});
});
