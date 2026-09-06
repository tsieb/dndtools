import type { WidgetConfigControl, WidgetConfigField } from '@dndtools/core';
import { Field, Input, Select, Switch } from '../../ds';
import { T } from '../screen-kit';
import { DOCK_PREFERENCE_KEY, slugify } from './draft';
import {
	FieldGrid,
	RowCard,
	RowList,
	StepHeader,
	StepSection,
	issueFor,
	removeAt,
	replaceAt,
	type StepProps,
} from './fields';
import { CONTROLS, CONTROL_LABEL, FIELD_GROUP_LABEL } from './vocabulary';
import { useI18n, type MessageKey, type MessageValues } from '../../i18n';

type Translate = (key: MessageKey, values?: MessageValues) => string;

/**
 * Config fields — the settings a DM edits on a PLACED copy of the widget (RC-WID-2.1).
 *
 * These are declarations, not values: the scene Inspector renders one control per field from this
 * list and writes the result through `scene.configure-widget`, so every field added here is a real
 * control on every instance. `draft.ts` derives the widget's `configurationSchema` from them, which
 * is what the core validates a configuration against.
 *
 * RC-WID-2.3 adds the VALIDATION half of a field: a number's range and step, a text field's
 * placeholder, and the checks that catch a declaration which could never hold its own default (a
 * default outside the range, a select whose default names no choice). Those checks are raised HERE,
 * against the single field being edited, rather than through the draft's step-level issue list: they
 * are about one control, so the answer belongs on that control while it is being typed.
 *
 * The range is not decoration. `sceneEditor/fields.tsx` clamps a number the DM types to `min`/`max`
 * before it is committed, so what is declared here is what a placed copy will actually accept.
 */

const controlOptions = (t: Translate) =>
	CONTROLS.map((control) => ({ value: control, label: t(CONTROL_LABEL[control]) }));
const groupOptions = (t: Translate) =>
	(['content', 'display', 'style'] as const).map((value) => ({
		value,
		label: t(FIELD_GROUP_LABEL[value]),
	}));

function defaultFor(control: WidgetConfigControl): unknown {
	if (control === 'number') return 0;
	if (control === 'toggle') return false;
	if (control === 'color') return 'var(--color-accent)';
	return '';
}

function defaultAsText(value: unknown): string {
	if (value === undefined || value === null) return '';
	if (typeof value === 'string') return value;
	return String(value);
}

/**
 * What is wrong with ONE declared field, keyed by the control it belongs on. Every check is about a
 * declaration that contradicts itself, so it can be answered without the rest of the draft.
 */
export interface ConfigFieldProblems {
	range?: MessageKey;
	default?: MessageKey;
	choices?: MessageKey;
}

export function configFieldProblems(field: WidgetConfigField): ConfigFieldProblems {
	const problems: ConfigFieldProblems = {};
	if (field.control === 'number') {
		if (field.min !== undefined && field.max !== undefined && field.min > field.max) {
			problems.range = 'builder.config.rangeInverted';
		} else {
			const value = Number(field.default ?? 0);
			if (Number.isFinite(value)) {
				if (field.min !== undefined && value < field.min)
					problems.default = 'builder.config.defaultBelowMin';
				else if (field.max !== undefined && value > field.max)
					problems.default = 'builder.config.defaultAboveMax';
			}
		}
	}
	if (field.control === 'select') {
		const options = field.options ?? [];
		if (options.length === 0) problems.choices = 'builder.config.choicesEmpty';
		else if (!options.some((option) => option.value === String(field.default ?? '')))
			problems.default = 'builder.config.defaultNotAChoice';
	}
	return problems;
}

/** Read a number input, treating a cleared box as "not declared" rather than zero. */
function optionalNumber(raw: string): number | undefined {
	const trimmed = raw.trim();
	if (!trimmed) return undefined;
	const value = Number(trimmed);
	return Number.isFinite(value) ? value : undefined;
}

function numberAsText(value: number | undefined): string {
	return value === undefined ? '' : String(value);
}

export function ConfigStep({ draft, patch, issues }: StepProps) {
	const { t } = useI18n();
	const setField = (index: number, next: WidgetConfigField) =>
		patch({ configFields: replaceAt(draft.configFields, index, next) });

	const addField = () => {
		let index = draft.configFields.length + 1;
		while (draft.configFields.some((field) => field.key === `setting${index}`)) index += 1;
		patch({
			configFields: [
				...draft.configFields,
				{
					key: `setting${index}`,
					// A seed the DM immediately renames. It is written into the built package, so like
					// every other stored label it stays in the source language rather than the UI's.
					label: `Setting ${index}`,
					control: 'text',
					group: 'content',
					default: '',
				},
			],
		});
	};

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
			<StepHeader title={t('builder.step.config')} help={t('builder.config.help')} />
			<StepSection title={t('builder.config.fields')}>
				{issueFor(issues, 'configFields', t) && (
					<span style={{ font: `12px ${T.sans}`, color: T.err }}>
						{issueFor(issues, 'configFields', t)}
					</span>
				)}
				<RowList
					empty={t('builder.config.empty')}
					addLabel={t('builder.config.addField')}
					onAdd={addField}
				>
					{draft.configFields.map((field, index) => {
						const problems = configFieldProblems(field);
						return (
							<RowCard
								key={`config-${index}`}
								title={field.label || field.key}
								removeLabel={t('builder.config.removeField', { name: field.label || field.key })}
								onRemove={() => patch({ configFields: removeAt(draft.configFields, index) })}
							>
								<FieldGrid>
									<Field label={t('builder.config.label')}>
										<Input
											value={field.label}
											onChange={(e: { target: { value: string } }) =>
												setField(index, { ...field, label: e.target.value })
											}
										/>
									</Field>
									<Field
										label={t('builder.config.key')}
										error={
											field.key === DOCK_PREFERENCE_KEY
												? t('builder.config.reservedKey')
												: undefined
										}
									>
										<Input
											value={field.key}
											onChange={(e: { target: { value: string } }) =>
												setField(index, { ...field, key: slugify(e.target.value) })
											}
										/>
									</Field>
									<Field label={t('builder.config.control')}>
										<Select
											value={field.control}
											options={controlOptions(t)}
											onChange={(e: { target: { value: string } }) => {
												const control = e.target.value as WidgetConfigControl;
												setField(index, { ...field, control, default: defaultFor(control) });
											}}
										/>
									</Field>
									<Field label={t('builder.config.group')}>
										<Select
											value={field.group ?? 'content'}
											options={groupOptions(t)}
											onChange={(e: { target: { value: string } }) =>
												setField(index, {
													...field,
													group: e.target.value as WidgetConfigField['group'],
												})
											}
										/>
									</Field>
								</FieldGrid>
								{field.control === 'toggle' ? (
									<Switch
										checked={field.default === true}
										label={t('builder.config.startsOn')}
										onChange={(next: boolean) => setField(index, { ...field, default: next })}
									/>
								) : (
									<Field
										label={t('builder.config.defaultValue')}
										error={problems.default ? t(problems.default) : undefined}
									>
										<Input
											value={defaultAsText(field.default)}
											onChange={(e: { target: { value: string } }) => {
												const raw = e.target.value;
												setField(index, {
													...field,
													default:
														field.control === 'number'
															? Number.isFinite(Number(raw))
																? Number(raw)
																: 0
															: raw,
												});
											}}
										/>
									</Field>
								)}
								{field.control === 'number' && (
									<FieldGrid columns={3}>
										<Field
											label={t('builder.config.min')}
											error={problems.range ? t(problems.range) : undefined}
										>
											<Input
												type="number"
												value={numberAsText(field.min)}
												placeholder={t('builder.config.unset')}
												onChange={(e: { target: { value: string } }) =>
													setField(index, { ...field, min: optionalNumber(e.target.value) })
												}
											/>
										</Field>
										<Field label={t('builder.config.max')}>
											<Input
												type="number"
												value={numberAsText(field.max)}
												placeholder={t('builder.config.unset')}
												onChange={(e: { target: { value: string } }) =>
													setField(index, { ...field, max: optionalNumber(e.target.value) })
												}
											/>
										</Field>
										<Field label={t('builder.config.step')} help={t('builder.config.stepHelp')}>
											<Input
												type="number"
												value={numberAsText(field.step)}
												placeholder={t('builder.config.unset')}
												onChange={(e: { target: { value: string } }) =>
													setField(index, { ...field, step: optionalNumber(e.target.value) })
												}
											/>
										</Field>
									</FieldGrid>
								)}
								{(field.control === 'text' || field.control === 'textarea') && (
									<Field
										label={t('builder.config.placeholder')}
										help={t('builder.config.placeholderHelp')}
									>
										<Input
											value={field.placeholder ?? ''}
											onChange={(e: { target: { value: string } }) =>
												setField(index, { ...field, placeholder: e.target.value || undefined })
											}
										/>
									</Field>
								)}
								<Field label={t('builder.config.helpText')} help={t('builder.config.helpTextHelp')}>
									<Input
										value={field.help ?? ''}
										onChange={(e: { target: { value: string } }) =>
											setField(index, { ...field, help: e.target.value || undefined })
										}
									/>
								</Field>
								{field.control === 'select' && (
									<Field
										label={t('builder.config.choices')}
										help={t('builder.config.choicesHelp')}
										error={problems.choices ? t(problems.choices) : undefined}
									>
										<Input
											value={(field.options ?? []).map((o) => `${o.value}=${o.label}`).join(', ')}
											placeholder={t('builder.config.choicesPlaceholder')}
											onChange={(e: { target: { value: string } }) =>
												setField(index, {
													...field,
													options: e.target.value
														.split(',')
														.map((part) => part.trim())
														.filter(Boolean)
														.map((part) => {
															const [value, label] = part.split('=');
															return {
																value: (value ?? '').trim(),
																label: (label ?? value ?? '').trim(),
															};
														}),
												})
											}
										/>
									</Field>
								)}
							</RowCard>
						);
					})}
				</RowList>
			</StepSection>
		</div>
	);
}
