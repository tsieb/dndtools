import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	__testing,
	loadCoreState,
	persistFullState,
	resetCoreStorage,
} from '../../src/lib/platform/storage/scene-store';
import {
	dispatchCommand,
	listCommandActions,
	listWidgetLibrary,
	resolveAddWidgetCommand,
	resolveCommandAction,
	type CommandResult,
	type CoreEnvironment,
} from '@dndtools/core';
import { DM_ACTOR, buildInitialState, makeEnvironment } from '@dndtools/core/testing';

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

describe('Widget library + command palette persistence (CMD-005/CMD-008)', () => {
	it('adds a library widget to the Command Center and persists it across reload (CMD-005)', async () => {
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
		const beforeCount = state.scenes.scenes[homeSceneId]!.widgets.length;

		// Same data path the Command Center widget library uses: list -> resolve -> dispatch.
		const note = listWidgetLibrary(state.widgets, state.permissions, DM_ACTOR.id, {
			profileId: 'desktop',
			filter: 'note',
		}).find((e) => e.type === 'note')!;
		const command = resolveAddWidgetCommand(note, homeSceneId)!;
		const added = accept(
			dispatchCommand(state, env, {
				type: command.type,
				actorId: DM_ACTOR.id,
				payload: command.payload,
			}),
		);
		await persistFullState(state, added.nextState);
		await __testing.closeDb();

		const reloaded = await loadCoreState();
		const widgets = reloaded.scenes.scenes[homeSceneId]!.widgets;
		expect(widgets.length).toBe(beforeCount + 1);
		expect(widgets.some((w) => w.type === 'note')).toBe(true);
	});

	it('saves a preset through a palette action and persists it (CMD-008)', async () => {
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

		const saveAction = listCommandActions(state, DM_ACTOR.id, { profileId: 'desktop' }).find(
			(a) => a.id === 'cc.preset.save',
		)!;
		const command = resolveCommandAction(saveAction, { name: 'Palette Board' })!;
		const saved = accept(dispatchCommand(state, env, { ...command, actorId: DM_ACTOR.id }));
		await persistFullState(state, saved.nextState);
		await __testing.closeDb();

		const reloaded = await loadCoreState();
		expect(Object.values(reloaded.commandCenter.presets).map((p) => p.name)).toContain(
			'Palette Board',
		);
	});
});
