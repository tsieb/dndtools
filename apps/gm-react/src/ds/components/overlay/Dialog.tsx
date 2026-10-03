import { dsCopy } from '../../copy';

/**
 * Dialog — modal chrome (scrim + one centered panel) for confirms and short forms. role=dialog,
 * aria-modal, focus-trapped, Escape/backdrop dismiss (off for destructive confirms), body-scroll
 * lock, focus restored on close. This is the chrome the system delegates to ("drop it inside a
 * Dialog"); supply the body. `tone="danger"` marks destructive confirms (icon shape carries
 * severity without colour).
 */
export interface DialogProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
	backdropDismissible?: boolean;
	initialFocus?: string;
	open?: boolean;
	onClose?: () => void;
	title?: React.ReactNode;
	/** One-line supporting text under the title; wired to aria-describedby. */
	description?: React.ReactNode;
	/** Header mark + primary affordance accent for confirms. Each tone has a distinct icon shape. */
	tone?: 'default' | 'danger' | 'warning' | 'success' | 'info';
	/** Override the header icon (semantic Icon name). Defaults to the tone's status shape. */
	icon?: string;
	/** Panel width: sm 400 · md 540 · lg 760. */
	size?: 'sm' | 'md' | 'lg';
	/** When false, Escape, backdrop click, and the close button are all suppressed (forced choice). */
	dismissible?: boolean;
	/** Right-aligned action row (typically Cancel + a primary/danger Button). */
	footer?: React.ReactNode;
	children?: React.ReactNode;
}

import React from 'react';
import { createPortal } from 'react-dom';
import { ownsFocusTrap, popTrapLayer, pushTrapLayer, tabbableElements } from './focus';
import { Icon } from '../core/Icon';
import { registerBackHandler } from '../../../platform/backNavigation';
import { ownsEscape, popEscapeLayer, pushEscapeLayer } from '../../../platform/escapeLayers';
import { restoreReturnFocus } from '../../../platform/returnFocus';

/**
 * `platform/modalIsolation` for a scrim portaled to body. Walking UP from the panel reaches only
 * body's children, so the whole app root went inert — and with it the toast viewport inside it,
 * which opts out with `data-modal-exempt` precisely so a refusal raised from a dialog stays
 * readable and its Dismiss reachable. Walk DOWN from body instead: inert every branch holding
 * neither the scrim nor an exempt surface, and descend into the ones that do. Prior state is
 * restored exactly, so nested overlays compose as they did before.
 *
 * Every open scrim is itself `data-modal-exempt`: an enclosing Sheet or Dialog mounted in the same
 * commit isolates AFTER this one (React runs parent effects last), and would otherwise inert the
 * nested dialog it just opened. Here, though, another dialog's scrim is kept only when that dialog
 * is nested inside this one (its anchor sits in this scrim) — an unrelated dialog underneath is
 * isolated like any other branch.
 */
function isolateOutside(scrim: HTMLElement): () => void {
	const keep = [scrim];
	const exempt = Array.from(document.querySelectorAll<HTMLElement>('[data-modal-exempt]'));
	keep.push(...exempt.filter((el) => !el.hasAttribute('data-dialog-scrim')));
	const scrims = exempt.filter((el) => el.hasAttribute('data-dialog-scrim') && el !== scrim);
	for (let grew = true; grew; ) {
		grew = false;
		for (const other of scrims) {
			if (keep.includes(other)) continue;
			const id = other.getAttribute('data-dialog-scrim');
			const anchor = document.querySelector(`[data-dialog-anchor="${id}"]`);
			if (anchor && keep.some((kept) => kept.contains(anchor))) {
				keep.push(other);
				grew = true;
			}
		}
	}
	const snapshots: { element: HTMLElement; ariaHidden: string | null; hadInert: boolean }[] = [];
	const visit = (parent: Element) => {
		for (const child of Array.from(parent.children)) {
			if (!(child instanceof HTMLElement) || keep.includes(child)) continue;
			if (keep.some((kept) => child.contains(kept))) {
				visit(child);
				continue;
			}
			snapshots.push({
				element: child,
				ariaHidden: child.getAttribute('aria-hidden'),
				hadInert: child.hasAttribute('inert'),
			});
			child.setAttribute('aria-hidden', 'true');
			child.setAttribute('inert', '');
		}
	};
	visit(document.body);
	return () => {
		for (const snapshot of snapshots.reverse()) {
			if (snapshot.ariaHidden === null) snapshot.element.removeAttribute('aria-hidden');
			else snapshot.element.setAttribute('aria-hidden', snapshot.ariaHidden);
			if (!snapshot.hadInert) snapshot.element.removeAttribute('inert');
		}
	};
}

/**
 * Dialog — the modal chrome the system has long delegated to ("drop it inside a Dialog (desktop)…"
 * — MapCreationForm, ImportWizard). A scrim over the page plus one centered panel: title,
 * optional description, a body (a form), and a footer action row. This is the chrome; the body
 * is yours.
 *
 * Safety + a11y contract:
 *  - role=dialog, aria-modal, labelled by the title and described by the description.
 *  - Focus is sent in on open and TRAPPED (Tab wraps); Escape and backdrop click close it unless
 *    `dismissible={false}` — used for destructive confirms the DM must answer deliberately.
 *  - `backdropDismissible={false}` disables ONLY the stray outside click, keeping Escape and the
 *    header Close. For a dialog holding composed work (EncounterBuilder's roster), a mis-aimed click
 *    on the scrim discarding it is data loss; Escape and Close are deliberate acts, so they stay.
 *  - Body scroll locks while open. Closing restores focus to the element that opened it.
 *  - The panel never grows past the viewport, and on a short one (a landscape phone, a software
 *    keyboard) the header and the body are what give way — the footer keeps its height, so the
 *    answers to a confirmation are always on screen (UX-002, NAVIGATION.md §8).
 *  - `tone="danger"` colours the header mark + primary affordance for destructive confirms; the
 *    distinct status-icon shape carries severity without relying on colour (A11Y-011).
 *
 * Portals the scrim to body so transformed or filtered launchers cannot become its containing
 * block and collapse the panel to the dimensions of the launcher. A hidden anchor stays where the
 * Dialog sits in the tree so DOM-containment nesting (escape and trap layers) still sees it.
 */
const SIZES = { sm: 400, md: 540, lg: 760 };
const TONE_ICON = {
	default: null,
	danger: 'error',
	warning: 'warning',
	success: 'success',
	info: 'info',
};
const TONE_COLOR: Record<string, string> = {
	danger: 'var(--color-status-error)',
	warning: 'var(--color-status-warning)',
	success: 'var(--color-status-success)',
	info: 'var(--color-status-info)',
};

export function Dialog({
	open = false,
	onClose,
	title,
	description,
	tone = 'default',
	icon,
	size = 'md',
	dismissible = true,
	backdropDismissible,
	initialFocus,
	footer,
	children,
	style,
	...rest
}: DialogProps) {
	const panelRef = React.useRef<HTMLDivElement | null>(null);
	const anchorRef = React.useRef<HTMLSpanElement | null>(null);
	const bodyRef = React.useRef<HTMLDivElement | null>(null);
	const returnFocusRef = React.useRef<HTMLElement | null>(null);
	const onCloseRef = React.useRef(onClose);
	const dismissibleRef = React.useRef(dismissible);
	const initialFocusRef = React.useRef(initialFocus);
	const titleId = React.useId();
	const anchorId = React.useId();
	const descId = React.useId();
	onCloseRef.current = onClose;
	dismissibleRef.current = dismissible;
	initialFocusRef.current = initialFocus;

	React.useEffect(() => {
		if (!open) return undefined;
		returnFocusRef.current = document.activeElement as HTMLElement | null;
		const prevOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		const scrim = panelRef.current?.parentElement;
		const restoreIsolation = scrim ? isolateOutside(scrim) : () => {};

		const focusFirst = () => {
			const panel = panelRef.current;
			// A Dialog/Sheet nested inside this one owns entry focus; it will place it itself.
			if (!panel || !ownsFocusTrap(trapToken)) return;
			// A non-trapping surface mounted in the same commit (a Popover/menu) may already have sent
			// focus somewhere inside this panel. Don't yank it back to the first field — but if it put
			// focus nowhere (a flyout with no focusable control), still run our own entry below.
			const already = document.activeElement;
			if (already && already !== panel && panel.contains(already)) return;
			let preferred: (HTMLElement & { disabled?: boolean }) | null = null;
			if (initialFocusRef.current) {
				try {
					preferred = panel.querySelector<HTMLElement>(initialFocusRef.current);
				} catch {
					// A bad selector is a developer mistake; retain the safe default focus path.
				}
			}
			// Query the BODY before the panel. The header (which owns Close) renders before
			// `children`, so a plain DOM-order `querySelector(FOCUSABLE)` opened ~33 of the app's 37
			// dialogs focused on Close — i.e. one Enter away from dismissing the very thing you just
			// opened, and never on the field the dialog exists to collect. Same defect, and the same
			// fix, as ds/components/overlay/Sheet.tsx and ds/components/core/Popover.tsx.
			const body = bodyRef.current;
			const f =
				preferred && !preferred.disabled
					? preferred
					: (body && tabbableElements(body)[0]) || tabbableElements(panel)[0];
			(f || panel).focus();
		};
		const t = setTimeout(focusFirst, 0);

		// Escape and Tab ownership are decided by DOM containment (platform/escapeLayers, ./focus), and
		// the panel no longer sits inside whatever opened it. So register twice: the in-place anchor
		// lets a Sheet/Popover/Dialog that contains this one stand down, and the panel tokens are the
		// ones this dialog checks for overlays nested inside IT.
		const anchorEscapeToken = pushEscapeLayer(() => anchorRef.current);
		const anchorTrapToken = pushTrapLayer(() => anchorRef.current);
		const escapeToken = pushEscapeLayer(() => panelRef.current);
		const trapToken = pushTrapLayer(() => panelRef.current);
		const onKey = (e: KeyboardEvent) => {
			// A Popover/Sheet opened from inside this dialog owns Escape while it is up:
			// `stopPropagation` does nothing between listeners on `document`, so without this check the
			// inner surface and the dialog both closed.
			if (e.key === 'Escape' && dismissibleRef.current && ownsEscape(escapeToken)) {
				e.stopPropagation();
				onCloseRef.current?.();
				return;
			}
			// Tab is gated on TRAP ownership, not escape ownership: a Popover/menu opened inside this
			// dialog owns Escape but traps nothing, so standing down for it let Tab leave the modal.
			if (e.key !== 'Tab' || !ownsFocusTrap(trapToken)) return;
			const panel = panelRef.current;
			if (!panel) return;
			const nodes = tabbableElements(panel);
			if (nodes.length === 0) {
				e.preventDefault();
				panel.focus();
				return;
			}
			const first = nodes[0];
			const last = nodes[nodes.length - 1];
			const active = document.activeElement;
			// Anything focused INSIDE the panel but absent from `nodes` — the panel's own tabindex=-1
			// rows, an <iframe>, a media element with controls — is still inside the trap, so let the
			// browser move on from it. Only wrap when focus is genuinely outside (or on the panel).
			const outside = !active || active === panel || !panel.contains(active);
			if (e.shiftKey && (active === first || outside)) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && (active === last || outside)) {
				e.preventDefault();
				first.focus();
			}
		};
		document.addEventListener('keydown', onKey, true);
		// When Android's software keyboard reduces the visual viewport, ensure the focused
		// field is brought into the dialog's bounded scroll region rather than hidden below
		// a sticky footer or the keyboard. `nearest` avoids disorienting jumps for keyboard users.
		const onFocusIn = (event: FocusEvent) => {
			if (
				event.target instanceof HTMLElement &&
				panelRef.current?.contains(event.target as Node) &&
				typeof event.target.scrollIntoView === 'function'
			) {
				event.target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
			}
		};
		panelRef.current?.addEventListener('focusin', onFocusIn);
		const unregisterBack = registerBackHandler('overlay', () => {
			if (dismissibleRef.current) onCloseRef.current?.();
			return true;
		});
		return () => {
			clearTimeout(t);
			document.removeEventListener('keydown', onKey, true);
			popEscapeLayer(escapeToken);
			popTrapLayer(trapToken);
			popEscapeLayer(anchorEscapeToken);
			popTrapLayer(anchorTrapToken);
			panelRef.current?.removeEventListener('focusin', onFocusIn);
			unregisterBack();
			document.body.style.overflow = prevOverflow;
			restoreIsolation();
			// Not an unconditional `rf.focus()`: a confirmed action routinely REMOVES its own opener,
			// and focusing a detached node silently drops focus to <body>. See platform/returnFocus.
			restoreReturnFocus(returnFocusRef.current);
			returnFocusRef.current = null;
		};
	}, [open]);

	if (!open) return null;

	const width = SIZES[size] || SIZES.md;
	const accent = TONE_COLOR[tone];
	const markName = icon || TONE_ICON[tone];

	const scrim = createPortal(
		<div
			className="app-fixed-viewport"
			data-dialog-scrim={anchorId}
			data-modal-exempt=""
			style={{
				position: 'fixed',
				inset: 0,
				zIndex: 'var(--z-modal)',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				padding:
					'max(var(--space-6), var(--safe-area-top, 0px)) max(var(--space-6), var(--safe-area-right, 0px)) max(var(--space-6), var(--safe-area-bottom, 0px)) max(var(--space-6), var(--safe-area-left, 0px))',
				background: 'var(--color-backdrop)',
				animation: 'dndScrimIn var(--duration-fast) var(--easing-standard)',
			}}
			onMouseDown={(e) => {
				// Defaults to `dismissible`, so every existing call site keeps its current behaviour.
				const byBackdrop = backdropDismissible === undefined ? dismissible : backdropDismissible;
				if (byBackdrop && e.target === e.currentTarget) onClose?.();
			}}
		>
			<style>
				{
					'@keyframes dndScrimIn{from{opacity:0}to{opacity:1}}@keyframes dndDialogIn{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}'
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
					width,
					maxWidth: '100%',
					maxHeight: '100%',
					minHeight: 0,
					display: 'flex',
					flexDirection: 'column',
					background: 'var(--color-surface-raised)',
					border: '1px solid var(--color-border-strong)',
					borderRadius: 'var(--radius-lg)',
					boxShadow: 'var(--shadow-lg)',
					color: 'var(--color-text-primary)',
					outline: 'none',
					overflow: 'hidden',
					animation: 'dndDialogIn var(--duration-standard) var(--easing-decelerate)',
					...style,
				}}
				{...rest}
			>
				{(title || dismissible) && (
					<div
						style={{
							display: 'flex',
							alignItems: 'flex-start',
							gap: 'var(--space-3)',
							padding: 'var(--space-4) var(--space-5)',
							borderBottom: '1px solid var(--color-border)',
							// A column flex item's `min-height` is `auto`, so this header could not shrink
							// below its own content and a long `description` simply pushed the footer out of
							// the (overflow: hidden) panel — on a landscape phone or with a software keyboard
							// up, a destructive confirm rendered with neither answer on screen (RC-UX-4.2).
							// It yields height like any other row now and scrolls what does not fit; the title
							// stays at the top of that scroll, and the footer below is never the part that
							// goes.
							flex: '0 1 auto',
							minHeight: 0,
							overflowY: 'auto',
							overscrollBehavior: 'contain',
						}}
					>
						{markName && (
							<span
								style={{
									display: 'inline-flex',
									alignItems: 'center',
									justifyContent: 'center',
									width: 32,
									height: 32,
									flex: '0 0 auto',
									borderRadius: 'var(--radius-md)',
									background: accent
										? `color-mix(in srgb, ${accent} 14%, transparent)`
										: 'var(--color-accent-subtle)',
									color: accent || 'var(--color-accent)',
								}}
							>
								<Icon name={markName} size="sm" />
							</span>
						)}
						<div
							style={{
								flex: 1,
								minWidth: 0,
								display: 'flex',
								flexDirection: 'column',
								gap: 'var(--space-1)',
								paddingTop: markName ? 'var(--space-1)' : 0,
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
										color: 'var(--color-text-primary)',
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
								aria-label={dsCopy['ds.dialog.close']}
								onClick={() => onClose?.()}
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
				<div
					ref={bodyRef}
					style={{
						padding: 'var(--space-5)',
						overflowY: 'auto',
						overflowX: 'hidden',
						overscrollBehavior: 'contain',
						WebkitOverflowScrolling: 'touch',
						flex: '1 1 auto',
						minHeight: 0,
					}}
				>
					{children}
				</div>
				{footer && (
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'flex-end',
							gap: 'var(--space-2)',
							flexWrap: 'wrap',
							padding:
								'var(--space-3) var(--space-5) calc(var(--space-3) + var(--safe-area-bottom, 0px))',
							borderTop: '1px solid var(--color-border)',
							background: 'var(--color-surface)',
							// The answers are the one part of a dialog that must survive a short viewport: the
							// header scrolls and the body scrolls, but this row keeps every pixel it asked for.
							flex: '0 0 auto',
						}}
					>
						{footer}
					</div>
				)}
			</div>
		</div>,
		document.body,
	);
	return (
		<>
			<span ref={anchorRef} hidden data-dialog-anchor={anchorId} />
			{scrim}
		</>
	);
}
