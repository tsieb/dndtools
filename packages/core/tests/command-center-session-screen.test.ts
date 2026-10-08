import { describe, expect, it } from 'vitest';
import {
	SESSION_SCREEN_DEFAULT_KEY,
	SESSION_PANEL_VIEWS,
	SESSION_SCREEN_PARTS,
	dispatchCommand,
	findHomeScreen,
	findSessionScreen,
	findWidgetDefinition,
	getSceneForActor,
	isCopyableSystemWidget,
	isDefaultScreen,
	listScreensForActor,
	screenMetaOf,
	type CoreStateSlice,
	type Scene,
} from '../src';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

/**
 * RC-CAN-7.8 — Session as a screen (ADR-041 "Defaults and preservation"). `command-center.ensure-home`
 * with `screen: 'session'` (what `/session` asks) provisions a FLOW Session screen of the console's
 * widgets and nothing else; without it nothing about ensure-home changes.
 */

type Env = ReturnType<typeof makeEnvironment>;

function accept(result: ReturnType<typeof dispatchCommand>) {
	if (result.status !== 'accepted') {
		throw new Error(`command rejected: ${result.rejection.code} ${result.rejection.message}`);
	}
	return result;
}

function ensure(state: CoreStateSlice, env: Env, session = true) {
	return accept(
		dispatchCommand(state, env, {
			type: 'command-center.ensure-home',
			actorId: DM_ACTOR.id,
			payload: session ? { screen: 'session' } : {},
		}),
	);
}

function sessionScreen(state: CoreStateSlice): Scene {
	const screen = findSessionScreen(state.scenes);
	if (!screen) throw new Error('no Session screen');
	return screen;
}

describe('RC-CAN-7.8 the Session screen', () => {
	it('is provisioned only when asked, alone, as a GM-only flow screen of the console’s widgets', () => {
		const env = makeEnvironment();
		const plain = ensure(buildInitialState(DM_ACTOR), env, false).nextState;
		expect(findSessionScreen(plain.scenes)).toBeNull();

		const { nextState, operationIds, events } = ensure(buildInitialState(DM_ACTOR), env);
		const screen = sessionScreen(nextState);
		const meta = screenMetaOf(screen);
		expect(meta.layoutPolicy).toBe('flow');
		expect(meta.origin).toMatchObject({ kind: 'default', defaultKey: SESSION_SCREEN_DEFAULT_KEY });
		expect(meta.pinned).toBe(false);
		expect(screen.visibility).toBe('dm-only');
		expect(isDefaultScreen(nextState, screen.id)).toBe(true);
		// It provisions nothing else: no board, no home pointer, no home screen.
		expect(Object.keys(nextState.scenes.scenes)).toEqual([screen.id]);
		expect(nextState.commandCenter.homeSceneId).toBeNull();
		expect(findHomeScreen(nextState.scenes)).toBeNull();
		expect(events).toEqual([{ kind: 'scene.created', sceneId: screen.id, actorId: DM_ACTOR.id }]);
		expect(operationIds).toHaveLength(1);
		// One widget per Session row group, in the console's reading order, each with its own settings.
		expect(screen.widgets.map((widget) => widget.type)).toEqual(
			SESSION_SCREEN_PARTS.map((part) => part.type),
		);
		expect(screen.widgets.map((widget) => widget.configuration)).toEqual(
			SESSION_SCREEN_PARTS.map((part) => part.configuration),
		);
	});

	it('lays the status across the top and the tracker beside one stacked column', () => {
		const screen = sessionScreen(ensure(buildInitialState(DM_ACTOR), makeEnvironment()).nextState);
		const [status, combat, ...side] = screen.widgets;
		expect(status!.layout).toMatchObject({ x: 0, y: 0, w: 12 * 96, groupId: null });
		expect(combat!.layout).toMatchObject({ x: 0, y: 240, w: 7 * 96, groupId: null });
		const column = side[0]!.layout.groupId;
		expect(column).toBeTruthy();
		side.forEach((widget, index) => {
			expect(widget.layout).toMatchObject({ x: 7 * 96, y: (index + 1) * 240, w: 5 * 96 });
			expect(widget.layout.groupId).toBe(column);
		});
		expect(screen.widgets.map((widget) => widget.layout.focusOrder)).toEqual(
			screen.widgets.map((_widget, index) => index + 1),
		);
	});

	it('is added to an existing vault without touching its board or home screen', () => {
		const env = makeEnvironment();
		const existing = ensure(buildInitialState(DM_ACTOR), env, false).nextState;
		const before = JSON.stringify(existing.scenes.scenes);

		const { nextState, operationIds } = ensure(existing, env);

		expect(operationIds).toHaveLength(1);
		const after = nextState.scenes.scenes;
		for (const [id, scene] of Object.entries(JSON.parse(before) as Record<string, Scene>))
			expect(JSON.stringify(after[id])).toBe(JSON.stringify(scene));
		expect(nextState.sync.operations.at(-1)).toMatchObject({
			opType: 'scene.create',
			entityId: sessionScreen(nextState).id,
		});
	});

	it('is idempotent and never resets the GM’s changes to it', () => {
		const env = makeEnvironment();
		const first = ensure(buildInitialState(DM_ACTOR), env).nextState;
		const screen = sessionScreen(first);
		const schedule = screen.widgets.find((widget) => widget.configuration.view === 'schedule')!;
		const customised = accept(
			dispatchCommand(first, env, {
				type: 'scene.destroy-widget',
				actorId: DM_ACTOR.id,
				payload: { sceneId: screen.id, widgetInstanceId: schedule.id },
			}),
		).nextState;

		const again = ensure(customised, env);

		expect(again.operationIds).toHaveLength(0);
		expect(again.nextState).toBe(customised);
		expect(
			sessionScreen(again.nextState).widgets.map((widget) => widget.configuration.view),
		).not.toContain('schedule');
	});

	it('a player cannot list or read the GM-only Session screen', () => {
		const { nextState } = ensure(buildInitialState(DM_ACTOR, PLAYER_ACTOR), makeEnvironment());
		const screen = sessionScreen(nextState);
		expect(
			listScreensForActor(nextState.scenes, nextState.permissions, PLAYER_ACTOR.id).map(
				(entry) => entry.id,
			),
		).not.toContain(screen.id);
		const read = getSceneForActor(
			nextState.scenes,
			nextState.permissions,
			PLAYER_ACTOR.id,
			screen.id,
			{ widgetPackages: nextState.widgets },
		);
		expect('kind' in read).toBe(true);
	});

	it('a player cannot provision it', () => {
		const result = dispatchCommand(buildInitialState(DM_ACTOR, PLAYER_ACTOR), makeEnvironment(), {
			type: 'command-center.ensure-home',
			actorId: PLAYER_ACTOR.id,
			payload: { screen: 'session' },
		});
		expect(result.status).toBe('rejected');
	});

	it('every widget on it is an installed, enabled definition', () => {
		const { nextState } = ensure(buildInitialState(DM_ACTOR), makeEnvironment());
		for (const widget of sessionScreen(nextState).widgets) {
			const definition = findWidgetDefinition(nextState.widgets, widget.type);
			expect(definition, widget.type).toBeDefined();
		}
		// The status, tracker and tray are views of the shared widgets; their defaults are unchanged.
		const view = (type: string) =>
			findWidgetDefinition(nextState.widgets, type)?.configFields?.find(
				(field) => field.key === 'view',
			)?.default;
		expect([view('session'), view('combat'), view('dice')]).toEqual(['strip', 'glance', 'quick']);
	});

	it('every row is a view of a builtin widget, and the views are the GM’s to change', () => {
		const { nextState } = ensure(buildInitialState(DM_ACTOR), makeEnvironment());
		const screen = sessionScreen(nextState);
		// The status row and the right-hand column are `session` views, each named for its row.
		const sessionViews = screen.widgets
			.filter((widget) => widget.type === 'session')
			.map((widget) => widget.configuration.view);
		expect(sessionViews).toEqual(['console', ...SESSION_PANEL_VIEWS.map(({ view }) => view)]);
		expect(new Set(screen.widgets.map((widget) => widget.configuration.title)).size).toBe(
			screen.widgets.filter((widget) => widget.type === 'session').length + 1,
		);
		// Every view the screen uses is one the Inspector offers ("Shows").
		const options = (type: string) =>
			findWidgetDefinition(nextState.widgets, type)
				?.configFields?.find((field) => field.key === 'view')
				?.options?.map((option) => option.value) ?? [];
		for (const widget of screen.widgets)
			expect(options(widget.type), widget.type).toContain(widget.configuration.view);
		for (const type of ['session', 'combat', 'dice']) {
			const definition = findWidgetDefinition(nextState.widgets, type)!;
			expect(definition.renderEntrypoint?.runtime === 'builtin' || type === 'dice').toBe(true);
			// A copy under a new type would lose the hand-written body, so a GM cannot fork one.
			expect(isCopyableSystemWidget(definition)).toBe(false);
		}
	});
});
