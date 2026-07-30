import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../ds';
import { useViewport } from './useViewport';

/**
 * screen-kit — the shared token shorthand + layout primitives ported verbatim from the online
 * prototype's app.jsx, so the section ports translate 1:1. `T` maps short keys to the exact design
 * tokens; `Page`/`Panel`/`Seg`/`SetRow`/`BackBar` are the recurring layout helpers. Colors/spacing/
 * type all resolve through the byte-identical token CSS vars.
 */

/**
 * ARIA radio-group keyboard contract for HAND-ROLLED radiogroups (a grid of choice cards, where the
 * compact `Seg` below is the wrong visual). Arrows move the selection — selection follows focus,
 * wrapping — so Tab treats the group as one stop. Pair it with a roving `tabIndex` on the radios.
 *
 * Lives here because three surfaces had grown their own byte-identical copy (Onboarding, Community)
 * or were missing it entirely (Settings' tool preferences).
 */
export function radioGroupKeyDown(e: ReactKeyboardEvent) {
	if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(e.key)) return;
	const radios = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'));
	const at = radios.indexOf(e.target as HTMLElement);
	if (at === -1 || radios.length < 2) return;
	e.preventDefault();
	const delta = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
	const next = radios[(at + delta + radios.length) % radios.length];
	next?.focus();
	next?.click();
}

export const T = {
	bg: 'var(--color-bg)',
	surf: 'var(--color-surface)',
	raised: 'var(--color-surface-raised)',
	alt: 'var(--color-surface-alt)',
	sunken: 'var(--color-surface-sunken)',
	overlay: 'var(--color-surface-overlay)',
	bd: 'var(--color-border)',
	bdS: 'var(--color-border-strong)',
	ink: 'var(--color-text-primary)',
	sub: 'var(--color-text-secondary)',
	ter: 'var(--color-text-tertiary)',
	acc: 'var(--color-accent)',
	accSub: 'var(--color-accent-subtle)',
	accBd: 'var(--color-accent-border)',
	accFg: 'var(--color-accent-foreground)',
	sans: 'var(--font-sans)',
	disp: 'var(--font-display)',
	mono: 'var(--font-mono)',
	ok: 'var(--color-status-success)',
	warn: 'var(--color-status-warning)',
	err: 'var(--color-status-error)',
	info: 'var(--color-status-info)',
	dm: 'var(--color-dm-only-badge)',
	hover: 'var(--color-interactive-hover)',
	smd: 'var(--shadow-md)',
	ssm: 'var(--shadow-sm)',
} as const;

export const eb: CSSProperties = {
	font: `600 11px ${T.sans}`,
	letterSpacing: '.09em',
	textTransform: 'uppercase',
	color: T.ter,
};

export const mono: CSSProperties = { fontFamily: T.mono };

export function Panel({
	title,
	action,
	children,
	style,
	pad = 18,
	accent,
}: {
	title?: ReactNode;
	action?: ReactNode;
	children?: ReactNode;
	style?: CSSProperties;
	pad?: number;
	accent?: boolean;
}) {
	return (
		<section
			style={{
				minWidth: 0,
				display: 'flex',
				flexDirection: 'column',
				gap: 12,
				background: T.raised,
				border: `1px solid ${accent ? T.accBd : T.bd}`,
				borderRadius: 10,
				padding: pad,
				boxShadow: accent ? T.smd : 'none',
				...style,
			}}
		>
			{title && (
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						gap: 10,
						flexWrap: 'wrap',
					}}
				>
					<h2 style={{ font: `700 14px ${T.disp}`, color: T.ink, margin: 0 }}>{title}</h2>
					{action}
				</div>
			)}
			{children}
		</section>
	);
}

export function Page({
	children,
	max = 1180,
	style,
}: {
	children?: ReactNode;
	max?: number;
	style?: CSSProperties;
}) {
	const viewport = useViewport();
	return (
		<div
			style={{
				width: '100%',
				minWidth: 0,
				padding: viewport === 'phone' ? '16px 14px 76px' : '24px 28px 56px',
				maxWidth: max,
				margin: '0 auto',
				...style,
			}}
		>
			{children}
		</div>
	);
}

export function Seg({
	options,
	value,
	onChange,
	ariaLabel,
}: {
	options: { value: string; label: ReactNode; disabled?: boolean }[];
	value: string;
	onChange: (v: string) => void;
	/** Names the group for assistive tech (the control is a radiogroup, WCAG 4.1.2). */
	ariaLabel?: string;
}) {
	const refs = useRef<(HTMLButtonElement | null)[]>([]);
	// ARIA radiogroup: one tab stop for the whole group, Arrow/Home/End move the selection
	// (same roving-tabIndex contract as ds/components/core/Tabs.jsx).
	const selectedIndex = options.findIndex((o) => o.value === value && !o.disabled);
	const tabStopIndex = selectedIndex >= 0 ? selectedIndex : options.findIndex((o) => !o.disabled);
	const moveSelection = (from: number, direction: number) => {
		if (options.length === 0) return;
		for (let offset = 1; offset <= options.length; offset += 1) {
			const index = (from + direction * offset + options.length) % options.length;
			const option = options[index];
			if (!option || (option.disabled && option.value !== value)) continue;
			refs.current[index]?.focus();
			onChange(option.value);
			return;
		}
	};
	return (
		<div
			role="radiogroup"
			aria-label={ariaLabel}
			style={{
				display: 'inline-flex',
				flexWrap: 'wrap',
				maxWidth: '100%',
				gap: 2,
				padding: 3,
				borderRadius: 9,
				background: T.sunken,
				border: `1px solid ${T.bd}`,
			}}
		>
			{options.map((o, index) => {
				const on = o.value === value;
				const off = o.disabled && !on;
				return (
					<button
						key={o.value}
						ref={(node) => {
							refs.current[index] = node;
						}}
						type="button"
						role="radio"
						aria-checked={on}
						tabIndex={index === tabStopIndex ? 0 : -1}
						disabled={off}
						onClick={() => !off && onChange(o.value)}
						onKeyDown={(event) => {
							if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
								event.preventDefault();
								moveSelection(index, 1);
							} else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
								event.preventDefault();
								moveSelection(index, -1);
							} else if (event.key === 'Home' || event.key === 'End') {
								event.preventDefault();
								moveSelection(event.key === 'Home' ? -1 : 0, event.key === 'Home' ? 1 : -1);
							}
						}}
						style={{
							padding: '7px 15px',
							borderRadius: 7,
							border: 'none',
							cursor: off ? 'not-allowed' : 'pointer',
							whiteSpace: 'nowrap',
							opacity: off ? 0.4 : 1,
							background: on ? T.accSub : 'transparent',
							color: on ? T.acc : T.sub,
							font: `${on ? 600 : 500} 12.5px ${T.sans}`,
						}}
					>
						{o.label}
					</button>
				);
			})}
		</div>
	);
}

/**
 * BackBar — the prototype's `<nav aria-label="Breadcrumb">` back link used at the top of creator /
 * detail routes (app.jsx `BackBar`). Pass a route `to` (navigated via react-router) or an explicit
 * `onClick`; `label` is the destination name shown beside the chevron.
 */
export function BackBar({
	to,
	label,
	onClick,
}: {
	to?: string;
	label: ReactNode;
	onClick?: () => void;
}) {
	const navigate = useNavigate();
	return (
		<nav aria-label="Breadcrumb" style={{ marginBottom: 14 }}>
			<button
				type="button"
				onClick={onClick ?? (() => navigate(to ?? '/'))}
				style={{
					display: 'inline-flex',
					alignItems: 'center',
					gap: 6,
					border: 'none',
					background: 'transparent',
					cursor: 'pointer',
					color: T.sub,
					font: `13px ${T.sans}`,
					padding: 0,
				}}
			>
				<Icon name="chevron-left" size={16} />
				{label}
			</button>
		</nav>
	);
}

export function SetRow({
	label,
	help,
	control,
}: {
	label: ReactNode;
	help?: ReactNode;
	control?: ReactNode;
}) {
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 16,
				padding: '14px 0',
				borderBottom: `1px solid ${T.bd}`,
				flexWrap: 'wrap',
			}}
		>
			<div style={{ flex: '1 1 200px', minWidth: 0 }}>
				<div style={{ font: `600 13.5px ${T.sans}`, color: T.ink }}>{label}</div>
				{help && <div style={{ font: `12px ${T.sans}`, color: T.ter, marginTop: 2 }}>{help}</div>}
			</div>
			<div style={{ minWidth: 0, maxWidth: '100%' }}>{control}</div>
		</div>
	);
}
