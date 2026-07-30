import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { Field } from '../forms/Field.jsx';
import { Input } from '../forms/Input.jsx';
import { Select } from '../forms/Select.jsx';
import { Button } from '../core/Button.jsx';

/**
 * MapCreationForm — the new-map entry form (UX-MAP-006 / MAP-001). Name, scale (units-per-map +
 * unit label, used for distance & travel time), projection, and default visibility. Visibility
 * fails closed to DM-only (MAP-001 AC2) — the safe default, surfaced explicitly in the hint copy.
 * Submit stays disabled until Name is non-empty. Drop it inside a Dialog (desktop) or sheet
 * (mobile); this component is the form body + actions, not the modal chrome.
 */
export function MapCreationForm({ defaults = {}, onCreate, onCancel, submitting = false, style, ...rest }) {
	const [name, setName] = React.useState(defaults.name || '');
	const [scale, setScale] = React.useState(defaults.scale || '');
	const [unit, setUnit] = React.useState(defaults.unit || 'miles');
	const [projection, setProjection] = React.useState(defaults.projection || 'flat');
	const [visibility, setVisibility] = React.useState(defaults.visibility || 'dm-only');
	const [touched, setTouched] = React.useState(false);
	const nameError = touched && !name.trim() ? 'A map name is required.' : null;

	const submit = (e) => {
		e.preventDefault();
		if (!name.trim()) { setTouched(true); return; }
		onCreate && onCreate({ name: name.trim(), scale: scale ? Number(scale) : null, unit, projection, visibility });
	};

	return (
		<form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', ...style }} {...rest}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
				<span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 'var(--radius-md)', background: 'var(--color-accent-subtle)', color: 'var(--color-accent)', border: '1px solid var(--color-accent-border)' }}><Icon name="new-map" size={18} /></span>
				<h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-primary)' }}>Create a new map</h2>
			</div>

			<Field label="Name" required error={nameError}>
				<Input autoFocus value={name} placeholder="e.g. Sunless Citadel" invalid={!!nameError} onChange={(e) => setName(e.target.value)} onBlur={() => setTouched(true)} />
			</Field>

			<Field label="Scale" help="Used for distance measurement and travel time.">
				<div style={{ display: 'flex', gap: 'var(--space-2)' }}>
					<Input type="number" min="0" value={scale} placeholder="120" onChange={(e) => setScale(e.target.value)} style={{ flex: '1 1 0' }} aria-label="Units per map" />
					<Input value={unit} placeholder="miles" onChange={(e) => setUnit(e.target.value)} style={{ flex: '1 1 0' }} aria-label="Unit label" />
				</div>
			</Field>

			<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
				<Field label="Projection">
					<Select value={projection} onChange={(e) => setProjection(e.target.value)} options={[{ value: 'flat', label: 'Flat' }, { value: 'equirectangular', label: 'Equirectangular' }, { value: 'mercator', label: 'Web Mercator' }]} />
				</Field>
				<Field label="Default visibility">
					<Select value={visibility} onChange={(e) => setVisibility(e.target.value)} options={[{ value: 'dm-only', label: 'DM only' }, { value: 'players', label: 'Player visible' }, { value: 'shared', label: 'Shared' }]} />
				</Field>
			</div>

			<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', background: 'var(--color-dm-only-subtle)', border: '1px solid color-mix(in oklab, var(--color-dm-only-badge) 40%, transparent)' }}>
				<Icon name="dm-only" size={15} color="var(--color-dm-only-badge)" />
				<span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>New maps default to <strong style={{ color: 'var(--color-text-primary)' }}>DM only</strong> — safe to share when ready.</span>
			</div>

			<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
				<Button variant="ghost" type="button" onClick={onCancel}>Cancel</Button>
				{/* NOT `disabled={!name.trim()}`: `submit()` already handles the empty case by setting
				    `touched`, which renders the Field's "A map name is required." alert — but a natively
				    disabled button can never run it, so the DM saw a permanently greyed Create map with the
				    explanation reachable only by focusing and blurring Name. Only `submitting` hard-disables. */}
				<Button variant="primary" type="submit" icon="new-map" disabled={submitting}>{submitting ? 'Creating…' : 'Create map'}</Button>
			</div>
		</form>
	);
}
