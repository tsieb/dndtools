import type { WidgetDataQueryDefinition, WidgetDataQuerySource } from '@dndtools/core';
import type { MessageKey } from '../../i18n';
import { CATALOG } from './CommandsStep';
import { counterRecipe, emptyDraft, type WidgetDraft } from './draft';

export function quickQuery(source: WidgetDataQuerySource): WidgetDataQueryDefinition {
	return { id: 'items', label: 'Items', source, requiredCapability: 'viewer', audience: 'dm' };
}

/** Recipes contain only ordinary draft fields: no recipe id or private runtime survives export. */
export const QUICK_RECIPES: readonly {
	id: string;
	label: MessageKey;
	icon: string;
	preset: Partial<WidgetDraft>;
	picker: 'characters' | 'counter' | 'source' | 'note' | 'commands';
}[] = [
	{
		id: 'party',
		label: 'builder.quick.party',
		icon: 'characters-person',
		picker: 'characters',
		preset: {
			name: 'Party HP',
			template: 'status-list',
			dataQueries: [quickQuery('party')],
		},
	},
	{
		id: 'counter',
		label: 'builder.quick.counter',
		icon: 'hourglass',
		picker: 'counter',
		preset: {
			...counterRecipe('Doom counter', { min: 0, max: 6 }),
			defaultSize: { width: 300, height: 300 },
		},
	},
	{
		id: 'table',
		label: 'builder.quick.table',
		icon: 'layout-list',
		picker: 'source',
		preset: {
			name: 'Table of things',
			template: 'data-table',
			dataQueries: [quickQuery('content-objects')],
		},
	},
	{
		id: 'note',
		label: 'builder.quick.note',
		icon: 'note',
		picker: 'note',
		preset: {
			name: 'Note for the table',
			template: 'scene-message',
			configFields: [
				{ key: 'message', label: 'Message', control: 'textarea', group: 'content', default: '' },
			],
		},
	},
	{
		id: 'buttons',
		label: 'builder.quick.buttons',
		icon: 'play',
		picker: 'commands',
		preset: {
			name: 'Buttons',
			template: 'action-panel',
		},
	},
	{
		id: 'stat',
		label: 'builder.quick.stat',
		icon: 'tile-character',
		picker: 'characters',
		preset: {
			name: 'Stat block',
			template: 'stat-block',
			dataQueries: [{ ...quickQuery('party'), options: { limit: 1 } }],
		},
	},
	{
		id: 'chart',
		label: 'builder.quick.chart',
		icon: 'ChartNoAxesColumn',
		picker: 'characters',
		preset: {
			name: 'Party HP chart',
			template: 'chart',
			dataQueries: [quickQuery('party')],
		},
	},
	{
		id: 'form',
		label: 'builder.quick.form',
		icon: 'edit',
		picker: 'commands',
		preset: {
			name: 'Form',
			template: 'form-panel',
		},
	},
];

/** Use the WID-6.1 catalogue, including its required configuration, verbatim. */
export function quickCommands(typeId: string, indices: readonly number[]) {
	const entries = indices.flatMap((index) => (CATALOG[index] ? [CATALOG[index]!] : []));
	return {
		commands: entries.map((entry) => entry.descriptor(typeId)),
		configFields: entries.flatMap((entry) => (entry.field ? [{ ...entry.field }] : [])),
	};
}

/** Identity is allocated once per opening, so repeating a recipe never upgrades another tile. */
export function quickDraft(id: string, identity: string): WidgetDraft {
	const recipe = QUICK_RECIPES.find((entry) => entry.id === id);
	if (!recipe) throw new Error(`Unknown quick recipe: ${id}`);
	const draft: WidgetDraft = {
		...emptyDraft(),
		...structuredClone(recipe.preset),
		packageId: `workspace.quick-${identity}`,
		typeId: `quick-${identity}`,
		icon: recipe.icon,
	};
	if (recipe.picker === 'commands') {
		Object.assign(draft, quickCommands(draft.typeId, [id === 'form' ? CATALOG.length - 1 : 0]));
	}
	return draft;
}

/** Audience is the resolver's declaration; visibility also carries it onto the placed tile. */
export function quickAudience(draft: WidgetDraft, shared: boolean): Partial<WidgetDraft> {
	return {
		dataQueries: draft.dataQueries.map((query) => ({
			...query,
			audience: shared ? 'shared' : 'dm',
		})),
		configFields: [
			...draft.configFields.filter((field) => field.key !== 'visibility'),
			{
				key: 'visibility',
				label: 'Visibility',
				control: 'text',
				group: 'display',
				default: shared ? 'shared' : 'dm-only',
			},
		],
	};
}
