import type { PermissionState } from '../state/permission-state';
import type { SessionState } from '../state/session-state';
import type { VaultContentState } from '../state/content';
import type { MapState } from '../state/map-state';
import type { CalendarDateFormat } from '../state/calendar';
import {
	buildDateGraphIndex,
	relatedDatesForEntity,
	GRAPH_DATES_SCHEMA_VERSION,
	type DateGraphIndex,
	type DateIndexEntry,
	type DateRelationships,
} from '../state/graph-dates';
import { getContentItemsForActor, type ContentItemView } from './content-query';
import { getCalendarContinuityForActor } from './calendar-continuity-query';

/**
 * GRAPH-009 — the ACTOR-FILTERED CALENDAR / CUSTOM-TIME GRAPH API: it indexes the date references VISIBLE
 * content carries (note/object date fields + timeline references) and the visible campaign timeline links,
 * and exposes the date RELATIONSHIPS (same-date co-occurrence + timeline references) through the same
 * visibility-filtered graph API navigation, search, session prep/recap, and MCP bundle tools consume.
 *
 * This is the single choke-point that feeds the pure {@link buildDateGraphIndex} engine ONLY the date
 * references the actor may see. It is built ENTIRELY on the EXISTING actor-filtered date reads, NOT a
 * second calendar index:
 *
 *   - DATED CONTENT (note/object date fields + timeline references) ← {@link getContentItemsForActor}
 *     (CONTENT-011). A `dm-only` / `shared`-but-undelivered / soft-deleted dated note never enters the
 *     set, so it can never be a dated node, a same-date neighbour, or a timeline-reference target. A
 *     timeline reference's `targetId` is ALREADY visibility-resolved to `null` there when the target is
 *     hidden, so a reference edge never resolves to a hidden target.
 *   - TIMELINE LINKS (campaign calendar links by reference) ← {@link getCalendarContinuityForActor}
 *     (SES-012). A link to a hidden/deleted target ALREADY degrades to `status: 'unavailable'` there; we
 *     surface ONLY the DM-authored label as a dated node and create a reference EDGE only when the target
 *     resolved as `available` (visible) AND is itself a visible node — so a hidden calendar-linked event
 *     AND its relationship edge are absent (GRAPH-009 AC2).
 *
 * Because every input is drawn from an actor-filtered read, the data layer decided visibility BEFORE the
 * date graph sees anything (Cross-Contract Non-Negotiable 2). An unknown/unauthenticated actor receives an
 * EMPTY index (fail closed). The index a player sees and the index the DM sees over the same vault differ
 * ONLY by which dated entities are visible.
 *
 * Pure + deterministic: the same (content, session, permissions, actor[, format]) always returns the same
 * index. Date arithmetic + stable formatting are owned by `state/calendar.ts` (CONTENT-011) — never
 * re-derived here. The Processing Core owns the relationship algorithm; the GUI/navigation renders the
 * computed model (Architecture Contract 1).
 */

/** The fail-closed EMPTY index (an unknown actor, or a vault with no visible dated entities). */
function emptyIndex(): DateGraphIndex {
	return { schemaVersion: GRAPH_DATES_SCHEMA_VERSION, nodes: [], edges: [] };
}

/**
 * Collect the DATE INDEX ENTRIES one visible content item contributes: one entry per named custom-date
 * FIELD and one per TIMELINE REFERENCE. The item is actor-visible, and each timeline reference's
 * `targetId` is ALREADY visibility-gated to null by the content view when the target is hidden — so a
 * reference edge can never reach a hidden target. The item's earliest field date also anchors it as a
 * dated node. Pure.
 */
function contentDateEntries(item: ContentItemView): DateIndexEntry[] {
	const entries: DateIndexEntry[] = [];
	// One entry per DATE FIELD: the item participates in same-date relationships for each date it carries.
	for (const field of Object.values(item.dateFields)) {
		entries.push({
			entityId: item.id,
			kind: 'content',
			title: item.title,
			calendarId: field.value.calendarId,
			isoLike: field.isoLike,
			absoluteDayIndex: field.absoluteDayIndex,
			display: field.display,
			// A date FIELD references no concrete timeline target; only timeline references carry a target.
			targetId: null,
		});
	}
	// One entry per TIMELINE REFERENCE: it carries its own date AND an optional resolved (visible) target.
	for (const ref of item.timelineRefs) {
		entries.push({
			entityId: item.id,
			kind: 'content',
			title: item.title,
			calendarId: ref.date.value.calendarId,
			isoLike: ref.date.isoLike,
			absoluteDayIndex: ref.date.absoluteDayIndex,
			display: ref.date.display,
			// The content view already set `targetId` to null when the referenced item is not visible.
			targetId: ref.targetId,
		});
	}
	return entries;
}

/**
 * GRAPH-009 — build the ACTOR-FILTERED date index entries: every VISIBLE content item's date fields +
 * timeline references, plus the visible campaign TIMELINE LINKS (SES-012). A timeline link contributes a
 * `timeline-link` node, and a `targetId` is attached ONLY when the link resolved as `available` (the
 * target is visible) — so a hidden calendar-linked event's edge is absent (GRAPH-009 AC2). Pure.
 */
function buildDateEntriesForActor(
	content: VaultContentState,
	session: SessionState | undefined,
	maps: MapState,
	permissions: PermissionState,
	actorId: string,
	format: CalendarDateFormat,
): DateIndexEntry[] {
	const entries: DateIndexEntry[] = [];
	for (const item of getContentItemsForActor(content, permissions, actorId, format)) {
		entries.push(...contentDateEntries(item));
	}
	if (session) {
		const continuity = getCalendarContinuityForActor(
			session,
			content,
			maps,
			permissions,
			actorId,
			format,
		);
		for (const link of continuity.links) {
			entries.push({
				entityId: link.id,
				kind: 'timeline-link',
				// The DM-authored label is safe to show; we never expose the resolved target's title here.
				title: link.label,
				calendarId: link.date.value.calendarId,
				isoLike: link.date.isoLike,
				absoluteDayIndex: link.date.absoluteDayIndex,
				display: link.date.display,
				// FAIL CLOSED: only attach the target id when the link resolved as AVAILABLE (visible). An
				// `unavailable` link (hidden/deleted target) contributes the dated marker but NO reference edge,
				// so the hidden event and its edge are absent (GRAPH-009 AC2).
				targetId: link.status === 'available' ? link.targetId : null,
			});
		}
	}
	return entries;
}

/**
 * GRAPH-009 — the actor-filtered CALENDAR / CUSTOM-TIME GRAPH INDEX: the visible dated nodes + the date
 * relationship edges (same-date co-occurrence + timeline references) between them. Every node is a visible
 * dated entity and every edge connects two visible nodes, so no hidden event or edge appears (AC1 visible
 * date relationships queryable; AC2 hidden event + edge absent). An unknown actor yields the empty index
 * (fail closed). Pure + deterministic.
 */
export function getDateGraphIndexForActor(
	content: VaultContentState,
	session: SessionState | undefined,
	maps: MapState,
	permissions: PermissionState,
	actorId: string,
	format: CalendarDateFormat = 'medium',
): DateGraphIndex {
	if (!permissions.actors[actorId]) return emptyIndex();
	const entries = buildDateEntriesForActor(content, session, maps, permissions, actorId, format);
	return buildDateGraphIndex(entries);
}

/**
 * GRAPH-009 — the DATE RELATIONSHIPS for ONE entity, exposed through the actor-filtered graph API: the
 * visible entities it shares a date with, the visible timeline targets it references, and the visible
 * entities that reference it. A hidden/deleted/undated entity (one not in the visible index) yields the
 * generic empty relationships with `node: null` — indistinguishable from "no date relationships", so a
 * player can never probe a date reference to learn a hidden event exists (AC2, fail closed). Pure +
 * deterministic.
 */
export function getDateRelationshipsForActor(
	content: VaultContentState,
	session: SessionState | undefined,
	maps: MapState,
	permissions: PermissionState,
	actorId: string,
	entityId: string,
	format: CalendarDateFormat = 'medium',
): DateRelationships {
	const index = getDateGraphIndexForActor(content, session, maps, permissions, actorId, format);
	return relatedDatesForEntity(index, entityId);
}
