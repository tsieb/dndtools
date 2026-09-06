import type { SystemTurnModel } from '@dndtools/core';
import {
	SYSTEM_ADVANTAGE_SEMANTICS,
	SYSTEM_CRIT_EFFECTS,
	SYSTEM_DICE_MODELS,
} from '@dndtools/core';
import { Field, Select } from '../../ds';
import { FieldGrid, StepHeader, StepSection } from '../widgetBuilder/fields';
import { StepIssues, NullableNumberField, TextField, type SystemStepProps } from './ui';
import type { MessageKey } from '../../i18n';

/**
 * Step 5 — dice and turns (RC-SYS-3.3).
 *
 * These two are one step because they are the same question asked twice: how does this system
 * resolve a moment. RC-SYS-2.4 already made the dice tray and the initiative tracker read both off
 * the active package, so a change here changes what those surfaces offer.
 */

const DICE_MODEL_LABEL: Record<string, MessageKey> = {
	'd20-plus-modifier': 'extensions.system.dice.d20',
	'dice-pool': 'extensions.system.dice.pool',
	'2d6-pbta': 'extensions.system.dice.2d6',
	custom: 'extensions.system.dice.custom',
};

const ADVANTAGE_LABEL: Record<string, MessageKey> = {
	'roll-twice-take-best': 'systemBuilder.dice.advantage.rollTwice',
	'extra-die': 'systemBuilder.dice.advantage.extraDie',
	'bonus-modifier': 'systemBuilder.dice.advantage.bonus',
	none: 'systemBuilder.dice.advantage.none',
};

const CRIT_LABEL: Record<string, MessageKey> = {
	'double-dice': 'systemBuilder.dice.crit.doubleDice',
	'max-dice': 'systemBuilder.dice.crit.maxDice',
	'extra-effect': 'systemBuilder.dice.crit.extraEffect',
	none: 'systemBuilder.dice.crit.none',
};

const TURN_LABEL: Record<SystemTurnModel['kind'], MessageKey> = {
	initiative: 'extensions.system.turn.initiative',
	'actions-per-turn': 'extensions.system.turn.actions',
	popcorn: 'extensions.system.turn.popcorn',
	none: 'extensions.system.turn.none',
};

const TURN_KINDS: readonly SystemTurnModel['kind'][] = [
	'initiative',
	'actions-per-turn',
	'popcorn',
	'none',
];

export function DiceStep({ draft, patch, issues, t }: SystemStepProps) {
	const dice = draft.dice;
	const turn = draft.turnModel;
	const setTurnKind = (kind: SystemTurnModel['kind']) => {
		if (kind === turn.kind) return;
		patch({
			turnModel:
				kind === 'initiative'
					? { kind, initiativeFormula: 'modifier' }
					: kind === 'actions-per-turn'
						? { kind, actionsPerTurn: 3 }
						: { kind },
		});
	};
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
			<StepHeader title={t('systemBuilder.step.dice')} help={t('systemBuilder.dice.help')} />
			<StepSection title={t('systemBuilder.dice.section')}>
				<FieldGrid>
					<Field label={t('systemBuilder.dice.model')}>
						<Select
							value={dice.model}
							options={SYSTEM_DICE_MODELS.map((model) => ({
								value: model,
								label: t(DICE_MODEL_LABEL[model]!),
							}))}
							onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
								patch({ dice: { ...dice, model: e.target.value as typeof dice.model } })
							}
						/>
					</Field>
					<TextField
						label={t('systemBuilder.dice.notation')}
						help={t('systemBuilder.dice.notationHelp')}
						value={dice.notation}
						path="dice.notation"
						issues={issues}
						t={t}
						maxLength={32}
						onChange={(next) => patch({ dice: { ...dice, notation: next } })}
					/>
					<Field label={t('systemBuilder.dice.advantageLabel')}>
						<Select
							value={dice.advantage}
							options={SYSTEM_ADVANTAGE_SEMANTICS.map((semantic) => ({
								value: semantic,
								label: t(ADVANTAGE_LABEL[semantic]!),
							}))}
							onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
								patch({ dice: { ...dice, advantage: e.target.value as typeof dice.advantage } })
							}
						/>
					</Field>
					<NullableNumberField
						label={t('systemBuilder.dice.successThreshold')}
						help={t('systemBuilder.dice.successThresholdHelp')}
						value={dice.successThreshold}
						path="dice.successThreshold"
						issues={issues}
						t={t}
						max={100}
						onChange={(next) => patch({ dice: { ...dice, successThreshold: next } })}
					/>
				</FieldGrid>
			</StepSection>
			<StepSection title={t('systemBuilder.dice.critSection')}>
				<FieldGrid>
					<NullableNumberField
						label={t('systemBuilder.dice.critHigh')}
						help={t('systemBuilder.dice.critHighHelp')}
						value={dice.crit.naturalHigh}
						path="dice.crit.naturalHigh"
						issues={issues}
						t={t}
						onChange={(next) =>
							patch({ dice: { ...dice, crit: { ...dice.crit, naturalHigh: next } } })
						}
					/>
					<NullableNumberField
						label={t('systemBuilder.dice.critLow')}
						help={t('systemBuilder.dice.critLowHelp')}
						value={dice.crit.naturalLow}
						path="dice.crit.naturalLow"
						issues={issues}
						t={t}
						onChange={(next) =>
							patch({ dice: { ...dice, crit: { ...dice.crit, naturalLow: next } } })
						}
					/>
					<Field label={t('systemBuilder.dice.critEffect')}>
						<Select
							value={dice.crit.effect}
							options={SYSTEM_CRIT_EFFECTS.map((effect) => ({
								value: effect,
								label: t(CRIT_LABEL[effect]!),
							}))}
							onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
								patch({
									dice: {
										...dice,
										crit: { ...dice.crit, effect: e.target.value as typeof dice.crit.effect },
									},
								})
							}
						/>
					</Field>
				</FieldGrid>
			</StepSection>
			<StepSection title={t('systemBuilder.turns.section')} help={t('systemBuilder.turns.help')}>
				<FieldGrid>
					<Field label={t('systemBuilder.turns.model')}>
						<Select
							value={turn.kind}
							options={TURN_KINDS.map((kind) => ({ value: kind, label: t(TURN_LABEL[kind]) }))}
							onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
								setTurnKind(e.target.value as SystemTurnModel['kind'])
							}
						/>
					</Field>
					{turn.kind === 'initiative' && (
						<TextField
							label={t('systemBuilder.turns.initiativeFormula')}
							help={t('systemBuilder.turns.initiativeFormulaHelp')}
							value={turn.initiativeFormula ?? ''}
							path="turnModel.initiativeFormula"
							issues={issues}
							t={t}
							onChange={(next) =>
								patch({
									turnModel: {
										kind: 'initiative',
										initiativeFormula: next.trim() === '' ? null : next,
									},
								})
							}
						/>
					)}
					{turn.kind === 'actions-per-turn' && (
						<NullableNumberField
							label={t('systemBuilder.turns.actionsPerTurn')}
							value={turn.actionsPerTurn}
							path="turnModel.actionsPerTurn"
							issues={issues}
							t={t}
							max={20}
							onChange={(next) =>
								patch({ turnModel: { kind: 'actions-per-turn', actionsPerTurn: next ?? 1 } })
							}
						/>
					)}
				</FieldGrid>
			</StepSection>
			<StepIssues
				issues={issues}
				claimed={[
					'dice.notation',
					'dice.successThreshold',
					'dice.crit.naturalHigh',
					'dice.crit.naturalLow',
					'turnModel.initiativeFormula',
					'turnModel.actionsPerTurn',
				]}
				t={t}
			/>
		</div>
	);
}
