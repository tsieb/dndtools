import type { ActorId } from './ids';
import type { CustomDate } from './calendar';

/**
 * SES-012 — durable CAMPAIGN CALENDAR CONTINUITY state: the current campaign date + the LINKS from
 * campaign dates to notes, sessions, maps, events, and handouts.
 *
 * This is CAMPAIGN-level continuity, NOT per-session live state. It deliberately lives alongside the
 * session document but is NEVER reset when a session workflow transitions (the live combat/dice/handout
 * fields reset between sessions; the campaign calendar does not — it is the continuity thread across
 * sessions). The DATE arithmetic + stable formatting are owned by `state/calendar.ts` (CONTENT-011); this
 * module stores the campaign's CURRENT DATE and a set of dated LINKS, and never re-implements calendar math.
 *
 * Links are BY REFERENCE (Architecture Contract 4 "Embed, Link, and Project Rules"): a link stores ONLY
 * the target's `kind` + `targetId` + the anchoring `date` (+ a DM-authored label). It NEVER clones the
 * target's title/body/content. The actor-filtered read (`queries/calendar-continuity-query.ts`) resolves
 * each reference against the LIVE target through the existing actor-filtered reads, so:
 *
 *   - a link to a target the viewer cannot see (hidden) degrades to `unavailable` (no leak), and
 *   - a link to a now-deleted/missing target degrades to the SAME `unavailable` (indistinguishable).
 *
 * Pure data + pure reducers. No GUI, no storage. The command handlers compose these; durable writes go
 * through the op-log (Contract 1). A link is player-safe (SES-012 is Player-safe: yes) — but only the
 * REFERENCE is durable; whether a viewer sees the linked content is decided at read time, fail closed.
 */

export const CALENDAR_CONTINUITY_SCHEMA_VERSION = 1 as const;

/**
 * The kind of entity a calendar link references. Each kind resolves through the matching actor-filtered
 * read at link-resolution time, so a link shows only a target the viewer may see and degrades otherwise.
 */
export type CalendarLinkTargetKind = 'note' | 'session' | 'map' | 'event' | 'handout';

export const CALENDAR_LINK_TARGET_KINDS: readonly CalendarLinkTargetKind[] = Object.freeze([
	'note',
	'session',
	'map',
	'event',
	'handout',
]);

/**
 * One durable LINK from a campaign date to a target entity, BY REFERENCE. Stores only the reference
 * (kind + target id) + the anchoring custom date + a DM-authored label — never a copy of the target's
 * content. `targetId` is null for a bare dated `session`/`event` marker that references no concrete entity.
 */
export interface CalendarLink {
	id: string;
	kind: CalendarLinkTargetKind;
	/** A short DM-authored label for the link (does NOT leak target content; safe to show to anyone). */
	label: string;
	/** The custom-calendar date this link is anchored to. */
	date: CustomDate;
	/**
	 * The referenced target's id. For `note`/`event` this is a content-item id; for `map` a map id; for
	 * `handout` a session handout id; for `session` a session-archive id. Null ⇒ a bare dated marker that
	 * references no concrete entity (it always resolves as an available marker, never a leak).
	 */
	targetId: string | null;
	createdBy: ActorId;
	createdAt: string;
	revision: number;
}

/** The durable campaign calendar continuity slice: a current date + dated links by reference. */
export interface CalendarContinuityState {
	/**
	 * The campaign's CURRENT DATE, in campaign calendar terms (a structural {@link CustomDate}). Null when
	 * the DM has not set a campaign date yet. Stored in calendar terms; the canonical/stable rendering is
	 * derived by the CONTENT-011 formatter at read time (never stored as a formatted string).
	 */
	currentDate: CustomDate | null;
	/** Links from dates to notes/sessions/maps/events/handouts, keyed by link id (by reference). */
	links: Record<string, CalendarLink>;
	/** Monotonic revision over the campaign date (bumped each time the current date is set). */
	dateRevision: number;
	schemaVersion: typeof CALENDAR_CONTINUITY_SCHEMA_VERSION;
}

export const EMPTY_CALENDAR_CONTINUITY_STATE: CalendarContinuityState = Object.freeze({
	currentDate: null,
	links: {},
	dateRevision: 0,
	schemaVersion: CALENDAR_CONTINUITY_SCHEMA_VERSION,
});

/**
 * Hydrate the calendar-continuity slice fail-closed. A session document persisted before this slice
 * existed restores with no current date and no links (never undefined) — safe-default hydration, no
 * destructive migration.
 */
export function ensureCalendarContinuityState(
	state: CalendarContinuityState | undefined,
): CalendarContinuityState {
	return {
		currentDate: state?.currentDate ?? null,
		links: state?.links ?? {},
		dateRevision: state?.dateRevision ?? 0,
		schemaVersion: CALENDAR_CONTINUITY_SCHEMA_VERSION,
	};
}

/** Set the campaign current date (in calendar terms), bumping the date revision. Pure. */
export function setCampaignDate(
	state: CalendarContinuityState,
	date: CustomDate,
): CalendarContinuityState {
	return {
		...state,
		currentDate: { ...date },
		dateRevision: state.dateRevision + 1,
	};
}

/** Add a durable calendar link by reference. Pure. */
export function addCalendarLink(
	state: CalendarContinuityState,
	link: CalendarLink,
): CalendarContinuityState {
	return { ...state, links: { ...state.links, [link.id]: link } };
}

/** Remove a calendar link by id (no-op when absent). Pure. */
export function removeCalendarLink(
	state: CalendarContinuityState,
	linkId: string,
): CalendarContinuityState {
	if (!state.links[linkId]) return state;
	const links = { ...state.links };
	delete links[linkId];
	return { ...state, links };
}

/** A calendar link by id, or undefined. Pure. */
export function calendarLinkById(
	state: CalendarContinuityState,
	linkId: string,
): CalendarLink | undefined {
	return state.links[linkId];
}
