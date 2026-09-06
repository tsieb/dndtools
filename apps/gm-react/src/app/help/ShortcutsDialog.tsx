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
			<div data-shortcuts-overlay style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
				{scopes.map((scope) => (
					<section key={scope} aria-label={scopeLabel[scope]}>
						<h3
							style={{
								margin: '0 0 6px',
								font: `600 12px ${T.sans}`,
								letterSpacing: '.06em',
								textTransform: 'uppercase',
								color: T.ter,
							}}
						>
							{scopeLabel[scope]}
						</h3>
						<dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
							{shortcutsForScope(scope).map((entry) => (
								<div
									key={entry.id}
									style={{
										display: 'flex',
										gap: 12,
										alignItems: 'baseline',
										padding: '7px 0',
										borderBottom: `1px solid ${T.bd}`,
									}}
								>
									<dt style={{ flex: '0 0 148px' }}>
										<span
											style={{
												font: `12px ${T.mono}`,
												color: T.ink,
												border: `1px solid ${T.bd}`,
												borderRadius: 5,
												padding: '2px 7px',
												background: T.alt,
												whiteSpace: 'nowrap',
											}}
										>
											{entry.keys}
										</span>
									</dt>
									<dd
										style={{
											margin: 0,
											flex: 1,
											minWidth: 0,
											font: `12.5px ${T.sans}`,
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
