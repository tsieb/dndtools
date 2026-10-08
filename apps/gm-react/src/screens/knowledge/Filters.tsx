import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	getContentItemsForActor,
	getSavedSearchesForActor,
	kindWordFor,
	searchVaultForActor,
	SEARCH_CONTENT_TYPES,
	VAULT_OBJECT_SUBTYPE_KEY,
	type ContentKindWord,
	type SearchContentType,
	type SearchHit,
} from '@dndtools/core';
import { Button, Card, Chip, EmptyState, Field, Input, Select } from '../../ds';
import { T } from '../../app/screen-kit';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useI18n, type MessageKey } from '../../i18n';
import { SavedSearches } from './SavedSearches';
import { KIND_ICON, KIND_PLURAL_LABEL } from '../graph/presentation';
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

/**
 * RC-KNW-6.2 — the Kinds chips speak the one kind vocabulary (`kindWordFor`), not the search's
 * storage types: a faction dossier is under Factions here, as it is on Story, the Graph and the
 * palette. The core filters by content type, so each kind names the types it needs; every object
 * kind shares `object` and is told apart by subtype among the hits the core already returned.
 * NPC and Map are offered only while the vault holds such an object (a `character` or `map`
 * subtype). Handouts and rolls keep their own words.
 */
type FilterKind = ContentKindWord | 'handout' | 'roll';
const FILTER_KINDS: {
	kind: FilterKind;
	types: SearchContentType[];
	label: MessageKey;
	icon: string;
}[] = [
	{ kind: 'note', types: ['note', 'object'], label: KIND_PLURAL_LABEL.note, icon: KIND_ICON.note },
	{ kind: 'quest', types: ['object'], label: KIND_PLURAL_LABEL.quest, icon: KIND_ICON.quest },
	{ kind: 'faction', types: ['object'], label: KIND_PLURAL_LABEL.faction, icon: KIND_ICON.faction },
	{ kind: 'npc', types: ['object'], label: KIND_PLURAL_LABEL.npc, icon: KIND_ICON.npc },
	{ kind: 'map', types: ['object'], label: KIND_PLURAL_LABEL.map, icon: KIND_ICON.map },
	{ kind: 'place', types: ['poi'], label: KIND_PLURAL_LABEL.place, icon: KIND_ICON.place },
	{ kind: 'handout', types: ['handout'], label: TYPE_LABEL.handout, icon: TYPE_ICON.handout },
	{
		kind: 'roll',
		types: ['session-artifact'],
		label: TYPE_LABEL['session-artifact'],
		icon: TYPE_ICON['session-artifact'],
	},
];

/** The content types a set of kinds needs from the core, in the core's own order. */
function typesForKinds(kinds: readonly FilterKind[]): SearchContentType[] {
	const wanted = new Set(
		FILTER_KINDS.filter((k) => kinds.includes(k.kind)).flatMap((k) => k.types),
	);
	return SEARCH_CONTENT_TYPES.filter((type) => wanted.has(type));
}

/** The kinds whose hits a set of content types returns (a saved `object` search shows every object). */
function kindsForTypes(types: readonly SearchContentType[]): FilterKind[] {
	return FILTER_KINDS.filter((k) => k.types.some((type) => types.includes(type))).map(
		(k) => k.kind,
	);
}

/**
 * The kinds the core cannot tell apart: all of them come back for `object`. A saved search stores
 * content types only, so picking some of these but not all saves a broader search than the chips
 * show (the panel says so before saving).
 */
const OBJECT_KINDS: readonly FilterKind[] = ['note', 'quest', 'faction', 'npc', 'map'];

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
 *     only narrowing done here is by kind word among those visible hits (RC-KNW-6.2: quests and
 *     factions share the core's `object` type), so nothing the core withheld can be counted.
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

	// The chips the DM picked, or `null` while the kind criterion is the draft's content types as
	// stored (a loaded saved search, or a cleared panel). In that state the result is exactly what
	// the core returns for those types, which is what the saved search itself re-runs; the chips
	// only show which kinds those types cover. Toggling a chip switches to picked kinds.
	const [kinds, setKinds] = useState<FilterKind[] | null>(null);
	const filter = useMemo(() => draftToFilter(draft), [draft]);

	// The live, actor-filtered result. Every hit and every count comes from here; the kind chips only
	// narrow it by kind word, so what is shown is always a subset of what this actor may see.
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

	const kindOf = useMemo(() => {
		const subtypeOf = new Map(
			anchors.map((item) => [item.id, item.fields[VAULT_OBJECT_SUBTYPE_KEY]]),
		);
		return (hit: SearchHit): FilterKind => {
			if (hit.type === 'handout') return 'handout';
			if (hit.type === 'session-artifact') return 'roll';
			return kindWordFor(hit.type, subtypeOf.get(hit.id));
		};
	}, [anchors]);
	// NPC and Map are object kinds only a `character` / `map` object has; offer them when one exists.
	const offered = useMemo(() => {
		const words = new Set(
			anchors
				.filter((item) => item.kind === 'object')
				.map((item) => kindWordFor('object', item.fields[VAULT_OBJECT_SUBTYPE_KEY])),
		);
		return FILTER_KINDS.filter(
			(k) => (k.kind !== 'npc' && k.kind !== 'map') || words.has(k.kind) || kinds?.includes(k.kind),
		);
	}, [anchors, kinds]);
	const shownKinds = kinds ?? kindsForTypes(draft.contentTypes);
	const hits = useMemo(
		() =>
			kinds === null || kinds.length === 0
				? result.hits
				: result.hits.filter((hit) => kinds.includes(kindOf(hit))),
		[result.hits, kinds, kindOf],
	);
	const countOf = (kind: FilterKind) => hits.filter((hit) => kindOf(hit) === kind).length;
	const offeredObjectKinds = offered.filter((k) => OBJECT_KINDS.includes(k.kind));
	const pickedObjectKinds = offeredObjectKinds.filter((k) => kinds?.includes(k.kind));
	const saveBroadens =
		pickedObjectKinds.length > 0 && pickedObjectKinds.length < offeredObjectKinds.length;

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

	function toggleKind(kind: FilterKind) {
		const current = shownKinds.filter((value) => offered.some((k) => k.kind === value));
		const next = current.includes(kind)
			? current.filter((value) => value !== kind)
			: [...current, kind];
		setKinds(next);
		setDraft((prev) => ({ ...prev, contentTypes: typesForKinds(next) }));
	}

	function loadDraft(next: FilterDraft) {
		setDraft(next);
		setKinds(null);
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
						{offered.map(({ kind, label, icon }) => (
							<Chip
								key={kind}
								icon={icon}
								tone={shownKinds.includes(kind) ? 'accent' : 'neutral'}
								selected={shownKinds.includes(kind)}
								data-testid={`filters-type-${kind}`}
								onClick={() => toggleKind(kind)}
							>
								{t(label)} · {countOf(kind)}
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
						{t('knowledge.filters.matches', { count: hits.length })}
					</span>
					<span style={META}>{t('knowledge.filters.facetsApplied', { count: facetCount })}</span>
					<Button
						variant="ghost"
						size="sm"
						icon="close"
						disabled={facetCount === 0}
						data-testid="filters-clear"
						onClick={() => loadDraft({ ...EMPTY_DRAFT })}
					>
						{t('knowledge.filters.clear')}
					</Button>
				</div>

				{hits.length === 0 ? (
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
						{hits.slice(0, HIT_LIMIT).map((hit) => (
							<li key={`${hit.type}:${hit.id}`}>
								<Button
									variant="ghost"
									size="sm"
									icon={KIND_ICON[kindOf(hit)] ?? TYPE_ICON[hit.type]}
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
				{hits.length > HIT_LIMIT && (
					<p style={{ ...META, margin: T.space.zero }} data-testid="filters-truncated">
						{t('knowledge.filters.showingFirst', { shown: HIT_LIMIT, count: hits.length })}
					</p>
				)}

				{saveBroadens && (
					<p style={{ ...META, margin: T.space.zero }} data-testid="filters-save-broadens">
						{t('knowledge.filters.saveBroadens')}
					</p>
				)}
				<SavedSearches filter={filter} onApply={(saved) => loadDraft(filterToDraft(saved))} />
			</div>
		</Card>
	);
}
