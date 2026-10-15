import { describe, expect, it } from 'vitest';
import {
	ALL_WIDGET_BOARD_QUERY_SOURCES,
	PREVIEW_PLAYER_ACTOR_ID,
	dispatchCommand,
	permissionsWithPreviewActors,
	type CoreCommand,
	type CoreStateSlice,
	type WidgetDataQueryDefinition,
	type WidgetDefinition,
} from '@dndtools/core';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '@dndtools/core/testing';
import { resolveWidgetTemplateData, type WidgetQueryResult } from './dataEnvironment';
import type { BoardWidget } from '../board-helpers';

/**
 * RC-WID-5.7 — one isolation test per public source the GM board's tools and the legacy Command
 * Center bodies read through (`ALL_WIDGET_BOARD_QUERY_SOURCES`), on the pattern of RC-WID-5.2's hub
 * test: the fixture puts a DM-only row named `SECRET` beside one a player may see, and each case
 * proves the DM's reading carries the secret (the control), no non-DM reading does (a player, an
 * observer and the builder's preview player), and, where the core is not DM-only, the player still
 * gets their own row. Queries are declared `audience: 'shared'`, so it is the core read that keeps
 * the secret out, not the declaration's audience gate. A source's structured `detail` is printed with
 * its rows, so the secret cannot travel there either.
 */

const SECRET = 'SECRET';

function accept(result: ReturnType<typeof dispatchCommand>): CoreStateSlice {
	if (result.status !== 'accepted') {
		throw new Error(`command rejected: ${JSON.stringify(result.rejection)}`);
	}
	return result.nextState;
}

function boardCampaign() {
	const env = makeEnvironment();
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
	const run = (command: CoreCommand, idempotencyKey?: string) => {
		state = accept(
			dispatchCommand(state, env, { ...command, ...(idempotencyKey ? { idempotencyKey } : {}) }),
		);
	};
	const dm = DM_ACTOR.id;

	// The GM board (DM-only) and an open screen, each with a timer; both timers are running.
	run({ type: 'command-center.ensure-home', actorId: dm, payload: {} });
	const board = () => state.scenes.scenes[state.commandCenter.homeSceneId!]!;
	run({
		type: 'scene.create',
		actorId: dm,
		payload: { name: 'Open Square', visibility: 'player-visible' },
	});
	const openScene = Object.values(state.scenes.scenes).find((s) => s.name === 'Open Square')!;
	run({
		type: 'scene.add-widget',
		actorId: dm,
		payload: {
			sceneId: openScene.id,
			widget: {
				type: 'timer',
				version: '1.0.0',
				layout: { x: 24, y: 24, w: 240, h: 160 },
				configuration: {},
			},
		},
	});
	const openTimerId = state.scenes.scenes[openScene.id]!.widgets[0]!.id;
	const boardTimerId = board().widgets.find((widget) => widget.type === 'timer')!.id;
	const start = (sceneId: string, widgetInstanceId: string, seconds: number) =>
		run(
			{
				type: 'widget.dispatch-command',
				actorId: dm,
				payload: {
					sceneId,
					widgetInstanceId,
					commandType: 'timer.start',
					payload: { durationSeconds: seconds },
					expectedRevision: state.scenes.scenes[sceneId]!.ownership.revision,
				},
			},
			`start-${widgetInstanceId}`,
		);
	start(board().id, boardTimerId, 999);
	start(openScene.id, openTimerId, 30);
	run({
		type: 'session.set-workflow',
		actorId: dm,
		payload: { workflow: 'active', activeSceneId: openScene.id },
	});

	// Audio: a titled track and an ambience bed, both from the DM's library.
	for (const id of ['s-main', 's-bed'] as const) {
		run({
			type: 'audio.configure-source',
			actorId: dm,
			payload: {
				sourceId: id,
				type: 'local-file',
				displayName: `${SECRET} ${id}`,
				cacheBehavior: 'local',
			},
		});
		run({
			type: 'audio.import-asset',
			actorId: dm,
			payload: {
				sourceId: id,
				bytes: id === 's-main' ? [1, 2, 3, 4] : [5, 6, 7, 8],
				mimeType: 'audio/mpeg',
				fileName: `${id}.mp3`,
				title: `${SECRET} theme ${id}`,
				license: { kind: 'owned' },
			},
		});
	}
	const assetId = Object.values(state.audio.assets).find((a) => a.source.sourceId === 's-main')!.id;
	run({
		type: 'session.audio.play',
		actorId: dm,
		payload: { sourceId: 's-main', assetId, volume: 0.7 },
	});
	run({
		type: 'session.audio.set-ambience-layer',
		actorId: dm,
		payload: { layerId: 'bed-1', sourceId: 's-bed', volume: 0.4, muted: false },
	});

	// Maps and characters on both sides of the line.
	run({
		type: 'map.create',
		actorId: dm,
		payload: { name: 'Open map', visibility: 'player-visible' },
	});
	run({
		type: 'map.create',
		actorId: dm,
		payload: { name: `${SECRET} map`, visibility: 'dm-only' },
	});
	const mapId = (name: string) => Object.values(state.maps.maps).find((m) => m.name === name)!.id;
	const quick = (name: string, visibility: string) =>
		run({
			type: 'character.quick-create',
			actorId: dm,
			payload: { kind: 'sidekick', name, visibility, combat: { hp: 10, maxHp: 20, ac: 14 } },
		});
	quick('Aria', 'player-visible');
	quick(`${SECRET} Spy`, 'dm-only');
	const characterId = (name: string) =>
		Object.values(state.characters.characters).find((c) => c.name === name)!.id;

	// The GM screen's saved layout, a prepared encounter, saved searches, a projection and a fight
	// with a hidden ambusher.
	run({ type: 'command-center.save-preset', actorId: dm, payload: { name: `${SECRET} layout` } });
	run({
		type: 'encounter.build',
		actorId: dm,
		payload: {
			title: `${SECRET} ambush`,
			combatants: [{ kind: 'monster', name: 'Bandit', challengeRating: 0.125, quantity: 2 }],
		},
	});
	run({
		type: 'content.create-saved-search',
		actorId: dm,
		payload: { name: `${SECRET} search`, pinned: true },
	});
	run({
		type: 'content.create-saved-search',
		actorId: dm,
		payload: { name: 'Open search', visibility: 'player-visible' },
	});
	run({
		type: 'session.project-player-view',
		actorId: dm,
		payload: {
			playerActorIds: [PLAYER_ACTOR.id],
			connectionState: 'connected',
			target: {
				kind: 'scene',
				sceneId: openScene.id,
				sectionIds: null,
				widgetInstanceIds: null,
				displayState: null,
				mapRegion: null,
			},
		},
	});
	run({ type: 'session.set-active-map', actorId: dm, payload: { mapId: mapId(`${SECRET} map`) } });
	run({
		type: 'combat.start',
		actorId: dm,
		payload: {
			combatants: [
				{ kind: 'character', name: 'Aria', ac: 14, initiative: 12, maxHp: 20, hidden: false },
				{
					kind: 'npc',
					name: `${SECRET} Ambusher`,
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
		type: 'dice.roll',
		actorId: dm,
		payload: { expression: '1d20', label: `${SECRET} check`, visibility: 'dm-only', seed: 's1' },
	});
	run({
		type: 'dice.roll',
		actorId: dm,
		payload: { expression: '1d6', label: 'Open roll', seed: 's2' },
	});

	return { state, boardTimerId, openTimerId, mapId, characterId };
}

function query(source: WidgetDataQueryDefinition['source']): WidgetDataQueryDefinition {
	return { id: source, label: source, source, requiredCapability: 'viewer', audience: 'shared' };
}

function definitionWith(dataQueries: WidgetDataQueryDefinition[]): WidgetDefinition {
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
		configurationSchema: { type: 'object', additionalProperties: true },
		capabilitySets: ['viewer'],
		commands: [],
		events: [],
		hostPermissions: [],
	};
}

function widget(patch: Partial<BoardWidget> = {}): BoardWidget {
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
		...patch,
	};
}

const bound = (entityType: string, entityId: string) =>
	widget({ bindingRef: { entityType, entityId } });

function read(
	state: CoreStateSlice,
	actorId: string,
	source: WidgetDataQueryDefinition['source'],
	drawn: BoardWidget = widget(),
): WidgetQueryResult {
	const result = resolveWidgetTemplateData(state, actorId, definitionWith([query(source)]), drawn)
		.queries[0];
	if (!result) throw new Error(`no result for ${source}`);
	return result;
}

/** Everything a template or a custom widget could print from a result: rows, header and detail. */
const printed = (result: WidgetQueryResult) =>
	JSON.stringify({ rows: result.rows, header: result.header, detail: result.detail ?? null });

function nonDmReadings(
	state: CoreStateSlice,
	source: WidgetDataQueryDefinition['source'],
	drawn?: BoardWidget,
) {
	const preview = { ...state, permissions: permissionsWithPreviewActors(state.permissions) };
	return [
		['a player', read(state, PLAYER_ACTOR.id, source, drawn)],
		['an observer', read(state, OBSERVER_ACTOR.id, source, drawn)],
		['the preview player', read(preview, PREVIEW_PLAYER_ACTOR_ID, source, drawn)],
	] as const;
}

type Fixture = ReturnType<typeof boardCampaign>;

type Case = {
	source: WidgetDataQueryDefinition['source'];
	/** The widget the reading is drawn for: the instance whose timer, map or character it reads. */
	drawn?: (fixture: Fixture) => BoardWidget;
	dm: (result: WidgetQueryResult) => void;
	/** Absent when the core keeps the whole source to the DM: every non-DM reading is then empty. */
	player?: (result: WidgetQueryResult) => void;
};

const CASES: Case[] = [
	{
		// The DM-only board's timer: running at 999 seconds, never described to anyone else.
		source: 'widget-timer',
		drawn: (f) => widget({ id: f.boardTimerId }),
		dm: (r) => {
			expect(r.rows[0]?.value).toBe(999);
			expect(r.detail).toMatchObject({ kind: 'timer', timer: { durationSeconds: 999 } });
		},
	},
	{
		source: 'session-audio',
		dm: (r) => {
			expect(r.rows.map((row) => row.primary)).toEqual([
				`${SECRET} theme s-main`,
				`${SECRET} s-bed`,
			]);
			expect(r.detail).toMatchObject({
				kind: 'audio',
				track: { title: `${SECRET} theme s-main`, ambienceCount: 1 },
			});
		},
		player: (r) => {
			expect(r.rows.map((row) => row.primary)).toEqual(['Session audio']);
			expect(r.detail).toMatchObject({ kind: 'audio', track: { title: null, ambienceCount: 0 } });
		},
	},
	{
		source: 'bound-map',
		drawn: (f) => bound('map', f.mapId(`${SECRET} map`)),
		dm: (r) => {
			expect(r.rows.map((row) => row.primary)).toEqual([`${SECRET} map`]);
			expect(r.detail).toMatchObject({ kind: 'map', map: { playerActorIds: [PLAYER_ACTOR.id] } });
		},
		player: (r) => {
			expect(r.rows).toEqual([]);
			expect(r.detail).toMatchObject({
				kind: 'map',
				map: { view: null, choices: [], playerActorIds: [] },
			});
		},
	},
	{
		source: 'bound-character',
		drawn: (f) => bound('character', f.characterId(`${SECRET} Spy`)),
		dm: (r) => expect(r.rows[0]?.primary).toBe(`${SECRET} Spy`),
		player: (r) => expect(r.rows).toEqual([]),
	},
	{
		// The roster cell is the DM's alone; its label is the secret here.
		source: 'session-status',
		dm: (r) => expect(r.rows.map((row) => row.id)).toContain('players'),
		player: (r) => {
			expect(r.rows.map((row) => row.id)).not.toContain('players');
			expect(r.rows.map((row) => row.id)).toContain('phase');
		},
	},
	{
		source: 'onboarding',
		dm: (r) => expect(r.rows.length).toBeGreaterThan(0),
	},
	{
		source: 'command-center',
		dm: (r) => expect(r.rows.map((row) => row.primary)).toContain(`${SECRET} layout`),
	},
	{
		source: 'map-projection',
		dm: (r) => expect(r.rows.map((row) => row.id)).toEqual(['delivered', 'queued']),
	},
	{
		source: 'player-view-controller',
		dm: (r) => expect(r.rows.map((row) => row.id)).toContain(PLAYER_ACTOR.id),
	},
	{
		source: 'encounters',
		dm: (r) => expect(r.rows.map((row) => row.primary)).toContain(`${SECRET} ambush`),
	},
	{
		source: 'saved-searches',
		dm: (r) =>
			expect(r.rows.map((row) => row.primary)).toEqual([`${SECRET} search`, 'Open search']),
		player: (r) => expect(r.rows.map((row) => row.primary)).toEqual(['Open search']),
	},
];

describe('RC-WID-5.7 — every board source is actor-scoped', () => {
	it('covers every board source exactly once', () => {
		expect(CASES.map((entry) => entry.source).sort()).toEqual(
			[...ALL_WIDGET_BOARD_QUERY_SOURCES].sort(),
		);
	});

	describe.each(CASES)('$source', (entry) => {
		const fixture = boardCampaign();
		const drawn = entry.drawn?.(fixture);

		it('shows the DM the DM-only row (the control)', () => {
			const result = read(fixture.state, DM_ACTOR.id, entry.source, drawn);
			entry.dm(result);
		});

		it.each(nonDmReadings(fixture.state, entry.source, drawn))(
			'never shows %s a DM-only row',
			(_who, result) => {
				expect(result.withheld).toBeNull();
				expect(printed(result)).not.toContain(SECRET);
				if (entry.player) entry.player(result);
				else expect(result.rows).toEqual([]);
			},
		);
	});
});

describe('RC-WID-5.7 — the timer source reads only the instance being drawn', () => {
	it('gives a player the open screen’s timer, and nothing for the DM board’s', () => {
		const { state, boardTimerId, openTimerId } = boardCampaign();
		const open = read(state, PLAYER_ACTOR.id, 'widget-timer', widget({ id: openTimerId }));
		expect(open.rows[0]?.value).toBe(30);
		const board = read(state, PLAYER_ACTOR.id, 'widget-timer', widget({ id: boardTimerId }));
		expect(board.rows).toEqual([]);
		expect(board.detail).toEqual({ kind: 'timer', timer: null });
	});

	it('describes no timer for an unplaced widget, such as a builder preview', () => {
		const { state } = boardCampaign();
		expect(read(state, DM_ACTOR.id, 'widget-timer').detail).toEqual({ kind: 'timer', timer: null });
	});
});

describe('RC-WID-5.7 — the detail added to existing sources is as scoped as their rows', () => {
	it('keeps the hidden combatant out of a player’s combat detail', () => {
		const { state } = boardCampaign();
		const dm = read(state, DM_ACTOR.id, 'current-combatants');
		expect(printed(dm)).toContain(`${SECRET} Ambusher`);
		for (const [, result] of nonDmReadings(state, 'current-combatants')) {
			expect(printed(result)).not.toContain(`${SECRET} Ambusher`);
		}
	});

	it('keeps a DM-only roll out of a player’s dice detail', () => {
		const { state } = boardCampaign();
		const rolls = (result: WidgetQueryResult) =>
			result.detail?.kind === 'dice' ? result.detail.rolls.map((roll) => roll.expression) : null;
		expect(rolls(read(state, DM_ACTOR.id, 'dice-history'))).toEqual(['1d20', '1d6']);
		for (const [, result] of nonDmReadings(state, 'dice-history')) {
			expect(rolls(result)).toEqual(['1d6']);
		}
	});

	it('carries no detail on a query withheld by its audience', () => {
		const { state } = boardCampaign();
		const result = resolveWidgetTemplateData(
			state,
			PLAYER_ACTOR.id,
			definitionWith([{ ...query('current-combatants'), audience: 'dm' }]),
			widget(),
		).queries[0]!;
		expect(result.withheld).toBe('audience');
		expect(result.detail).toBeUndefined();
	});
});
