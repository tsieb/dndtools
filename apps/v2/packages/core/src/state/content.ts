import type { ActorId } from './ids';
import type { CalendarDefinition, CustomDate } from './calendar';
import { CALENDAR_SCHEMA_VERSION } from './calendar';
import type { VisibilityLevel } from '../permissions/visibility-filter';
import { normalizeVisibilityLevel } from '../permissions/visibility-filter';

/**
 * CONTENT-011 — the durable VAULT CONTENT model: calendar-aware notes and structured objects.
 *
 * This is the FIRST CONTENT slice, so it establishes the minimal, cohesive, extensible content model
 * later CONTENT epics build on (notes/editor, templates, wikilinks, embeds…). It deliberately models
 * only what CONTENT-011 needs and what those later epics will clearly share:
 *
 *   - A CALENDAR REGISTRY of campaign {@link CalendarDefinition}s. Custom-date fields reference a
 *     calendar by id, so a date is always interpreted against an explicit campaign calendar — never an
 *     assumed Gregorian one.
 *   - CONTENT ITEMS — the note/structured-object unit. Each item has a `kind` (note vs structured
 *     object), a title/body, an open `fields` map (the structured-object frontmatter that later epics
 *     extend), CUSTOM-DATE FIELDS keyed by name, and TIMELINE REFERENCES to timeline points/events by
 *     custom date.
 *   - PER-ITEM VISIBILITY using the canonical three-level model (`dm-only` / `player-visible` /
 *     `shared` + `sharedWith`), the SAME model the PERM visibility filter uses, applied at the entity
 *     granularity (CONTENT-009/CONTENT-011 AC2). A new item FAILS CLOSED to `dm-only`.
 *
 * Pure data + pure reducers. No GUI, no storage. The command handlers compose these; durable writes
 * go through the storage adapter + op-log, never from the GUI (Architecture Contract 1). The
 * actor-filtered query (`queries/content-query.ts`) is the only sanctioned read path.
 */

export const VAULT_CONTENT_SCHEMA_VERSION = 1 as const;

/** The entity type content items are addressed by in grants/visibility/ops. */
export const CONTENT_ITEM_ENTITY_TYPE = 'content-item' as const;

/** A content item is either a free markdown NOTE or a structured (schema-shaped) OBJECT. */
export type ContentItemKind = 'note' | 'object';

export const CONTENT_ITEM_KINDS: readonly ContentItemKind[] = ['note', 'object'] as const;

/**
 * A reference from a content item to a TIMELINE point/event, anchored by a CUSTOM DATE (CONTENT-011
 * timeline references). The `targetId` optionally points at a concrete timeline-event content item;
 * when absent the reference is a bare dated marker on this item's own timeline. The date is always
 * expressed in a custom calendar (`date.calendarId`).
 */
export interface TimelineReference {
	id: string;
	/** Human label for the referenced point (e.g. "The Burning of Highmoor"). */
	label: string;
	/** The custom-calendar date this reference is anchored to. */
	date: CustomDate;
	/** Optional id of the timeline-event content item this reference resolves to. */
	targetId?: string;
}

/** One durable content item (note or structured object) with calendar-aware fields. */
export interface ContentItem {
	id: string;
	kind: ContentItemKind;
	title: string;
	body: string;
	/** Open structured-object fields (frontmatter). Later CONTENT epics validate/extend this. */
	fields: Record<string, unknown>;
	/** Named CUSTOM-DATE fields (e.g. `founded`, `occurredOn`). Each is a custom-calendar date value. */
	dateFields: Record<string, CustomDate>;
	/** Timeline references anchored by custom date (CONTENT-011 timeline references). */
	timelineRefs: TimelineReference[];
	/** Per-item canonical visibility (Contract 3 Axis 1). Fails closed to `dm-only`. */
	visibility: VisibilityLevel;
	/** Actor ids a `shared` item is explicitly delivered to. Ignored for other levels. */
	sharedWith: ActorId[];
	/** The actor that authored the item (an authorized editor / the DM). */
	authorActorId: ActorId;
	createdAt: string;
	/**
	 * CONTENT-001 — the SOFT-DELETE tombstone. `null` for a live item; an ISO timestamp once the item is
	 * soft-deleted. A tombstoned item is RECOVERABLE (a `content.restore-item` clears it), is OMITTED from
	 * every actor-filtered read (search/calendar/list), and never re-exposes its prior content. Defaults
	 * to `null` so a record persisted before CONTENT-001 hydrates as live.
	 */
	deletedAt: string | null;
	updatedAt: string;
	/** Optimistic-concurrency revision, bumped on every accepted mutation of this item. */
	revision: number;
}

/** The durable content slice: a calendar registry + content items, both keyed by id. */
export interface VaultContentState {
	calendars: Record<string, CalendarDefinition>;
	items: Record<string, ContentItem>;
	schemaVersion: typeof VAULT_CONTENT_SCHEMA_VERSION;
}

export const EMPTY_VAULT_CONTENT_STATE: VaultContentState = Object.freeze({
	calendars: {},
	items: {},
	schemaVersion: VAULT_CONTENT_SCHEMA_VERSION,
});

/** Tolerantly hydrate a possibly-undefined/partial persisted content slice (safe defaults). */
export function ensureVaultContentState(
	state: VaultContentState | undefined,
): VaultContentState {
	const items: Record<string, ContentItem> = {};
	for (const [id, item] of Object.entries(state?.items ?? {})) {
		// Backfill the CONTENT-001 tombstone on records persisted before soft-delete existed.
		items[id] = item.deletedAt === undefined ? { ...item, deletedAt: null } : item;
	}
	return {
		calendars: state?.calendars ?? {},
		items,
		schemaVersion: VAULT_CONTENT_SCHEMA_VERSION,
	};
}

/** Whether an item is live (not soft-deleted). The single tombstone predicate the reads share. */
export function isLiveContentItem(item: ContentItem): boolean {
	return item.deletedAt === null;
}

/** The LIVE content items (tombstoned items omitted), in stable id order. Pure. */
export function liveContentItems(state: VaultContentState): ContentItem[] {
	return Object.values(state.items)
		.filter(isLiveContentItem)
		.sort((a, b) => a.id.localeCompare(b.id));
}

/** The calendar definition with this id, or `undefined`. Pure. */
export function calendarById(
	state: VaultContentState,
	calendarId: string,
): CalendarDefinition | undefined {
	return state.calendars[calendarId];
}

/** The content item with this id, or `undefined`. Pure. */
export function contentItemById(state: VaultContentState, itemId: string): ContentItem | undefined {
	return state.items[itemId];
}

// --- Pure reducers (CONTENT-011) -----------------------------------------------------------------

/** Register (or replace) a calendar definition. Pure: returns a new state. */
export function upsertCalendarDefinition(
	state: VaultContentState,
	calendar: CalendarDefinition,
): VaultContentState {
	return {
		...state,
		calendars: {
			...state.calendars,
			[calendar.id]: { ...calendar, schemaVersion: CALENDAR_SCHEMA_VERSION },
		},
	};
}

export interface CreateContentItemInput {
	kind: ContentItemKind;
	title: string;
	body?: string;
	fields?: Record<string, unknown>;
	dateFields?: Record<string, CustomDate>;
	timelineRefs?: Array<{ id: string; label: string; date: CustomDate; targetId?: string }>;
	/** Optional explicit per-item visibility; absent ⇒ the fail-closed `dm-only` default. */
	visibility?: VisibilityLevel;
	/** Explicit `shared` delivery targets. Ignored unless visibility resolves to `shared`. */
	sharedWith?: ActorId[];
}

export interface ContentItemMeta {
	id: string;
	authorActorId: ActorId;
	now: string;
}

/**
 * Build a new content item (CONTENT-011). VISIBILITY FAILS CLOSED: when no visibility is selected the
 * item defaults to `dm-only`, so it is never accidentally player-visible. `shared` keeps its explicit
 * `sharedWith` delivery list; other levels carry no delivery list. Pure: takes its id/clock from
 * `meta`. Date-field and timeline-reference VALIDATION against the calendar is the command layer's job
 * (it has the calendar definition); this builder only assembles the value.
 */
export function buildContentItem(input: CreateContentItemInput, meta: ContentItemMeta): ContentItem {
	const visibility = normalizeVisibilityLevel(input.visibility ?? 'dm-only');
	const sharedWith = visibility === 'shared' ? [...new Set(input.sharedWith ?? [])] : [];
	return {
		id: meta.id,
		kind: input.kind,
		title: input.title,
		body: input.body ?? '',
		fields: { ...(input.fields ?? {}) },
		dateFields: { ...(input.dateFields ?? {}) },
		timelineRefs: (input.timelineRefs ?? []).map((ref) => ({
			id: ref.id,
			label: ref.label,
			date: ref.date,
			...(ref.targetId !== undefined ? { targetId: ref.targetId } : {}),
		})),
		visibility,
		sharedWith,
		authorActorId: meta.authorActorId,
		createdAt: meta.now,
		deletedAt: null,
		updatedAt: meta.now,
		revision: 1,
	};
}

/** Insert a content item. Pure: returns a new state. */
export function addContentItem(state: VaultContentState, item: ContentItem): VaultContentState {
	return { ...state, items: { ...state.items, [item.id]: item } };
}

export interface UpdateContentItemPatch {
	title?: string;
	body?: string;
	fields?: Record<string, unknown>;
	/** Replace a named custom-date field (validated by the command layer before this is called). */
	dateFields?: Record<string, CustomDate>;
	timelineRefs?: TimelineReference[];
}

/**
 * Apply a content patch to one item, bumping its revision. Returns `null` when the item does not exist
 * (the caller rejects). Pure. Visibility is NOT changed here — it has its own reducer so the
 * cross-surface invalidation trigger stays explicit (mirrors the journal slice).
 */
export function updateContentItem(
	state: VaultContentState,
	itemId: string,
	patch: UpdateContentItemPatch,
	now: string,
): VaultContentState | null {
	const existing = state.items[itemId];
	if (!existing) return null;
	const next: ContentItem = {
		...existing,
		title: patch.title ?? existing.title,
		body: patch.body ?? existing.body,
		fields: patch.fields ? { ...existing.fields, ...patch.fields } : existing.fields,
		dateFields: patch.dateFields
			? { ...existing.dateFields, ...patch.dateFields }
			: existing.dateFields,
		timelineRefs: patch.timelineRefs ?? existing.timelineRefs,
		updatedAt: now,
		revision: existing.revision + 1,
	};
	return { ...state, items: { ...state.items, [itemId]: next } };
}

/**
 * Change ONE item's per-item visibility. This is the explicit visibility-change trigger the
 * data-layer cross-surface invalidation hangs off of (it bumps the revision so a stale cached view is
 * detectable and re-resolves `sharedWith`). Returns `null` when the item does not exist. Pure.
 */
export function setContentItemVisibility(
	state: VaultContentState,
	itemId: string,
	visibility: VisibilityLevel,
	sharedWith: ActorId[] | undefined,
	now: string,
): VaultContentState | null {
	const existing = state.items[itemId];
	if (!existing) return null;
	const level = normalizeVisibilityLevel(visibility);
	const nextShared =
		level === 'shared' ? [...new Set(sharedWith ?? existing.sharedWith)] : [];
	const next: ContentItem = {
		...existing,
		visibility: level,
		sharedWith: nextShared,
		updatedAt: now,
		revision: existing.revision + 1,
	};
	return { ...state, items: { ...state.items, [itemId]: next } };
}

/**
 * SOFT-DELETE a content item (CONTENT-001): stamp its tombstone + bump its revision, keeping the record
 * recoverable. A no-op (returns the same value reference is fine) if it is already tombstoned. Returns
 * `null` when the item does not exist. Pure.
 */
export function softDeleteContentItem(
	state: VaultContentState,
	itemId: string,
	now: string,
): VaultContentState | null {
	const existing = state.items[itemId];
	if (!existing) return null;
	const next: ContentItem = {
		...existing,
		deletedAt: now,
		updatedAt: now,
		revision: existing.revision + 1,
	};
	return { ...state, items: { ...state.items, [itemId]: next } };
}

/**
 * RESTORE a soft-deleted content item (CONTENT-001): clear its tombstone + bump its revision. The
 * restored revision carries the item's existing content verbatim — it never re-exposes a different prior
 * revision. Returns `null` when the item does not exist. Pure.
 */
export function restoreContentItem(
	state: VaultContentState,
	itemId: string,
	now: string,
): VaultContentState | null {
	const existing = state.items[itemId];
	if (!existing) return null;
	const next: ContentItem = {
		...existing,
		deletedAt: null,
		updatedAt: now,
		revision: existing.revision + 1,
	};
	return { ...state, items: { ...state.items, [itemId]: next } };
}

/** HARD-remove a content item (purge — no tombstone). Returns `null` when it does not exist. Pure. */
export function removeContentItem(
	state: VaultContentState,
	itemId: string,
): VaultContentState | null {
	if (!state.items[itemId]) return null;
	const items = { ...state.items };
	delete items[itemId];
	return { ...state, items };
}
