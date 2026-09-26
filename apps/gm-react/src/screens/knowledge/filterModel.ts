import type { SearchContentType, SearchFilter, SearchHit } from '@dndtools/core';
import type { MessageKey } from '../../i18n';

/*
 * RC-KNW-2.1 — the filter panel's model: facet labels and icons, the editable draft, and the two
 * projections between that draft and the core's canonical `SearchFilter`. Split out of Filters.tsx
 * (RC-POL-1.11) unchanged; nothing here reads state or filters results.
 */

/** Facet labels for the searchable domains. `poi` is the ON-MAP facet — a POI is the only artifact
 *  that lives on a map (`SearchHit.mapId` is non-null for POIs alone), so one honest chip covers both
 *  the "type" and "on map" facets instead of two controls whose intersection could be provably empty. */
export const TYPE_LABEL: Record<SearchContentType, MessageKey> = {
	note: 'knowledge.filters.typeNote',
	object: 'knowledge.filters.typeObject',
	poi: 'knowledge.filters.typeOnMap',
	handout: 'knowledge.filters.typeHandout',
	'session-artifact': 'knowledge.filters.typeRoll',
};

export const TYPE_ICON: Record<SearchContentType, string> = {
	note: 'knowledge-book',
	object: 'scroll',
	poi: 'poi',
	handout: 'scroll',
	'session-artifact': 'dice',
};

/** A note hit deep-links the exact note; a POI hit deep-links its map and marker. Same URL contract
 *  as the command palette's `routeForHit` so a hit opens the same place from either surface. */
export function routeForHit(hit: SearchHit): string {
	if (hit.type === 'note') return `/knowledge/${hit.id}`;
	if (hit.type === 'object') return '/campaign';
	if (hit.type === 'poi' && hit.mapId) {
		return `/atlas?map=${encodeURIComponent(hit.mapId)}&poi=${encodeURIComponent(hit.id)}`;
	}
	if (hit.type === 'poi') return '/atlas';
	return '/session';
}

/** How many hits the panel lists; the count above it is always the core's full total. */
export const HIT_LIMIT = 40;

/** One open date bound, held as free text so a half-typed date never coerces to a wrong number. */
export interface DateBoundDraft {
	year: string;
	month: string;
	day: string;
}

const EMPTY_BOUND: DateBoundDraft = { year: '', month: '', day: '' };

export interface FilterDraft {
	query: string;
	contentTypes: SearchContentType[];
	/** Comma-separated; normalized (trim/lowercase/dedupe) by the core. */
	tags: string;
	folder: string;
	/** The `linked to` anchor — a visible content item id, or '' for no relationship constraint. */
	anchorId: string;
	calendarId: string;
	from: DateBoundDraft;
	to: DateBoundDraft;
}

export const EMPTY_DRAFT: FilterDraft = {
	query: '',
	contentTypes: [],
	tags: '',
	folder: '',
	anchorId: '',
	calendarId: '',
	from: { ...EMPTY_BOUND },
	to: { ...EMPTY_BOUND },
};

/** A bound is used only when all three parts parse as integers; a partial bound stays open. */
function toCustomDate(calendarId: string, bound: DateBoundDraft) {
	const year = Number.parseInt(bound.year, 10);
	const month = Number.parseInt(bound.month, 10);
	const day = Number.parseInt(bound.day, 10);
	if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
	return { calendarId, year, month, day };
}

/** Project the draft into the core's canonical {@link SearchFilter}. Empty facets are omitted, so an
 *  untouched panel sends `{}` — "everything I can see" — rather than a set of empty constraints. */
export function draftToFilter(draft: FilterDraft): SearchFilter {
	const filter: SearchFilter = {};
	const query = draft.query.trim();
	if (query) filter.query = query;
	if (draft.contentTypes.length > 0) filter.contentTypes = [...draft.contentTypes];
	const tags = draft.tags
		.split(',')
		.map((tag) => tag.trim())
		.filter((tag) => tag !== '');
	if (tags.length > 0) filter.tags = tags;
	const folder = draft.folder.trim();
	if (folder) filter.folder = folder;
	if (draft.anchorId) filter.relationship = { anchorKind: 'content', anchorId: draft.anchorId };
	if (draft.calendarId) {
		const from = toCustomDate(draft.calendarId, draft.from);
		const to = toCustomDate(draft.calendarId, draft.to);
		if (from || to) filter.dateRange = { calendarId: draft.calendarId, from, to };
	}
	return filter;
}

/** Restore a saved search's persisted criteria back into the editable draft. */
export function filterToDraft(filter: SearchFilter): FilterDraft {
	return {
		query: filter.query ?? '',
		contentTypes: [...(filter.contentTypes ?? [])],
		tags: (filter.tags ?? []).join(', '),
		folder: filter.folder ?? '',
		anchorId: filter.relationship?.anchorKind === 'content' ? filter.relationship.anchorId : '',
		calendarId: filter.dateRange?.calendarId ?? '',
		from: filter.dateRange?.from
			? {
					year: String(filter.dateRange.from.year),
					month: String(filter.dateRange.from.month),
					day: String(filter.dateRange.from.day),
				}
			: { ...EMPTY_BOUND },
		to: filter.dateRange?.to
			? {
					year: String(filter.dateRange.to.year),
					month: String(filter.dateRange.to.month),
					day: String(filter.dateRange.to.day),
				}
			: { ...EMPTY_BOUND },
	};
}
