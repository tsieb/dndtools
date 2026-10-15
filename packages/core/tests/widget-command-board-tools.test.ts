import { describe, expect, it } from 'vitest';
import {
	BOARD_COMMAND_DESCRIPTORS,
	CORE_NAMED_WIDGET_COMMANDS,
	dispatchCommand,
	getCombatTrackerForActor,
	widgetCommandHasExecutor,
	widgetInstanceReachesActor,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
} from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import type { CoreEnvironment } from '../src/commands/types';
import type { PermissionGrant } from '../src/state/permission-state';

/**
 * RC-WID-5.7 — the core commands the GM board's map and initiative tiles run by name through
 * `widget.dispatch-command`. Each one is checked twice: by the widget's own operate/configure gate
 * (a player needs an operator grant on the widget to operate it and manager to configure it), and
 * then by the core command itself, under the presser's authority — a press can never do what the
 * presser could not do directly. Reconfiguring is pinned to the dispatching instance.
 */

function accept(result: CommandResult): CoreStateSlice {
	if (result.status !== 'accepted') throw new Error(result.rejection.message);
	return result.nextState;
}

function boardFixture() {
	const env = makeEnvironment();
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
	const run = (command: CoreCommand) => {
		state = accept(dispatchCommand(state, env, command));
	};
	const dm = DM_ACTOR.id;
	run({ type: 'map.create', actorId: dm, payload: { name: 'Keep', visibility: 'player-visible' } });
	run({
		type: 'map.create',
		actorId: dm,
		payload: { name: 'Vault', visibility: 'player-visible' },
	});
	run({ type: 'command-center.ensure-home', actorId: dm, payload: {} });
	const sceneId = state.commandCenter.homeSceneId!;
	const instance = (type: string) =>
		state.scenes.scenes[sceneId]!.widgets.find((widget) => widget.type === type)!.id;
	const ids = {
		map: instance('map'),
		initiative: instance('initiative-tracker'),
		timer: instance('timer'),
		dice: instance('dice'),
	};
	run({
		type: 'session.set-workflow',
		actorId: dm,
		payload: { workflow: 'active', activeSceneId: sceneId },
	});
	run({
		type: 'combat.start',
		actorId: dm,
		payload: {
			combatants: [
				{ kind: 'npc', name: 'Bandit', ac: 12, initiative: 15, maxHp: 11, hidden: false },
				{ kind: 'npc', name: 'Cutpurse', ac: 12, initiative: 9, maxHp: 9, hidden: false },
			],
		},
	});
	// The GM board is DM-only: the player reaches its map and initiative tiles through a projection.
	run({
		type: 'session.project-player-view',
		actorId: dm,
		payload: {
			playerActorIds: [PLAYER_ACTOR.id],
			target: { kind: 'widget-subset', sceneId, widgetInstanceIds: [ids.map, ids.initiative] },
		},
	});
	const mapId = (name: string) => Object.values(state.maps.maps).find((m) => m.name === name)!.id;
	return { env, state, sceneId, ids, mapId };
}

let pressCount = 0;

function press(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	sceneId: string,
	widgetInstanceId: string,
	commandType: string,
	payload: Record<string, unknown>,
	idempotencyKey = `press-${(pressCount += 1)}`,
): CommandResult {
	return dispatchCommand(state, env, {
		type: 'widget.dispatch-command',
		actorId,
		idempotencyKey,
		payload: {
			sceneId,
			widgetInstanceId,
			commandType,
			payload,
			expectedRevision: state.scenes.scenes[sceneId]!.ownership.revision,
		},
	});
}

/** The player with a widget grant of `capabilitySet` on one instance. */
function granted(
	state: CoreStateSlice,
	widgetId: string,
	capabilitySet: 'operator' | 'manager',
): CoreStateSlice {
	const grant: PermissionGrant = {
		id: `grant-${widgetId}-${capabilitySet}`,
		entityType: 'widget',
		entityId: widgetId,
		playerActorId: PLAYER_ACTOR.id,
		capabilitySet,
		createdBy: DM_ACTOR.id,
		createdAt: '2026-10-08T00:00:00.000Z',
		expiresAt: null,
	};
	return {
		...state,
		permissions: { ...state.permissions, grants: [...state.permissions.grants, grant] },
	};
}

const tracker = (state: CoreStateSlice) =>
	getCombatTrackerForActor(state.session.combat, state.permissions, DM_ACTOR.id);

function rejectionCode(result: CommandResult): string | null {
	return result.status === 'accepted' ? null : result.rejection.code;
}

describe('RC-WID-5.7 — the board commands are public', () => {
	it('runs each by name: no executor, and a descriptor the builder can offer', () => {
		for (const [type, descriptor] of Object.entries(BOARD_COMMAND_DESCRIPTORS)) {
			expect(CORE_NAMED_WIDGET_COMMANDS).toContain(type);
			expect(descriptor.type).toBe(type);
			expect(descriptor.executor).toBeUndefined();
			expect(widgetCommandHasExecutor(descriptor)).toBe(true);
		}
	});

	it('refuses a command the pressed widget does not declare', () => {
		const { env, state, sceneId, ids } = boardFixture();
		const result = press(state, env, DM_ACTOR.id, sceneId, ids.dice, 'combat.advance-turn', {});
		expect(rejectionCode(result)).toBe('command-not-declared');
	});
});

describe('combat.advance-turn', () => {
	it('advances the order for the DM, once per idempotency key', () => {
		const { env, state, sceneId, ids } = boardFixture();
		const before = tracker(state).turn;
		const once = accept(
			press(state, env, DM_ACTOR.id, sceneId, ids.initiative, 'combat.advance-turn', {}, 'k'),
		);
		expect(tracker(once).turn).toBe(before + 1);
		const retried = accept(
			press(once, env, DM_ACTOR.id, sceneId, ids.initiative, 'combat.advance-turn', {}, 'k'),
		);
		expect(tracker(retried).turn).toBe(before + 1);
	});

	it('refuses a player who holds no operator grant on the widget', () => {
		const { env, state, sceneId, ids } = boardFixture();
		const result = press(
			state,
			env,
			PLAYER_ACTOR.id,
			sceneId,
			ids.initiative,
			'combat.advance-turn',
			{},
		);
		expect(rejectionCode(result)).toBe('actor-not-authorized');
		expect(tracker(state).turn).toBe(tracker(result.nextState).turn);
	});

	it('gives an operator no more than the core command gives them directly', () => {
		const { env, state, sceneId, ids } = boardFixture();
		const operator = granted(state, ids.initiative, 'operator');
		const viaWidget = press(
			operator,
			env,
			PLAYER_ACTOR.id,
			sceneId,
			ids.initiative,
			'combat.advance-turn',
			{},
		);
		const direct = dispatchCommand(operator, env, {
			type: 'combat.advance-turn',
			actorId: PLAYER_ACTOR.id,
			payload: {},
		});
		expect(viaWidget.status).toBe(direct.status);
		expect(rejectionCode(viaWidget)).toBe(rejectionCode(direct));
	});
});

describe('combat.apply-resource', () => {
	it('applies damage for the DM', () => {
		const { env, state, sceneId, ids } = boardFixture();
		const target = tracker(state).combatants.find((c) => c.name === 'Bandit')!;
		const next = accept(
			press(state, env, DM_ACTOR.id, sceneId, ids.initiative, 'combat.apply-resource', {
				combatantId: target.id,
				kind: 'hp',
				delta: -5,
			}),
		);
		expect(tracker(next).combatants.find((c) => c.id === target.id)?.resources?.hp).toBe(
			(target.resources?.hp ?? 0) - 5,
		);
	});

	it('refuses an operator, and gives a manager only what the core allows', () => {
		const { env, state, sceneId, ids } = boardFixture();
		const target = tracker(state).combatants[0]!;
		const payload = { combatantId: target.id, kind: 'hp', delta: -3 };
		const operator = granted(state, ids.initiative, 'operator');
		expect(
			rejectionCode(
				press(
					operator,
					env,
					PLAYER_ACTOR.id,
					sceneId,
					ids.initiative,
					'combat.apply-resource',
					payload,
				),
			),
		).toBe('actor-not-authorized');
		const manager = granted(state, ids.initiative, 'manager');
		const viaWidget = press(
			manager,
			env,
			PLAYER_ACTOR.id,
			sceneId,
			ids.initiative,
			'combat.apply-resource',
			payload,
		);
		const direct = dispatchCommand(manager, env, {
			type: 'combat.apply-resource',
			actorId: PLAYER_ACTOR.id,
			payload,
		});
		expect(rejectionCode(viaWidget)).toBe(rejectionCode(direct));
	});
});

describe('combat.set-combatant-visibility', () => {
	it('hides a combatant for the DM and refuses an operator, since hiding configures', () => {
		const { env, state, sceneId, ids } = boardFixture();
		const target = tracker(state).combatants[0]!;
		const payload = { combatantId: target.id, hidden: true };
		const next = accept(
			press(
				state,
				env,
				DM_ACTOR.id,
				sceneId,
				ids.initiative,
				'combat.set-combatant-visibility',
				payload,
			),
		);
		expect(tracker(next).combatants.find((c) => c.id === target.id)?.hidden).toBe(true);
		const operator = granted(state, ids.initiative, 'operator');
		expect(
			rejectionCode(
				press(
					operator,
					env,
					PLAYER_ACTOR.id,
					sceneId,
					ids.initiative,
					'combat.set-combatant-visibility',
					payload,
				),
			),
		).toBe('actor-not-authorized');
	});
});

describe('session.set-active-map and session.project-active-map', () => {
	it('stage and project for the DM', () => {
		const { env, state, sceneId, ids, mapId } = boardFixture();
		const staged = accept(
			press(state, env, DM_ACTOR.id, sceneId, ids.map, 'session.set-active-map', {
				mapId: mapId('Vault'),
			}),
		);
		expect(staged.session.activeMap?.mapId).toBe(mapId('Vault'));
		const projected = accept(
			press(staged, env, DM_ACTOR.id, sceneId, ids.map, 'session.project-active-map', {
				playerActorIds: [PLAYER_ACTOR.id],
			}),
		);
		expect(
			Object.values(projected.session.activeMapProjections).map((p) => p.playerActorId),
		).toContain(PLAYER_ACTOR.id);
	});

	it.each(['session.set-active-map', 'session.project-active-map'])(
		'refuses %s to a player holding only operator on the map tile',
		(commandType) => {
			const { env, state, sceneId, ids, mapId } = boardFixture();
			const operator = granted(state, ids.map, 'operator');
			const payload =
				commandType === 'session.set-active-map'
					? { mapId: mapId('Vault') }
					: { playerActorIds: [PLAYER_ACTOR.id] };
			expect(
				rejectionCode(
					press(operator, env, PLAYER_ACTOR.id, sceneId, ids.map, commandType, payload),
				),
			).toBe('actor-not-authorized');
		},
	);

	it('still runs the core’s own DM check for a player managing the tile', () => {
		const { env, state, sceneId, ids, mapId } = boardFixture();
		const manager = granted(state, ids.map, 'manager');
		const viaWidget = press(
			manager,
			env,
			PLAYER_ACTOR.id,
			sceneId,
			ids.map,
			'session.set-active-map',
			{
				mapId: mapId('Vault'),
			},
		);
		const direct = dispatchCommand(manager, env, {
			type: 'session.set-active-map',
			actorId: PLAYER_ACTOR.id,
			payload: { mapId: mapId('Vault') },
		});
		expect(direct.status).toBe('rejected');
		expect(rejectionCode(viaWidget)).toBe(rejectionCode(direct));
	});
});

describe('scene.configure-widget', () => {
	it('reconfigures only the instance that dispatched it, whatever the payload names', () => {
		const { env, state, sceneId, ids, mapId } = boardFixture();
		const timerBefore = state.scenes.scenes[sceneId]!.widgets.find((w) => w.id === ids.timer)!;
		const next = accept(
			press(state, env, DM_ACTOR.id, sceneId, ids.map, 'scene.configure-widget', {
				// An attempt to reach another widget: the core pins scene and instance to the press.
				sceneId: 'some-other-scene',
				widgetInstanceId: ids.timer,
				binding: {
					source: { entityType: 'map', entityId: mapId('Vault') },
					mode: 'read',
					requiredCapability: 'viewer',
				},
			}),
		);
		const widgets = next.scenes.scenes[sceneId]!.widgets;
		expect(widgets.find((w) => w.id === ids.map)?.binding?.source.entityId).toBe(mapId('Vault'));
		expect(widgets.find((w) => w.id === ids.timer)).toEqual(timerBefore);
	});

	it('refuses an operator: reconfiguring is the widget manager’s', () => {
		const { env, state, sceneId, ids } = boardFixture();
		const operator = granted(state, ids.map, 'operator');
		const result = press(
			operator,
			env,
			PLAYER_ACTOR.id,
			sceneId,
			ids.map,
			'scene.configure-widget',
			{
				configuration: { combatOverlay: false },
			},
		);
		expect(rejectionCode(result)).toBe('actor-not-authorized');
	});
});

describe('widgetInstanceReachesActor', () => {
	it('reaches the DM everywhere, a player only through a visible screen or a projection', () => {
		const { state, ids } = boardFixture();
		expect(widgetInstanceReachesActor(state, DM_ACTOR.id, ids.timer)).toBe(true);
		// The GM board is DM-only; only the projected tiles reach the player.
		expect(widgetInstanceReachesActor(state, PLAYER_ACTOR.id, ids.map)).toBe(true);
		expect(widgetInstanceReachesActor(state, PLAYER_ACTOR.id, ids.timer)).toBe(false);
		expect(widgetInstanceReachesActor(state, OBSERVER_ACTOR.id, ids.map)).toBe(false);
		expect(widgetInstanceReachesActor(state, DM_ACTOR.id, 'not-placed')).toBe(false);
	});
});
