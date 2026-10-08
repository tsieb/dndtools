import { describe, expect, it } from 'vitest';
import {
	SESSION_SCREEN_DEFAULT_KEY,
	SESSION_SCREEN_PARTS,
	SESSION_WIDGET_TYPES,
	createSessionWidgetDefinitions,
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
import { widgetPackageDefinitionSchema } from '../src/schemas/widget-package';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

/**
 * RC-CAN-7.8 — Session as a screen (ADR-041 "Defaults and preservation"). `command-center.ensure-home`
 * with `session: true` (what `/session` asks) provisions a FLOW Session screen of the console's widgets
 * beside the board and the home screen; without it nothing about ensure-home changes.
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
			payload: session ? { session: true } : {},
		}),
	);
}

function sessionScreen(state: CoreStateSlice): Scene {
	const screen = findSessionScreen(state.scenes);
	if (!screen) throw new Error('no Session screen');
	return screen;
}

describe('RC-CAN-7.8 the Session screen', () => {
	it('is provisioned only when asked, as a GM-only flow screen of the console’s widgets', () => {
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
		// The board, the home screen and the Session screen, each its own recorded write.
		expect(findHomeScreen(nextState.scenes)).not.toBeNull();
		expect(events.filter((event) => event.kind === 'scene.created')).toHaveLength(2);
		expect(operationIds.length).toBeGreaterThanOrEqual(2);
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
		const schedule = screen.widgets.find((widget) => widget.type === 'session-schedule')!;
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
		expect(sessionScreen(again.nextState).widgets.map((widget) => widget.type)).not.toContain(
			'session-schedule',
		);
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
			payload: { session: true },
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
			findWidgetDefinition(nextState.widgets, type)?.configFields.find(
				(field) => field.key === 'view',
			)?.default;
		expect([view('session'), view('combat'), view('dice')]).toEqual(['strip', 'glance', 'quick']);
	});

	it('its panels are builtin system definitions the schema accepts, and stay locked', () => {
		const definitions = createSessionWidgetDefinitions();
		expect(definitions.map((definition) => definition.type)).toEqual([...SESSION_WIDGET_TYPES]);
		const parsed = widgetPackageDefinitionSchema.safeParse({
			id: 'system.session-widgets',
			version: '1.0.0',
			displayName: 'Session Widgets',
			widgets: definitions,
			migrations: [],
			assets: [],
			portabilityWarnings: [],
		});
		expect(parsed.success).toBe(true);
		for (const definition of definitions) {
			expect(definition.renderEntrypoint?.runtime).toBe('builtin');
			expect(definition.placement).toEqual({ surfaces: ['scene'], libraryListed: false });
			expect(definition.configFields.find((field) => field.key === 'presentation')?.default).toBe(
				'bare',
			);
			// A copy under a new type would lose the hand-written body, so a GM cannot fork one.
			expect(isCopyableSystemWidget(definition)).toBe(false);
		}
	});
});
