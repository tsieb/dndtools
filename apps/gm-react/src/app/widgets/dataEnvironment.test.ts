import { describe, expect, it } from 'vitest';
import {
	dispatchCommand,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
	type WidgetDataQueryDefinition,
	type WidgetDefinition,
} from '@dndtools/core';
import { DM_ACTOR, PLAYER_ACTOR, buildInitialState, makeEnvironment } from '@dndtools/core/testing';
import { WITHHELD_COPY, resolveWidgetTemplateData } from './dataEnvironment';
import type { BoardWidget } from '../board-helpers';

/**
 * RC-WID-1.2 — the data environment behind the template renderers.
 *
 * Two things are under test: that each of the eight declared `WidgetDataQuerySource`s resolves
 * against the real actor-filtered core reads, and that the declaration's own audience/capability
 * gates hold — a player must never receive a `dm`-audience row, however permissive the underlying
 * read is.
 */

function accept(result: ReturnType<typeof dispatchCommand>): CoreStateSlice {
	if (result.status !== 'accepted') {
		throw new Error(`command rejected: ${JSON.stringify(result.rejection)}`);
	}
	return result.nextState;
}

/** A campaign with a scene in play, a party, combat, a note, a vault object and a map. */
function campaign(): { state: CoreStateSlice; env: CoreEnvironment; sceneId: string } {
	const env = makeEnvironment();
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
	const run = (command: CoreCommand) => {
		state = accept(dispatchCommand(state, env, command));
	};

	run({ type: 'command-center.ensure-home', actorId: DM_ACTOR.id, payload: {} });
	const sceneId = state.commandCenter.homeSceneId as string;
	run({
		type: 'session.set-workflow',
		actorId: DM_ACTOR.id,
		payload: { workflow: 'active', activeSceneId: sceneId },
	});
	run({
		type: 'character.quick-create',
		actorId: DM_ACTOR.id,
		payload: {
			kind: 'sidekick',
			name: 'Brannor',
			visibility: 'player-visible',
			combat: { hp: 18, maxHp: 24, ac: 16 },
		},
	});
	// DM-only by default: the player must never see this one through any source.
	run({
		type: 'character.quick-create',
		actorId: DM_ACTOR.id,
		payload: { kind: 'monster', name: 'Hidden Horror', combat: { hp: 99, maxHp: 99, ac: 18 } },
	});
	run({
		type: 'combat.start',
		actorId: DM_ACTOR.id,
		payload: {
			combatants: [
				{ kind: 'character', name: 'Brannor', ac: 16, initiative: 18, maxHp: 24, hidden: false },
				{
					kind: 'npc',
					name: 'Ambusher',
					ac: 13,
					initiative: 20,
					maxHp: 12,
					hidden: true,
					placeholder: null,
				},
			],
		},
	});
	run({
		type: 'content.create-item',
		actorId: DM_ACTOR.id,
		payload: {
			kind: 'note',
			title: 'Tavern rumours',
			body: 'The miller pays for moonstone.',
			visibility: 'player-visible',
		},
	});
	run({
		type: 'content.create-item',
		actorId: DM_ACTOR.id,
		payload: { kind: 'object', title: 'Moonstone shard', visibility: 'player-visible' },
	});
	run({ type: 'map.create', actorId: DM_ACTOR.id, payload: { name: 'Sunless Citadel' } });

	return { state, env, sceneId };
}

const SOURCES: WidgetDataQueryDefinition['source'][] = [
	'current-combatants',
	'visible-characters',
	'selected-scene',
	'session-state',
	'notes',
	'maps',
	'content-objects',
	'binding',
];

function query(
	source: WidgetDataQueryDefinition['source'],
	overrides: Partial<WidgetDataQueryDefinition> = {},
): WidgetDataQueryDefinition {
	return {
		id: overrides.id ?? source,
		label: overrides.label ?? source,
		source,
		requiredCapability: overrides.requiredCapability ?? 'viewer',
		audience: overrides.audience ?? 'shared',
	};
}

function definitionWith(
	dataQueries: WidgetDataQueryDefinition[],
	computedFields: WidgetDefinition['computedFields'] = [],
): WidgetDefinition {
	return {
		type: 'fixture',
		version: '1.0.0',
		displayName: 'Fixture',
		author: 'workspace',
		supportedProfiles: ['desktop'],
		defaultSize: { width: 240, height: 160 },
		minSize: { width: 120, height: 80 },
		resizePolicy: 'free',
		requiredBindings: [],
		optionalBindings: [],
		dataQueries,
		computedFields,
		configurationSchema: { type: 'object', additionalProperties: true },
		capabilitySets: ['viewer'],
		commands: [],
		events: [],
		hostPermissions: [],
	};
}

function boardWidget(overrides: Partial<BoardWidget> = {}): BoardWidget {
	return {
		id: 'widget-1',
		type: 'fixture',
		title: 'Fixture',
		typeLabel: 'Fixture',
		icon: 'widget',
		tier: 'template',
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
		...overrides,
	};
}

describe('resolveWidgetTemplateData — the eight query sources', () => {
	it('resolves every declared source against an actor-filtered core read', () => {
		const { state } = campaign();
		const widget = boardWidget({
			bindingRef: { entityType: 'map', entityId: 'map-1' },
			status: 'available',
		});
		const data = resolveWidgetTemplateData(
			state,
			DM_ACTOR.id,
			definitionWith(SOURCES.map((source) => query(source))),
			widget,
		);

		expect(data.queries.map((result) => result.source)).toEqual(SOURCES);
		// Every source ran (nothing withheld from the DM) and each one that has data produced rows.
		expect(data.queries.every((result) => result.withheld === null)).toBe(true);
		const rowsOf = (id: string) =>
			data.queries.find((result) => result.id === id)?.rows.map((row) => row.primary) ?? [];
		expect(rowsOf('current-combatants')).toContain('Brannor');
		expect(rowsOf('visible-characters')).toContain('Brannor');
		expect(rowsOf('selected-scene').length).toBeGreaterThan(0);
		expect(rowsOf('session-state')).toEqual(['Session', 'Active scene', 'Combat']);
		expect(rowsOf('notes')).toEqual(['Tavern rumours']);
		expect(rowsOf('content-objects')).toEqual(['Moonstone shard']);
		expect(rowsOf('maps')).toEqual(['Sunless Citadel']);
		expect(rowsOf('binding')).toEqual(['map-1']);
	});

	it('reports the combat header and each combatant measure the viewer may see', () => {
		const { state } = campaign();
		const data = resolveWidgetTemplateData(
			state,
			DM_ACTOR.id,
			definitionWith([query('current-combatants')]),
			boardWidget(),
		);
		const result = data.queries[0];
		expect(result.header).toMatch(/^Round 1 · turn 1 of 2$/);
		const brannor = result.rows.find((row) => row.primary === 'Brannor');
		expect(brannor?.max).toBe(24);
		expect(brannor?.secondary).toContain('Initiative 18');
	});

	it('says no data source is bound rather than inventing a row', () => {
		const { state } = campaign();
		const data = resolveWidgetTemplateData(
			state,
			DM_ACTOR.id,
			definitionWith([query('binding')]),
			boardWidget({ bindingRef: null }),
		);
		expect(data.queries[0].rows).toEqual([]);
		expect(data.queries[0].emptyLabel).toBe('No data source bound.');
	});

	it('gives an unknown actor nothing, not the DM view', () => {
		const { state } = campaign();
		const data = resolveWidgetTemplateData(
			state,
			'actor-nobody',
			definitionWith(SOURCES.map((source) => query(source))),
			boardWidget(),
		);
		expect(data.queries).toEqual([]);
		expect(data.isDm).toBe(false);
	});
});

describe('audience and capability gates', () => {
	it('a player actor never receives a dm-audience query row', () => {
		const { state } = campaign();
		const definition = definitionWith([
			query('visible-characters', { id: 'secret', audience: 'dm' }),
			query('notes', { id: 'open', audience: 'shared' }),
		]);

		const dmData = resolveWidgetTemplateData(state, DM_ACTOR.id, definition, boardWidget());
		expect(dmData.queries[0].withheld).toBeNull();
		expect(dmData.queries[0].rows.length).toBeGreaterThan(0);

		const playerData = resolveWidgetTemplateData(state, PLAYER_ACTOR.id, definition, boardWidget());
		expect(playerData.queries[0].withheld).toBe('audience');
		expect(playerData.queries[0].rows).toEqual([]);
		expect(playerData.queries[0].emptyLabel).toBe(WITHHELD_COPY.audience);
		// The shared query still runs for the same player — the gate is per query, not per widget.
		expect(playerData.queries[1].withheld).toBeNull();
		expect(playerData.queries[1].rows.map((row) => row.primary)).toEqual(['Tavern rumours']);
	});

	it('withholds a manager-capability query from a player', () => {
		const { state } = campaign();
		const definition = definitionWith([
			query('maps', { requiredCapability: 'manager', audience: 'shared' }),
		]);
		const playerData = resolveWidgetTemplateData(state, PLAYER_ACTOR.id, definition, boardWidget());
		expect(playerData.queries[0].withheld).toBe('capability');
		expect(playerData.queries[0].emptyLabel).toBe(WITHHELD_COPY.capability);
		expect(
			resolveWidgetTemplateData(state, DM_ACTOR.id, definition, boardWidget()).queries[0].withheld,
		).toBeNull();
	});

	it('never leaks a dm-only character to a player through an open query', () => {
		const { state } = campaign();
		const playerData = resolveWidgetTemplateData(
			state,
			PLAYER_ACTOR.id,
			definitionWith([query('visible-characters')]),
			boardWidget(),
		);
		const names = playerData.queries[0].rows.map((row) => row.primary);
		expect(names).not.toContain('Hidden Horror');
	});
});

describe('computed fields', () => {
	it('reduces its input queries by the declared value type', () => {
		const { state } = campaign();
		const definition = definitionWith(
			[query('visible-characters', { id: 'party' })],
			[
				{ id: 'total-hp', label: 'Total HP', inputQueryIds: ['party'], valueType: 'number' },
				{ id: 'names', label: 'Names', inputQueryIds: ['party'], valueType: 'string' },
				{ id: 'any', label: 'Any', inputQueryIds: ['party'], valueType: 'boolean' },
				{ id: 'counts', label: 'Counts', inputQueryIds: ['party'], valueType: 'object' },
			],
		);
		const data = resolveWidgetTemplateData(state, DM_ACTOR.id, definition, boardWidget());
		const partyRows = data.queries[0].rows;
		const byId = new Map(data.computed.map((field) => [field.id, field]));

		expect(byId.get('total-hp')?.value).toBe(
			partyRows.reduce((sum, row) => sum + (row.value ?? 0), 0),
		);
		expect(byId.get('names')?.value).toBe(partyRows.map((row) => row.primary).join(', '));
		expect(byId.get('any')?.value).toBe(true);
		expect(byId.get('any')?.display).toBe('Yes');
		expect(byId.get('counts')?.value).toEqual({ party: partyRows.length });
	});

	it('derives nothing from an input the viewer was not allowed to receive', () => {
		const { state } = campaign();
		const definition = definitionWith(
			[query('visible-characters', { id: 'party', audience: 'dm' })],
			[{ id: 'total-hp', label: 'Total HP', inputQueryIds: ['party'], valueType: 'number' }],
		);
		expect(
			resolveWidgetTemplateData(state, PLAYER_ACTOR.id, definition, boardWidget()).computed[0]
				.value,
		).toBe(0);
		expect(
			resolveWidgetTemplateData(state, DM_ACTOR.id, definition, boardWidget()).computed[0].value,
		).toBeGreaterThan(0);
	});
});
