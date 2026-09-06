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

const TEMPLATE_OPTIONS = TEMPLATE_KINDS.map((kind) => ({
	value: kind,
	label: TEMPLATE_LABEL[kind],
}));
const SOURCE_OPTIONS = QUERY_SOURCES.map((source) => ({
	value: source,
	label: QUERY_SOURCE_LABEL[source],
}));
const AUDIENCE_OPTIONS = (['dm', 'shared', 'players'] as const).map((value) => ({
	value,
	label: AUDIENCE_LABEL[value],
}));
const CAPABILITY_OPTIONS = (['viewer', 'operator', 'manager'] as const).map((value) => ({
	value,
	label: CAPABILITY_LABEL[value],
}));
const VALUE_TYPE_OPTIONS = (['number', 'string', 'boolean', 'array', 'object'] as const).map(
	(value) => ({ value, label: value }),
);

/** What each aggregate column means, so the formula reference does not need a manual. */
const COLUMN_HELP: Record<(typeof WIDGET_QUERY_COLUMNS)[number], string> = {
	count: 'how many rows',
	sum: 'the rows’ values added up',
	max: 'the rows’ ceilings added up',
	active: 'how many rows are the current one',
};

function nextQueryId(queries: WidgetDataQueryDefinition[], source: WidgetDataQuerySource): string {
	const base = source;
	if (!queries.some((query) => query.id === base)) return base;
	let index = 2;
	while (queries.some((query) => query.id === `${base}-${index}`)) index += 1;
	return `${base}-${index}`;
}

export function DataStep({ draft, patch, issues }: StepProps) {
	const setQuery = (index: number, next: WidgetDataQueryDefinition) =>
		patch({ dataQueries: replaceAt(draft.dataQueries, index, next) });
	const setComputed = (index: number, next: WidgetComputedFieldDefinition) =>
		patch({ computedFields: replaceAt(draft.computedFields, index, next) });

	const allBindings = [...draft.requiredBindings, ...draft.optionalBindings];
	const identifiers = widgetFormulaIdentifiers(draft.dataQueries);

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
					label: QUERY_SOURCE_LABEL[source],
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
			<StepHeader
				title="Data"
				help="Choose how the widget draws itself, then declare what it reads. Lamplight resolves each query per viewer, so a DM-only query never reaches a player."
			/>

			<StepSection title="Template">
				<Field label="Template kind" help={TEMPLATE_HELP[draft.template]}>
					<Select
						value={draft.template}
						options={TEMPLATE_OPTIONS}
						onChange={(e: { target: { value: string } }) =>
							patch({ template: e.target.value as WidgetTemplateKind })
						}
					/>
				</Field>
			</StepSection>

			<StepSection
				title="Bindings"
				help="The entities a placed copy is pointed at. A required binding makes the widget wait until the DM points it at something; an optional one is extra."
			>
				{issueFor(issues, 'bindings') && (
					<span style={{ font: `12px ${T.sans}`, color: T.err }}>
						{issueFor(issues, 'bindings')}
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

			<StepSection
				title="Data queries"
				help="Each query names one source and who it is for. The first query is what a single-source template draws."
			>
				{issueFor(issues, 'dataQueries') && (
					<span style={{ font: `12px ${T.sans}`, color: T.err }}>
						{issueFor(issues, 'dataQueries')}
					</span>
				)}
				<RowList
					empty="No data queries yet. Without one the widget draws only its own settings."
					addLabel="Add data query"
					onAdd={addQuery}
				>
					{draft.dataQueries.map((query, index) => (
						<RowCard
							key={`query-${index}`}
							title={query.label || query.id}
							removeLabel={`Remove data query ${query.label || query.id}`}
							onRemove={() => patch({ dataQueries: removeAt(draft.dataQueries, index) })}
						>
							<FieldGrid>
								<Field label="Source">
									<Select
										value={query.source}
										options={SOURCE_OPTIONS}
										onChange={(e: { target: { value: string } }) => {
											const source = e.target.value as WidgetDataQuerySource;
											setQuery(index, {
												...query,
												source,
												label: QUERY_SOURCE_LABEL[source],
												// A binding list only means anything for the binding source; dropping it
												// keeps the definition honest about what the query actually reads.
												bindingIds: source === 'binding' ? (query.bindingIds ?? []) : undefined,
											});
										}}
									/>
								</Field>
								<Field label="Label">
									<Input
										value={query.label}
										onChange={(e: { target: { value: string } }) =>
											setQuery(index, { ...query, label: e.target.value })
										}
									/>
								</Field>
								<Field label="Id">
									<Input
										value={query.id}
										onChange={(e: { target: { value: string } }) =>
											setQuery(index, { ...query, id: slugify(e.target.value) })
										}
									/>
								</Field>
								<Field label="Audience" help="Who this query's rows are for.">
									<Select
										value={query.audience}
										options={AUDIENCE_OPTIONS}
										onChange={(e: { target: { value: string } }) =>
											setQuery(index, {
												...query,
												audience: e.target.value as WidgetDataQueryDefinition['audience'],
											})
										}
									/>
								</Field>
								<Field label="Needs">
									<Select
										value={query.requiredCapability}
										options={CAPABILITY_OPTIONS}
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
										Reads which bindings
									</legend>
									<div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
										{allBindings.length === 0 && (
											<span style={{ font: `12px ${T.sans}`, color: T.ter }}>
												Declare a binding above first.
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

			<StepSection
				title="Computed fields"
				help="A value worked out from one or more queries. A withheld query contributes nothing, so a player's total is never derived from rows they never received."
			>
				{issueFor(issues, 'computedFields') && (
					<span style={{ font: `12px ${T.sans}`, color: T.err }}>
						{issueFor(issues, 'computedFields')}
					</span>
				)}
				<RowList empty="No computed fields." addLabel="Add computed field" onAdd={addComputed}>
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
								removeLabel={`Remove computed field ${field.label || field.id}`}
								onRemove={() => patch({ computedFields: removeAt(draft.computedFields, index) })}
							>
								<FieldGrid>
									<Field label="Label">
										<Input
											value={field.label}
											onChange={(e: { target: { value: string } }) =>
												setComputed(index, { ...field, label: e.target.value })
											}
										/>
									</Field>
									<Field label="Value type">
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
										Reads from
									</legend>
									<div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
										{draft.dataQueries.length === 0 && (
											<span style={{ font: `12px ${T.sans}`, color: T.ter }}>
												Add a data query first.
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
											label="Work it out with a formula"
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
												label="Formula"
												error={
													formulaBroken
														? 'This formula cannot be read. Use the names below, numbers, + - * / ( ), and floor, ceil, round, abs, min, max.'
														: undefined
												}
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
													Names you can use
												</span>
												{draft.dataQueries.length === 0 ? (
													<span style={{ font: `12px ${T.sans}`, color: T.ter }}>
														Add a data query to get names to add up.
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
																	— {query.label || query.id}, {COLUMN_HELP[column]}
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
										A formula works out a number. Set the value type to number to write one.
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
