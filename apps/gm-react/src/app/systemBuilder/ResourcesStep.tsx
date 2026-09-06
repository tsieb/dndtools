import type { SystemResource } from '@dndtools/core';
import { SYSTEM_RECOVERIES, SYSTEM_RESOURCE_KINDS, FORMULA_FUNCTION_NAMES } from '@dndtools/core';
import { Field, Select } from '../../ds';
import { T } from '../screen-kit';
import {
	FieldGrid,
	RowCard,
	RowList,
	StepHeader,
	StepSection,
	removeAt,
	replaceAt,
} from '../widgetBuilder/fields';
import {
	PREVIEW_ABILITY_MODIFIER,
	PREVIEW_ABILITY_SCORE,
	RESOURCE_FORMULA_IDENTIFIERS,
	newResource,
	previewFormula,
} from './draft';
import { StepIssues, TextField, type SystemStepProps, type Translate } from './ui';
import type { MessageKey } from '../../i18n';

/**
 * Step 3 — resources, with the formula grammar helper and the live evaluation preview
 * (RC-SYS-3.3).
 *
 * A resource's maximum is a FORMULA, and a formula that only fails at render time is the exact
 * thing this stepper exists to prevent. So every keystroke is evaluated through the core's own
 * `evaluateFormula` at levels 1, 5, 10 and 20 against one sample character, and the row prints
 * either four numbers or the evaluator's own complaint. The preview is honest about being a sample:
 * its caption names the score, modifier and proficiency it bound.
 */

const KIND_LABEL: Record<string, MessageKey> = {
	pool: 'systemBuilder.resources.kind.pool',
	slots: 'systemBuilder.resources.kind.slots',
	dice: 'systemBuilder.resources.kind.dice',
	clock: 'systemBuilder.resources.kind.clock',
	track: 'systemBuilder.resources.kind.track',
};

const RECOVERY_LABEL: Record<string, MessageKey> = {
	short: 'systemBuilder.resources.recovery.short',
	long: 'systemBuilder.resources.recovery.long',
	scene: 'systemBuilder.resources.recovery.scene',
	never: 'systemBuilder.resources.recovery.never',
};

/** The four evaluated maxima, or the evaluator's reason for refusing. */
function FormulaPreview({ formula, t }: { formula: string; t: Translate }) {
	const rows = previewFormula(formula);
	const failure = rows.find((row) => row.message !== null);
	return (
		<div
			role="status"
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: 6,
				padding: '9px 11px',
				borderRadius: 9,
				border: `1px solid ${failure ? T.bdS : T.accBd}`,
				background: failure ? T.sunken : T.accSub,
			}}
		>
			<span style={{ font: `600 11.5px ${T.sans}`, color: T.sub }}>
				{t('systemBuilder.resources.previewTitle')}
			</span>
			{failure ? (
				<span style={{ font: `12px/1.5 ${T.sans}`, color: T.ink }}>{failure.message}</span>
			) : (
				<div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
					{rows.map((row) => (
						<span key={row.level} style={{ font: `12px ${T.sans}`, color: T.ink }}>
							{t('systemBuilder.resources.previewLevel', { level: row.level })}{' '}
							<strong style={{ font: `600 13px ${T.mono}` }}>{row.value}</strong>
						</span>
					))}
				</div>
			)}
			<span style={{ font: `11.5px/1.5 ${T.sans}`, color: T.ter }}>
				{t('systemBuilder.resources.previewCaption', {
					score: PREVIEW_ABILITY_SCORE,
					modifier: PREVIEW_ABILITY_MODIFIER,
				})}
			</span>
		</div>
	);
}

export function ResourcesStep({ draft, patch, issues, t }: SystemStepProps) {
	const resources = draft.resources;
	const setResource = (index: number, next: SystemResource) =>
		patch({ resources: replaceAt([...resources], index, next) });
	const claimed: string[] = [];
	resources.forEach((_, i) => {
		claimed.push(
			`resources.${i}.key`,
			`resources.${i}.label`,
			`resources.${i}.maxFormula`,
			`resources.${i}.diceNotation`,
		);
	});
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
			<StepHeader
				title={t('systemBuilder.step.resources')}
				help={t('systemBuilder.resources.help')}
			/>
			<StepSection title={t('systemBuilder.resources.grammar')}>
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						gap: 6,
						padding: '10px 12px',
						borderRadius: 9,
						border: `1px solid ${T.bd}`,
						background: T.sunken,
						font: `12px/1.6 ${T.sans}`,
						color: T.sub,
					}}
				>
					<span>
						{t('systemBuilder.resources.grammarIdentifiers')}{' '}
						<code style={{ font: `11.5px ${T.mono}`, color: T.ink }}>
							{RESOURCE_FORMULA_IDENTIFIERS.join(', ')}
						</code>
					</span>
					<span>
						{t('systemBuilder.resources.grammarFunctions')}{' '}
						<code style={{ font: `11.5px ${T.mono}`, color: T.ink }}>
							{FORMULA_FUNCTION_NAMES.join(', ')}
						</code>
					</span>
					<span>{t('systemBuilder.resources.grammarExample')}</span>
				</div>
			</StepSection>
			<StepSection title={t('systemBuilder.resources.section')}>
				<RowList
					empty={t('systemBuilder.resources.empty')}
					addLabel={t('systemBuilder.resources.add')}
					onAdd={() => patch({ resources: [...resources, newResource(resources)] })}
				>
					{resources.map((resource, index) => (
						<RowCard
							key={index}
							title={resource.label || resource.key}
							removeLabel={t('systemBuilder.resources.remove', { name: resource.label })}
							onRemove={() => patch({ resources: removeAt([...resources], index) })}
						>
							<FieldGrid>
								<TextField
									label={t('systemBuilder.field.label')}
									value={resource.label}
									path={`resources.${index}.label`}
									issues={issues}
									t={t}
									maxLength={120}
									onChange={(next) => setResource(index, { ...resource, label: next })}
								/>
								<TextField
									label={t('systemBuilder.field.key')}
									help={t('systemBuilder.field.keyHelp')}
									value={resource.key}
									path={`resources.${index}.key`}
									issues={issues}
									t={t}
									maxLength={64}
									onChange={(next) => setResource(index, { ...resource, key: next })}
								/>
								<Field label={t('systemBuilder.resources.kindLabel')}>
									<Select
										value={resource.kind}
										options={SYSTEM_RESOURCE_KINDS.map((kind) => ({
											value: kind,
											label: t(KIND_LABEL[kind]!),
										}))}
										onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
											setResource(index, {
												...resource,
												kind: e.target.value as SystemResource['kind'],
											})
										}
									/>
								</Field>
								<Field label={t('systemBuilder.resources.recoveryLabel')}>
									<Select
										value={resource.recovery}
										options={SYSTEM_RECOVERIES.map((recovery) => ({
											value: recovery,
											label: t(RECOVERY_LABEL[recovery]!),
										}))}
										onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
											setResource(index, {
												...resource,
												recovery: e.target.value as SystemResource['recovery'],
											})
										}
									/>
								</Field>
							</FieldGrid>
							<TextField
								label={t('systemBuilder.resources.maxFormula')}
								help={t('systemBuilder.resources.maxFormulaHelp')}
								value={resource.maxFormula ?? ''}
								path={`resources.${index}.maxFormula`}
								issues={issues}
								t={t}
								placeholder={t('systemBuilder.resources.maxFormulaPlaceholder')}
								onChange={(next) =>
									setResource(index, {
										...resource,
										maxFormula: next.trim() === '' ? null : next,
									})
								}
							/>
							{resource.maxFormula !== null && (
								<FormulaPreview formula={resource.maxFormula} t={t} />
							)}
							{resource.kind === 'dice' && (
								<TextField
									label={t('systemBuilder.resources.diceNotation')}
									help={t('systemBuilder.resources.diceNotationHelp')}
									value={resource.diceNotation ?? ''}
									path={`resources.${index}.diceNotation`}
									issues={issues}
									t={t}
									maxLength={32}
									onChange={(next) =>
										setResource(index, {
											...resource,
											diceNotation: next.trim() === '' ? null : next,
										})
									}
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
