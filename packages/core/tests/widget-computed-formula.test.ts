import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	WIDGET_QUERY_COLUMNS,
	dispatchCommand,
	widgetFormulaIdentifiers,
	widgetQueryFormulaIdentifier,
	type WidgetComputedFieldDefinition,
	type WidgetDataQueryDefinition,
	type WidgetPackageDefinition,
} from '../src';

/**
 * RC-WID-2.2 — computed-field FORMULAS over a widget's data queries.
 *
 * A computed field may carry a formula in the SYS-1.1 declarative grammar instead of taking the
 * default per-type reduction. The grammar reads named numbers and nothing else, so a query enters a
 * formula only through the four aggregate columns `widgetQueryFormulaIdentifier` names — there is
 * no way to reach an individual row, which is what keeps a formula from being a channel around the
 * audience gate.
 *
 * The installer is where a bad formula stops: a package whose formula names a query it did not
 * declare is rejected here rather than failing silently on somebody else's table.
 */

const EMPTY_SCHEMA = { type: 'object' as const, additionalProperties: true };

function query(id: string): WidgetDataQueryDefinition {
	return {
		id,
		label: id,
		source: 'visible-characters',
		requiredCapability: 'viewer',
		audience: 'shared',
	};
}

function packageWith(
	dataQueries: WidgetDataQueryDefinition[],
	computedFields: WidgetComputedFieldDefinition[],
): WidgetPackageDefinition {
	return {
		id: 'workspace.formula',
		version: '1.0.0',
		displayName: 'Formula widget',
		widgets: [
			{
				type: 'formula-card',
				version: '1.0.0',
				displayName: 'Formula card',
				author: 'user',
				supportedProfiles: ['desktop'],
				defaultSize: { width: 180, height: 120 },
				minSize: { width: 120, height: 80 },
				resizePolicy: 'free',
				requiredBindings: [],
				optionalBindings: [],
				dataQueries,
				computedFields,
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

function install(definition: WidgetPackageDefinition) {
	return dispatchCommand(buildInitialState(DM_ACTOR, PLAYER_ACTOR), makeEnvironment(), {
		type: 'widget.package.install',
		actorId: DM_ACTOR.id,
		payload: { package: definition },
	});
}

function computed(
	formula: string,
	inputQueryIds: string[] = ['party'],
): WidgetComputedFieldDefinition {
	return { id: 'total', label: 'Total', inputQueryIds, valueType: 'number', formula };
}

describe('formula identifiers', () => {
	it('folds a slug id into a name the grammar can read', () => {
		expect(widgetQueryFormulaIdentifier('party-hp', 'sum')).toBe('party_hp_sum');
		expect(widgetQueryFormulaIdentifier('combat.round', 'count')).toBe('combat_round_count');
		expect(widgetQueryFormulaIdentifier('7-day', 'count')).toBe('q_7_day_count');
		expect(widgetQueryFormulaIdentifier('---', 'active')).toBe('query_active');
	});

	it('never produces a bare grammar function name', () => {
		for (const column of WIDGET_QUERY_COLUMNS) {
			expect(['min', 'max', 'floor', 'ceil', 'round', 'abs']).not.toContain(
				widgetQueryFormulaIdentifier('max', column),
			);
		}
	});

	it('offers four columns per declared query, in declaration order', () => {
		expect(widgetFormulaIdentifiers([query('party'), query('foes')])).toEqual([
			'party_count',
			'party_sum',
			'party_max',
			'party_active',
			'foes_count',
			'foes_sum',
			'foes_max',
			'foes_active',
		]);
	});
});

describe('installing a package that carries a formula', () => {
	it('accepts a formula over the columns its own queries declare', () => {
		const result = install(
			packageWith([query('party')], [computed('round(party_sum / max(party_count, 1))')]),
		);
		expect(result.status).toBe('accepted');
	});

	it('accepts a computed field with no formula at all', () => {
		const result = install(
			packageWith(
				[query('party')],
				[{ id: 'total', label: 'Total', inputQueryIds: ['party'], valueType: 'number' }],
			),
		);
		expect(result.status).toBe('accepted');
	});

	it('rejects a formula that names a query the package never declared', () => {
		const result = install(packageWith([query('party')], [computed('secret_sum + 1')]));
		expect(result.status).toBe('rejected');
	});

	it('rejects a formula that is not arithmetic at all', () => {
		const result = install(packageWith([query('party')], [computed('fetch("http://evil")')]));
		expect(result.status).toBe('rejected');
	});
});
