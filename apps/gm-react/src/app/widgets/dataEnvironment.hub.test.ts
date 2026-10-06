import { describe, expect, it } from 'vitest';
import {
	ALL_WIDGET_HUB_QUERY_SOURCES,
	WIDGET_DATA_QUERY_SOURCES,
	PREVIEW_PLAYER_ACTOR_ID,
	VAULT_OBJECT_SUBTYPE_KEY,
	dispatchCommand,
	permissionsWithPreviewActors,
	type Actor,
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
import {
	VISIBILITY_WORD,
	resolveWidgetTemplateData,
	type WidgetHostContext,
	type WidgetLiveTable,
	type WidgetQueryResult,
} from './dataEnvironment';
import type { BoardWidget } from '../board-helpers';

/**
 * RC-WID-5.2 — one isolation test per hub query source.
 *
 * The fixture seeds, for every source, at least one row only the DM may see, named with `SECRET`,
 * next to a row a player may see. Each case then proves three things:
 *
 * 1. the DM's reading really carries the DM-only row (the negative control: without it a test that
 *    finds no `SECRET` would pass on an empty fixture);
 * 2. no non-DM projection carries it — a real player, an observer, and the reserved preview player
 *    the builder previews with. The queries are declared `audience: 'shared'` on purpose, so it is
 *    the core read that keeps the row out, not the declaration's own audience gate;
 * 3. where the source is not DM-only in the core, the player still gets the row they may see, so
 *    the pass is not an empty list.
 *
 * The live-table sources (`live-peers`, `table-readiness`) read the host transport, so the fixture
 * also passes a hosting DM's table: the secret is the transport's peer ids and an invitation the
 * DM has not had answered, neither of which the host's presence broadcast sends a player.
 */

const SECRET = 'SECRET';
const OTHER_PLAYER: Actor = { id: 'actor-player-2', role: 'player', displayName: 'Second Player' };

function accept(result: ReturnType<typeof dispatchCommand>): CoreStateSlice {
	if (result.status !== 'accepted') {
		throw new Error(`command rejected: ${JSON.stringify(result.rejection)}`);
	}
	return result.nextState;
}

/** A live session on a DM-only screen, with a DM-only and a player-visible row for every source. */
function hubCampaign() {
	const env = makeEnvironment();
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OTHER_PLAYER, OBSERVER_ACTOR);
	const run = (command: CoreCommand) => {
		state = accept(dispatchCommand(state, env, command));
	};
	const dm = DM_ACTOR.id;

	run({ type: 'command-center.ensure-home', actorId: dm, payload: {} });
	run({
		type: 'scene.create',
		actorId: dm,
		payload: { name: 'Open Square', visibility: 'player-visible' },
	});
	run({
		type: 'scene.create',
		actorId: dm,
		payload: { name: `${SECRET} Lair`, visibility: 'dm-only' },
	});
	run({
		type: 'scene.create',
		actorId: dm,
		payload: { name: 'Shared Hall', visibility: 'shared' },
	});
	const sceneId = (name: string) =>
		Object.values(state.scenes.scenes).find((scene) => scene.name === name)!.id;
	const openScene = sceneId('Open Square');
	const secretScene = sceneId(`${SECRET} Lair`);
	run({
		type: 'session.set-workflow',
		actorId: dm,
		payload: { workflow: 'active', activeSceneId: secretScene },
	});

	// Characters. Quick-create makes everything but PCs, so two sidekicks are re-kinded as PCs.
	const quick = (kind: string, name: string, visibility?: string) =>
		run({
			type: 'character.quick-create',
			actorId: dm,
			payload: {
				kind,
				name,
				...(visibility ? { visibility } : {}),
				combat: { hp: 10, maxHp: 20, ac: 14 },
			},
		});
	quick('sidekick', 'Aria', 'player-visible');
	quick('sidekick', `${SECRET} Spy`, 'dm-only');
	quick('npc', 'Gate Guard', 'player-visible');
	quick('monster', `${SECRET} Horror`, 'dm-only');
	const characterId = (name: string) =>
		Object.values(state.characters.characters).find((c) => c.name === name)!.id;
	for (const name of ['Aria', `${SECRET} Spy`]) {
		const id = characterId(name);
		state = {
			...state,
			characters: {
				...state.characters,
				characters: {
					...state.characters.characters,
					[id]: { ...state.characters.characters[id]!, kind: 'pc' },
				},
			},
		};
	}
	run({
		type: 'character.rest',
		actorId: dm,
		payload: { characterId: characterId('Aria'), rest: 'long' },
	});
	run({
		type: 'character.rest',
		actorId: dm,
		payload: { characterId: characterId(`${SECRET} Spy`), rest: 'short' },
	});

	// Vault content: notes, quests, factions, dice tables and maps on both sides of the line.
	const item = (
		kind: 'note' | 'object',
		title: string,
		visibility: string,
		fields?: Record<string, unknown>,
	) =>
		run({
			type: 'content.create-item',
			actorId: dm,
			payload: { kind, title, visibility, ...(fields ? { fields } : {}) },
		});
	item('note', 'Open rumour', 'player-visible');
	item('note', `${SECRET} plan`, 'dm-only');
	item('object', 'Open quest', 'player-visible', { [VAULT_OBJECT_SUBTYPE_KEY]: 'quest' });
	item('object', `${SECRET} quest`, 'dm-only', { [VAULT_OBJECT_SUBTYPE_KEY]: 'quest' });
	item('object', 'Open guild', 'player-visible', { [VAULT_OBJECT_SUBTYPE_KEY]: 'faction' });
	item('object', `${SECRET} cabal`, 'dm-only', { [VAULT_OBJECT_SUBTYPE_KEY]: 'faction' });
	const table = { [VAULT_OBJECT_SUBTYPE_KEY]: 'dice-table', dice: '1d2', entries: ['A', 'B'] };
	item('object', 'Open table', 'player-visible', table);
	item('object', `${SECRET} table`, 'dm-only', table);
	run({
		type: 'map.create',
		actorId: dm,
		payload: { name: 'Open map', visibility: 'player-visible' },
	});
	run({ type: 'map.create', actorId: dm, payload: { name: `${SECRET} map` } });
	const itemId = (title: string) =>
		Object.values(state.content.items).find((entry) => entry.title === title)!.id;

	// Rolls: one secret, one public, one public draw on the public table.
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
	run({
		type: 'dice.roll-table',
		actorId: dm,
		payload: { tableItemId: itemId('Open table'), seed: 's3' },
	});

	// Handouts: one to this player, one to the other player only.
	const handout = (title: string, recipient: string) =>
		run({
			type: 'session.deliver-handout',
			actorId: dm,
			payload: {
				title,
				sceneId: openScene,
				recipientActorIds: [recipient],
				sections: [{ id: 'sec-1', heading: title, body: 'Text', visibility: 'player-visible' }],
			},
		});
	handout('Open letter', PLAYER_ACTOR.id);
	handout(`${SECRET} dossier`, OTHER_PLAYER.id);

	run({
		type: 'session.pin-quick-reference',
		actorId: dm,
		payload: { kind: 'note', label: `${SECRET} pin`, targetId: itemId(`${SECRET} plan`) },
	});

	// Projections: this player is shown the open screen, the other player the secret one.
	const project = (playerActorId: string, target: string) =>
		run({
			type: 'session.project-player-view',
			actorId: dm,
			payload: {
				playerActorIds: [playerActorId],
				connectionState: 'connected',
				target: {
					kind: 'scene',
					sceneId: target,
					sectionIds: null,
					widgetInstanceIds: null,
					displayState: null,
					mapRegion: null,
				},
			},
		});
	project(PLAYER_ACTOR.id, openScene);
	project(OTHER_PLAYER.id, secretScene);

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

	// Presence is ephemeral and never op-logged, so it is set directly: the DM is looking at the
	// secret screen, which must not reach a player through the DM's presence row.
	const now = '2026-06-03T12:00:00.000Z';
	state = {
		...state,
		presence: {
			schemaVersion: 1,
			entries: {
				[DM_ACTOR.id]: {
					actorId: DM_ACTOR.id,
					status: 'online',
					device: 'desktop',
					activeSceneId: secretScene,
					updatedAt: now,
				},
				[PLAYER_ACTOR.id]: {
					actorId: PLAYER_ACTOR.id,
					status: 'online',
					device: 'mobile',
					activeSceneId: openScene,
					updatedAt: now,
				},
			},
		},
	};

	return { state, env, openScene, secretScene };
}

const HUB_SOURCES = ALL_WIDGET_HUB_QUERY_SOURCES;

/** A hosting DM's table: two connected players and one invitation nobody has answered yet. */
const HOST_TABLE: WidgetLiveTable = {
	role: 'host',
	peers: [
		{
			peerId: `peer-${SECRET}-1`,
			actorId: PLAYER_ACTOR.id,
			displayName: PLAYER_ACTOR.displayName,
			role: 'player',
			connected: true,
			status: 'online',
			hand: false,
			ready: true,
		},
		{
			peerId: `peer-${SECRET}-2`,
			actorId: OTHER_PLAYER.id,
			displayName: OTHER_PLAYER.displayName,
			role: 'player',
			connected: true,
			status: 'away',
			hand: true,
			ready: false,
		},
		{
			peerId: `peer-${SECRET}-3`,
			actorId: 'actor-invitee',
			displayName: `${SECRET} Invitee`,
			role: 'observer',
			connected: false,
			status: 'online',
			hand: false,
			ready: false,
		},
	],
};

const HOST: WidgetHostContext = { campaignName: 'The Drowned Vault', table: HOST_TABLE };

function query(
	source: WidgetDataQueryDefinition['source'],
	audience: WidgetDataQueryDefinition['audience'] = 'shared',
): WidgetDataQueryDefinition {
	return { id: source, label: source, source, requiredCapability: 'viewer', audience };
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

const WIDGET: BoardWidget = {
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
};

function read(
	state: CoreStateSlice,
	actorId: string,
	source: WidgetDataQueryDefinition['source'],
	host: WidgetHostContext = HOST,
): WidgetQueryResult {
	const data = resolveWidgetTemplateData(
		state,
		actorId,
		definitionWith([query(source)]),
		WIDGET,
		host,
	);
	const result = data.queries[0];
	if (!result) throw new Error(`no result for ${source}`);
	return result;
}

/** Everything a template could print from a result: rows, header and empty copy. */
function printed(result: WidgetQueryResult): string {
	return JSON.stringify({ rows: result.rows, header: result.header });
}

const names = (result: WidgetQueryResult) => result.rows.map((row) => row.primary);
const valueOf = (result: WidgetQueryResult, id: string) =>
	result.rows.find((row) => row.id === id)?.value;

/** The three non-DM readers: a real player, an observer, and the builder's preview player. */
function nonDmReadings(state: CoreStateSlice, source: WidgetDataQueryDefinition['source']) {
	const preview = { ...state, permissions: permissionsWithPreviewActors(state.permissions) };
	return [
		['a player projection', read(state, PLAYER_ACTOR.id, source)],
		['an observer projection', read(state, OBSERVER_ACTOR.id, source)],
		['the preview player projection', read(preview, PREVIEW_PLAYER_ACTOR_ID, source)],
	] as const;
}

/**
 * Per source: what the DM's reading must show (the control) and what the player still gets. A
 * source the core keeps DM-only has `playerRows: 0`.
 */
type Case = {
	source: WidgetDataQueryDefinition['source'];
	dm: (result: WidgetQueryResult) => void;
	player: (result: WidgetQueryResult) => void;
	/** Every row is DM material, so every non-DM reading must be empty, not merely secret-free. */
	dmOnly?: true;
};

const CASES: Case[] = [
	{
		source: 'screens',
		dm: (r) => {
			expect(names(r)).toContain(`${SECRET} Lair`);
			const live = r.rows.find((row) => row.active);
			expect(live?.primary).toBe(`${SECRET} Lair`);
			expect(live?.secondary).toMatch(/ · Live$/);
			expect(live?.thumbnail).toBeTruthy();
			// Live and private at once: the live flag does not overwrite the visibility.
			expect(live?.visibility).toBe('dm-only');
			const visibilityOf = (name: string) => r.rows.find((row) => row.primary === name)?.visibility;
			expect(visibilityOf('Open Square')).toBe('player-visible');
			expect(visibilityOf('Shared Hall')).toBe('shared');
		},
		player: (r) => {
			expect(names(r)).toContain('Open Square');
			expect(r.rows.find((row) => row.primary === 'Open Square')?.visibility).toBe(
				'player-visible',
			);
		},
	},
	{
		source: 'vault-counts',
		// Counts carry no names, so the control is the number: each DM-only entity is counted for the
		// DM and not for the player.
		dm: (r) => {
			expect(valueOf(r, 'pcs')).toBe(2);
			expect(valueOf(r, 'monsters')).toBe(1);
			expect(valueOf(r, 'notes')).toBe(2);
			expect(valueOf(r, 'threads')).toBe(2);
			expect(valueOf(r, 'factions')).toBe(2);
			expect(valueOf(r, 'maps')).toBe(2);
		},
		player: (r) => {
			expect(valueOf(r, 'pcs')).toBe(1);
			expect(valueOf(r, 'monsters')).toBe(0);
			expect(valueOf(r, 'notes')).toBe(1);
			expect(valueOf(r, 'threads')).toBe(1);
			expect(valueOf(r, 'factions')).toBe(1);
			expect(valueOf(r, 'maps')).toBe(1);
		},
	},
	{
		source: 'party',
		dm: (r) => {
			expect(names(r)).toEqual(expect.arrayContaining(['Aria', `${SECRET} Spy`]));
			expect(r.rows.find((row) => row.primary === 'Aria')?.avatar).toBe('A');
		},
		player: (r) => expect(names(r)).toEqual(['Aria']),
	},
	{
		source: 'campaign',
		dm: (r) => {
			expect(r.rows.find((row) => row.id === 'live-screen')?.secondary).toBe(`${SECRET} Lair`);
			expect(r.rows.find((row) => row.id === 'name')?.secondary).toBe('The Drowned Vault');
			expect(r.rows.find((row) => row.id === 'workflow')?.secondary).toBe('active');
		},
		player: (r) => {
			expect(r.rows.find((row) => row.id === 'live-screen')?.secondary).toBe('None');
			expect(r.rows.find((row) => row.id === 'system')?.secondary).toBeTruthy();
		},
	},
	{
		source: 'dice-history',
		dm: (r) => expect(names(r)).toEqual(expect.arrayContaining([`${SECRET} check`, 'Open roll'])),
		player: (r) => expect(names(r)).toContain('Open roll'),
	},
	{
		source: 'handouts',
		dm: (r) =>
			expect(names(r)).toEqual(expect.arrayContaining(['Open letter', `${SECRET} dossier`])),
		player: (r) => expect(names(r)).toEqual(['Open letter']),
	},
	{
		source: 'rollable-tables',
		dm: (r) => expect(names(r)).toEqual(expect.arrayContaining(['Open table', `${SECRET} table`])),
		player: (r) => {
			expect(names(r)).toEqual(['Open table']);
			expect(r.rows[0]?.secondary).toMatch(/^Last draw: /);
		},
	},
	{
		source: 'quick-reference',
		dm: (r) => expect(names(r)).toEqual([`${SECRET} pin`]),
		player: (r) => expect(r.rows).toEqual([]),
		dmOnly: true,
	},
	{
		source: 'continuity-digest',
		// The digest is DM-only in the core; its prompts here name the secret pin and the fight.
		dm: (r) => expect(printed(r)).toContain(SECRET),
		player: (r) => expect(r.rows).toEqual([]),
		dmOnly: true,
	},
	{
		source: 'rest-log',
		dm: (r) => expect(names(r)).toEqual(expect.arrayContaining(['Aria', `${SECRET} Spy`])),
		player: (r) => {
			expect(names(r)).toEqual(['Aria']);
			expect(r.rows[0]?.meta).toBe('Long rest');
		},
	},
	{
		source: 'presence',
		dm: (r) => {
			expect(r.rows.find((row) => row.id === DM_ACTOR.id)?.secondary).toContain(`${SECRET} Lair`);
		},
		player: (r) => {
			// The DM's row still arrives, stripped of the screen this player cannot see.
			expect(r.rows.find((row) => row.id === DM_ACTOR.id)?.secondary).toBe('desktop');
		},
	},
	{
		source: 'player-projections',
		dm: (r) => {
			expect(r.rows.find((row) => row.id === OTHER_PLAYER.id)?.secondary).toBe(`${SECRET} Lair`);
		},
		player: (r) => expect(r.rows.every((row) => row.id !== OTHER_PLAYER.id)).toBe(true),
	},
	{
		source: 'initiative-call',
		dm: (r) => expect(names(r)).toContain(`${SECRET} Ambusher`),
		player: (r) => expect(names(r)).toContain('Aria'),
	},
	{
		source: 'combatant-status',
		dm: (r) => expect(names(r)).toContain(`${SECRET} Ambusher`),
		player: (r) => expect(names(r)).toContain('Aria'),
	},
	{
		source: 'capture-candidates',
		dm: (r) =>
			expect(names(r)).toEqual(expect.arrayContaining([`${SECRET} Horror`, `${SECRET} plan`])),
		player: (r) => expect(names(r)).toEqual(expect.arrayContaining(['Aria', 'Open rumour'])),
	},
	{
		source: 'widget-library',
		// The whole library is DM material (CMD-005): every row is a DM-only row.
		dm: (r) => expect(r.rows.length).toBeGreaterThan(0),
		player: (r) => expect(r.rows).toEqual([]),
		dmOnly: true,
	},
	{
		source: 'live-peers',
		// The DM reads the host's peer list: transport ids, roles and the unanswered invitation.
		dm: (r) => {
			expect(r.header).toBe('2 connected');
			const invitee = r.rows.find((row) => row.primary === `${SECRET} Invitee`);
			expect(invitee?.meta).toBe('Invited');
			expect(invitee?.active).toBe(false);
			expect(r.rows.find((row) => row.id === `peer-${SECRET}-1`)?.secondary).toBe(
				'Player · online',
			);
			expect(r.rows.find((row) => row.id === `peer-${SECRET}-2`)?.meta).toBe('Hand raised');
		},
		// A player reads what the presence broadcast sends them: connected peers by actor, no roles.
		player: (r) => {
			expect(r.rows.map((row) => row.id)).toEqual([PLAYER_ACTOR.id, OTHER_PLAYER.id]);
			const self = r.rows.find((row) => row.id === PLAYER_ACTOR.id);
			expect(self?.meta).toBe('Ready');
			expect(self?.avatar).toBeTruthy();
			expect(r.rows.every((row) => !row.secondary?.includes('Player'))).toBe(true);
		},
	},
	{
		source: 'table-readiness',
		// The DM's call cue: connected players only, ready or not, keyed by transport peer id.
		dm: (r) => {
			expect(r.header).toBe('1 of 2 ready');
			expect(r.rows.map((row) => [row.id, row.meta])).toEqual([
				[`peer-${SECRET}-1`, 'Ready'],
				[`peer-${SECRET}-2`, 'Not ready'],
			]);
		},
		player: (r) => {
			expect(r.rows).toEqual([]);
			expect(r.emptyLabel).toBe('Only the DM sees table readiness.');
		},
		dmOnly: true,
	},
];

describe('RC-WID-5.2 — hub query sources', () => {
	it('has an isolation case for every hub source', () => {
		// The two archive-backed sources need an archived session, so they have their own fixtures.
		const ownFixture = new Set(['session-archives', 'continuity-mentions']);
		expect(CASES.map((entry) => entry.source).sort()).toEqual(
			HUB_SOURCES.filter((source) => !ownFixture.has(source)).sort(),
		);
	});

	describe.each(CASES)('$source', ({ source, dm, player, dmOnly }) => {
		const { state } = hubCampaign();

		it('the DM reading carries the DM-only row (control)', () => {
			const result = read(state, DM_ACTOR.id, source);
			expect(result.withheld).toBeNull();
			dm(result);
		});

		it.each(nonDmReadings(state, source))('%s never carries a DM-only row', (_who, result) => {
			expect(result.withheld).toBeNull();
			expect(printed(result)).not.toContain(SECRET);
			if (dmOnly) expect(result.rows).toEqual([]);
		});

		it('a player still receives the rows they may see', () => {
			player(read(state, PLAYER_ACTOR.id, source));
		});

		it('declared DM-only, it is withheld from a player whatever the read returns', () => {
			const data = resolveWidgetTemplateData(
				state,
				PLAYER_ACTOR.id,
				definitionWith([query(source, 'dm')]),
				WIDGET,
			);
			expect(data.queries[0]?.withheld).toBe('audience');
			expect(data.queries[0]?.rows).toEqual([]);
		});
	});

	describe('session-archives', () => {
		// Archiving resets the live session fields, so this source gets its own branch of the fixture.
		function archived() {
			const { state, env } = hubCampaign();
			const next = accept(
				dispatchCommand(state, env, {
					type: 'session.set-workflow',
					actorId: DM_ACTOR.id,
					payload: { workflow: 'recap' },
				}),
			);
			const archiveId = Object.keys(next.session.archives)[0]!;
			return { state: next, env, archiveId };
		}

		it('an archive without a recap is the DM’s alone', () => {
			const { state, archiveId } = archived();
			expect(read(state, DM_ACTOR.id, 'session-archives').rows.map((row) => row.id)).toEqual([
				archiveId,
			]);
			for (const [, result] of nonDmReadings(state, 'session-archives')) {
				expect(result.withheld).toBeNull();
				expect(result.rows).toEqual([]);
			}
		});

		it('a player lists it once the recap the core delivers to them exists', () => {
			const { state, env, archiveId } = archived();
			const recapped = accept(
				dispatchCommand(state, env, {
					type: 'session.author-recap',
					actorId: DM_ACTOR.id,
					payload: { archiveId, markdown: 'The party left the lair.' },
				}),
			);
			const rows = read(recapped, PLAYER_ACTOR.id, 'session-archives').rows;
			expect(rows.map((row) => row.id)).toEqual([archiveId]);
			expect(rows[0]?.meta).toBe('Recap written');
		});
	});

	describe('screens visibility', () => {
		it('keeps each visibility apart from the live flag, whichever screen is live', () => {
			const { state, env, openScene, secretScene } = hubCampaign();
			const sharedScene = Object.values(state.scenes.scenes).find(
				(scene) => scene.name === 'Shared Hall',
			)!.id;
			const expected = {
				[openScene]: 'player-visible',
				[secretScene]: 'dm-only',
				[sharedScene]: 'shared',
			} as const;
			for (const liveId of [openScene, secretScene, sharedScene]) {
				const live = accept(
					dispatchCommand(state, env, {
						type: 'session.set-workflow',
						actorId: DM_ACTOR.id,
						payload: { workflow: 'active', activeSceneId: liveId },
					}),
				);
				const rows = read(live, DM_ACTOR.id, 'screens').rows.filter((row) => row.id in expected);
				expect(rows).toHaveLength(3);
				for (const screen of rows) {
					expect(screen.visibility).toBe(expected[screen.id]);
					// RC-WID-6.5 — the tag a template prints is the app's word, never the enum value.
					expect(screen.meta).toBe(VISIBILITY_WORD[expected[screen.id]]);
					expect(screen.active).toBe(screen.id === liveId);
				}
			}
		});
	});

	describe('live-table sources without a host table', () => {
		it.each(['live-peers', 'table-readiness'] as const)(
			'%s says the table is unknown rather than empty',
			(source) => {
				const { state } = hubCampaign();
				const result = read(state, DM_ACTOR.id, source, { campaignName: null });
				expect(result.rows).toEqual([]);
				expect(result.emptyLabel).toBe('The live table is not available here.');
			},
		);

		it('a solo device says it is not hosting', () => {
			const { state } = hubCampaign();
			const result = read(state, DM_ACTOR.id, 'live-peers', { table: { role: 'solo', peers: [] } });
			expect(result.rows).toEqual([]);
			expect(result.header).toBe('Not hosting a table');
		});

		it('a joined device lists the roster the host projected for it', () => {
			const { state } = hubCampaign();
			const joined: WidgetLiveTable = {
				role: 'joined',
				peers: [
					{
						peerId: OTHER_PLAYER.id,
						actorId: OTHER_PLAYER.id,
						displayName: OTHER_PLAYER.displayName,
						role: null,
						connected: true,
						status: 'online',
						hand: false,
						ready: true,
					},
				],
			};
			const result = read(state, PLAYER_ACTOR.id, 'live-peers', { table: joined });
			expect(result.rows.map((row) => [row.id, row.meta])).toEqual([[OTHER_PLAYER.id, 'Ready']]);
			// Readiness stays the hosting DM's: a joined device has no roster to call from.
			expect(read(state, PLAYER_ACTOR.id, 'table-readiness', { table: joined }).rows).toEqual([]);
		});
	});

	describe('continuity-mentions', () => {
		// SE-41 reads the capture a saved session log left on its archive, so it needs an archive. The
		// mention detector reads title-case names, so the two names here stand in for `SECRET`:
		// `Captain Vellis` has no record anywhere, and `Warden Grell` is a DM-only NPC, a record the DM
		// holds and a player cannot see. Neither may reach a non-DM reading.
		const UNKNOWN = 'Captain Vellis';
		const HIDDEN = 'Warden Grell';

		function captured() {
			const { state, env } = hubCampaign();
			const withHidden = accept(
				dispatchCommand(state, env, {
					type: 'character.quick-create',
					actorId: DM_ACTOR.id,
					payload: { kind: 'npc', name: HIDDEN, visibility: 'dm-only' },
				}),
			);
			const recap = accept(
				dispatchCommand(withHidden, env, {
					type: 'session.set-workflow',
					actorId: DM_ACTOR.id,
					payload: { workflow: 'recap' },
				}),
			);
			const archiveId = Object.keys(recap.session.archives)[0]!;
			const next = accept(
				dispatchCommand(recap, env, {
					type: 'session.author-recap',
					actorId: DM_ACTOR.id,
					payload: {
						archiveId,
						markdown: 'The party reached the gate.',
						happened: `The party met ${UNKNOWN} at the gate. ${HIDDEN} watched from the wall.`,
						changes: [],
						followUps: ['Follow up with Aria about the toll.'],
					},
				}),
			);
			return { state: next, env };
		}

		it('the DM reading names the mention with no record (control)', () => {
			const { state } = captured();
			const result = read(state, DM_ACTOR.id, 'continuity-mentions');
			expect(names(result)).toEqual([UNKNOWN]);
			expect(result.header).toBe('1 name mentioned without notes');
			expect(result.rows[0]?.meta).toBe('No record yet');
		});

		it.each([
			['a player projection', PLAYER_ACTOR.id, false],
			['an observer projection', OBSERVER_ACTOR.id, false],
			['the preview player projection', PREVIEW_PLAYER_ACTOR_ID, true],
		] as const)('%s never carries a DM-only row', (_who, actorId, preview) => {
			const { state } = captured();
			const viewed = preview
				? { ...state, permissions: permissionsWithPreviewActors(state.permissions) }
				: state;
			const result = read(viewed, actorId, 'continuity-mentions');
			expect(result.withheld).toBeNull();
			// Checked against a player's roster, the hidden NPC would read as unknown: none may surface.
			expect(printed(result)).not.toContain(UNKNOWN);
			expect(printed(result)).not.toContain(HIDDEN);
			expect(result.rows).toEqual([]);
		});

		it('a quick-created NPC drops off the list', () => {
			const { state, env } = captured();
			const created = accept(
				dispatchCommand(state, env, {
					type: 'character.quick-create',
					actorId: DM_ACTOR.id,
					payload: { kind: 'npc', name: UNKNOWN, visibility: 'dm-only' },
				}),
			);
			const result = read(created, DM_ACTOR.id, 'continuity-mentions');
			expect(result.rows).toEqual([]);
			expect(result.emptyLabel).toBe('Every name in the last session log has a record.');
		});

		it('before any capture there is nothing to read', () => {
			const { state } = hubCampaign();
			const result = read(state, DM_ACTOR.id, 'continuity-mentions');
			expect(result.rows).toEqual([]);
			expect(result.emptyLabel).toBe('No session log saved yet.');
		});
	});
});

describe('character field redaction in live previews', () => {
	function campaign(dmOnlyFields: string[], pc = true) {
		const state = accept(
			dispatchCommand(
				buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR),
				makeEnvironment(),
				{
					type: 'character.quick-create',
					actorId: DM_ACTOR.id,
					payload: {
						kind: 'npc',
						name: 'Visible Guard',
						visibility: 'player-visible',
						combat: { hp: 7, maxHp: 19, tempHp: 3, ac: 12, conditions: ['poisoned'] },
						dmOnlyFields,
					},
				},
			),
		);
		// Quick-create does not create PCs; retain the command-created field privacy for the PC case.
		if (pc) Object.values(state.characters.characters)[0]!.kind = 'pc';
		state.permissions = permissionsWithPreviewActors(state.permissions);
		return state;
	}

	it.each([PLAYER_ACTOR.id, PREVIEW_PLAYER_ACTOR_ID])(
		'renders the whole catalogue with a redacted NPC for %s',
		(actorId) => {
			const state = campaign(['combat.conditions'], false);
			for (const source of WIDGET_DATA_QUERY_SOURCES)
				expect(() => read(state, actorId, source), source).not.toThrow();
			expect(read(state, actorId, 'party').rows).toEqual([]);
		},
	);

	for (const source of ['party', 'visible-characters'] as const) {
		it.each([PLAYER_ACTOR.id, PREVIEW_PLAYER_ACTOR_ID])(
			`${source} omits private PC conditions for %s`,
			(actorId) => {
				const state = campaign(['combat.conditions']);
				const result = read(state, actorId, source);
				expect(result.rows).toHaveLength(1);
				expect(result.rows[0]).toMatchObject({ primary: 'Visible Guard', value: 7, max: 19 });
				expect(printed(result)).not.toContain('poisoned');
				if (source === 'party')
					expect(printed(read(state, DM_ACTOR.id, source))).toContain('poisoned');
			},
		);
		it.each(['hp', 'maxHp', 'tempHp', 'ac', 'all'])(
			`${source} omits redacted %s without inventing vitals`,
			(field) => {
				const fields = field === 'all' ? ['hp', 'maxHp', 'tempHp', 'ac', 'conditions'] : [field];
				const state = campaign(fields.map((key) => `combat.${key}`));
				for (const actorId of [PLAYER_ACTOR.id, PREVIEW_PLAYER_ACTOR_ID]) {
					const member = read(state, actorId, source).rows[0]!;
					expect(member.primary).toBe('Visible Guard');
					expect(JSON.stringify(member)).not.toContain('undefined');
					if (fields.includes('hp')) {
						expect(member.value).toBeUndefined();
						expect(member.secondary ?? '').not.toContain('7');
					}
					if (fields.includes('maxHp')) {
						expect(member.max).toBeUndefined();
						expect(member.secondary ?? '').not.toContain('19');
					}
					if (fields.includes('tempHp'))
						expect(member.secondary ?? '').not.toContain('3 temporary');
					if (fields.includes('ac')) expect(member.secondary ?? '').not.toContain('AC');
					if (field === 'all') expect(member.secondary).toBeUndefined();
				}
				expect(read(state, DM_ACTOR.id, source).rows[0]).toMatchObject({ value: 7, max: 19 });
				expect(read(state, OBSERVER_ACTOR.id, source).rows).toEqual([]);
			},
		);
	}
});
