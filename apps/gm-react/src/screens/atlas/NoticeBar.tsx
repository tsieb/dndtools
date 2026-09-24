import { Icon } from '../../ds';
import { T } from '../../app/screen-kit';
import { ghostBtn } from './shared';
import { useI18n } from '../../i18n';

/** The Atlas notice banner — every async outcome on the screen lands here. Extracted from
 * Atlas.tsx unchanged (RC-STB-2.6). */
export function NoticeBar({
	notice,
	onDismiss,
}: {
	notice: { tone: 'info' | 'error'; text: string };
	onDismiss: () => void;
}) {
	const { t } = useI18n();
	return (
		<div
			// This one banner carries every async outcome on the screen — "Link copied", "Projected
			// to N players", and every command rejection — so it has to announce itself, and a
			// refusal has to look like one. The map editor's notice (app/map/MapEditor.tsx) is the
			// same shape: assertive + warning skin on error, polite + info skin otherwise.
			role={notice.tone === 'error' ? 'alert' : 'status'}
			aria-live={notice.tone === 'error' ? 'assertive' : 'polite'}
			style={{
				marginBottom: 'var(--space-3)',
				padding: 'var(--space-2) var(--space-3)',
				borderRadius: 'var(--radius-md)',
				background: notice.tone === 'error' ? 'var(--color-status-warning-subtle)' : T.alt,
				border: `1px solid ${notice.tone === 'error' ? 'var(--color-status-warning-border)' : T.bd}`,
				font: `12.5px ${T.sans}`,
				color: notice.tone === 'error' ? 'var(--color-status-warning-text)' : T.sub,
				display: 'flex',
				alignItems: 'center',
				gap: 'var(--space-2)',
			}}
		>
			<Icon
				name={notice.tone === 'error' ? 'warning' : 'info'}
				size={15}
				color={notice.tone === 'error' ? 'var(--color-status-warning-text)' : T.info}
			/>
			<span style={{ flex: 1 }}>{notice.text}</span>
			<button
				type="button"
				onClick={onDismiss}
				style={ghostBtn}
				title={t('atlas.dismiss')}
				aria-label={t('atlas.dismissNotice')}
			>
				<Icon name="close" size={14} color={T.ter} />
			</button>
		</div>
	);
}
