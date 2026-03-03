import type { Note } from '$lib/types/note.js';
import type { VaultObject } from '$lib/types/object.js';
import type { WorldCalendar } from '$lib/types/world-calendar.js';
import { noteToVaultObject } from '$lib/domain/object-notes.js';
import { formatWorldDate, parseWorldDateInput } from '$lib/domain/world-calendar.js';
import {
	extractArcTag,
	getSessionDayOffset,
	getSessionTimelineEventId,
	isSessionNote,
	summarizeSessionNote,
} from '$lib/domain/session-timeline.js';

export type CampaignTimelineEntryKind = 'timeline_event' | 'session_note';

export interface CampaignTimelineEntry {
	id: string;
	noteId: string;
	kind: CampaignTimelineEntryKind;
	dayOffset: number;
	dateShort: string;
	dateIso: string;
	title: string;
	summary: string;
	arcTag: string | null;
	participantObjectIds: string[];
	participantNames: string[];
	linkedTimelineEventId: string | null;
	linkedSessionNoteId: string | null;
	pendingResolution: boolean;
}

export interface BuildCampaignTimelineOptions {
	arcTag?: string | null;
	participantObjectId?: string | null;
	includeKinds?: readonly CampaignTimelineEntryKind[];
}

function unique(values: readonly string[]): string[] {
	return [...new Set(values)];
}

function normalizeFilterText(value: string | null | undefined): string {
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

function arcTagFromTimelineEvent(
	note: Note,
	object: Extract<VaultObject, { type: 'timeline_event' }>,
): string | null {
	const fromData = object.data.arcTag?.trim();
	if (fromData) return fromData;
	return extractArcTag(note);
}

function isPendingTimelineEvent(
	note: Note,
	object: Extract<VaultObject, { type: 'timeline_event' }>,
): boolean {
	const resolution = object.data.resolutionStatus?.trim().toLowerCase();
	if (resolution === 'pending_resolution') return true;
	if (resolution === 'resolved' || resolution === 'closed' || resolution === 'archived')
		return false;
	if (note.tags.some((tag) => tag.toLowerCase() === 'pending-resolution')) return true;
	return object.data.significance?.toLowerCase().includes('pending') ?? false;
}

function buildObjectNameMap(notes: readonly Note[]): Map<string, string> {
	const names = new Map<string, string>();
	for (const note of notes) {
		const object = noteToVaultObject(note);
		if (!object) continue;
		names.set(String(object.id), object.name);
	}
	return names;
}

export function buildCampaignTimeline(
	notes: readonly Note[],
	calendar: WorldCalendar,
	options: BuildCampaignTimelineOptions = {},
): CampaignTimelineEntry[] {
	const includeKinds = options.includeKinds ? new Set(options.includeKinds) : null;
	const objectNames = buildObjectNameMap(notes);
	const arcFilter = normalizeFilterText(options.arcTag);
	const participantFilter = normalizeFilterText(options.participantObjectId);
	const timelineEntriesById = new Map<string, CampaignTimelineEntry>();
	const sessionLinks = new Map<string, string>();

	for (const note of notes) {
		if (note.deleted) continue;
		const object = noteToVaultObject(note);
		if (!object || object.type !== 'timeline_event') continue;
		const dayOffset = parseTimelineDayOffset(object, calendar);
		if (dayOffset === null) continue;
		const participantObjectIds = unique(
			object.data.involvedObjectIds.map((id) => String(id).trim()).filter((id) => id.length > 0),
		);
		const entry: CampaignTimelineEntry = {
			id: `timeline:${object.id}`,
			noteId: String(note.id),
			kind: 'timeline_event',
			dayOffset,
			dateShort: formatWorldDate(calendar, dayOffset, 'short'),
			dateIso: formatWorldDate(calendar, dayOffset, 'iso'),
			title: note.title,
			summary: object.data.summary?.trim() || object.summary || note.title,
			arcTag: arcTagFromTimelineEvent(note, object),
			participantObjectIds,
			participantNames: participantObjectIds.map((id) => objectNames.get(id) ?? id),
			linkedTimelineEventId: null,
			linkedSessionNoteId: object.data.linkedSessionNoteId?.trim() || null,
			pendingResolution: isPendingTimelineEvent(note, object),
		};
		timelineEntriesById.set(String(note.id), entry);
	}

	const sessionEntries: CampaignTimelineEntry[] = [];
	for (const note of notes) {
		if (note.deleted || !isSessionNote(note)) continue;
		const dayOffset = getSessionDayOffset(note, calendar);
		if (dayOffset === null) continue;
		const linkedTimelineEventId = getSessionTimelineEventId(note.frontmatter);
		if (linkedTimelineEventId) {
			sessionLinks.set(linkedTimelineEventId, String(note.id));
		}
		const linkedTimeline = linkedTimelineEventId
			? timelineEntriesById.get(linkedTimelineEventId)
			: null;
		const participantObjectIds = linkedTimeline?.participantObjectIds ?? [];
		const participantNames = linkedTimeline?.participantNames ?? [];
		const arcTag = linkedTimeline?.arcTag ?? extractArcTag(note);
		sessionEntries.push({
			id: `session:${note.id}`,
			noteId: String(note.id),
			kind: 'session_note',
			dayOffset,
			dateShort: formatWorldDate(calendar, dayOffset, 'short'),
			dateIso: formatWorldDate(calendar, dayOffset, 'iso'),
			title: note.title,
			summary: summarizeSessionNote(note),
			arcTag: arcTag ?? null,
			participantObjectIds,
			participantNames,
			linkedTimelineEventId: linkedTimelineEventId ?? null,
			linkedSessionNoteId: null,
			pendingResolution: false,
		});
	}

	for (const [timelineId, sessionId] of sessionLinks) {
		const timeline = timelineEntriesById.get(timelineId);
		if (!timeline || timeline.linkedSessionNoteId) continue;
		timeline.linkedSessionNoteId = sessionId;
	}

	const allEntries = [...timelineEntriesById.values(), ...sessionEntries];
	return allEntries
		.filter((entry) => (includeKinds ? includeKinds.has(entry.kind) : true))
		.filter((entry) => {
			if (!arcFilter) return true;
			return normalizeFilterText(entry.arcTag) === arcFilter;
		})
		.filter((entry) => {
			if (!participantFilter) return true;
			return entry.participantObjectIds.some((id) => normalizeFilterText(id) === participantFilter);
		})
		.sort((a, b) => {
			if (a.dayOffset !== b.dayOffset) return a.dayOffset - b.dayOffset;
			if (a.kind !== b.kind) return a.kind === 'timeline_event' ? -1 : 1;
			return a.title.localeCompare(b.title);
		});
}
