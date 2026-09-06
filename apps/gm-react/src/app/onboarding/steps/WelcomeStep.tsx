import { Icon } from '../../../ds';
import { useI18n, type MessageKey } from '../../../i18n';
import { T } from '../../screen-kit';

/** Step 1 — welcome. Extracted from Onboarding.tsx unchanged (RC-STB-2.6). */
const PILLS: MessageKey[] = [
	'onboarding.welcome.anySystem',
	'onboarding.welcome.localFirst',
	'onboarding.welcome.playerSafe',
];

export function WelcomeStep() {
	const { t } = useI18n();
	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'flex-start',
				justifyContent: 'center',
				minHeight: '100%',
				gap: 16,
			}}
		>
			<span
				style={{
					width: 60,
					height: 60,
					borderRadius: 16,
					background: T.acc,
					color: T.accFg,
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
				}}
			>
				<Icon name="sparkle" size="xl" />
			</span>
			<div>
				<h2 style={{ margin: 0, font: `700 28px ${T.disp}`, letterSpacing: '-.01em' }}>
					{t('onboarding.welcome.title')}
				</h2>
				<p
					style={{
						margin: '8px 0 0',
						font: `14px/1.6 ${T.sans}`,
						color: T.sub,
						maxWidth: 440,
					}}
				>
					{t('onboarding.welcome.body')}
				</p>
			</div>
			<div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
				{PILLS.map((key) => (
					<span
						key={key}
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: 7,
							padding: '7px 11px',
							borderRadius: 20,
							background: T.surf,
							border: `1px solid ${T.bd}`,
							font: `12px ${T.sans}`,
							color: T.sub,
						}}
					>
						<Icon name="check" size={13} color={T.acc} />
						{t(key)}
					</span>
				))}
			</div>
		</div>
	);
}
