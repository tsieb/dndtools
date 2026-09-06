import { useI18n } from '../../../i18n';
import { T, radioGroupKeyDown } from '../../screen-kit';
import { ChoiceCard } from '../ChoiceCard';
import { type AiUsagePreference } from '../../../ai/usagePreference';

/** Step 5 — the AI usage preference. Extracted from Onboarding.tsx unchanged (RC-STB-2.6). */
export function ToolsStep({
	aiUsage,
	setAiUsage,
}: {
	aiUsage: AiUsagePreference;
	setAiUsage: (value: AiUsagePreference) => void;
}) {
	const { t } = useI18n();
	return (
		<div
			style={{ paddingTop: 14 }}
			role="radiogroup"
			aria-label={t('onboarding.tools.groupLabel')}
			onKeyDown={radioGroupKeyDown}
		>
			<h2 style={{ margin: '0 0 4px', font: `700 21px ${T.disp}` }}>
				{t('onboarding.tools.title')}
			</h2>
			<p style={{ margin: '0 0 18px', font: `13px ${T.sans}`, color: T.ter }}>
				{t('onboarding.tools.intro')}
			</p>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
				<ChoiceCard
					on={aiUsage === 'complete'}
					icon="sparkle"
					title={t('onboarding.tools.completeTitle')}
					desc={t('onboarding.tools.completeDesc')}
					onPick={() => setAiUsage('complete')}
				/>
				<ChoiceCard
					on={aiUsage === 'generation-only'}
					icon="tool-generate"
					title={t('onboarding.tools.generatorsTitle')}
					desc={t('onboarding.tools.generatorsDesc')}
					onPick={() => setAiUsage('generation-only')}
				/>
				<ChoiceCard
					on={aiUsage === 'none'}
					icon="close"
					title={t('onboarding.tools.noneTitle')}
					badge={t('onboarding.tools.noneBadge')}
					desc={t('onboarding.tools.noneDesc')}
					onPick={() => setAiUsage('none')}
				/>
			</div>
		</div>
	);
}
