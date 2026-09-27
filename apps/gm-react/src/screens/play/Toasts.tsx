import { Icon } from '../../ds';
import { T } from '../../app/screen-kit';
import { TOAST_TONE, type ToastItem } from './shared';

export function PlayerToasts({ toasts }: { toasts: ToastItem[] }) {
	return (
		<>
			{/* A role="status" node that mounts WITH its text is usually never announced, so the polite
			    toasts (raise-hand confirmation, nat-20, lock reasons) were silent. This region is always
			    mounted and only its TEXT changes, which is what screen readers actually pick up. */}
			<div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
				{[...toasts].reverse().find((t) => t.status !== 'error')?.msg ?? ''}
			</div>

			{/* toasts */}
			<div
				className="player-view-toast-viewport"
				style={{
					position: 'fixed',
					right: 22,
					bottom: 22,
					display: 'flex',
					flexDirection: 'column',
					gap: T.space.two,
					zIndex: 60,
				}}
			>
				{toasts.map((t) => {
					const tone = TOAST_TONE[t.status] || TOAST_TONE.neutral;
					return (
						<div
							key={t.id}
							// Errors keep role="alert" (announced on insertion regardless); the polite ones are
							// announced by the persistent region below, so they must not also claim one here.
							role={t.status === 'error' ? 'alert' : undefined}
							aria-live={t.status === 'error' ? 'assertive' : undefined}
							aria-atomic={t.status === 'error' ? 'true' : undefined}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: T.space.two,
								padding: `${T.space.three} ${T.space.three}`,
								borderRadius: T.radius.lg,
								background: tone.bg,
								border: `1px solid ${tone.bd}`,
								boxShadow: T.smd,
								minWidth: 220,
								maxWidth: 320,
							}}
						>
							{t.icon && <Icon name={t.icon} size={16} color={tone.fg} />}
							<span style={{ font: `12.5px ${T.sans}`, color: tone.fg }}>{t.msg}</span>
						</div>
					);
				})}
			</div>
		</>
	);
}
