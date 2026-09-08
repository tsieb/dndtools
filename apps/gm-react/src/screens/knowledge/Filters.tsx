import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	getContentItemsForActor,
	searchVaultForActor,
	SEARCH_CONTENT_TYPES,
	type SearchContentType,
	type SearchFilter,
	type SearchHit,
} from '@dndtools/core';
import { Button, Card, Chip, Field, Input, Select } from '../../ds';
import { T } from '../../app/screen-kit';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useI18n, type MessageKey } from '../../i18n';
import { SavedSearches } from './SavedSearches';

/**
 * RC-KNW-2.1 — faceted vault search + saved searches, wired to the live Processing Core.
 *
 * Everything on this panel is the core's answer, never this screen's:
 *
 *   - the RESULT is `searchVaultForActor` (SRCH-001/003/005) run for the CURRENT actor, so a dm-only
 *     note / hidden POI / withheld handout is never a candidate — not as a hit, not as a count. The
 *     panel renders `result.totalCount` and `result.countsByType` verbatim; it never counts hits itself
 *     and never filters the returned list.
 *   - a SAVED SEARCH is the DM's named `SearchFilter`, persisted through `content.create-saved-search`
 *     and friends. It stores the QUERY, never a result: `getSavedSearchesForActor` re-runs each filter
 *     LIVE for the reading actor, so a saved search can never serve a now-hidden item (SRCH-004 AC2).
 *   - the saved search's own visibility (DM only · Shared · Player visible) is authored here and fails
 *     closed to DM only in the core, so DM-authored criteria are never accidentally exposed.
 *
 * Pin / rename / delete are the real `content.pin-saved-search`, `content.update-saved-search` and
 * `content.delete-saved-search` commands; a rejection is shown, never swallowed.
 */

/** Facet labels for the searchable domains. `poi` is the ON-MAP facet — a POI is the only artifact
 *  that lives on a map (`SearchHit.mapId` is non-null for POIs alone), so one honest chip covers both
 *  the "type" and "on map" facets instead of two controls whose intersection could be provably empty. */
const TYPE_LABEL: Record<SearchContentType, MessageKey> = {
	note: 'knowledge.filters.typeNote',
	object: 'knowledge.filters.typeObject',
	poi: 'knowledge.filters.typeOnMap',
	handout: 'knowledge.filters.typeHandout',
	'session-artifact': 'knowledge.filters.typeRoll',
};

const TYPE_ICON: Record<SearchContentType, string> = {
	note: 'knowledge-book',
	object: 'scroll',
	poi: 'poi',
	handout: 'scroll',
	'session-artifact': 'dice',
};

/** A note hit deep-links the exact note; a POI hit deep-links its map and marker. Same URL contract
 *  as the command palette's `routeForHit` so a hit opens the same place from either surface. */
function routeForHit(hit: SearchHit): string {
	if (hit.type === 'note') return `/knowledge/${hit.id}`;
	if (hit.type === 'object') return '/campaign';
	if (hit.type === 'poi' && hit.mapId) {
		return `/atlas?map=${encodeURIComponent(hit.mapId)}&poi=${encodeURIComponent(hit.id)}`;
	}
	if (hit.type === 'poi') return '/atlas';
	return '/session';
}

/** One open date bound, held as free text so a half-typed date never coerces to a wrong number. */
interface DateBoundDraft {
	year: string;
	month: string;
	day: string;
}

const EMPTY_BOUND: DateBoundDraft = { year: '', month: '', day: '' };

interface FilterDraft {
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

const EMPTY_DRAFT: FilterDraft = {
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
function draftToFilter(draft: FilterDraft): SearchFilter {
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
function filterToDraft(filter: SearchFilter): FilterDraft {
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

/** The three-part editor for one inclusive date bound. */
function DateBound({
	legend,
	value,
	onChange,
	testIdBase,
}: {
	legend: string;
	value: DateBoundDraft;
	onChange: (next: DateBoundDraft) => void;
	testIdBase: string;
}) {
	const { t } = useI18n();
	const parts: { key: keyof DateBoundDraft; label: MessageKey }[] = [
		{ key: 'year', label: 'knowledge.filters.year' },
		{ key: 'month', label: 'knowledge.filters.month' },
		{ key: 'day', label: 'knowledge.filters.day' },
	];
	return (
		<fieldset style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
			<legend style={{ font: `600 12px ${T.sans}`, color: T.ter, padding: 0, marginBottom: 6 }}>
				{legend}
			</legend>
			<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
				{parts.map((part) => (
					<Field key={part.key} label={t(part.label)} style={{ flex: 1, minWidth: 78 }}>
						<Input
							type="number"
							value={value[part.key]}
							data-testid={`${testIdBase}-${part.key}`}
							onChange={(e: { target: { value: string } }) =>
								onChange({ ...value, [part.key]: e.target.value })
							}
						/>
					</Field>
				))}
			</div>
		</fieldset>
	);
}

export function FiltersPanel({ initialQuery = '' }: { initialQuery?: string }) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const navigate = useNavigate();
	const actorId = runtime.defaultActorId;

	// `initialQuery` seeds the text facet once (the Graph's "search the vault" handoff). It is a
	// starting value, not a controlled prop: the DM edits freely from there.
	const [draft, setDraft] = useState<FilterDraft>({ ...EMPTY_DRAFT, query: initialQuery });

	const filter = useMemo(() => draftToFilter(draft), [draft]);

	// The live, actor-filtered result. Every hit and every count comes from here; this screen never
	// narrows the list afterwards, so what is shown is exactly what the core says this actor may see.
	const result = useMemo(
		() =>
			searchVaultForActor(
				runtime.state.content,
				runtime.state.maps,
				runtime.state.permissions,
				runtime.state.session,
				actorId,
				filter,
			),
		[runtime.state, actorId, filter],
	);

	// Relationship anchors: only the content the actor can already see, so the picker itself can never
	// name a hidden note.
	const anchors = useMemo(
		() => getContentItemsForActor(runtime.state.content, runtime.state.permissions, actorId),
		[runtime.state, actorId],
	);

	const calendars = useMemo(
		() => Object.values(runtime.state.content.calendars),
		[runtime.state.content.calendars],
	);

	const facetCount =
		(filter.query ? 1 : 0) +
		(filter.contentTypes ? 1 : 0) +
		(filter.tags ? 1 : 0) +
		(filter.folder ? 1 : 0) +
		(filter.relationship ? 1 : 0) +
		(filter.dateRange ? 1 : 0);

	function toggleType(type: SearchContentType) {
		setDraft((prev) => ({
			...prev,
			contentTypes: prev.contentTypes.includes(type)
				? prev.contentTypes.filter((value) => value !== type)
				: [...prev.contentTypes, type],
		}));
	}

	return (
		<Card elevation="flat" padding="md" style={{ marginBottom: 14 }} data-testid="filters-panel">
			<div style={{ display: 'grid', gap: 14 }}>
				<Field label={t('knowledge.filters.query')}>
					<Input
						value={draft.query}
						data-testid="filters-query"
						placeholder={t('knowledge.filters.queryPlaceholder')}
						onChange={(e: { target: { value: string } }) =>
							setDraft((prev) => ({ ...prev, query: e.target.value }))
						}
					/>
				</Field>

				<fieldset style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
					<legend style={{ font: `600 12px ${T.sans}`, color: T.ter, padding: 0, marginBottom: 6 }}>
						{t('knowledge.filters.types')}
					</legend>
					<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
						{SEARCH_CONTENT_TYPES.map((type) => (
							<Chip
								key={type}
								icon={TYPE_ICON[type]}
								tone={draft.contentTypes.includes(type) ? 'accent' : 'neutral'}
								selected={draft.contentTypes.includes(type)}
								data-testid={`filters-type-${type}`}
								onClick={() => toggleType(type)}
							>
								{t(TYPE_LABEL[type])} · {result.countsByType[type]}
							</Chip>
						))}
					</div>
				</fieldset>

				<div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
					<Field
						label={t('knowledge.filters.tags')}
						help={t('knowledge.filters.tagsHelp')}
						style={{ flex: 1, minWidth: 180 }}
					>
						<Input
							value={draft.tags}
							data-testid="filters-tags"
							onChange={(e: { target: { value: string } }) =>
								setDraft((prev) => ({ ...prev, tags: e.target.value }))
							}
						/>
					</Field>
					<Field label={t('knowledge.filters.folder')} style={{ flex: 1, minWidth: 180 }}>
						<Input
							value={draft.folder}
							data-testid="filters-folder"
							onChange={(e: { target: { value: string } }) =>
								setDraft((prev) => ({ ...prev, folder: e.target.value }))
							}
						/>
					</Field>
				</div>

				<Field label={t('knowledge.filters.linkedTo')} help={t('knowledge.filters.linkedToHelp')}>
					<Select
						value={draft.anchorId}
						data-testid="filters-linked"
						options={[
							{ value: '', label: t('knowledge.filters.linkedToAny') },
							...anchors.map((item) => ({ value: item.id, label: item.title })),
						]}
						onChange={(e: { target: { value: string } }) =>
							setDraft((prev) => ({ ...prev, anchorId: e.target.value }))
						}
					/>
				</Field>

				{/* The date facet needs a calendar to interpret its bounds. With none defined there is
				    nothing honest to offer, so say that instead of shipping a control that cannot run. */}
				{calendars.length === 0 ? (
					<p
						style={{ font: `12.5px/1.6 ${T.sans}`, color: T.ter, margin: 0 }}
						data-testid="filters-no-calendar"
					>
						{t('knowledge.filters.noCalendar')}
					</p>
				) : (
					<div style={{ display: 'grid', gap: 10 }}>
						<Field label={t('knowledge.filters.calendar')}>
							<Select
								value={draft.calendarId}
								data-testid="filters-calendar"
								options={[
									{ value: '', label: t('knowledge.filters.calendarAny') },
									...calendars.map((calendar) => ({ value: calendar.id, label: calendar.name })),
								]}
								onChange={(e: { target: { value: string } }) =>
									setDraft((prev) => ({ ...prev, calendarId: e.target.value }))
								}
							/>
						</Field>
						{draft.calendarId !== '' && (
							<div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
								<div style={{ flex: 1, minWidth: 240 }}>
									<DateBound
										legend={t('knowledge.filters.dateFrom')}
										value={draft.from}
										testIdBase="filters-from"
										onChange={(from) => setDraft((prev) => ({ ...prev, from }))}
									/>
								</div>
								<div style={{ flex: 1, minWidth: 240 }}>
									<DateBound
										legend={t('knowledge.filters.dateTo')}
										value={draft.to}
										testIdBase="filters-to"
										onChange={(to) => setDraft((prev) => ({ ...prev, to }))}
									/>
								</div>
							</div>
						)}
					</div>
				)}

				<div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
					<span style={{ font: `600 13px ${T.sans}` }} data-testid="filters-count">
						{t('knowledge.filters.matches', { count: result.totalCount })}
					</span>
					<span style={{ font: `12px ${T.sans}`, color: T.ter }}>
						{t('knowledge.filters.facetsApplied', { count: facetCount })}
					</span>
					<Button
						variant="ghost"
						size="sm"
						icon="close"
						disabled={facetCount === 0}
						data-testid="filters-clear"
						onClick={() => setDraft({ ...EMPTY_DRAFT })}
					>
						{t('knowledge.filters.clear')}
					</Button>
				</div>

				<ul
					style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}
					data-testid="filters-results"
				>
					{result.hits.slice(0, 40).map((hit) => (
						<li key={`${hit.type}:${hit.id}`}>
							<Button
								variant="ghost"
								size="sm"
								icon={TYPE_ICON[hit.type]}
								data-testid={`filters-hit-${hit.id}`}
								style={{ width: '100%', justifyContent: 'flex-start' }}
								onClick={() => navigate(routeForHit(hit))}
							>
								{hit.title}
							</Button>
						</li>
					))}
				</ul>

				<SavedSearches filter={filter} onApply={(saved) => setDraft(filterToDraft(saved))} />
			</div>
		</Card>
	);
}
