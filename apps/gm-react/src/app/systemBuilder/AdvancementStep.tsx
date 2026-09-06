import { SYSTEM_ADVANCEMENT_MODELS } from '@dndtools/core';
import { Field, Select } from '../../ds';
import { T } from '../screen-kit';
import { FieldGrid, StepHeader, StepSection } from '../widgetBuilder/fields';
import { CommaListField, StepIssues, NullableNumberField, type SystemStepProps } from './ui';
import type { MessageKey } from '../../i18n';

/**
 * Step 7 — advancement (RC-SYS-3.3).
 *
 * Three answers: an experience table, milestones the DM calls, or a system with no levels at all.
 * The thresholds are CUMULATIVE experience to reach each level, index 0 being level 1, so the list
 * doubles as the level cap's sanity check — the schema refuses an `xp-table` with none.
 */

const MODEL_LABEL: Record<string, MessageKey> = {
	'xp-table': 'systemBuilder.advancement.model.xpTable',
	milestone: 'systemBuilder.advancement.model.milestone',
	none: 'systemBuilder.advancement.model.none',
};

export function AdvancementStep({ draft, patch, issues, t }: SystemStepProps) {
	const advancement = draft.advancement;
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
			<StepHeader
				title={t('systemBuilder.step.advancement')}
				help={t('systemBuilder.advancement.help')}
			/>
			<StepSection title={t('systemBuilder.advancement.section')}>
				<FieldGrid>
					<Field label={t('systemBuilder.advancement.model')}>
						<Select
							value={advancement.model}
							options={SYSTEM_ADVANCEMENT_MODELS.map((model) => ({
								value: model,
								label: t(MODEL_LABEL[model]!),
							}))}
							onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
								patch({
									advancement: {
										...advancement,
										model: e.target.value as typeof advancement.model,
									},
								})
							}
						/>
					</Field>
					<NullableNumberField
						label={t('systemBuilder.advancement.levelCap')}
						help={t('systemBuilder.advancement.levelCapHelp')}
						value={advancement.levelCap}
						path="advancement.levelCap"
						issues={issues}
						t={t}
						max={100}
						onChange={(next) => patch({ advancement: { ...advancement, levelCap: next } })}
					/>
				</FieldGrid>
				{advancement.model === 'xp-table' && (
					<CommaListField
						label={t('systemBuilder.advancement.thresholds')}
						help={t('systemBuilder.advancement.thresholdsHelp')}
						value={advancement.xpThresholds.map((entry) => String(entry))}
						path="advancement.xpThresholds"
						issues={issues}
						t={t}
						onCommit={(next) =>
							patch({
								advancement: {
									...advancement,
									xpThresholds: next
										.map((entry) => Number(entry))
										.filter((entry) => Number.isFinite(entry)),
								},
							})
						}
					/>
				)}
				{advancement.model === 'xp-table' && advancement.xpThresholds.length > 0 && (
					<span style={{ font: `12px/1.5 ${T.sans}`, color: T.ter }}>
						{t('systemBuilder.advancement.thresholdCount', {
							count: advancement.xpThresholds.length,
						})}
					</span>
				)}
			</StepSection>
			<StepIssues
				issues={issues}
				claimed={['advancement.levelCap', 'advancement.xpThresholds']}
				t={t}
			/>
		</div>
	);
}
