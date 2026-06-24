import React from 'react';

/**
 * Tooltip — the small label-on-hover/focus the system already promises (IconButton's `label` "also
 * the tooltip"). Names an icon-only control or adds a terse hint; it is NEVER the only place
 * information lives (no essential text, no interactive content inside).
 *
 * Opens on hover AND keyboard focus, closes on leave/blur/Escape; a short delay-in avoids flicker
 * when skimming a toolbar. Positions against the wrapped trigger with no layout shift (absolute,
 * token z-index above modals). Wrap a single focusable child.
 */
const POS = {
	top: { bottom: '100%', left: '50%', transform: 'translate(-50%, -6px)' },
	bottom: { top: '100%', left: '50%', transform: 'translate(-50%, 6px)' },
	left: { right: '100%', top: '50%', transform: 'translate(-6px, -50%)' },
	right: { left: '100%', top: '50%', transform: 'translate(6px, -50%)' },
};

export function Tooltip({ label, placement = 'top', delay = 250, children, style, ...rest }) {
	const [open, setOpen] = React.useState(false);
	const timer = React.useRef(null);
	const labelId = React.useId();

	const show = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(true), delay); };
	const hide = () => { clearTimeout(timer.current); setOpen(false); };

	React.useEffect(() => () => clearTimeout(timer.current), []);
	if (!label) return children;

	return (
		<span
			style={{ position: 'relative', display: 'inline-flex' }}
			onMouseEnter={show}
			onMouseLeave={hide}
			onFocusCapture={() => setOpen(true)}
			onBlurCapture={hide}
			onKeyDown={(e) => { if (e.key === 'Escape') hide(); }}
			{...rest}
		>
			{React.isValidElement(children) ? React.cloneElement(children, { 'aria-describedby': open ? labelId : undefined }) : children}
			{open && (
				<span
					id={labelId}
					role="tooltip"
					style={{
						position: 'absolute', zIndex: 'var(--z-tooltip)',
						...POS[placement],
						pointerEvents: 'none', whiteSpace: 'nowrap',
						padding: 'var(--space-1) var(--space-2)',
						background: 'var(--color-surface-overlay)',
						color: 'var(--color-text-primary)',
						border: '1px solid var(--color-border-strong)',
						borderRadius: 'var(--radius-sm)',
						boxShadow: 'var(--shadow-md)',
						fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-weight-medium)', lineHeight: 1.3,
						animation: 'dndTipIn var(--duration-fast) var(--easing-decelerate)',
						...style,
					}}
				>
					<style>{'@keyframes dndTipIn{from{opacity:0}to{opacity:1}}'}</style>
					{label}
				</span>
			)}
		</span>
	);
}
