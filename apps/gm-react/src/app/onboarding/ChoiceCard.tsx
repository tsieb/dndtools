import { Badge, Icon } from '../../ds';
import { T } from '../screen-kit';

/** Radio-style choice card shared by the vault + privacy + experience steps. */
export function ChoiceCard({
	on,
	icon,
	title,
	badge,
	desc,
	children,
	onPick,
	tabbable,
}: {
	on: boolean;
	icon: string;
	title: string;
	badge?: string;
	desc: string;
	children?: React.ReactNode;
	onPick: () => void;
	/** Override for an undefaulted group: with no selection, the first card must stay Tab-reachable. */
	tabbable?: boolean;
}) {
	return (
		<button
			type="button"
			role="radio"
			aria-checked={on}
			tabIndex={(tabbable ?? on) ? 0 : -1}
			onClick={onPick}
			style={{
				display: 'flex',
				alignItems: 'flex-start',
				gap: 14,
				padding: 15,
				borderRadius: 12,
				cursor: 'pointer',
				textAlign: 'left',
				border: `1px solid ${on ? T.accBd : T.bd}`,
				background: on ? T.accSub : T.surf,
				boxShadow: on ? T.smd : 'none',
				transition:
					'background var(--duration-fast) var(--easing-standard), border-color var(--duration-fast) var(--easing-standard)',
			}}
		>
			<span
				style={{
					width: 40,
					height: 40,
					borderRadius: 10,
					flex: '0 0 auto',
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					background: on ? T.acc : T.alt,
					color: on ? T.accFg : T.acc,
				}}
			>
				<Icon name={icon} size="md" />
			</span>
			<span style={{ flex: 1, minWidth: 0 }}>
				<span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
					<span style={{ font: `600 14px ${T.sans}`, color: on ? T.acc : T.ink }}>{title}</span>
					{badge && <Badge status="neutral">{badge}</Badge>}
				</span>
				<span style={{ display: 'block', font: `12px/1.5 ${T.sans}`, color: T.sub, marginTop: 2 }}>
					{desc}
				</span>
				{children}
			</span>
			<span
				aria-hidden="true"
				style={{
					width: 20,
					height: 20,
					borderRadius: '50%',
					flex: '0 0 auto',
					border: `2px solid ${on ? T.acc : T.bdS}`,
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					marginTop: 2,
				}}
			>
				{on && <span style={{ width: 9, height: 9, borderRadius: '50%', background: T.acc }} />}
			</span>
		</button>
	);
}
