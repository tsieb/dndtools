import {
	createDemoMapState,
	dispatchCommand,
	type Actor,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
} from '@dndtools/core';
import { buildInitialState, makeEnvironment } from '@dndtools/core/testing';
import { seedDemoContent } from '../../runtime/demo-seed';

/**
 * The Session baselines' runtime and vault fixtures, moved out of `Session.baseline.test.tsx` for
 * size (RC-POL-1.4). The test mocks `useRuntime` to hand out the runtime made here; every fixture
 * dispatches through it, against a real Core seeded by the real demo seed.
 */

export const DM: Actor = { id: 'dm-1', role: 'dm', displayName: 'Dungeon Master' };
export const PARTICIPANTS: Actor[] = [
	{ id: 'actor-player', role: 'player', displayName: 'Demo Player' },
	{ id: 'actor-player-2', role: 'player', displayName: 'Demo Player 2' },
	{ id: 'actor-player-3', role: 'player', displayName: 'Demo Player 3' },
	{ id: 'actor-observer', role: 'observer', displayName: 'Demo Observer' },
];

export function createBaselineRuntime() {
	const runtime = {
		state: buildInitialState(DM) as CoreStateSlice,
		defaultActorId: DM.id,
		activeActorId: DM.id,
		preview: null as { actorId: string } | null,
		loaded: true,
		env: makeEnvironment(),
		async dispatch(command: CoreCommand): Promise<CommandResult> {
			const result = dispatchCommand(runtime.state, runtime.env, command);
			if (result.status === 'accepted') runtime.state = result.nextState;
			return result;
		},
	};
	return runtime;
}

export type BaselineRuntime = ReturnType<typeof createBaselineRuntime>;

/** The vault states the baselines are taken in, each written through `runtime`. */
export function baselineFixtures(runtime: BaselineRuntime) {
	async function seedDemoVault() {
		runtime.env = makeEnvironment();
		runtime.state = buildInitialState(DM, ...PARTICIPANTS);
		runtime.state = { ...runtime.state, maps: createDemoMapState() };
		runtime.defaultActorId = DM.id;
		runtime.activeActorId = DM.id;
		runtime.preview = null;
		await seedDemoContent(runtime, { showcase: false });
		// The GM screen's board and the home screen, as the app's first paint of `/` provisions them: the
		// vault a GM reaches `/session` in (the CAN-7.5 captures were taken from one).
		await accept({ type: 'command-center.ensure-home', payload: {} } as never);
	}

	async function accept(command: Omit<CoreCommand, 'actorId'> & { actorId?: string }) {
		const result = await runtime.dispatch({ actorId: DM.id, ...command } as CoreCommand);
		if (result.status !== 'accepted')
			throw new Error(`${command.type} rejected: ${result.rejection.message}`);
		return result;
	}

	/** The first table scene (not the board, not a default screen), as a "Continue" start resumes. */
	function tableSceneId(): string {
		const scene = Object.values(runtime.state.scenes.scenes).find(
			(candidate) =>
				!candidate.templateMeta.isTemplate &&
				candidate.id !== runtime.state.commandCenter.homeSceneId &&
				candidate.screen?.origin?.kind !== 'default',
		);
		if (!scene) throw new Error('the demo seed has no table scene');
		return scene.id;
	}

	async function goLive() {
		await accept({
			type: 'session.set-workflow',
			payload: { workflow: 'active', activeSceneId: tableSceneId() },
		} as never);
	}

	async function startFight() {
		await accept({
			type: 'combat.start',
			payload: {
				combatants: [
					{ kind: 'monster', name: 'Goblin', initiative: 15, maxHp: 7, ac: 13 },
					{ kind: 'monster', name: 'Ogre', initiative: 10, maxHp: 30, ac: 11 },
					{ kind: 'monster', name: 'Lurker', initiative: 5, maxHp: 12, hidden: true },
				],
			},
		} as never);
		const goblin = Object.values(runtime.state.session.combat.combatants).find(
			(combatant) => combatant.name === 'Goblin',
		)!;
		await accept({
			type: 'combat.apply-resource',
			payload: { combatantId: goblin.id, kind: 'hp', delta: -4 },
		} as never);
	}

	/** Each player character takes a short rest, so Recap shows the rest timeline (SE-25). */
	async function restTheParty() {
		for (const character of Object.values(runtime.state.characters.characters)) {
			if (character.kind !== 'pc') continue;
			await accept({
				type: 'character.rest',
				payload: { characterId: character.id, rest: 'short' },
			} as never);
		}
	}

	return { seedDemoVault, accept, tableSceneId, goLive, startFight, restTheParty };
}
