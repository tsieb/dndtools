import { Icon } from '../../ds';
import { T } from '../../app/screen-kit';
import { useI18n, type MessageKey } from '../../i18n';
import { minTierLabel } from './shared';

export function PlayerNavRow({
	n,
	locked,
	current,
	setSection,
	toast,
}: {
	n: { id: string; label: MessageKey; icon: string; min: number };
	locked: boolean;
	current: string;
	setSection: (section: string) => void;
	toast: (message: string, status?: string, icon?: string) => void;
}) {
	const { t } = useI18n();
	return (
		<button
			className={`player-view-nav-row${n.min >= 2 ? ' player-view-nav-elevated' : ''}`}
			key={n.id}
			type="button"
			aria-label={
				locked
					? t('play.nav.lockedLabel', { section: t(n.label), tier: t(minTierLabel(n.min)) })
					: t(n.label)
			}
			// The active section was signalled by border/background/weight only, so AT and
			// high-contrast users had no way to tell which of the nine sections they were in.
			aria-current={!locked && current === n.id ? 'page' : undefined}
			title={
				locked
					? t('play.nav.lockedTitle', { section: t(n.label), tier: t(minTierLabel(n.min)) })
					: t(n.label)
			}
			// `disabled` made the lock-reason toast below unreachable dead code AND removed the row
			// from the tab order, so the aria-label explaining the seat requirement could never be
			// read. aria-disabled keeps it focusable and lets the explanation fire.
			aria-disabled={locked || undefined}
			onClick={() => {
				if (locked) {
					// Explain the seat requirement without changing the current section.
					toast(
						t(n.min >= 2 ? 'play.nav.lockedSeatToast' : 'play.nav.lockedPermissionToast', {
							section: t(n.label),
							tier: t(minTierLabel(n.min)),
						}),
						'info',
						'hidden',
					);
					return;
				}
				setSection(n.id);
			}}
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: T.space.three,
				padding: `${T.space.two} ${T.space.three}`,
				borderRadius: T.radius.lg,
				cursor: locked ? 'not-allowed' : 'pointer',
				textAlign: 'left',
				width: '100%',
				border: 'none',
				borderLeft: `3px solid ${current === n.id && !locked ? T.acc : 'transparent'}`,
				background: current === n.id && !locked ? T.accSub : 'transparent',
				// A locked row is still focusable and still ACTS (it explains the lock), so the
				// "inactive component" contrast exemption does not apply — 0.42 dropped the label to
				// ~2.5:1. 0.7 clears 4.5:1; the lock is carried by the trailing hidden icon + label.
				opacity: locked ? 0.7 : 1,
			}}
		>
			<Icon name={n.icon} size={19} color={current === n.id && !locked ? T.acc : T.ter} />
			<span
				style={{
					flex: 1,
					font: `${current === n.id && !locked ? 600 : 500} 13.5px ${T.sans}`,
					color: current === n.id && !locked ? T.ink : T.sub,
				}}
			>
				{t(n.label)}
			</span>
			{locked && <Icon name="hidden" size={14} color={T.ter} />}
		</button>
	);
}
