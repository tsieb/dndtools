import type { SystemAttribute, SystemSkill } from '@dndtools/core';
import { Field, Select } from '../../ds';
import {
	FieldGrid,
	RowCard,
	RowList,
	StepHeader,
	StepSection,
	removeAt,
	replaceAt,
} from '../widgetBuilder/fields';
import { issuesForPath, newAttribute, newSkill } from './draft';
import { StepIssues, TextField, type SystemStepProps } from './ui';

/**
 * Step 2 — attributes, and the skills that key off them (RC-SYS-3.3).
 *
 * Skills live here rather than in a step of their own because a skill naming an attribute the
 * package does not declare is a rejection from `systemPackageSchema` itself: deleting the attribute
 * and fixing the skills that pointed at it is one edit, so it is one screen.
 *
 * A derivation is the modifier a score produces (5e's `(score - 10) / 2`); its formula may read
 * `score` and nothing else, which is what the helper line under the box says.
 */
export function AttributesStep({ draft, patch, issues, t }: SystemStepProps) {
	const attributes = draft.attributes;
	const skills = draft.skills;
	const setAttribute = (index: number, next: SystemAttribute) =>
		patch({ attributes: replaceAt([...attributes], index, next) });
	const setSkill = (index: number, next: SystemSkill) =>
		patch({ skills: replaceAt([...skills], index, next) });
	const claimed: string[] = [];
	attributes.forEach((_, i) => {
		claimed.push(
			`attributes.${i}.key`,
			`attributes.${i}.label`,
			`attributes.${i}.abbreviation`,
			`attributes.${i}.derivation.formula`,
		);
	});
	skills.forEach((_, i) => {
		claimed.push(`skills.${i}.key`, `skills.${i}.label`, `skills.${i}.attribute`);
	});
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
			<StepHeader
				title={t('systemBuilder.step.attributes')}
				help={t('systemBuilder.attributes.help')}
			/>
			<StepSection title={t('systemBuilder.attributes.section')}>
				<RowList
					empty={t('systemBuilder.attributes.empty')}
					addLabel={t('systemBuilder.attributes.add')}
					onAdd={() => patch({ attributes: [...attributes, newAttribute(attributes)] })}
				>
					{attributes.map((attribute, index) => (
						<RowCard
							key={index}
							title={attribute.label || attribute.key}
							removeLabel={t('systemBuilder.attributes.remove', { name: attribute.label })}
							onRemove={() => patch({ attributes: removeAt([...attributes], index) })}
						>
							<FieldGrid>
								<TextField
									label={t('systemBuilder.field.label')}
									value={attribute.label}
									path={`attributes.${index}.label`}
									issues={issues}
									t={t}
									maxLength={120}
									onChange={(next) => setAttribute(index, { ...attribute, label: next })}
								/>
								<TextField
									label={t('systemBuilder.field.key')}
									help={t('systemBuilder.field.keyHelp')}
									value={attribute.key}
									path={`attributes.${index}.key`}
									issues={issues}
									t={t}
									maxLength={64}
									onChange={(next) => setAttribute(index, { ...attribute, key: next })}
								/>
								<TextField
									label={t('systemBuilder.attributes.abbreviation')}
									value={attribute.abbreviation}
									path={`attributes.${index}.abbreviation`}
									issues={issues}
									t={t}
									maxLength={8}
									onChange={(next) => setAttribute(index, { ...attribute, abbreviation: next })}
								/>
								<Field label={t('systemBuilder.attributes.derivation')}>
									<Select
										value={attribute.derivation.kind}
										options={[
											{ value: 'none', label: t('systemBuilder.attributes.derivationNone') },
											{
												value: 'modifier',
												label: t('systemBuilder.attributes.derivationModifier'),
											},
										]}
										onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
											setAttribute(index, {
												...attribute,
												derivation:
													e.target.value === 'modifier'
														? {
																kind: 'modifier',
																formula:
																	attribute.derivation.kind === 'modifier'
																		? attribute.derivation.formula
																		: 'floor((score - 10) / 2)',
															}
														: { kind: 'none' },
											})
										}
									/>
								</Field>
							</FieldGrid>
							{attribute.derivation.kind === 'modifier' && (
								<TextField
									label={t('systemBuilder.attributes.formula')}
									help={t('systemBuilder.attributes.formulaHelp')}
									value={attribute.derivation.formula}
									path={`attributes.${index}.derivation.formula`}
									issues={issues}
									t={t}
									onChange={(next) =>
										setAttribute(index, {
											...attribute,
											derivation: { kind: 'modifier', formula: next },
										})
									}
								/>
							)}
						</RowCard>
					))}
				</RowList>
			</StepSection>
			<StepSection
				title={t('systemBuilder.skills.section')}
				help={t('systemBuilder.skills.sectionHelp')}
			>
				<RowList
					empty={t('systemBuilder.skills.empty')}
					addLabel={t('systemBuilder.skills.add')}
					onAdd={() => patch({ skills: [...skills, newSkill(skills)] })}
				>
					{skills.map((skill, index) => (
						<RowCard
							key={index}
							title={skill.label || skill.key}
							removeLabel={t('systemBuilder.skills.remove', { name: skill.label })}
							onRemove={() => patch({ skills: removeAt([...skills], index) })}
						>
							<FieldGrid>
								<TextField
									label={t('systemBuilder.field.label')}
									value={skill.label}
									path={`skills.${index}.label`}
									issues={issues}
									t={t}
									maxLength={120}
									onChange={(next) => setSkill(index, { ...skill, label: next })}
								/>
								<TextField
									label={t('systemBuilder.field.key')}
									value={skill.key}
									path={`skills.${index}.key`}
									issues={issues}
									t={t}
									maxLength={64}
									onChange={(next) => setSkill(index, { ...skill, key: next })}
								/>
								<Field
									label={t('systemBuilder.skills.attribute')}
									error={issuesForPath(issues, `skills.${index}.attribute`, t)}
								>
									<Select
										value={skill.attribute ?? ''}
										options={[
											{ value: '', label: t('systemBuilder.skills.noAttribute') },
											...attributes.map((attribute) => ({
												value: attribute.key,
												label: attribute.label || attribute.key,
											})),
										]}
										onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
											setSkill(index, {
												...skill,
												attribute: e.target.value === '' ? null : e.target.value,
											})
										}
									/>
								</Field>
							</FieldGrid>
						</RowCard>
					))}
				</RowList>
			</StepSection>
			<StepIssues issues={issues} claimed={claimed} t={t} />
		</div>
	);
}
