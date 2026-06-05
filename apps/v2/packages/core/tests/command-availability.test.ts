import { describe, expect, it } from 'vitest';
import { dispatchCommand } from '../src/commands/dispatch';
import type {
	CommandResult,
	CoreCommand,
	CoreEnvironment,
	CoreStateSlice,
} from '../src/commands/types';
import {
	listPaletteCommands,
	resolvePaletteCommand,
	searchPaletteCommands,
	type PaletteCommand,
	type PaletteCoreCommand,
} from '../src/queries/command-availability';
import { listNavigationSections } from '../src/queries/navigation';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

function dispatch(
	state: CoreStateSlice,
	env: CoreEnvironment,
	command: CoreCommand,
): CommandResult {
	return dispatchCommand(state, env, command);
}

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got rejected: ${result.rejection.message}`);
	}
	return result;
}

/** A vault with the Command Center home configured plus a DM-only and a
 *  player-visible scene, so visibility filtering has something to filter. */
function vaultWithScenes(): {
	env: CoreEnvironment;
	state: CoreStateSlice;
	dmSceneId: string;
	playerSceneId: string;
} {
	const env = makeEnvironment();
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
	state = accept(
		dispatch(state, env, {
			type: 'command-center.ensure-home',
			actorId: DM_ACTOR.id,
			payload: {},
		}),
	).nextState;
	const dm = accept(
		dispatch(state, env, {
			type: 'scene.create',
			actorId: DM_ACTOR.id,
			payload: { name: 'Secret Lair', visibility: 'dm-only' },
		}),
	);
	state = dm.nextState;
	const dmSceneId = (dm.events.find((e) => e.kind === 'scene.created') as { sceneId: string })
		.sceneId;
	const player = accept(
		dispatch(state, env, {
			type: 'scene.create',
			actorId: DM_ACTOR.id,
			payload: { name: 'Tavern', visibility: 'player-visible' },
		}),
	);
	state = player.nextState;
	const playerSceneId = (
		player.events.find((e) => e.kind === 'scene.created') as {
			sceneId: string;
		}
	).sceneId;
	return { env, state, dmSceneId, playerSceneId };
}

const DESKTOP = { profileId: 'desktop' as const };
const MOBILE = { profileId: 'mobile' as const };

describe('NAV-010 actor-filtered navigation availability', () => {
	it('gives the DM every section', () => {
		const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const ids = listNavigationSections(state.permissions, DM_ACTOR.id).map((s) => s.id);
		// Atlas (all-roles map surface) and Characters (CHAR creation epic) are released.
		expect(ids).toEqual(['command-center', 'scenes', 'atlas', 'characters', 'settings']);
	});

	it('hides DM-only sections from players and observers without leaking them', () => {
		const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
		const playerIds = listNavigationSections(state.permissions, PLAYER_ACTOR.id).map((s) => s.id);
		const observerIds = listNavigationSections(state.permissions, OBSERVER_ACTOR.id).map(
			(s) => s.id,
		);
		// Command Center (home), the all-roles Atlas, and Settings are reachable; the player
		// also reaches the Characters section (CHAR), while the observer does not. The DM-only
		// Scenes authoring section is absent entirely (NAV-009 AC2, NAV-010 AC1).
		expect(playerIds).toEqual(['command-center', 'atlas', 'characters', 'settings']);
		expect(observerIds).toEqual(['command-center', 'atlas', 'settings']);
		expect(playerIds).not.toContain('scenes');
		expect(observerIds).not.toContain('characters');
	});

	it('fails closed for an unknown actor', () => {
		const state = buildInitialState(DM_ACTOR);
		expect(listNavigationSections(state.permissions, 'nobody')).toEqual([]);
	});
});

describe('NAV-008 command palette catalog', () => {
	it('offers navigation, settings, scene, action, and widget commands to the DM', () => {
		const { state } = vaultWithScenes();
		const commands = listPaletteCommands(state, DM_ACTOR.id, DESKTOP);
		const categories = new Set(commands.map((c) => c.category));
		expect(categories).toContain('navigation');
		expect(categories).toContain('settings');
		expect(categories).toContain('scene');
		expect(categories).toContain('action');
		expect(categories).toContain('widget');

		// Navigation entries for the top-level sections are present.
		expect(commands.some((c) => c.id === 'nav.command-center')).toBe(true);
		expect(commands.some((c) => c.id === 'nav.scenes')).toBe(true);
		expect(commands.some((c) => c.id === 'nav.settings')).toBe(true);
		// The Scene-authoring core command is present.
		expect(commands.some((c) => c.id === 'scene.create' && c.kind === 'core-command')).toBe(true);
	});

	it('hides every DM-only action and section from a player (AC1)', () => {
		const { state } = vaultWithScenes();
		const commands = listPaletteCommands(state, PLAYER_ACTOR.id, DESKTOP);
		// No core (mutation) commands at all for a player — fail closed, no DM-only leak.
		expect(commands.every((c) => c.kind === 'navigation')).toBe(true);
		expect(commands.some((c) => c.id === 'scene.create')).toBe(false);
		expect(commands.some((c) => c.id === 'cc.preset.save')).toBe(false);
		expect(commands.some((c) => c.id.startsWith('cc.widget.add:'))).toBe(false);
		// The DM-only Scenes section is absent.
		expect(commands.some((c) => c.id === 'nav.scenes')).toBe(false);
	});

	it('does not leak a hidden scene through scene deep links (NAV-010 AC1)', () => {
		const { state, dmSceneId, playerSceneId } = vaultWithScenes();

		const dmCommands = listPaletteCommands(state, DM_ACTOR.id, DESKTOP);
		expect(dmCommands.some((c) => c.id === `nav.scene:${dmSceneId}`)).toBe(true);
		expect(dmCommands.some((c) => c.id === `nav.scene:${playerSceneId}`)).toBe(true);

		const playerCommands = listPaletteCommands(state, PLAYER_ACTOR.id, DESKTOP);
		// Only the player-visible scene is reachable; the dm-only scene id appears nowhere.
		expect(playerCommands.some((c) => c.id === `nav.scene:${playerSceneId}`)).toBe(true);
		const serialized = JSON.stringify(playerCommands);
		expect(serialized).not.toContain(dmSceneId);
		expect(serialized).not.toContain('Secret Lair');
	});

	it('shows a disabled core command with a non-leaking accessible reason (AC2)', () => {
		// No Command Center home configured yet: save-preset and add-widget are visible to
		// the DM but unavailable with a generic reason, and cannot be resolved.
		const state = buildInitialState(DM_ACTOR);
		const commands = listPaletteCommands(state, DM_ACTOR.id, DESKTOP);
		const save = commands.find((c) => c.id === 'cc.preset.save') as PaletteCoreCommand;
		expect(save.availability).toEqual({
			status: 'unavailable',
			reason: 'Set up the Command Center first.',
		});
		expect(resolvePaletteCommand(save, { name: 'whatever' })).toBeNull();
	});

	it('exposes the same filtering result on every platform profile (AC3)', () => {
		const { state } = vaultWithScenes();
		const desktop = listPaletteCommands(state, DM_ACTOR.id, DESKTOP);
		const mobile = listPaletteCommands(state, DM_ACTOR.id, MOBILE);

		// Navigation, settings, scene, and action commands are profile-independent: the
		// equivalent menu on a compact profile exposes the identical command set.
		const nonWidget = (commands: PaletteCommand[]) =>
			commands.filter((c) => c.category !== 'widget').map((c) => `${c.kind}:${c.id}`);
		expect(nonWidget(mobile)).toEqual(nonWidget(desktop));
	});
});

describe('NAV-010 shared command/validation path', () => {
	it('resolves a navigation command to a route', () => {
		const { state } = vaultWithScenes();
		const commands = listPaletteCommands(state, DM_ACTOR.id, DESKTOP);
		const toScenes = commands.find((c) => c.id === 'nav.scenes')!;
		expect(resolvePaletteCommand(toScenes)).toEqual({ kind: 'navigate', route: '/scenes/' });
	});

	it('resolves Create Scene to the same scene.create command the visible form dispatches (AC2)', () => {
		const { env, state } = vaultWithScenes();
		const create = listPaletteCommands(state, DM_ACTOR.id, DESKTOP).find(
			(c) => c.id === 'scene.create',
		)!;
		const resolved = resolvePaletteCommand(create, { name: 'Ambush' });
		expect(resolved).toEqual({
			kind: 'dispatch',
			command: { type: 'scene.create', payload: { name: 'Ambush' } },
		});

		// Dispatching the palette-resolved command goes through the identical validation
		// path and is accepted, exactly like the visible Scene-create form.
		if (resolved?.kind !== 'dispatch') throw new Error('expected dispatch');
		const result = dispatch(state, env, { ...resolved.command, actorId: DM_ACTOR.id });
		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') return;
		expect(result.events.some((e) => e.kind === 'scene.created')).toBe(true);
	});

	it('refuses to resolve a core command that is missing required input', () => {
		const { state } = vaultWithScenes();
		const create = listPaletteCommands(state, DM_ACTOR.id, DESKTOP).find(
			(c) => c.id === 'scene.create',
		)!;
		expect(resolvePaletteCommand(create, { name: '   ' })).toBeNull();
		expect(resolvePaletteCommand(create)).toBeNull();
	});

	it('searches across navigation and core commands by title and keyword', () => {
		const { state } = vaultWithScenes();
		const commands = listPaletteCommands(state, DM_ACTOR.id, DESKTOP);
		expect(searchPaletteCommands(commands, 'settings').some((c) => c.id === 'nav.settings')).toBe(
			true,
		);
		expect(searchPaletteCommands(commands, 'tavern').some((c) => c.category === 'scene')).toBe(
			true,
		);
		expect(searchPaletteCommands(commands, 'create').some((c) => c.id === 'scene.create')).toBe(
			true,
		);
	});
});
