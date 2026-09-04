import { Icon } from '../../ds';
import { T } from '../../app/screen-kit';
import { ghostBtn } from './shared';

/** The Atlas notice banner — every async outcome on the screen lands here. Extracted from
 * Atlas.tsx unchanged (RC-STB-2.6). */
export function NoticeBar({
	notice,
	onDismiss,
}: {
	notice: { tone: 'info' | 'error'; text: string };
	onDismiss: () => void;
}) {
	return (
		<div
			// This one banner carries every async outcome on the screen — "Link copied", "Projected
			// to N players", and every command rejection — so it has to announce itself, and a
			// refusal has to look like one. The map editor's notice (app/map/MapEditor.tsx) is the
			// same shape: assertive + warning skin on error, polite + info skin otherwise.
			role={notice.tone === 'error' ? 'alert' : 'status'}
			aria-live={notice.tone === 'error' ? 'assertive' : 'polite'}
			style={{
				marginBottom: 14,
				padding: '9px 12px',
				borderRadius: 9,
				background: notice.tone === 'error' ? 'var(--color-status-warning-subtle)' : T.alt,
				border: `1px solid ${notice.tone === 'error' ? 'var(--color-status-warning-border)' : T.bd}`,
				font: `12.5px ${T.sans}`,
				color: notice.tone === 'error' ? 'var(--color-status-warning-text)' : T.sub,
				display: 'flex',
				alignItems: 'center',
				gap: 10,
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
				title="Dismiss"
				aria-label="Dismiss notice"
			>
				<Icon name="close" size={14} color={T.ter} />
			</button>
		</div>
	);
}
