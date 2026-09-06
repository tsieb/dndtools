import {
	WIDGET_QUERY_COLUMNS,
	isValidFormula,
	widgetFormulaIdentifiers,
	widgetQueryFormulaIdentifier,
	type WidgetBindingDefinition,
	type WidgetComputedFieldDefinition,
	type WidgetDataQueryDefinition,
	type WidgetDataQuerySource,
	type WidgetTemplateKind,
} from '@dndtools/core';
import { Checkbox, Field, Input, Select } from '../../ds';
import { T } from '../screen-kit';
import { BindingRows, nextBindingId } from './DataStepBindings';
import { slugify } from './draft';
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
import {
	AUDIENCE_LABEL,
	CAPABILITY_LABEL,
	QUERY_SOURCES,
	QUERY_SOURCE_LABEL,
	TEMPLATE_HELP,
	TEMPLATE_KINDS,
	TEMPLATE_LABEL,
} from './vocabulary';
import { useI18n, type MessageKey, type MessageValues } from '../../i18n';

type Translate = (key: MessageKey, values?: MessageValues) => string;

/**
 * Data — which template kind draws the widget, what it draws FROM, and what it works out from that
 * (RC-WID-2.1, extended by RC-WID-2.2).
 *
 * Three declarations, in the order an author thinks about them:
 *
 * - BINDINGS are the entities a placed copy is pointed at. Required ones make the widget refuse to
 *   draw until the DM binds it; optional ones are extra. Each names the entity types it accepts and
 *   the MODE it wants them in, which is what decides whether a viewer may fire its commands.
 * - DATA QUERIES name one of the core's actor-filtered sources plus the audience they are for. A
 *   query is a declaration, not a fetch: `app/widgets/dataEnvironment.ts` resolves it per viewer at
 *   render time, so a `DM only` query yields no rows at all to a player and the template says so
 *   rather than looking empty. That is why the audience picker matters more than it looks — and why
 *   the preview's "Preview as player" is the control to check it with.
 * - COMPUTED FIELDS reduce those queries to one value. Left automatic, each value type has a
 *   declared reduction. Given a formula, it is the SYS-1.1 declarative grammar over the four
 *   aggregate columns every query exposes — arithmetic and nothing else: no property access, no way
 *   to name an individual row, no call into the host. A withheld query contributes zeroes, so a
 *   player's total can never be derived from rows they never received.
 */

const templateOptions = (t: Translate) =>
	TEMPLATE_KINDS.map((kind) => ({ value: kind, label: t(TEMPLATE_LABEL[kind]) }));
const sourceOptions = (t: Translate) =>
	QUERY_SOURCES.map((source) => ({ value: source, label: t(QUERY_SOURCE_LABEL[source]) }));
const audienceOptions = (t: Translate) =>
	(['dm', 'shared', 'players'] as const).map((value) => ({
		value,
		label: t(AUDIENCE_LABEL[value]),
	}));
const capabilityOptions = (t: Translate) =>
	(['viewer', 'operator', 'manager'] as const).map((value) => ({
		value,
		label: t(CAPABILITY_LABEL[value]),
	}));
// The five value types are schema words, not copy: they name the JSON type the field carries and
// read the same in every locale.
const VALUE_TYPE_OPTIONS = (['number', 'string', 'boolean', 'array', 'object'] as const).map(
	(value) => ({ value, label: value }),
);

/** What each aggregate column means, so the formula reference does not need a manual. */
const COLUMN_HELP: Record<(typeof WIDGET_QUERY_COLUMNS)[number], MessageKey> = {
	count: 'builder.column.count',
	sum: 'builder.column.sum',
	max: 'builder.column.max',
	active: 'builder.column.active',
};

function nextQueryId(queries: WidgetDataQueryDefinition[], source: WidgetDataQuerySource): string {
	const base = source;
	if (!queries.some((query) => query.id === base)) return base;
	let index = 2;
	while (queries.some((query) => query.id === `${base}-${index}`)) index += 1;
	return `${base}-${index}`;
}

export function DataStep({ draft, patch, issues }: StepProps) {
	const { t } = useI18n();
	const setQuery = (index: number, next: WidgetDataQueryDefinition) =>
		patch({ dataQueries: replaceAt(draft.dataQueries, index, next) });
	const setComputed = (index: number, next: WidgetComputedFieldDefinition) =>
		patch({ computedFields: replaceAt(draft.computedFields, index, next) });

	const allBindings = [...draft.requiredBindings, ...draft.optionalBindings];
	const identifiers = widgetFormulaIdentifiers(draft.dataQueries);

	// The seed labels below are written into the built package, so like every other stored label
	// they stay in the source language until the author renames them.
	const newBinding = (): WidgetBindingDefinition => ({
		id: nextBindingId(draft),
		label: 'Bound entity',
		entityTypes: ['character'],
		mode: 'read',
		requiredCapability: 'viewer',
	});

	const addQuery = () => {
		const source: WidgetDataQuerySource = 'current-combatants';
		patch({
			dataQueries: [
				...draft.dataQueries,
				{
					id: nextQueryId(draft.dataQueries, source),
					label: t(QUERY_SOURCE_LABEL[source]),
					source,
					requiredCapability: 'viewer',
					audience: 'shared',
				},
			],
		});
	};

	const addComputed = () => {
		const index = draft.computedFields.length + 1;
		patch({
			computedFields: [
				...draft.computedFields,
				{
					id: `computed-${index}`,
					label: `Computed ${index}`,
					inputQueryIds: draft.dataQueries[0] ? [draft.dataQueries[0].id] : [],
					valueType: 'number',
				},
			],
		});
	};

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
			<StepHeader title={t('builder.step.data')} help={t('builder.data.help')} />

			<StepSection title={t('builder.data.template')}>
				<Field label={t('builder.data.templateKind')} help={t(TEMPLATE_HELP[draft.template])}>
					<Select
						value={draft.template}
						options={templateOptions(t)}
						onChange={(e: { target: { value: string } }) =>
							patch({ template: e.target.value as WidgetTemplateKind })
						}
					/>
				</Field>
			</StepSection>

			<StepSection title={t('builder.data.bindings')} help={t('builder.data.bindingsHelp')}>
				{issueFor(issues, 'bindings', t) && (
					<span style={{ font: `12px ${T.sans}`, color: T.err }}>
						{issueFor(issues, 'bindings', t)}
					</span>
				)}
				<BindingRows
					bindings={draft.requiredBindings}
					kind="required"
					onChange={(next) => patch({ requiredBindings: next })}
					onAdd={() => patch({ requiredBindings: [...draft.requiredBindings, newBinding()] })}
					onMove={(binding, index) =>
						patch({
							requiredBindings: removeAt(draft.requiredBindings, index),
							optionalBindings: [...draft.optionalBindings, binding],
						})
					}
				/>
				<BindingRows
					bindings={draft.optionalBindings}
					kind="optional"
					onChange={(next) => patch({ optionalBindings: next })}
					onAdd={() => patch({ optionalBindings: [...draft.optionalBindings, newBinding()] })}
					onMove={(binding, index) =>
						patch({
							optionalBindings: removeAt(draft.optionalBindings, index),
							requiredBindings: [...draft.requiredBindings, binding],
						})
					}
				/>
			</StepSection>

			<StepSection title={t('builder.data.queries')} help={t('builder.data.queriesHelp')}>
				{issueFor(issues, 'dataQueries', t) && (
					<span style={{ font: `12px ${T.sans}`, color: T.err }}>
						{issueFor(issues, 'dataQueries', t)}
					</span>
				)}
				<RowList
					empty={t('builder.data.noQueries')}
					addLabel={t('builder.data.addQuery')}
					onAdd={addQuery}
				>
					{draft.dataQueries.map((query, index) => (
						<RowCard
							key={`query-${index}`}
							title={query.label || query.id}
							removeLabel={t('builder.data.removeQuery', { name: query.label || query.id })}
							onRemove={() => patch({ dataQueries: removeAt(draft.dataQueries, index) })}
						>
							<FieldGrid>
								<Field label={t('builder.data.source')}>
									<Select
										value={query.source}
										options={sourceOptions(t)}
										onChange={(e: { target: { value: string } }) => {
											const source = e.target.value as WidgetDataQuerySource;
											setQuery(index, {
												...query,
												source,
												label: t(QUERY_SOURCE_LABEL[source]),
												// A binding list only means anything for the binding source; dropping it
												// keeps the definition honest about what the query actually reads.
												bindingIds: source === 'binding' ? (query.bindingIds ?? []) : undefined,
											});
										}}
									/>
								</Field>
								<Field label={t('builder.binding.label')}>
									<Input
										value={query.label}
										onChange={(e: { target: { value: string } }) =>
											setQuery(index, { ...query, label: e.target.value })
										}
									/>
								</Field>
								<Field label={t('builder.binding.id')}>
									<Input
										value={query.id}
										onChange={(e: { target: { value: string } }) =>
											setQuery(index, { ...query, id: slugify(e.target.value) })
										}
									/>
								</Field>
								<Field label={t('builder.data.audience')} help={t('builder.data.audienceHelp')}>
									<Select
										value={query.audience}
										options={audienceOptions(t)}
										onChange={(e: { target: { value: string } }) =>
											setQuery(index, {
												...query,
												audience: e.target.value as WidgetDataQueryDefinition['audience'],
											})
										}
									/>
								</Field>
								<Field label={t('builder.binding.needs')}>
									<Select
										value={query.requiredCapability}
										options={capabilityOptions(t)}
										onChange={(e: { target: { value: string } }) =>
											setQuery(index, {
												...query,
												requiredCapability: e.target
													.value as WidgetDataQueryDefinition['requiredCapability'],
											})
										}
									/>
								</Field>
							</FieldGrid>
							{query.source === 'binding' && (
								<fieldset style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
									<legend
										style={{
											font: `600 12px ${T.sans}`,
											color: T.sub,
											padding: 0,
											marginBottom: 6,
										}}
									>
										{t('builder.data.readsBindings')}
									</legend>
									<div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
										{allBindings.length === 0 && (
											<span style={{ font: `12px ${T.sans}`, color: T.ter }}>
												{t('builder.data.declareBindingFirst')}
											</span>
										)}
										{allBindings.map((binding) => (
											<Checkbox
												key={binding.id}
												checked={(query.bindingIds ?? []).includes(binding.id)}
												label={binding.label || binding.id}
												onChange={() => {
													const current = query.bindingIds ?? [];
													setQuery(index, {
														...query,
														bindingIds: current.includes(binding.id)
															? current.filter((id) => id !== binding.id)
															: [...current, binding.id],
													});
												}}
											/>
										))}
									</div>
								</fieldset>
							)}
						</RowCard>
					))}
				</RowList>
			</StepSection>

			<StepSection title={t('builder.data.computed')} help={t('builder.data.computedHelp')}>
				{issueFor(issues, 'computedFields', t) && (
					<span style={{ font: `12px ${T.sans}`, color: T.err }}>
						{issueFor(issues, 'computedFields', t)}
					</span>
				)}
				<RowList
					empty={t('builder.data.noComputed')}
					addLabel={t('builder.data.addComputed')}
					onAdd={addComputed}
				>
					{draft.computedFields.map((field, index) => {
						const usesFormula = field.formula !== undefined;
						const formulaBroken =
							usesFormula &&
							field.valueType === 'number' &&
							!isValidFormula(field.formula ?? '', identifiers);
						return (
							<RowCard
								key={`computed-${index}`}
								title={field.label || field.id}
								removeLabel={t('builder.data.removeComputed', {
									name: field.label || field.id,
								})}
								onRemove={() => patch({ computedFields: removeAt(draft.computedFields, index) })}
							>
								<FieldGrid>
									<Field label={t('builder.binding.label')}>
										<Input
											value={field.label}
											onChange={(e: { target: { value: string } }) =>
												setComputed(index, { ...field, label: e.target.value })
											}
										/>
									</Field>
									<Field label={t('builder.data.valueType')}>
										<Select
											value={field.valueType}
											options={VALUE_TYPE_OPTIONS}
											onChange={(e: { target: { value: string } }) =>
												setComputed(index, {
													...field,
													valueType: e.target.value as WidgetComputedFieldDefinition['valueType'],
												})
											}
										/>
									</Field>
								</FieldGrid>
								<fieldset style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
									<legend
										style={{
											font: `600 12px ${T.sans}`,
											color: T.sub,
											padding: 0,
											marginBottom: 6,
										}}
									>
										{t('builder.data.readsFrom')}
									</legend>
									<div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
										{draft.dataQueries.length === 0 && (
											<span style={{ font: `12px ${T.sans}`, color: T.ter }}>
												{t('builder.data.addQueryFirst')}
											</span>
										)}
										{draft.dataQueries.map((query) => (
											<Checkbox
												key={query.id}
												checked={field.inputQueryIds.includes(query.id)}
												label={query.label || query.id}
												onChange={() =>
													setComputed(index, {
														...field,
														inputQueryIds: field.inputQueryIds.includes(query.id)
															? field.inputQueryIds.filter((id) => id !== query.id)
															: [...field.inputQueryIds, query.id],
													})
												}
											/>
										))}
									</div>
								</fieldset>
								{/* Offered for numbers only: the grammar produces a number and nothing else, so a
								    formula on a list or a flag would be a control that cannot do what it says. */}
								{field.valueType === 'number' ? (
									<>
										<Checkbox
											checked={usesFormula}
											label={t('builder.data.useFormula')}
											onChange={() =>
												setComputed(
													index,
													usesFormula
														? { ...field, formula: undefined }
														: {
																...field,
																formula:
																	field.inputQueryIds[0] !== undefined
																		? widgetQueryFormulaIdentifier(field.inputQueryIds[0], 'sum')
																		: '0',
															},
												)
											}
										/>
										{usesFormula && (
											<Field
												label={t('builder.data.formula')}
												error={formulaBroken ? t('builder.data.formulaBroken') : undefined}
											>
												<Input
													value={field.formula ?? ''}
													invalid={formulaBroken}
													style={{ fontFamily: T.mono }}
													onChange={(e: { target: { value: string } }) =>
														setComputed(index, { ...field, formula: e.target.value })
													}
												/>
											</Field>
										)}
										{usesFormula && (
											<div
												data-testid={`widget-builder-formula-names-${index}`}
												style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
											>
												<span style={{ font: `600 12px ${T.sans}`, color: T.sub }}>
													{t('builder.data.namesYouCanUse')}
												</span>
												{draft.dataQueries.length === 0 ? (
													<span style={{ font: `12px ${T.sans}`, color: T.ter }}>
														{t('builder.data.addQueryForNames')}
													</span>
												) : (
													<ul
														style={{
															margin: 0,
															padding: 0,
															listStyle: 'none',
															display: 'flex',
															flexDirection: 'column',
															gap: 3,
														}}
													>
														{draft.dataQueries.map((query) =>
															WIDGET_QUERY_COLUMNS.map((column) => (
																<li
																	key={`${query.id}-${column}`}
																	style={{ font: `12px/1.5 ${T.sans}`, color: T.ter }}
																>
																	<code style={{ fontFamily: T.mono, color: T.sub }}>
																		{widgetQueryFormulaIdentifier(query.id, column)}
																	</code>{' '}
																	{t('builder.data.columnLine', {
																		query: query.label || query.id,
																		meaning: t(COLUMN_HELP[column]),
																	})}
																</li>
															)),
														)}
													</ul>
												)}
											</div>
										)}
									</>
								) : (
									<span style={{ font: `12px/1.5 ${T.sans}`, color: T.ter }}>
										{t('builder.data.formulaNumbersOnly')}
									</span>
								)}
							</RowCard>
						);
					})}
				</RowList>
			</StepSection>
		</div>
	);
}
