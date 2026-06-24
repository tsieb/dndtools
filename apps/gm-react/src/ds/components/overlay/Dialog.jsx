import React from 'react';
import { Icon } from '../core/Icon.jsx';

/**
 * Dialog — the modal chrome the system has long delegated to ("drop it inside a Dialog (desktop)…"
 * — MapCreationForm, ImportWizard). A scrim over the page plus one centered panel: title,
 * optional description, a body (any form), and a footer action row. This is the chrome; the body
 * is yours.
 *
 * Safety + a11y contract:
 *  - role=dialog, aria-modal, labelled by the title and described by the description.
 *  - Focus is sent in on open and TRAPPED (Tab wraps); Escape and backdrop click close it unless
 *    `dismissible={false}` — used for destructive confirms the DM must answer deliberately.
 *  - Body scroll locks while open. Closing restores focus to the element that opened it.
 *  - `tone="danger"` colours the header mark + primary affordance for destructive confirms; the
 *    distinct status-icon shape carries severity without relying on colour (A11Y-011).
 *
 * Renders inline (fixed-position, token z-index) — no portal — mirroring Popover, so it needs no
 * ReactDOM dependency from the bundle.
 */
const SIZES = { sm: 400, md: 540, lg: 760 };
const TONE_ICON = { default: null, danger: 'error', warning: 'warning', success: 'success', info: 'info' };
const TONE_COLOR = {
	danger: 'var(--color-status-error)',
	warning: 'var(--color-status-warning)',
	success: 'var(--color-status-success)',
	info: 'var(--color-status-info)',
};

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({
	open = false,
	onClose,
	title,
	description,
	tone = 'default',
	icon,
	size = 'md',
	dismissible = true,
	footer,
	children,
	style,
	...rest
}) {
	const panelRef = React.useRef(null);
	const returnFocusRef = React.useRef(null);
	const titleId = React.useId();
	const descId = React.useId();

	React.useEffect(() => {
		if (!open) return undefined;
		returnFocusRef.current = document.activeElement;
		const prevOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';

		const focusFirst = () => {
			const panel = panelRef.current;
			if (!panel) return;
			const f = panel.querySelector(FOCUSABLE);
			(f || panel).focus();
		};
		const t = setTimeout(focusFirst, 0);

		const onKey = (e) => {
			if (e.key === 'Escape' && dismissible) { e.stopPropagation(); onClose && onClose(); return; }
			if (e.key !== 'Tab') return;
			const panel = panelRef.current;
			if (!panel) return;
			const nodes = Array.from(panel.querySelectorAll(FOCUSABLE)).filter((n) => n.offsetParent !== null || n === panel);
			if (nodes.length === 0) { e.preventDefault(); panel.focus(); return; }
			const first = nodes[0];
			const last = nodes[nodes.length - 1];
			if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
			else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
		};
		document.addEventListener('keydown', onKey, true);
		return () => {
			clearTimeout(t);
			document.removeEventListener('keydown', onKey, true);
			document.body.style.overflow = prevOverflow;
			const rf = returnFocusRef.current;
			if (rf && rf.focus) rf.focus();
		};
	}, [open, dismissible, onClose]);

	if (!open) return null;

	const width = SIZES[size] || SIZES.md;
	const accent = TONE_COLOR[tone];
	const markName = icon || TONE_ICON[tone];

	return (
		<div
			style={{
				position: 'fixed', inset: 0, zIndex: 'var(--z-modal)',
				display: 'flex', alignItems: 'center', justifyContent: 'center',
				padding: 'var(--space-6)',
				background: 'var(--color-backdrop)',
				animation: 'dndScrimIn var(--duration-fast) var(--easing-standard)',
			}}
			onMouseDown={(e) => { if (dismissible && e.target === e.currentTarget) onClose && onClose(); }}
		>
			<style>{'@keyframes dndScrimIn{from{opacity:0}to{opacity:1}}@keyframes dndDialogIn{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}'}</style>
			<div
				ref={panelRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby={title ? titleId : undefined}
				aria-describedby={description ? descId : undefined}
				tabIndex={-1}
				style={{
					width, maxWidth: '100%', maxHeight: '100%',
					display: 'flex', flexDirection: 'column',
					background: 'var(--color-surface-raised)',
					border: '1px solid var(--color-border-strong)',
					borderRadius: 'var(--radius-lg)',
					boxShadow: 'var(--shadow-lg)',
					color: 'var(--color-text-primary)',
					outline: 'none', overflow: 'hidden',
					animation: 'dndDialogIn var(--duration-standard) var(--easing-decelerate)',
					...style,
				}}
				{...rest}
			>
				{(title || dismissible) && (
					<div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-border)' }}>
						{markName && (
							<span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, flex: '0 0 auto', borderRadius: 'var(--radius-md)', background: accent ? `color-mix(in srgb, ${accent} 14%, transparent)` : 'var(--color-accent-subtle)', color: accent || 'var(--color-accent)' }}>
								<Icon name={markName} size="sm" />
							</span>
						)}
						<div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', paddingTop: markName ? 'var(--space-1)' : 0 }}>
							{title && <h2 id={titleId} style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-lg)', fontWeight: 'var(--font-weight-semibold)', lineHeight: 1.25, color: 'var(--color-text-primary)' }}>{title}</h2>}
							{description && <p id={descId} style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>{description}</p>}
						</div>
						{dismissible && (
							<button type="button" aria-label="Close" onClick={() => onClose && onClose()} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, flex: '0 0 auto', border: 'none', background: 'transparent', color: 'var(--color-text-tertiary)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', transition: 'background var(--duration-fast) var(--easing-standard), color var(--duration-fast) var(--easing-standard)' }}
								onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-interactive-hover)'; e.currentTarget.style.color = 'var(--color-text-primary)'; }}
								onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
							>
								<Icon name="close" size="sm" />
							</button>
						)}
					</div>
				)}
				<div style={{ padding: 'var(--space-5)', overflowY: 'auto', flex: '1 1 auto' }}>{children}</div>
				{footer && (
					<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 'var(--space-2)', flexWrap: 'wrap', padding: 'var(--space-3) var(--space-5)', borderTop: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>{footer}</div>
				)}
			</div>
		</div>
	);
}
