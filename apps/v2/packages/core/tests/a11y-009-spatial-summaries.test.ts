import { describe, expect, it } from 'vitest';
import {
	createDemoMapState,
	dispatchCommand,
	getCalendarTimelineForActor,
	getMapViewForActor,
	getSceneForActor,
	EMPTY_WIDGET_DATA_ENVIRONMENT,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
} from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	buildPermissionState,
	makeEnvironment,
} from '../src/testing/fixtures';

/**
 * A11Y-009 — Spatial Scene, map, graph, route, and timeline surfaces shall provide nonvisual
 * list, table, or structured summaries exposing equivalent visible information and commands.
 *
 * AC1 (map summary): a screen reader user can review and activate visible POIs/routes without
 *   pointer positioning. Hidden POIs MUST NOT appear (no-leak).
 * AC2 (Scene outline): widgets are listed with accessible names, visibility-safe binding labels,
 *   and available commands. A player-hidden binding MUST NOT expose the entity id.
 *
 * These tests are the structural proofs for the query/summary layer:
 *   - `getMapViewForActor` fail-closed: dm-only POI/route omitted for player
 *   - `getMapViewForActor` activation data: visible POI carries linkedEntityId for "View linked entity"
 *   - `getMapViewForActor` activation data: visible route carries waypoint linkedEntityId for "View destination"
 *   - `getCalendarTimelineForActor` fail-closed: dm-only content item omitted from timeline
 *   - `getCalendarTimelineForActor` activation data: visible item exposes itemId for "/knowledge/?note=…" link
 *   - `getSceneForActor` + `widgetAccessibleName` visibility-safe names tested in app/src/lib/a11y/widget-name.test.ts
 */

const MAP_ID = 'map-western-reaches';

function permissionsWithDmAndPlayer(): PermissionState {
	return buildPermissionState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
}

// ---------------------------------------------------------------------------
// AC1 — Map nonvisual summary: no-leak + activation data
// ---------------------------------------------------------------------------

describe('A11Y-009 AC1: getMapViewForActor — nonvisual map summary no-leak', () => {
	it('[NO-LEAK] dm-only POI "Smugglers Cache" is OMITTED from a player map summary', () => {
		const maps = createDemoMapState();
		const permissions = permissionsWithDmAndPlayer();

		const view = getMapViewForActor(maps, permissions, PLAYER_ACTOR.id, MAP_ID);
		expect(view.kind).toBe('available');
		if (view.kind !== 'available') return;

		const ids = view.pois.map((p) => p.id);
		// The player-visible POI appears; the dm-only one does not.
		expect(ids).toContain('poi-harbor-town');
		expect(ids).not.toContain('poi-smugglers-cache');
		// None of the returned POI labels or notes should mention the secret.
		const labels = view.pois.map((p) => p.label);
		expect(labels).not.toContain("Smugglers' Cache");
		// The dm-only POI's linkedEntityId must never appear in any visible POI.
		const linkedIds = view.pois.map((p) => p.linkedEntityId).filter(Boolean);
		expect(linkedIds).not.toContain('note-smugglers-cache');
	});

	it('[NO-LEAK] dm-only POI DOES appear for the DM', () => {
		const maps = createDemoMapState();
		const permissions = permissionsWithDmAndPlayer();

		const view = getMapViewForActor(maps, permissions, DM_ACTOR.id, MAP_ID);
		expect(view.kind).toBe('available');
		if (view.kind !== 'available') return;

		const ids = view.pois.map((p) => p.id);
		expect(ids).toContain('poi-harbor-town');
		expect(ids).toContain('poi-smugglers-cache');
	});

	it('visible POI carries linkedEntityId so a nonvisual summary can render an activation link', () => {
		const maps = createDemoMapState();
		const permissions = permissionsWithDmAndPlayer();

		const view = getMapViewForActor(maps, permissions, PLAYER_ACTOR.id, MAP_ID);
		expect(view.kind).toBe('available');
		if (view.kind !== 'available') return;

		const harbor = view.pois.find((p) => p.id === 'poi-harbor-town');
		expect(harbor).toBeDefined();
		// The linkedEntityId is present: the GUI can render a "View linked entity" link.
		expect(harbor!.linkedEntityId).toBe('note-harbor-town');
		expect(harbor!.linkedEntityType).toBe('note');
	});

	it('[NO-LEAK] dm-only layer hides all its annotations from the player', () => {
		const maps = createDemoMapState();
		const permissions = permissionsWithDmAndPlayer();

		// The dm-only POI lives on the dm-only layer (layer-hidden-camps); verifying that the
		// layer-level hidden-ancestor-wins rule also fires independently of the POI's own visibility.
		const view = getMapViewForActor(maps, permissions, PLAYER_ACTOR.id, MAP_ID);
		if (view.kind !== 'available') return;

		// No POI from a dm-only layer should be visible.
		const dmOnlyPoi = view.pois.find((p) => p.id === 'poi-smugglers-cache');
		expect(dmOnlyPoi).toBeUndefined();
	});

	it('[NO-LEAK] unknown actor receives an unavailable (generic) result', () => {
		const maps = createDemoMapState();
		const permissions = permissionsWithDmAndPlayer();

		const view = getMapViewForActor(maps, permissions, 'actor-unknown', MAP_ID);
		// Fail-closed: a completely unknown actor cannot even read the map name.
		expect(view.kind).toBe('unavailable');
	});
});

describe('A11Y-009 AC1: getMapViewForActor — route nonvisual summary no-leak + activation data', () => {
	it('player-visible route appears in the nonvisual summary with its label and measurement', () => {
		const maps = createDemoMapState();
		const permissions = permissionsWithDmAndPlayer();

		const view = getMapViewForActor(maps, permissions, PLAYER_ACTOR.id, MAP_ID);
		expect(view.kind).toBe('available');
		if (view.kind !== 'available') return;

		expect(view.routes.length).toBeGreaterThan(0);
		const route = view.routes.find((r) => r.id === 'route-north-road');
		expect(route).toBeDefined();
		expect(route!.label).toBe('North Road March');
		// The measurement must be present so the summary can state the distance.
		expect(route!.measurement).toBeDefined();
	});

	it('visible route waypoints carry linkedEntityId for "View destination" activation link', () => {
		const maps = createDemoMapState();
		const permissions = permissionsWithDmAndPlayer();

		const view = getMapViewForActor(maps, permissions, PLAYER_ACTOR.id, MAP_ID);
		if (view.kind !== 'available') return;

		const route = view.routes.find((r) => r.id === 'route-north-road');
		expect(route).toBeDefined();
		const linkedWaypoint = route!.waypoints.find((wp) => wp.linkedEntityId);
		expect(linkedWaypoint).toBeDefined();
		// The harbor-town waypoint links to the Harbor Town POI — activation is possible.
		expect(linkedWaypoint!.linkedEntityId).toBe('poi-harbor-town');
	});
});

// ---------------------------------------------------------------------------
// AC1 — Timeline nonvisual summary: no-leak + activation data
// ---------------------------------------------------------------------------

const HARPTOS_PAYLOAD = {
	id: 'cal-test',
	name: 'Test Calendar',
	months: [{ id: 'm1', name: 'Hammer', days: 30 }],
	weekdays: ['First', 'Second', 'Third', 'Fourth', 'Fifth'],
	epochLabel: 'DR',
};

function accepted(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	expect(result.status).toBe('accepted');
	if (result.status !== 'accepted') throw new Error('expected accepted');
	return result;
}

function cmd(type: CoreCommand['type'], payload: unknown, actorId = DM_ACTOR.id): CoreCommand {
	return { type, actorId, payload } as CoreCommand;
}

function stateWithTimelineItems(env: CoreEnvironment): {
	state: CoreStateSlice;
	visibleItemId: string;
	hiddenItemId: string;
} {
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);

	// Define a calendar.
	state = accepted(dispatchCommand(state, env, cmd('content.define-calendar', HARPTOS_PAYLOAD))).nextState;

	// Create a player-visible dated note.
	const visibleResult = accepted(
		dispatchCommand(
			state,
			env,
			cmd('content.create-item', {
				kind: 'note',
				title: 'The Battle of Helm Pass',
				visibility: 'player-visible',
				dateFields: { occursOn: { calendarId: 'cal-test', year: 1372, month: 1, day: 15 } },
			}),
		),
	);
	state = visibleResult.nextState;
	const visibleItems = Object.values(state.content.items);
	const visibleItem = visibleItems.find((i) => i.title === 'The Battle of Helm Pass')!;
	const visibleItemId = visibleItem.id;

	// Create a dm-only dated note — must be OMITTED from the player timeline.
	const hiddenResult = accepted(
		dispatchCommand(
			state,
			env,
			cmd('content.create-item', {
				kind: 'note',
				title: 'Secret DM Notes',
				visibility: 'dm-only',
				dateFields: { occursOn: { calendarId: 'cal-test', year: 1372, month: 1, day: 16 } },
			}),
		),
	);
	state = hiddenResult.nextState;
	const allItems = Object.values(state.content.items);
	const hiddenItem = allItems.find((i) => i.title === 'Secret DM Notes')!;
	const hiddenItemId = hiddenItem.id;

	return { state, visibleItemId, hiddenItemId };
}

describe('A11Y-009 AC1: getCalendarTimelineForActor — timeline nonvisual summary no-leak', () => {
	it('[NO-LEAK] dm-only dated item is OMITTED from a player timeline', () => {
		const env = makeEnvironment();
		const { state, visibleItemId, hiddenItemId } = stateWithTimelineItems(env);
		const permissions = state.permissions;

		const timeline = getCalendarTimelineForActor(state.content, permissions, PLAYER_ACTOR.id, 'cal-test');

		const ids = timeline.map((r) => r.itemId);
		expect(ids).toContain(visibleItemId);
		expect(ids).not.toContain(hiddenItemId);

		const titles = timeline.map((r) => r.title);
		expect(titles).not.toContain('Secret DM Notes');
	});

	it('[NO-LEAK] dm-only dated item DOES appear for the DM', () => {
		const env = makeEnvironment();
		const { state, visibleItemId, hiddenItemId } = stateWithTimelineItems(env);
		const permissions = state.permissions;

		const timeline = getCalendarTimelineForActor(state.content, permissions, DM_ACTOR.id, 'cal-test');

		const ids = timeline.map((r) => r.itemId);
		expect(ids).toContain(visibleItemId);
		expect(ids).toContain(hiddenItemId);
	});

	it('visible timeline entry exposes itemId for a "/knowledge/?note=<id>" activation link', () => {
		const env = makeEnvironment();
		const { state, visibleItemId } = stateWithTimelineItems(env);
		const permissions = state.permissions;

		const timeline = getCalendarTimelineForActor(state.content, permissions, PLAYER_ACTOR.id, 'cal-test');

		const row = timeline.find((r) => r.itemId === visibleItemId);
		expect(row).toBeDefined();
		// The itemId is the key that the GUI uses to build a "/knowledge/?note=<itemId>" link.
		expect(row!.itemId).toBe(visibleItemId);
		expect(row!.title).toBe('The Battle of Helm Pass');
		// The date display is stable (no locale/timezone) so screen readers read it consistently.
		expect(typeof row!.date.display).toBe('string');
		expect(row!.date.display.length).toBeGreaterThan(0);
	});

	it('[NO-LEAK] an unknown actor receives an empty timeline (fail-closed)', () => {
		const env = makeEnvironment();
		const { state } = stateWithTimelineItems(env);

		const timeline = getCalendarTimelineForActor(
			state.content,
			state.permissions,
			'actor-unknown',
			'cal-test',
		);
		expect(timeline).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// AC2 — Scene outline: widgetAccessibleName visibility-safe names
// (Core structural proof; detailed name-derivation tests live in
// apps/v2/app/src/lib/a11y/widget-name.test.ts — A11Y-007 AC1)
// ---------------------------------------------------------------------------

describe('A11Y-009 AC2: getSceneForActor — Scene outline delivers hidden payload without entity id', () => {
	it('[NO-LEAK] a widget with a DM-only binding resolves to kind "hidden" for the player, preserving type but not entity id', () => {
		const env = makeEnvironment();
		const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);

		// DM creates a scene that is visible to all (player-visible).
		const sceneResult = accepted(
			dispatchCommand(
				base,
				env,
				cmd('scene.create', { name: 'Outline Test Scene', visibility: 'player-visible' }),
			),
		);
		let state = sceneResult.nextState;
		const sceneId = Object.keys(state.scenes.scenes)[0]!;

		// DM adds a note widget whose binding selector marker resolves to `hidden` for the player.
		// The `hidden:` marker in the selector makes resolveWidgetBinding return `state:'hidden'`
		// for any non-DM actor — simulating a DM-only bound entity without a real entity store.
		const addResult = accepted(
			dispatchCommand(
				state,
				env,
				cmd('scene.add-widget', {
					sceneId,
					widget: {
						type: 'note',
						version: '1.0.0',
						layout: { x: 0, y: 0, w: 100, h: 100 },
						configuration: {},
						binding: {
							source: {
								entityType: 'character',
								entityId: 'char-dm-secret',
								selector: 'hidden:dm-only',
							},
							mode: 'read',
							requiredCapability: 'viewer',
						},
					},
				}),
			),
		);
		state = addResult.nextState;

		// The Scene outline for the DM — widget is available with full binding.
		const dmSummary = getSceneForActor(state.scenes, state.permissions, DM_ACTOR.id, sceneId);
		expect('kind' in dmSummary).toBe(false);
		if ('kind' in dmSummary) return;
		const dmWidget = dmSummary.widgets.find((w) => w.kind === 'available');
		expect(dmWidget).toBeDefined();
		if (dmWidget && dmWidget.kind === 'available') {
			expect(dmWidget.widget.binding?.source.entityId).toBe('char-dm-secret');
		}

		// The Scene outline for the player — widget is hidden; entity id MUST NOT appear.
		const playerSummary = getSceneForActor(
			state.scenes,
			state.permissions,
			PLAYER_ACTOR.id,
			sceneId,
			{ dataEnvironment: EMPTY_WIDGET_DATA_ENVIRONMENT },
		);
		expect('kind' in playerSummary).toBe(false);
		if ('kind' in playerSummary) return;

		// The widget is in the outline (list completeness) but with kind 'hidden' (not 'available').
		expect(playerSummary.widgets.length).toBeGreaterThan(0);
		const hiddenWidget = playerSummary.widgets.find((w) => w.kind === 'hidden');
		expect(hiddenWidget).toBeDefined();
		if (hiddenWidget && hiddenWidget.kind === 'hidden') {
			// The type is preserved so `widgetAccessibleName` can say "note widget (unavailable)".
			expect(hiddenWidget.type).toBe('note');
			// The entity id must NOT appear in the payload — it stays in the core, never in the GUI.
			expect(JSON.stringify(hiddenWidget)).not.toContain('char-dm-secret');
		}
	});

	it('widgets in the Scene outline carry a deterministic focus order', () => {
		const env = makeEnvironment();
		const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);

		const sceneResult = accepted(
			dispatchCommand(
				base,
				env,
				cmd('scene.create', { name: 'Focus Order Scene', visibility: 'player-visible' }),
			),
		);
		let state = sceneResult.nextState;
		const sceneId = Object.keys(state.scenes.scenes)[0]!;

		// Add three widgets so we have a meaningful focus order.
		state = accepted(dispatchCommand(state, env, cmd('scene.add-widget', { sceneId, widget: { type: 'note', version: '1.0.0', layout: { x: 0, y: 0, w: 100, h: 100 }, configuration: {}, binding: null } }))).nextState;
		state = accepted(dispatchCommand(state, env, cmd('scene.add-widget', { sceneId, widget: { type: 'note', version: '1.0.0', layout: { x: 0, y: 0, w: 100, h: 100 }, configuration: {}, binding: null } }))).nextState;
		state = accepted(dispatchCommand(state, env, cmd('scene.add-widget', { sceneId, widget: { type: 'note', version: '1.0.0', layout: { x: 0, y: 0, w: 100, h: 100 }, configuration: {}, binding: null } }))).nextState;

		const summary = getSceneForActor(state.scenes, state.permissions, PLAYER_ACTOR.id, sceneId);
		expect('kind' in summary).toBe(false);
		if ('kind' in summary) return;

		// The focus order is present — every outline entry has a deterministic tabIndex.
		expect(summary.focusOrder.length).toBeGreaterThan(0);
		summary.focusOrder.forEach((entry, index) => {
			expect(entry.tabIndex).toBe(index);
		});
	});
});
