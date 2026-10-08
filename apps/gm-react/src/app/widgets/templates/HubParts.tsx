import { useState, type CSSProperties, type ReactNode } from 'react';
import { resolveWidgetStyleVariables } from '@dndtools/core';
import type { WidgetIntentDescriptor } from '@dndtools/core';
import { Badge, Icon } from '../../../ds';
import { useI18n } from '../../../i18n';
import { eb } from '../../screen-kit';
import type { WidgetDataRow } from '../dataEnvironment';
import type { HubControl } from './HubIntent';
import type { HubProps } from './Hub';

export const sans = 'var(--font-sans)';
export const ink = 'var(--color-text-primary)';
export const sub = 'var(--color-text-secondary)';
export const ter = 'var(--color-text-tertiary)';
export const acc = 'var(--color-accent)';
export const transition = (...properties: string[]) =>
	properties.map((p) => `${p} var(--duration-fast) var(--easing-standard)`).join(', ');

/**
 * RC-CAN-7.6 — the part's Style settings (its `--widget-text` and `--widget-accent`, RC-WID-2.4)
 * re-point the theme tokens the hub and every DS control inside it read, so restyling a part restyles
 * what it draws. Two `display: contents` levels, because a custom property that names itself is a
 * cycle: the outer one reads each widget token with the theme's as its fallback, the inner one points
 * the theme's at it. With the declared defaults both resolve to the theme's own colours. A colour the
 * GM picks carries its tints with it (the accent's fill and border, the quieter text levels).
 */
export function HubStyle({
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
export function rowIntent(intents: WidgetIntentDescriptor[], row: WidgetDataRow) {
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
export function HubLabel({ children, action }: { children?: ReactNode; action?: ReactNode }) {
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
export function ControlButton({
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
			style={{ minHeight: 'var(--space-12)', ...style, ...(hover ? hoverStyle : null) }}
		>
			{children}
		</button>
	);
}

export function SceneTileBody({ row }: { row: WidgetDataRow }) {
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
						<Badge status="neutral" icon="lock">
							{t('home.status.draft')}
						</Badge>
					) : (
						<Badge status="info" icon="check">
							{t('home.status.ready')}
						</Badge>
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
				<div style={{ font: `600 var(--text-sm) ${sans}`, color: ink }}>{row.primary}</div>
				<div style={{ font: `var(--text-xs) ${sans}`, color: ter }}>
					{row.secondary ?? row.meta}
				</div>
			</div>
		</>
	);
}

export function LaunchTileBody({ row, icon }: { row: WidgetDataRow; icon: string }) {
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
			<span style={{ minWidth: 0, maxWidth: '100%', overflowWrap: 'anywhere' }}>
				<span style={{ display: 'block', font: `600 var(--text-sm) ${sans}`, color: ink }}>
					{row.primary}
				</span>
				{(row.secondary ?? row.meta) && (
					<span
						style={{
							display: 'block',
							font: `var(--text-xs) ${sans}`,
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

export function LinkRowBody({ row, icon }: { row: WidgetDataRow; icon: string }) {
	return (
		<>
			<Icon name={row.icon ?? icon} size="sm" color={sub} />
			<span style={{ flex: 1, minWidth: 0 }}>
				<span style={{ display: 'block', font: `600 var(--text-sm) ${sans}`, color: ink }}>
					{row.primary}
				</span>
				<span style={{ display: 'block', font: `var(--text-xs) ${sans}`, color: ter }}>
					{row.secondary ?? row.meta}
				</span>
			</span>
			<Icon name="chevron-right" size="sm" color={ter} />
		</>
	);
}

export function LinkCardBody({ row, icon }: { row: WidgetDataRow; icon: string }) {
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
				<div style={{ font: `600 var(--text-sm) ${sans}`, color: ink }}>{row.primary}</div>
				<div style={{ font: `var(--text-xs) ${sans}`, color: ter }}>
					{row.secondary ?? row.meta}
				</div>
			</div>
			<Icon name="chevron-right" size="sm" color={ter} />
		</>
	);
}
