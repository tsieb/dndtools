import React from 'react';
import { Icon } from './Icon.jsx';
import { registerBackHandler } from '../../../platform/backNavigation';
import { ownsEscape, popEscapeLayer, pushEscapeLayer } from '../../../platform/escapeLayers';

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
/**
 * How far the panel has to slide horizontally to stay on screen, given its NATURAL (unshifted)
 * rect. Exported because the geometry cannot be exercised in jsdom, where every rect is zero.
 *
 * The popover is anchored with `left: anchor.x` + `translateX(-50%)` and is 320px wide, so a POI in
 * the outer ~40% of a 393px handset canvas rendered half off-viewport — taking the whole POIPopover
 * footer (Focus on map / Edit / Copy link / Delete) out of reach with no way to bring it back.
 */
export function popoverShiftX(rect, viewportWidth, margin = 8) {
	if (!rect || !(rect.width > 0) || !(viewportWidth > 0)) return 0;
	// Wider than the viewport: pin the left edge rather than oscillating between the two overflows.
	if (rect.width + margin * 2 >= viewportWidth) return margin - rect.left;
	if (rect.right > viewportWidth - margin) return viewportWidth - margin - rect.right;
	if (rect.left < margin) return margin - rect.left;
	return 0;
}

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
	const bodyRef = React.useRef(null);
	// The opener. Escape, an outside pointerdown and a plain unmount all used to leave focus on the
	// detached panel — i.e. on <body> — so a keyboard user who dismissed a map-editor popover lost
	// their place entirely. `Dialog.jsx` has carried this contract all along; this is the same shape.
	const returnFocusRef = React.useRef(null);
	const onCloseRef = React.useRef(onClose);
	onCloseRef.current = onClose;

	React.useEffect(() => {
		if (!open) return;
		const onDown = (e) => {
			if (ref.current && !ref.current.contains(e.target)) onCloseRef.current?.();
		};
		const escapeToken = pushEscapeLayer(() => ref.current);
		const onKey = (e) => {
			// Capture + stopPropagation, matching Dialog/Sheet. Without it the same Escape that
			// dismisses this popover also reaches surface-level keymaps underneath — closing a map
			// tool menu used to exit the whole map editor.
			// `ownsEscape` separates the overlays from EACH OTHER: stopPropagation does nothing between
			// listeners on `document`, so without it a popover nested in a sheet closed both.
			if (e.key === 'Escape' && ownsEscape(escapeToken)) {
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
		returnFocusRef.current =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const t = setTimeout(() => {
			// Excludes disabled controls and tabindex="-1", exactly as Dialog/Sheet's FOCUSABLE does.
			// The old permissive selector matched the layer menu's `disabled` "Move up" on the top
			// layer, and `.focus()` on a disabled button silently no-ops — so focus never entered the
			// popover at all and the next Tab walked into the page behind it.
			const SELECTOR =
				'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
			// Search the BODY first. The header (which holds Close) is rendered before `children`, so a
			// DOM-order query meant every popover given `onClose` opened with focus parked on Close —
			// one Tab away from leaving, and never on the control the popover exists to offer.
			const f =
				(bodyRef.current && bodyRef.current.querySelector(SELECTOR)) ||
				(ref.current && ref.current.querySelector(SELECTOR));
			if (f) f.focus();
		}, 0);
		return () => {
			document.removeEventListener('pointerdown', onDown, true);
			document.removeEventListener('keydown', onKey, true);
			popEscapeLayer(escapeToken);
			unregisterBack();
			clearTimeout(t);
			const back = returnFocusRef.current;
			returnFocusRef.current = null;
			// Only reclaim focus if closing actually dropped it: a caller that deliberately moved focus
			// somewhere else on close must keep it.
			const active = document.activeElement;
			const stranded = !active || active === document.body || !document.contains(active);
			if (back && stranded && document.contains(back)) back.focus();
		};
	}, [open]);

	// Keep the panel inside the viewport. Measured after every render and self-stabilising: once the
	// correction is applied the natural rect recomputes to the same value, so it settles in one pass.
	const [shiftX, setShiftX] = React.useState(0);
	const shiftRef = React.useRef(0);
	React.useLayoutEffect(() => {
		if (!open || !anchor || !ref.current) {
			shiftRef.current = 0;
			return;
		}
		const r = ref.current.getBoundingClientRect();
		const applied = shiftRef.current;
		const natural = { left: r.left - applied, right: r.right - applied, width: r.width };
		const next = popoverShiftX(natural, document.documentElement.clientWidth);
		if (Math.abs(next - applied) > 0.5) {
			shiftRef.current = next;
			setShiftX(next);
		}
	});

	if (!open) return null;

	const positioned = anchor
		? {
				position: 'absolute',
				left: anchor.x,
				top: anchor.y,
				marginLeft: shiftX,
				transform:
					placement === 'top'
						? 'translate(-50%, calc(-100% - 12px))'
						: placement === 'bottom'
							? 'translate(-50%, 12px)'
							: 'translate(-50%, -50%)',
				zIndex: 'var(--z-overlay)',
			}
		: // Fail SAFE, not invisible. Without `anchor` the caller positions the popover itself, and
			// forgetting a zIndex used to paint it UNDER later siblings (LayerRow's opacity slider was
			// unclickable that way). A caller-supplied `style.zIndex` still wins — it is spread after.
			{ zIndex: 'var(--z-overlay)' };

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
			<div ref={bodyRef} style={{ padding: 'var(--space-3)' }}>
				{children}
			</div>
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
