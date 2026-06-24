import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { SegmentedControl } from '../forms/SegmentedControl.jsx';
import { Slider } from '../forms/Slider.jsx';
import { Checkbox } from '../forms/Checkbox.jsx';
import { StatusDot } from '../feedback/StatusDot.jsx';

/**
 * FogControls — the contextual options strip shown when the fog tool is active (UX-MAP-011). It
 * carries the fog-of-war safety model: a reveal/conceal mode toggle, a shape sub-tool
 * (brush · rectangle · polygon), a map-unit brush size, a feather toggle, and the Reveal-all /
 * Reset-fog presets (Reset confirms — AP-1). A sync pill reports whether the last operation
 * reached players, queueing offline (MAP-012). DM view sees terrain through 20% fog; players get
 * near-solid (AP-9) — this strip drives the DM authoring side.
 */
const SHAPES = [
	{ id: 'brush', icon: 'tool-brush', label: 'Brush' },
	{ id: 'rect', icon: 'tool-shape', label: 'Rectangle' },
	{ id: 'polygon', icon: 'tool-shape', label: 'Polygon' },
];

export function FogControls({
	mode = 'reveal',
	onModeChange,
	shape = 'brush',
	onShapeChange,
	brushSize = 24,
	onBrushSize,
	unit = 'units',
	feather = false,
	onFeather,
	syncStatus = 'synced',
	onRevealAll,
	onResetFog,
	style,
	...rest
}) {
	const sync = {
		synced: { status: 'live', label: 'Synced' },
		syncing: { status: 'syncing', label: 'Syncing to players…' },
		queued: { status: 'warning', label: 'Queued — offline' },
	}[syncStatus] || { status: 'idle', label: 'Not projecting' };

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-3)', background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', minWidth: 248, ...style }} {...rest}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1-5)', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-weight-semibold)', letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>
				<Icon name="layer-fog" size={14} /> Fog of war
			</div>

			<SegmentedControl
				fullWidth
				ariaLabel="Fog operation"
				value={mode}
				onChange={onModeChange}
				options={[{ value: 'reveal', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="reveal" size={14} /> Reveal</span> }, { value: 'conceal', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="conceal" size={14} /> Conceal</span> }]}
			/>

			<div style={{ display: 'flex', gap: 'var(--space-1)' }}>
				{SHAPES.map((s) => {
					const on = s.id === shape;
					return (
						<button key={s.id} type="button" aria-pressed={on} aria-label={s.label} title={s.label} onClick={() => onShapeChange && onShapeChange(s.id)}
							style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, height: 32, borderRadius: 'var(--radius-sm)', border: '1px solid ' + (on ? 'var(--color-accent-border)' : 'var(--color-border-strong)'), background: on ? 'var(--color-accent-subtle)' : 'var(--color-surface-sunken)', color: on ? 'var(--color-accent)' : 'var(--color-text-secondary)', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-2xs)' }}>
							<Icon name={s.icon} size={14} /> {s.label}
						</button>
					);
				})}
			</div>

			{shape === 'brush' && (
				<Slider min={5} max={200} step={5} value={brushSize} onChange={onBrushSize} label="Brush size" valueLabel={`${brushSize} ${unit}`} aria-label="Fog brush size" />
			)}

			<Checkbox checked={feather} onChange={onFeather} label={<span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>Feather edge</span>} />

			<div style={{ height: 1, background: 'var(--color-border)' }} />

			<div style={{ display: 'flex', gap: 'var(--space-2)' }}>
				<button type="button" onClick={onRevealAll} style={presetBtn}>
					<Icon name="reveal" size={14} /> Reveal all
				</button>
				<button type="button" onClick={onResetFog} style={{ ...presetBtn, color: 'var(--color-status-error-text)', borderColor: 'var(--color-status-error)' }}>
					<Icon name="retry" size={14} /> Reset fog
				</button>
			</div>

			<StatusDot status={sync.status} pulse={sync.status === 'syncing'} label={sync.label} />
		</div>
	);
}

const presetBtn = {
	flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-1-5)',
	height: 32, borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-strong)',
	background: 'var(--color-surface-sunken)', color: 'var(--color-text-secondary)',
	fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-weight-medium)', cursor: 'pointer',
};
