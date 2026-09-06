import type { SystemCondition } from '@dndtools/core';
import { SYSTEM_CONDITION_DURATIONS, SYSTEM_CONDITION_SEVERITIES } from '@dndtools/core';
import { Field, Icon, Select } from '../../ds';
import { T, radioGroupKeyDown } from '../screen-kit';
import {
	FieldGrid,
	RowCard,
	RowList,
	StepHeader,
	StepSection,
	removeAt,
	replaceAt,
} from '../widgetBuilder/fields';
import { newCondition } from './draft';
import { CONDITION_ICON_NAMES } from './icons';
import { StepIssues, NullableNumberField, TextField, type SystemStepProps } from './ui';
import type { MessageKey } from '../../i18n';

/**
 * Step 4 — conditions, with an icon picker restricted to the icon vocabulary (RC-SYS-3.3).
 *
 * `icon` is a free string in the schema, so a text box here would happily save a name that draws
 * nothing on a token. The picker offers only glyphs the registry knows — guardrail 5's one icon
 * family, reached through the semantic vocabulary — as a radio group: arrow keys move the choice,
 * so the pointer gesture and the keyboard dispatch the identical edit.
 */

const SEVERITY_LABEL: Record<string, MessageKey> = {
	minor: 'systemBuilder.conditions.severity.minor',
	major: 'systemBuilder.conditions.severity.major',
	severe: 'systemBuilder.conditions.severity.severe',
	boon: 'systemBuilder.conditions.severity.boon',
};

const DURATION_LABEL: Record<string, MessageKey> = {
	rounds: 'systemBuilder.conditions.duration.rounds',
	'save-ends': 'systemBuilder.conditions.duration.saveEnds',
	scene: 'systemBuilder.conditions.duration.scene',
	rest: 'systemBuilder.conditions.duration.rest',
	'until-removed': 'systemBuilder.conditions.duration.untilRemoved',
};

function IconPicker({
	value,
	legend,
	optionLabel,
	onChange,
}: {
	value: string;
	legend: string;
	optionLabel: (name: string) => string;
	onChange: (next: string) => void;
}) {
	return (
		<div
			role="radiogroup"
			aria-label={legend}
			onKeyDown={radioGroupKeyDown}
			style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
		>
			<span style={{ font: `600 12px ${T.sans}`, color: T.sub }}>{legend}</span>
			<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
				{CONDITION_ICON_NAMES.map((name) => {
					const selected = name === value;
					return (
						<button
							key={name}
							type="button"
							role="radio"
							aria-checked={selected}
							aria-label={optionLabel(name)}
							tabIndex={selected ? 0 : -1}
							onClick={() => onChange(name)}
							style={{
								display: 'inline-flex',
								alignItems: 'center',
								justifyContent: 'center',
								width: 34,
								height: 34,
								borderRadius: 8,
								border: `1px solid ${selected ? T.acc : T.bd}`,
								background: selected ? T.accSub : T.surf,
								color: selected ? T.acc : T.sub,
								cursor: 'pointer',
							}}
						>
							<Icon name={name} size={18} aria-hidden="true" />
						</button>
					);
				})}
			</div>
		</div>
	);
}

export function ConditionsStep({ draft, patch, issues, t }: SystemStepProps) {
	const conditions = draft.conditions;
	const setCondition = (index: number, next: SystemCondition) =>
		patch({ conditions: replaceAt([...conditions], index, next) });
	const claimed: string[] = [];
	conditions.forEach((_, i) => {
		claimed.push(
			`conditions.${i}.key`,
			`conditions.${i}.label`,
			`conditions.${i}.icon`,
			`conditions.${i}.defaultRounds`,
			`conditions.${i}.maxStacks`,
		);
	});
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
			<StepHeader
				title={t('systemBuilder.step.conditions')}
				help={t('systemBuilder.conditions.help')}
			/>
			<StepSection title={t('systemBuilder.conditions.section')}>
				<RowList
					empty={t('systemBuilder.conditions.empty')}
					addLabel={t('systemBuilder.conditions.add')}
					onAdd={() => patch({ conditions: [...conditions, newCondition(conditions)] })}
				>
					{conditions.map((condition, index) => (
						<RowCard
							key={index}
							title={condition.label || condition.key}
							removeLabel={t('systemBuilder.conditions.remove', { name: condition.label })}
							onRemove={() => patch({ conditions: removeAt([...conditions], index) })}
						>
							<FieldGrid>
								<TextField
									label={t('systemBuilder.field.label')}
									value={condition.label}
									path={`conditions.${index}.label`}
									issues={issues}
									t={t}
									maxLength={120}
									onChange={(next) => setCondition(index, { ...condition, label: next })}
								/>
								<TextField
									label={t('systemBuilder.field.key')}
									help={t('systemBuilder.field.keyHelp')}
									value={condition.key}
									path={`conditions.${index}.key`}
									issues={issues}
									t={t}
									maxLength={64}
									onChange={(next) => setCondition(index, { ...condition, key: next })}
								/>
								<Field label={t('systemBuilder.conditions.severityLabel')}>
									<Select
										value={condition.severity}
										options={SYSTEM_CONDITION_SEVERITIES.map((severity) => ({
											value: severity,
											label: t(SEVERITY_LABEL[severity]!),
										}))}
										onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
											setCondition(index, {
												...condition,
												severity: e.target.value as SystemCondition['severity'],
											})
										}
									/>
								</Field>
								<Field label={t('systemBuilder.conditions.durationLabel')}>
									<Select
										value={condition.defaultDuration}
										options={SYSTEM_CONDITION_DURATIONS.map((duration) => ({
											value: duration,
											label: t(DURATION_LABEL[duration]!),
										}))}
										onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
											setCondition(index, {
												...condition,
												defaultDuration: e.target.value as SystemCondition['defaultDuration'],
											})
										}
									/>
								</Field>
								{condition.defaultDuration === 'rounds' && (
									<NullableNumberField
										label={t('systemBuilder.conditions.rounds')}
										value={condition.defaultRounds}
										path={`conditions.${index}.defaultRounds`}
										issues={issues}
										t={t}
										onChange={(next) => setCondition(index, { ...condition, defaultRounds: next })}
									/>
								)}
								<NullableNumberField
									label={t('systemBuilder.conditions.maxStacks')}
									help={t('systemBuilder.conditions.maxStacksHelp')}
									value={condition.maxStacks}
									path={`conditions.${index}.maxStacks`}
									issues={issues}
									t={t}
									max={100}
									onChange={(next) => setCondition(index, { ...condition, maxStacks: next })}
								/>
							</FieldGrid>
							<IconPicker
								value={condition.icon}
								legend={t('systemBuilder.conditions.icon', {
									name: condition.label || condition.key,
								})}
								optionLabel={(name) => t('systemBuilder.conditions.iconOption', { name })}
								onChange={(next) => setCondition(index, { ...condition, icon: next })}
							/>
						</RowCard>
					))}
				</RowList>
			</StepSection>
			<StepIssues issues={issues} claimed={claimed} t={t} />
		</div>
	);
}
