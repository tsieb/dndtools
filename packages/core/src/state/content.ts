import type { ActorId } from './ids';
import type { CalendarDefinition, CustomDate } from './calendar';
import { CALENDAR_SCHEMA_VERSION } from './calendar';
import type { EntityVisibilityMetadata, VisibilityLevel, VisibilityRule } from '../permissions/visibility-filter';
import { normalizeVisibilityLevel } from '../permissions/visibility-filter';
import { ensureSavedSearches, type SavedSearchMap } from './saved-search';

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

/**
 * CONTENT-010 — what an embed targets inside its referenced content item. An embed renders the LIVE
 * target through the actor-filtered query (never a copy), so the kind selects which projection of the
 * target is rendered at the embed call site:
 *
 *   - `object-card`   — the target structured object's visible fields, as an inline card.
 *   - `note-section`  — ONE named section of the target note's body (`sectionId` required).
 *   - `render-block`  — the target's whole visible render (title + visible sections + visible fields).
 */
export type ContentEmbedKind = 'object-card' | 'note-section' | 'render-block';

export const CONTENT_EMBED_KINDS: readonly ContentEmbedKind[] = [
	'object-card',
	'note-section',
	'render-block',
] as const;

/**
 * CONTENT-010 — a single embed placed in a HOST note's content: a TYPED REFERENCE to a target content
 * item, NOT a copy of the target's data (Architecture Contract 4 "Embed, Link, and Project Rules":
 * embedding does not clone target data; the source owns placement, the target entity owns its data).
 *
 * This mirrors the MAP-008 `MapEmbed` pattern (reference + which projection) one-for-one. The embed
 * stores ONLY:
 *   - `targetItemId` — the embedded item's id (resolved LIVE at read; the host stores no title/body/fields);
 *   - `kind` — which projection of the target to render;
 *   - `sectionId` — for `note-section`, which named section (else absent).
 *
 * Because the embed is resolved against the LIVE target through the actor-filtered query, it always
 * reflects the target's CURRENT data AND the VIEWER's OWN permission to the TARGET (CONTENT-010 AC1).
 * A viewer who cannot see the target gets the generic fail-closed "unavailable" placeholder with NO
 * leak (CONTENT-010 AC2) — exactly the MAP-008 hidden-child → unavailable contract.
 */
export interface ContentEmbed {
	/** Stable id of this embed relationship (a host may embed the same target more than once). */
	id: string;
	/** The embedded TARGET content item's id. Resolved live; the embed stores NO copy of its data. */
	targetItemId: string;
	/** Which projection of the target to render at this call site. */
	kind: ContentEmbedKind;
	/** For a `note-section` embed, the named section of the target to render. Absent otherwise. */
	sectionId?: string;
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
	/** Per-item canonical ENTITY-level visibility (Contract 3 Axis 1). Fails closed to `dm-only`. */
	visibility: VisibilityLevel;
	/** Actor ids a `shared` item is explicitly delivered to. Ignored for other levels. */
	sharedWith: ActorId[];
	/**
	 * CONTENT-009 — SECTION-level visibility overrides keyed by section id. A section with no entry
	 * inherits the entity default. More specific than the entity, less specific than a field
	 * (field > section > entity precedence, PERM-003). Empty by default (everything inherits the entity).
	 */
	sectionVisibility: Record<string, VisibilityRule>;
	/**
	 * CONTENT-009 — FIELD-level visibility overrides keyed by field path (e.g. `fields.dmNotes`). The
	 * MOST specific level; a field with no entry inherits its owning section (or the entity).
	 */
	fieldVisibility: Record<string, VisibilityRule>;
	/**
	 * CONTENT-009 — which section each field belongs to (field path → section id). Lets a hidden SECTION
	 * hide the fields attributed to it even when the field carries no field-level rule of its own
	 * (hidden-ancestor-wins). A field with no entry is attributed to the entity directly.
	 */
	fieldSections: Record<string, string>;
	/**
	 * CONTENT-010 — embeds placed in this HOST item's content: TYPED REFERENCES to other items, never
	 * copies. Resolved live + actor-filtered at read (`queries/content-embed.ts`). Empty by default.
	 */
	embeds: ContentEmbed[];
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

/** The durable content slice: a calendar registry + content items + saved searches, all keyed by id. */
export interface VaultContentState {
	calendars: Record<string, CalendarDefinition>;
	items: Record<string, ContentItem>;
	/**
	 * SRCH-004 — durable DM-authored SAVED SEARCHES keyed by id. Each stores ONLY its filter criteria +
	 * its own visibility + pin state — NEVER a cached result set, so a run always re-evaluates the filter
	 * through the actor-filtered search (no stale result can leak a now-hidden item — SRCH-003 AC4).
	 */
	savedSearches: SavedSearchMap;
	schemaVersion: typeof VAULT_CONTENT_SCHEMA_VERSION;
}

export const EMPTY_VAULT_CONTENT_STATE: VaultContentState = Object.freeze({
	calendars: {},
	items: {},
	savedSearches: {},
	schemaVersion: VAULT_CONTENT_SCHEMA_VERSION,
});

/** Tolerantly hydrate a possibly-undefined/partial persisted content slice (safe defaults). */
export function ensureVaultContentState(
	state: VaultContentState | undefined,
): VaultContentState {
	const items: Record<string, ContentItem> = {};
	for (const [id, item] of Object.entries(state?.items ?? {})) {
		// Backfill fields added by later CONTENT slices on records persisted before they existed, so a
		// record written before CONTENT-001 (tombstone) or CONTENT-009/010 (granular visibility + embeds)
		// hydrates to a safe, fail-closed default rather than carrying `undefined` into the reducers/queries.
		items[id] = {
			...item,
			deletedAt: item.deletedAt === undefined ? null : item.deletedAt,
			sectionVisibility: item.sectionVisibility ?? {},
			fieldVisibility: item.fieldVisibility ?? {},
			fieldSections: item.fieldSections ?? {},
			embeds: item.embeds ?? [],
		};
	}
	return {
		calendars: state?.calendars ?? {},
		items,
		// SRCH-004 — hydrate saved searches fail-closed: a content document persisted before this slice
		// existed restores with no saved searches (never undefined); a record with missing visibility
		// hydrates to the `dm-only` safe default and its filter is re-normalized.
		savedSearches: ensureSavedSearches(state?.savedSearches),
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
		// CONTENT-009 — a new item carries NO granular overrides, so every section/field inherits the
		// entity default (which itself fails closed to `dm-only`). Granular rules are authored after creation.
		sectionVisibility: {},
		fieldVisibility: {},
		fieldSections: {},
		// CONTENT-010 — a new item embeds nothing; embeds are added explicitly after creation.
		embeds: [],
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

// --- CONTENT-009 — granular visibility (entity / section / field) --------------------------------

/**
 * CONTENT-009 — build the canonical {@link EntityVisibilityMetadata} for ONE content item, so the SAME
 * PERM visibility-filter precedence engine (`permissions/visibility-filter.ts`, field > section > entity
 * with hidden-ancestor-wins) decides what an actor may see. This is the bridge that applies PERM-002/003
 * to notes/objects WITHOUT reinventing precedence: the item's entity-level `visibility`/`sharedWith`
 * become the entity rule, and the per-item `sectionVisibility`/`fieldVisibility`/`fieldSections` become
 * the section/field overrides. Pure. Fail closed: the entity rule defaults to `dm-only` via the item model.
 */
export function contentItemVisibilityMetadata(item: ContentItem): EntityVisibilityMetadata {
	const entityRule: VisibilityRule =
		item.visibility === 'shared'
			? { level: 'shared', sharedWith: item.sharedWith }
			: { level: item.visibility };
	return {
		entityType: CONTENT_ITEM_ENTITY_TYPE,
		entityId: item.id,
		entity: entityRule,
		sections: item.sectionVisibility,
		fields: item.fieldVisibility,
		fieldSections: item.fieldSections,
	};
}

/**
 * CONTENT-009 — set ONE SECTION's visibility override (or clear it when `rule` is `null` so the section
 * re-inherits the entity default). Bumps the revision so a stale cached view is detectable and the
 * delivery audience re-resolves (mirrors {@link setContentItemVisibility}). Returns `null` when the item
 * does not exist. Pure: returns a new state. `shared` keeps its explicit `sharedWith`; other levels drop it.
 */
export function setContentSectionVisibility(
	state: VaultContentState,
	itemId: string,
	sectionId: string,
	rule: VisibilityRule | null,
	now: string,
): VaultContentState | null {
	const existing = state.items[itemId];
	if (!existing) return null;
	const sectionVisibility = { ...existing.sectionVisibility };
	if (rule === null) {
		delete sectionVisibility[sectionId];
	} else {
		sectionVisibility[sectionId] = normalizeRule(rule);
	}
	const next: ContentItem = {
		...existing,
		sectionVisibility,
		updatedAt: now,
		revision: existing.revision + 1,
	};
	return { ...state, items: { ...state.items, [itemId]: next } };
}

/**
 * CONTENT-009 — set ONE FIELD's visibility override (or clear it when `rule` is `null`). When
 * `sectionId` is supplied the field is attributed to that section (so a hidden section hides the field);
 * passing `null` for `sectionId` clears any attribution. Bumps the revision. Returns `null` when the item
 * does not exist. Pure.
 */
export function setContentFieldVisibility(
	state: VaultContentState,
	itemId: string,
	fieldPath: string,
	rule: VisibilityRule | null,
	sectionId: string | null | undefined,
	now: string,
): VaultContentState | null {
	const existing = state.items[itemId];
	if (!existing) return null;
	const fieldVisibility = { ...existing.fieldVisibility };
	if (rule === null) {
		delete fieldVisibility[fieldPath];
	} else {
		fieldVisibility[fieldPath] = normalizeRule(rule);
	}
	const fieldSections = { ...existing.fieldSections };
	if (sectionId === null) {
		delete fieldSections[fieldPath];
	} else if (sectionId !== undefined) {
		fieldSections[fieldPath] = sectionId;
	}
	const next: ContentItem = {
		...existing,
		fieldVisibility,
		fieldSections,
		updatedAt: now,
		revision: existing.revision + 1,
	};
	return { ...state, items: { ...state.items, [itemId]: next } };
}

/** Normalize a visibility rule fail-closed: coerce the level, and only keep `sharedWith` for `shared`. */
function normalizeRule(rule: VisibilityRule): VisibilityRule {
	const level = normalizeVisibilityLevel(rule.level);
	return level === 'shared'
		? { level, sharedWith: [...new Set(rule.sharedWith ?? [])] }
		: { level };
}

// --- CONTENT-010 — embeds (typed references, never copies) ---------------------------------------

export interface AddContentEmbedInput {
	id: string;
	targetItemId: string;
	kind: ContentEmbedKind;
	sectionId?: string;
}

/**
 * CONTENT-010 — add an embed REFERENCE to a host item. The embed stores ONLY the target id + projection
 * (and a section id for a `note-section` embed) — NEVER the target's title/body/fields (Contract 4: an
 * embed does not clone target data). Bumps the host revision. Returns `null` when the host does not exist.
 * The caller (command layer) validates that the target exists and that a `note-section` embed names a
 * section; this reducer only appends the validated reference. Pure.
 */
export function addContentEmbed(
	state: VaultContentState,
	hostItemId: string,
	input: AddContentEmbedInput,
	now: string,
): VaultContentState | null {
	const host = state.items[hostItemId];
	if (!host) return null;
	const embed: ContentEmbed = {
		id: input.id,
		targetItemId: input.targetItemId,
		kind: input.kind,
		...(input.kind === 'note-section' && input.sectionId !== undefined
			? { sectionId: input.sectionId }
			: {}),
	};
	const next: ContentItem = {
		...host,
		embeds: [...host.embeds, embed],
		updatedAt: now,
		revision: host.revision + 1,
	};
	return { ...state, items: { ...state.items, [hostItemId]: next } };
}

/**
 * CONTENT-010 — remove an embed reference from a host by embed id. Removing an embed NEVER deletes the
 * target item (Contract 4 / MAP-008: an embed owns only the placement; the target owns its data). Bumps
 * the host revision. Returns `null` when the host does not exist, or `{ notFound: true }` when no embed
 * with that id exists on the host. Pure.
 */
export function removeContentEmbed(
	state: VaultContentState,
	hostItemId: string,
	embedId: string,
	now: string,
): VaultContentState | { notFound: true } | null {
	const host = state.items[hostItemId];
	if (!host) return null;
	if (!host.embeds.some((embed) => embed.id === embedId)) return { notFound: true };
	const next: ContentItem = {
		...host,
		embeds: host.embeds.filter((embed) => embed.id !== embedId),
		updatedAt: now,
		revision: host.revision + 1,
	};
	return { ...state, items: { ...state.items, [hostItemId]: next } };
}
