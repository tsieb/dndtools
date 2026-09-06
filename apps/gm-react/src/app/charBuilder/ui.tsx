/**
 * CharBuilder field primitives — the label, selectable tile, honest note, entry path card and
 * numeric stepper the wizard steps compose.
 *
 * Split out of the former single-file `app/CharBuilder.tsx` (RC-STB-2.4) — a pure move, no
 * behaviour change.
 */
import { useState } from 'react';
import { Icon, IconButton } from '../../ds';
import { T, eb } from '../screen-kit';
import { clamp } from './data';

export function FieldLabel({
	children,
	hint,
}: {
	children: React.ReactNode;
	hint?: React.ReactNode;
}) {
	return (
		<div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 7 }}>
			<span style={eb}>{children}</span>
			{hint && <span style={{ font: `11px ${T.sans}`, color: T.ter }}>{hint}</span>}
		</div>
	);
}

/* a selectable tile used for kind / race / class / background / visibility */
export function Tile({
	on,
	onClick,
	title,
	sub,
	icon,
	badge,
	compact,
}: {
	on: boolean;
	onClick: () => void;
	title: React.ReactNode;
	sub?: React.ReactNode;
	icon?: string;
	badge?: React.ReactNode;
	compact?: boolean;
}) {
	// The wizard's most-clicked control (kind, race, class, background, visibility) had a declared
	// `transition` but no hover handler, and there is no global `button:hover` rule to fall back on —
	// so it was the one primitive here with zero pointer feedback. PathCard just below is the pattern.
	const [hov, setHov] = useState(false);
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={on}
			onMouseEnter={() => setHov(true)}
			onMouseLeave={() => setHov(false)}
			style={{
				textAlign: 'left',
				display: 'flex',
				alignItems: 'center',
				gap: 11,
				padding: compact ? '10px 12px' : '13px 14px',
				borderRadius: 11,
				cursor: 'pointer',
				border: `1px solid ${on || hov ? T.accBd : T.bd}`,
				background: on ? T.accSub : hov ? T.hover : T.surf,
				boxShadow: on ? T.smd : 'none',
				transition:
					'background var(--duration-fast) var(--easing-standard), border-color var(--duration-fast) var(--easing-standard)',
			}}
		>
			{icon && (
				<span
					style={{
						width: 34,
						height: 34,
						borderRadius: 9,
						flex: '0 0 auto',
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'center',
						background: on ? T.acc : T.alt,
						color: on ? T.accFg : T.acc,
					}}
				>
					<Icon name={icon} size="sm" />
				</span>
			)}
			<span style={{ flex: 1, minWidth: 0 }}>
				<span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
					<span style={{ font: `600 13.5px ${T.sans}`, color: on ? T.acc : T.ink }}>{title}</span>
					{badge}
				</span>
				{sub && (
					<span
						style={{ display: 'block', font: `11.5px/1.4 ${T.sans}`, color: T.sub, marginTop: 1 }}
					>
						{sub}
					</span>
				)}
			</span>
			{on && <Icon name="check" size={16} color={T.acc} />}
		</button>
	);
}

/** A muted dashed note for a step section the core model can't back (honest, never a silent no-op). */
export function HonestNote({ children }: { children: React.ReactNode }) {
	return (
		<div
			style={{
				font: `12px/1.5 ${T.sans}`,
				color: T.ter,
				padding: '10px 12px',
				borderRadius: 10,
				border: `1.5px dashed ${T.bdS}`,
			}}
		>
			{children}
		</div>
	);
}

export function PathCard({
	icon,
	title,
	desc,
	cta,
	onClick,
	primary,
	badge,
}: {
	icon: string;
	title: string;
	desc: string;
	cta: string;
	onClick: () => void;
	primary?: boolean;
	badge?: React.ReactNode;
}) {
	const [h, setH] = useState(false);
	return (
		<button
			type="button"
			onClick={onClick}
			onMouseEnter={() => setH(true)}
			onMouseLeave={() => setH(false)}
			style={{
				textAlign: 'left',
				display: 'flex',
				flexDirection: 'column',
				gap: 14,
				padding: 24,
				borderRadius: 16,
				cursor: 'pointer',
				border: `1px solid ${primary || h ? T.accBd : T.bd}`,
				background: primary
					? `linear-gradient(160deg, ${T.accSub}, ${T.surf})`
					: h
						? T.alt
						: T.surf,
				boxShadow: primary ? T.smd : 'none',
			}}
		>
			<span
				style={{
					width: 48,
					height: 48,
					borderRadius: 12,
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					background: primary ? T.acc : T.accSub,
					color: primary ? T.accFg : T.acc,
				}}
			>
				<Icon name={icon} size="lg" />
			</span>
			<div>
				<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
					<span style={{ font: `700 18px ${T.disp}` }}>{title}</span>
					{badge}
				</div>
				<p style={{ margin: '6px 0 0', font: `13px/1.6 ${T.sans}`, color: T.sub }}>{desc}</p>
			</div>
			<span
				style={{
					marginTop: 'auto',
					display: 'inline-flex',
					alignItems: 'center',
					gap: 7,
					font: `600 13px ${T.sans}`,
					color: T.acc,
				}}
			>
				{cta}
				<Icon name="chevron-right" size={15} />
			</span>
		</button>
	);
}

/** The numeric +/- stepper from the design source (local to the builder, not the DS progress Stepper). */
export function NumStepper({
	value,
	onChange,
	min = 0,
	max = 99,
	step = 1,
	mono: isMono,
	label,
}: {
	value: number;
	onChange: (v: number) => void;
	min?: number;
	max?: number;
	step?: number;
	mono?: boolean;
	label?: string;
}) {
	// The readout used to be a plain <span>, so the ONLY way to reach a value was the +/- pair: hit
	// points (min 1, max 600, step 1) needed up to 249 activations, and there was no spinbutton role,
	// no typed entry and no Arrow/Page/Home/End. `draft` is null whenever the input mirrors the
	// committed prop, so an external reset (class change reseeding hp) needs no syncing effect.
	const [draft, setDraft] = useState<string | null>(null);
	const name = label ?? 'value';

	const commit = (raw: string) => {
		setDraft(null);
		const n = Number(raw);
		// A blank or non-numeric entry keeps the last good value rather than storing NaN.
		if (raw.trim() === '' || !Number.isFinite(n)) return;
		const next = clamp(Math.round(n), min, max);
		if (next !== value) onChange(next);
	};

	const setTo = (n: number) => {
		setDraft(null);
		const next = clamp(Math.round(n), min, max);
		if (next !== value) onChange(next);
	};

	const nudge = (delta: number) => {
		const base = draft === null ? value : Number(draft);
		setTo((Number.isFinite(base) ? base : value) + delta);
	};

	const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		const jump = step * 10;
		if (e.key === 'ArrowUp') nudge(step);
		else if (e.key === 'ArrowDown') nudge(-step);
		else if (e.key === 'PageUp') nudge(jump);
		else if (e.key === 'PageDown') nudge(-jump);
		else if (e.key === 'Home') setTo(min);
		else if (e.key === 'End') setTo(max);
		else if (e.key === 'Enter') commit(draft ?? String(value));
		else return;
		e.preventDefault();
	};

	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 8,
				padding: '4px 4px 4px 10px',
				borderRadius: 9,
				border: `1px solid ${T.bd}`,
				background: T.surf,
				width: 'fit-content',
			}}
		>
			<input
				type="text"
				inputMode="numeric"
				role="spinbutton"
				aria-label={name}
				aria-valuenow={value}
				aria-valuemin={min}
				aria-valuemax={max}
				value={draft ?? String(value)}
				onChange={(e) => setDraft(e.target.value)}
				onKeyDown={onKeyDown}
				onBlur={(e) => commit(e.target.value)}
				style={{
					font: `700 17px ${isMono ? T.mono : T.sans}`,
					color: T.ink,
					width: 46,
					textAlign: 'center',
					border: 'none',
					background: 'transparent',
					padding: '2px 0',
					borderRadius: 5,
				}}
			/>
			<IconButton
				icon="Minus"
				label={`Decrease ${name}`}
				variant="outline"
				size="sm"
				aria-disabled={value <= min ? true : undefined}
				title={value <= min ? `${name} is already at the minimum of ${min}` : undefined}
				onClick={() => nudge(-step)}
			/>
			<IconButton
				icon="add"
				label={`Increase ${name}`}
				variant="outline"
				size="sm"
				aria-disabled={value >= max ? true : undefined}
				title={value >= max ? `${name} is already at the maximum of ${max}` : undefined}
				onClick={() => nudge(step)}
			/>
		</div>
	);
}
