import type React from 'react';
import { useEffect, useState } from 'react';
import { type WidgetConfigField } from '@dndtools/core';
import { Field, Input, Select, Switch, Textarea } from '../../ds';

/** A titled, top-bordered inspector section, matching the prototype's `Section`. */
export function Section({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: 'var(--space-2)',
				padding: 'var(--space-3) 0',
				borderTop: '1px solid var(--color-border)',
			}}
		>
			<span
				style={{
					font: '600 var(--text-2xs) var(--font-sans)',
					letterSpacing: 'var(--tracking-wider)',
					textTransform: 'uppercase',
					color: 'var(--color-text-tertiary)',
				}}
			>
				{label}
			</span>
			{children}
		</div>
	);
}

/**
 * Render one declared `WidgetConfigField` as the right control. Text/textarea/number commit on BLUR
 * (and Enter for single-line text) so a configure-widget op — and an IndexedDB write — fires once per
 * edit, never per keystroke; toggles/selects/colors are discrete and commit immediately.
 */
export function FieldControl({
	field,
	value,
	onCommit,
}: {
	field: WidgetConfigField;
	value: unknown;
	onCommit: (value: unknown) => void;
}) {
	const current = value ?? field.default;

	if (field.control === 'text' || field.control === 'textarea') {
		return (
			<TextFieldControl
				field={field}
				initial={current == null ? '' : String(current)}
				onCommit={onCommit}
			/>
		);
	}
	if (field.control === 'number') {
		return <NumberFieldControl field={field} initial={Number(current ?? 0)} onCommit={onCommit} />;
	}
	if (field.control === 'toggle') {
		return (
			<Switch
				checked={Boolean(current)}
				onChange={(v: boolean) => onCommit(v)}
				label={
					<span
						style={{
							font: 'var(--text-xs) var(--font-sans)',
							color: 'var(--color-text-secondary)',
						}}
					>
						{field.label}
					</span>
				}
			/>
		);
	}
	if (field.control === 'select') {
		return (
			<Field label={field.label}>
				<Select
					value={String(current ?? '')}
					onChange={(e: { target: { value: string } }) => onCommit(e.target.value)}
					options={field.options ?? []}
				/>
			</Field>
		);
	}
	if (field.control === 'color') {
		return (
			<Field label={field.label}>
				<input
					type="color"
					value={String(current ?? '#000000')}
					onChange={(e) => onCommit(e.target.value)}
					style={{
						width: 44,
						height: 28,
						padding: 0,
						border: '1px solid var(--color-border)',
						borderRadius: 'var(--radius-sm)',
						background: 'transparent',
						cursor: 'pointer',
					}}
				/>
			</Field>
		);
	}
	return null;
}

export function TextFieldControl({
	field,
	initial,
	onCommit,
}: {
	field: WidgetConfigField;
	initial: string;
	onCommit: (value: unknown) => void;
}) {
	const [draft, setDraft] = useState(initial);
	useEffect(() => setDraft(initial), [initial]);
	const commit = () => {
		if (draft !== initial) onCommit(draft);
	};
	const Comp = field.control === 'textarea' ? Textarea : Input;
	return (
		<Field label={field.label} help={field.help}>
			<Comp
				value={draft}
				placeholder={field.placeholder}
				{...(field.control === 'textarea' ? { rows: 3 } : {})}
				onChange={(e: { target: { value: string } }) => setDraft(e.target.value)}
				onBlur={commit}
				onKeyDown={
					field.control === 'text'
						? (e: React.KeyboardEvent) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									commit();
								}
							}
						: undefined
				}
			/>
		</Field>
	);
}

export function NumberFieldControl({
	field,
	initial,
	onCommit,
}: {
	field: WidgetConfigField;
	initial: number;
	onCommit: (value: unknown) => void;
}) {
	const [draft, setDraft] = useState(String(initial));
	useEffect(() => setDraft(String(initial)), [initial]);
	const commit = () => {
		const n = Number(draft);
		if (!Number.isFinite(n) || n === initial) return;
		const clamped = Math.min(field.max ?? Infinity, Math.max(field.min ?? -Infinity, n));
		onCommit(clamped);
	};
	return (
		<Field label={field.label} help={field.help}>
			<Input
				type="number"
				value={draft}
				min={field.min}
				max={field.max}
				step={field.step}
				onChange={(e: { target: { value: string } }) => setDraft(e.target.value)}
				onBlur={commit}
				onKeyDown={(e: React.KeyboardEvent) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						commit();
					}
				}}
			/>
		</Field>
	);
}
