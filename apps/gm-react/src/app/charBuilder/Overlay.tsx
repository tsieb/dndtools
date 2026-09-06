/**
 * CharBuilder shell — the full-screen overlay (Dialog a11y contract), the desktop step rail and
 * the discard confirm.
 *
 * Split out of the former single-file `app/CharBuilder.tsx` (RC-STB-2.4) — a pure move, no
 * behaviour change.
 */
import { useEffect, useRef } from 'react';
import { Button, Icon } from '../../ds';
import { T } from '../screen-kit';
import { registerBackHandler } from '../../platform/backNavigation';
import { useI18n, type MessageKey } from '../../i18n';

/* shared step-rail (mirrors onboarding) */
export function StepRail({
	steps,
	i,
}: {
	steps: readonly { id: string; title: MessageKey; icon: string }[];
	i: number;
}) {
	const { t } = useI18n();
	return (
		<div
			style={{
				width: 240,
				flex: '0 0 240px',
				background: `linear-gradient(180deg, ${T.accSub}, ${T.surf})`,
				borderRight: `1px solid ${T.bd}`,
				padding: '24px 20px',
				display: 'flex',
				flexDirection: 'column',
			}}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 24 }}>
				<span
					style={{
						width: 30,
						height: 30,
						borderRadius: 7,
						background: T.acc,
						color: T.accFg,
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'center',
					}}
				>
					<Icon name="new-character" size="sm" />
				</span>
				<div style={{ font: `700 14px ${T.disp}`, letterSpacing: '.01em' }}>
					{t('charBuilder.newCharacter')}
				</div>
			</div>
			<ol
				style={{
					display: 'flex',
					flexDirection: 'column',
					gap: 3,
					flex: 1,
					listStyle: 'none',
					margin: 0,
					padding: 0,
				}}
			>
				{steps.map((s, j) => {
					const done = j < i,
						on = j === i;
					return (
						<li
							key={s.id}
							aria-current={on ? 'step' : undefined}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 11,
								padding: '9px 10px',
								borderRadius: 9,
								background: on ? T.raised : 'transparent',
								border: `1px solid ${on ? T.accBd : 'transparent'}`,
							}}
						>
							<span
								style={{
									width: 26,
									height: 26,
									borderRadius: '50%',
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
							<span style={{ font: `${on ? 600 : 500} 13px ${T.sans}`, color: on ? T.ink : T.sub }}>
								{t(s.title)}
							</span>
						</li>
					);
				})}
			</ol>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 7,
					font: `11.5px ${T.sans}`,
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
		const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
		(first ?? panel)?.focus();
		const prevOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		const unregisterBack = registerBackHandler('fullscreen', () => {
			closeRef.current();
			return true;
		});
		const onKey = (e: KeyboardEvent) => {
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
					borderRadius: phone ? 0 : 18,
					boxShadow: 'var(--shadow-lg)',
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
	onKeep,
	onDiscard,
}: {
	onKeep: () => void;
	onDiscard: () => void;
}) {
	const { t } = useI18n();
	return (
		<div
			role="alertdialog"
			aria-label={t('charBuilder.discardTitle')}
			style={{
				position: 'absolute',
				inset: 0,
				zIndex: 5,
				background: 'var(--color-backdrop)',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				padding:
					'max(24px, var(--safe-area-top, 0px)) max(24px, var(--safe-area-right, 0px)) max(24px, var(--safe-area-bottom, 0px)) max(24px, var(--safe-area-left, 0px))',
			}}
		>
			<div
				style={{
					width: 400,
					maxWidth: '100%',
					background: T.raised,
					border: `1px solid ${T.bdS}`,
					borderRadius: 14,
					boxShadow: 'var(--shadow-lg)',
					padding: 20,
					display: 'flex',
					flexDirection: 'column',
					gap: 12,
				}}
			>
				<div style={{ font: `700 16px ${T.disp}` }}>{t('charBuilder.discardTitle')}</div>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					{t('charBuilder.discardBody')}
				</div>
				<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
					<Button variant="ghost" size="sm" autoFocus onClick={onKeep}>
						{t('charBuilder.keepEditing')}
					</Button>
					<Button variant="danger" size="sm" onClick={onDiscard}>
						{t('charBuilder.discardCharacter')}
					</Button>
				</div>
			</div>
		</div>
	);
}
