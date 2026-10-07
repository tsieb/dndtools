import { tierHiddenSections, type FeatureTier } from '@dndtools/core';
import { Badge } from '../../../ds';
import { useI18n, type MessageKey } from '../../../i18n';
import { T, radioGroupKeyDown } from '../../screen-kit';

export const TIER_NAMES: Record<FeatureTier, MessageKey> = {
	core: 'onboarding.experience.beginner',
	intermediate: 'onboarding.experience.standard',
	advanced: 'onboarding.experience.expert',
};

/** RC-UX-6.4 — each card says what its tier hides, from the same complexity-map query as the
 * Settings › Appearance cards, so the three never read the same. */
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
				const hidden = tierHiddenSections(value).map((gate) =>
					t((gate.summaryKey ?? gate.labelKey) as MessageKey),
				);
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
						<span
							style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: T.space.two }}
						>
							<strong>{t(TIER_NAMES[value])}</strong>
							{value === 'intermediate' && (
								// The badge drops to its own line rather than breaking mid-word.
								<Badge status="neutral" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
									{t('common.badge.recommended')}
								</Badge>
							)}
						</span>
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
