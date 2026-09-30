import { registerBackHandler } from '../../platform/backNavigation';
import { restoreReturnFocus } from '../../platform/returnFocus';
import { useCallback, useEffect, useRef } from 'react';
import { Button, Dialog, Icon } from '../../ds';
import { useI18n, type MessageKey } from '../../i18n';

/** Keep lazy shell dialogs visible and dismissible while their chunks arrive. */
export function ShellLoading({
	onClose,
	titleKey = 'vaults.title',
	messageKey = 'vaults.loading',
	icon = 'campaign-scroll',
	modal = true,
}: {
	onClose: () => void;
	titleKey?: MessageKey;
	messageKey?: MessageKey;
	icon?: string;
	modal?: boolean;
}) {
	const { t } = useI18n();
	const launcher = useRef(document.activeElement as HTMLElement | null);
	const dismiss = useCallback(() => {
		onClose();
		requestAnimationFrame(() => restoreReturnFocus(launcher.current));
	}, [onClose]);
	useEffect(() => {
		if (modal) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				dismiss();
			}
		};
		const unregisterBack = registerBackHandler('overlay', () => {
			dismiss();
			return true;
		});
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('keydown', onKey);
			unregisterBack();
		};
	}, [modal, dismiss]);
	// The palette must capture the real launcher when its chunk arrives. A temporary modal
	// would focus its own Close button and leave the palette with a detached return target.
	if (!modal)
		return (
			<div
				role="status"
				aria-label={t(titleKey)}
				style={{
					position: 'fixed',
					top: 'var(--space-4)',
					left: '50%',
					transform: 'translateX(-50%)',
					zIndex: 'var(--z-modal)',
					display: 'flex',
					alignItems: 'center',
					gap: 'var(--space-2)',
					padding: 'var(--space-3)',
					borderRadius: 'var(--radius-md)',
					background: 'var(--color-surface-raised)',
					color: 'var(--color-text-primary)',
					boxShadow: 'var(--shadow-md)',
				}}
			>
				<Icon name={icon} />
				<span>{t(messageKey)}</span>
				<Button variant="ghost" onClick={dismiss}>
					{t('common.action.cancel')}
				</Button>
			</div>
		);
	return (
		<Dialog open title={t(titleKey)} onClose={onClose}>
			<p role="status" style={{ display: 'flex', gap: 'var(--space-2)' }}>
				<Icon name={icon} />
				{t(messageKey)}
			</p>
		</Dialog>
	);
}
