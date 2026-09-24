import { Icon } from '../core/Icon';

// RC-POL-1.22 — the palette's key chip and result row, split from CommandPalette.jsx to keep the
// overlay under the 500-line target. The row is presentational: the palette owns the active index,
// the ids the combobox points at, and what running a command means.
export function Kbd({ children }) {
	return (
		<kbd
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				justifyContent: 'center',
				minWidth: 18,
				height: 18,
				padding: '0 5px',
				fontFamily: 'var(--font-mono)',
				fontSize: 'var(--text-2xs)',
				fontWeight: 'var(--font-weight-medium)',
				lineHeight: 1,
				color: 'var(--color-text-secondary)',
				background: 'var(--color-surface-sunken)',
				border: '1px solid var(--color-border)',
				borderRadius: 'var(--radius-sm)',
			}}
		>
			{children}
		</kbd>
	);
}

const TONE_COLOR = {
	accent: 'var(--color-accent)',
	danger: 'var(--color-status-error)',
	warning: 'var(--color-status-warning)',
	success: 'var(--color-status-success)',
	info: 'var(--color-status-info)',
	'dm-only': 'var(--color-dm-only-badge, #a763e8)',
};

/** One result: gold tint + rail when active (never colour alone), tone-tinted icon, trailing keys. */
export function PaletteRow({ cmd, id, isActive, rowRef, onActivate, onRun }) {
	const tone = TONE_COLOR[cmd.tone] || 'var(--color-accent)';
	return (
		<div
			ref={rowRef}
			id={id}
			role="option"
			aria-selected={isActive}
			aria-disabled={cmd.disabled || undefined}
			onMouseMove={() => {
				if (!cmd.disabled) onActivate();
			}}
			onClick={onRun}
			style={{
				position: 'relative',
				display: 'flex',
				alignItems: 'center',
				gap: 'var(--space-3)',
				padding: 'var(--space-2) var(--space-3)',
				borderRadius: 'var(--radius-md)',
				cursor: cmd.disabled ? 'not-allowed' : 'pointer',
				opacity: cmd.disabled ? 0.45 : 1,
				background: isActive ? 'var(--color-interactive-selected)' : 'transparent',
				transition: 'background var(--duration-fast) var(--easing-standard)',
			}}
		>
			{isActive && (
				<span
					aria-hidden="true"
					style={{
						position: 'absolute',
						left: 0,
						top: 6,
						bottom: 6,
						width: 3,
						borderRadius: 'var(--radius-full)',
						background: 'var(--color-accent)',
					}}
				/>
			)}
			{cmd.icon && (
				<span
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'center',
						width: 30,
						height: 30,
						flex: '0 0 auto',
						borderRadius: 'var(--radius-md)',
						background: isActive
							? 'color-mix(in srgb, ' + tone + ' 16%, transparent)'
							: 'var(--color-surface-sunken)',
						color: isActive ? tone : 'var(--color-text-secondary)',
						transition:
							'background var(--duration-fast) var(--easing-standard), color var(--duration-fast) var(--easing-standard)',
					}}
				>
					<Icon name={cmd.icon} size="sm" />
				</span>
			)}
			<div
				style={{
					flex: 1,
					minWidth: 0,
					display: 'flex',
					flexDirection: 'column',
					gap: 1,
				}}
			>
				<span
					style={{
						fontFamily: 'var(--font-sans)',
						fontSize: 'var(--text-base)',
						fontWeight: 'var(--font-weight-medium)',
						color: 'var(--color-text-primary)',
						whiteSpace: 'nowrap',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
					}}
				>
					{cmd.label}
				</span>
				{cmd.description && (
					<span
						style={{
							fontFamily: 'var(--font-sans)',
							fontSize: 'var(--text-xs)',
							color: 'var(--color-text-secondary)',
							whiteSpace: 'nowrap',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
						}}
					>
						{cmd.description}
					</span>
				)}
			</div>
			{cmd.meta && (
				<span
					style={{
						fontFamily: 'var(--font-sans)',
						fontSize: 'var(--text-xs)',
						color: 'var(--color-text-secondary)',
						flex: '0 0 auto',
					}}
				>
					{cmd.meta}
				</span>
			)}
			{cmd.shortcut && (
				<span
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						gap: 3,
						flex: '0 0 auto',
					}}
				>
					{(Array.isArray(cmd.shortcut) ? cmd.shortcut : [cmd.shortcut]).map((k, i) => (
						<Kbd key={i}>{k}</Kbd>
					))}
				</span>
			)}
			{cmd.trailing && (
				<span style={{ flex: '0 0 auto', display: 'inline-flex', alignItems: 'center' }}>
					{cmd.trailing}
				</span>
			)}
		</div>
	);
}
