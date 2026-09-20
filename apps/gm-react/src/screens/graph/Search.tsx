import { Button, EmptyState, Icon, Input } from '../../ds';
import { Panel, T } from '../../app/screen-kit';
import { useI18n } from '../../i18n';
import { useNavigate } from 'react-router-dom';
import { KIND_COLOR, KIND_ICON, KIND_LABEL } from './presentation';
import type { GraphVisualization } from '@dndtools/core';
import type { ChangeEvent, Dispatch, KeyboardEvent, SetStateAction } from 'react';

export function GraphSearch({
	viz,
	view,
	query,
	setQuery,
	facet,
	setFacet,
	setFocusId,
	sel,
	setSel,
}: {
	viz: GraphVisualization;
	view: 'dm' | 'player';
	query: string;
	setQuery: (value: string) => void;
	facet: string;
	setFacet: (value: string) => void;
	setFocusId: (value: string | null) => void;
	sel: string | null;
	setSel: Dispatch<SetStateAction<string | null>>;
}) {
	const { t } = useI18n();
	const navigate = useNavigate();
	const reset = () => {
		setQuery('');
		setFacet('all');
		setFocusId(null);
	};
	return (
		<Panel title={t('graph.search')} style={{ background: T.sunken }}>
			<Input
				icon="search"
				value={query}
				aria-label={t('graph.searchLabel')}
				placeholder={t('graph.searchPlaceholder')}
				onChange={(e: ChangeEvent<HTMLInputElement>) => {
					setQuery(e.target.value);
					setFocusId(null);
				}}
				onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
					if (e.key === 'Escape' && query) {
						e.stopPropagation();
						setQuery('');
					}
				}}
			/>
			<div className="graph-facets">
				{['all', ...viz.facets.kinds].map((f) => (
					<Button
						key={f}
						size="sm"
						variant={facet === f ? 'accent' : 'ghost'}
						aria-pressed={facet === f}
						onClick={() => {
							setFacet(f);
							setFocusId(null);
						}}
					>
						{f === 'all' ? t('graph.facetAll') : KIND_LABEL[f] ? t(KIND_LABEL[f]) : f}
					</Button>
				))}
				{(query || facet !== 'all') && (
					<Button size="sm" variant="ghost" onClick={reset}>
						{t('graph.clearFilters')}
					</Button>
				)}
			</div>
			<div className="graph-results" role="region" aria-label={t('graph.results')} tabIndex={0}>
				{viz.nodes.map((r) => (
					<Button
						key={r.id}
						variant={r.id === sel ? 'accent' : 'ghost'}
						aria-pressed={r.id === sel}
						onClick={() => setSel((cur) => (cur === r.id ? null : r.id))}
						style={{
							display: 'block',
							width: '100%',
							textAlign: 'left',
							background: r.id === sel ? T.accSub : T.sunken,
						}}
					>
						<span className="graph-result-title">
							<Icon name={KIND_ICON[r.kind] ?? 'tag'} size="sm" color={KIND_COLOR[r.kind]} />
							<span className="graph-result-name">{r.title}</span>
							<span className="graph-number">{r.degree}</span>
						</span>
						<span className="graph-meta">
							{KIND_LABEL[r.kind] ? t(KIND_LABEL[r.kind]) : r.kind}
							{r.folder ? ` · ${r.folder}` : ''}
							{r.tags.length ? ` · ${r.tags.map((tag) => `#${tag}`).join(' ')}` : ''}
						</span>
					</Button>
				))}
				{viz.nodes.length === 0 && (
					<EmptyState
						inset
						illustration="search-none"
						title={view === 'player' ? t('graph.noResultsPlayer') : t('graph.noResultsFilter')}
					/>
				)}
			</div>
			<Button
				variant="ghost"
				size="sm"
				icon="search"
				disabled={!query.trim()}
				data-testid="graph-search-vault"
				onClick={() => navigate('/knowledge', { state: { search: query.trim() } })}
			>
				{t('graph.searchVault')}
			</Button>
		</Panel>
	);
}
