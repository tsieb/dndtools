import { hasDmAuthority } from '../state/permission-state';
import type { PermissionState } from '../state/permission-state';
import type { SessionState, SessionArchiveSnapshot } from '../state/session-state';
import type { VaultContentState } from '../state/content';
import type { MapState } from '../state/map-state';
import type {
	CalendarDateFormat,
	CalendarDefinition,
	CustomDate,
} from '../state/calendar';
import { absoluteDayIndex, compareCustomDates, formatCustomDate } from '../state/calendar';
import { getCalendarTimelineForActor } from './content-query';
import { getCalendarContinuityForActor, type CalendarLinkView } from './calendar-continuity-query';

/**
 * SRCH-010 — CALENDAR / CUSTOM-TIME DISCOVERY: search and filter VISIBLE content by campaign calendar
 * dates, custom-time RANGES, timeline EVENTS, and session CHRONOLOGY.
 *
 * This is a pure DISCOVERY surface composed ENTIRELY from the EXISTING actor-filtered reads — it is NOT
 * a second index and it never re-derives calendar math or visibility:
 *
 *   - DATED CONTENT (note/object date fields + timeline references) ← {@link getCalendarTimelineForActor}
 *     (CONTENT-011). A `dm-only` dated note is ALREADY omitted there, so it can never surface here.
 *   - TIMELINE EVENTS (campaign calendar links by reference) ← {@link getCalendarContinuityForActor}
 *     (SES-012). A link to a hidden/deleted target ALREADY degrades to `unavailable` there; this surface
 *     never re-exposes the target's name, only the DM-authored label the link already carries.
 *   - SESSION CHRONOLOGY (the archived sessions of the campaign) ← {@link SessionState.archives}. Session
 *     archives are a DM surface (mirroring the SES-012 session-link rule), so a non-DM never receives a
 *     chronology row (fail closed).
 *
 * Because EVERY source is itself actor-filtered, the data layer decided visibility BEFORE this surface
 * sees anything (Cross-Contract Non-Negotiable 2). The discovery result — including its COUNTS — is
 * therefore computed over ONLY the actor-visible set: a player searching a date range that contains
 * hidden events sees neither the hidden events NOR a count that reveals their existence (SRCH-010 AC2).
 * An unknown/unauthenticated actor receives an empty result (fail closed).
 *
 * Pure + deterministic: the same (session, content, maps, permissions, actor, filter) always returns the
 * same ranked result. The Processing Core owns the date-range filter, text match, and ordering; the GUI
 * renders the computed result and dispatches command intents only (Architecture Contract 1). Date
 * arithmetic + stable formatting are owned by `state/calendar.ts` (CONTENT-011) — never re-derived here.
 */

/** Which kind of source a discovered event came from (for grouping/disambiguation in the result UI). */
export type CalendarEventSource = 'content' | 'timeline-link' | 'session';

export const CALENDAR_EVENT_SOURCES: readonly CalendarEventSource[] = Object.freeze([
	'content',
	'timeline-link',
	'session',
]);

/** A custom date projected to the discovery surface: the structural value + its stable formatted strings. */
export interface DiscoveryDateView {
	value: CustomDate;
	/** The canonical machine-stable sort/equality key (`YYYY-MM-DD`). */
	isoLike: string;
	/** The human display string in the requested format (stable, locale-independent). */
	display: string;
	/** The absolute day index from the calendar epoch — the ordering/range key. `null` when invalid. */
	absoluteDayIndex: number | null;
}

/**
 * One discovered, actor-visible dated event. The `title` is the visible label already decided by the
 * source read: a content item's title (a visible item), a calendar link's DM-authored label (which
 * never derives from a hidden target's content), or a session-chronology marker. Nothing here can name
 * content the actor may not see.
 */
export interface CalendarDiscoveryEvent {
	/** Stable id of the event WITHIN its source (the content item id, the link id, or the archive id). */
	id: string;
	source: CalendarEventSource;
	/** The visible label/title for the event (already actor-safe at its source). */
	title: string;
	date: DiscoveryDateView;
}

/** An INCLUSIVE custom-date range filter, expressed in a single calendar. Either bound may be open. */
export interface CalendarDateRange {
	/** Inclusive lower bound; `null` ⇒ open (no lower bound). Must share `calendarId` when present. */
	from: CustomDate | null;
	/** Inclusive upper bound; `null` ⇒ open (no upper bound). Must share `calendarId` when present. */
	to: CustomDate | null;
}

/** The discovery filter: a calendar to search within, an optional date range, and an optional text query. */
export interface CalendarDiscoveryFilter {
	/** The calendar whose dates are searched. Only events dated in this calendar are considered. */
	calendarId: string;
	/** Optional inclusive date-range filter; omit/`null` bounds for an open range (the whole calendar). */
	range?: CalendarDateRange;
	/** Optional case-insensitive substring query over the visible event title/label. Blank ⇒ no text filter. */
	query?: string;
	/** Which sources to include. Defaults to ALL (content + timeline links + session chronology). */
	sources?: readonly CalendarEventSource[];
}

/**
 * The actor-filtered calendar/custom-time discovery RESULT. The `events` are range-filtered, text-matched,
 * and ordered deterministically by absolute day index (then source, then id). The counts are derived from
 * the SAME actor-visible event set, so they never reveal hidden events (SRCH-010 AC2).
 */
export interface CalendarDiscoveryResult {
	calendarId: string;
	/** Whether the named calendar exists (a missing calendar yields an empty, calendar-less result). */
	calendarKnown: boolean;
	/** The events matching the filter, deterministically ordered. ONLY actor-visible events appear. */
	events: CalendarDiscoveryEvent[];
	/** Total matching visible events (== `events.length`). Computed over the visible set only — never inflated. */
	totalCount: number;
	/** Per-source counts of matching visible events. Never reveals a hidden event in any source. */
	countsBySource: Record<CalendarEventSource, number>;
	/** The range that was applied (echoed for result metadata), with stable formatted bounds. */
	appliedRange: { from: DiscoveryDateView | null; to: DiscoveryDateView | null } | null;
}

/** Build the stable formatted view of a custom date against a calendar definition. Pure. */
function formatDate(
	calendar: CalendarDefinition,
	date: CustomDate,
	format: CalendarDateFormat,
): DiscoveryDateView {
	return {
		value: date,
		isoLike: formatCustomDate(calendar, date, 'iso-like'),
		display: formatCustomDate(calendar, date, format),
		absoluteDayIndex: absoluteDayIndex(calendar, date),
	};
}

/**
 * Whether `date` falls within the inclusive `range` for `calendar`. A `null` bound is open. A date whose
 * absolute index cannot be computed (invalid) is treated as OUT of range (fail closed — an unrepresentable
 * date never matches). Both bounds, when present, are compared in the SAME calendar; a bound in a different
 * calendar is ignored as not-applicable (it cannot constrain a date it does not share a frame with).
 */
function dateInRange(
	calendar: CalendarDefinition,
	date: CustomDate,
	range: CalendarDateRange | undefined,
): boolean {
	if (!range) return true;
	const index = absoluteDayIndex(calendar, date);
	if (index === null) return false;
	if (range.from && range.from.calendarId === date.calendarId) {
		const cmp = compareCustomDates(calendar, date, range.from);
		if (cmp === null || cmp < 0) return false;
	}
	if (range.to && range.to.calendarId === date.calendarId) {
		const cmp = compareCustomDates(calendar, date, range.to);
		if (cmp === null || cmp > 0) return false;
	}
	return true;
}

/** Whether a visible event title matches the (already-lowercased) text needle. Blank needle ⇒ always. */
function matchesQuery(title: string, needle: string): boolean {
	return needle === '' || title.toLowerCase().includes(needle);
}

/**
 * Collect the actor-visible CONTENT events dated in the calendar (CONTENT-011). Composes the existing
 * actor-filtered calendar/timeline read, so a `dm-only` dated note is already omitted at the source.
 */
function contentEvents(
	content: VaultContentState,
	permissions: PermissionState,
	actorId: string,
	calendarId: string,
	format: CalendarDateFormat,
): CalendarDiscoveryEvent[] {
	return getCalendarTimelineForActor(content, permissions, actorId, calendarId, format).map((row) => ({
		id: row.itemId,
		source: 'content' as const,
		title: row.title,
		// The timeline view already formatted the date; project it onto the discovery date shape.
		date: {
			value: row.date.value,
			isoLike: row.date.isoLike,
			display: row.date.display,
			absoluteDayIndex: row.date.absoluteDayIndex,
		},
	}));
}

/**
 * Collect the actor-visible TIMELINE-LINK events (campaign calendar links by reference, SES-012) dated in
 * the calendar. Composes the existing actor-filtered continuity read: a link to a hidden/deleted target
 * ALREADY degrades to `unavailable` there. We surface ONLY the DM-authored label (never the target name),
 * which is safe to show to anyone the link reaches — the existence of the dated marker is itself DM-authored.
 */
function timelineLinkEvents(
	links: CalendarLinkView[],
	calendarId: string,
): CalendarDiscoveryEvent[] {
	const events: CalendarDiscoveryEvent[] = [];
	for (const link of links) {
		if (link.date.value.calendarId !== calendarId) continue;
		events.push({
			id: link.id,
			source: 'timeline-link',
			// The DM-authored label is safe to show; we never expose `targetTitle` (which is null for a
			// hidden/deleted target anyway). This keeps the discovery surface no-leak by construction.
			title: link.label,
			date: {
				value: link.date.value,
				isoLike: link.date.isoLike,
				display: link.date.display,
				absoluteDayIndex: link.date.absoluteDayIndex,
			},
		});
	}
	return events;
}

/**
 * Collect the SESSION CHRONOLOGY events (the archived sessions of the campaign) for the actor. Session
 * archives are a DM surface (mirroring the SES-012 session-link rule), so this returns rows ONLY for the
 * DM; a non-DM receives none (fail closed — a player never learns the session chronology through search).
 *
 * Each archive that is anchored to the campaign current date OR carries no date is dated by the campaign
 * date AT ARCHIVE TIME when available; archives with no derivable custom date are omitted from the dated
 * discovery surface (they cannot be range-filtered). The archive id is the stable event id.
 */
function sessionChronologyEvents(
	session: SessionState,
	calendar: CalendarDefinition,
	calendarId: string,
	isDm: boolean,
	format: CalendarDateFormat,
): CalendarDiscoveryEvent[] {
	if (!isDm) return [];
	const events: CalendarDiscoveryEvent[] = [];
	for (const archive of Object.values(session.archives) as SessionArchiveSnapshot[]) {
		// A session archive is dated by the campaign date it was archived against, when that date is in
		// this calendar. Archives without a derivable in-calendar date are not part of the dated surface.
		const date = sessionArchiveDate(session, archive, calendarId);
		if (!date) continue;
		events.push({
			id: archive.id,
			source: 'session',
			title: `Session ${archive.id}`,
			date: formatDate(calendar, date, format),
		});
	}
	return events;
}

/**
 * The custom date a session archive is anchored to: the campaign current date, when it is expressed in the
 * searched calendar. The campaign current date is the continuity thread across sessions (SES-012), so an
 * archived session is chronologically placed at the campaign date that was current when it was archived.
 * Returns `null` when no in-calendar campaign date is available (the archive is not part of the dated surface).
 */
function sessionArchiveDate(
	session: SessionState,
	_archive: SessionArchiveSnapshot,
	calendarId: string,
): CustomDate | null {
	const current = session.calendarContinuity.currentDate;
	if (current && current.calendarId === calendarId) return current;
	return null;
}

/**
 * SRCH-010 — the single actor-filtered CALENDAR / CUSTOM-TIME DISCOVERY read. Composes the existing
 * actor-filtered content-timeline (CONTENT-011), campaign-continuity (SES-012), and session-chronology
 * sources, applies the inclusive date-range + text filter, and returns deterministically ordered events
 * with stable formatted dates. ONLY actor-visible events appear, and the counts are computed over that
 * same visible set, so hidden events are omitted AND never revealed by an inflated count (SRCH-010 AC2).
 *
 * AC1 — a visible event with a custom date in the filtered range appears with stable date formatting:
 * its date is rendered through the pure CONTENT-011 formatter, identical to every other surface.
 *
 * Pure + deterministic. An unknown/unauthenticated actor or a missing calendar yields an empty result.
 */
export function searchCalendarTimeForActor(
	session: SessionState,
	content: VaultContentState,
	maps: MapState,
	permissions: PermissionState,
	actorId: string,
	filter: CalendarDiscoveryFilter,
	format: CalendarDateFormat = 'medium',
): CalendarDiscoveryResult {
	const emptyCounts: Record<CalendarEventSource, number> = {
		content: 0,
		'timeline-link': 0,
		session: 0,
	};
	const actor = permissions.actors[actorId];
	const calendar = content.calendars[filter.calendarId];
	// Fail closed: unknown actor OR missing calendar ⇒ an empty, calendar-less result (no leak).
	if (!actor || !calendar) {
		return {
			calendarId: filter.calendarId,
			calendarKnown: !!calendar,
			events: [],
			totalCount: 0,
			countsBySource: { ...emptyCounts },
			appliedRange: null,
		};
	}

	const isDm = hasDmAuthority(actor.role);
	const sources = new Set(filter.sources ?? CALENDAR_EVENT_SOURCES);
	const needle = (filter.query ?? '').trim().toLowerCase();

	// Each source read is ALREADY actor-filtered, so visibility is decided before discovery sees anything.
	const candidates: CalendarDiscoveryEvent[] = [];
	if (sources.has('content')) {
		candidates.push(...contentEvents(content, permissions, actorId, filter.calendarId, format));
	}
	if (sources.has('timeline-link')) {
		const continuity = getCalendarContinuityForActor(
			session,
			content,
			maps,
			permissions,
			actorId,
			format,
		);
		candidates.push(...timelineLinkEvents(continuity.links, filter.calendarId));
	}
	if (sources.has('session')) {
		candidates.push(
			...sessionChronologyEvents(session, calendar, filter.calendarId, isDm, format),
		);
	}

	const events = candidates
		.filter((event) => dateInRange(calendar, event.date.value, filter.range))
		.filter((event) => matchesQuery(event.title, needle))
		.sort(compareDiscoveryEvents);

	const countsBySource: Record<CalendarEventSource, number> = { ...emptyCounts };
	for (const event of events) countsBySource[event.source] += 1;

	const appliedRange = filter.range
		? {
				from: filter.range.from ? formatDate(calendar, filter.range.from, format) : null,
				to: filter.range.to ? formatDate(calendar, filter.range.to, format) : null,
			}
		: null;

	return {
		calendarId: filter.calendarId,
		calendarKnown: true,
		events,
		totalCount: events.length,
		countsBySource,
		appliedRange,
	};
}

/**
 * Deterministic ordering for discovered events: by absolute day index ascending, then by source (a stable
 * source order), then by id. Equal dates always order identically across repeated runs and fresh fixtures
 * (SRCH-005 stable tie-breaks; applied here so the discovery list is reproducible).
 */
function compareDiscoveryEvents(a: CalendarDiscoveryEvent, b: CalendarDiscoveryEvent): number {
	const ai = a.date.absoluteDayIndex;
	const bi = b.date.absoluteDayIndex;
	if (ai === null || bi === null) {
		if (ai !== bi) return ai === null ? 1 : -1; // invalid dates sort last, deterministically
	} else if (ai !== bi) {
		return ai - bi;
	}
	const sourceOrder = CALENDAR_EVENT_SOURCES.indexOf(a.source) - CALENDAR_EVENT_SOURCES.indexOf(b.source);
	if (sourceOrder !== 0) return sourceOrder;
	return a.id.localeCompare(b.id);
}
