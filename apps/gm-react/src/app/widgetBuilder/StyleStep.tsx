import type { WidgetStyleCapability, WidgetStyleIsolation } from '@dndtools/core';
import { Checkbox, Field, Input, Select } from '../../ds';
import { T } from '../screen-kit';
import { slugify } from './draft';
import {
	FieldGrid,
	RowCard,
	RowList,
	StepHeader,
	StepSection,
	ToggleGroup,
	issueFor,
	removeAt,
	replaceAt,
	type StepProps,
} from './fields';
import {
	ISOLATION_LABEL,
	SEMANTIC_TOKEN_VALUES,
	STYLE_CAPABILITIES,
	STYLE_CAPABILITY_LABEL,
} from './vocabulary';
import { useI18n, type MessageKey, type MessageValues } from '../../i18n';

type Translate = (key: MessageKey, values?: MessageValues) => string;

/**
 * Style — the `--widget-*` tokens this widget exposes, and how isolated its styling is
 * (RC-WID-2.1).
 *
 * Values are picked from the app's SEMANTIC tokens rather than typed as hex, so a widget re-themes
 * with `data-theme` instead of freezing one palette into a package. A widget that genuinely needs
 * its own colour space declares the `custom-stylesheet` capability and ships one — RC-WID-2.4
 * carries that further.
 */

const isolationOptions = (t: Translate) =>
	(Object.keys(ISOLATION_LABEL) as WidgetStyleIsolation[]).map((value) => ({
		value,
		label: t(ISOLATION_LABEL[value]),
	}));

const tokenValueOptions = (t: Translate) =>
	SEMANTIC_TOKEN_VALUES.map((option) => ({ value: option.value, label: t(option.label) }));

export function StyleStep({ draft, patch, issues }: StepProps) {
	const { t } = useI18n();
	const allowsRawValue = draft.styleCapabilities.includes('custom-stylesheet');
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
			<StepHeader title={t('builder.style.title')} help={t('builder.style.help')} />
			<StepSection title={t('builder.style.tokens')} help={t('builder.style.tokensHelp')}>
				{issueFor(issues, 'styleTokens', t) && (
					<span style={{ font: `12px ${T.sans}`, color: T.err }}>
						{issueFor(issues, 'styleTokens', t)}
					</span>
				)}
				<RowList
					empty={t('builder.style.noTokens')}
					addLabel={t('builder.style.addToken')}
					onAdd={() =>
						patch({
							styleTokens: [
								...draft.styleTokens,
								{
									name: `accent-${draft.styleTokens.length + 1}`,
									value: SEMANTIC_TOKEN_VALUES[0]?.value ?? 'var(--color-accent)',
								},
							],
						})
					}
				>
					{draft.styleTokens.map((token, index) => (
						<RowCard
							key={`token-${index}`}
							title={`--widget-${token.name}`}
							removeLabel={t('builder.style.removeToken', { name: token.name })}
							onRemove={() => patch({ styleTokens: removeAt(draft.styleTokens, index) })}
						>
							<FieldGrid>
								<Field label={t('builder.style.name')} help={t('builder.style.nameHelp')}>
									<Input
										value={token.name}
										onChange={(e: { target: { value: string } }) =>
											patch({
												styleTokens: replaceAt(draft.styleTokens, index, {
													...token,
													name: slugify(e.target.value),
												}),
											})
										}
									/>
								</Field>
								<Field label={t('builder.style.value')}>
									{allowsRawValue &&
									!SEMANTIC_TOKEN_VALUES.some((option) => option.value === token.value) ? (
										<Input
											value={token.value}
											onChange={(e: { target: { value: string } }) =>
												patch({
													styleTokens: replaceAt(draft.styleTokens, index, {
														...token,
														value: e.target.value,
													}),
												})
											}
										/>
									) : (
										<Select
											value={token.value}
											options={tokenValueOptions(t)}
											onChange={(e: { target: { value: string } }) =>
												patch({
													styleTokens: replaceAt(draft.styleTokens, index, {
														...token,
														value: e.target.value,
													}),
												})
											}
										/>
									)}
								</Field>
							</FieldGrid>
							<Field
								label={t('builder.style.description')}
								help={t('builder.style.descriptionHelp')}
							>
								<Input
									value={token.description ?? ''}
									onChange={(e: { target: { value: string } }) =>
										patch({
											styleTokens: replaceAt(draft.styleTokens, index, {
												...token,
												description: e.target.value || undefined,
											}),
										})
									}
								/>
							</Field>
						</RowCard>
					))}
				</RowList>
				{!allowsRawValue && (
					<span style={{ font: `12px/1.5 ${T.sans}`, color: T.ter }}>
						{t('builder.style.semanticOnly')}
					</span>
				)}
			</StepSection>
			<StepSection title={t('builder.style.isolationTitle')}>
				<Field label={t('builder.style.isolation')} help={t('builder.style.isolationHelp')}>
					<Select
						value={draft.styleIsolation}
						options={isolationOptions(t)}
						onChange={(e: { target: { value: string } }) =>
							patch({ styleIsolation: e.target.value as WidgetStyleIsolation })
						}
					/>
				</Field>
				<ToggleGroup legend={t('builder.style.capabilities')}>
					{STYLE_CAPABILITIES.map((capability) => (
						<Checkbox
							key={capability}
							checked={draft.styleCapabilities.includes(capability)}
							label={t(STYLE_CAPABILITY_LABEL[capability])}
							onChange={() =>
								patch({
									styleCapabilities: draft.styleCapabilities.includes(capability)
										? draft.styleCapabilities.filter(
												(entry: WidgetStyleCapability) => entry !== capability,
											)
										: [...draft.styleCapabilities, capability],
								})
							}
						/>
					))}
				</ToggleGroup>
			</StepSection>
		</div>
	);
}
