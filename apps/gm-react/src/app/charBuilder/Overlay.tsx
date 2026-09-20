/**
 * CharBuilder shell — the full-screen overlay (Dialog a11y contract), the desktop step rail and
 * the discard confirm.
 *
 * Split out of the former single-file `app/CharBuilder.tsx` (RC-STB-2.4) — a pure move, no
 * behaviour change.
 */
import { useEffect, useRef } from 'react';
import { Button, Dialog, Icon } from '../../ds';
import { T, srOnly } from '../screen-kit';
import { isolateModalSiblings } from '../../platform/modalIsolation';
import { registerBackHandler } from '../../platform/backNavigation';
import { useI18n, type MessageKey } from '../../i18n';

/* shared step-rail (mirrors onboarding) */
export function StepRail({
	steps,
	i,
	onJump,
}: {
	steps: readonly { id: string; title: MessageKey; icon: string }[];
	i: number;
	/** Revisit a completed step. Only steps before `i` are offered — later ones may still be gated. */
	onJump?: (index: number) => void;
}) {
	const { t } = useI18n();
	return (
		<div
			style={{
				width: 240,
				flex: '0 0 240px',
				background: `linear-gradient(180deg, ${T.accSub}, ${T.surf})`,
				borderRight: `1px solid ${T.bd}`,
				padding: 'var(--space-6) var(--space-5)',
				display: 'flex',
				flexDirection: 'column',
			}}
		>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 'var(--space-2)',
					marginBottom: 'var(--space-6)',
				}}
			>
				<span
					style={{
						width: 30,
						height: 30,
						borderRadius: 'var(--radius-md)',
						background: T.acc,
						color: T.accFg,
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'center',
					}}
				>
					<Icon name="new-character" size="sm" />
				</span>
				<div style={{ font: `700 var(--text-sm) ${T.sans}`, letterSpacing: '.01em' }}>
					{t('charBuilder.newCharacter')}
				</div>
			</div>
			{/* Was a bare <ol> of styled rows: the only step state a screen reader got was
			    aria-current on the active row (done vs not started was a check-icon colour), the
			    rail was no landmark, and a finished step could not be revisited from it. */}
			<nav aria-label={t('charBuilder.stepsLabel')} style={{ flex: 1 }}>
				<ol
					style={{
						display: 'flex',
						flexDirection: 'column',
						gap: 'var(--space-0-5)',
						listStyle: 'none',
						margin: 'var(--space-0)',
						padding: 'var(--space-0)',
					}}
				>
					{steps.map((s, j) => {
						const done = j < i,
							on = j === i;
						const state = t(
							done
								? 'charBuilder.stepDone'
								: on
									? 'charBuilder.stepCurrent'
									: 'charBuilder.stepTodo',
						);
						const row: React.CSSProperties = {
							display: 'flex',
							alignItems: 'center',
							gap: 'var(--space-3)',
							width: '100%',
							padding: 'var(--space-2) var(--space-2)',
							borderRadius: 'var(--radius-md)',
							background: on ? T.raised : 'transparent',
							border: `1px solid ${on ? T.accBd : 'transparent'}`,
						};
						const body = (
							<>
								<span
									style={{
										width: 26,
										height: 26,
										borderRadius: 'var(--radius-full)',
										flex: '0 0 auto',
										display: 'inline-flex',
										alignItems: 'center',
										justifyContent: 'center',
										background: done ? T.ok : on ? T.acc : T.alt,
										color: done || on ? T.accFg : T.ter,
									}}
								>
									{done ? <Icon name="check" size={13} /> : <Icon name={s.icon} size={14} />}
								</span>
								<span
									style={{
										font: `${on ? 600 : 500} var(--text-sm) ${T.sans}`,
										color: on ? T.ink : T.sub,
									}}
								>
									{t(s.title)}
								</span>
								<span style={srOnly}>{`, ${state}`}</span>
							</>
						);
						return (
							<li key={s.id} aria-current={on ? 'step' : undefined}>
								{done && onJump ? (
									// Named explicitly: name-from-content put a space before the visually
									// hidden state ("Identity , completed").
									<button
										type="button"
										aria-label={`${t(s.title)}, ${state}`}
										onClick={() => onJump(j)}
										title={t('charBuilder.goBackTo', { step: t(s.title) })}
										onMouseEnter={(event) => {
											event.currentTarget.style.background = 'var(--color-interactive-hover)';
										}}
										onMouseLeave={(event) => {
											event.currentTarget.style.background = 'transparent';
										}}
										style={{
											...row,
											cursor: 'pointer',
											textAlign: 'left',
											font: 'inherit',
											color: 'inherit',
										}}
									>
										{body}
									</button>
								) : (
									<div style={row}>{body}</div>
								)}
							</li>
						);
					})}
				</ol>
			</nav>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 'var(--space-1-5)',
					font: `var(--text-xs) ${T.sans}`,
					color: T.ter,
				}}
			>
				<Icon name="dm-only" size={13} /> {t('charBuilder.savedLocally')}
			</div>
		</div>
	);
}

const FOCUSABLE =
	'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The fixed full-screen scrim + panel, with the Dialog a11y contract (Escape, focus trap, restore). */
export function Overlay({
	children,
	onClose,
	wide,
	label,
	phone = false,
}: {
	children: React.ReactNode;
	onClose: () => void;
	wide?: boolean;
	label: string;
	/** Phone variants own their responsive content layout; the shell removes desktop-only gutters. */
	phone?: boolean;
}) {
	const panelRef = useRef<HTMLDivElement>(null);
	const closeRef = useRef(onClose);
	closeRef.current = onClose;

	useEffect(() => {
		const previous = document.activeElement as HTMLElement | null;
		const panel = panelRef.current;
		const restoreIsolation = panel ? isolateModalSiblings(panel) : () => {};
		const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
		(first ?? panel)?.focus();
		const prevOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		const unregisterBack = registerBackHandler('fullscreen', () => {
			closeRef.current();
			return true;
		});
		const onKey = (e: KeyboardEvent) => {
			if (panelRef.current?.querySelector('[role=alertdialog]')) return;
			if (e.key === 'Escape') {
				e.stopPropagation();
				closeRef.current();
				return;
			}
			if (e.key !== 'Tab') return;
			const p = panelRef.current;
			if (!p) return;
			const nodes = Array.from(p.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
				(n) => n.offsetParent !== null,
			);
			if (nodes.length === 0) {
				e.preventDefault();
				p.focus();
				return;
			}
			const firstNode = nodes[0];
			const lastNode = nodes[nodes.length - 1];
			if (e.shiftKey && document.activeElement === firstNode) {
				e.preventDefault();
				lastNode.focus();
			} else if (!e.shiftKey && document.activeElement === lastNode) {
				e.preventDefault();
				firstNode.focus();
			}
		};
		document.addEventListener('keydown', onKey, true);
		return () => {
			document.removeEventListener('keydown', onKey, true);
			unregisterBack();
			restoreIsolation();
			document.body.style.overflow = prevOverflow;
			previous?.focus?.();
		};
	}, []);

	return (
		<div
			className="app-fixed-viewport"
			data-fullscreen-overlay="character-builder"
			onMouseDown={() => closeRef.current()}
			style={{
				position: 'fixed',
				inset: 0,
				zIndex: 420,
				background: 'var(--color-backdrop)',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				padding: phone
					? 'var(--safe-area-top, 0px) var(--safe-area-right, 0px) var(--safe-area-bottom, 0px) var(--safe-area-left, 0px)'
					: 'max(24px, var(--safe-area-top, 0px)) max(24px, var(--safe-area-right, 0px)) max(24px, var(--safe-area-bottom, 0px)) max(24px, var(--safe-area-left, 0px))',
			}}
		>
			<div
				ref={panelRef}
				role="dialog"
				aria-modal="true"
				aria-label={label}
				tabIndex={-1}
				onMouseDown={(e) => e.stopPropagation()}
				style={{
					width: wide ? 1000 : 760,
					['--density-button-height' as string]: 'var(--space-12)',
					['--density-touch-target' as string]: 'var(--space-12)',
					maxWidth: '100%',
					// Every other property here already goes full-bleed on a phone (no scrim padding
					// above, square corners below) — the fixed 620px did not, so on a 851px-tall device
					// the wizard floated as a slab with ~115px of backdrop top and bottom while its own
					// content scrolled inside the shortfall.
					height: phone ? '100%' : 620,
					maxHeight: '100%',
					display: 'flex',
					background: T.raised,
					border: `1px solid ${T.bdS}`,
					borderRadius: phone ? 'var(--radius-none)' : 'var(--radius-xl)',
					boxShadow: 'var(--shadow-md)',
					overflow: 'hidden',
				}}
			>
				{children}
			</div>
		</div>
	);
}

/** Discard confirm — shown when a dismiss (backdrop / Escape / Cancel) would lose a dirty wizard.
 *  Rendered INSIDE the Overlay panel so its existing focus trap covers it. */
export function DiscardConfirm({
	name,
	onKeep,
	onDiscard,
}: {
	name: string;
	onKeep: () => void;
	onDiscard: () => void;
}) {
	const { t } = useI18n();
	return (
		<Dialog
			open
			role="alertdialog"
			title={t('charBuilder.discardTitle')}
			description={t('charBuilder.discardBody', {
				name: name.trim() || t('charBuilder.newCharacter'),
			})}
			tone="danger"
			size="sm"
			onClose={onKeep}
			initialFocus="[data-keep-editing]"
			footer={
				<>
					<Button data-keep-editing variant="ghost" onClick={onKeep}>
						{t('charBuilder.keepEditing')}
					</Button>
					<Button variant="danger" onClick={onDiscard}>
						{t('charBuilder.discardCharacter')}
					</Button>
				</>
			}
		/>
	);
}
