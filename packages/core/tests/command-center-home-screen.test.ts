import { describe, expect, it } from 'vitest';
import {
	HOME_SCREEN_DEFAULT_KEY,
	HOME_WIDGET_TYPES,
	createHomeWidgetDefinitions,
	dispatchCommand,
	findHomeScreen,
	findWidgetDefinition,
	getSceneForActor,
	isDefaultScreen,
	listScreensForActor,
	screenMetaOf,
	type CoreStateSlice,
	type Scene,
} from '../src';
import { widgetPackageDefinitionSchema } from '../src/schemas/widget-package';
import { buildDefaultCommandCenterScene } from '../src/state/command-center-state';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

/**
 * RC-CAN-7.6 — the Command Center as the default screen (ADR-041 "Defaults and preservation").
 * `command-center.ensure-home` provisions a FLOW home screen of the five system template parts: in a
 * fresh vault beside the board it creates, and in an existing vault as its new home while the board,
 * untouched, stays the GM screen.
 */

type Env = ReturnType<typeof makeEnvironment>;

function accept(result: ReturnType<typeof dispatchCommand>) {
	if (result.status !== 'accepted') {
		throw new Error(`command rejected: ${result.rejection.code} ${result.rejection.message}`);
	}
	return result;
}

function ensureHome(state: CoreStateSlice, env: Env) {
	return accept(
		dispatchCommand(state, env, {
			type: 'command-center.ensure-home',
			actorId: DM_ACTOR.id,
			payload: {},
		}),
	);
}

function homeScreen(state: CoreStateSlice): Scene {
	const home = findHomeScreen(state.scenes);
	if (!home) throw new Error('no home screen');
	return home;
}

describe('RC-CAN-7.6 the home screen', () => {
	it('a fresh vault gets the board and a flow home screen of the five parts', () => {
		const env = makeEnvironment();
		const { nextState } = ensureHome(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env);
		const board = nextState.scenes.scenes[nextState.commandCenter.homeSceneId!]!;
		const home = homeScreen(nextState);

		expect(home.id).not.toBe(board.id);
		expect(home.name).toBe('Command Center');
		expect(home.visibility).toBe('dm-only');
		expect(screenMetaOf(home)).toMatchObject({
			pinned: false,
			layoutPolicy: 'flow',
			origin: { kind: 'default', defaultKey: HOME_SCREEN_DEFAULT_KEY, sourceSceneId: null },
		});
		expect(home.widgets.map((widget) => widget.type)).toEqual([...HOME_WIDGET_TYPES]);
		// Every setting is the definition's default, so a rebuilt part is configured identically.
		expect(home.widgets.every((widget) => Object.keys(widget.configuration).length === 0)).toBe(
			true,
		);
		// Create over Manage: one group, which a flow screen stacks in one lane.
		const [, , create, manage] = home.widgets;
		expect(create!.layout.groupId).not.toBeNull();
		expect(manage!.layout.groupId).toBe(create!.layout.groupId);
		// Spans 12 / 7 + 5 / 5 / 12 of the authoring grid, in reading order.
		expect(home.widgets.map(({ layout }) => [layout.x, layout.y, layout.w])).toEqual([
			[0, 0, 1152],
			[0, 240, 672],
			[672, 240, 480],
			[672, 480, 480],
			[0, 720, 1152],
		]);
	});

	it('every part resolves available, never missing, in an empty vault', () => {
		const { nextState } = ensureHome(buildInitialState(DM_ACTOR), makeEnvironment());
		const home = homeScreen(nextState);
		const summary = getSceneForActor(
			nextState.scenes,
			nextState.permissions,
			DM_ACTOR.id,
			home.id,
			{ widgetPackages: nextState.widgets },
		);
		if ('kind' in summary) throw new Error('home unreadable');
		expect(summary.widgets.map((widget) => widget.kind)).toEqual(
			HOME_WIDGET_TYPES.map(() => 'available'),
		);
	});

	it('an existing vault gains the home screen and its board stays untouched as the GM screen', () => {
		const env = makeEnvironment();
		const base = buildInitialState(DM_ACTOR);
		const board = {
			...buildDefaultCommandCenterScene(env, DM_ACTOR.id),
			name: 'My table',
			description: 'Customised',
		};
		const existing: CoreStateSlice = {
			...base,
			scenes: { ...base.scenes, scenes: { [board.id]: board } },
			commandCenter: { ...base.commandCenter, homeSceneId: board.id },
		};
		const before = JSON.stringify(board);

		const { nextState, operationIds } = ensureHome(existing, env);

		expect(nextState.commandCenter.homeSceneId).toBe(board.id);
		expect(JSON.stringify(nextState.scenes.scenes[board.id])).toBe(before);
		expect(operationIds).toHaveLength(1);
		expect(nextState.sync.operations.at(-1)).toMatchObject({
			opType: 'scene.create',
			entityId: homeScreen(nextState).id,
		});
		expect(isDefaultScreen(nextState, board.id)).toBe(true);
		expect(isDefaultScreen(nextState, homeScreen(nextState).id)).toBe(true);
	});

	it('is idempotent and never resets the GM’s changes to the home screen', () => {
		const env = makeEnvironment();
		const first = ensureHome(buildInitialState(DM_ACTOR), env).nextState;
		const home = homeScreen(first);
		const library = home.widgets.at(-1)!;
		const customised = accept(
			dispatchCommand(first, env, {
				type: 'scene.destroy-widget',
				actorId: DM_ACTOR.id,
				payload: { sceneId: home.id, widgetInstanceId: library.id },
			}),
		).nextState;

		const again = ensureHome(customised, env);

		expect(again.operationIds).toHaveLength(0);
		expect(again.nextState).toBe(customised);
		expect(homeScreen(again.nextState).widgets.map((widget) => widget.type)).not.toContain(
			'home-library',
		);
	});

	it('a table scene is not a default screen', () => {
		const env = makeEnvironment();
		const provisioned = ensureHome(buildInitialState(DM_ACTOR), env).nextState;
		const created = accept(
			dispatchCommand(provisioned, env, {
				type: 'scene.create',
				actorId: DM_ACTOR.id,
				payload: { name: 'Harbor' },
			}),
		);
		const harbor = Object.values(created.nextState.scenes.scenes).find((s) => s.name === 'Harbor')!;
		expect(isDefaultScreen(created.nextState, harbor.id)).toBe(false);
	});

	it('a player cannot list or read the GM-only home screen', () => {
		const { nextState } = ensureHome(buildInitialState(DM_ACTOR, PLAYER_ACTOR), makeEnvironment());
		const home = homeScreen(nextState);
		expect(
			listScreensForActor(nextState.scenes, nextState.permissions, PLAYER_ACTOR.id).map(
				(screen) => screen.id,
			),
		).not.toContain(home.id);
		const read = getSceneForActor(
			nextState.scenes,
			nextState.permissions,
			PLAYER_ACTOR.id,
			home.id,
			{ widgetPackages: nextState.widgets },
		);
		expect('kind' in read).toBe(true);
	});

	it('the parts are system template widgets on the public definition surface', () => {
		const state = buildInitialState(DM_ACTOR);
		for (const type of HOME_WIDGET_TYPES) {
			const definition = findWidgetDefinition(state.widgets, type);
			expect(definition?.author).toBe('system');
			expect(definition?.renderEntrypoint?.runtime).toBe('template');
			expect(definition?.placement).toEqual({ surfaces: ['scene'], libraryListed: false });
			expect(definition?.configFields?.find((field) => field.key === 'presentation')?.default).toBe(
				'bare',
			);
		}
		// A package carrying them validates against the same schema a GM-built package must pass.
		const parsed = widgetPackageDefinitionSchema.safeParse({
			id: 'user.home-copy',
			version: '1.0.0',
			displayName: 'Home copy',
			widgets: createHomeWidgetDefinitions().map((definition) => ({
				...definition,
				type: `copy-${definition.type}`,
				author: 'user',
			})),
			migrations: [],
			assets: [],
			portabilityWarnings: [],
		});
		expect(parsed.success ? null : parsed.error.issues).toBeNull();
	});
});
