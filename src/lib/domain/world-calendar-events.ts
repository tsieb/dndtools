import type { Note } from '$lib/types/note.js';
import type { WorldCalendar } from '$lib/types/world-calendar.js';
import { noteToVaultObject } from '$lib/domain/object-notes.js';
import { parseWorldDateInput } from '$lib/domain/world-calendar.js';
import {
	getSessionDayOffset,
	isSessionNote,
	summarizeSessionNote,
} from '$lib/domain/session-timeline.js';

export type CalendarEventKind = 'timeline_event' | 'session_note';

export interface CalendarEventEntry {
	noteId: string;
	title: string;
	kind: CalendarEventKind;
	dayOffset: number;
	summary: string;
}

function asOffset(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
	if (typeof value === 'string' && value.trim().length > 0) {
		const parsed = Number.parseInt(value.trim(), 10);
		if (Number.isFinite(parsed)) return parsed;
	}
	return null;
}

function asString(value: unknown): string | null {
	if (typeof value === 'string' && value.trim().length > 0) return value.trim();
	return null;
}

function parseOffsetFromDateString(calendar: WorldCalendar, value: unknown): number | null {
	const text = asString(value);
	if (!text) return null;
	return parseWorldDateInput(calendar, text)?.dayOffset ?? null;
}

function resolveTimelineEventOffset(note: Note, calendar: WorldCalendar): number | null {
	const object = noteToVaultObject(note);
	if (!object || object.type !== 'timeline_event') return null;
	const fromOffset = asOffset(object.data.worldDateOffset);
	if (fromOffset !== null) return fromOffset;
	return parseOffsetFromDateString(calendar, object.data.date);
}

export function collectCalendarEventEntries(
	notes: readonly Note[],
	calendar: WorldCalendar,
	options?: { fromDayOffset?: number; toDayOffset?: number },
): CalendarEventEntry[] {
	const from = options?.fromDayOffset;
	const to = options?.toDayOffset;
	const events: CalendarEventEntry[] = [];

	for (const note of notes) {
		if (note.deleted) continue;
		const timelineOffset = resolveTimelineEventOffset(note, calendar);
		if (timelineOffset !== null) {
			if (
				(from !== undefined && timelineOffset < from) ||
				(to !== undefined && timelineOffset > to)
			) {
				continue;
			}
			const object = noteToVaultObject(note);
			events.push({
				noteId: String(note.id),
				title: note.title,
				kind: 'timeline_event',
				dayOffset: timelineOffset,
				summary:
					object && object.type === 'timeline_event'
						? object.data.summary?.trim() || object.summary
						: note.title,
			});
			continue;
		}

		if (!isSessionNote(note)) continue;
		const sessionOffset = getSessionDayOffset(note, calendar);
		if (sessionOffset === null) continue;
		if ((from !== undefined && sessionOffset < from) || (to !== undefined && sessionOffset > to)) {
			continue;
		}
		events.push({
			noteId: String(note.id),
			title: note.title,
			kind: 'session_note',
			dayOffset: sessionOffset,
			summary: summarizeSessionNote(note),
		});
	}

	return events.sort((a, b) => {
		if (a.dayOffset !== b.dayOffset) return a.dayOffset - b.dayOffset;
		return a.title.localeCompare(b.title);
	});
}

export function buildCalendarEventCountMap(
	events: readonly CalendarEventEntry[],
): Map<number, number> {
	const counts = new Map<number, number>();
	for (const event of events) {
		counts.set(event.dayOffset, (counts.get(event.dayOffset) ?? 0) + 1);
	}
	return counts;
}
