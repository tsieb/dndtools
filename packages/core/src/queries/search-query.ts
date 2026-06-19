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
import { parseMarkdownNote, slugifyHeading } from '../state/markdown';
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
 * RANKING (SRCH-005): the read ranks the visible hits by a DETERMINISTIC composite score built from
 * recency, title, tag, link, entity-type, and session-context signals — computed BEFORE any optional AI
 * assistance (Vision "Algorithms are primary"). The signals are derived ENTIRELY from the actor-visible set,
 * so a hidden artifact never influences ranking, and equal-score hits fall back to stable tie-breakers (type
 * order → id) so the order is reproducible across repeated runs and fresh fixtures (AC3). The per-signal
 * breakdown is exposed as a deterministic DIAGNOSTIC so the GUI/debugging can explain the order (SRCH-011 AC4).
 *
 * RESULT CONTEXT (SRCH-006): each hit carries enough context for fast disambiguation — title, source, type,
 * a VISIBLE snippet, tags, and visibility-safe RELATIONSHIP HINTS (visible backlinks, date references, folder
 * path, and map/Scene context). Every context field is derived from the SAME actor-filtered reads as the hit
 * itself, so a snippet NEVER crosses a hidden section boundary and a relationship hint NEVER names a hidden
 * related artifact (AC2, AC3) — the context is as fail-closed as the hit.
 *
 * SEMANTIC ASSIST (SRCH-011): semantic search / entity expansion is OPTIONAL, SECONDARY, and OFF by default.
 * It is applied as a thin LABELLED layer over the ALREADY-VISIBLE deterministic result: it can only
 * re-order or annotate hits the actor can already see, it CANNOT add a hit / title / snippet / id, it carries
 * SOURCE CITATIONS, and it never replaces the deterministic base ranking without a visible label (AC2, AC4).
 * When it is disabled or unavailable the deterministic result is returned unchanged (AC1, AC3).
 *
 * Pure + deterministic: the same (state, actor, filter[, options]) always returns the same ranked result. The
 * Processing Core owns the facet filters, text match, ranking, snippeting, and relationship hints; the GUI
 * renders the computed result and dispatches command intents only (Architecture Contract 1).
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

/**
 * SRCH-005 — the DETERMINISTIC ranking signals for ONE hit. Each is a non-negative integer contribution to
 * the composite {@link SearchHit.score}; they are summed into the score AND exposed as a diagnostic so the
 * order is explainable and reproducible (SRCH-011 AC4). Every signal is derived from the actor-VISIBLE set,
 * so no hidden artifact can influence any signal. A blank-query browse leaves the text signals at zero and
 * ranks on recency + session context alone.
 */
export interface RankingSignals {
	/** TITLE signal: the query matched the hit's title (the strongest text signal). */
	title: number;
	/** TAG signal: the query matched one of the hit's tags. */
	tag: number;
	/** LINK signal: the hit has visible relationship hints (visible backlinks / linked content). */
	link: number;
	/** ENTITY-TYPE signal: a small stable bias by content type (notes/objects before transient artifacts). */
	entityType: number;
	/** SESSION-CONTEXT signal: the hit is in the active session's focus (e.g. a POI on the active map). */
	sessionContext: number;
	/** RECENCY signal: how recently the hit's underlying artifact was updated, bucketed deterministically. */
	recency: number;
}

/**
 * SRCH-006 — a single visible SNIPPET of a hit's matched context. The text is drawn from the SAME
 * actor-filtered searchable text the hit matched on (the visible title, the visible body, or the visible
 * handout sections), so it can NEVER reveal hidden/redacted text or a now-hidden match (AC2). `null` when
 * there is no body context to show (e.g. a pure title match, or a blank-query browse).
 */
export interface SearchSnippet {
	/** Which visible field the snippet came from. */
	field: 'title' | 'body';
	/** A short window of surrounding text containing the match (plain text, frontmatter stripped). */
	text: string;
}

/**
 * SRCH-006 — the VISIBILITY-SAFE relationship hints for a hit, for fast disambiguation. EVERY hint is
 * computed over the actor's VISIBLE graph only, so a hint never names a hidden related artifact, a hidden
 * backlink, or a redacted reference (AC3). All lists are empty / `null` when there is nothing visible to show.
 */
export interface SearchRelationshipHints {
	/** Titles of VISIBLE notes/objects that wikilink TO this hit (visible backlinks). Deduped, stable order. */
	backlinks: string[];
	/** Stable formatted date references this hit carries (the item's visible custom-date displays). */
	dateRefs: string[];
	/** The folder path the hit is filed under, when declared and visible (mirrors {@link SearchHit.folder}). */
	folder: string | null;
	/** The map a POI hit lives on (mirrors {@link SearchHit.mapId}); `null` for non-map hits. */
	mapId: string | null;
}

const EMPTY_RELATIONSHIP_HINTS: Readonly<SearchRelationshipHints> = Object.freeze({
	backlinks: [],
	dateRefs: [],
	folder: null,
	mapId: null,
});

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
	/**
	 * SRCH-007 AC2 — for a note/object hit with a BODY match that falls under a Markdown heading, the
	 * deterministic anchor slug of that heading (`slugifyHeading` of the heading text, disambiguated for
	 * duplicates). `null` when the match is a title-only match, when there is no heading above the match
	 * position, or for non-note/object domains (POI/handout/session-artifact). The GUI passes this to
	 * {@link resolveSearchResultOpen} as `headingAnchor` so the resolved hash navigates to the matched
	 * section rather than just the note root.
	 */
	headingAnchor?: string | null;
	/**
	 * SRCH-005 — the DETERMINISTIC composite ranking score (the sum of {@link RankingSignals}). Higher sorts
	 * first. Equal scores fall back to stable tie-breakers (type order → id) so the order is reproducible.
	 */
	score: number;
	/** SRCH-005 / SRCH-011 — the per-signal breakdown of `score`, exposed as a deterministic diagnostic. */
	signals: RankingSignals;
	/** SRCH-006 — a VISIBLE snippet of matched body context (or `null` for a title-only / blank-query hit). */
	snippet: SearchSnippet | null;
	/** SRCH-006 — the visibility-safe relationship hints (visible backlinks, date refs, folder, map context). */
	relationships: SearchRelationshipHints;
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

/**
 * SRCH-011 — the status of OPTIONAL semantic assistance over a result. Semantic search / entity expansion is
 * SECONDARY to deterministic search and may be `disabled` (off — the default), `unavailable` (requested but
 * the model is offline/absent), or `applied` (a labelled re-order/annotation over the visible deterministic
 * result). In EVERY state the deterministic hits are returned; `disabled`/`unavailable` returns them
 * unchanged. The GUI renders this as the visible "semantic contribution" label (AC4).
 */
export interface SemanticAssistStatus {
	state: 'disabled' | 'unavailable' | 'applied';
	/** True only when semantic re-ranking changed the deterministic order (so the GUI shows the label). */
	reranked: boolean;
	/** When `unavailable`, a generic, non-leaking reason the GUI surfaces (e.g. "offline"). */
	reason: string | null;
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
	/**
	 * SRCH-005 / SRCH-011 — the DETERMINISTIC base order of hit ids, BEFORE any optional semantic re-ranking.
	 * Preserved as a debugging diagnostic so the deterministic ranking is always inspectable even when
	 * semantic assist re-orders the visible list (SRCH-011 AC4).
	 */
	deterministicOrder: string[];
	/** SRCH-011 — the status of optional semantic assistance (disabled by default; secondary to deterministic). */
	semanticAssist: SemanticAssistStatus;
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

/** SRCH-005 — whether the free-text needle matches one of a hit's tags (the TAG ranking signal). */
function tagMatchesNeedle(hitTags: readonly string[], needle: string): boolean {
	if (needle === '') return false;
	return hitTags.some((tag) => tag.includes(needle));
}

/** The result of matching a needle against a hit's visible title + body. */
interface TextMatch {
	/** Whether the needle matched at all (always true for a blank needle — every visible artifact matches). */
	matched: boolean;
	/** Whether the needle matched the TITLE (the strongest text signal). */
	titleMatch: boolean;
	/** Whether the needle matched the BODY (drives the body snippet). */
	bodyMatch: boolean;
}

/** Whether a title/body needle matches a hit's text (blank needle ⇒ always). Returns the match strength. */
function textMatch(title: string, body: string, needle: string): TextMatch {
	if (needle === '') return { matched: true, titleMatch: false, bodyMatch: false };
	const titleMatch = title.toLowerCase().includes(needle);
	const bodyMatch = body.toLowerCase().includes(needle);
	return { matched: titleMatch || bodyMatch, titleMatch, bodyMatch };
}

/** How much surrounding context a body snippet shows on each side of the match. */
const SNIPPET_RADIUS = 40;

/**
 * SRCH-006 — build a single VISIBLE snippet around the FIRST occurrence of `needle` in `body`. The `body`
 * passed here is ALWAYS the actor's visible searchable text (the visible note body, or the visible handout
 * sections joined) — never raw state — so the window can never include hidden/redacted text (AC2). Returns
 * `null` when there is no body match (a pure title match shows the title, not a body snippet). Pure.
 */
function bodySnippet(body: string, needle: string): SearchSnippet | null {
	if (needle === '') return null;
	const index = body.toLowerCase().indexOf(needle);
	if (index === -1) return null;
	const start = Math.max(0, index - SNIPPET_RADIUS);
	const end = Math.min(body.length, index + needle.length + SNIPPET_RADIUS);
	const prefix = start > 0 ? '…' : '';
	const suffix = end < body.length ? '…' : '';
	return { field: 'body', text: `${prefix}${body.slice(start, end).trim()}${suffix}` };
}

// ATX heading line pattern (mirrors the one in markdown.ts).
const HEADING_LINE_PATTERN = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
// Code-fence delimiter pattern (mirrors markdown.ts).
const CODE_FENCE_PATTERN = /^\s*(```|~~~)/;

/**
 * SRCH-007 AC2 — return the deterministic anchor slug of the LAST ATX heading that begins AT or BEFORE
 * `matchOffset` in `body`, or `null` when no heading precedes the match. This identifies which heading
 * section a body match falls into, so a search-opened note link can navigate directly to that section.
 *
 * Mirrors the heading-scanning logic of {@link headingAnchors} (markdown.ts) with cumulative offset
 * tracking; code fences are respected so a `#` inside a fence is never mistaken for a heading. Pure.
 */
function headingAnchorForOffset(body: string, matchOffset: number): string | null {
	let offset = 0;
	let lastAnchor: string | null = null;
	let inFence = false;
	const seen = new Map<string, number>();
	for (const rawLine of body.split(/\r?\n/)) {
		if (offset > matchOffset) break;
		const line = rawLine.trimEnd();
		if (CODE_FENCE_PATTERN.test(line)) {
			inFence = !inFence;
		} else if (!inFence) {
			const m = HEADING_LINE_PATTERN.exec(line);
			if (m) {
				const text = m[2]!.trim();
				const base = slugifyHeading(text);
				if (base !== '') {
					const count = seen.get(base) ?? 0;
					seen.set(base, count + 1);
					lastAnchor = count === 0 ? base : `${base}-${count + 1}`;
				}
			}
		}
		// +1 accounts for the newline consumed by split.
		offset += rawLine.length + 1;
	}
	return lastAnchor;
}

/**
 * SRCH-005 — bucket a hit's recency into a small DETERMINISTIC integer signal from its visible `updatedAt`
 * timestamp, anchored to the result's most-recent visible timestamp (`anchor`). A more recent artifact scores
 * higher. The bucketing is monotonic and clock-free — it compares only the two ISO strings supplied — so the
 * same fixtures always produce the same recency signal (AC3). The buckets fan out from the anchor (most recent
 * == highest), with finer resolution near the anchor so two artifacts edited minutes apart still differ. A hit
 * with no timestamp scores 0. The anchor is the latest VISIBLE timestamp, so no hidden artifact moves a bucket.
 */
function recencySignal(updatedAt: string | null, anchor: string | null): number {
	if (!updatedAt || !anchor) return 0;
	// Both are ISO-8601 timestamps; their lexical order matches chronological order. Compute the gap in
	// minutes from the parsed epoch millis (a pure transform of the two strings — no ambient clock).
	const updatedMs = Date.parse(updatedAt);
	const anchorMs = Date.parse(anchor);
	if (Number.isNaN(updatedMs) || Number.isNaN(anchorMs)) return 0;
	const ageMinutes = Math.max(0, (anchorMs - updatedMs) / 60_000);
	if (ageMinutes < 1) return 6; // the freshest visible artifact(s) — minutes from the anchor
	if (ageMinutes < 60) return 5; // within the hour
	if (ageMinutes < 1440) return 4; // within the day
	if (ageMinutes < 1440 * 7) return 3; // within the week
	if (ageMinutes < 1440 * 31) return 2; // within the month
	if (ageMinutes < 1440 * 366) return 1; // within the year
	return 0;
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
 * SRCH-006 — build the VISIBLE BACKLINK index: for each visible content item title, the titles of the visible
 * notes that wikilink TO it. Computed ENTIRELY over the actor's visible items, so a backlink hint can never
 * name a hidden note nor reveal that a hidden note links to a visible one (AC3). Titles are deduped, in stable
 * (sorted) order. Pure.
 */
function buildVisibleBacklinks(visibleItems: ContentItemView[]): Map<string, string[]> {
	const idByTitle = new Map<string, string>();
	for (const item of visibleItems) idByTitle.set(item.title.toLowerCase(), item.id);
	const backlinksById = new Map<string, Set<string>>();
	for (const source of visibleItems) {
		for (const link of parseMarkdownNote(source.body).wikilinks) {
			const targetId = idByTitle.get(link.target.toLowerCase());
			if (targetId === undefined || targetId === source.id) continue;
			const set = backlinksById.get(targetId) ?? new Set<string>();
			set.add(source.title);
			backlinksById.set(targetId, set);
		}
	}
	const result = new Map<string, string[]>();
	for (const [id, titles] of backlinksById) {
		result.set(id, [...titles].sort((a, b) => a.localeCompare(b)));
	}
	return result;
}

/** The latest `updatedAt` across the actor's visible items — the recency anchor (or `null` when none). Pure. */
function latestVisibleTimestamp(visibleItems: ContentItemView[]): string | null {
	let latest: string | null = null;
	for (const item of visibleItems) {
		if (latest === null || item.updatedAt > latest) latest = item.updatedAt;
	}
	return latest;
}

/** The stable formatted date references a visible item carries (its date-field + timeline-ref displays). */
function itemDateRefs(item: ContentItemView): string[] {
	const refs = new Set<string>();
	for (const field of Object.values(item.dateFields)) refs.add(field.display);
	for (const ref of item.timelineRefs) refs.add(ref.date.display);
	return [...refs].sort((a, b) => a.localeCompare(b));
}

/**
 * SRCH-005 — combine a hit's deterministic ranking signals into its composite score. The weights encode the
 * ordering priority required by SRCH-005 (a title match dominates; tag/link/session-context refine; recency
 * and a small entity-type bias break otherwise-equal text matches). Pure: the same signals always sum to the
 * same score, so the order is reproducible across repeated runs and fresh fixtures (AC3).
 */
function combineScore(signals: RankingSignals): number {
	return (
		signals.title * 100 +
		signals.tag * 20 +
		signals.link * 10 +
		signals.sessionContext * 8 +
		signals.recency * 2 +
		signals.entityType
	);
}

/** The deterministic ENTITY-TYPE bias (durable content ranks above transient session artifacts). */
const ENTITY_TYPE_SIGNAL: Record<SearchContentType, number> = {
	note: 4,
	object: 4,
	poi: 3,
	handout: 2,
	'session-artifact': 1,
};

/**
 * SRCH-011 — the OPTIONAL semantic-assist input. A caller (the GUI) supplies it ONLY when the user has
 * turned semantic search / entity expansion ON; absent ⇒ semantic assist is `disabled` (the default —
 * deterministic search is primary). It is intentionally a thin, provider-agnostic seam: a final search
 * architecture decision is deferred (SRCH-011), so the core does not embed a model. It can re-rank the
 * ALREADY-VISIBLE hits and must cite the deterministic source it drew on; it can NEVER add a hit.
 */
export interface SemanticAssist {
	/** Whether the user enabled semantic assistance. When false the deterministic result is returned as-is. */
	enabled: boolean;
	/** Whether the semantic model is currently available (e.g. false when offline). Defaults to available. */
	available?: boolean;
	/**
	 * A pure re-ranker over the VISIBLE deterministic hits: given the actor-visible hits (in deterministic
	 * order) it returns an ordering of the SAME hit ids (a permutation). Any id it omits keeps its
	 * deterministic position; any id NOT already in the visible set is IGNORED — so semantic assist can never
	 * introduce a hidden title, snippet, or id (SRCH-011 AC2). When omitted, semantic assist annotates without
	 * re-ordering.
	 */
	rerank?: (hits: readonly SearchHit[]) => string[];
}

/** Optional extras for a search run: date formatting + the optional semantic-assist seam (SRCH-011). */
export interface SearchOptions {
	dateFormat?: CalendarDateFormat;
	/** SRCH-011 — optional semantic assistance (off by default; secondary to deterministic search). */
	semantic?: SemanticAssist;
}

/**
 * SRCH-003 / SRCH-005 / SRCH-006 / SRCH-011 — the single actor-filtered FACETED SEARCH read. Composes the
 * actor-filtered content + map reads, applies the source/type/tag/folder/date/relationship/text facets (ALL
 * combined with AND), and returns DETERMINISTICALLY RANKED visible hits with rich, visibility-safe RESULT
 * CONTEXT plus result metadata (the active filters + per-type + per-source counts). ONLY actor-visible hits
 * appear, and the counts derive from that same visible set, so hidden artifacts are omitted AND never
 * revealed by an inflated count or facet (SRCH-003 AC1, AC4).
 *
 * RANKING (SRCH-005): hits are ordered by a deterministic composite score (recency, title, tag, link,
 * entity-type, session-context signals — every signal derived from the visible set) with stable tie-breakers,
 * computed BEFORE any optional AI assistance. The per-signal breakdown is exposed for diagnostics.
 *
 * RESULT CONTEXT (SRCH-006): each hit carries a VISIBLE snippet + visibility-safe relationship hints (visible
 * backlinks, date refs, folder, map/Scene context), all derived from the same actor-filtered reads as the hit.
 *
 * SEMANTIC ASSIST (SRCH-011): when `options.semantic` is enabled AND available, a LABELLED re-rank may be
 * applied over the visible hits without changing membership; the deterministic order is preserved as a
 * diagnostic. When disabled/unavailable the deterministic result is returned unchanged.
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
	options: SearchOptions | CalendarDateFormat = {},
): SearchResult {
	// Back-compat: callers may still pass a bare `dateFormat` string (the prior 7th positional arg).
	const resolvedOptions: SearchOptions = typeof options === 'string' ? { dateFormat: options } : options;
	const dateFormat: CalendarDateFormat = resolvedOptions.dateFormat ?? 'medium';
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
			deterministicOrder: [],
			semanticAssist: { state: 'disabled', reranked: false, reason: null },
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

	// SRCH-006 — the VISIBLE backlink index (which visible notes link to each visible item), for relationship
	// hints. SRCH-005 — the recency anchor (the latest VISIBLE timestamp) + the active-session map context.
	const visibleBacklinks = buildVisibleBacklinks(visibleItems);
	const recencyAnchor = latestVisibleTimestamp(visibleItems);
	// SRCH-005 AC2 — the session's ACTIVE map (DM-selected) AND any map projected to THIS actor count as
	// session focus; a POI on a focused map ranks higher than an unrelated POI. Derived from the actor's
	// visible projection set, so no hidden map influences the boost.
	const focusedMapIds = new Set<string>(deliveredMapIds);
	if (session?.activeMap) focusedMapIds.add(session.activeMap.mapId);

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
		const match = textMatch(item.title, body, needle);
		if (!match.matched) continue;
		// SRCH-006 — visibility-safe relationship hints: visible backlinks + the item's own visible date refs +
		// its folder. The body snippet is taken from the SAME visible body searched, so it can't reveal hidden text.
		const backlinks = visibleBacklinks.get(item.id) ?? [];
		const relationships: SearchRelationshipHints = {
			backlinks,
			dateRefs: itemDateRefs(item),
			folder,
			mapId: null,
		};
		// SRCH-005 — deterministic signals from the visible item only.
		const signals: RankingSignals = {
			title: match.titleMatch ? 1 : 0,
			tag: tagMatchesNeedle(tags, needle) ? 1 : 0,
			link: backlinks.length > 0 ? 1 : 0,
			entityType: ENTITY_TYPE_SIGNAL[type],
			sessionContext: 0,
			recency: recencySignal(item.updatedAt, recencyAnchor),
		};
		// SRCH-007 AC2 — when the match is in the body (not title-only), find the heading above the match
		// position so the search-opened note can navigate to that section. Pure: a function of body + needle.
		const bodyMatchOffset = match.bodyMatch ? body.toLowerCase().indexOf(needle) : -1;
		const headingAnchor = bodyMatchOffset >= 0 ? headingAnchorForOffset(body, bodyMatchOffset) : null;
		hits.push({
			id: item.id,
			type,
			title: item.title,
			source,
			folder,
			tags,
			mapId: null,
			headingAnchor,
			score: combineScore(signals),
			signals,
			snippet: match.bodyMatch ? bodySnippet(body, needle) : null,
			relationships,
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
			const match = textMatch(poi.label, poi.notes, needle);
			if (!match.matched) continue;
			// SRCH-006 — a POI's relationship hint is its map context; its notes are visible (it's a visible POI),
			// so a body snippet over those notes can't leak hidden text. SRCH-005 AC2 — a POI on a session-focused
			// map (the active/projected map) ranks higher than an unrelated POI.
			const onFocusedMap = focusedMapIds.has(mapId);
			const linkVisible = poi.linkedEntityId !== null;
			const signals: RankingSignals = {
				title: match.titleMatch ? 1 : 0,
				tag: 0,
				link: linkVisible ? 1 : 0,
				entityType: ENTITY_TYPE_SIGNAL.poi,
				sessionContext: onFocusedMap ? 1 : 0,
				recency: 0,
			};
			hits.push({
				id: poi.id,
				type: 'poi',
				title: poi.label,
				source: poiSource,
				folder: null,
				tags: [],
				mapId,
				score: combineScore(signals),
				signals,
				snippet: match.bodyMatch ? bodySnippet(poi.notes, needle) : null,
				relationships: { backlinks: [], dateRefs: [], folder: null, mapId },
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
				const match = textMatch(handout.title, visibleBody, needle);
				if (!match.matched) continue;
				// SRCH-006 AC2 — the snippet is taken from `visibleBody`, which is ONLY the sections the actor may
				// see (a `dm-only`/unrevealed section is never in it), so a handout snippet can never cross a hidden
				// section boundary. SRCH-005 — handouts have a meaningful updatedAt for recency.
				const signals: RankingSignals = {
					title: match.titleMatch ? 1 : 0,
					tag: 0,
					link: 0,
					entityType: ENTITY_TYPE_SIGNAL.handout,
					sessionContext: 0,
					recency: recencySignal(handout.updatedAt, recencyAnchor),
				};
				hits.push({
					id: handout.id,
					type: 'handout',
					title: handout.title,
					source: handoutSource,
					folder: null,
					tags: [],
					mapId: null,
					score: combineScore(signals),
					signals,
					snippet: match.bodyMatch ? bodySnippet(visibleBody, needle) : null,
					relationships: { ...EMPTY_RELATIONSHIP_HINTS },
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
				const match = textMatch(title, roll.label ?? '', needle);
				if (!match.matched) continue;
				// SRCH-005 — recency from the roll timestamp (the most session-relevant signal for a roll record).
				const signals: RankingSignals = {
					title: match.titleMatch ? 1 : 0,
					tag: 0,
					link: 0,
					entityType: ENTITY_TYPE_SIGNAL['session-artifact'],
					sessionContext: 0,
					recency: recencySignal(roll.rolledAt, recencyAnchor),
				};
				hits.push({
					id: roll.id,
					type: 'session-artifact',
					title,
					source: artifactSource,
					folder: null,
					tags: [],
					mapId: null,
					score: combineScore(signals),
					signals,
					// A roll has no body to snippet beyond its label, which IS the title for a labelled roll.
					snippet: null,
					relationships: { ...EMPTY_RELATIONSHIP_HINTS },
				});
				sourceMatchCount.set(artifactSource, (sourceMatchCount.get(artifactSource) ?? 0) + 1);
			}
		}
	}

	// SRCH-005 — deterministic order: composite score descending, then stable type order, then id. This runs
	// BEFORE any optional AI assistance, so the deterministic base ranking always exists (AC1).
	hits.sort(compareHits);
	const deterministicOrder = hits.map((hit) => hit.id);

	// SRCH-011 — OPTIONAL, SECONDARY, LABELLED semantic assist over the ALREADY-VISIBLE hits. It can only
	// re-order hits the actor can already see; it can never add a hit, title, snippet, or id. When disabled or
	// unavailable the deterministic order above is preserved unchanged (AC1, AC3).
	const semanticAssist = applySemanticAssist(hits, resolvedOptions.semantic);

	const countsByType: Record<SearchContentType, number> = { ...EMPTY_TYPE_COUNTS };
	for (const hit of hits) countsByType[hit.type] += 1;

	// Per-source freshness: a referenced source with any unavailable contributor is `stale-cached` (it
	// still returned its cached visible hits); a fully-available source is `fresh`. An explicitly requested
	// source the actor has NO visible content for is reported `unavailable` so the GUI can surface it
	// (SRCH-003 AC2) — without failing the whole search.
	// When an explicit source filter is active, `sourceStatus` reflects EXACTLY the requested sources
	// (a requested-but-empty source is still reported `unavailable`). A source the user filtered OUT must
	// not appear, even though a candidate of that source was touched while building hits. With no filter,
	// every source the actor has visible content for is reported.
	const referencedSources = sourceSet
		? new Set<SearchSourceId>(sourceSet)
		: new Set<SearchSourceId>(sourceMatchCount.keys());
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
		deterministicOrder,
		semanticAssist,
	};
}

/**
 * SRCH-011 — apply OPTIONAL semantic assistance over the already-ranked, already-visible `hits` IN PLACE,
 * returning the resulting {@link SemanticAssistStatus}. This is the one place semantic re-ranking is allowed,
 * and it is deliberately constrained so it can NEVER widen the result or leak hidden content:
 *
 *   - SECONDARY + OFF BY DEFAULT: when `semantic` is absent or `enabled` is false, the deterministic order is
 *     left untouched and the status is `disabled` (SRCH-011 AC1 — deterministic search always works).
 *   - UNAVAILABLE DEGRADES, NEVER FAILS: when the model is unavailable (e.g. offline), the deterministic
 *     hits are STILL returned unchanged and the status is `unavailable` with a generic reason (AC3).
 *   - MEMBERSHIP IS FIXED: the re-ranker may only REORDER the existing visible hit ids. Any id it returns that
 *     is not already a visible hit is IGNORED, and any visible hit it omits keeps its deterministic position —
 *     so semantic assist can never introduce a hidden title/snippet/id (AC2).
 *   - LABELLED: `reranked` is true only when the order actually changed, so the GUI labels the semantic
 *     contribution while the deterministic order remains available as a diagnostic (AC4).
 */
function applySemanticAssist(
	hits: SearchHit[],
	semantic: SemanticAssist | undefined,
): SemanticAssistStatus {
	if (!semantic || !semantic.enabled) {
		return { state: 'disabled', reranked: false, reason: null };
	}
	if (semantic.available === false) {
		// Degrade, do not fail: the deterministic cached results are still returned in their deterministic order.
		return { state: 'unavailable', reranked: false, reason: 'Semantic model unavailable.' };
	}
	if (!semantic.rerank) {
		// Enabled + available but no re-ranker supplied: a pure annotation pass, deterministic order preserved.
		return { state: 'applied', reranked: false, reason: null };
	}

	const byId = new Map(hits.map((hit) => [hit.id, hit]));
	const before = hits.map((hit) => hit.id);
	const proposed = semantic.rerank(hits.slice());
	// Keep only ids that are ALREADY visible hits, in the proposed order, deduped (membership is fixed).
	const seen = new Set<string>();
	const reordered: SearchHit[] = [];
	for (const id of proposed) {
		if (seen.has(id)) continue;
		const hit = byId.get(id);
		if (!hit) continue; // ignore any id the re-ranker invented — it can never add a hidden hit.
		seen.add(id);
		reordered.push(hit);
	}
	// Any visible hit the re-ranker omitted keeps its deterministic position, appended in deterministic order.
	for (const hit of hits) {
		if (!seen.has(hit.id)) reordered.push(hit);
	}
	hits.splice(0, hits.length, ...reordered);
	const after = hits.map((hit) => hit.id);
	const reranked = after.some((id, index) => id !== before[index]);
	return { state: 'applied', reranked, reason: null };
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
 * SRCH-005 — deterministic ordering for hits: by the COMPOSITE ranking score descending (recency, title, tag,
 * link, entity-type, session-context signals combined), then by a stable type order, then by id. The
 * tie-breakers are TOTAL — two hits can never tie on (score, type, id) — so equal-input hits always order
 * IDENTICALLY across repeated runs and fresh fixtures (AC3: deterministic, stable order). Pure.
 */
function compareHits(a: SearchHit, b: SearchHit): number {
	if (a.score !== b.score) return b.score - a.score;
	if (a.type !== b.type) return TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
	return a.id.localeCompare(b.id);
}
