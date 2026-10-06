import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	WIDGET_DATA_QUERY_SOURCES,
	WIDGET_QUERY_LIMIT_MAX,
	WIDGET_QUERY_TAG_MAX_LENGTH,
	dispatchCommand,
	widgetQueryOptionApplies,
	widgetQueryOptionIssues,
	widgetTemplateReadsQueries,
	type WidgetDataQueryDefinition,
	type WidgetDataQueryOptions,
	type WidgetPackageDefinition,
} from '../src';
import { widgetPackageDefinitionSchema } from '../src/schemas/widget-package';

/**
 * RC-WID-6.5 — declarative data-query options, as the schema sees them.
 *
 * Each option has its own shape (an enum, a bounded integer, a non-blank tag) and a rule about
 * which sources can honour it. An option on a source whose rows cannot carry the field would match
 * nothing, or everything, without saying so, so the installer refuses it. A query with no options
 * is the same declaration it was before options existed.
 */

const EMPTY_SCHEMA = { type: 'object' as const, additionalProperties: true };

function query(
	source: WidgetDataQueryDefinition['source'],
	options?: WidgetDataQueryOptions,
): WidgetDataQueryDefinition {
	return {
		id: 'q',
		label: 'Query',
		source,
		requiredCapability: 'viewer',
		audience: 'shared',
		...(options ? { options } : {}),
	};
}

function packageWith(dataQueries: unknown[]): WidgetPackageDefinition {
	return {
		id: 'workspace.options',
		version: '1.0.0',
		displayName: 'Options widget',
		widgets: [
			{
				type: 'options-card',
				version: '1.0.0',
				displayName: 'Options card',
				author: 'user',
				supportedProfiles: ['desktop'],
				defaultSize: { width: 180, height: 120 },
				minSize: { width: 120, height: 80 },
				resizePolicy: 'free',
				requiredBindings: [],
				optionalBindings: [],
				dataQueries: dataQueries as WidgetDataQueryDefinition[],
				configurationSchema: EMPTY_SCHEMA,
				capabilitySets: ['manager', 'operator', 'viewer'],
				commands: [],
				events: [],
				hostPermissions: [],
			},
		],
		migrations: [],
		assets: [],
		portabilityWarnings: [],
	};
}

function parses(dataQuery: unknown): boolean {
	return widgetPackageDefinitionSchema.safeParse(packageWith([dataQuery])).success;
}

function issuePaths(dataQuery: unknown): string[] {
	const result = widgetPackageDefinitionSchema.safeParse(packageWith([dataQuery]));
	if (result.success) return [];
	return result.error.issues.map((issue) => issue.path.join('.'));
}

describe('RC-WID-6.5 — query option shapes', () => {
	it('a query with no options parses exactly as before', () => {
		const result = widgetPackageDefinitionSchema.safeParse(packageWith([query('notes')]));
		expect(result.success).toBe(true);
		if (result.success)
			expect(result.data.widgets[0]?.dataQueries?.[0]).not.toHaveProperty('options');
	});

	it('characterKinds: a non-empty list of known kinds', () => {
		expect(parses(query('visible-characters', { characterKinds: ['pc'] }))).toBe(true);
		expect(parses(query('visible-characters', { characterKinds: ['pc', 'sidekick'] }))).toBe(true);
		expect(parses(query('visible-characters', { characterKinds: [] }))).toBe(false);
		expect(
			parses(query('visible-characters', { characterKinds: ['dragon'] as unknown as ['pc'] })),
		).toBe(false);
		expect(issuePaths(query('visible-characters', { characterKinds: ['pc', 'pc'] }))).toContain(
			'widgets.0.dataQueries.0.options.characterKinds',
		);
	});

	it('tag: non-blank and bounded', () => {
		expect(parses(query('notes', { tag: 'undead' }))).toBe(true);
		expect(parses(query('notes', { tag: '' }))).toBe(false);
		expect(parses(query('notes', { tag: '   ' }))).toBe(false);
		expect(parses(query('notes', { tag: 'x'.repeat(WIDGET_QUERY_TAG_MAX_LENGTH) }))).toBe(true);
		expect(parses(query('notes', { tag: 'x'.repeat(WIDGET_QUERY_TAG_MAX_LENGTH + 1) }))).toBe(
			false,
		);
	});

	it('sceneMembership: the active screen or the running fight', () => {
		expect(parses(query('visible-characters', { sceneMembership: 'active-scene' }))).toBe(true);
		expect(parses(query('visible-characters', { sceneMembership: 'in-combat' }))).toBe(true);
		expect(
			parses(
				query('visible-characters', {
					sceneMembership: 'everywhere' as unknown as 'active-scene',
				}),
			),
		).toBe(false);
	});

	it('status: up, bloodied or down', () => {
		for (const status of ['up', 'bloodied', 'down'] as const) {
			expect(parses(query('party', { status }))).toBe(true);
		}
		expect(parses(query('party', { status: 'dead' as unknown as 'down' }))).toBe(false);
	});

	it('sort: name or a measure, either way', () => {
		for (const sort of ['name', 'value-high', 'value-low'] as const) {
			expect(parses(query('maps', { sort }))).toBe(true);
		}
		expect(parses(query('maps', { sort: 'random' as unknown as 'name' }))).toBe(false);
	});

	it('limit: a whole number from 1 to the cap', () => {
		expect(parses(query('notes', { limit: 1 }))).toBe(true);
		expect(parses(query('notes', { limit: WIDGET_QUERY_LIMIT_MAX }))).toBe(true);
		expect(parses(query('notes', { limit: 0 }))).toBe(false);
		expect(parses(query('notes', { limit: WIDGET_QUERY_LIMIT_MAX + 1 }))).toBe(false);
		expect(parses(query('notes', { limit: 2.5 }))).toBe(false);
	});

	it('an option the schema does not know is refused, not carried', () => {
		expect(parses(query('notes', { colour: 'red' } as unknown as WidgetDataQueryOptions))).toBe(
			false,
		);
	});
});

describe('RC-WID-6.5 — an option must fit its source', () => {
	it('a filter on a source with no such field is refused, naming the option', () => {
		expect(issuePaths(query('visible-characters', { tag: 'undead' }))).toEqual([
			'widgets.0.dataQueries.0.options.tag',
		]);
		expect(issuePaths(query('notes', { characterKinds: ['npc'] }))).toEqual([
			'widgets.0.dataQueries.0.options.characterKinds',
		]);
		expect(issuePaths(query('maps', { status: 'down' }))).toEqual([
			'widgets.0.dataQueries.0.options.status',
		]);
		expect(issuePaths(query('session-state', { sceneMembership: 'active-scene' }))).toEqual([
			'widgets.0.dataQueries.0.options.sceneMembership',
		]);
	});

	it('only a character can be in the fight', () => {
		expect(parses(query('notes', { sceneMembership: 'active-scene' }))).toBe(true);
		expect(issuePaths(query('notes', { sceneMembership: 'in-combat' }))).toEqual([
			'widgets.0.dataQueries.0.options.sceneMembership',
		]);
		expect(parses(query('party', { sceneMembership: 'in-combat' }))).toBe(true);
	});

	it('sort and limit apply to every source', () => {
		for (const source of WIDGET_DATA_QUERY_SOURCES) {
			expect(widgetQueryOptionApplies('sort', source)).toBe(true);
			expect(widgetQueryOptionApplies('limit', source)).toBe(true);
			expect(widgetQueryOptionIssues(query(source, { sort: 'name', limit: 3 }))).toEqual([]);
		}
	});

	it('a party list filtered to PCs and sorted by HP is one valid declaration', () => {
		expect(
			parses(
				query('visible-characters', {
					characterKinds: ['pc'],
					status: 'bloodied',
					sceneMembership: 'in-combat',
					sort: 'value-low',
					limit: 6,
				}),
			),
		).toBe(true);
	});

	it('the installer refuses a misplaced option and accepts a fitting one', () => {
		const install = (dataQuery: WidgetDataQueryDefinition) =>
			dispatchCommand(buildInitialState(DM_ACTOR, PLAYER_ACTOR), makeEnvironment(), {
				type: 'widget.package.install',
				actorId: DM_ACTOR.id,
				payload: { package: packageWith([dataQuery]) },
			});
		expect(install(query('visible-characters', { characterKinds: ['pc'] })).status).toBe(
			'accepted',
		);
		expect(install(query('maps', { characterKinds: ['pc'] })).status).toBe('rejected');
	});
});

describe('RC-WID-6.5 — which template kinds read a query', () => {
	it('data templates read one; buttons, messages, forms and intent launchers do not', () => {
		for (const kind of ['data-table', 'status-list', 'tracker', 'chart', 'stat-block'] as const) {
			expect(widgetTemplateReadsQueries(kind)).toBe(true);
		}
		for (const kind of [
			'action-panel',
			'scene-message',
			'form-panel',
			'launcher',
			'link-list',
		] as const) {
			expect(widgetTemplateReadsQueries(kind)).toBe(false);
		}
	});
});
