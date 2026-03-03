import type { Note } from '$lib/types/note.js';
import type { VaultObject, VaultObjectId } from '$lib/types/object.js';
import type { WorldCalendar } from '$lib/types/world-calendar.js';
import { createVaultObjectId } from '$lib/types/object.js';
import { nowISO } from '$lib/utils/date.js';
import { normalizeTimelineEventData } from '$lib/domain/objects.js';
import {
	formatWorldDate,
	normalizeWorldCalendar,
	parseWorldDateInput,
} from '$lib/domain/world-calendar.js';

export const SESSION_TIMELINE_LINK_KEYS = [
	'timelineEventId',
	'timeline_event_id',
	'sessionTimelineEventId',
	'session_timeline_event_id',
] as const;

export interface SessionTimelineStorage {
	getSetting(key: 'worldCalendar'): Promise<unknown>;
	getObject(id: VaultObjectId): Promise<VaultObject | null>;
	saveObject(object: VaultObject): Promise<void>;
}

export interface SessionTimelineSyncResult {
	linkedTimelineEventId: string | null;
	timelineEventCreated: boolean;
	timelineEventUpdated: boolean;
	nextFrontmatter: Record<string, unknown> | null;
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

function asStringList(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value
			.map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
			.filter((entry) => entry.length > 0);
	}
	if (typeof value === 'string') {
		return value
			.split(',')
			.map((entry) => entry.trim())
			.filter((entry) => entry.length > 0);
	}
	return [];
}

function parseOffsetFromDateString(calendar: WorldCalendar, value: unknown): number | null {
	const text = asString(value);
	if (!text) return null;
	return parseWorldDateInput(calendar, text)?.dayOffset ?? null;
}

function unique(values: readonly string[]): string[] {
	return [...new Set(values)];
}

function isSameJson(a: unknown, b: unknown): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

export function isSessionNote(note: Pick<Note, 'tags' | 'frontmatter'>): boolean {
	if (note.tags.some((tag) => tag.toLowerCase() === 'session')) return true;
	return (
		note.frontmatter.session !== undefined ||
		note.frontmatter['session_number'] !== undefined ||
		note.frontmatter['session-log'] !== undefined
	);
}

export function getSessionTimelineEventId(frontmatter: Record<string, unknown>): string | null {
	for (const key of SESSION_TIMELINE_LINK_KEYS) {
		const value = frontmatter[key];
		if (typeof value === 'string' && value.trim().length > 0) return value.trim();
	}
	return null;
}

export function setSessionTimelineEventId(
	frontmatter: Record<string, unknown>,
	eventId: string,
): Record<string, unknown> {
	const next: Record<string, unknown> = { ...frontmatter, timelineEventId: eventId };
	for (const key of SESSION_TIMELINE_LINK_KEYS) {
		if (key === 'timelineEventId') continue;
		if (key in next) delete next[key];
	}
	return next;
}

export function getSessionDayOffset(note: Note, calendar: WorldCalendar): number | null {
	const fromFrontmatter =
		asOffset(note.frontmatter.worldDate) ??
		asOffset(note.frontmatter.world_date) ??
		asOffset(note.frontmatter.sessionDateOffset) ??
		asOffset(note.frontmatter.session_date_offset);
	if (fromFrontmatter !== null) return fromFrontmatter;
	return (
		parseOffsetFromDateString(calendar, note.frontmatter.worldDate) ??
		parseOffsetFromDateString(calendar, note.frontmatter.world_date) ??
		parseOffsetFromDateString(calendar, note.frontmatter.worldDateISO) ??
		parseOffsetFromDateString(calendar, note.frontmatter.world_date_iso) ??
		parseOffsetFromDateString(calendar, note.frontmatter.date)
	);
}

export function summarizeSessionNote(note: Note): string {
	const firstContentLine = note.content
		.split('\n')
		.map((line) => line.trim())
		.find((line) => line.length > 0 && !line.startsWith('#'));
	return firstContentLine ?? 'Session note';
}

export function extractArcTag(note: Pick<Note, 'tags' | 'frontmatter'>): string | null {
	const explicit =
		(typeof note.frontmatter.arcTag === 'string' && note.frontmatter.arcTag.trim()) ||
		(typeof note.frontmatter.arc === 'string' && note.frontmatter.arc.trim());
	if (explicit) return explicit.trim();
	const fromTag = note.tags.find((tag) => tag.toLowerCase().startsWith('arc:'));
	return fromTag ? fromTag.slice(fromTag.indexOf(':') + 1).trim() || null : null;
}

function extractParticipantObjectIds(frontmatter: Record<string, unknown>): string[] {
	return unique([
		...asStringList(frontmatter.participantObjectIds),
		...asStringList(frontmatter.participants),
		...asStringList(frontmatter.involvedObjectIds),
	]);
}

async function allocateTimelineEventId(
	storage: Pick<SessionTimelineStorage, 'getObject'>,
	noteId: string,
): Promise<VaultObjectId> {
	let suffix = '';
	let attempt = 0;
	for (;;) {
		const candidate = createVaultObjectId(`${noteId}-timeline${suffix}`);
		const existing = await storage.getObject(candidate);
		if (!existing) return candidate;
		attempt += 1;
		suffix = `-${attempt}`;
	}
}

function buildTimelineEventName(note: Note): string {
	if (note.title.toLowerCase().startsWith('session')) return note.title;
	return `Session Event: ${note.title}`;
}

function isTimelineEventObject(
	value: VaultObject | null,
): value is Extract<VaultObject, { type: 'timeline_event' }> {
	return !!value && value.type === 'timeline_event';
}

export async function syncSessionTimelineLink(
	storage: SessionTimelineStorage,
	note: Note,
): Promise<SessionTimelineSyncResult | null> {
	if (note.deleted || !isSessionNote(note)) return null;

	const worldCalendarRaw = await storage.getSetting('worldCalendar');
	const calendar = normalizeWorldCalendar(worldCalendarRaw);
	const sessionDayOffset = getSessionDayOffset(note, calendar);
	if (sessionDayOffset === null) return null;

	const existingLinkedId = getSessionTimelineEventId(note.frontmatter);
	const preferredId = createVaultObjectId(`${String(note.id)}-timeline`);
	const linkedObject =
		existingLinkedId != null
			? await storage.getObject(createVaultObjectId(existingLinkedId))
			: await storage.getObject(preferredId);

	const summary = summarizeSessionNote(note);
	const arcTag = extractArcTag(note) ?? undefined;
	const participantObjectIds = extractParticipantObjectIds(note.frontmatter);
	const canonicalDate = formatWorldDate(calendar, sessionDayOffset, 'iso');

	let linkedTimelineEventId: string;
	let timelineEventCreated = false;
	let timelineEventUpdated = false;

	if (!isTimelineEventObject(linkedObject)) {
		const createdId = await allocateTimelineEventId(storage, String(note.id));
		const timestamp = nowISO();
		const event: Extract<VaultObject, { type: 'timeline_event' }> = {
			id: createdId,
			type: 'timeline_event',
			name: buildTimelineEventName(note),
			summary,
			tags: unique(
				['timeline', 'session-log', ...note.tags].map((entry) => entry.trim()).filter(Boolean),
			),
			visibility: note.visibility,
			relationships: [],
			data: normalizeTimelineEventData({
				date: canonicalDate,
				worldDateOffset: sessionDayOffset,
				summary,
				involvedObjectIds: participantObjectIds,
				consequences: [],
				arcTag,
				linkedSessionNoteId: String(note.id),
				resolutionStatus: 'resolved',
			}),
			createdAt: timestamp,
			updatedAt: timestamp,
		};
		await storage.saveObject(event);
		linkedTimelineEventId = String(createdId);
		timelineEventCreated = true;
	} else {
		linkedTimelineEventId = String(linkedObject.id);
		const nextData = normalizeTimelineEventData({
			...linkedObject.data,
			date: canonicalDate,
			worldDateOffset: sessionDayOffset,
			summary: linkedObject.data.summary?.trim() || summary,
			arcTag: linkedObject.data.arcTag?.trim() || arcTag,
			involvedObjectIds: unique([...linkedObject.data.involvedObjectIds, ...participantObjectIds]),
			linkedSessionNoteId: linkedObject.data.linkedSessionNoteId?.trim() || String(note.id),
		});
		const nextSummary = linkedObject.summary.trim() || summary;
		const nextTags = unique(
			[...linkedObject.tags, 'timeline', 'session-log', ...note.tags]
				.map((entry) => entry.trim())
				.filter(Boolean),
		);
		const shouldSave =
			!isSameJson(nextData, linkedObject.data) ||
			nextSummary !== linkedObject.summary ||
			!isSameJson(nextTags, linkedObject.tags);
		if (shouldSave) {
			await storage.saveObject({
				...linkedObject,
				summary: nextSummary,
				tags: nextTags,
				data: nextData,
				updatedAt: nowISO(),
			});
			timelineEventUpdated = true;
		}
	}

	const nextFrontmatter = setSessionTimelineEventId(note.frontmatter, linkedTimelineEventId);
	const changedFrontmatter = !isSameJson(nextFrontmatter, note.frontmatter);

	return {
		linkedTimelineEventId,
		timelineEventCreated,
		timelineEventUpdated,
		nextFrontmatter: changedFrontmatter ? nextFrontmatter : null,
	};
}
