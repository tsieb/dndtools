import { hasDmAuthority } from '../state/permission-state';
import type { PermissionState } from '../state/permission-state';
import type { SessionState } from '../state/session-state';
import type { CalendarLink, CalendarLinkTargetKind } from '../state/calendar-continuity';
import type { VaultContentState } from '../state/content';
import type { MapState } from '../state/map-state';
import type {
	CalendarDateFormat,
	CalendarDefinition,
	CustomDate,
} from '../state/calendar';
import { absoluteDayIndex, formatCustomDate } from '../state/calendar';
import { getContentItemDetailForActor } from './content-query';
import { getMapViewForActor } from './map-query';
import { getHandoutForActor } from './handout-query';

/**
 * SES-012 — THE single actor-filtered CAMPAIGN CALENDAR CONTINUITY read model.
 *
 * The DM links campaign DATES to notes/sessions/maps/events/handouts BY REFERENCE; this read resolves each
 * link against the LIVE target through the EXISTING actor-filtered queries (Cross-Contract Non-Negotiable
 * 2), so a link surfaces only a target the viewer may see and otherwise degrades fail-closed:
 *
 *   - A link whose target is HIDDEN or DELETED/MISSING degrades to an `unavailable` link — the link's
 *     DM-authored label + the formatted date still render (the DM authored them, and a bare label leaks no
 *     target content), but NO target title/name is exposed. Hidden and deleted are INDISTINGUISHABLE.
 *   - A bare dated marker (`session`/`event` with no target id) always resolves as `available` — it
 *     references no concrete entity, so there is nothing to leak.
 *   - A `session` archive link is DM-only (session archives are a DM surface): it degrades to `unavailable`
 *     for a non-DM.
 *
 * The current campaign date + the linked upcoming/past events feed the prep/recap digest (SES-009). Pure +
 * deterministic: a function of (session, content, maps, permissions, actor[, format]) only. No GUI, no
 * storage. Date arithmetic + formatting are owned by `state/calendar.ts` (CONTENT-011) — never re-derived.
 */

/** A custom date projected to a surface: the structural value + its stable formatted strings. */
export interface ContinuityDateView {
	value: CustomDate;
	/** The canonical machine-stable sort/equality key (`YYYY-MM-DD`). */
	isoLike: string;
	/** The human display string in the requested format (stable, locale-independent). */
	display: string;
	/** The absolute day index from the calendar epoch — the ordering key. `null` when invalid/unknown. */
	absoluteDayIndex: number | null;
}

/** One resolved calendar link as projected to an actor. */
export interface CalendarLinkView {
	id: string;
	kind: CalendarLinkTargetKind;
	/** The DM-authored label (safe to show; never derived from target content). */
	label: string;
	date: ContinuityDateView;
	targetId: string | null;
	/** `available` ⇒ the target resolved and is visible; `unavailable` ⇒ hidden/deleted/missing (no leak). */
	status: 'available' | 'unavailable';
	/** The resolved target's title/name, present ONLY when `status` is `available` AND a target exists. */
	targetTitle: string | null;
}

/** The actor-filtered campaign calendar continuity view. */
export interface CalendarContinuityView {
	/** The campaign current date, formatted, or null when unset. */
	currentDate: ContinuityDateView | null;
	/** The resolved links, ordered by date (ascending) then id (deterministic). */
	links: CalendarLinkView[];
}

/** Format a custom date against its calendar (or a stable sentinel when the calendar is unknown). */
function formatDate(
	content: VaultContentState,
	date: CustomDate,
	format: CalendarDateFormat,
): ContinuityDateView {
	const calendar: CalendarDefinition | undefined = content.calendars[date.calendarId];
	if (!calendar) {
		return { value: date, isoLike: 'Unknown calendar', display: 'Unknown calendar', absoluteDayIndex: null };
	}
	return {
		value: date,
		isoLike: formatCustomDate(calendar, date, 'iso-like'),
		display: formatCustomDate(calendar, date, format),
		absoluteDayIndex: absoluteDayIndex(calendar, date),
	};
}

interface ResolveInputs {
	session: SessionState;
	content: VaultContentState;
	maps: MapState;
	permissions: PermissionState;
	actorId: string;
	isDm: boolean;
}

/**
 * Resolve ONE link's target through the matching actor-filtered read. Returns the target's visible
 * title/name, or null when the target is hidden/deleted/missing (the caller degrades to `unavailable`).
 * A null target id (bare marker) resolves to `{ available: true, title: null }`.
 */
function resolveTarget(
	link: CalendarLink,
	inputs: ResolveInputs,
): { available: boolean; title: string | null } {
	if (link.targetId === null) {
		// A bare dated marker references no concrete entity — always available, nothing to leak.
		return { available: true, title: null };
	}
	switch (link.kind) {
		case 'note':
		case 'event': {
			const detail = getContentItemDetailForActor(
				inputs.content,
				inputs.permissions,
				inputs.actorId,
				link.targetId,
			);
			if (!('visible' in detail) || detail.visible !== true) return { available: false, title: null };
			return { available: true, title: detail.title };
		}
		case 'map': {
			const view = getMapViewForActor(inputs.maps, inputs.permissions, inputs.actorId, link.targetId);
			if (view.kind !== 'available') return { available: false, title: null };
			return { available: true, title: view.name };
		}
		case 'handout': {
			const handout = getHandoutForActor(
				inputs.session,
				inputs.permissions,
				inputs.actorId,
				link.targetId,
			);
			if (handout.kind !== 'available') return { available: false, title: null };
			return { available: true, title: handout.title };
		}
		case 'session': {
			// Session archives are a DM surface: only the DM resolves a session-archive link, and only when
			// the archive still exists. A non-DM (or a missing archive) degrades to unavailable (no leak).
			if (!inputs.isDm) return { available: false, title: null };
			const archive = inputs.session.archives[link.targetId];
			if (!archive) return { available: false, title: null };
			return { available: true, title: null };
		}
	}
}

/** Resolve ONE link for an actor against the live, actor-filtered target. */
export function resolveCalendarLinkForActor(
	link: CalendarLink,
	session: SessionState,
	content: VaultContentState,
	maps: MapState,
	permissions: PermissionState,
	actorId: string,
	format: CalendarDateFormat = 'medium',
): CalendarLinkView {
	const actor = permissions.actors[actorId];
	const isDm = hasDmAuthority(actor?.role);
	const resolved = actor
		? resolveTarget(link, { session, content, maps, permissions, actorId, isDm })
		: { available: false, title: null };
	return {
		id: link.id,
		kind: link.kind,
		label: link.label,
		date: formatDate(content, link.date, format),
		targetId: link.targetId,
		status: resolved.available ? 'available' : 'unavailable',
		targetTitle: resolved.available ? resolved.title : null,
	};
}

/**
 * SES-012 — the actor-filtered campaign calendar continuity view: the current campaign date + every link
 * resolved against its live target. Links are ordered by date (ascending) then id (deterministic). An
 * unknown/unauthenticated actor receives an empty view (fail closed). Hidden/deleted targets degrade to
 * `unavailable` links (no leak); the link itself always appears (the DM authored it).
 */
export function getCalendarContinuityForActor(
	session: SessionState,
	content: VaultContentState,
	maps: MapState,
	permissions: PermissionState,
	actorId: string,
	format: CalendarDateFormat = 'medium',
): CalendarContinuityView {
	const actor = permissions.actors[actorId];
	if (!actor) return { currentDate: null, links: [] };

	const continuity = session.calendarContinuity;
	const currentDate = continuity.currentDate
		? formatDate(content, continuity.currentDate, format)
		: null;

	const links = Object.values(continuity.links)
		.map((link) =>
			resolveCalendarLinkForActor(link, session, content, maps, permissions, actorId, format),
		)
		.sort((a, b) => {
			const ai = a.date.absoluteDayIndex;
			const bi = b.date.absoluteDayIndex;
			if (ai === null || bi === null) return a.id.localeCompare(b.id);
			if (ai !== bi) return ai - bi;
			return a.id.localeCompare(b.id);
		});

	return { currentDate, links };
}

/**
 * SES-012 — partition the calendar links relative to the campaign current date into PAST and UPCOMING,
 * for the prep/recap continuity context. A link on/after the current date is `upcoming`; a link strictly
 * before is `past`. When no current date is set, every link is `upcoming` (nothing has happened yet).
 * Both lists keep the deterministic date-ascending order of {@link getCalendarContinuityForActor}.
 */
export interface CalendarContextView {
	currentDate: ContinuityDateView | null;
	past: CalendarLinkView[];
	upcoming: CalendarLinkView[];
}

export function getCalendarContextForActor(
	session: SessionState,
	content: VaultContentState,
	maps: MapState,
	permissions: PermissionState,
	actorId: string,
	format: CalendarDateFormat = 'medium',
): CalendarContextView {
	const view = getCalendarContinuityForActor(session, content, maps, permissions, actorId, format);
	const currentIndex = view.currentDate?.absoluteDayIndex ?? null;
	const past: CalendarLinkView[] = [];
	const upcoming: CalendarLinkView[] = [];
	for (const link of view.links) {
		const li = link.date.absoluteDayIndex;
		if (currentIndex === null || li === null || li >= currentIndex) {
			upcoming.push(link);
		} else {
			past.push(link);
		}
	}
	return { currentDate: view.currentDate, past, upcoming };
}
