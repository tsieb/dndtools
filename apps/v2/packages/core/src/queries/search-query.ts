import type { PermissionState } from '../state/permission-state';
import type { VaultContentState } from '../state/content';
import type { MapState } from '../state/map-state';
import type { SessionState } from '../state/session-state';
import type {
	CalendarDateFormat,
	CalendarDefinition,
	CustomDate,
} from '../state/calendar';
import { absoluteDayIndex, compareCustomDates } from '../state/calendar';
import { parseMarkdownNote } from '../state/markdown';
import {
	SEARCH_CONTENT_TYPES,
	SEARCH_SOURCE_IDS,
	type SearchContentType,
	type SearchDateRange,
	type SearchFilter,
	type SearchRelationshipFilter,
	type SearchSourceId,
} from '../state/saved-search';
import { getContentItemsForActor, type ContentItemView } from './content-query';
import { getMapViewForActor, deliveredMapIdsForActor, type MapPoiView } from './map-query';
import { getHandoutsForActor, type HandoutView } from './handout-query';
import { getDiceHistoryForActor, type DiceRollView } from './dice-history';

/**
 * SRCH-001 / SRCH-003 — THE single actor-filtered FULL-TEXT FACETED SEARCH read. The user performs full-text
 * search over their VISIBLE notes, objects, maps/POIs, HANDOUTS, and SESSION ARTIFACTS from the LOCAL cached
 * indexes (SRCH-001), filtered by SOURCE, CONTENT TYPE, TAG, FOLDER, DATE, and a VISIBILITY-SAFE
 * RELATIONSHIP, plus free text, with the active filters echoed in the result metadata (SRCH-003 AC3).
 *
 * This is a pure DISCOVERY surface composed ENTIRELY from the EXISTING actor-filtered reads — it adds NO
 * second index and re-derives NO visibility policy. The SRCH-001 searchable DOMAINS each come from their OWN
 * single filtered read, so a hidden artifact in ANY domain is never even a candidate (SRCH-001 AC2):
 *
 *   - NOTES + STRUCTURED OBJECTS ← {@link getContentItemsForActor} (CONTENT-011). A `dm-only` note/object
 *     is ALREADY omitted there, so it can never surface here.
 *   - MAP POIs ← {@link getMapViewForActor} (MAP-018), the single filtered map model. A hidden POI / a POI
 *     on a hidden layer / a POI on a hidden map is ALREADY omitted there.
 *   - HANDOUTS ← {@link getHandoutsForActor} (SES-004). A handout the actor is not a recipient of (or a
 *     revoked, non-persistent recipient) is ALREADY omitted, and only the SECTIONS the actor may see are
 *     present — so a player never matches a withheld/unrevealed handout section.
 *   - SESSION ARTIFACTS (recorded dice rolls) ← {@link getDiceHistoryForActor} (SES-003). A `dm-only`
 *     secret roll is ALREADY omitted for a non-DM, so its expression/label can never match for a player.
 *
 * Because EVERY candidate is drawn from an actor-filtered read, the data layer decided visibility BEFORE
 * search sees anything (Cross-Contract Non-Negotiable 2). The result — including its FACET COUNTS — is
 * computed over ONLY the actor-visible set, so a player searching never sees a hidden hit, a hidden facet,
 * a hidden relationship match, or a count that reveals one (SRCH-003 AC1, AC4). An unknown/unauthenticated
 * actor receives an empty result (fail closed).
 *
 * SOURCE AVAILABILITY (SRCH-003 AC2): when a saved/ad-hoc search references a SOURCE that is currently
 * unavailable (e.g. an offline Obsidian/Drive vault), its results are marked STALE or UNAVAILABLE in the
 * per-source freshness map WITHOUT failing the whole search — the available sources still return their
 * visible cached results.
 *
 * INDEX FRESHNESS (SRCH-001 AC3 / SRCH-009): the per-DOMAIN index freshness is published by the dedicated
 * {@link import('./search-index-query')} read, layered on this same actor-filtered set; this read returns
 * the cached results without blocking on indexing.
 *
 * Pure + deterministic: the same (state, actor, filter) always returns the same ranked result. The
 * Processing Core owns the facet filters, text match, and ordering; the GUI renders the computed result and
 * dispatches command intents only (Architecture Contract 1).
 */

/** The per-item SOURCE + AVAILABILITY convention (shared with the wikilink graph). */
const SOURCE_FIELD = 'dndtools.source' as const;
const SOURCE_UNAVAILABLE_FIELD = 'dndtools.sourceUnavailable' as const;
const FOLDER_FIELD = 'dndtools.folder' as const;

/** The source a content item belongs to (its `dndtools.source` field, else the local-markdown baseline). */
function itemSource(view: ContentItemView): SearchSourceId {
	const raw = view.fields[SOURCE_FIELD];
	return raw === 'obsidian' || raw === 'google-docs' ? raw : 'local-markdown';
}

/** Whether a content item's source is currently available (its `dndtools.sourceUnavailable` field). */
function itemSourceAvailable(view: ContentItemView): boolean {
	return view.fields[SOURCE_UNAVAILABLE_FIELD] !== true;
}

/** The folder a content item is filed under (its `dndtools.folder` field), or `null` when unfiled. */
function itemFolder(view: ContentItemView): string | null {
	const raw = view.fields[FOLDER_FIELD];
	return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
}

/** The tags of a content item: the parsed frontmatter `tags` + inline `#hashtags` (lowercased). */
function itemTags(view: ContentItemView): string[] {
	return parseMarkdownNote(view.body).tags.map((tag) => tag.toLowerCase());
}

/** The earliest custom-date a content item carries in the given calendar, or `null`. */
function itemEarliestDate(view: ContentItemView, calendarId: string): CustomDate | null {
	const dates = [
		...Object.values(view.dateFields).map((field) => field.value),
		...view.timelineRefs.map((ref) => ref.date.value),
	].filter((date) => date.calendarId === calendarId);
	if (dates.length === 0) return null;
	// The earliest in-calendar date is the item's date anchor (deterministic), matching the timeline view.
	return dates.reduce((best, candidate) => {
		const cmp = compareCustomDatesSafe(candidate, best);
		return cmp < 0 ? candidate : best;
	}, dates[0]!);
}

/** Compare two same-calendar dates by their structural ordinals (no calendar definition needed). Pure. */
function compareCustomDatesSafe(a: CustomDate, b: CustomDate): number {
	if (a.year !== b.year) return a.year - b.year;
	if (a.month !== b.month) return a.month - b.month;
	return a.day - b.day;
}

/** One actor-visible search hit. The artifact is always one the actor may see. */
export interface SearchHit {
	/** Stable id of the hit WITHIN its kind (the content item id, the POI id, the handout id, the roll id). */
	id: string;
	/** The content type of the hit (one of the SRCH-001/003 searchable domains). */
	type: SearchContentType;
	/** The visible title/label for the hit (already actor-safe at its source). */
	title: string;
	/** The source the hit was drawn from. */
	source: SearchSourceId;
	/** The folder the hit is filed under, when declared (else `null`). */
	folder: string | null;
	/** The hit's tags (lowercased, deduped). A POI/handout/session-artifact carries no tags (empty). */
	tags: string[];
	/** The map a POI hit belongs to (else `null` — content/handouts/artifacts do not live on a map). */
	mapId: string | null;
	/** A title-match outranks a body/relationship-only match; higher score sorts first. */
	score: number;
}

/** Freshness state of one searched source (SRCH-003 AC2). */
export type SearchSourceFreshness = 'fresh' | 'stale-cached' | 'unavailable';

/** Per-source freshness: whether each searched source returned fresh/stale/unavailable results. */
export interface SearchSourceStatus {
	source: SearchSourceId;
	freshness: SearchSourceFreshness;
	/** How many visible hits this source contributed (computed over the visible set only). */
	matchCount: number;
}

/** The active filters echoed in the result metadata, so the GUI can render the applied facets (AC3). */
export interface ActiveSearchFilters {
	query: string | null;
	sources: SearchSourceId[];
	contentTypes: SearchContentType[];
	tags: string[];
	folder: string | null;
	dateRange: SearchDateRange | null;
	relationship: SearchRelationshipFilter | null;
}

/** The actor-filtered faceted search RESULT. Every hit is visible; counts derive from the visible set only. */
export interface SearchResult {
	/** The hits matching ALL active facets, deterministically ordered. ONLY actor-visible hits appear. */
	hits: SearchHit[];
	/** Total matching visible hits (== `hits.length`). Never inflated by a hidden artifact. */
	totalCount: number;
	/** Per-content-type counts of matching visible hits (the type facet, never revealing a hidden hit). */
	countsByType: Record<SearchContentType, number>;
	/** Per-source freshness + counts. A referenced unavailable source is marked WITHOUT failing the search. */
	sourceStatus: SearchSourceStatus[];
	/** The active filters (AC3): the GUI renders these as the applied-facets summary. */
	activeFilters: ActiveSearchFilters;
}

const EMPTY_TYPE_COUNTS: Record<SearchContentType, number> = Object.freeze({
	note: 0,
	object: 0,
	poi: 0,
	handout: 0,
	'session-artifact': 0,
});

/** Build the echoed active-filters metadata from a (normalized) filter. Pure. */
function describeActiveFilters(filter: SearchFilter): ActiveSearchFilters {
	return {
		query: filter.query ?? null,
		sources: filter.sources ? [...filter.sources] : [],
		contentTypes: filter.contentTypes ? [...filter.contentTypes] : [],
		tags: filter.tags ? [...filter.tags] : [],
		folder: filter.folder ?? null,
		dateRange: filter.dateRange ?? null,
		relationship: filter.relationship ?? null,
	};
}

/**
 * Whether `date` falls within the inclusive `range`'s bounds for `calendar`. A `null` bound is open. A date
 * whose absolute index cannot be computed (invalid) is OUT of range (fail closed). When the calendar is
 * unknown, the date can only be compared structurally (still inclusive + fail-closed on cross-calendar).
 */
function dateInRange(
	calendar: CalendarDefinition | undefined,
	date: CustomDate,
	range: SearchDateRange,
): boolean {
	if (date.calendarId !== range.calendarId) return false;
	if (calendar) {
		if (absoluteDayIndex(calendar, date) === null) return false;
		if (range.from) {
			const cmp = compareCustomDates(calendar, date, range.from);
			if (cmp === null || cmp < 0) return false;
		}
		if (range.to) {
			const cmp = compareCustomDates(calendar, date, range.to);
			if (cmp === null || cmp > 0) return false;
		}
		return true;
	}
	// No calendar definition: compare structurally (year/month/day ordinals) inclusively.
	if (range.from && compareCustomDatesSafe(date, range.from) < 0) return false;
	if (range.to && compareCustomDatesSafe(date, range.to) > 0) return false;
	return true;
}

/** The actor-visible searchable body of a handout: its visible section headings + bodies, joined. */
function handoutSearchableBody(handout: HandoutView): string {
	return handout.sections.map((section) => `${section.heading} ${section.body}`).join(' ');
}

/** The searchable TITLE of a session-artifact (a recorded roll): its label, else its expression. */
function sessionArtifactTitle(roll: DiceRollView): string {
	return roll.label && roll.label.trim() !== '' ? roll.label : roll.expression;
}

/** Whether a hit's tags satisfy the (already-lowercased) required-tags facet (ALL must be present). */
function tagsMatch(hitTags: readonly string[], required: readonly string[] | undefined): boolean {
	if (!required || required.length === 0) return true;
	const set = new Set(hitTags);
	return required.every((tag) => set.has(tag));
}

/** Whether a title/body needle matches a hit's text (blank needle ⇒ always). Returns the match strength. */
function textMatch(title: string, body: string, needle: string): { matched: boolean; titleMatch: boolean } {
	if (needle === '') return { matched: true, titleMatch: false };
	const titleMatch = title.toLowerCase().includes(needle);
	const bodyMatch = body.toLowerCase().includes(needle);
	return { matched: titleMatch || bodyMatch, titleMatch };
}

/**
 * SRCH-003 — resolve the VISIBILITY-SAFE RELATIONSHIP filter to the set of related artifact keys, computed
 * over the actor's VISIBLE graph ONLY. For a `content` anchor: the visible items the anchor wikilinks to
 * (by title) — resolved across the actor-filtered candidate set, so a wikilink to a hidden note yields
 * nothing. For a `poi` anchor: the content item the POI links to (its `linkedEntityId`), when that target
 * is itself visible. A hidden anchor (one not in the visible set) resolves to an EMPTY set, so the whole
 * search returns nothing rather than leaking the existence of hidden related content (SRCH-003 AC4).
 *
 * Returns a Set of `"<type>:<id>"` keys the related artifacts are addressed by, OR `null` when there is no
 * relationship filter (i.e. every artifact is eligible).
 */
function resolveRelatedKeys(
	relationship: SearchRelationshipFilter | undefined,
	visibleItems: ContentItemView[],
	visiblePois: Array<{ poi: MapPoiView; mapId: string }>,
): Set<string> | null {
	if (!relationship) return null;
	const related = new Set<string>();
	const itemByTitle = new Map<string, ContentItemView>();
	const itemById = new Map<string, ContentItemView>();
	for (const item of visibleItems) {
		itemByTitle.set(item.title.toLowerCase(), item);
		itemById.set(item.id, item);
	}

	if (relationship.anchorKind === 'content') {
		// The anchor must itself be visible; a hidden anchor resolves to nothing (fail closed).
		const anchor = itemById.get(relationship.anchorId);
		if (!anchor) return related;
		// Every visible note the anchor wikilinks to (by title) is related. A wikilink to a hidden note
		// resolves to no visible candidate, so it never enters the related set.
		for (const link of parseMarkdownNote(anchor.body).wikilinks) {
			const target = itemByTitle.get(link.target.toLowerCase());
			if (target) related.add(`${target.kind === 'object' ? 'object' : 'note'}:${target.id}`);
		}
		// A POI that links to the visible anchor is also related (the bidirectional POI↔content edge).
		for (const { poi, mapId } of visiblePois) {
			if (poi.linkedEntityId === anchor.id) related.add(`poi:${mapId}:${poi.id}`);
		}
		return related;
	}

	// `poi` anchor: the content item the POI links to, when that target is visible.
	const anchorPoi = visiblePois.find(({ poi }) => poi.id === relationship.anchorId);
	if (!anchorPoi) return related;
	const targetId = anchorPoi.poi.linkedEntityId;
	if (targetId) {
		const target = itemById.get(targetId);
		if (target) related.add(`${target.kind === 'object' ? 'object' : 'note'}:${target.id}`);
	}
	return related;
}

/** The relationship key an artifact is addressed by (matches the keys `resolveRelatedKeys` produces). */
function contentRelKey(item: ContentItemView): string {
	return `${item.kind === 'object' ? 'object' : 'note'}:${item.id}`;
}

function poiRelKey(mapId: string, poiId: string): string {
	return `poi:${mapId}:${poiId}`;
}

/**
 * SRCH-003 — the single actor-filtered FACETED SEARCH read. Composes the actor-filtered content + map
 * reads, applies the source/type/tag/folder/date/relationship/text facets (ALL combined with AND), and
 * returns deterministically ordered visible hits with result metadata (the active filters + per-type +
 * per-source counts). ONLY actor-visible hits appear, and the counts derive from that same visible set,
 * so hidden artifacts are omitted AND never revealed by an inflated count or facet (SRCH-003 AC1, AC4).
 *
 * A REFERENCED but UNAVAILABLE source is marked stale/unavailable in `sourceStatus` WITHOUT failing the
 * whole search (SRCH-003 AC2): the available sources still return their visible cached hits.
 *
 * Pure + deterministic. An unknown/unauthenticated actor yields an empty result (fail closed).
 */
export function searchVaultForActor(
	content: VaultContentState,
	maps: MapState,
	permissions: PermissionState,
	session: SessionState | undefined,
	actorId: string,
	filter: SearchFilter,
	dateFormat: CalendarDateFormat = 'medium',
): SearchResult {
	const actor = permissions.actors[actorId];
	const activeFilters = describeActiveFilters(filter);
	if (!actor) {
		// Fail closed: an unknown/unauthenticated actor sees nothing — no hits, no source status.
		return {
			hits: [],
			totalCount: 0,
			countsByType: { ...EMPTY_TYPE_COUNTS },
			sourceStatus: [],
			activeFilters,
		};
	}

	const needle = (filter.query ?? '').trim().toLowerCase();
	const typeSet = new Set<SearchContentType>(filter.contentTypes ?? SEARCH_CONTENT_TYPES);
	const sourceSet = filter.sources && filter.sources.length > 0 ? new Set(filter.sources) : null;
	const calendar = filter.dateRange ? content.calendars[filter.dateRange.calendarId] : undefined;

	// Every candidate is drawn from an actor-filtered read, so visibility is decided before search sees it.
	const visibleItems = getContentItemsForActor(content, permissions, actorId, dateFormat);
	const deliveredMapIds = deliveredMapIdsForActor(session, actorId);
	const visiblePois: Array<{ poi: MapPoiView; mapId: string }> = [];
	for (const mapId of Object.keys(maps.maps)) {
		const view = getMapViewForActor(maps, permissions, actorId, mapId, { deliveredMapIds });
		if (view.kind !== 'available') continue;
		for (const poi of view.pois) visiblePois.push({ poi, mapId });
	}

	// The relationship filter is resolved over the VISIBLE graph only (null ⇒ no relationship constraint).
	const relatedKeys = resolveRelatedKeys(filter.relationship, visibleItems, visiblePois);

	const hits: SearchHit[] = [];
	// Track which sources we actually contribute hits from + their availability, for the freshness map.
	const sourceMatchCount = new Map<SearchSourceId, number>();
	const sourceUnavailable = new Map<SearchSourceId, boolean>();
	const noteSource = (referenced: SearchSourceId): void => {
		sourceMatchCount.set(referenced, sourceMatchCount.get(referenced) ?? 0);
	};

	// --- Content hits (notes + structured objects) ---
	for (const item of visibleItems) {
		const type: SearchContentType = item.kind === 'object' ? 'object' : 'note';
		if (!typeSet.has(type)) continue;
		const source = itemSource(item);
		noteSource(source);
		// An item on an UNAVAILABLE source is recorded for freshness but still returns its cached result.
		if (!itemSourceAvailable(item)) sourceUnavailable.set(source, true);
		if (sourceSet && !sourceSet.has(source)) continue;
		const folder = itemFolder(item);
		if (filter.folder && folder !== filter.folder) continue;
		const tags = itemTags(item);
		if (!tagsMatch(tags, filter.tags)) continue;
		if (filter.dateRange) {
			const date = itemEarliestDate(item, filter.dateRange.calendarId);
			if (!date || !dateInRange(calendar, date, filter.dateRange)) continue;
		}
		if (relatedKeys && !relatedKeys.has(contentRelKey(item))) continue;
		const body = parseMarkdownNote(item.body).body;
		const { matched, titleMatch } = textMatch(item.title, body, needle);
		if (!matched) continue;
		hits.push({
			id: item.id,
			type,
			title: item.title,
			source,
			folder,
			tags,
			mapId: null,
			score: titleMatch ? 2 : 1,
		});
		sourceMatchCount.set(source, (sourceMatchCount.get(source) ?? 0) + 1);
	}

	// --- POI hits (map POIs live on the local vault source) ---
	if (typeSet.has('poi')) {
		const poiSource: SearchSourceId = 'local-markdown';
		noteSource(poiSource);
		for (const { poi, mapId } of visiblePois) {
			if (sourceSet && !sourceSet.has(poiSource)) break; // POIs only live on the local source.
			// A POI has no folder/tags/date — only a relationship/text/source/type facet can match/exclude it.
			if (filter.folder) continue; // POIs are unfiled.
			if (filter.tags && filter.tags.length > 0) continue; // POIs carry no tags.
			if (filter.dateRange) continue; // POIs carry no custom date in this model.
			if (relatedKeys && !relatedKeys.has(poiRelKey(mapId, poi.id))) continue;
			const { matched, titleMatch } = textMatch(poi.label, poi.notes, needle);
			if (!matched) continue;
			hits.push({
				id: poi.id,
				type: 'poi',
				title: poi.label,
				source: poiSource,
				folder: null,
				tags: [],
				mapId,
				score: titleMatch ? 2 : 1,
			});
			sourceMatchCount.set(poiSource, (sourceMatchCount.get(poiSource) ?? 0) + 1);
		}
	}

	// --- HANDOUT hits (SES-004 handouts live on the session/local source) ---
	// Every candidate is drawn from the actor-filtered handout read, so a non-recipient's handout — and a
	// withheld/unrevealed SECTION — is never even a candidate (SRCH-001 AC2). The searchable text is the
	// title + only the sections the actor may see.
	if (typeSet.has('handout')) {
		const handoutSource: SearchSourceId = 'local-markdown';
		noteSource(handoutSource);
		if (!sourceSet || sourceSet.has(handoutSource)) {
			for (const handout of session ? getHandoutsForActor(session, permissions, actorId) : []) {
				// A handout carries no folder/tags/date — only a text/source/type facet can match/exclude it.
				if (filter.folder) continue;
				if (filter.tags && filter.tags.length > 0) continue;
				if (filter.dateRange) continue;
				if (relatedKeys) continue; // handouts are not in the wikilink/POI relationship graph.
				const visibleBody = handoutSearchableBody(handout);
				const { matched, titleMatch } = textMatch(handout.title, visibleBody, needle);
				if (!matched) continue;
				hits.push({
					id: handout.id,
					type: 'handout',
					title: handout.title,
					source: handoutSource,
					folder: null,
					tags: [],
					mapId: null,
					score: titleMatch ? 2 : 1,
				});
				sourceMatchCount.set(handoutSource, (sourceMatchCount.get(handoutSource) ?? 0) + 1);
			}
		}
	}

	// --- SESSION ARTIFACT hits (SES-003 recorded dice rolls; live on the session/local source) ---
	// Drawn from the actor-filtered roll history, so a `dm-only` secret roll is never a candidate for a
	// non-DM (SRCH-001 AC2). The searchable text is the visible expression + label.
	if (typeSet.has('session-artifact')) {
		const artifactSource: SearchSourceId = 'local-markdown';
		noteSource(artifactSource);
		if (!sourceSet || sourceSet.has(artifactSource)) {
			for (const roll of session ? getDiceHistoryForActor(session, permissions, actorId).rolls : []) {
				if (filter.folder) continue;
				if (filter.tags && filter.tags.length > 0) continue;
				if (filter.dateRange) continue;
				if (relatedKeys) continue; // session artifacts are not in the relationship graph.
				const title = sessionArtifactTitle(roll);
				const { matched, titleMatch } = textMatch(title, roll.label ?? '', needle);
				if (!matched) continue;
				hits.push({
					id: roll.id,
					type: 'session-artifact',
					title,
					source: artifactSource,
					folder: null,
					tags: [],
					mapId: null,
					score: titleMatch ? 2 : 1,
				});
				sourceMatchCount.set(artifactSource, (sourceMatchCount.get(artifactSource) ?? 0) + 1);
			}
		}
	}

	// Deterministic order: title-matches first (higher score), then by stable type order, then id.
	hits.sort(compareHits);

	const countsByType: Record<SearchContentType, number> = { ...EMPTY_TYPE_COUNTS };
	for (const hit of hits) countsByType[hit.type] += 1;

	// Per-source freshness: a referenced source with any unavailable contributor is `stale-cached` (it
	// still returned its cached visible hits); a fully-available source is `fresh`. An explicitly requested
	// source the actor has NO visible content for is reported `unavailable` so the GUI can surface it
	// (SRCH-003 AC2) — without failing the whole search.
	const referencedSources = new Set<SearchSourceId>(sourceMatchCount.keys());
	if (sourceSet) for (const source of sourceSet) referencedSources.add(source);
	const sourceStatus: SearchSourceStatus[] = SEARCH_SOURCE_IDS.filter((source) =>
		referencedSources.has(source),
	).map((source) => {
		const matchCount = sourceMatchCount.get(source) ?? 0;
		let freshness: SearchSourceFreshness;
		if (sourceUnavailable.get(source)) {
			freshness = 'stale-cached';
		} else if (matchCount === 0 && sourceSet?.has(source)) {
			freshness = 'unavailable';
		} else {
			freshness = 'fresh';
		}
		return { source, freshness, matchCount };
	});

	return {
		hits,
		totalCount: hits.length,
		countsByType,
		sourceStatus,
		activeFilters,
	};
}

/** Stable type order for tie-breaking, matching the content-type facet order. */
const TYPE_ORDER: Record<SearchContentType, number> = {
	note: 0,
	object: 1,
	poi: 2,
	handout: 3,
	'session-artifact': 4,
};

/**
 * Deterministic ordering for hits: by score descending (title-matches first), then by a stable type order,
 * then by id. Equal-score hits always order identically across repeated runs and fresh fixtures (SRCH-005
 * stable tie-breaks; applied here so the search list is reproducible).
 */
function compareHits(a: SearchHit, b: SearchHit): number {
	if (a.score !== b.score) return b.score - a.score;
	if (a.type !== b.type) return TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
	return a.id.localeCompare(b.id);
}
