import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	getContentItemsForActor,
	getSavedSearchesForActor,
	searchVaultForActor,
	SEARCH_CONTENT_TYPES,
	type SearchContentType,
} from '@dndtools/core';
import { Button, Card, Chip, EmptyState, Field, Input, Select } from '../../ds';
import { T } from '../../app/screen-kit';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useI18n, type MessageKey } from '../../i18n';
import { SavedSearches } from './SavedSearches';
import { BODY, META } from './shared';
import {
	draftToFilter,
	EMPTY_DRAFT,
	filterToDraft,
	HIT_LIMIT,
	routeForHit,
	TYPE_ICON,
	TYPE_LABEL,
	type DateBoundDraft,
	type FilterDraft,
} from './filterModel';

const FIELDSET = {
	border: 0,
	margin: T.space.zero,
	padding: T.space.zero,
	minWidth: 0,
} as const;
const LEGEND = {
	font: `600 var(--text-xs) ${T.sans}`,
	color: T.sub,
	padding: T.space.zero,
	marginBottom: T.space.oneHalf,
} as const;

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
		<fieldset style={FIELDSET}>
			<legend style={LEGEND}>{legend}</legend>
			<div style={{ display: 'flex', gap: T.space.two, flexWrap: 'wrap' }}>
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

export function FiltersPanel({
	initialQuery = '',
	initialSavedSearchId = '',
}: {
	initialQuery?: string;
	initialSavedSearchId?: string;
}) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const navigate = useNavigate();
	const actorId = runtime.defaultActorId;

	// `initialQuery` seeds the text facet once (the Graph's "search the vault" handoff);
	// `initialSavedSearchId` seeds the WHOLE draft from a stored saved search (the palette's
	// `>search saved` handoff). Both are starting values, not controlled props: the DM edits freely
	// from there. The saved search is resolved through the actor-filtered read, so a palette row
	// that named something this actor may not see restores nothing rather than leaking criteria.
	const [draft, setDraft] = useState<FilterDraft>(() => {
		if (initialSavedSearchId !== '') {
			const seeded = getSavedSearchesForActor(
				runtime.state.content,
				runtime.state.maps,
				runtime.state.permissions,
				runtime.state.session,
				actorId,
			).find((entry) => entry.id === initialSavedSearchId);
			if (seeded) return filterToDraft(seeded.filter);
		}
		return { ...EMPTY_DRAFT, query: initialQuery };
	});

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
		<Card
			elevation="flat"
			padding="md"
			style={{ marginBottom: T.space.four }}
			data-testid="filters-panel"
		>
			<div style={{ display: 'grid', gap: T.space.four }}>
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

				<fieldset style={FIELDSET}>
					<legend style={LEGEND}>{t('knowledge.filters.types')}</legend>
					<div style={{ display: 'flex', flexWrap: 'wrap', gap: T.space.oneHalf }}>
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

				<div style={{ display: 'flex', gap: T.space.three, flexWrap: 'wrap' }}>
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
						style={{ ...BODY, color: T.ter, margin: T.space.zero }}
						data-testid="filters-no-calendar"
					>
						{t('knowledge.filters.noCalendar')}
					</p>
				) : (
					<div style={{ display: 'grid', gap: T.space.three }}>
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
							<div style={{ display: 'flex', gap: T.space.three, flexWrap: 'wrap' }}>
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

				<div
					style={{ display: 'flex', alignItems: 'center', gap: T.space.three, flexWrap: 'wrap' }}
				>
					{/* The result count is the one line that answers every keystroke, so it is the
					    panel's polite live region; the list below it is not announced row by row. */}
					<span
						role="status"
						style={{ font: `600 var(--text-sm) ${T.sans}`, color: T.ink }}
						data-testid="filters-count"
					>
						{t('knowledge.filters.matches', { count: result.totalCount })}
					</span>
					<span style={META}>{t('knowledge.filters.facetsApplied', { count: facetCount })}</span>
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

				{result.totalCount === 0 ? (
					<EmptyState
						inset
						illustration="search-none"
						title={t('knowledge.filters.noResults')}
						description={t(
							facetCount > 0
								? 'knowledge.filters.noResultsBody'
								: 'knowledge.filters.nothingVisible',
						)}
						data-testid="filters-no-results"
					/>
				) : (
					<ul
						style={{
							listStyle: 'none',
							margin: T.space.zero,
							padding: T.space.zero,
							display: 'grid',
							gap: T.space.one,
						}}
						data-testid="filters-results"
					>
						{result.hits.slice(0, HIT_LIMIT).map((hit) => (
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
				)}
				{result.totalCount > HIT_LIMIT && (
					<p style={{ ...META, margin: T.space.zero }} data-testid="filters-truncated">
						{t('knowledge.filters.showingFirst', { shown: HIT_LIMIT, count: result.totalCount })}
					</p>
				)}

				<SavedSearches filter={filter} onApply={(saved) => setDraft(filterToDraft(saved))} />
			</div>
		</Card>
	);
}
