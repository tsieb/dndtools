import { Button, Dialog } from '../../ds';
import { useI18n } from '../../i18n';
import { T } from '../screen-kit';
import { shortcutsForScope, type ShortcutScope } from '../shortcuts/registry';

/**
 * RC-UX-3.3 — the `?` overlay. It prints the keyboard shortcut registry, so a shortcut is
 * documented by the same declaration the handler fires on and cannot drift out of the help.
 *
 * `scopes` picks which surfaces to show: the shell shows the global set plus the canvas set, the
 * map editor shows its own keymap (it owns the keyboard while open, so the shell's keys are not
 * live beneath it).
 */
export function ShortcutsDialog({
	onClose,
	scopes = ['global', 'canvas'],
	title,
}: {
	onClose: () => void;
	scopes?: readonly ShortcutScope[];
	title?: string;
}) {
	const { t } = useI18n();
	const scopeLabel: Record<ShortcutScope, string> = {
		global: t('shortcuts.scope.global'),
		canvas: t('shortcuts.scope.canvas'),
		map: t('shortcuts.scope.map'),
	};
	return (
		<Dialog
			open
			onClose={onClose}
			title={title ?? t('shortcuts.title')}
			icon="info"
			size="md"
			footer={
				<Button variant="primary" size="sm" onClick={onClose}>
					{t('common.action.done')}
				</Button>
			}
		>
			<div
				data-shortcuts-overlay
				tabIndex={0}
				role="region"
				aria-label={title ?? t('shortcuts.title')}
				style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
			>
				{scopes.map((scope) => (
					<section key={scope} aria-label={scopeLabel[scope]}>
						<h3
							style={{
								margin: '0 0 var(--space-1-5)',
								font: `600 var(--text-xs) ${T.sans}`,
								letterSpacing: 'var(--tracking-wide)',
								textTransform: 'uppercase',
								color: T.ter,
							}}
						>
							{scopeLabel[scope]}
						</h3>
						<dl
							style={{
								margin: 'var(--space-0)',
								display: 'flex',
								flexDirection: 'column',
								gap: 'var(--space-0-5)',
							}}
						>
							{shortcutsForScope(scope).map((entry) => (
								<div
									key={entry.id}
									style={{
										display: 'flex',
										gap: 'var(--space-3)',
										alignItems: 'baseline',
										flexWrap: 'wrap',
										padding: 'var(--space-2) 0',
										borderBottom: `1px solid ${T.bd}`,
									}}
								>
									<dt style={{ flex: '1 1 40%', minWidth: 0 }}>
										<kbd
											style={{
												font: `var(--text-xs) ${T.mono}`,
												color: T.ink,
												border: `1px solid ${T.bd}`,
												borderRadius: 'var(--radius-md)',
												padding: 'var(--space-0-5) var(--space-2)',
												background: T.alt,
												overflowWrap: 'anywhere',
											}}
										>
											{entry.keys}
										</kbd>
									</dt>
									<dd
										style={{
											margin: 'var(--space-0)',
											flex: '1 1 50%',
											minWidth: 0,
											font: `var(--text-sm) ${T.sans}`,
											color: T.sub,
											overflowWrap: 'anywhere',
										}}
									>
										{t(entry.action)}
									</dd>
								</div>
							))}
						</dl>
					</section>
				))}
			</div>
		</Dialog>
	);
}
