import { useState } from 'react';
import { visibleFeatures, type FeatureTier } from '@dndtools/core';
import { Badge, Icon } from '../../ds';
import { useI18n, type MessageKey } from '../../i18n';
import { Panel, T, radioGroupKeyDown } from '../../app/screen-kit';
import { TIER_ATTR, TIER_KEY, readTier, setDocAttr } from './shared';
/** The three authored complexity levels — each maps 1:1 onto a real Core `FeatureTier`. */
export const COMPLEXITY_LEVELS: {
	id: string;
	name: MessageKey;
	icon: string;
	tier: FeatureTier;
	rec?: boolean;
	blurb: MessageKey;
}[] = [
	{
		id: 'beginner',
		name: 'settings.experience.beginner',
		icon: 'Sprout',
		tier: 'core',
		blurb: 'settings.experience.beginnerBlurb',
	},
	{
		id: 'standard',
		name: 'settings.experience.standard',
		icon: 'SlidersHorizontal',
		tier: 'intermediate',
		rec: true,
		blurb: 'settings.experience.standardBlurb',
	},
	{
		id: 'expert',
		name: 'settings.experience.expert',
		icon: 'Wrench',
		tier: 'advanced',
		blurb: 'settings.experience.expertBlurb',
	},
];

/** The experience-complexity card: the real feature-tier control Appearance hosts. */
export function ExperienceComplexity() {
	const { t } = useI18n();
	const [tier, setTier] = useState<FeatureTier>(() => readTier());
	const activeLvl = COMPLEXITY_LEVELS.find((l) => l.tier === tier) ?? COMPLEXITY_LEVELS[1];
	return (
		<Panel
			title={t('settings.experience.title')}
			action={<Badge status="neutral">{t(activeLvl.name)}</Badge>}
		>
			<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub, marginBottom: 4 }}>
				{t('settings.experience.intro')}
			</div>
			<div
				// This was the last hand-rolled picker in the file with visual-only selection: three
				// plain buttons whose chosen one differed by border/background alone, each its own tab
				// stop, with nothing announcing which was active. The declared-radiogroup shape used by
				// "Tool preferences" below (and by Onboarding's choice cards) is the house pattern.
				role="radiogroup"
				aria-label={t('settings.experience.title')}
				onKeyDown={radioGroupKeyDown}
				style={{
					display: 'grid',
					gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
					gap: 12,
				}}
			>
				{COMPLEXITY_LEVELS.map((l) => {
					const levelTier = l.tier;
					const on = levelTier === tier;
					const reveals = visibleFeatures(levelTier).map((f) => f.label);
					return (
						<button
							key={l.id}
							type="button"
							role="radio"
							aria-checked={on}
							tabIndex={on ? 0 : -1}
							onClick={() => {
								setTier(levelTier);
								setDocAttr(TIER_ATTR, TIER_KEY, levelTier);
							}}
							style={{
								minWidth: 0,
								maxWidth: '100%',
								textAlign: 'left',
								display: 'flex',
								flexDirection: 'column',
								gap: 9,
								padding: 14,
								borderRadius: 12,
								cursor: 'pointer',
								border: `1px solid ${on ? T.accBd : T.bd}`,
								background: on ? T.accSub : T.surf,
								boxShadow: on ? T.smd : 'none',
							}}
						>
							<div
								style={{
									display: 'flex',
									minWidth: 0,
									alignItems: 'center',
									gap: 9,
									flexWrap: 'wrap',
								}}
							>
								<span
									style={{
										width: 30,
										height: 30,
										borderRadius: 8,
										flex: '0 0 auto',
										display: 'inline-flex',
										alignItems: 'center',
										justifyContent: 'center',
										background: on ? T.acc : T.alt,
										color: on ? T.accFg : T.acc,
									}}
								>
									<Icon name={l.icon} size="sm" />
								</span>
								<span style={{ font: `700 14px ${T.disp}`, color: on ? T.acc : T.ink }}>
									{t(l.name)}
								</span>
								{l.rec && !on && <Badge status="neutral">{t('common.badge.recommended')}</Badge>}
								{on && (
									<span style={{ marginLeft: 'auto' }}>
										<Icon name="check" size={16} color={T.acc} />
									</span>
								)}
							</div>
							<div style={{ font: `11.5px/1.5 ${T.sans}`, color: T.sub }}>{t(l.blurb)}</div>
							<div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
								{reveals.map((r) => (
									<span
										key={r}
										style={{
											display: 'flex',
											minWidth: 0,
											alignItems: 'center',
											gap: 6,
											font: `11px ${T.sans}`,
											color: T.ter,
											overflowWrap: 'anywhere',
										}}
									>
										<Icon name="check" size={12} color={on ? T.acc : T.ter} />
										{r}
									</span>
								))}
							</div>
						</button>
					);
				})}
			</div>
		</Panel>
	);
}
