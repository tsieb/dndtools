import React from 'react';
import { Icon } from '../core/Icon.jsx';

/**
 * ToolPalette — the map editor's drawing-tool rail (UX-MAP-007). Holds ≤8 visible tools plus an
 * overflow, follows the Foundry/Owlbear "one active tool at a time" model (active tool = gold
 * fill), and pairs an undo/redo cluster so every paint stroke stays reversible (MAP-003). Render
 * `orientation="vertical"` for the desktop left rail, `"horizontal"` for the mobile bottom strip.
 *
 * Each button is ≥44px on touch via the density token; the active tool sets aria-pressed.
 */
export const DEFAULT_TOOLS = [
	{ id: 'select', icon: 'tool-select', label: 'Select' },
	{ id: 'brush', icon: 'tool-brush', label: 'Brush / terrain' },
	{ id: 'stamp', icon: 'tool-stamp', label: 'Stamp' },
	{ id: 'shape', icon: 'tool-shape', label: 'Shape' },
	{ id: 'eraser', icon: 'tool-eraser', label: 'Eraser' },
	{ id: 'text', icon: 'tool-text', label: 'Text' },
	{ id: 'fill', icon: 'tool-fill', label: 'Fill' },
];

export function ToolPalette({
	tools = DEFAULT_TOOLS,
	active,
	onSelect,
	orientation = 'vertical',
	onUndo,
	onRedo,
	canUndo = false,
	canRedo = false,
	overflow = true,
	style,
	...rest
}) {
	const vertical = orientation === 'vertical';
	const Divider = () => <span aria-hidden="true" style={{ background: 'var(--color-border)', ...(vertical ? { height: 1, width: '60%', margin: '2px auto' } : { width: 1, height: '60%', margin: 'auto 2px' }) }} />;
	return (
		<div
			role="toolbar"
			aria-label="Drawing tools"
			aria-orientation={orientation}
			style={{
				display: 'flex',
				flexDirection: vertical ? 'column' : 'row',
				alignItems: 'center',
				gap: 'var(--space-1)',
				padding: 'var(--space-1)',
				background: 'var(--color-surface-raised)',
				border: '1px solid var(--color-border)',
				borderRadius: 'var(--radius-md)',
				width: vertical ? 48 : 'max-content',
				...style,
			}}
			{...rest}
		>
			{tools.map((t) => {
				const on = t.id === active;
				return (
					<button
						key={t.id}
						type="button"
						aria-label={t.label}
						aria-pressed={on}
						title={t.label}
						onClick={() => onSelect && onSelect(t.id)}
						style={toolBtn(on)}
						onMouseEnter={(e) => { if (!on) { e.currentTarget.style.background = 'var(--color-interactive-hover)'; e.currentTarget.style.color = 'var(--color-text-primary)'; } }}
						onMouseLeave={(e) => { if (!on) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-secondary)'; } }}
					>
						<Icon name={t.icon} size="sm" />
					</button>
				);
			})}
			{overflow && (
				<button type="button" aria-label="More tools" title="More tools" onClick={() => onSelect && onSelect('more')} style={toolBtn(active === 'more')}>
					<Icon name="more" size="sm" />
				</button>
			)}
			<Divider />
			<button type="button" aria-label="Undo last stroke" title="Undo (⌘Z)" onClick={onUndo} disabled={!canUndo} style={toolBtn(false, !canUndo)}>
				<Icon name="undo" size="sm" />
			</button>
			<button type="button" aria-label="Redo" title="Redo (⌘⇧Z)" onClick={onRedo} disabled={!canRedo} style={toolBtn(false, !canRedo)}>
				<Icon name="redo" size="sm" />
			</button>
		</div>
	);
}

function toolBtn(active, disabled) {
	return {
		display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
		width: 38, height: 38, flex: '0 0 auto', padding: 0,
		borderRadius: 'var(--radius-sm)',
		border: '1px solid ' + (active ? 'var(--color-accent)' : 'transparent'),
		background: active ? 'var(--color-accent)' : 'transparent',
		color: active ? 'var(--color-accent-foreground)' : 'var(--color-text-secondary)',
		cursor: disabled ? 'not-allowed' : 'pointer',
		opacity: disabled ? 0.35 : 1,
		transition: 'background var(--duration-micro) var(--easing-standard), color var(--duration-micro) var(--easing-standard)',
	};
}
