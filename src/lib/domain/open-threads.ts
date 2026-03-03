import type { Note } from '$lib/types/note.js';
import type { VaultObject } from '$lib/types/object.js';
import type { WorldCalendar } from '$lib/types/world-calendar.js';
import { noteToVaultObject } from '$lib/domain/object-notes.js';
import { formatWorldDate, parseWorldDateInput } from '$lib/domain/world-calendar.js';
import { extractArcTag } from '$lib/domain/session-timeline.js';

export interface OpenQuestThread {
	objectId: string;
	noteId: string;
	title: string;
	status: string | null;
	objective: string | null;
	updatedAt: string;
}

export interface OpenNpcThread {
	objectId: string;
	noteId: string;
	title: string;
	disposition: string | null;
	updatedAt: string;
	reason: string;
}

export interface OpenTimelineThread {
	objectId: string;
	noteId: string;
	title: string;
	arcTag: string | null;
	dayOffset: number | null;
	dateShort: string | null;
	dateIso: string | null;
	summary: string;
	linkedSessionNoteId: string | null;
	updatedAt: string;
	reason: string;
}

export interface OpenThreadsReport {
	generatedAt: string;
	totals: {
		quests: number;
		npcs: number;
		timelineEvents: number;
		all: number;
	};
	quests: OpenQuestThread[];
	npcs: OpenNpcThread[];
	timelineEvents: OpenTimelineThread[];
}

const CLOSED_QUEST_STATUSES = new Set([
	'completed',
	'resolved',
	'closed',
	'failed',
	'abandoned',
	'done',
]);

const RESOLVED_NPC_MARKERS = new Set(['resolved', 'retired', 'dead', 'gone', 'inactive']);
const OPEN_NPC_MARKERS = new Set(['unknown', 'unresolved', 'active', 'at-large', 'missing']);

function normalizeText(value: string | null | undefined): string {
	return (value ?? '').trim().toLowerCase();
}

function parseTimelineDayOffset(
	object: Extract<VaultObject, { type: 'timeline_event' }>,
	calendar: WorldCalendar,
): number | null {
	if (
		typeof object.data.worldDateOffset === 'number' &&
		Number.isFinite(object.data.worldDateOffset)
	) {
		return Math.trunc(object.data.worldDateOffset);
	}
	const parsed = parseWorldDateInput(calendar, object.data.date);
	return parsed?.dayOffset ?? null;
}

function isPendingTimelineEvent(
	note: Note,
	object: Extract<VaultObject, { type: 'timeline_event' }>,
): { pending: boolean; reason: string } {
	const resolution = normalizeText(object.data.resolutionStatus);
	if (resolution === 'pending_resolution') {
		return { pending: true, reason: 'resolution_status_pending' };
	}
	if (resolution === 'resolved' || resolution === 'closed' || resolution === 'archived') {
		return { pending: false, reason: 'resolution_status_closed' };
	}
	if (note.tags.some((tag) => normalizeText(tag) === 'pending-resolution')) {
		return { pending: true, reason: 'tag_pending_resolution' };
	}
	if (normalizeText(object.data.significance).includes('pending')) {
		return { pending: true, reason: 'significance_pending' };
	}
	return { pending: false, reason: 'not_marked_pending' };
}

function buildObjectPairs(
	notes: readonly Note[],
	objects?: readonly VaultObject[],
): Array<{ note: Note; object: VaultObject }> {
	const noteById = new Map(notes.map((note) => [String(note.id), note]));
	const fromNotes = notes
		.map((note) => {
			const object = noteToVaultObject(note);
			return object ? { note, object } : null;
		})
		.filter((entry): entry is { note: Note; object: VaultObject } => !!entry);

	if (!objects || objects.length === 0) return fromNotes;

	const seen = new Set(fromNotes.map((entry) => String(entry.object.id)));
	const merged = [...fromNotes];
	for (const object of objects) {
		const id = String(object.id);
		if (seen.has(id)) continue;
		const note = noteById.get(id);
		if (!note) continue;
		merged.push({ note, object });
		seen.add(id);
	}
	return merged;
}

export function buildOpenThreadsReport(
	notes: readonly Note[],
	calendar: WorldCalendar,
	objects?: readonly VaultObject[],
): OpenThreadsReport {
	const objectPairs = buildObjectPairs(notes, objects).filter(({ note }) => !note.deleted);
	const quests: OpenQuestThread[] = [];
	const npcs: OpenNpcThread[] = [];
	const timelineEvents: OpenTimelineThread[] = [];

	for (const { note, object } of objectPairs) {
		if (object.type === 'quest') {
			const status = normalizeText(object.data.status);
			if (status && CLOSED_QUEST_STATUSES.has(status)) continue;
			quests.push({
				objectId: String(object.id),
				noteId: String(note.id),
				title: object.name,
				status: object.data.status?.trim() || null,
				objective: object.data.objective?.trim() || null,
				updatedAt: object.updatedAt,
			});
			continue;
		}

		if (object.type === 'npc') {
			const disposition = normalizeText(object.data.disposition);
			const hasResolvedTag = note.tags.some((tag) => RESOLVED_NPC_MARKERS.has(normalizeText(tag)));
			const hasOpenTag = note.tags.some((tag) => OPEN_NPC_MARKERS.has(normalizeText(tag)));
			if (hasResolvedTag || RESOLVED_NPC_MARKERS.has(disposition)) continue;
			const unresolved =
				disposition.length === 0 || OPEN_NPC_MARKERS.has(disposition) || hasOpenTag;
			if (!unresolved) continue;
			npcs.push({
				objectId: String(object.id),
				noteId: String(note.id),
				title: object.name,
				disposition: object.data.disposition?.trim() || null,
				updatedAt: object.updatedAt,
				reason: hasOpenTag
					? 'tag_open'
					: disposition.length === 0
						? 'no_disposition'
						: 'disposition_open',
			});
			continue;
		}

		if (object.type === 'timeline_event') {
			const pending = isPendingTimelineEvent(note, object);
			if (!pending.pending) continue;
			const dayOffset = parseTimelineDayOffset(object, calendar);
			timelineEvents.push({
				objectId: String(object.id),
				noteId: String(note.id),
				title: object.name,
				arcTag: object.data.arcTag?.trim() || extractArcTag(note),
				dayOffset,
				dateShort: dayOffset === null ? null : formatWorldDate(calendar, dayOffset, 'short'),
				dateIso: dayOffset === null ? null : formatWorldDate(calendar, dayOffset, 'iso'),
				summary: object.data.summary?.trim() || object.summary || note.title,
				linkedSessionNoteId: object.data.linkedSessionNoteId?.trim() || null,
				updatedAt: object.updatedAt,
				reason: pending.reason,
			});
		}
	}

	quests.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	npcs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	timelineEvents.sort((a, b) => {
		if (a.dayOffset !== null && b.dayOffset !== null && a.dayOffset !== b.dayOffset) {
			return a.dayOffset - b.dayOffset;
		}
		return b.updatedAt.localeCompare(a.updatedAt);
	});

	const totals = {
		quests: quests.length,
		npcs: npcs.length,
		timelineEvents: timelineEvents.length,
		all: quests.length + npcs.length + timelineEvents.length,
	};

	return {
		generatedAt: new Date().toISOString(),
		totals,
		quests,
		npcs,
		timelineEvents,
	};
}
