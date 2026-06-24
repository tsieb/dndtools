import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { Chip } from '../feedback/Chip.jsx';
import { LayerRow } from './LayerRow.jsx';
import { LAYER_TYPES } from './LayerTypeBadge.jsx';

/**
 * LayerPanel — the right-sidebar layer system (UX-MAP-004). Composes a tag filter bar, a
 * render-ordered list of LayerRow (top of list = top of the render stack), and an "Add layer"
 * action. It manages display/visibility/opacity/lock/reorder internally so it drops straight into
 * a card or template, and mirrors every change up through `onChange`.
 *
 * `readOnly` renders the actor-filtered player/observer view: no filter authoring, no add button,
 * label-only rows — and only layers the actor may see should be passed in.
 */
export function LayerPanel({ layers: initial = [], readOnly = false, onChange, onAddLayer, title = 'Layers', style, ...rest }) {
	const [layers, setLayers] = React.useState(initial);
	const [filter, setFilter] = React.useState(null);
	React.useEffect(() => { setLayers(initial); }, [initial]);

	const update = (next) => { setLayers(next); onChange && onChange(next); };
	const patch = (id, p) => update(layers.map((l) => (l.id === id ? { ...l, ...p } : l)));
	const move = (id, delta) => {
		const i = layers.indexOf(layers.find((l) => l.id === id));
		const j = i + delta;
		if (i < 0 || j < 0 || j >= layers.length) return;
		const next = layers.slice();
		[next[i], next[j]] = [next[j], next[i]];
		update(next);
	};
	const cycleVis = (id, next) => patch(id, { visibility: next });

	const presentTypes = [...new Set(layers.map((l) => l.type))];

	return (
		<div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden', ...style }} {...rest}>
			<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', padding: 'var(--space-2-5, 10px) var(--space-3)', borderBottom: '1px solid var(--color-border)' }}>
				<span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1-5)', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-weight-semibold)', letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>
					<Icon name="layers" size={14} /> {title}
				</span>
				<span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--color-text-tertiary)' }}>{layers.length}</span>
			</div>

			{!readOnly && presentTypes.length > 1 && (
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)', padding: 'var(--space-2) var(--space-3)', borderBottom: '1px solid var(--color-border)' }}>
					{presentTypes.map((t) => (
						<Chip key={t} tone={filter === t ? 'accent' : 'neutral'} selected={filter === t} onClick={() => setFilter(filter === t ? null : t)} icon={(LAYER_TYPES[t] || LAYER_TYPES.custom).icon} style={{ cursor: 'pointer' }}>
							{(LAYER_TYPES[t] || LAYER_TYPES.custom).label}
						</Chip>
					))}
					{filter && <Chip tone="neutral" onClick={() => setFilter(null)} style={{ cursor: 'pointer' }} onRemove={() => setFilter(null)}>Clear</Chip>}
				</div>
			)}

			<div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--space-1)' }}>
				{layers.length === 0 ? (
					<div style={{ padding: 'var(--space-6) var(--space-4)', textAlign: 'center', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)' }}>
						<Icon name="layers" size={28} style={{ opacity: 0.5, marginBottom: 'var(--space-2)' }} />
						<div>{readOnly ? 'No layers visible to you' : 'Add your first layer'}</div>
					</div>
				) : (
					layers.map((l) => (
						<LayerRow
							key={l.id}
							layer={l}
							readOnly={readOnly}
							dimmed={filter ? l.type !== filter : false}
							onToggleDisplay={() => patch(l.id, { dmDisplay: !l.dmDisplay })}
							onCycleVisibility={(next) => cycleVis(l.id, next)}
							onOpacityChange={(v) => patch(l.id, { opacity: v })}
							onToggleLock={() => patch(l.id, { locked: !l.locked })}
							onRename={(name) => patch(l.id, { name })}
							onMove={(d) => move(l.id, d)}
						/>
					))
				)}
			</div>

			{!readOnly && (
				<button type="button" onClick={onAddLayer} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-1-5)', margin: 'var(--space-2)', padding: 'var(--space-2)', border: '1px dashed var(--color-border-strong)', borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-weight-medium)', cursor: 'pointer' }}
					onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-interactive-hover)'; e.currentTarget.style.color = 'var(--color-text-primary)'; }}
					onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
				>
					<Icon name="add" size={16} /> Add layer
				</button>
			)}
		</div>
	);
}
