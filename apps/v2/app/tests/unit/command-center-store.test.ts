import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	__testing,
	loadCoreState,
	persistFullState,
	resetCoreStorage,
} from '../../src/lib/platform/storage/scene-store';
import {
	createDemoMapState,
	dispatchCommand,
	type CommandResult,
	type CoreEnvironment,
} from '@dndtools/v2-core';
import { DM_ACTOR, buildInitialState, makeEnvironment } from '@dndtools/v2-core/testing';

let env: CoreEnvironment;

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') throw new Error(`rejected: ${result.rejection.message}`);
	return result;
}

beforeEach(async () => {
	await resetCoreStorage();
	env = makeEnvironment();
	await persistFullState(buildInitialState(), buildInitialState(DM_ACTOR));
});

afterEach(async () => {
	await __testing.closeDb();
	indexedDB.deleteDatabase(__testing.DB_NAME);
});

describe('Command Center storage round-trip', () => {
	it('persists the default Command Center home Scene and pointer (CMD-001)', async () => {
		const state = buildInitialState(DM_ACTOR);
		const ensured = accept(
			dispatchCommand(state, env, {
				type: 'command-center.ensure-home',
				actorId: DM_ACTOR.id,
				payload: {},
			}),
		);
		await persistFullState(state, ensured.nextState);
		await __testing.closeDb();

		const reloaded = await loadCoreState();
		const homeSceneId = reloaded.commandCenter.homeSceneId;
		expect(homeSceneId).not.toBeNull();
		expect(reloaded.scenes.scenes[homeSceneId!]?.name).toBe('Command Center');
		expect(reloaded.scenes.scenes[homeSceneId!]?.widgets.length).toBeGreaterThan(0);
	});

	it('persists a rearranged Command Center widget across reload (CMD-002)', async () => {
		let state = buildInitialState(DM_ACTOR);
		const ensured = accept(
			dispatchCommand(state, env, {
				type: 'command-center.ensure-home',
				actorId: DM_ACTOR.id,
				payload: {},
			}),
		);
		await persistFullState(state, ensured.nextState);
		state = ensured.nextState;

		const homeSceneId = state.commandCenter.homeSceneId!;
		const widgetId = state.scenes.scenes[homeSceneId]!.widgets[0]!.id;
		const moved = accept(
			dispatchCommand(state, env, {
				type: 'scene.move-widget',
				actorId: DM_ACTOR.id,
				payload: { sceneId: homeSceneId, widgetInstanceId: widgetId, x: 512, y: 256 },
			}),
		);
		await persistFullState(state, moved.nextState);
		await __testing.closeDb();

		const reloaded = await loadCoreState();
		const widget = reloaded.scenes.scenes[homeSceneId]!.widgets.find((w) => w.id === widgetId)!;
		expect(widget.layout.x).toBe(512);
		expect(widget.layout.y).toBe(256);
	});

	it('persists and restores a Command Center preset across reload (CMD-007)', async () => {
		let state = buildInitialState(DM_ACTOR);
		const ensured = accept(
			dispatchCommand(state, env, {
				type: 'command-center.ensure-home',
				actorId: DM_ACTOR.id,
				payload: {},
			}),
		);
		await persistFullState(state, ensured.nextState);
		state = ensured.nextState;
		const homeSceneId = state.commandCenter.homeSceneId!;

		const saved = accept(
			dispatchCommand(state, env, {
				type: 'command-center.save-preset',
				actorId: DM_ACTOR.id,
				payload: { name: 'Default Board' },
			}),
		);
		await persistFullState(state, saved.nextState);
		state = saved.nextState;
		const presetId = Object.keys(state.commandCenter.presets)[0]!;

		// Mutate the home Scene, then persist, then restore the preset.
		const widgetId = state.scenes.scenes[homeSceneId]!.widgets[0]!.id;
		const moved = accept(
			dispatchCommand(state, env, {
				type: 'scene.move-widget',
				actorId: DM_ACTOR.id,
				payload: { sceneId: homeSceneId, widgetInstanceId: widgetId, x: 999, y: 999 },
			}),
		);
		await persistFullState(state, moved.nextState);
		state = moved.nextState;

		const restored = accept(
			dispatchCommand(state, env, {
				type: 'command-center.apply-preset',
				actorId: DM_ACTOR.id,
				payload: { presetId },
			}),
		);
		await persistFullState(state, restored.nextState);
		await __testing.closeDb();

		const reloaded = await loadCoreState();
		expect(Object.keys(reloaded.commandCenter.presets)).toContain(presetId);
		// The restored home Scene no longer carries the mutated position.
		const restoredScene = reloaded.scenes.scenes[homeSceneId]!;
		expect(restoredScene.widgets.some((w) => w.layout.x === 999)).toBe(false);
	});

	it('persists active map and workflow-owned Session State across reload (CMD-003/CMD-006)', async () => {
		await resetCoreStorage();
		let state = { ...buildInitialState(DM_ACTOR), maps: createDemoMapState() };
		await persistFullState(state, state);

		const ensured = accept(
			dispatchCommand(state, env, {
				type: 'command-center.ensure-home',
				actorId: DM_ACTOR.id,
				payload: {},
			}),
		);
		await persistFullState(state, ensured.nextState);
		state = ensured.nextState;
		const homeSceneId = state.commandCenter.homeSceneId!;
		const timer = state.scenes.scenes[homeSceneId]!.widgets.find(
			(widget) => widget.type === 'timer',
		)!;

		const activeMap = accept(
			dispatchCommand(state, env, {
				type: 'session.set-active-map',
				actorId: DM_ACTOR.id,
				payload: { mapId: 'map-ruined-keep', regionId: 'region-ground-floor' },
			}),
		);
		await persistFullState(state, activeMap.nextState);
		state = activeMap.nextState;

		const activeWorkflow = accept(
			dispatchCommand(state, env, {
				type: 'session.set-workflow',
				actorId: DM_ACTOR.id,
				payload: { workflow: 'active', activeSceneId: homeSceneId },
			}),
		);
		await persistFullState(state, activeWorkflow.nextState);
		state = activeWorkflow.nextState;

		const combat = accept(
			dispatchCommand(state, env, {
				type: 'session.update-combat',
				actorId: DM_ACTOR.id,
				payload: { encounterId: 'enc-store', round: 2, turn: 1, combatantIds: ['pc-1'] },
			}),
		);
		await persistFullState(state, combat.nextState);
		state = combat.nextState;

		const dice = accept(
			dispatchCommand(state, env, {
				type: 'session.record-dice',
				actorId: DM_ACTOR.id,
				payload: { expression: '1d20', total: 14 },
			}),
		);
		await persistFullState(state, dice.nextState);
		state = dice.nextState;

		const timerStarted = accept(
			dispatchCommand(state, env, {
				type: 'widget.dispatch-command',
				actorId: DM_ACTOR.id,
				idempotencyKey: 'store-timer-start',
				payload: {
					sceneId: homeSceneId,
					widgetInstanceId: timer.id,
					commandType: 'timer.start',
					payload: { durationSeconds: 300 },
					expectedRevision: state.scenes.scenes[homeSceneId]?.ownership.revision,
				},
			}),
		);
		await persistFullState(state, timerStarted.nextState);
		await __testing.closeDb();

		const reloaded = await loadCoreState();
		expect(reloaded.session.workflow).toBe('active');
		expect(reloaded.session.activeSceneId).toBe(homeSceneId);
		expect(reloaded.session.activeMap).toMatchObject({
			mapId: 'map-ruined-keep',
			regionId: 'region-ground-floor',
		});
		expect(reloaded.session.combat).toMatchObject({ encounterId: 'enc-store', round: 2 });
		expect(reloaded.session.diceHistory).toHaveLength(1);
		expect(reloaded.session.timers[timer.id]).toMatchObject({ durationSeconds: 300 });
		expect(
			reloaded.scenes.scenes[homeSceneId]?.widgets.find((widget) => widget.type === 'map')?.binding,
		).toMatchObject({
			source: { entityId: 'map-ruined-keep' },
		});
	});
});
