import { en } from '../../../i18n/messages/en';

export interface MapDraft {
	name: string;
	scale: number | null;
	unit: string;
	projection: 'flat' | 'equirectangular' | 'mercator';
	visibility: 'dm-only' | 'players' | 'shared';
}

/**
 * MapCreationForm — the new-map form body (name, scale, projection, default visibility). Fails
 * closed to DM-only; submit disabled until Name is set. Wrap in your own dialog/sheet chrome.
 */
export interface MapCreationFormProps extends Omit<
	React.FormHTMLAttributes<HTMLFormElement>,
	'onSubmit' | 'defaultValue'
> {
	defaults?: Partial<MapDraft>;
	onCreate?: (draft: MapDraft) => void;
	onCancel?: () => void;
	submitting?: boolean;
}

import React from 'react';
import { Icon } from '../core/Icon';
import { Field } from '../forms/Field';
import { Input } from '../forms/Input';
import { Select } from '../forms/Select';
import { Button } from '../core/Button';

/**
 * MapCreationForm — the new-map entry form (UX-MAP-006 / MAP-001). Name, scale (units-per-map +
 * unit label, used for distance & travel time), projection, and default visibility. Visibility
 * fails closed to DM-only (MAP-001 AC2) — the safe default, surfaced explicitly in the hint copy.
 * Submit stays disabled until Name is non-empty. Drop it inside a Dialog (desktop) or sheet
 * (mobile); this component is the form body + actions, not the modal chrome.
 */
export function MapCreationForm({
	defaults = {},
	onCreate,
	onCancel,
	submitting = false,
	style,
	...rest
}: MapCreationFormProps) {
	const [name, setName] = React.useState(defaults.name || '');
	const [scale, setScale] = React.useState(defaults.scale || '');
	const [unit, setUnit] = React.useState(defaults.unit || 'miles');
	const [projection, setProjection] = React.useState(defaults.projection || 'flat');
	const [visibility, setVisibility] = React.useState(defaults.visibility || 'dm-only');
	const [touched, setTouched] = React.useState(false);
	const nameError = touched && !name.trim() ? 'A map name is required.' : null;

	const submit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		if (!name.trim()) {
			setTouched(true);
			return;
		}
		void (
			onCreate &&
			onCreate({
				name: name.trim(),
				scale: scale ? Number(scale) : null,
				unit,
				projection,
				visibility,
			})
		);
	};

	return (
		<form
			onSubmit={submit}
			style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', ...style }}
			{...rest}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
				<span
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'center',
						width: 30,
						height: 30,
						borderRadius: 'var(--radius-md)',
						background: 'var(--color-accent-subtle)',
						color: 'var(--color-accent)',
						border: '1px solid var(--color-accent-border)',
					}}
				>
					<Icon name="new-map" size={18} />
				</span>
				<h2
					style={{
						margin: 0,
						fontFamily: 'var(--font-display)',
						fontSize: 'var(--text-lg)',
						fontWeight: 'var(--font-weight-bold)',
						color: 'var(--color-text-primary)',
					}}
				>
					{en['ds.mapCreationForm.createANewMap']}
				</h2>
			</div>

			<Field label={en['ds.mapCreationForm.name']} required error={nameError}>
				<Input
					autoFocus
					value={name}
					placeholder={en['ds.mapCreationForm.eGSunlessCitadel']}
					invalid={!!nameError}
					onChange={(e) => setName(e.target.value)}
					onBlur={() => setTouched(true)}
				/>
			</Field>

			<Field
				label={en['ds.mapCreationForm.scale']}
				help="Used for distance measurement and travel time."
			>
				<div style={{ display: 'flex', gap: 'var(--space-2)' }}>
					<Input
						type="number"
						min="0"
						value={scale}
						placeholder="120"
						onChange={(e) => setScale(e.target.value)}
						style={{ flex: '1 1 0' }}
						aria-label={en['ds.mapCreationForm.unitsPerMap']}
					/>
					<Input
						value={unit}
						placeholder={en['ds.mapCreationForm.miles']}
						onChange={(e) => setUnit(e.target.value)}
						style={{ flex: '1 1 0' }}
						aria-label={en['ds.mapCreationForm.unitLabel']}
					/>
				</div>
			</Field>

			<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
				<Field label={en['ds.mapCreationForm.projection']}>
					<Select
						value={projection}
						onChange={(e) => setProjection(e.target.value as MapDraft['projection'])}
						options={[
							{ value: 'flat', label: 'Flat' },
							{ value: 'equirectangular', label: 'Equirectangular' },
							{ value: 'mercator', label: 'Web Mercator' },
						]}
					/>
				</Field>
				<Field label={en['ds.mapCreationForm.defaultVisibility']}>
					<Select
						value={visibility}
						onChange={(e) => setVisibility(e.target.value as MapDraft['visibility'])}
						options={[
							{ value: 'dm-only', label: 'DM only' },
							{ value: 'players', label: 'Player visible' },
							{ value: 'shared', label: 'Shared' },
						]}
					/>
				</Field>
			</div>

			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 'var(--space-2)',
					padding: 'var(--space-2) var(--space-3)',
					borderRadius: 'var(--radius-sm)',
					background: 'var(--color-dm-only-subtle)',
					border: '1px solid color-mix(in oklab, var(--color-dm-only-badge) 40%, transparent)',
				}}
			>
				<Icon name="dm-only" size={15} color="var(--color-dm-only-badge)" />
				<span
					style={{
						fontFamily: 'var(--font-sans)',
						fontSize: 'var(--text-xs)',
						color: 'var(--color-text-secondary)',
					}}
				>
					{en['ds.mapCreationForm.newMapsDefaultTo']}{' '}
					<strong style={{ color: 'var(--color-text-primary)' }}>
						{en['ds.mapCreationForm.dmOnly']}
					</strong>
					{en['ds.mapCreationForm.safeToShareWhenReady']}
				</span>
			</div>

			<div
				style={{
					display: 'flex',
					justifyContent: 'flex-end',
					gap: 'var(--space-2)',
					marginTop: 'var(--space-1)',
				}}
			>
				<Button variant="ghost" type="button" onClick={onCancel}>
					{en['ds.mapCreationForm.cancel']}
				</Button>
				{/* NOT `disabled={!name.trim()}`: `submit()` already handles the empty case by setting
				    `touched`, which renders the Field's "A map name is required." alert — but a natively
				    disabled button can never run it, so the DM saw a permanently greyed Create map with the
				    explanation reachable only by focusing and blurring Name. Only `submitting` hard-disables. */}
				<Button variant="primary" type="submit" icon="new-map" disabled={submitting}>
					{submitting ? 'Creating…' : 'Create map'}
				</Button>
			</div>
		</form>
	);
}
