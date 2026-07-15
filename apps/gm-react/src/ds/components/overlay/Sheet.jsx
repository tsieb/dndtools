import React from 'react';
import { Icon } from '../core/Icon.jsx';

/**
 * Sheet — the touch-first overlay the system delegates to alongside Dialog ("…or sheet (mobile)").
 * A scrim plus a panel anchored to an edge: `bottom` (the mobile default — a grab-handle slab that
 * rises from the foot), or `right`/`left` (a side drawer for tablet/desktop secondary flows like
 * filters, an inspector, or an import wizard).
 *
 * Same safety + a11y contract as Dialog: role=dialog, aria-modal, focus sent in and trapped,
 * Escape / backdrop dismiss (unless `dismissible={false}`), body scroll locked, focus restored on
 * close. Corners use `--radius-xl` (the sheet radius) on the exposed edges only. Renders inline
 * (fixed, token z-index) — no portal.
 */
const FOCUSABLE =
	'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const SIDE_SIZE = { bottom: '88vh', side: 440 };

export function Sheet({
	open = false,
	onClose,
	side = 'bottom',
	title,
	description,
	size,
	dismissible = true,
	footer,
	children,
	style,
	...rest
}) {
	const panelRef = React.useRef(null);
	const returnFocusRef = React.useRef(null);
	const onCloseRef = React.useRef(onClose);
	const dismissibleRef = React.useRef(dismissible);
	const titleId = React.useId();
	const descId = React.useId();
	onCloseRef.current = onClose;
	dismissibleRef.current = dismissible;

	React.useEffect(() => {
		if (!open) return undefined;
		returnFocusRef.current = document.activeElement;
		const prevOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		const t = setTimeout(() => {
			const panel = panelRef.current;
			if (!panel) return;
			const f = panel.querySelector(FOCUSABLE);
			(f || panel).focus();
		}, 0);
		const onKey = (e) => {
			if (e.key === 'Escape' && dismissibleRef.current) {
				e.stopPropagation();
				onCloseRef.current && onCloseRef.current();
				return;
			}
			if (e.key !== 'Tab') return;
			const panel = panelRef.current;
			if (!panel) return;
			const nodes = Array.from(panel.querySelectorAll(FOCUSABLE)).filter(
				(n) => n.offsetParent !== null || n === panel,
			);
			if (nodes.length === 0) {
				e.preventDefault();
				panel.focus();
				return;
			}
			const first = nodes[0];
			const last = nodes[nodes.length - 1];
			if (e.shiftKey && document.activeElement === first) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && document.activeElement === last) {
				e.preventDefault();
				first.focus();
			}
		};
		document.addEventListener('keydown', onKey, true);
		return () => {
			clearTimeout(t);
			document.removeEventListener('keydown', onKey, true);
			document.body.style.overflow = prevOverflow;
			const rf = returnFocusRef.current;
			if (rf && rf.focus) rf.focus();
		};
	}, [open]);

	if (!open) return null;

	const isBottom = side === 'bottom';
	const sideWidth = size || SIDE_SIZE.side;
	const bottomHeight = size || SIDE_SIZE.bottom;

	const align = {
		bottom: { alignItems: 'flex-end', justifyContent: 'stretch' },
		right: { alignItems: 'stretch', justifyContent: 'flex-end' },
		left: { alignItems: 'stretch', justifyContent: 'flex-start' },
	}[side] || { alignItems: 'flex-end' };

	const panelShape = isBottom
		? {
				width: '100%',
				maxHeight: bottomHeight,
				borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0',
				borderBottom: 'none',
				animation: 'dndSheetUp var(--duration-standard) var(--easing-decelerate)',
			}
		: side === 'right'
			? {
					width: sideWidth,
					maxWidth: '100%',
					height: '100%',
					borderRadius: 'var(--radius-xl) 0 0 var(--radius-xl)',
					borderRight: 'none',
					animation: 'dndSheetRight var(--duration-standard) var(--easing-decelerate)',
				}
			: {
					width: sideWidth,
					maxWidth: '100%',
					height: '100%',
					borderRadius: '0 var(--radius-xl) var(--radius-xl) 0',
					borderLeft: 'none',
					animation: 'dndSheetLeft var(--duration-standard) var(--easing-decelerate)',
				};

	return (
		<div
			className="app-fixed-viewport"
			style={{
				position: 'fixed',
				inset: 0,
				zIndex: 'var(--z-sheet)',
				display: 'flex',
				...align,
				background: 'var(--color-backdrop)',
				animation: 'dndScrimIn var(--duration-fast) var(--easing-standard)',
			}}
			onMouseDown={(e) => {
				if (dismissible && e.target === e.currentTarget) onClose && onClose();
			}}
		>
			<style>
				{
					'@keyframes dndScrimIn{from{opacity:0}to{opacity:1}}@keyframes dndSheetUp{from{transform:translateY(100%)}to{transform:none}}@keyframes dndSheetRight{from{transform:translateX(100%)}to{transform:none}}@keyframes dndSheetLeft{from{transform:translateX(-100%)}to{transform:none}}'
				}
			</style>
			<div
				ref={panelRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby={title ? titleId : undefined}
				aria-describedby={description ? descId : undefined}
				tabIndex={-1}
				style={{
					display: 'flex',
					flexDirection: 'column',
					background: 'var(--color-surface-raised)',
					border: '1px solid var(--color-border-strong)',
					boxShadow: 'var(--shadow-lg)',
					color: 'var(--color-text-primary)',
					outline: 'none',
					overflow: 'hidden',
					...panelShape,
					...style,
				}}
				{...rest}
			>
				{isBottom && (
					<div
						aria-hidden="true"
						style={{
							display: 'flex',
							justifyContent: 'center',
							paddingTop: 'var(--space-2)',
							flex: '0 0 auto',
						}}
					>
						<span
							style={{
								width: 36,
								height: 4,
								borderRadius: 'var(--radius-full)',
								background: 'var(--color-border-strong)',
							}}
						/>
					</div>
				)}
				{(title || dismissible) && (
					<div
						style={{
							display: 'flex',
							alignItems: 'flex-start',
							gap: 'var(--space-3)',
							padding: isBottom ? 'var(--space-3) var(--space-5) var(--space-4)' : 'var(--space-5)',
							borderBottom: '1px solid var(--color-border)',
						}}
					>
						<div
							style={{
								flex: 1,
								minWidth: 0,
								display: 'flex',
								flexDirection: 'column',
								gap: 'var(--space-1)',
							}}
						>
							{title && (
								<h2
									id={titleId}
									style={{
										margin: 0,
										fontFamily: 'var(--font-sans)',
										fontSize: 'var(--text-lg)',
										fontWeight: 'var(--font-weight-semibold)',
										lineHeight: 1.25,
									}}
								>
									{title}
								</h2>
							)}
							{description && (
								<p
									id={descId}
									style={{
										margin: 0,
										fontFamily: 'var(--font-sans)',
										fontSize: 'var(--text-sm)',
										lineHeight: 1.5,
										color: 'var(--color-text-secondary)',
									}}
								>
									{description}
								</p>
							)}
						</div>
						{dismissible && (
							<button
								type="button"
								aria-label="Close"
								onClick={() => onClose && onClose()}
								style={{
									display: 'inline-flex',
									alignItems: 'center',
									justifyContent: 'center',
									width: 30,
									height: 30,
									flex: '0 0 auto',
									border: 'none',
									background: 'transparent',
									color: 'var(--color-text-tertiary)',
									borderRadius: 'var(--radius-sm)',
									cursor: 'pointer',
									transition:
										'background var(--duration-fast) var(--easing-standard), color var(--duration-fast) var(--easing-standard)',
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
								<Icon name="close" size="sm" />
							</button>
						)}
					</div>
				)}
				<div style={{ padding: 'var(--space-5)', overflowY: 'auto', flex: '1 1 auto' }}>
					{children}
				</div>
				{footer && (
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: isBottom ? 'stretch' : 'flex-end',
							gap: 'var(--space-2)',
							flexWrap: 'wrap',
							padding: 'var(--space-3) var(--space-5)',
							borderTop: '1px solid var(--color-border)',
							background: 'var(--color-surface)',
						}}
					>
						{footer}
					</div>
				)}
			</div>
		</div>
	);
}
