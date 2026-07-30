import React from 'react';
import { Icon } from './Icon.jsx';
import { registerBackHandler } from '../../../platform/backNavigation';

/**
 * Popover — the floating panel primitive POI markers, layer opacity, and tool options sit on.
 *
 * It encodes the map surface's interaction-safety contract (MAP-015 / anti-pattern AP-8): the
 * popover dismisses on an OUTSIDE pointerdown, never on pointerleave — so the pointer can cross
 * the gap from a marker into the popover and operate its controls without it vanishing. Focus is
 * sent into the panel on open and the panel traps Escape to close.
 *
 * Position it by passing `anchor={{x, y}}` (map/page coordinates) or render it inline (no anchor).
 */
export function Popover({
	open = true,
	onClose,
	anchor,
	title,
	headerAccessory,
	placement = 'top',
	width = 320,
	children,
	footer,
	style,
	...rest
}) {
	const ref = React.useRef(null);
	const onCloseRef = React.useRef(onClose);
	onCloseRef.current = onClose;

	React.useEffect(() => {
		if (!open) return;
		const onDown = (e) => {
			if (ref.current && !ref.current.contains(e.target)) onCloseRef.current?.();
		};
		const onKey = (e) => {
			// Capture + stopPropagation, matching Dialog/Sheet. Without it the same Escape that
			// dismisses this popover also reaches surface-level keymaps underneath — closing a map
			// tool menu used to exit the whole map editor.
			if (e.key === 'Escape') {
				e.stopPropagation();
				onCloseRef.current?.();
			}
		};
		document.addEventListener('pointerdown', onDown, true);
		document.addEventListener('keydown', onKey, true);
		const unregisterBack = registerBackHandler('overlay', () => {
			onCloseRef.current?.();
			return true;
		});
		const t = setTimeout(() => {
			const f =
				ref.current &&
				ref.current.querySelector('button, [href], input, select, textarea, [tabindex]');
			if (f) f.focus();
		}, 0);
		return () => {
			document.removeEventListener('pointerdown', onDown, true);
			document.removeEventListener('keydown', onKey, true);
			unregisterBack();
			clearTimeout(t);
		};
	}, [open]);

	if (!open) return null;

	const positioned = anchor
		? {
				position: 'absolute',
				left: anchor.x,
				top: anchor.y,
				transform:
					placement === 'top'
						? 'translate(-50%, calc(-100% - 12px))'
						: placement === 'bottom'
							? 'translate(-50%, 12px)'
							: 'translate(-50%, -50%)',
				zIndex: 'var(--z-overlay)',
			}
		: {};

	return (
		<div
			ref={ref}
			role="dialog"
			aria-label={typeof title === 'string' ? title : undefined}
			style={{
				width,
				maxWidth: '90vw',
				background: 'var(--color-surface-overlay)',
				border: '1px solid var(--color-border-strong)',
				borderRadius: 'var(--radius-lg)',
				boxShadow: 'var(--shadow-lg)',
				color: 'var(--color-text-primary)',
				overflow: 'hidden',
				...positioned,
				...style,
			}}
			{...rest}
		>
			{(title || onClose) && (
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 'var(--space-2)',
						padding: 'var(--space-2-5, 10px) var(--space-3)',
						borderBottom: '1px solid var(--color-border)',
					}}
				>
					{headerAccessory}
					<div
						style={{
							flex: 1,
							minWidth: 0,
							fontFamily: 'var(--font-sans)',
							fontSize: 'var(--text-md)',
							fontWeight: 'var(--font-weight-semibold)',
							whiteSpace: 'nowrap',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
						}}
					>
						{title}
					</div>
					{onClose && (
						<button
							type="button"
							aria-label="Close"
							onClick={onClose}
							style={{
								display: 'inline-flex',
								alignItems: 'center',
								justifyContent: 'center',
								width: 28,
								height: 28,
								border: 'none',
								background: 'transparent',
								color: 'var(--color-text-tertiary)',
								borderRadius: 'var(--radius-sm)',
								cursor: 'pointer',
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.background = 'var(--color-interactive-hover)';
								e.currentTarget.style.color = 'var(--color-text-primary)';
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.background = 'transparent';
								e.currentTarget.style.color = 'var(--color-text-tertiary)';
							}}
						>
							<Icon name="close" size={16} />
						</button>
					)}
				</div>
			)}
			<div style={{ padding: 'var(--space-3)' }}>{children}</div>
			{footer && (
				<div
					style={{
						padding: 'var(--space-2-5, 10px) var(--space-3)',
						borderTop: '1px solid var(--color-border)',
						display: 'flex',
						alignItems: 'center',
						gap: 'var(--space-2)',
						flexWrap: 'wrap',
					}}
				>
					{footer}
				</div>
			)}
		</div>
	);
}
