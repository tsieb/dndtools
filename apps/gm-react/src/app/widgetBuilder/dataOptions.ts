import {
	WIDGET_QUERY_COLUMNS,
	type WidgetDataQueryDefinition,
	type WidgetDataQuerySource,
} from '@dndtools/core';
import {
	AUDIENCE_LABEL,
	CAPABILITY_LABEL,
	QUERY_SOURCES,
	QUERY_SOURCE_LABEL,
	TEMPLATE_KINDS,
	TEMPLATE_LABEL,
} from './vocabulary';
import type { MessageKey, MessageValues } from '../../i18n';

/* The Data step's option lists and id helper. The lists are copy, so they are built per locale. */

type Translate = (key: MessageKey, values?: MessageValues) => string;

export const templateOptions = (t: Translate) =>
	TEMPLATE_KINDS.map((kind) => ({ value: kind, label: t(TEMPLATE_LABEL[kind]) }));
export const sourceOptions = (t: Translate) =>
	QUERY_SOURCES.map((source) => ({ value: source, label: t(QUERY_SOURCE_LABEL[source]) }));
export const audienceOptions = (t: Translate) =>
	(['dm', 'shared', 'players'] as const).map((value) => ({
		value,
		label: t(AUDIENCE_LABEL[value]),
	}));
export const capabilityOptions = (t: Translate) =>
	(['viewer', 'operator', 'manager'] as const).map((value) => ({
		value,
		label: t(CAPABILITY_LABEL[value]),
	}));
// The five value types are schema words, not copy: they name the JSON type the field carries and
// read the same in every locale.
export const VALUE_TYPE_OPTIONS = (['number', 'string', 'boolean', 'array', 'object'] as const).map(
	(value) => ({ value, label: value }),
);

/** What each aggregate column means, so the formula reference does not need a manual. */
export const COLUMN_HELP: Record<(typeof WIDGET_QUERY_COLUMNS)[number], MessageKey> = {
	count: 'builder.column.count',
	sum: 'builder.column.sum',
	max: 'builder.column.max',
	active: 'builder.column.active',
};

export function nextQueryId(
	queries: WidgetDataQueryDefinition[],
	source: WidgetDataQuerySource,
): string {
	const base = source;
	if (!queries.some((query) => query.id === base)) return base;
	let index = 2;
	while (queries.some((query) => query.id === `${base}-${index}`)) index += 1;
	return `${base}-${index}`;
}
