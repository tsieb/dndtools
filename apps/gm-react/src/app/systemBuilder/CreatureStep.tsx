import type { SystemCreatureField } from '@dndtools/core';
import { SYSTEM_FIELD_TYPES } from '@dndtools/core';
import { Checkbox, Field, Select } from '../../ds';
import {
	FieldGrid,
	RowCard,
	RowList,
	StepHeader,
	StepSection,
	removeAt,
	replaceAt,
} from '../widgetBuilder/fields';
import { newCreatureField } from './draft';
import { CommaListField, StepIssues, TextField, type SystemStepProps } from './ui';
import type { MessageKey } from '../../i18n';

/**
 * Step 6 — the creature schema (RC-SYS-3.3).
 *
 * This is what a statblock in this system has to carry, and RC-SYS-2.5 made the compendium import
 * map into it: a field declared here is a field an imported monster can hold, and a 5e monster
 * arriving at a package that cannot hold it is refused with a field report rather than silently
 * flattened. So the list is short on purpose — declare what the system actually needs.
 */

const TYPE_LABEL: Record<string, MessageKey> = {
	string: 'systemBuilder.creature.type.string',
	text: 'systemBuilder.creature.type.text',
	number: 'systemBuilder.creature.type.number',
	boolean: 'systemBuilder.creature.type.boolean',
	enum: 'systemBuilder.creature.type.enum',
};

export function CreatureStep({ draft, patch, issues, t }: SystemStepProps) {
	const fields = draft.creatureSchema;
	const setField = (index: number, next: SystemCreatureField) =>
		patch({ creatureSchema: replaceAt([...fields], index, next) });
	const claimed: string[] = [];
	fields.forEach((_, i) => {
		claimed.push(
			`creatureSchema.${i}.key`,
			`creatureSchema.${i}.label`,
			`creatureSchema.${i}.options`,
		);
	});
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
			<StepHeader
				title={t('systemBuilder.step.creature')}
				help={t('systemBuilder.creature.help')}
			/>
			<StepSection title={t('systemBuilder.creature.section')}>
				<RowList
					empty={t('systemBuilder.creature.empty')}
					addLabel={t('systemBuilder.creature.add')}
					onAdd={() => patch({ creatureSchema: [...fields, newCreatureField(fields)] })}
				>
					{fields.map((field, index) => (
						<RowCard
							key={index}
							title={field.label || field.key}
							removeLabel={t('systemBuilder.creature.remove', { name: field.label })}
							onRemove={() => patch({ creatureSchema: removeAt([...fields], index) })}
						>
							<FieldGrid>
								<TextField
									label={t('systemBuilder.field.label')}
									value={field.label}
									path={`creatureSchema.${index}.label`}
									issues={issues}
									t={t}
									maxLength={120}
									onChange={(next) => setField(index, { ...field, label: next })}
								/>
								<TextField
									label={t('systemBuilder.field.key')}
									help={t('systemBuilder.field.keyHelp')}
									value={field.key}
									path={`creatureSchema.${index}.key`}
									issues={issues}
									t={t}
									maxLength={64}
									onChange={(next) => setField(index, { ...field, key: next })}
								/>
								<Field label={t('systemBuilder.creature.typeLabel')}>
									<Select
										value={field.type}
										options={SYSTEM_FIELD_TYPES.map((type) => ({
											value: type,
											label: t(TYPE_LABEL[type]!),
										}))}
										onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
											const type = e.target.value as SystemCreatureField['type'];
											setField(index, {
												...field,
												type,
												options: type === 'enum' ? (field.options ?? ['']) : null,
											});
										}}
									/>
								</Field>
								<Field label={t('systemBuilder.creature.requiredLabel')}>
									<Checkbox
										checked={field.required}
										label={t('systemBuilder.creature.required')}
										onChange={(next: boolean) => setField(index, { ...field, required: next })}
									/>
								</Field>
							</FieldGrid>
							{field.type === 'enum' && (
								<CommaListField
									label={t('systemBuilder.creature.options')}
									help={t('systemBuilder.creature.optionsHelp')}
									value={field.options ?? []}
									path={`creatureSchema.${index}.options`}
									issues={issues}
									t={t}
									onCommit={(next) => setField(index, { ...field, options: next })}
								/>
							)}
						</RowCard>
					))}
				</RowList>
			</StepSection>
			<StepIssues issues={issues} claimed={claimed} t={t} />
		</div>
	);
}
