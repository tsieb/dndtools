import type { ActorId } from './ids';
import type { CustomDate } from './calendar';
import type { VisibilityLevel } from '../permissions/visibility-filter';
import { normalizeVisibilityLevel } from '../permissions/visibility-filter';

/**
 * SRCH-003 / SRCH-004 — the durable SAVED-SEARCH model + the shared SEARCH-FILTER definition.
 *
 * A {@link SearchFilter} is the criteria a search runs with: free text plus the SRCH-003 facets (source,
 * content type, tag, folder, an inclusive custom-date range, and a visibility-safe RELATIONSHIP filter).
 * It is a pure VALUE — it names NO results and carries NO content; it is just the query the actor-filtered
 * search read (`queries/search-query.ts`) evaluates LIVE. A {@link SavedSearch} is a DM-authored, NAMED,
 * persisted filter with its own visibility + pin state.
 *
 * The single most important invariant of this slice — and the one the model is shaped to make IMPOSSIBLE
 * to violate (SRCH-003 AC4 / SRCH-004 AC2; Cross-Contract Non-Negotiable 2):
 *
 *   A SAVED SEARCH STORES A QUERY, NEVER A RESULT. It persists ONLY the {@link SearchFilter} criteria, the
 *   DM-authored name, an own visibility, and pin state — it NEVER caches matched ids, titles, snippets, or
 *   counts. So there is no stale result set that could leak a now-hidden item: every run re-evaluates the
 *   filter through the actor-filtered search, which decides visibility BEFORE any result is produced. A
 *   `dm-only` saved search is itself omitted from a non-DM's read (the DM authoring criteria never leak),
 *   and even a `player-visible` saved search yields ONLY the running actor's visible matches.
 *
 * Pure data + pure reducers. No GUI, no storage, no clock — ids/clock are supplied by the command env.
 * Saved searches FAIL CLOSED to `dm-only` (SRCH-004 is a DM authoring surface), so a new saved search is
 * never accidentally exposed to players.
 */

export const SAVED_SEARCH_SCHEMA_VERSION = 1 as const;

/** The entity type a saved search is addressed by in grants/visibility/ops. */
export const SAVED_SEARCH_ENTITY_TYPE = 'saved-search' as const;

/** The sync source a result is drawn from. Mirrors the wikilink-graph `ContentSourceId` convention. */
export type SearchSourceId = 'local-markdown' | 'obsidian' | 'google-docs';

export const SEARCH_SOURCE_IDS: readonly SearchSourceId[] = Object.freeze([
	'local-markdown',
	'obsidian',
	'google-docs',
]);

/**
 * The kind of searchable artifact a hit can be (the SRCH-003 "content type" facet, == the SRCH-001
 * searchable DOMAINS). SRCH-001 requires full-text search over notes, objects, maps/POIs, HANDOUTS, and
 * SESSION ARTIFACTS — so the domain set is the union of those: `note` / `object` / `poi` (the map domain) /
 * `handout` / `session-artifact` (a recorded dice roll / session record). Each domain is drawn from its OWN
 * actor-filtered read, so a hidden artifact in any domain is never a search candidate (SRCH-001 AC2).
 */
export type SearchContentType = 'note' | 'object' | 'poi' | 'handout' | 'session-artifact';

export const SEARCH_CONTENT_TYPES: readonly SearchContentType[] = Object.freeze([
	'note',
	'object',
	'poi',
	'handout',
	'session-artifact',
]);

/** An INCLUSIVE custom-date range, expressed in a single calendar. Either bound may be open (`null`). */
export interface SearchDateRange {
	/** The calendar the bounds are interpreted in. Required when either bound is present. */
	calendarId: string;
	/** Inclusive lower bound; `null` ⇒ open (no lower bound). */
	from: CustomDate | null;
	/** Inclusive upper bound; `null` ⇒ open (no upper bound). */
	to: CustomDate | null;
}

/**
 * SRCH-003 — the VISIBILITY-SAFE RELATIONSHIP filter. Restricts results to artifacts RELATED to a named
 * anchor entity (a content item or a map POI) through the actor-filtered graph (wikilinks for content,
 * POI→entity links for maps). It is "visibility-safe" by construction: the relationship is resolved over
 * the actor's VISIBLE graph only, so a hidden related artifact is never a candidate — it cannot appear as
 * a result, a facet, a hint, or a revealing count (SRCH-003 AC4).
 */
export interface SearchRelationshipFilter {
	/** The kind of anchor the relationship is measured from. */
	anchorKind: 'content' | 'poi';
	/** The anchor entity's id (a content-item id, or a POI id). */
	anchorId: string;
}

/**
 * SRCH-003 — the SEARCH FILTER: the full faceted criteria a search runs with. EVERY facet is optional; an
 * empty filter matches all of the actor's visible artifacts. Facets COMBINE with AND (every present facet
 * must hold). This is the value a {@link SavedSearch} persists and the value the live search read consumes.
 */
export interface SearchFilter {
	/** Free-text query over title/body/label. Blank ⇒ no text constraint. */
	query?: string;
	/** Restrict to these sources. Empty/absent ⇒ every source. */
	sources?: SearchSourceId[];
	/** Restrict to these content types. Empty/absent ⇒ every type. */
	contentTypes?: SearchContentType[];
	/** Require ALL of these tags (lowercased compare). Empty/absent ⇒ no tag constraint. */
	tags?: string[];
	/** Restrict to artifacts in this folder (a `dndtools.folder` field prefix). Absent ⇒ no folder constraint. */
	folder?: string;
	/** Inclusive custom-date range. Absent ⇒ no date constraint. */
	dateRange?: SearchDateRange;
	/** Visibility-safe relationship filter. Absent ⇒ no relationship constraint. */
	relationship?: SearchRelationshipFilter;
}

/**
 * ONE durable SAVED SEARCH: a DM-authored name + the {@link SearchFilter} criteria + its OWN visibility and
 * pin state. It NEVER stores a result set (see the module doc): the filter is re-evaluated live on every
 * read. `pinned` marks it for the Command Center widget (SRCH-004 AC1). `visibility` fails closed to
 * `dm-only` so DM-only criteria are never exposed to players (SRCH-004 AC2).
 */
export interface SavedSearch {
	id: string;
	/** A DM-authored display name (e.g. "Unresolved plot threads"). */
	name: string;
	/** The persisted filter criteria. Re-evaluated LIVE on every read — never a cached result. */
	filter: SearchFilter;
	/** Per-saved-search visibility (Contract 3 Axis 1). Fails closed to `dm-only`. */
	visibility: VisibilityLevel;
	/** Actor ids a `shared` saved search is explicitly delivered to. Ignored for other levels. */
	sharedWith: ActorId[];
	/** Whether the saved search is pinned to the Command Center (SRCH-004 AC1). */
	pinned: boolean;
	createdBy: ActorId;
	createdAt: string;
	updatedAt: string;
	revision: number;
}

/** The durable saved-search registry, keyed by id. */
export type SavedSearchMap = Record<string, SavedSearch>;

/** Normalize a string list fail-closed: trim, drop empties, lowercase, dedupe (stable order). Pure. */
function normalizeStringList(values: readonly string[] | undefined): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const raw of values ?? []) {
		const value = raw.trim().toLowerCase();
		if (value === '' || seen.has(value)) continue;
		seen.add(value);
		result.push(value);
	}
	return result;
}

/** Normalize a source/content-type list against an allowed set (drop unknown values, dedupe). Pure. */
function normalizeEnumList<T extends string>(
	values: readonly string[] | undefined,
	allowed: readonly T[],
): T[] {
	const allowedSet = new Set<string>(allowed);
	const seen = new Set<string>();
	const result: T[] = [];
	for (const raw of values ?? []) {
		if (!allowedSet.has(raw) || seen.has(raw)) continue;
		seen.add(raw);
		result.push(raw as T);
	}
	return result;
}

/**
 * Normalize a {@link SearchFilter} into its canonical, deterministic form: text trimmed, enum lists pruned
 * to known values + deduped, tags lowercased + deduped, empty facets dropped. This is the single canonical
 * shape the query evaluates and the reducer persists, so the same authored filter always behaves identically
 * across surfaces and a malformed/over-broad list can never widen a search. Pure.
 */
export function normalizeSearchFilter(filter: SearchFilter | undefined): SearchFilter {
	const normalized: SearchFilter = {};
	const query = filter?.query?.trim();
	if (query) normalized.query = query;
	const sources = normalizeEnumList(filter?.sources, SEARCH_SOURCE_IDS);
	if (sources.length > 0) normalized.sources = sources;
	const contentTypes = normalizeEnumList(filter?.contentTypes, SEARCH_CONTENT_TYPES);
	if (contentTypes.length > 0) normalized.contentTypes = contentTypes;
	const tags = normalizeStringList(filter?.tags);
	if (tags.length > 0) normalized.tags = tags;
	const folder = filter?.folder?.trim();
	if (folder) normalized.folder = folder;
	if (filter?.dateRange && filter.dateRange.calendarId) {
		normalized.dateRange = {
			calendarId: filter.dateRange.calendarId,
			from: filter.dateRange.from ?? null,
			to: filter.dateRange.to ?? null,
		};
	}
	if (filter?.relationship && filter.relationship.anchorId) {
		normalized.relationship = {
			anchorKind: filter.relationship.anchorKind,
			anchorId: filter.relationship.anchorId,
		};
	}
	return normalized;
}

export interface CreateSavedSearchInput {
	name: string;
	filter: SearchFilter;
	/** Optional explicit visibility; absent ⇒ the fail-closed `dm-only` default. */
	visibility?: VisibilityLevel;
	/** Explicit `shared` delivery targets. Ignored unless visibility resolves to `shared`. */
	sharedWith?: ActorId[];
	/** Whether to pin to the Command Center. Defaults to false. */
	pinned?: boolean;
}

export interface SavedSearchMeta {
	id: string;
	createdBy: ActorId;
	now: string;
}

/**
 * Build a new saved search (SRCH-004). VISIBILITY FAILS CLOSED: with no visibility selected the saved search
 * defaults to `dm-only`, so DM-only criteria are never accidentally exposed to players (SRCH-004 AC2). The
 * filter is normalized into its canonical form. Pure: takes its id/clock from `meta`.
 */
export function buildSavedSearch(input: CreateSavedSearchInput, meta: SavedSearchMeta): SavedSearch {
	const visibility = normalizeVisibilityLevel(input.visibility ?? 'dm-only');
	const sharedWith = visibility === 'shared' ? [...new Set(input.sharedWith ?? [])] : [];
	return {
		id: meta.id,
		name: input.name,
		filter: normalizeSearchFilter(input.filter),
		visibility,
		sharedWith,
		pinned: input.pinned ?? false,
		createdBy: meta.createdBy,
		createdAt: meta.now,
		updatedAt: meta.now,
		revision: 1,
	};
}

export interface UpdateSavedSearchPatch {
	name?: string;
	filter?: SearchFilter;
	visibility?: VisibilityLevel;
	sharedWith?: ActorId[];
	pinned?: boolean;
}

/**
 * Apply a patch to one saved search, bumping its revision. A visibility/pin change is the cross-surface
 * invalidation trigger (the revision bump makes a stale cached view detectable). Returns `null` when the
 * saved search does not exist (the caller rejects). Pure: returns a new map.
 */
export function updateSavedSearch(
	searches: SavedSearchMap,
	searchId: string,
	patch: UpdateSavedSearchPatch,
	now: string,
): SavedSearchMap | null {
	const existing = searches[searchId];
	if (!existing) return null;
	const visibility =
		patch.visibility !== undefined ? normalizeVisibilityLevel(patch.visibility) : existing.visibility;
	const sharedWith =
		visibility === 'shared'
			? [...new Set(patch.sharedWith ?? existing.sharedWith)]
			: [];
	const next: SavedSearch = {
		...existing,
		name: patch.name ?? existing.name,
		filter: patch.filter !== undefined ? normalizeSearchFilter(patch.filter) : existing.filter,
		visibility,
		sharedWith,
		pinned: patch.pinned ?? existing.pinned,
		updatedAt: now,
		revision: existing.revision + 1,
	};
	return { ...searches, [searchId]: next };
}

/** Set ONLY the pin state of a saved search, bumping its revision. Returns `null` when absent. Pure. */
export function setSavedSearchPinned(
	searches: SavedSearchMap,
	searchId: string,
	pinned: boolean,
	now: string,
): SavedSearchMap | null {
	const existing = searches[searchId];
	if (!existing) return null;
	const next: SavedSearch = { ...existing, pinned, updatedAt: now, revision: existing.revision + 1 };
	return { ...searches, [searchId]: next };
}

/** Remove a saved search by id. Returns `null` when it does not exist. Pure. */
export function removeSavedSearch(searches: SavedSearchMap, searchId: string): SavedSearchMap | null {
	if (!searches[searchId]) return null;
	const next = { ...searches };
	delete next[searchId];
	return next;
}

/** Deep-clone a saved search (so callers never mutate shared state). Pure. */
export function cloneSavedSearch(search: SavedSearch): SavedSearch {
	return {
		...search,
		filter: normalizeSearchFilter(search.filter),
		sharedWith: [...search.sharedWith],
	};
}

/**
 * Tolerantly hydrate a possibly-undefined/partial persisted saved-search map (safe, fail-closed defaults).
 * A record persisted before this slice existed restores with no saved searches; an individual record with
 * a missing visibility hydrates to `dm-only` (the safe default) and its filter is re-normalized.
 */
export function ensureSavedSearches(searches: SavedSearchMap | undefined): SavedSearchMap {
	const result: SavedSearchMap = {};
	for (const [id, search] of Object.entries(searches ?? {})) {
		const visibility = normalizeVisibilityLevel(search.visibility ?? 'dm-only');
		result[id] = {
			id: search.id ?? id,
			name: search.name ?? '',
			filter: normalizeSearchFilter(search.filter),
			visibility,
			sharedWith: visibility === 'shared' ? [...new Set(search.sharedWith ?? [])] : [],
			pinned: search.pinned ?? false,
			createdBy: search.createdBy ?? '',
			createdAt: search.createdAt ?? '',
			updatedAt: search.updatedAt ?? search.createdAt ?? '',
			revision: search.revision ?? 0,
		};
	}
	return result;
}
