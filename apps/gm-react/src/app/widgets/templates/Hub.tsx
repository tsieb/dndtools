import type { CSSProperties } from 'react';
import type { WidgetIntentDescriptor } from '@dndtools/core';
import { Avatar, Badge, Card, Icon, Skeleton, StatusDot } from '../../../ds';
import { useI18n } from '../../../i18n';
import type { WidgetDataRow } from '../dataEnvironment';
import { HubIntent, type HubActionProps } from './HubIntent';
import { cfgText, TemplateEmpty, TemplateNote, type WidgetTemplateProps } from './shared';

export type HubTemplateKind = 'hero' | 'card-grid' | 'launcher' | 'link-list';
export type HubProps = WidgetTemplateProps & {
	loading?: boolean;
	onIntent?: HubActionProps['onIntent'];
};
const rowStyle: CSSProperties = {
	display: 'flex',
	alignItems: 'center',
	gap: 'var(--space-3)',
	minWidth: 0,
};
const metaStyle: CSSProperties = {
	display: 'block',
	font: 'var(--text-sm)/1.4 var(--font-sans)',
	color: 'var(--color-text-secondary)',
};

/** Fixed targets match by identity, never by row position. An unbound open intent takes the row id. */
function rowIntent(intents: WidgetIntentDescriptor[], row: WidgetDataRow) {
	return (
		intents.find((intent) => 'targetId' in intent && intent.targetId === row.id) ??
		intents.find(
			(intent) =>
				(intent.kind === 'open-screen' || intent.kind === 'open-entity') && !intent.targetId,
		) ??
		intents.find((intent) => intent.id === row.id)
	);
}

export function HubTemplate({ kind, ...props }: HubProps & { kind: HubTemplateKind }) {
	const { t } = useI18n();
	const { widget, definition, data, loading } = props;
	const query = data.primary;
	const rows = query?.withheld ? [] : (query?.rows ?? []);
	const intents = definition?.intents ?? [];
	const title = cfgText(widget, 'heading') ?? query?.header ?? widget.title;
	const newIntent = intents.find((intent) => intent.kind === 'create');
	const icon = cfgText(widget, 'icon') ?? definition?.icon ?? 'scene';
	const loadingContent = (
		<div role="status" aria-label={t('common.state.loading')} aria-busy="true">
			<Skeleton variant="text" lines={3} />
		</div>
	);
	if (loading) return <div data-testid={`widget-template-${kind}`}>{loadingContent}</div>;
	if (kind === 'hero') {
		const first = rows[0];
		const party = data.queries.find((q) => q.source === 'party' && !q.withheld)?.rows ?? [];
		return (
			<Card
				data-testid="widget-template-hero"
				accent
				elevation="raised"
				padding="lg"
				style={{ ...rowStyle, flexWrap: 'wrap' }}
			>
				<StatusDot status={first?.active ? 'live' : 'idle'} pulse={first?.active} />
				<div style={{ flex: 1, minWidth: 0 }}>
					<h2
						style={{
							margin: 'var(--space-0)',
							font: '700 var(--text-2xl)/1.1 var(--font-display)',
						}}
					>
						{first?.primary ?? title}
					</h2>
					<span style={metaStyle}>{cfgText(widget, 'subtitle') ?? first?.secondary}</span>
					{!first && <TemplateEmpty query={query} />}
				</div>
				<div style={rowStyle}>
					{party.slice(0, 5).map((p, i) => (
						<span
							key={p.id}
							role="img"
							aria-label={p.primary}
							style={{ marginInlineStart: i ? 'calc(-1 * var(--space-2))' : 'var(--space-0)' }}
						>
							<Avatar name={p.primary} size="sm" ring="active" />
						</span>
					))}
				</div>
				{intents[0] && (
					<HubIntent {...props} intent={intents[0]} targetId={first?.id} variant="primary" />
				)}
			</Card>
		);
	}
	// Launchers and link lists may be entirely declarative (no query), using intent labels as rows.
	const entries = query
		? rows
		: intents
				.filter((i) => kind !== 'card-grid' || i.kind !== 'create')
				.map((i) => ({ id: i.id, primary: i.displayName }));
	return (
		<div
			data-testid={`widget-template-${kind}`}
			style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
		>
			{entries.length === 0 && <TemplateEmpty query={query} />}
			<div
				style={
					kind === 'link-list'
						? { display: 'flex', flexDirection: 'column' }
						: {
								display: 'grid',
								gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 11rem), 1fr))',
								gap: 'var(--space-3)',
							}
				}
			>
				{entries.map((row: WidgetDataRow) => {
					const intent = rowIntent(intents, row);
					const content =
						kind === 'card-grid' ? (
							<>
								<span
									data-thumbnail={row.thumbnail ?? 'paper'}
									style={{
										display: 'flex',
										justifyContent: 'flex-end',
										padding: 'var(--space-3)',
										minHeight: 'var(--space-16)',
										background:
											row.thumbnail === 'dark'
												? 'var(--color-surface-sunken)'
												: 'var(--color-surface-raised)',
										width: '100%',
										boxSizing: 'border-box',
									}}
								>
									<Badge
										status={
											row.active ? 'success' : row.visibility === 'dm-only' ? 'neutral' : 'info'
										}
									>
										{row.active
											? t('home.status.live')
											: row.visibility === 'dm-only'
												? t('home.status.draft')
												: t('home.status.ready')}
									</Badge>
								</span>
								<span style={{ padding: 'var(--space-3)' }}>
									<span>{row.primary}</span>
									<span style={metaStyle}>{row.secondary ?? row.meta}</span>
								</span>
							</>
						) : (
							<>
								<Icon name={icon} size="md" />
								<span style={{ flex: 1, minWidth: 0 }}>
									<span style={{ display: 'block' }}>{row.primary}</span>
									<span style={metaStyle}>{row.secondary ?? row.meta}</span>
								</span>
								{kind === 'link-list' && <Icon name="chevron-right" size="sm" />}
							</>
						);
					const style: CSSProperties = {
						...rowStyle,
						width: '100%',
						alignItems: kind === 'link-list' ? 'center' : 'flex-start',
						flexDirection: kind === 'link-list' ? 'row' : 'column',
						padding: kind === 'card-grid' ? 'var(--space-0)' : 'var(--space-3)',
						border: '1px solid var(--color-border)',
						overflow: 'hidden',
						outlineOffset: 'calc(-1 * var(--focus-ring-width) - 2px)',
					};
					return intent ? (
						<HubIntent
							{...props}
							key={row.id}
							intent={intent}
							targetId={row.id}
							selected={row.active}
							style={style}
						>
							{content}
						</HubIntent>
					) : (
						<Card key={row.id} padding="none" style={style}>
							{content}
						</Card>
					);
				})}
			</div>
			{kind === 'card-grid' && newIntent && (
				<HubIntent {...props} intent={newIntent}>
					<Icon name="add" size="sm" />
					{newIntent.displayName}
				</HubIntent>
			)}
			{query?.withheld && <TemplateNote>{query.label}</TemplateNote>}
		</div>
	);
}

export const HeroTemplate = (props: HubProps) => <HubTemplate {...props} kind="hero" />;
export const CardGridTemplate = (props: HubProps) => <HubTemplate {...props} kind="card-grid" />;
export const LauncherTemplate = (props: HubProps) => <HubTemplate {...props} kind="launcher" />;
export const LinkListTemplate = (props: HubProps) => <HubTemplate {...props} kind="link-list" />;
