import { useState } from 'react';
import type { ParamSpec, ParamValue } from '@dndtools/core';
import { Chip, Icon, SegmentedControl, Select, Slider, Switch } from '../../../ds';
import { T } from '../../screen-kit';

/**
 * MAP-021 — ParamControls renders ANY generator's parameter UI from its declared `ParamSpec[]`. There
 * is ZERO per-generator code here: a `number`/`int` becomes a slider PAIRED with a number input and
 * −/+ steppers (a lone slider is a WCAG 2.5.7 / F108 failure), a `boolean` a Switch, a `select` a
 * SegmentedControl (≤4 options) or Select, and `tags` a multi-select chip row. Each control is labelled
 * by `spec.label`, hints from `spec.help`, and — critically — declares whether a change `applies`
 * immediately or requires a re-run, so a drag never silently rerolls the map without warning.
 */

function ParamRow({
	spec,
	value,
	onChange,
}: {
	spec: ParamSpec;
	value: ParamValue;
	onChange: (next: ParamValue) => void;
}) {
	const appliesImmediate = spec.applies === 'immediate';
	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: 6,
				padding: '10px 0',
				borderBottom: `1px solid ${T.bd}`,
			}}
		>
			<div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
				<span style={{ font: `600 12.5px ${T.sans}`, color: T.ink }}>{spec.label}</span>
				<span
					title={
						appliesImmediate
							? 'Applies to the current preview immediately.'
							: 'Changing this re-runs the generator.'
					}
					style={{
						font: `10px ${T.sans}`,
						color: appliesImmediate ? T.info : T.ter,
						border: `1px solid ${T.bd}`,
						borderRadius: 6,
						padding: '0 5px',
					}}
				>
					{appliesImmediate ? 'live' : 're-run'}
				</span>
				<span style={{ flex: 1 }} />
			</div>
			<ParamControl spec={spec} value={value} onChange={onChange} />
			{spec.help && <span style={{ font: `11px/1.4 ${T.sans}`, color: T.ter }}>{spec.help}</span>}
		</div>
	);
}

function ParamControl({
	spec,
	value,
	onChange,
}: {
	spec: ParamSpec;
	value: ParamValue;
	onChange: (next: ParamValue) => void;
}) {
	if (spec.kind === 'number' || spec.kind === 'int') {
		const num = typeof value === 'number' ? value : spec.default;
		const isInt = spec.kind === 'int';
		const commit = (raw: number) => {
			if (!Number.isFinite(raw)) return;
			let next = Math.min(spec.max, Math.max(spec.min, raw));
			if (isInt) next = Math.round(next);
			onChange(next);
		};
		return (
			<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
				<Slider
					min={spec.min}
					max={spec.max}
					step={spec.step}
					value={num}
					aria-label={spec.label}
					valueLabel={`${num}${spec.unit ? ` ${spec.unit}` : ''}`}
					onChange={(v: number) => commit(v)}
					style={{ flex: 1 }}
				/>
				<button
					type="button"
					aria-label={`Decrease ${spec.label}`}
					onClick={() => commit(num - spec.step)}
					style={stepBtn}
				>
					<Icon name="remove" size={14} />
				</button>
				<input
					type="number"
					min={spec.min}
					max={spec.max}
					step={spec.step}
					value={num}
					aria-label={`${spec.label} value`}
					onChange={(e) => commit(Number(e.target.value))}
					style={{
						width: 64,
						textAlign: 'right',
						font: `12px ${T.mono}`,
						color: T.ink,
						background: T.sunken,
						border: `1px solid ${T.bdS}`,
						borderRadius: 7,
						padding: '5px 7px',
					}}
				/>
				<button
					type="button"
					aria-label={`Increase ${spec.label}`}
					onClick={() => commit(num + spec.step)}
					style={stepBtn}
				>
					<Icon name="add" size={14} />
				</button>
			</div>
		);
	}
	if (spec.kind === 'boolean') {
		const on = typeof value === 'boolean' ? value : spec.default;
		return (
			<Switch checked={on} aria-label={spec.label} onChange={(next: boolean) => onChange(next)} />
		);
	}
	if (spec.kind === 'select') {
		const current = typeof value === 'string' ? value : spec.default;
		if (spec.options.length <= 4) {
			return (
				<SegmentedControl
					ariaLabel={spec.label}
					value={current}
					onChange={(v: string) => onChange(v)}
					options={spec.options.map((o) => ({ value: o.value, label: o.label }))}
				/>
			);
		}
		return (
			<Select
				value={current}
				aria-label={spec.label}
				options={spec.options.map((o) => ({ value: o.value, label: o.label }))}
				onChange={(e: { target: { value: string } }) => onChange(e.target.value)}
			/>
		);
	}
	if (spec.kind !== 'tags') return null;
	// tags — a multi-select chip row.
	const selected: readonly string[] = Array.isArray(value)
		? (value as readonly string[])
		: spec.default;
	const toggle = (tag: string) => {
		const set = new Set(selected);
		if (set.has(tag)) set.delete(tag);
		else set.add(tag);
		onChange([...set].sort());
	};
	return (
		<div role="group" aria-label={spec.label} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
			{spec.options.map((o) => {
				const on = selected.includes(o.value);
				return (
					<button
						key={o.value}
						type="button"
						role="checkbox"
						aria-checked={on}
						title={o.help}
						onClick={() => toggle(o.value)}
						style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer' }}
					>
						<Chip tone={on ? 'accent' : 'neutral'} selected={on} icon={on ? 'check' : undefined}>
							{o.label}
						</Chip>
					</button>
				);
			})}
		</div>
	);
}

const stepBtn = {
	display: 'inline-flex',
	alignItems: 'center',
	justifyContent: 'center',
	width: 28,
	height: 28,
	flex: '0 0 auto',
	borderRadius: 7,
	border: `1px solid ${T.bdS}`,
	background: T.raised,
	color: T.sub,
	cursor: 'pointer',
	padding: 0,
} as const;

/**
 * Render a whole `ParamSpec[]` set: primary params above the fold, `advanced` ones grouped by
 * `param.group` into collapsible accordion sections inside the caller's disclosure.
 */
export function ParamControls({
	specs,
	values,
	onChange,
	scope = 'all',
}: {
	specs: readonly ParamSpec[];
	values: Record<string, ParamValue>;
	onChange: (id: string, next: ParamValue) => void;
	/** 'primary' renders only non-advanced params; 'advanced' only advanced; 'all' everything. */
	scope?: 'primary' | 'advanced' | 'all';
}) {
	const filtered = specs.filter((s) =>
		scope === 'all' ? true : scope === 'advanced' ? s.advanced === true : s.advanced !== true,
	);
	if (filtered.length === 0) return null;

	if (scope !== 'advanced') {
		return (
			<div>
				{filtered.map((spec) => (
					<ParamRow
						key={spec.id}
						spec={spec}
						value={values[spec.id] ?? defaultOf(spec)}
						onChange={(next) => onChange(spec.id, next)}
					/>
				))}
			</div>
		);
	}

	// Advanced params are grouped into accordion sections by `param.group`.
	const groups = new Map<string, ParamSpec[]>();
	for (const spec of filtered) {
		const key = spec.group ?? 'More';
		const bucket = groups.get(key) ?? [];
		bucket.push(spec);
		groups.set(key, bucket);
	}
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
			{[...groups.entries()].map(([group, groupSpecs]) => (
				<Accordion key={group} title={group} count={groupSpecs.length}>
					{groupSpecs.map((spec) => (
						<ParamRow
							key={spec.id}
							spec={spec}
							value={values[spec.id] ?? defaultOf(spec)}
							onChange={(next) => onChange(spec.id, next)}
						/>
					))}
				</Accordion>
			))}
		</div>
	);
}

function Accordion({
	title,
	count,
	children,
}: {
	title: string;
	count: number;
	children: React.ReactNode;
}) {
	const [open, setOpen] = useState(false);
	return (
		<div style={{ border: `1px solid ${T.bd}`, borderRadius: 9, overflow: 'hidden' }}>
			<button
				type="button"
				aria-expanded={open}
				onClick={() => setOpen((v) => !v)}
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 8,
					width: '100%',
					padding: '9px 11px',
					border: 'none',
					background: T.alt,
					cursor: 'pointer',
					font: `600 12px ${T.sans}`,
					color: T.ink,
					textAlign: 'left',
				}}
			>
				<Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} color={T.ter} />
				<span style={{ flex: 1 }}>{title}</span>
				<span style={{ font: `11px ${T.mono}`, color: T.ter }}>{count}</span>
			</button>
			{open && <div style={{ padding: '2px 11px 6px' }}>{children}</div>}
		</div>
	);
}

export function defaultOf(spec: ParamSpec): ParamValue {
	return spec.kind === 'tags' ? [...spec.default] : spec.default;
}
