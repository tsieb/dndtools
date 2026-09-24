import { MODULE_KINDS, type ModuleKind } from '@dndtools/core';
import { type ReactNode } from 'react';
import { LoadingRegion, Panel, T } from '../../app/screen-kit';
import { Badge, Button, EmptyState, Input, Select, Skeleton } from '../../ds';
import { useI18n } from '../../i18n';
import {
	FeaturedRow,
	KIND_LABEL,
	RatingText,
	kb,
	type DiscoveryListing,
	type ListingQuery,
	type ListingSearch,
} from './shared';

/** RC-SYS-3.4 — the kind filter's options: every listing kind, plus "all". */
const KIND_FILTERS: Array<'all' | ModuleKind> = ['all', ...MODULE_KINDS];

/** A chosen value stays in its menu even when the shelf no longer offers it. */
const withChosen = (values: string[], chosen: string) =>
	chosen && !values.includes(chosen) ? [chosen, ...values] : values;

import type { Dispatch, SetStateAction } from 'react';

export function DiscoverShelf({
	query,
	setQuery,
	result,
	featured,
	failed,
	listings,
	sel,
	filtersActive,
	onlyKindFilter,
	setSelId,
	load,
	loadFeatured,
}: {
	query: ListingQuery;
	setQuery: Dispatch<SetStateAction<ListingQuery>>;
	result: ListingSearch | null;
	featured: DiscoveryListing[];
	failed: boolean;
	listings: DiscoveryListing[];
	sel: DiscoveryListing | null;
	filtersActive: boolean;
	onlyKindFilter: boolean;
	setSelId: (id: string) => void;
	load: () => void;
	loadFeatured: () => void;
}) {
	const { t, formatDate } = useI18n();
	const facets = result?.facets ?? { systems: [], licenses: [] };
	const filterControl = (
		id: string,
		label: string,
		value: string,
		options: Array<{ value: string; label: string }>,
		onChange: (value: string) => void,
	) => (
		<div style={{ display: 'flex', alignItems: 'center', gap: T.space.two }}>
			<label htmlFor={id} style={{ font: `600 var(--text-xs) ${T.sans}`, color: T.sub }}>
				{label}
			</label>
			<Select
				id={id}
				value={value}
				onChange={(e: { target: { value: string } }) => onChange(e.target.value)}
				style={{ maxWidth: 200 }}
				options={options}
			/>
		</div>
	);
	const toolbar = (
		<div
			role="search"
			aria-label={t('community.discover.searchLabel')}
			style={{ display: 'flex', alignItems: 'center', gap: T.space.three, flexWrap: 'wrap' }}
		>
			<div style={{ flex: '1 1 220px', minWidth: 0 }}>
				<Input
					type="search"
					icon="search"
					value={query.q}
					maxLength={100}
					aria-label={t('community.discover.searchLabel')}
					placeholder={t('community.discover.searchPlaceholder')}
					onChange={(e: { target: { value: string } }) =>
						setQuery((current) => ({ ...current, q: e.target.value }))
					}
				/>
			</div>
			{filterControl(
				'community-kind-filter',
				t('community.discover.filterKind'),
				query.kind,
				KIND_FILTERS.map((kind) => ({
					value: kind,
					label: kind === 'all' ? t('community.discover.kindAll') : t(KIND_LABEL[kind]),
				})),
				(kind) => setQuery((current) => ({ ...current, kind: kind as 'all' | ModuleKind })),
			)}
			{filterControl(
				'community-system-filter',
				t('community.discover.filterSystem'),
				query.system,
				[
					{ value: '', label: t('community.discover.systemAny') },
					...withChosen(facets.systems, query.system).map((s) => ({ value: s, label: s })),
				],
				(system) => setQuery((current) => ({ ...current, system })),
			)}
			{filterControl(
				'community-license-filter',
				t('community.discover.filterLicense'),
				query.license,
				[
					{ value: '', label: t('community.discover.licenseAny') },
					...withChosen(facets.licenses, query.license).map((l) => ({ value: l, label: l })),
				],
				(license) => setQuery((current) => ({ ...current, license })),
			)}
		</div>
	);

	let shelf: ReactNode;
	if (failed) {
		shelf = (
			<Panel title={t('community.discover.modules')}>
				<EmptyState
					inset
					illustration="connection-lost"
					icon="warning"
					title={t('community.discover.loadFailed')}
					description={t('community.discover.loadFailedBody')}
					action={
						<Button
							variant="secondary"
							size="sm"
							icon="retry"
							onClick={() => {
								load();
								loadFeatured();
							}}
						>
							{t('common.action.retry')}
						</Button>
					}
				/>
			</Panel>
		);
	} else if (result === null) {
		shelf = (
			<Panel title={t('community.discover.modules')}>
				<LoadingRegion
					label={t('community.discover.loading')}
					style={{ display: 'flex', flexDirection: 'column', gap: T.space.three }}
				>
					<Skeleton height={96} />
					<Skeleton height={96} />
				</LoadingRegion>
			</Panel>
		);
	} else if (listings.length === 0) {
		shelf = !filtersActive ? (
			<EmptyState
				illustration="community-empty"
				icon="globe"
				title={t('community.discover.emptyTitle')}
				description={t('community.discover.emptyBody')}
			/>
		) : (
			<EmptyState
				illustration="search-none"
				icon="globe"
				title={t(
					onlyKindFilter
						? 'community.discover.emptyKindTitle'
						: 'community.discover.emptySearchTitle',
				)}
				description={t(
					onlyKindFilter
						? 'community.discover.emptyKindBody'
						: 'community.discover.emptySearchBody',
				)}
			/>
		);
	} else {
		shelf = (
			<div
				data-testid="discover-shelf"
				style={{
					display: 'grid',
					gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%, 250px),1fr))',
					gap: T.space.four,
				}}
			>
				{listings.map((m) => (
					<button
						key={m.moduleId}
						type="button"
						// Selection was border+shadow only, so a screen-reader user pressing these cards
						// got no confirmation that anything changed (the detail panel is elsewhere in
						// the DOM). `aria-pressed` makes the toggle state part of the button's name.
						aria-pressed={sel?.moduleId === m.moduleId}
						onClick={() => setSelId(m.moduleId)}
						style={{
							display: 'flex',
							flexDirection: 'column',
							gap: T.space.two,
							padding: T.space.four,
							borderRadius: T.radius.lg,
							cursor: 'pointer',
							textAlign: 'left',
							border: `1px solid ${sel?.moduleId === m.moduleId ? T.accBd : T.bd}`,
							background: T.surf,
							boxShadow: sel?.moduleId === m.moduleId ? T.smd : 'none',
						}}
					>
						<div style={{ display: 'flex', alignItems: 'center', gap: T.space.two }}>
							<span style={{ font: `700 var(--text-base) ${T.sans}`, flex: 1, minWidth: 0 }}>
								{m.name}
							</span>
							{m.featured && <Badge status="info">{t('community.discover.featuredBadge')}</Badge>}
							{m.owned && <Badge status="accent">{t('community.discover.yours')}</Badge>}
						</div>
						<div style={{ font: `var(--text-xs) ${T.sans}`, color: T.ter }}>
							{t(KIND_LABEL[m.kind] ?? 'community.discover.kindWidget')} · v{m.version} ·{' '}
							{kb(m.size)} · {formatDate(new Date(m.publishedAt))}
						</div>
						<div style={{ font: `var(--text-xs)/1.45 ${T.sans}`, color: T.sub, flex: 1 }}>
							{m.summary}
						</div>
						<RatingText rating={m.rating} />
					</button>
				))}
			</div>
		);
	}
	// The toolbar stays mounted while a query is in play, so typing never loses focus to a reload.
	const showToolbar = filtersActive || listings.length > 0;

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: T.space.four, minWidth: 0 }}>
			{featured.length > 0 && (
				<FeaturedRow listings={featured} selectedId={sel?.moduleId ?? null} onSelect={setSelId} />
			)}
			{showToolbar && toolbar}
			{showToolbar && result !== null && (
				<div aria-live="polite" style={{ font: `var(--text-xs) ${T.sans}`, color: T.ter }}>
					{t('community.discover.resultCount', { count: result.total })}
				</div>
			)}
			{shelf}
		</div>
	);
}
