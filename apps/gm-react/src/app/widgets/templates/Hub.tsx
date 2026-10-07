import { useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import {
	resolveWidgetIntent,
	resolveWidgetStyleVariables,
	type WidgetIntentDescriptor,
} from '@dndtools/core';
import { Avatar, Badge, Card, Icon, Skeleton, StatusDot } from '../../../ds';
import { useI18n } from '../../../i18n';
import { useRuntime } from '../../../runtime/RuntimeContext';
import { settingsGateVisible, useSettingsTier } from '../../../screens/settings/Experience';
import { SETTINGS_FEATURE_GATES } from '../../../screens/settings/shared';
import { eb } from '../../screen-kit';
import type { WidgetDataRow } from '../dataEnvironment';
import { HubIntent, useHubText, type HubActionProps, type HubControl } from './HubIntent';
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

const sans = 'var(--font-sans)';
const ink = 'var(--color-text-primary)';
const sub = 'var(--color-text-secondary)';
const ter = 'var(--color-text-tertiary)';
const acc = 'var(--color-accent)';
const transition = (...properties: string[]) =>
	properties.map((p) => `${p} var(--duration-fast) var(--easing-standard)`).join(', ');

/**
 * RC-CAN-7.6 — the part's Style settings (its `--widget-text` and `--widget-accent`, RC-WID-2.4)
 * re-point the theme tokens the hub and every DS control inside it read, so restyling a part restyles
 * what it draws. Two `display: contents` levels, because a custom property that names itself is a
 * cycle: the outer one reads each widget token with the theme's as its fallback, the inner one points
 * the theme's at it. With the declared defaults both resolve to the theme's own colours. A colour the
 * GM picks carries its tints with it (the accent's fill and border, the quieter text levels).
 */
function HubStyle({
	widget,
	definition,
	children,
}: Pick<HubProps, 'widget' | 'definition'> & { children: ReactNode }) {
	const variables = definition ? resolveWidgetStyleVariables(definition, widget.configuration) : {};
	const picked = (token: string, theme: string) =>
		!!variables[token] && variables[token] !== `var(${theme})`;
	const accent = picked('--widget-accent', '--color-accent');
	const text = picked('--widget-text', '--color-text-primary');
	const from = {
		display: 'contents',
		'--hub-accent': 'var(--widget-accent, var(--color-accent))',
		'--hub-text': 'var(--widget-text, var(--color-text-primary))',
	} as CSSProperties;
	const to = {
		display: 'contents',
		'--color-accent': 'var(--hub-accent, currentColor)',
		'--color-text-primary': 'var(--hub-text, currentColor)',
		...(accent
			? {
					'--color-accent-subtle':
						'color-mix(in srgb, var(--hub-accent, currentColor) 18%, var(--color-surface))',
					'--color-accent-border':
						'color-mix(in srgb, var(--hub-accent, currentColor) 65%, var(--color-border))',
				}
			: {}),
		...(text
			? {
					'--color-text-secondary':
						'color-mix(in srgb, var(--hub-text, currentColor) 78%, transparent)',
					'--color-text-tertiary':
						'color-mix(in srgb, var(--hub-text, currentColor) 60%, transparent)',
				}
			: {}),
	} as CSSProperties;
	return (
		<div data-hub-style="" style={from}>
			<div style={to}>{children}</div>
		</div>
	);
}

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

/** A section's label: an `<h2>` with an optional trailing action, the hub's section heading. */
function HubLabel({ children, action }: { children?: ReactNode; action?: ReactNode }) {
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: children ? 'space-between' : 'flex-end',
				marginBottom: 'var(--space-3)',
			}}
		>
			{children && <h2 style={{ ...eb, margin: 'var(--space-0)' }}>{children}</h2>}
			{action}
		</div>
	);
}

/** A control the template draws itself, wired to its intent (or inert while editing). */
function ControlButton({
	control,
	style,
	hoverStyle,
	children,
}: {
	control: HubControl;
	style: CSSProperties;
	hoverStyle: CSSProperties;
	children: ReactNode;
}) {
	const [hover, setHover] = useState(false);
	return (
		<button
			type="button"
			onClick={control.run}
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
			aria-disabled={control.unavailable ? true : undefined}
			title={control.unavailable}
			style={{ ...style, ...(hover ? hoverStyle : null) }}
		>
			{children}
		</button>
	);
}

function SceneTileBody({ row }: { row: WidgetDataRow }) {
	const { t } = useI18n();
	const draft = !row.active && row.visibility === 'dm-only';
	return (
		<>
			<div
				data-thumbnail={row.thumbnail ?? 'paper'}
				style={{
					position: 'relative',
					height: 96,
					background: 'linear-gradient(135deg,var(--color-surface-raised),var(--color-bg))',
				}}
			>
				<div
					style={{
						position: 'absolute',
						inset: 0,
						backgroundImage:
							'linear-gradient(var(--map-grid-line) 1px,transparent 1px),linear-gradient(90deg,var(--map-grid-line) 1px,transparent 1px)',
						backgroundSize: '20px 20px',
					}}
				/>
				<div style={{ position: 'absolute', top: 9, right: 9 }}>
					{row.active ? (
						<Badge status="success" icon="visibility-players">
							{t('home.status.live')}
						</Badge>
					) : draft ? (
						<Badge status="neutral">{t('home.status.draft')}</Badge>
					) : (
						<Badge status="info">{t('home.status.ready')}</Badge>
					)}
				</div>
				{draft && (
					// Unlabelled on purpose: a named icon inside the tile would announce "Draft" twice.
					<div style={{ position: 'absolute', top: 9, left: 9, color: ter }}>
						<Icon name="lock" size="sm" />
					</div>
				)}
			</div>
			<div style={{ padding: 'calc(var(--space-2) + var(--space-0-5)) var(--space-3)' }}>
				<div style={{ font: `600 13.5px ${sans}`, color: ink }}>{row.primary}</div>
				<div style={{ font: `11.5px ${sans}`, color: ter }}>{row.secondary ?? row.meta}</div>
			</div>
		</>
	);
}

function LaunchTileBody({ row, icon }: { row: WidgetDataRow; icon: string }) {
	return (
		<>
			<span
				style={{
					width: 34,
					height: 34,
					borderRadius: 'var(--radius-lg)',
					background: 'var(--color-surface)',
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					color: acc,
				}}
			>
				<Icon name={row.icon ?? icon} size="md" />
			</span>
			<span style={{ minWidth: 0 }}>
				<span style={{ display: 'block', font: `600 12.5px ${sans}`, color: ink }}>
					{row.primary}
				</span>
				{(row.secondary ?? row.meta) && (
					<span
						style={{
							display: 'block',
							font: `11px ${sans}`,
							color: ter,
							marginTop: 'var(--space-0-5)',
						}}
					>
						{row.secondary ?? row.meta}
					</span>
				)}
			</span>
		</>
	);
}

function LinkRowBody({ row, icon }: { row: WidgetDataRow; icon: string }) {
	return (
		<>
			<Icon name={row.icon ?? icon} size="sm" color={sub} />
			<span style={{ flex: 1, minWidth: 0 }}>
				<span style={{ display: 'block', font: `600 12.5px ${sans}`, color: ink }}>
					{row.primary}
				</span>
				<span style={{ display: 'block', font: `11px ${sans}`, color: ter }}>
					{row.secondary ?? row.meta}
				</span>
			</span>
			<Icon name="chevron-right" size="sm" color={ter} />
		</>
	);
}

function LinkCardBody({ row, icon }: { row: WidgetDataRow; icon: string }) {
	return (
		<>
			<span
				style={{
					width: 40,
					height: 40,
					borderRadius: 'var(--radius-lg)',
					background: 'var(--color-accent-subtle)',
					color: acc,
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					flex: '0 0 auto',
				}}
			>
				<Icon name={row.icon ?? icon} size="md" />
			</span>
			<div style={{ flex: 1, minWidth: 0 }}>
				<div style={{ font: `600 13.5px ${sans}`, color: ink }}>{row.primary}</div>
				<div style={{ font: `11.5px ${sans}`, color: ter }}>{row.secondary ?? row.meta}</div>
			</div>
			<Icon name="chevron-right" size="sm" color={ter} />
		</>
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
								font: `600 11px ${sans}`,
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
					<div style={{ font: `13px ${sans}`, color: sub, marginTop: 'var(--space-1)' }}>
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
						<div style={{ font: `13px ${sans}` }}>
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
