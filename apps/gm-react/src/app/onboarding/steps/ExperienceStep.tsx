import { isFeatureVisible, SECTION_FEATURE_GATES, type FeatureTier } from '@dndtools/core';
import { useI18n, type MessageKey } from '../../../i18n';
import { T, radioGroupKeyDown } from '../../screen-kit';

export const TIER_NAMES: Record<FeatureTier, MessageKey> = {
	core: 'onboarding.experience.beginner',
	intermediate: 'onboarding.experience.standard',
	advanced: 'onboarding.experience.expert',
};

/** Until the full complexity map lands, describe the actual gated Settings tabs. */
export function ExperienceStep({
	isDesktop,
	tier,
	setTier,
}: {
	isDesktop: boolean;
	tier: FeatureTier;
	setTier: (tier: FeatureTier) => void;
}) {
	const { t } = useI18n();
	const tabs = SECTION_FEATURE_GATES.filter((gate) => gate.id.startsWith('settings.nav.'));
	return (
		<div
			role="radiogroup"
			aria-label={t('onboarding.v3.group')}
			onKeyDown={radioGroupKeyDown}
			style={{
				display: 'grid',
				gridTemplateColumns: isDesktop ? 'repeat(3, 1fr)' : '1fr',
				gap: T.space.two,
			}}
		>
			{(['core', 'intermediate', 'advanced'] as const).map((value) => {
				const hidden = tabs
					.filter((gate) => !isFeatureVisible(gate.id, value, tabs))
					.map((gate) => t(gate.labelKey as MessageKey));
				return (
					<button
						key={value}
						type="button"
						role="radio"
						aria-checked={tier === value}
						tabIndex={tier === value ? 0 : -1}
						onClick={() => setTier(value)}
						style={{
							padding: T.space.three,
							borderRadius: T.radius.md,
							textAlign: 'left',
							color: T.ink,
							font: `13px/1.5 ${T.sans}`,
							cursor: 'pointer',
							border: `1px solid ${tier === value ? T.acc : T.bd}`,
							background: tier === value ? T.accSub : T.surf,
						}}
					>
						<strong>
							{value === 'intermediate'
								? t('onboarding.v3.recommended', { tier: t(TIER_NAMES[value]) })
								: t(TIER_NAMES[value])}
						</strong>
						<span style={{ display: 'block', marginTop: T.space.one }}>
							{hidden.length
								? t('onboarding.v3.hides', { tabs: hidden.join(', ') })
								: t('onboarding.v3.hidesNone')}
						</span>
					</button>
				);
			})}
		</div>
	);
}
