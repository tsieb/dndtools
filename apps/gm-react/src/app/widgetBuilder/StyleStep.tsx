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

/**
 * Style — the `--widget-*` tokens this widget exposes, and how isolated its styling is
 * (RC-WID-2.1).
 *
 * Values are picked from the app's SEMANTIC tokens rather than typed as hex, so a widget re-themes
 * with `data-theme` instead of freezing one palette into a package. A widget that genuinely needs
 * its own colour space declares the `custom-stylesheet` capability and ships one — RC-WID-2.4
 * carries that further.
 */

const ISOLATION_OPTIONS = (Object.keys(ISOLATION_LABEL) as WidgetStyleIsolation[]).map((value) => ({
	value,
	label: ISOLATION_LABEL[value],
}));

export function StyleStep({ draft, patch, issues }: StepProps) {
	const allowsRawValue = draft.styleCapabilities.includes('custom-stylesheet');
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
			<StepHeader
				title="Style"
				help="Declare the colours this widget exposes. They appear in the Inspector's Style group and follow the active theme."
			/>
			<StepSection
				title="Tokens"
				help="Each token becomes a --widget- variable the renderer can use."
			>
				{issueFor(issues, 'styleTokens') && (
					<span style={{ font: `12px ${T.sans}`, color: T.err }}>
						{issueFor(issues, 'styleTokens')}
					</span>
				)}
				<RowList
					empty="No style tokens. The widget inherits the app theme as it is."
					addLabel="Add style token"
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
							removeLabel={`Remove style token ${token.name}`}
							onRemove={() => patch({ styleTokens: removeAt(draft.styleTokens, index) })}
						>
							<FieldGrid>
								<Field label="Name" help="Exposed as --widget-<name>.">
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
								<Field label="Value">
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
											options={SEMANTIC_TOKEN_VALUES}
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
							<Field label="Description" help="What this colour is for.">
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
						Values come from the app's semantic tokens. Turn on Custom stylesheet below to type your
						own.
					</span>
				)}
			</StepSection>
			<StepSection title="Isolation and capabilities">
				<Field label="Isolation" help="How separate this widget's styling is from the app's.">
					<Select
						value={draft.styleIsolation}
						options={ISOLATION_OPTIONS}
						onChange={(e: { target: { value: string } }) =>
							patch({ styleIsolation: e.target.value as WidgetStyleIsolation })
						}
					/>
				</Field>
				<ToggleGroup legend="Style capabilities">
					{STYLE_CAPABILITIES.map((capability) => (
						<Checkbox
							key={capability}
							checked={draft.styleCapabilities.includes(capability)}
							label={STYLE_CAPABILITY_LABEL[capability]}
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
