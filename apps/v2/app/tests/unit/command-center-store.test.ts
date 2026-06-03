import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	__testing,
	loadCoreState,
	persistFullState,
	resetCoreStorage,
} from '../../src/lib/platform/storage/scene-store';
import { dispatchCommand, type CommandResult, type CoreEnvironment } from '@dndtools/v2-core';
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
});
