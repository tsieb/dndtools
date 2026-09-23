// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	VAULT_OBJECT_SUBTYPE_KEY,
	characterLevel,
	createBaselineMcpToolRegistry,
	createDemoMapState,
	dispatchCommand,
	getTypedRelationshipEdgesForActor,
	invokeMcpToolAsAgent,
	mergeSystemWidgetPackages,
	type Actor,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
	type McpAgentInvocation,
} from '@dndtools/core';
import { buildInitialState, makeEnvironment } from '@dndtools/core/testing';
import { seedDemoContent } from './demo-seed';

/**
 * RC-UX-3.7 — the demo vault's SHOWCASE layer. Every item runs through the real core reducer (and
 * the real agent pipeline for the proposal) exactly as `SceneRuntime.seedDemoInOneCommit` stages it,
 * so a mis-shaped command shows up here as a rejection instead of a silently thin demo.
 */

const DM: Actor = { id: 'actor-dm', role: 'dm', displayName: 'Demo DM' };
const PARTICIPANTS: Actor[] = [
	{ id: 'actor-player', role: 'player', displayName: 'Demo Player' },
	{ id: 'actor-player-2', role: 'player', displayName: 'Demo Player 2' },
	{ id: 'actor-player-3', role: 'player', displayName: 'Demo Player 3' },
	{ id: 'actor-observer', role: 'observer', displayName: 'Demo Observer' },
];

function demoVaultSlice(): CoreStateSlice {
	const base = buildInitialState(DM, ...PARTICIPANTS);
	return { ...base, maps: createDemoMapState(), widgets: mergeSystemWidgetPackages(base.widgets) };
}

function stagedRuntime(initial: CoreStateSlice) {
	const env = makeEnvironment();
	const registry = createBaselineMcpToolRegistry();
	const rejected: string[] = [];
	const dispatched: string[] = [];
	const staged = {
		state: initial,
		defaultActorId: DM.id,
		async dispatch(command: CoreCommand): Promise<CommandResult> {
			dispatched.push(command.type);
			const result = dispatchCommand(staged.state, env, command);
			if (result.status === 'accepted') staged.state = result.nextState;
			else rejected.push(`${command.type}: ${result.rejection.message}`);
			return result;
		},
		async invokeAgentTool(invocation: McpAgentInvocation) {
			dispatched.push(`agent:${invocation.toolId}`);
			const { result, nextState } = invokeMcpToolAsAgent(staged.state, env, registry, invocation);
			staged.state = nextState;
			return result;
		},
	};
	return { staged, rejected, dispatched };
}

/** The base seed's `data:` audio loop is refused by core's http(s)-only stream check (known, base). */
function showcaseRejections(rejected: readonly string[]): string[] {
	return rejected.filter(
		(entry) => !(entry.startsWith('audio.configure-source') && entry.includes('http')),
	);
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('RC-UX-3.7 demo vault showcase seed', () => {
	it('gives every surface real content, with no rejected showcase command', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { staged, rejected } = stagedRuntime(demoVaultSlice());

		expect(await seedDemoContent(staged, { showcase: true })).toBe(true);
		expect(showcaseRejections(rejected)).toEqual([]);
		const state = staged.state;

		// A system-package switch: the campaign plays a fork of 5e.
		expect(state.systems.activePackageId).toBe('custom:saltreach-house-rules');

		// Three widgets on the showcase screen, one of them custom, around a map tile.
		const screen = Object.values(state.scenes.scenes).find(
			(scene) => scene.name === 'Showdown at the reliquary',
		)!;
		expect(screen.widgets.map((widget) => widget.type)).toEqual([
			'map',
			'initiative-tracker',
			'tide-clock',
		]);
		expect(screen.widgets[0]!.binding?.source.entityType).toBe('map');
		expect(state.widgets.packages['workspace.tide-clock']?.enabled).toBe(true);

		// A running encounter with tokens on the active map.
		expect(state.session.workflow).toBe('active');
		expect(state.session.activeSceneId).toBe(screen.id);
		expect(state.session.combat.status).toBe('running');
		const combatants = Object.values(state.session.combat.combatants);
		expect(combatants.length).toBe(6);
		const activeMapId = state.session.activeMap?.mapId;
		expect(activeMapId).toBeTruthy();
		// combat.start placed every combatant's token on the active map.
		const tokens = Object.values(state.session.combat.tokens);
		expect(tokens).toHaveLength(combatants.length);
		expect(tokens.every((token) => token.mapId === activeMapId)).toBe(true);

		// A scene package with audio: a card carrying a saved preset of a real same-origin track.
		const cards = Object.values(state.session.sceneCards.cards);
		expect(cards).toHaveLength(1);
		const preset = state.audio.presets[cards[0]!.audioPresetId!];
		expect(preset?.layers.length).toBeGreaterThan(0);
		const source = Object.values(state.audio.sources).find((s) => s.url?.startsWith('http'));
		expect(source?.url).toMatch(/\/audio\/starter\/cavern-drone\.wav$/);
		// Nothing is left playing: opening the demo must not start a drone.
		expect(state.session.audioPlayback.track).toBeNull();

		// Quests and factions, with typed relationships between them.
		const subtypes = Object.values(state.content.items).map(
			(item) => item.fields[VAULT_OBJECT_SUBTYPE_KEY],
		);
		expect(subtypes.filter((subtype) => subtype === 'quest')).toHaveLength(2);
		expect(subtypes.filter((subtype) => subtype === 'faction')).toHaveLength(3);
		const edges = getTypedRelationshipEdgesForActor(state.content, state.permissions, DM.id);
		expect(edges.map((edge) => `${edge.sourceTitle} ${edge.verb} ${edge.targetTitle}`)).toEqual(
			expect.arrayContaining([
				'Faction · The Ashen Hand serves The Hollow King stirs',
				'Quest hook · The missing shipment stolen by Faction · The Ashen Hand',
			]),
		);

		// A calendar with dated notes (base seed) and saved searches.
		expect(Object.keys(state.content.calendars)).toHaveLength(1);
		expect(Object.keys(state.content.savedSearches)).toHaveLength(2);

		// A level-2 character with resources.
		const fighter = Object.values(state.characters.characters).find(
			(character) => character.name === 'Tormund Ironfist',
		)!;
		expect(characterLevel(fighter)).toBe(2);
		expect(Object.keys(fighter.resources?.classResources ?? {})).toEqual(
			expect.arrayContaining(['second-wind', 'action-surge']),
		);

		// One staged assistant proposal, still waiting for the GM.
		const proposals = Object.values(state.mcp.proposals);
		expect(proposals).toHaveLength(1);
		expect(proposals[0]!.status).toBe('pending');
	});

	it('seeds the showcase once: a second boot dispatches nothing new', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { staged, dispatched } = stagedRuntime(demoVaultSlice());
		await seedDemoContent(staged, { showcase: true });
		const operations = staged.state.sync.operations.length;

		dispatched.length = 0;
		await seedDemoContent(staged, { showcase: true });

		// The base seed retries its refused `data:` loop every boot (known); nothing else runs.
		expect(dispatched.filter((type) => type !== 'audio.configure-source')).toEqual([]);
		expect(staged.state.sync.operations.length).toBe(operations);
	});

	it('leaves the original vault on the base seed the e2e fixtures rely on', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { staged, dispatched } = stagedRuntime(demoVaultSlice());

		// This document has no catalog selection, so it is the original vault: no showcase by default.
		await seedDemoContent(staged);

		expect(dispatched).not.toContain('system.fork');
		expect(dispatched).not.toContain('combat.start');
		expect(dispatched.some((type) => type.startsWith('agent:'))).toBe(false);
		expect(staged.state.session.workflow).toBe('idle');
		expect(Object.keys(staged.state.mcp.proposals)).toHaveLength(0);
	});
});
