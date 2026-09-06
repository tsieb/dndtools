import { BrandLockup, Icon } from '../../ds';
import { useI18n } from '../../i18n';
import { T } from '../screen-kit';
import { ONB_STEPS } from './shared';

/** The wizard's left rail (top strip on a phone): brand, the ordered step list with its
 * done/current state, and the time estimate. Extracted from Onboarding.tsx unchanged
 * (RC-STB-2.6). */
export function StepRail({
	i,
	isPhone,
	step,
}: {
	i: number;
	isPhone: boolean;
	step: (typeof ONB_STEPS)[number];
}) {
	const { t } = useI18n();
	return (
		<div
			style={{
				width: isPhone ? '100%' : 248,
				flex: isPhone ? '0 0 auto' : '0 0 248px',
				background: `linear-gradient(180deg, ${T.accSub}, ${T.surf})`,
				borderRight: isPhone ? 'none' : `1px solid ${T.bd}`,
				borderBottom: isPhone ? `1px solid ${T.bd}` : 'none',
				padding: isPhone ? '12px 14px' : '24px 20px',
				display: 'flex',
				flexDirection: 'column',
			}}
		>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 9,
					marginBottom: isPhone ? 0 : 24,
				}}
			>
				<BrandLockup
					markSize={30}
					wordSize={15}
					gap={9}
					style={{ flex: isPhone ? 1 : undefined }}
				/>
				{isPhone && (
					<span style={{ font: `600 12px ${T.sans}`, color: T.sub }}>
						{t('onboarding.railProgress', {
							title: t(step.title),
							current: i + 1,
							total: ONB_STEPS.length,
						})}
					</span>
				)}
			</div>
			{!isPhone && (
				<div
					style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}
					aria-hidden="true"
				>
					{ONB_STEPS.map((s, j) => {
						const done = j < i;
						const on = j === i;
						return (
							<div
								key={s.id}
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
										width: 24,
										height: 24,
										borderRadius: '50%',
										flex: '0 0 auto',
										display: 'inline-flex',
										alignItems: 'center',
										justifyContent: 'center',
										background: done ? T.ok : on ? T.acc : T.alt,
										color: done || on ? T.accFg : T.ter,
									}}
								>
									{done ? (
										<Icon name="check" size={13} />
									) : (
										<span style={{ font: `700 11px ${T.mono}` }}>{j + 1}</span>
									)}
								</span>
								<span
									style={{
										font: `${on ? 600 : 500} 13px ${T.sans}`,
										color: on ? T.ink : T.sub,
									}}
								>
									{t(s.title)}
								</span>
							</div>
						);
					})}
				</div>
			)}
			{!isPhone && (
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 7,
						font: `11.5px ${T.sans}`,
						color: T.ter,
					}}
				>
					<Icon name="recent" size={13} /> {t('onboarding.timeEstimate')}
				</div>
			)}
		</div>
	);
}
