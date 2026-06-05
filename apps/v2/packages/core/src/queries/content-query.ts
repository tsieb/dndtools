import type { Actor, PermissionState } from '../state/permission-state';
import type { ContentItem, TimelineReference, VaultContentState } from '../state/content';
import { CONTENT_ITEM_ENTITY_TYPE, contentItemVisibilityMetadata, isLiveContentItem } from '../state/content';
import type {
	CalendarDateFormat,
	CalendarDefinition,
	CustomDate,
} from '../state/calendar';
import {
	absoluteDayIndex,
	compareCustomDates,
	formatCustomDate,
} from '../state/calendar';
import { hasGrantedCapability } from '../permissions/grants';
import { filterEntityForActor } from '../permissions/visibility-filter';

/**
 * CONTENT-011 — THE single actor-filtered CONTENT read model. The data layer decides per-item
 * visibility BEFORE any content is returned to ANY surface (note, graph, search, session recap —
 * Contract 3 Axis 1 / Cross-Contract Non-Negotiable 2), so every surface consumes THIS, never the raw
 * {@link VaultContentState}. Because there is exactly ONE filtered read path, a `dm-only` dated note
 * CANNOT leak into a calendar/timeline view on one surface while being blocked on another
 * (CONTENT-011 AC1 cross-surface consistency + AC2 visibility policy).
 *
 * Two things are enforced here, both fail-closed and deterministic:
 *
 *   1. PER-ITEM VISIBILITY (CONTENT-009/011): each item is checked against its OWN canonical
 *      visibility (`dm-only` / `player-visible` / `shared`). A hidden item is OMITTED ENTIRELY — no
 *      title, body, dates, or id appears — so a player who cannot see a dated note has that event
 *      omitted from calendar/timeline views (CONTENT-011 AC2). The DM sees everything.
 *   2. STABLE DATE FORMATTING (CONTENT-011 AC1): every projected date is rendered by the PURE calendar
 *      formatter (no locale/clock/timezone), so the formatted date is identical across surfaces.
 */

/** A custom date as projected to a surface: the structural value + its stable formatted strings. */
export interface FormattedDateView {
	value: CustomDate;
	/** The canonical machine-stable sort/equality key (`YYYY-MM-DD`). */
	isoLike: string;
	/** The human display string in the requested format (stable, locale-independent). */
	display: string;
	/** The absolute day index from the calendar epoch — the ordering key. `null` when invalid. */
	absoluteDayIndex: number | null;
}

/** A timeline reference as projected to a surface: its label, formatted date, and resolved target. */
export interface TimelineReferenceView {
	id: string;
	label: string;
	date: FormattedDateView;
	/** The referenced timeline-event item id, when present AND visible to this actor; else `null`. */
	targetId: string | null;
}

/** A content item as projected to an actor. For a non-DM result this is always a visible item. */
export interface ContentItemView {
	id: string;
	kind: ContentItem['kind'];
	title: string;
	body: string;
	fields: Record<string, unknown>;
	dateFields: Record<string, FormattedDateView>;
	timelineRefs: TimelineReferenceView[];
	visibility: ContentItem['visibility'];
	authorActorId: string;
	updatedAt: string;
	revision: number;
}

/**
 * Whether ONE item is visible to an actor (the per-item visibility check) AND live. Fail closed
 * otherwise. A SOFT-DELETED (tombstoned) item is omitted from EVERY actor-filtered read — even the DM's
 * — so a deleted note never appears in a list/calendar/search result until it is restored (CONTENT-001
 * AC2/AC4). The DM reaches tombstoned items only through the explicit recycle-bin query.
 */
function itemVisibleToActor(
	item: ContentItem,
	actor: Actor,
	permissions: PermissionState,
): boolean {
	if (!isLiveContentItem(item)) return false;
	if (actor.role === 'dm') return true;
	if (item.visibility === 'dm-only') return false;
	if (item.visibility === 'player-visible') return actor.role === 'player' || actor.role === 'observer';
	// `shared`: delivered only through an explicit channel — `sharedWith` membership OR a viewer grant
	// on the content-item entity (mirrors the PERM visibility filter's `shared` rule).
	if (item.sharedWith.includes(actor.id)) return true;
	return hasGrantedCapability(permissions, actor, CONTENT_ITEM_ENTITY_TYPE, item.id, 'viewer');
}

/** Build the stable formatted view of a custom date against its calendar (or a sentinel when absent). */
function formatDate(
	content: VaultContentState,
	date: CustomDate,
	format: CalendarDateFormat,
): FormattedDateView {
	const calendar: CalendarDefinition | undefined = content.calendars[date.calendarId];
	if (!calendar) {
		// A date whose calendar is unknown renders a stable sentinel rather than guessing Gregorian.
		return { value: date, isoLike: 'Unknown calendar', display: 'Unknown calendar', absoluteDayIndex: null };
	}
	return {
		value: date,
		isoLike: formatCustomDate(calendar, date, 'iso-like'),
		display: formatCustomDate(calendar, date, format),
		absoluteDayIndex: absoluteDayIndex(calendar, date),
	};
}

function projectItem(
	content: VaultContentState,
	item: ContentItem,
	format: CalendarDateFormat,
	visibleIds: ReadonlySet<string>,
): ContentItemView {
	const dateFields: Record<string, FormattedDateView> = {};
	for (const [name, date] of Object.entries(item.dateFields)) {
		dateFields[name] = formatDate(content, date, format);
	}
	const timelineRefs: TimelineReferenceView[] = item.timelineRefs.map((ref: TimelineReference) => ({
		id: ref.id,
		label: ref.label,
		date: formatDate(content, ref.date, format),
		// A timeline target id is only exposed when the target item itself is visible to this actor —
		// never leak the existence of a hidden item through a reference (fail closed).
		targetId: ref.targetId !== undefined && visibleIds.has(ref.targetId) ? ref.targetId : null,
	}));
	return {
		id: item.id,
		kind: item.kind,
		title: item.title,
		body: item.body,
		fields: { ...item.fields },
		dateFields,
		timelineRefs,
		visibility: item.visibility,
		authorActorId: item.authorActorId,
		updatedAt: item.updatedAt,
		revision: item.revision,
	};
}

/**
 * CONTENT-011 — the actor-filtered list of content items. Returns ONLY the items the actor may see,
 * each with stable formatted dates. An unknown/unauthenticated actor receives an empty list (fail
 * closed). Items are otherwise returned in stable id order (the caller may re-sort by date).
 */
export function getContentItemsForActor(
	content: VaultContentState,
	permissions: PermissionState,
	actorId: string,
	format: CalendarDateFormat = 'medium',
): ContentItemView[] {
	const actor = permissions.actors[actorId];
	if (!actor) return [];
	const visible = Object.values(content.items)
		.filter((item) => itemVisibleToActor(item, actor, permissions))
		.sort((a, b) => a.id.localeCompare(b.id));
	const visibleIds = new Set(visible.map((item) => item.id));
	return visible.map((item) => projectItem(content, item, format, visibleIds));
}

/** A single dated-event row for a calendar/timeline view, derived from a visible item's earliest date. */
export interface CalendarEventView {
	itemId: string;
	title: string;
	date: FormattedDateView;
}

/**
 * CONTENT-011 — the actor-filtered CALENDAR/TIMELINE view for ONE calendar: every visible item that
 * carries a date in that calendar, as dated rows ORDERED deterministically by absolute day index
 * (CONTENT-011 AC1 ordering, AC2 visibility). A player who cannot see a dated item has that event
 * OMITTED ENTIRELY — it never appears in the timeline (AC2). Rows come from both date fields and
 * timeline references, deduped per item to its earliest date in the calendar.
 */
export function getCalendarTimelineForActor(
	content: VaultContentState,
	permissions: PermissionState,
	actorId: string,
	calendarId: string,
	format: CalendarDateFormat = 'medium',
): CalendarEventView[] {
	const calendar = content.calendars[calendarId];
	if (!calendar) return [];
	const actor = permissions.actors[actorId];
	if (!actor) return [];

	const rows: CalendarEventView[] = [];
	for (const item of Object.values(content.items)) {
		if (!itemVisibleToActor(item, actor, permissions)) continue;
		const dates: CustomDate[] = [
			...Object.values(item.dateFields),
			...item.timelineRefs.map((ref) => ref.date),
		].filter((date) => date.calendarId === calendarId);
		if (dates.length === 0) continue;
		// Use the item's EARLIEST in-calendar date as its timeline anchor (deterministic).
		const earliest = dates.reduce((best, candidate) => {
			const cmp = compareCustomDates(calendar, candidate, best);
			return cmp !== null && cmp < 0 ? candidate : best;
		}, dates[0]!);
		rows.push({ itemId: item.id, title: item.title, date: formatDate(content, earliest, format) });
	}

	return rows.sort((a, b) => {
		const ai = a.date.absoluteDayIndex;
		const bi = b.date.absoluteDayIndex;
		if (ai === null || bi === null) return a.itemId.localeCompare(b.itemId);
		if (ai !== bi) return ai - bi;
		// Stable tie-break by id so equal dates always order identically across surfaces.
		return a.itemId.localeCompare(b.itemId);
	});
}

/**
 * Whether an actor may AUTHOR content items (the DM). Used by the GUI to decide whether to render the
 * content authoring affordances; the command layer re-checks fail-closed.
 */
export function actorCanAuthorContent(permissions: PermissionState, actorId: string): boolean {
	const actor = permissions.actors[actorId];
	return !!actor && actor.role === 'dm';
}

/** A soft-deleted item as projected to the DM recycle bin: just enough to identify and restore it. */
export interface DeletedContentItemView {
	id: string;
	kind: ContentItem['kind'];
	title: string;
	deletedAt: string;
	revision: number;
}

/**
 * CONTENT-001 — the DM-only RECYCLE BIN: the soft-deleted items, so a deleted note can be RESTORED. This
 * is a DM authoring surface (Contract 3 DM authority), so a non-DM actor receives an EMPTY list (fail
 * closed): a player must never learn that a hidden note ever existed, let alone be able to restore it.
 * Ordered by deletion time then id for a deterministic, stable bin. Pure.
 */
export function getDeletedContentItemsForActor(
	content: VaultContentState,
	permissions: PermissionState,
	actorId: string,
): DeletedContentItemView[] {
	const actor = permissions.actors[actorId];
	if (!actor || actor.role !== 'dm') return [];
	return Object.values(content.items)
		.filter((item): item is ContentItem & { deletedAt: string } => item.deletedAt !== null)
		.sort((a, b) => (a.deletedAt === b.deletedAt ? a.id.localeCompare(b.id) : a.deletedAt.localeCompare(b.deletedAt)))
		.map((item) => ({
			id: item.id,
			kind: item.kind,
			title: item.title,
			deletedAt: item.deletedAt,
			revision: item.revision,
		}));
}

/** The field path prefix that addresses a structured-object field in granular visibility metadata. */
export const CONTENT_FIELD_PATH_PREFIX = 'fields.' as const;

/** Build the field path for a structured field key (e.g. `dmNotes` → `fields.dmNotes`). */
export function contentFieldPath(fieldKey: string): string {
	return `${CONTENT_FIELD_PATH_PREFIX}${fieldKey}`;
}

/**
 * CONTENT-009 — a content item projected to an actor at SECTION + FIELD granularity. This is the
 * granular detail view: each section and structured field is decided by the SAME PERM visibility-filter
 * precedence (field > section > entity, hidden-ancestor-wins), so a `player-visible` note with one
 * `dm-only` section omits that section for a player while the DM sees everything (CONTENT-009 AC1).
 * A hidden ENTITY yields `visible: false` and an EMPTY surface (no section ids, no field keys) —
 * indistinguishable from not-found (fail closed).
 */
export interface ContentItemDetailView {
	id: string;
	kind: ContentItem['kind'];
	title: string;
	body: string;
	/** Visibility level the actor sees for the ENTITY (the DM sees the authored level). */
	visibility: ContentItem['visibility'];
	/** True only when the entity itself is visible to the actor. When false, every list below is empty. */
	visible: boolean;
	/** Section ids the actor may see (subset of the item's declared sections), in declared order. */
	visibleSectionIds: string[];
	/** Structured-object fields the actor may see (field key → value). DM-only fields are omitted. */
	visibleFields: Record<string, unknown>;
	/** Section ids redacted from the actor (reported for the DM authoring view only). */
	redactedSectionIds: string[];
	/** Structured-object field keys redacted from the actor (reported for the DM authoring view only). */
	redactedFieldKeys: string[];
	revision: number;
}

/** Strip the `fields.` prefix from a granular field path back to its bare structured-field key. */
function fieldKeyFromPath(path: string): string {
	return path.startsWith(CONTENT_FIELD_PATH_PREFIX)
		? path.slice(CONTENT_FIELD_PATH_PREFIX.length)
		: path;
}

/**
 * CONTENT-009 — THE granular actor-filtered detail read for ONE item. Reuses {@link filterEntityForActor}
 * (the PERM-002/003 precedence engine) over the item's {@link contentItemVisibilityMetadata}: it never
 * reinvents precedence. A tombstoned item, an unknown actor, or a hidden entity all yield a non-visible
 * detail with an empty surface (fail closed). For the DM, every section/field is returned (no redaction).
 *
 * The structured fields are addressed as `fields.<key>` paths so the SAME field/section/entity precedence
 * applies; the returned `visibleFields` are keyed by the bare field key for the GUI.
 */
export function getContentItemDetailForActor(
	content: VaultContentState,
	permissions: PermissionState,
	actorId: string,
	itemId: string,
	declaredSectionIds: string[] = [],
): ContentItemDetailView | { visible: false; reason: 'not-found' | 'hidden' } {
	const actor = permissions.actors[actorId];
	if (!actor) return { visible: false, reason: 'hidden' };
	const item = content.items[itemId];
	if (!item || !isLiveContentItem(item)) return { visible: false, reason: 'not-found' };

	const meta = contentItemVisibilityMetadata(item);
	const fieldPaths = Object.fromEntries(
		Object.entries(item.fields).map(([key, value]) => [contentFieldPath(key), value]),
	);
	const filtered = filterEntityForActor(
		meta,
		{ sectionIds: declaredSectionIds, fields: fieldPaths },
		actor,
		permissions,
	);
	if (!filtered.visible) {
		// Fail closed: a hidden entity exposes NOTHING — not its title, body, sections, or field keys.
		return {
			id: item.id,
			kind: item.kind,
			title: '',
			body: '',
			visibility: item.visibility,
			visible: false,
			visibleSectionIds: [],
			visibleFields: {},
			redactedSectionIds: [],
			redactedFieldKeys: [],
			revision: item.revision,
		};
	}

	const visibleFields: Record<string, unknown> = {};
	for (const [path, value] of Object.entries(filtered.visibleFields)) {
		visibleFields[fieldKeyFromPath(path)] = value;
	}
	return {
		id: item.id,
		kind: item.kind,
		title: item.title,
		body: item.body,
		visibility: item.visibility,
		visible: true,
		visibleSectionIds: filtered.visibleSectionIds,
		visibleFields,
		// The DM sees no redaction (the filter returns everything); a non-DM sees the redacted keys for
		// authoring affordances ONLY when it is the DM — for a non-DM these stay empty so nothing leaks.
		redactedSectionIds: actor.role === 'dm' ? filtered.redactedSectionIds : [],
		redactedFieldKeys:
			actor.role === 'dm' ? filtered.redactedFieldPaths.map(fieldKeyFromPath) : [],
		revision: item.revision,
	};
}
