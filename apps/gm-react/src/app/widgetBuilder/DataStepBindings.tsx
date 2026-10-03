import { useMemo, useState } from 'react';
import {
	ALL_WIDGET_DATA_QUERY_SOURCES,
	PREVIEW_PLAYER_ACTOR_ID,
	permissionsWithPreviewActors,
	type WidgetBindingDefinition,
	type WidgetDataQueryDefinition,
	type WidgetDefinition,
} from '@dndtools/core';
import { Checkbox, Field, Input, Select } from '../../ds';
import { useRuntime } from '../../runtime/RuntimeContext';
import type { BoardWidget } from '../board-helpers';
import { T } from '../screen-kit';
import {
	WITHHELD_COPY,
	resolveWidgetTemplateData,
	useWidgetHostContext,
	type WidgetQueryResult,
} from '../widgets/dataEnvironment';
import { slugify, type WidgetDraft } from './draft';
import { FieldGrid, RowCard, RowList, removeAt, replaceAt, type Translate } from './fields';
import { CAPABILITY_LABEL, QUERY_SOURCE_LABEL } from './vocabulary';
import { useI18n, type MessageKey } from '../../i18n';

/**
 * The Data step's binding editor (RC-WID-2.2), and its live query previews (RC-WID-5.2).
 *
 * A binding is what a PLACED copy is pointed at, declared here as a contract rather than resolved:
 * the id the definition refers to it by, the entity types it accepts, and the MODE it asks for.
 * The mode is not decoration — `widget-operator-authority.ts` reads it to decide whether a viewer
 * may fire the widget's commands, so "read it" and "read, act on and change it" are two different
 * asks and the author has to make one of them on purpose.
 *
 * Required and optional bindings are the same declaration with different consequences: a required
 * one makes the widget refuse to draw until the DM points it at something. They share this editor
 * so a binding can move between the two lists without being retyped.
 */

/** What a binding asks to do with the entity it is pointed at. Verbs first, no engine jargon. */
const BINDING_MODE_LABEL: Record<WidgetBindingDefinition['mode'], MessageKey> = {
	read: 'builder.bindingMode.read',
	operate: 'builder.bindingMode.operate',
	manage: 'builder.bindingMode.manage',
	observe: 'builder.bindingMode.observe',
};

const bindingModeOptions = (t: Translate) =>
	(['read', 'operate', 'manage', 'observe'] as const).map((value) => ({
		value,
		label: t(BINDING_MODE_LABEL[value]),
	}));

const capabilityOptions = (t: Translate) =>
	(['viewer', 'operator', 'manager'] as const).map((value) => ({
		value,
		label: t(CAPABILITY_LABEL[value]),
	}));

/** An id no binding in the draft is using, whichever list it sits in. */
export function nextBindingId(draft: WidgetDraft): string {
	const taken = new Set(
		[...draft.requiredBindings, ...draft.optionalBindings].map((binding) => binding.id),
	);
	let index = taken.size + 1;
	while (taken.has(`binding-${index}`)) index += 1;
	return `binding-${index}`;
}

/** Comma-separated text ⇄ the entity-type list, so one input declares several accepted types. */
function parseEntityTypes(value: string): string[] {
	return value
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
}

export function BindingRows({
	bindings,
	kind,
	onChange,
	onAdd,
	onMove,
}: {
	bindings: WidgetBindingDefinition[];
	kind: 'required' | 'optional';
	onChange: (next: WidgetBindingDefinition[]) => void;
	onAdd: () => void;
	onMove: (binding: WidgetBindingDefinition, index: number) => void;
}) {
	const { t } = useI18n();
	const set = (index: number, next: WidgetBindingDefinition) =>
		onChange(replaceAt(bindings, index, next));
	return (
		<RowList
			empty={t(kind === 'required' ? 'builder.binding.noRequired' : 'builder.binding.noOptional')}
			addLabel={t(
				kind === 'required' ? 'builder.binding.addRequired' : 'builder.binding.addOptional',
			)}
			onAdd={onAdd}
		>
			{bindings.map((binding, index) => (
				<RowCard
					key={`${kind}-binding-${index}`}
					title={binding.label || binding.id}
					removeLabel={t(
						kind === 'required'
							? 'builder.binding.removeRequired'
							: 'builder.binding.removeOptional',
						{ name: binding.label || binding.id },
					)}
					onRemove={() => onChange(removeAt(bindings, index))}
				>
					<FieldGrid>
						<Field label={t('builder.binding.label')}>
							<Input
								value={binding.label}
								onChange={(e: { target: { value: string } }) =>
									set(index, { ...binding, label: e.target.value })
								}
							/>
						</Field>
						<Field label={t('builder.binding.id')}>
							<Input
								value={binding.id}
								onChange={(e: { target: { value: string } }) =>
									set(index, { ...binding, id: slugify(e.target.value) })
								}
							/>
						</Field>
						<Field
							label={t('builder.binding.entityTypes')}
							help={t('builder.binding.entityTypesHelp')}
						>
							<Input
								value={binding.entityTypes.join(', ')}
								onChange={(e: { target: { value: string } }) =>
									set(index, { ...binding, entityTypes: parseEntityTypes(e.target.value) })
								}
							/>
						</Field>
						<Field label={t('builder.binding.mode')} help={t('builder.binding.modeHelp')}>
							<Select
								value={binding.mode}
								options={bindingModeOptions(t)}
								onChange={(e: { target: { value: string } }) =>
									set(index, {
										...binding,
										mode: e.target.value as WidgetBindingDefinition['mode'],
									})
								}
							/>
						</Field>
						<Field label={t('builder.binding.needs')}>
							<Select
								value={binding.requiredCapability}
								options={capabilityOptions(t)}
								onChange={(e: { target: { value: string } }) =>
									set(index, {
										...binding,
										requiredCapability: e.target
											.value as WidgetBindingDefinition['requiredCapability'],
									})
								}
							/>
						</Field>
					</FieldGrid>
					<div>
						<Checkbox
							checked={kind === 'required'}
							label={t('builder.binding.cannotDrawWithout')}
							onChange={() => onMove(binding, index)}
						/>
					</div>
				</RowCard>
			))}
		</RowList>
	);
}

/*
 * RC-WID-5.2 — the Data step's live previews.
 *
 * A query is a declaration, so an author cannot tell from the form what a source holds or what a
 * player would get from it. These previews resolve the draft's queries through the SAME resolver a
 * placed widget uses (`resolveWidgetTemplateData`), against the live vault, twice: once as the author
 * and once as the reserved preview player, who holds no grants at all (the strictest reading, as in
 * the builder's own "Preview as player"). Nothing here filters anything itself.
 */

const PREVIEW_SAMPLE = 3;

/** A stand-in placed copy: unbound, so a `binding` query honestly reads "No data source bound." */
const PREVIEW_WIDGET: BoardWidget = {
	id: 'widget-builder-data-preview',
	type: 'widget-builder-data-preview',
	title: 'Preview',
	typeLabel: 'Preview',
	icon: 'widget',
	tier: 'custom',
	description: '',
	visibility: 'dm-only',
	x: 0,
	y: 0,
	w: 4,
	h: 3,
	status: 'available',
	statusNote: null,
	configuration: {},
	configFields: [],
	requiresBinding: false,
	commands: [],
	bindingRef: null,
};

/** The smallest definition the resolver accepts: only its `dataQueries` are read. */
function previewDefinition(dataQueries: WidgetDataQueryDefinition[]): WidgetDefinition {
	return {
		type: PREVIEW_WIDGET.type,
		version: '1.0.0',
		displayName: 'Preview',
		author: 'workspace',
		supportedProfiles: ['desktop'],
		defaultSize: { width: 4, height: 3 },
		minSize: { width: 1, height: 1 },
		resizePolicy: 'free',
		requiredBindings: [],
		optionalBindings: [],
		dataQueries,
		configurationSchema: { type: 'object', additionalProperties: true },
		capabilitySets: ['viewer'],
		commands: [],
		events: [],
		hostPermissions: [],
	};
}

export interface QueryReadings {
	you: WidgetQueryResult[];
	player: WidgetQueryResult[];
}

/** Resolve these queries for the author and for the preview player, index for index. */
export function useQueryReadings(
	queries: WidgetDataQueryDefinition[],
	enabled = true,
): QueryReadings {
	const runtime = useRuntime();
	const host = useWidgetHostContext();
	return useMemo(() => {
		if (!enabled) return { you: [], player: [] };
		const definition = previewDefinition(queries);
		const you = resolveWidgetTemplateData(
			runtime.state,
			runtime.activeActorId,
			definition,
			PREVIEW_WIDGET,
			host,
		);
		const player = resolveWidgetTemplateData(
			{ ...runtime.state, permissions: permissionsWithPreviewActors(runtime.state.permissions) },
			PREVIEW_PLAYER_ACTOR_ID,
			definition,
			PREVIEW_WIDGET,
			host,
		);
		return { you: you.queries, player: player.queries };
	}, [enabled, queries, runtime.state, runtime.activeActorId, host]);
}

const previewText = { font: `var(--text-xs)/1.5 ${T.sans}`, color: T.sub } as const;

/** One query's live reading: how many rows each audience gets, and the first few the author sees. */
export function QueryPreview({
	you,
	player,
	testId,
	title,
}: {
	you: WidgetQueryResult | undefined;
	player: WidgetQueryResult | undefined;
	testId: string;
	title: string;
}) {
	const { t } = useI18n();
	if (!you) return null;
	const sample = you.withheld ? [] : you.rows.slice(0, PREVIEW_SAMPLE);
	const hidden = you.rows.length - sample.length;
	return (
		<div
			role="group"
			aria-label={title}
			data-testid={testId}
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: 'var(--space-0-5)',
				padding: 'var(--space-2)',
				borderRadius: 'var(--radius-md)',
				background: T.sunken,
				minWidth: 0,
			}}
		>
			<span style={{ ...previewText, fontWeight: 600 }}>
				{you.withheld
					? WITHHELD_COPY[you.withheld]
					: t('builder.data.previewYou', { count: you.rows.length })}
				{you.header ? ` · ${you.header}` : ''}
			</span>
			<span style={previewText} data-testid={`${testId}-player`}>
				{!player || player.withheld
					? t('builder.data.previewPlayerWithheld')
					: t('builder.data.previewPlayer', { count: player.rows.length })}
			</span>
			{sample.length === 0 ? (
				!you.withheld && (
					<span style={previewText}>
						{t('builder.data.previewEmpty', { empty: you.emptyLabel })}
					</span>
				)
			) : (
				<ul
					style={{
						margin: 'var(--space-0)',
						padding: 'var(--space-0)',
						listStyle: 'none',
						display: 'flex',
						flexDirection: 'column',
						gap: 'var(--space-0-5)',
						minWidth: 0,
					}}
				>
					{sample.map((entry) => (
						<li key={entry.id} style={{ ...previewText, overflowWrap: 'anywhere' }}>
							<span style={{ color: T.ink }}>{entry.primary}</span>
							{entry.secondary ? ` — ${entry.secondary}` : ''}
							{entry.meta ? ` · ${entry.meta}` : ''}
						</li>
					))}
					{hidden > 0 && (
						<li style={previewText}>{t('builder.data.previewMore', { count: hidden })}</li>
					)}
				</ul>
			)}
		</div>
	);
}

/** Every source the builder offers, declared as an open query so the reading shows the core's filter. */
const CATALOGUE_QUERIES: WidgetDataQueryDefinition[] = ALL_WIDGET_DATA_QUERY_SOURCES.map(
	(source) => ({
		id: source,
		label: source,
		source,
		requiredCapability: 'viewer',
		audience: 'shared',
	}),
);

/**
 * The catalogue of every source with its live reading. Closed by default and resolved only once
 * opened, so a long vault does not pay for twenty-odd reads on every keystroke in the form.
 */
export function SourceCatalogue() {
	const { t } = useI18n();
	const [open, setOpen] = useState(false);
	const readings = useQueryReadings(CATALOGUE_QUERIES, open);
	return (
		<details
			data-testid="widget-builder-source-catalogue"
			open={open}
			onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
		>
			<summary
				style={{
					font: `600 var(--text-sm) ${T.sans}`,
					color: T.ink,
					cursor: 'pointer',
					minHeight: 'var(--touch-target-min)',
					display: 'flex',
					alignItems: 'center',
				}}
			>
				{t('builder.data.sourcesSummary', { count: CATALOGUE_QUERIES.length })}
			</summary>
			{open && (
				<ul
					style={{
						margin: 'var(--space-0)',
						padding: 'var(--space-0)',
						listStyle: 'none',
						display: 'grid',
						gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))',
						gap: 'var(--space-2)',
					}}
				>
					{CATALOGUE_QUERIES.map((query, index) => {
						const label = t(QUERY_SOURCE_LABEL[query.source]);
						return (
							<li
								key={query.source}
								data-source={query.source}
								style={{
									display: 'flex',
									flexDirection: 'column',
									gap: 'var(--space-1)',
									minWidth: 0,
								}}
							>
								<span style={{ font: `600 var(--text-xs) ${T.sans}`, color: T.ink }}>{label}</span>
								<QueryPreview
									you={readings.you[index]}
									player={readings.player[index]}
									testId={`widget-builder-source-preview-${query.source}`}
									title={`${label} — ${t('builder.data.preview')}`}
								/>
							</li>
						);
					})}
				</ul>
			)}
		</details>
	);
}
