import { describe, expect, it } from 'vitest';
import {
	dispatchCommand,
	type CoreCommand,
	type CoreStateSlice,
	type WidgetDataQueryDefinition,
	type WidgetDataQueryOptions,
	type WidgetDefinition,
} from '@dndtools/core';
import { DM_ACTOR, PLAYER_ACTOR, buildInitialState, makeEnvironment } from '@dndtools/core/testing';
import {
	VISIBILITY_WORD,
	previewNeedsSampleData,
	resolveWidgetTemplateData,
	sampleTemplateData,
	type WidgetQueryResult,
} from './dataEnvironment';
import type { BoardWidget } from '../board-helpers';

/**
 * RC-WID-6.5 — declarative query options, resolved.
 *
 * Every option runs over what the source's actor-scoped read already returned, so the property
 * under test is twofold: the option does what it says for the DM, and for a player it never brings
 * back a row the same read without the option would have withheld. The campaign mixes visible and
 * DM-only characters of every kind so each filter has something to keep and something to drop.
 */

function accept(result: ReturnType<typeof dispatchCommand>): CoreStateSlice {
	if (result.status !== 'accepted') {
		throw new Error(`command rejected: ${JSON.stringify(result.rejection)}`);
	}
	return result.nextState;
}

interface Campaign {
	state: CoreStateSlice;
	ids: Record<string, string>;
}

/**
 * Six characters (two of them DM-only), a player-visible market screen made active with Mira and
 * the Hollow King bound to widgets on it, a fight with Aria, Bram and the Hollow King in it, and
 * tagged notes and scenes.
 */
function campaign(): Campaign {
	const env = makeEnvironment();
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
	const run = (command: CoreCommand) => {
		state = accept(dispatchCommand(state, env, command));
	};
	const character = (
		kind: 'pc' | 'npc' | 'monster' | 'sidekick',
		name: string,
		hp: number,
		maxHp: number,
		visibility?: 'player-visible',
	) => {
		run({
			type: 'character.quick-create',
			actorId: DM_ACTOR.id,
			payload: {
				// Quick-create makes no PCs; a PC is a sidekick made a PC below, as the hub tests do.
				kind: kind === 'pc' ? 'sidekick' : kind,
				name,
				...(visibility ? { visibility } : {}),
				combat: { hp, maxHp, ac: 12 },
			},
		});
	};
	character('pc', 'Aria', 20, 20, 'player-visible');
	character('pc', 'Bram', 6, 20, 'player-visible');
	character('pc', 'Secret Twin', 0, 20); // DM-only PC: a player must never see it, whatever the filter.
	character('npc', 'Mira the Ferryman', 10, 10, 'player-visible');
	character('npc', 'The Hollow King', 40, 50); // DM-only NPC
	character('sidekick', 'Pip', 4, 8, 'player-visible');
	character('monster', 'Grave Rat', 3, 3, 'player-visible');

	const pcs = new Set(['Aria', 'Bram', 'Secret Twin']);
	state = {
		...state,
		characters: {
			...state.characters,
			characters: Object.fromEntries(
				Object.entries(state.characters.characters).map(([id, record]) => [
					id,
					pcs.has(record.name) ? { ...record, kind: 'pc' as const } : record,
				]),
			),
		},
	};

	const ids: Record<string, string> = {};
	for (const record of Object.values(state.characters.characters)) ids[record.name] = record.id;

	run({
		type: 'scene.create',
		actorId: DM_ACTOR.id,
		payload: { name: 'Market', visibility: 'player-visible', tags: ['Town'] },
	});
	run({
		type: 'scene.create',
		actorId: DM_ACTOR.id,
		payload: { name: 'Crypt', visibility: 'player-visible', tags: ['dungeon'] },
	});
	for (const scene of Object.values(state.scenes.scenes)) ids[scene.name] = scene.id;
	for (const name of ['Mira the Ferryman', 'The Hollow King']) {
		run({
			type: 'scene.add-widget',
			actorId: DM_ACTOR.id,
			payload: {
				sceneId: ids.Market,
				widget: {
					type: 'character',
					version: '1.0.0',
					layout: { x: 0, y: 0, w: 200, h: 160 },
					binding: {
						source: { entityType: 'character', entityId: ids[name] },
						mode: 'read',
						requiredCapability: 'viewer',
					},
				},
			},
		});
	}
	run({
		type: 'session.set-workflow',
		actorId: DM_ACTOR.id,
		payload: { workflow: 'active', activeSceneId: ids.Market },
	});
	run({
		type: 'combat.start',
		actorId: DM_ACTOR.id,
		payload: {
			combatants: [
				{
					kind: 'character',
					characterId: ids.Aria,
					name: 'Aria',
					ac: 12,
					initiative: 15,
					maxHp: 20,
					hidden: false,
				},
				{
					kind: 'character',
					characterId: ids.Bram,
					name: 'Bram',
					ac: 12,
					initiative: 12,
					maxHp: 20,
					hidden: false,
				},
				{ kind: 'monster', name: 'Ghoul', ac: 13, initiative: 9, maxHp: 22, hidden: false },
			],
		},
	});
	const note = (title: string, tags: string[], visibility?: 'player-visible') =>
		run({
			type: 'content.create-item',
			actorId: DM_ACTOR.id,
			payload: {
				kind: 'note',
				title,
				body: '',
				fields: { tags },
				...(visibility ? { visibility } : {}),
			},
		});
	note('Rumours of the dead', ['undead', 'rumour'], 'player-visible');
	note('The King’s true name', ['Undead']); // DM-only, carries the tag
	note('Market prices', ['town'], 'player-visible');
	return { state, ids };
}

const WIDGET: BoardWidget = {
	id: 'w-options',
	type: 'fixture',
	title: 'Fixture',
	typeLabel: 'Status list',
	icon: 'widget',
	tier: 'custom',
	description: '',
	visibility: 'player-visible',
	x: 0,
	y: 0,
	w: 240,
	h: 160,
	status: 'available',
	statusNote: null,
	configuration: {},
	configFields: [],
	requiresBinding: false,
	commands: [],
	bindingRef: null,
};

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
		renderEntrypoint: { runtime: 'template', template: 'status-list', hostApiVersion: 1 },
		configurationSchema: { type: 'object', additionalProperties: true },
		capabilitySets: ['manager', 'operator', 'viewer'],
		commands: [],
		events: [],
		hostPermissions: [],
	};
}

function read(
	state: CoreStateSlice,
	actorId: string,
	source: WidgetDataQueryDefinition['source'],
	options?: WidgetDataQueryOptions,
): WidgetQueryResult {
	const result = resolveWidgetTemplateData(
		state,
		actorId,
		definitionWith([
			{
				id: 'q',
				label: 'Query',
				source,
				requiredCapability: 'viewer',
				audience: 'shared',
				...(options ? { options } : {}),
			},
		]),
		WIDGET,
	).primary;
	if (!result) throw new Error('no primary query');
	return result;
}

const names = (result: WidgetQueryResult) => result.rows.map((row) => row.primary).sort();

describe('RC-WID-6.5 — characterKinds', () => {
	it('a party list filtered to PCs shows no NPC (DM)', () => {
		const { state } = campaign();
		const result = read(state, DM_ACTOR.id, 'visible-characters', { characterKinds: ['pc'] });
		expect(names(result)).toEqual(['Aria', 'Bram', 'Secret Twin']);
		expect(names(result)).not.toContain('Mira the Ferryman');
		expect(names(result)).not.toContain('The Hollow King');
	});

	it('player isolation: a kind filter keeps only what the player could already see', () => {
		const { state } = campaign();
		const unfiltered = names(read(state, PLAYER_ACTOR.id, 'visible-characters'));
		expect(unfiltered).not.toContain('Secret Twin');
		expect(unfiltered).not.toContain('The Hollow King');
		expect(
			names(read(state, PLAYER_ACTOR.id, 'visible-characters', { characterKinds: ['pc'] })),
		).toEqual(['Aria', 'Bram']);
		expect(
			names(read(state, PLAYER_ACTOR.id, 'visible-characters', { characterKinds: ['npc'] })),
		).toEqual(['Mira the Ferryman']);
	});

	it('several kinds keep each of them', () => {
		const { state } = campaign();
		expect(
			names(
				read(state, PLAYER_ACTOR.id, 'visible-characters', {
					characterKinds: ['sidekick', 'monster'],
				}),
			),
		).toEqual(['Grave Rat', 'Pip']);
	});

	it('combatants: a linked character takes its kind; a tracker monster keeps its own', () => {
		const { state } = campaign();
		expect(
			names(read(state, DM_ACTOR.id, 'current-combatants', { characterKinds: ['pc'] })),
		).toEqual(['Aria', 'Bram']);
		expect(
			names(read(state, DM_ACTOR.id, 'current-combatants', { characterKinds: ['monster'] })),
		).toEqual(['Ghoul']);
	});
});

describe('RC-WID-6.5 — tag', () => {
	it('notes: case- and #-insensitive, and only the notes the viewer receives', () => {
		const { state } = campaign();
		expect(names(read(state, DM_ACTOR.id, 'notes', { tag: '#UNDEAD' }))).toEqual([
			'Rumours of the dead',
			'The King’s true name',
		]);
		// Player isolation: the DM-only note carries the tag too, and still never comes back.
		expect(names(read(state, PLAYER_ACTOR.id, 'notes', { tag: 'undead' }))).toEqual([
			'Rumours of the dead',
		]);
	});

	it('scenes: the scene tag', () => {
		const { state } = campaign();
		expect(names(read(state, DM_ACTOR.id, 'selected-scene', { tag: 'town' }))).toEqual(['Market']);
		expect(names(read(state, PLAYER_ACTOR.id, 'selected-scene', { tag: 'dungeon' }))).toEqual([
			'Crypt',
		]);
	});

	it('an empty result under a filter says nothing matches, not nothing yet', () => {
		const { state } = campaign();
		const result = read(state, DM_ACTOR.id, 'notes', { tag: 'dragons' });
		expect(result.rows).toEqual([]);
		expect(result.emptyLabel).toBe('Nothing here matches these filters.');
	});
});

describe('RC-WID-6.5 — sceneMembership', () => {
	it('active-scene: characters a widget on the active screen is bound to', () => {
		const { state } = campaign();
		expect(
			names(read(state, DM_ACTOR.id, 'visible-characters', { sceneMembership: 'active-scene' })),
		).toEqual(['Mira the Ferryman', 'The Hollow King']);
	});

	it('player isolation: a hidden character bound on a visible screen stays hidden', () => {
		const { state } = campaign();
		expect(
			names(
				read(state, PLAYER_ACTOR.id, 'visible-characters', { sceneMembership: 'active-scene' }),
			),
		).toEqual(['Mira the Ferryman']);
	});

	it('player isolation: a screen the player cannot open contributes nobody', () => {
		const { state, ids } = campaign();
		const hidden = accept(
			dispatchCommand(state, makeEnvironment(), {
				type: 'scene.update-metadata',
				actorId: DM_ACTOR.id,
				payload: { sceneId: ids.Market, visibility: 'dm-only' },
			}),
		);
		expect(
			names(
				read(hidden, PLAYER_ACTOR.id, 'visible-characters', { sceneMembership: 'active-scene' }),
			),
		).toEqual([]);
		expect(
			names(read(hidden, DM_ACTOR.id, 'visible-characters', { sceneMembership: 'active-scene' })),
		).toEqual(['Mira the Ferryman', 'The Hollow King']);
	});

	it('in-combat: characters in the running fight', () => {
		const { state } = campaign();
		expect(names(read(state, PLAYER_ACTOR.id, 'party', { sceneMembership: 'in-combat' }))).toEqual([
			'Aria',
			'Bram',
		]);
	});
});

describe('RC-WID-6.5 — status', () => {
	it('up, bloodied and down read HP against max', () => {
		const { state } = campaign();
		expect(names(read(state, DM_ACTOR.id, 'party', { status: 'up' }))).toEqual(['Aria']);
		expect(names(read(state, DM_ACTOR.id, 'party', { status: 'bloodied' }))).toEqual(['Bram']);
		expect(names(read(state, DM_ACTOR.id, 'party', { status: 'down' }))).toEqual(['Secret Twin']);
	});

	it('player isolation: a down DM-only PC is not revealed by asking for the down', () => {
		const { state } = campaign();
		expect(names(read(state, PLAYER_ACTOR.id, 'party', { status: 'down' }))).toEqual([]);
	});

	it('combatants: by the tracker’s own vitals, a linked character’s HP included', () => {
		const { state } = campaign();
		expect(names(read(state, DM_ACTOR.id, 'current-combatants', { status: 'up' }))).toEqual([
			'Aria',
			'Ghoul',
		]);
		expect(names(read(state, DM_ACTOR.id, 'current-combatants', { status: 'bloodied' }))).toEqual([
			'Bram',
		]);
	});
});

describe('RC-WID-6.5 — sort and limit', () => {
	it('sort by name, by highest and by lowest value', () => {
		const { state } = campaign();
		const order = (options: WidgetDataQueryOptions) =>
			read(state, PLAYER_ACTOR.id, 'visible-characters', options).rows.map((row) => row.primary);
		expect(order({ sort: 'name' })).toEqual([
			'Aria',
			'Bram',
			'Grave Rat',
			'Mira the Ferryman',
			'Pip',
		]);
		expect(order({ sort: 'value-high' })).toEqual([
			'Aria',
			'Mira the Ferryman',
			'Bram',
			'Pip',
			'Grave Rat',
		]);
		expect(order({ sort: 'value-low' })[0]).toBe('Grave Rat');
	});

	it('limit keeps the first N after filtering and sorting', () => {
		const { state } = campaign();
		expect(
			read(state, DM_ACTOR.id, 'visible-characters', {
				characterKinds: ['pc', 'npc'],
				sort: 'value-high',
				limit: 2,
			}).rows.map((row) => row.primary),
		).toEqual(['The Hollow King', 'Aria']);
	});

	it('player isolation: a limit never reaches past what the player may see', () => {
		const { state } = campaign();
		const rows = read(state, PLAYER_ACTOR.id, 'visible-characters', {
			sort: 'value-high',
			limit: 50,
		}).rows;
		expect(rows.map((row) => row.primary)).not.toContain('The Hollow King');
		expect(rows.map((row) => row.primary)).not.toContain('Secret Twin');
	});
});

describe('RC-WID-6.5 — visibility words', () => {
	it('rows carry the app’s word for their visibility, never the enum value', () => {
		const { state } = campaign();
		const rows = read(state, DM_ACTOR.id, 'visible-characters').rows;
		for (const row of rows) {
			expect(row.visibility).toBeDefined();
			expect(row.meta).toBe(VISIBILITY_WORD[row.visibility!]);
		}
		expect(rows.map((row) => row.meta)).toContain('DM only');
		expect(rows.map((row) => row.meta)).toContain('Player visible');
		expect(rows.map((row) => row.meta)).not.toContain('dm-only');
	});
});

describe('RC-WID-6.5 — sample data', () => {
	it('only a data template with no query previews with sample rows', () => {
		const statusList = definitionWith([]);
		expect(previewNeedsSampleData(statusList)).toBe(true);
		expect(
			previewNeedsSampleData({
				...statusList,
				renderEntrypoint: { runtime: 'template', template: 'action-panel', hostApiVersion: 1 },
			}),
		).toBe(false);
		expect(
			previewNeedsSampleData(
				definitionWith([
					{
						id: 'q',
						label: 'Q',
						source: 'notes',
						requiredCapability: 'viewer',
						audience: 'shared',
					},
				]),
			),
		).toBe(false);
	});

	it('sample rows are flagged, and a player preview drops the DM-only one', () => {
		const dm = sampleTemplateData(true);
		expect(dm.primary?.sample).toBe(true);
		expect(dm.queries).toEqual([]);
		const player = sampleTemplateData(false);
		expect(player.primary?.rows.length).toBe((dm.primary?.rows.length ?? 0) - 1);
		expect(player.primary?.rows.some((row) => row.visibility === 'dm-only')).toBe(false);
	});
});
