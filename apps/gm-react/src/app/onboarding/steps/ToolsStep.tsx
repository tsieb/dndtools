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
	return (
		<div
			style={{ paddingTop: 14 }}
			role="radiogroup"
			aria-label="Optional tools"
			onKeyDown={radioGroupKeyDown}
		>
			<h2 style={{ margin: '0 0 4px', font: `700 21px ${T.disp}` }}>
				Which optional tools do you want?
			</h2>
			<p style={{ margin: '0 0 18px', font: `13px ${T.sans}`, color: T.ter }}>
				Choose what belongs in your workspace. You can change this later only from Settings.
			</p>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
				<ChoiceCard
					on={aiUsage === 'complete'}
					icon="sparkle"
					title="Assistant and generators"
					desc="Show the optional campaign assistant and its setup, alongside built-in random generators."
					onPick={() => setAiUsage('complete')}
				/>
				<ChoiceCard
					on={aiUsage === 'generation-only'}
					icon="tool-generate"
					title="Generators only"
					desc="Keep Lamplight’s built-in offline generators, such as map generation. No assistant or model controls are shown."
					onPick={() => setAiUsage('generation-only')}
				/>
				<ChoiceCard
					on={aiUsage === 'none'}
					icon="close"
					title="None"
					badge="Private by default"
					desc="Keep all optional AI tools out of sight. No provider or assistant UI appears anywhere outside Settings."
					onPick={() => setAiUsage('none')}
				/>
			</div>
		</div>
	);
}
