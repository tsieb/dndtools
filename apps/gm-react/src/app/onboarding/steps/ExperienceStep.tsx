import { DEFAULT_FEATURE_TIER, visibleFeatures, type FeatureTier } from '@dndtools/core';
import { Badge, Icon } from '../../../ds';
import { T, radioGroupKeyDown } from '../../screen-kit';
import { COMPLEXITY_LEVELS, LEVEL_TO_TIER } from '../shared';

/** Step 4 — the device-local experience tier. Extracted from Onboarding.tsx unchanged
 * (RC-STB-2.6). */
export function ExperienceStep({
	isDesktop,
	tier,
	setTier,
}: {
	isDesktop: boolean;
	tier: FeatureTier;
	setTier: (tier: FeatureTier) => void;
}) {
	return (
		<div
			style={{ paddingTop: 14 }}
			role="radiogroup"
			aria-label="Experience complexity"
			onKeyDown={radioGroupKeyDown}
		>
			<h2 style={{ margin: '0 0 4px', font: `700 21px ${T.disp}` }}>
				How much do you want on screen?
			</h2>
			<p style={{ margin: '0 0 18px', font: `13px ${T.sans}`, color: T.ter }}>
				You can change this any time in Settings. It only affects how much is revealed — never what
				you can do.
			</p>
			<div
				style={{
					display: 'grid',
					gridTemplateColumns: isDesktop ? 'repeat(3,minmax(0,1fr))' : '1fr',
					gap: 12,
				}}
			>
				{COMPLEXITY_LEVELS.map((l) => {
					const levelTier = LEVEL_TO_TIER[l.id] ?? DEFAULT_FEATURE_TIER;
					const on = levelTier === tier;
					const reveals = visibleFeatures(levelTier).map((f) => f.label);
					return (
						<button
							key={l.id}
							type="button"
							role="radio"
							aria-checked={on}
							tabIndex={on ? 0 : -1}
							onClick={() => setTier(levelTier)}
							style={{
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
							<span
								style={{
									width: 32,
									height: 32,
									borderRadius: 9,
									display: 'inline-flex',
									alignItems: 'center',
									justifyContent: 'center',
									background: on ? T.acc : T.alt,
									color: on ? T.accFg : T.acc,
								}}
							>
								<Icon name={l.icon} size="sm" />
							</span>
							<span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
								<span style={{ font: `700 14px ${T.disp}`, color: on ? T.acc : T.ink }}>
									{l.name}
								</span>
								{l.rec && !on && <Badge status="neutral">Recommended</Badge>}
							</span>
							<span style={{ font: `11.5px/1.5 ${T.sans}`, color: T.sub }}>{l.blurb}</span>
							<span style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
								{reveals.slice(0, 4).map((r) => (
									<span
										key={r}
										style={{
											display: 'flex',
											alignItems: 'center',
											gap: 6,
											font: `11px ${T.sans}`,
											color: T.ter,
										}}
									>
										<Icon name="check" size={12} color={on ? T.acc : T.ter} />
										{r}
									</span>
								))}
							</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}
