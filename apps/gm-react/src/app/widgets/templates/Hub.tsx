import { Illustration } from '../../../ds/illustrations';
import {
	HubStyle,
	HubLabel,
	rowIntent,
	ControlButton,
	SceneTileBody,
	LaunchTileBody,
	LinkRowBody,
	LinkCardBody,
	sans,
	ter,
	sub,
	acc,
	transition,
} from './HubParts';
import { type CSSProperties, type ReactElement, type ReactNode } from 'react';
import {
	SECTION_FEATURE_GATES,
	WIDGET_TEXT_MESSAGE_PREFIX,
	resolveWidgetIntent,
	type WidgetIntentDescriptor,
} from '@dndtools/core';
import { Avatar, Card, Skeleton, StatusDot } from '../../../ds';
import { useI18n } from '../../../i18n';
import { useRuntime } from '../../../runtime/RuntimeContext';
import {
	featureGateVisible,
	settingsGateVisible,
	useSettingsTier,
} from '../../../screens/settings/Experience';
import { SETTINGS_FEATURE_GATES } from '../../../screens/settings/shared';
import type { WidgetDataRow } from '../dataEnvironment';
import { HubIntent, useHubText, type HubActionProps } from './HubIntent';
import { cfg, cfgText, TemplateEmpty, TemplateNote, type WidgetTemplateProps } from './shared';

/**
 * The four hub templates (RC-WID-5.3): hero, card grid, launcher and link list.
 *
 * RC-CAN-7.6 rebuilt them to the Command Center's own structure, because the Command Center is now
 * made of them: the hero card, the "Scenes" section with its scene tiles, the two-column Create
 * launchers, the Manage rows and the library cards. Every element, label and state the hub drew is
 * drawn here from the definition (headings, intents with their icons and hints) and the declared
 * queries, so a widget a GM builds from the same definition looks and works exactly the same.
 */

export type HubTemplateKind = 'hero' | 'card-grid' | 'launcher' | 'link-list';
export type HubProps = WidgetTemplateProps & {
	loading?: boolean;
	onIntent?: HubActionProps['onIntent'];
};
/** Whether the viewer can follow an intent here: the host gate, decided before anything renders. */
type Availability = (intent: WidgetIntentDescriptor, targetId?: string) => boolean;

/** The complexity-map gate on the Command Center (`surface: '/'`) whose message names this intent. */
function homeGate(intent: WidgetIntentDescriptor): string | null {
	if (!intent.displayName.startsWith(WIDGET_TEXT_MESSAGE_PREFIX)) return null;
	const key = intent.displayName.slice(WIDGET_TEXT_MESSAGE_PREFIX.length);
	return (
		SECTION_FEATURE_GATES.find((gate) => gate.surface === '/' && gate.labelKey === key)?.id ?? null
	);
}

/** Live hubs decide which intents the viewer can follow before drawing; previews show them all. */
export function HubTemplate(props: HubProps & { kind: HubTemplateKind }) {
	const live = !props.onIntent && !!props.onCommand && !!props.definition;
	return live ? <LiveHub {...props} /> : <HubBody {...props} available={() => true} />;
}

function LiveHub(props: HubProps & { kind: HubTemplateKind }) {
	const runtime = useRuntime();
	const tier = useSettingsTier();
	const available: Availability = (intent, targetId) =>
		// A Settings tab hidden at this experience tier is not offered either (CC-12). Only a tab with
		// a gate is gated: an ungated tab is always reachable from Settings.
		!(
			intent.kind === 'open-settings' &&
			SETTINGS_FEATURE_GATES.some((gate) => gate.id === `settings.nav.${intent.tab}`) &&
			!settingsGateVisible(`settings.nav.${intent.tab}`, tier)
		) &&
		// RC-UX-6.4 — an intent named like a gate the complexity map places on the Command Center
		// (New widget) is offered from that gate's tier, as the hub's launcher was.
		!(homeGate(intent) && !featureGateVisible(homeGate(intent)!, tier)) &&
		resolveWidgetIntent({
			widgetInstanceId: props.widget.id,
			definition: props.definition!,
			request: { intentId: intent.id, targetId },
			approvedPermissions: [],
			state: runtime.state,
			actorId: runtime.activeActorId,
		}).decision === 'resolved';
	return <HubBody {...props} available={available} />;
}

function HubBody({
	kind,
	available,
	...props
}: HubProps & { kind: HubTemplateKind; available: Availability }) {
	const { t } = useI18n();
	const text = useHubText();
	const { widget, definition, data, loading } = props;
	const query = data.primary;
	const rows = query?.withheld ? [] : (query?.rows ?? []);
	const intents = definition?.intents ?? [];
	const icon = cfgText(widget, 'icon') ?? definition?.icon ?? 'scene';
	const heading = text(cfgText(widget, 'heading'));
	// Every drawn result goes through the part's style; a part that draws nothing renders nothing.
	const styled = (node: ReactNode) => (
		<HubStyle widget={widget} definition={definition}>
			{node}
		</HubStyle>
	);
	if (loading)
		return styled(
			<div data-testid={`widget-template-${kind}`}>
				<div role="status" aria-label={t('common.state.loading')} aria-busy="true">
					<Skeleton variant="text" lines={3} />
				</div>
			</div>,
		);
	const action = (intent: WidgetIntentDescriptor, extra: Partial<HubActionProps> = {}) =>
		available(intent, extra.targetId) ? (
			<HubIntent
				{...props}
				key={`${intent.id}:${extra.targetId ?? ''}`}
				intent={intent}
				{...extra}
			/>
		) : null;

	if (kind === 'hero') {
		const first = rows[0];
		const live = !!first?.active;
		const party = data.queries.find((q) => q.source === 'party' && !q.withheld)?.rows ?? [];
		const eyebrow = text(cfgText(widget, live ? 'liveEyebrow' : 'eyebrow'));
		// The row may name which declared intent its target takes (the resume source does).
		const primary = intents.find((intent) => intent.id === first?.meta) ?? intents[0];
		return styled(
			<Card
				data-testid="widget-template-hero"
				accent
				elevation="raised"
				padding="lg"
				style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-5)', flexWrap: 'wrap' }}
			>
				<StatusDot status={live ? 'live' : 'idle'} pulse={live} />
				<div style={{ flex: '1 1 200px', minWidth: 0 }}>
					{eyebrow && (
						<div
							style={{
								font: `600 var(--text-xs) ${sans}`,
								letterSpacing: '.09em',
								textTransform: 'uppercase',
								color: acc,
							}}
						>
							{eyebrow}
						</div>
					)}
					<h2
						style={{
							font: '700 var(--text-xl)/1.1 var(--font-display)',
							margin: 'var(--space-0)',
							marginTop: 'var(--space-0-5)',
						}}
					>
						{first?.primary ?? (heading || text(widget.title))}
					</h2>
					<div style={{ font: `var(--text-sm) ${sans}`, color: sub, marginTop: 'var(--space-1)' }}>
						{text(cfgText(widget, 'subtitle')) || first?.secondary}
					</div>
					{!first && <TemplateEmpty query={query} />}
				</div>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 'var(--space-3)',
						flexWrap: 'wrap',
						minWidth: 0,
						maxWidth: '100%',
					}}
				>
					<div style={{ display: 'flex' }}>
						{party.slice(0, 5).map((p, i) => (
							<span
								key={p.id}
								title={p.primary}
								role="img"
								aria-label={p.primary}
								style={{
									marginInlineStart: i ? 'calc(-1 * var(--space-2))' : 'var(--space-0)',
									borderRadius: 'var(--radius-full)',
									boxShadow: '0 0 0 2px var(--color-surface-raised)',
								}}
							>
								<Avatar name={p.primary} size="sm" ring="active" />
							</span>
						))}
					</div>
					{primary &&
						action(primary, {
							targetId: first?.id,
							variant: 'primary',
							size: 'lg',
							iconRight: primary.icon,
							// A long label wraps rather than clipping on a narrow screen.
							style: { maxWidth: '100%', whiteSpace: 'normal', overflowWrap: 'anywhere' },
						})}
				</div>
			</Card>,
		);
	}

	// Launchers and link lists may be entirely declarative (no query): each intent is a row, with
	// its icon and hint. A card grid's own intents are its header and empty-state actions instead.
	const cardGrid = kind === 'card-grid';
	const newIntent = cardGrid
		? (intents.find((intent) => intent.id === 'new') ??
			intents.find((intent) => intent.kind === 'create'))
		: undefined;
	const emptyIntent = cardGrid ? intents.find((intent) => intent.id === 'empty') : undefined;
	const entries: { row: WidgetDataRow; intent?: WidgetIntentDescriptor }[] = query
		? rows.map((row) => ({ row, intent: rowIntent(intents, row) }))
		: intents
				.filter((intent) => !cardGrid || (intent !== newIntent && intent !== emptyIntent))
				.map((intent) => ({
					row: {
						id: intent.id,
						primary: text(intent.displayName),
						secondary: text(intent.hint) || undefined,
						icon: intent.icon,
					},
					intent,
				}));
	const shown = entries.map((entry) => ({
		...entry,
		intent: entry.intent && available(entry.intent, entry.row.id) ? entry.intent : undefined,
	}));
	// A declarative list the viewer can follow none of is not drawn at all: the hub hid its Manage
	// section rather than show an empty one (CC-12).
	if (!query && shown.length > 0 && shown.every((entry) => !entry.intent)) return null;
	const layout = kind === 'link-list' ? cfgText(widget, 'layout') : null;
	const columns = Number(cfg<number | string>(widget, 'columns')) || 0;
	const header = (heading || newIntent) && (
		<HubLabel
			action={
				newIntent &&
				action(newIntent, { variant: 'ghost', size: 'sm', icon: newIntent.icon ?? 'add' })
			}
		>
			{heading}
		</HubLabel>
	);

	const tile = (entry: (typeof shown)[number]) => {
		const { row, intent } = entry;
		if (kind === 'card-grid') {
			const style: CSSProperties = {
				textAlign: 'left',
				padding: 'var(--space-0)',
				border: `1px solid ${row.active ? 'var(--color-accent-border)' : 'var(--color-border)'}`,
				borderRadius: 'var(--radius-lg)',
				overflow: 'hidden',
				background: 'var(--color-surface)',
				boxShadow: 'none',
				cursor: 'pointer',
				transition: transition('background', 'border-color', 'box-shadow'),
			};
			const hover: CSSProperties = {
				borderColor: 'var(--color-accent-border)',
				background: 'var(--color-surface-alt)',
				boxShadow: 'var(--shadow-sm)',
			};
			return intent ? (
				<HubIntent
					{...props}
					key={row.id}
					intent={intent}
					targetId={row.id}
					render={(control) => (
						<ControlButton control={control} style={style} hoverStyle={hover}>
							<SceneTileBody row={row} />
						</ControlButton>
					)}
				/>
			) : (
				<div key={row.id} style={{ ...style, cursor: 'default' }}>
					<SceneTileBody row={row} />
				</div>
			);
		}
		if (kind === 'launcher') {
			const style: CSSProperties = {
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'flex-start',
				gap: 'var(--space-2)',
				// 14px, the hub's launch tile.
				padding: 'calc(var(--space-3) + var(--space-0-5))',
				borderRadius: 'var(--radius-lg)',
				cursor: 'pointer',
				textAlign: 'left',
				border: '1px solid var(--color-border)',
				background: 'var(--color-surface)',
				transition: transition('background', 'border-color'),
			};
			const hover: CSSProperties = {
				borderColor: 'var(--color-accent-border)',
				background: 'var(--color-accent-subtle)',
			};
			return intent ? (
				<HubIntent
					{...props}
					key={row.id}
					intent={intent}
					targetId={row.id}
					render={(control) => (
						<ControlButton control={control} style={style} hoverStyle={hover}>
							<LaunchTileBody row={row} icon={icon} />
						</ControlButton>
					)}
				/>
			) : query ? (
				<div key={row.id} style={{ ...style, cursor: 'default' }}>
					<LaunchTileBody row={row} icon={icon} />
				</div>
			) : null;
		}
		if (layout === 'grid') {
			return intent ? (
				<HubIntent
					{...props}
					key={row.id}
					intent={intent}
					targetId={row.id}
					render={(control) => (
						<Card
							elevation="flat"
							interactive
							padding="md"
							onClick={control.run}
							aria-disabled={control.unavailable ? true : undefined}
							title={control.unavailable}
							style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}
						>
							<LinkCardBody row={row} icon={icon} />
						</Card>
					)}
				/>
			) : (
				<Card
					key={row.id}
					elevation="flat"
					padding="md"
					style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}
				>
					<LinkCardBody row={row} icon={icon} />
				</Card>
			);
		}
		return null;
	};

	if (kind === 'link-list' && layout !== 'grid') {
		const rowsShown = shown.filter((entry) => entry.intent || query);
		return styled(
			<div data-testid="widget-template-link-list">
				{header}
				{rowsShown.length === 0 ? (
					<TemplateEmpty query={query} />
				) : (
					<Card elevation="flat" padding="sm" style={{ display: 'flex', flexDirection: 'column' }}>
						{rowsShown.map(({ row, intent }, index) => {
							const style: CSSProperties = {
								display: 'flex',
								alignItems: 'center',
								gap: 'var(--space-3)',
								padding: 'calc(var(--space-2) + var(--space-0-5)) var(--space-2)',
								border: 'none',
								borderTop: index ? '1px solid var(--color-border)' : 'none',
								background: 'none',
								cursor: 'pointer',
								textAlign: 'left',
							};
							return intent ? (
								<HubIntent
									{...props}
									key={row.id}
									intent={intent}
									targetId={row.id}
									render={(control) => (
										<ControlButton control={control} style={style} hoverStyle={{}}>
											<LinkRowBody row={row} icon={icon} />
										</ControlButton>
									)}
								/>
							) : (
								<div key={row.id} style={{ ...style, cursor: 'default' }}>
									<LinkRowBody row={row} icon={icon} />
								</div>
							);
						})}
					</Card>
				)}
				{query?.withheld && <TemplateNote>{query.label}</TemplateNote>}
			</div>,
		);
	}

	const gridColumns =
		kind === 'card-grid'
			? 'repeat(auto-fill,minmax(180px,1fr))'
			: kind === 'link-list'
				? 'repeat(auto-fill,minmax(220px,1fr))'
				: columns > 0
					? `repeat(${columns}, minmax(0, 1fr))`
					: 'repeat(auto-fit, minmax(min(100%, 11rem), 1fr))';
	return styled(
		<div data-testid={`widget-template-${kind}`}>
			{header}
			{shown.length === 0 ? (
				// The hub's empty-scenes card needs a query to be empty OF; with none, the grid says it
				// has no data source, as every row-drawing template does (RC-WID-6.5).
				cardGrid && query ? (
					<Card elevation="flat" padding="lg" style={{ textAlign: 'center', color: ter }}>
						{!query.withheld && <Illustration name="scenes-empty" />}
						<div style={{ font: `var(--text-sm) ${sans}` }}>
							{query?.withheld ? query.label : (query?.emptyLabel ?? '')}
						</div>
						{emptyIntent &&
							action(emptyIntent, {
								variant: 'secondary',
								size: 'sm',
								icon: emptyIntent.icon ?? 'add',
								style: { marginTop: 'var(--space-2)' },
							})}
					</Card>
				) : (
					<TemplateEmpty query={query} />
				)
			) : (
				<div style={{ display: 'grid', gridTemplateColumns: gridColumns, gap: 'var(--space-3)' }}>
					{shown.map(tile)}
				</div>
			)}
			{query?.withheld && shown.length > 0 && <TemplateNote>{query.label}</TemplateNote>}
		</div>,
	);
}

export const HeroTemplate = (props: HubProps) => <HubTemplate {...props} kind="hero" />;
export const CardGridTemplate = (props: HubProps) => <HubTemplate {...props} kind="card-grid" />;
export const LauncherTemplate = (props: HubProps) => <HubTemplate {...props} kind="launcher" />;
export const LinkListTemplate = (props: HubProps) => <HubTemplate {...props} kind="link-list" />;

/** The four hub renderers by kind, for the registries that draw a template outside the connected slot. */
export const HUB_TEMPLATES: Record<HubTemplateKind, (props: HubProps) => ReactElement> = {
	hero: HeroTemplate,
	'card-grid': CardGridTemplate,
	launcher: LauncherTemplate,
	'link-list': LinkListTemplate,
};
