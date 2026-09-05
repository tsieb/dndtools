import {
	type WidgetComputedFieldDefinition,
	type WidgetDataQueryDefinition,
	type WidgetDataQuerySource,
	type WidgetTemplateKind,
} from '@dndtools/core';
import { Checkbox, Field, Input, Select } from '../../ds';
import { T } from '../screen-kit';
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
 * Data — which template kind draws the widget and what it draws FROM (RC-WID-2.1).
 *
 * A data query is a declaration, not a fetch: it names one of the core's actor-filtered sources and
 * the audience it is for, and `app/widgets/dataEnvironment.ts` resolves it per viewer at render
 * time. That is why the audience picker matters more than it looks — a `DM only` query yields no
 * rows at all to a player, and the template says so rather than looking empty.
 *
 * RC-WID-2.2 extends this step with the SYS-1.1 formula grammar over query columns and a
 * "Preview as player" toggle; the declarations below are the shape it builds on.
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
						</RowCard>
					))}
				</RowList>
			</StepSection>

			<StepSection
				title="Computed fields"
				help="A value reduced from one or more queries. A withheld query contributes nothing, so a player's total is never derived from rows they never received."
			>
				{issueFor(issues, 'computedFields') && (
					<span style={{ font: `12px ${T.sans}`, color: T.err }}>
						{issueFor(issues, 'computedFields')}
					</span>
				)}
				<RowList empty="No computed fields." addLabel="Add computed field" onAdd={addComputed}>
					{draft.computedFields.map((field, index) => (
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
									style={{ font: `600 12px ${T.sans}`, color: T.sub, padding: 0, marginBottom: 6 }}
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
						</RowCard>
					))}
				</RowList>
			</StepSection>
		</div>
	);
}
