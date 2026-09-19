import { describe, expect, it } from 'vitest';
import { dispatchCommand } from '../src/commands/dispatch';
import type {
	CommandResult,
	CoreCommand,
	CoreEnvironment,
	CoreStateSlice,
} from '../src/commands/types';
import {
	listCanvasCommandActions,
	resolveCommandAction,
	searchCommandActions,
} from '../src/queries/command-actions';
import { canvasSurfaceForRoute } from '../src/queries/quick-switcher-query';
import { resolveAddWidgetCommand, listWidgetLibrary } from '../src/queries/widget-library';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

// RC-CAN-4.3 — the contextual action provider behind the palette's `/board` and `/scene/:id` rows.

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got rejected: ${result.rejection.message}`);
	}
	return result;
}

function run(state: CoreStateSlice, env: CoreEnvironment, command: CoreCommand): CoreStateSlice {
	return accept(dispatchCommand(state, env, command)).nextState;
}

function setup(): {
	env: CoreEnvironment;
	state: CoreStateSlice;
	homeSceneId: string;
	sceneId: string;
} {
	const env = makeEnvironment();
	let state = run(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env, {
		type: 'command-center.ensure-home',
		actorId: DM_ACTOR.id,
		payload: {},
	});
	const homeSceneId = state.commandCenter.homeSceneId!;
	state = run(state, env, {
		type: 'command-center.save-preset',
		actorId: DM_ACTOR.id,
		payload: { name: 'Combat Night' },
	});
	const before = new Set(Object.keys(state.scenes.scenes));
	state = run(state, env, {
		type: 'scene.create',
		actorId: DM_ACTOR.id,
		payload: { name: 'Tavern', visibility: 'dm-only' },
	});
	const sceneId = Object.keys(state.scenes.scenes).find((id) => !before.has(id))!;
	return { env, state, homeSceneId, sceneId };
}

describe('RC-CAN-4.3 canvas contextual actions', () => {
	it('offers nothing to a non-author (fail closed)', () => {
		const { state, sceneId } = setup();
		for (const surface of [{ kind: 'board' as const }, { kind: 'scene' as const, sceneId }]) {
			expect(
				listCanvasCommandActions(state, PLAYER_ACTOR.id, { profileId: 'desktop', surface }),
			).toEqual([]);
		}
	});

	it('board: Add tile targets the home scene and Apply template lists the saved layouts', () => {
		const { state, homeSceneId } = setup();
		const actions = listCanvasCommandActions(state, DM_ACTOR.id, {
			profileId: 'desktop',
			surface: { kind: 'board' },
		});
		const dice = actions.find((a) => a.id === 'canvas.tile.add:dice');
		expect(dice).toMatchObject({
			title: expect.stringMatching(/^Add tile: /),
			group: 'tile',
			commandType: 'scene.add-widget',
			availability: { status: 'available' },
		});
		// Byte-identical to the tile gallery's own command for the same entry.
		const entry = listWidgetLibrary(state.widgets, state.permissions, DM_ACTOR.id, {
			profileId: 'desktop',
		}).find((e) => e.type === 'dice')!;
		expect(resolveCommandAction(dice!)).toEqual(resolveAddWidgetCommand(entry, homeSceneId));

		const template = actions.find((a) => a.group === 'template');
		expect(template).toMatchObject({
			title: 'Apply template: Combat Night',
			commandType: 'command-center.apply-preset',
			availability: { status: 'available' },
		});
	});

	it('scene: Add tile targets THAT scene, not the home scene, and templates append to that scene', () => {
		const { env, state, sceneId } = setup();
		const actions = listCanvasCommandActions(state, DM_ACTOR.id, {
			profileId: 'desktop',
			surface: { kind: 'scene', sceneId },
		});
		const template = actions.find((a) => a.id === 'canvas.template.apply:builtin:combat')!;
		const applied = run(state, env, {
			...resolveCommandAction(template)!,
			actorId: DM_ACTOR.id,
		} as CoreCommand);
		expect(applied.scenes.scenes[sceneId]!.widgets.length).toBeGreaterThan(0);
		expect(applied.scenes.scenes[state.commandCenter.homeSceneId!]!.widgets).toEqual(
			state.scenes.scenes[state.commandCenter.homeSceneId!]!.widgets,
		);
		const dice = actions.find((a) => a.id === 'canvas.tile.add:dice')!;
		const resolved = resolveCommandAction(dice)!;
		expect(resolved.payload).toMatchObject({ sceneId });
		const next = run(state, env, { ...resolved, actorId: DM_ACTOR.id } as CoreCommand);
		expect(next.scenes.scenes[sceneId]!.widgets.map((w) => w.type)).toContain('dice');
	});

	it('scene: an unknown scene id offers nothing', () => {
		const { state } = setup();
		expect(
			listCanvasCommandActions(state, DM_ACTOR.id, {
				profileId: 'desktop',
				surface: { kind: 'scene', sceneId: 'no-such-scene' },
			}),
		).toEqual([]);
	});

	it('board without a home: tiles are listed but unavailable with a generic reason', () => {
		const state = buildInitialState(DM_ACTOR);
		const actions = listCanvasCommandActions(state, DM_ACTOR.id, {
			profileId: 'desktop',
			surface: { kind: 'board' },
		});
		expect(actions.length).toBeGreaterThan(0);
		for (const action of actions) {
			expect(action.availability.status).toBe('unavailable');
			expect(resolveCommandAction(action)).toBeNull();
		}
	});
});

describe('RC-CAN-4.3 canvasSurfaceForRoute', () => {
	it('recognises only the two canvas routes', () => {
		expect(canvasSurfaceForRoute('/board')).toEqual({ kind: 'board' });
		expect(canvasSurfaceForRoute('/board/')).toEqual({ kind: 'board' });
		expect(canvasSurfaceForRoute('/scene/abc')).toEqual({ kind: 'scene', sceneId: 'abc' });
		expect(canvasSurfaceForRoute('/scene/a%20b?x=1')).toEqual({ kind: 'scene', sceneId: 'a b' });
		for (const route of [
			'/',
			'/scenes',
			'/scene/',
			'/scene/a/b',
			'/boardx',
			'/session',
			'/scene/%E0',
		]) {
			expect(canvasSurfaceForRoute(route)).toBeNull();
		}
	});
});

describe('RC-CAN-4.3 searchCommandActions', () => {
	it('matches every token across title and keywords, not the query as one substring', () => {
		const { state } = setup();
		const actions = listCanvasCommandActions(state, DM_ACTOR.id, {
			profileId: 'desktop',
			surface: { kind: 'board' },
		});
		const hits = searchCommandActions(actions, 'add tile dice');
		expect(hits.map((a) => a.id)).toContain('canvas.tile.add:dice');
		expect(searchCommandActions(actions, 'add tile zzznope')).toEqual([]);
	});
});
