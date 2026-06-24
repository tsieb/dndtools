import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { Popover } from '../core/Popover.jsx';
import { Slider } from '../forms/Slider.jsx';
import { LayerTypeBadge } from './LayerTypeBadge.jsx';

/**
 * LayerRow — the canonical layer-panel row (UX-MAP-004/006). Anatomy, left→right:
 *   drag handle · type badge · DM-display eye · visibility · name · opacity% · lock · actions
 *
 * It enforces anti-pattern AP-6: player-visibility, DM display, and opacity are THREE independent
 * controls — never one conflated slider. `readOnly` (the actor-filtered player/observer view)
 * strips every authoring affordance and renders the row as a static, label-only list item.
 *
 * Reorder is keyboard-accessible: Alt+ArrowUp / Alt+ArrowDown call onMove (the WCAG-2.5.7 fallback
 * to drag). Locked rows dim and disable their controls; filter-dimmed rows fade to 40%.
 */
const VIS = {
	'dm-only': { icon: 'dm-only', color: 'var(--color-dm-only-badge)', title: 'DM only — players cannot see this' },
	players: { icon: 'visibility-players', color: 'var(--color-status-success)', title: 'Visible to players' },
	shared: { icon: 'visibility-shared', color: 'var(--color-status-info)', title: 'Shared with all participants' },
};
const VIS_CYCLE = ['dm-only', 'players', 'shared'];

export function LayerRow({
	layer,
	readOnly = false,
	dimmed = false,
	selected = false,
	onToggleDisplay,
	onCycleVisibility,
	onOpacityChange,
	onToggleLock,
	onRename,
	onAction,
	onMove,
	style,
	...rest
}) {
	const { name = 'Untitled layer', type = 'custom', opacity = 100, dmDisplay = true, visibility = 'dm-only', locked = false } = layer || {};
	const [editing, setEditing] = React.useState(false);
	const [draft, setDraft] = React.useState(name);
	const [opacityOpen, setOpacityOpen] = React.useState(false);
	const vis = VIS[visibility] || VIS['dm-only'];
	const disabled = locked;

	const commit = () => { setEditing(false); if (draft.trim() && draft !== name && onRename) onRename(draft.trim()); else setDraft(name); };

	return (
		<div
			role="listitem"
			aria-label={`${name}, type ${type}, ${visibility}, ${locked ? 'locked' : 'unlocked'}`}
			onKeyDown={(e) => { if (!readOnly && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); onMove && onMove(e.key === 'ArrowUp' ? -1 : 1); } }}
			tabIndex={0}
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 'var(--space-1-5)',
				padding: '6px var(--space-2)',
				borderRadius: 'var(--radius-sm)',
				background: selected ? 'var(--color-interactive-selected)' : 'transparent',
				borderLeft: type === 'dm' ? '3px solid var(--layer-dm)' : '3px solid transparent',
				opacity: dimmed ? 0.4 : 1,
				outline: 'none',
				position: 'relative',
				...style,
			}}
			onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = 'var(--color-interactive-hover)'; }}
			onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = 'transparent'; }}
			{...rest}
		>
			{!readOnly && (
				<span aria-hidden="true" style={{ display: 'inline-flex', color: 'var(--color-text-tertiary)', cursor: locked ? 'not-allowed' : 'grab', flex: '0 0 auto' }}>
					<Icon name="drag-handle" size={16} />
				</span>
			)}

			<LayerTypeBadge type={type} compact style={{ flex: '0 0 auto' }} />

			{!readOnly && (
				<RowBtn label={`${name}: DM display ${dmDisplay ? 'on' : 'off'}`} onClick={() => !disabled && onToggleDisplay && onToggleDisplay()} disabled={disabled} active={dmDisplay}>
					<Icon name={dmDisplay ? 'dm-only' : 'hidden'} size={16} />
				</RowBtn>
			)}

			<RowBtn label={`Visibility: ${visibility}`} title={vis.title} onClick={() => { if (readOnly || disabled) return; onCycleVisibility && onCycleVisibility(VIS_CYCLE[(VIS_CYCLE.indexOf(visibility) + 1) % 3]); }} disabled={readOnly || disabled} color={vis.color}>
				<Icon name={vis.icon} size={15} />
			</RowBtn>

			{editing && !readOnly ? (
				<input
					autoFocus
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onBlur={commit}
					onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(name); setEditing(false); } }}
					style={{ flex: 1, minWidth: 0, font: 'inherit', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', background: 'var(--color-surface-sunken)', border: '1px solid var(--color-border-focus)', borderRadius: 'var(--radius-sm)', padding: '2px 6px', outline: 'none' }}
				/>
			) : (
				<button
					type="button"
					onDoubleClick={() => !readOnly && !disabled && setEditing(true)}
					style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'transparent', border: 'none', padding: 0, cursor: readOnly ? 'default' : 'text', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', fontWeight: selected ? 'var(--font-weight-semibold)' : 'var(--font-weight-regular)', color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
				>
					{name}
				</button>
			)}

			{!readOnly && (
				<div style={{ position: 'relative', flex: '0 0 auto' }}>
					<button type="button" onClick={() => !disabled && setOpacityOpen((v) => !v)} disabled={disabled} aria-label={`${name} opacity ${opacity}%`} style={{ background: 'transparent', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--color-text-tertiary)', padding: '2px 4px', minWidth: 34 }}>{opacity}%</button>
					{opacityOpen && (
						<Popover open onClose={() => setOpacityOpen(false)} width={200} placement="bottom" style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', transform: 'none' }}>
							<Slider min={0} max={100} step={5} value={opacity} onChange={onOpacityChange} label="Opacity" valueLabel={`${opacity}%`} aria-label={`${name} opacity`} />
						</Popover>
					)}
				</div>
			)}

			{!readOnly && (
				<RowBtn label={locked ? `Unlock ${name}` : `Lock ${name}`} onClick={() => onToggleLock && onToggleLock()} active={locked}>
					<Icon name={locked ? 'lock' : 'unlock'} size={15} />
				</RowBtn>
			)}

			{!readOnly && (
				<RowBtn label={`${name} actions`} onClick={() => onAction && onAction('menu')} disabled={disabled}>
					<Icon name="more" size={16} />
				</RowBtn>
			)}
		</div>
	);
}

function RowBtn({ children, label, title, onClick, disabled, active, color }) {
	return (
		<button
			type="button"
			aria-label={label}
			title={title || label}
			aria-pressed={active != null ? !!active : undefined}
			onClick={onClick}
			disabled={disabled}
			style={{
				display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
				width: 26, height: 26, flex: '0 0 auto', padding: 0,
				borderRadius: 'var(--radius-sm)', border: 'none', background: 'transparent',
				color: color || (active ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)'),
				cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1,
				transition: 'background var(--duration-micro) var(--easing-standard), color var(--duration-micro) var(--easing-standard)',
			}}
			onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.background = 'var(--color-interactive-hover)'; if (!color && !active) e.currentTarget.style.color = 'var(--color-text-primary)'; } }}
			onMouseLeave={(e) => { if (!disabled) { e.currentTarget.style.background = 'transparent'; if (!color) e.currentTarget.style.color = active ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)'; } }}
		>
			{children}
		</button>
	);
}
