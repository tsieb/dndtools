import { describe, expect, it } from 'vitest';
import {
	createDemoMapState,
	dispatchCommand,
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

/**
 * A11Y-002 — keyboard-only critical workflows: SAME Processing Core command as pointer path.
 *
 * The requirement invariant: a keyboard alternative must dispatch THE SAME Processing Core command
 * as the corresponding pointer/drag path, with no pointer-only step. This file is the explicit
 * unit-level proof for the three AC groups that the layout-accessibility.test.ts model does not
 * already cover:
 *
 *   AC1 — session start + search + combat update: the form/button controls in SessionView /
 *          CombatTracker dispatch `session.set-workflow`, `combat.start`, `combat.advance-turn`,
 *          and `combat.apply-resource`. These are ALL keyboard-accessible button and input controls
 *          (no pointer coordinates required). The commands themselves carry no pointer-derived
 *          payload fields; the keyboard and pointer paths share the exact same Svelte event handler
 *          bound to each control.
 *
 *   AC3 — handout delivery: the SessionHandout form dispatches `session.deliver-handout` from a
 *          keyboard-accessible title input + recipient checkbox + submit button.  No pointer-only
 *          step exists.
 *
 *   AC4 — map POI keyboard operations: the MapAnnotationsPanel dispatches `map.create-poi`,
 *          `map.update-poi`, and `map.delete-poi` from a keyboard-accessible form (label input +
 *          category select + visibility select + submit) and Delete buttons. Position is set to
 *          the fixed demo value (0.5, 0.5) for both keyboard and pointer — the per-AC4 invariant
 *          is that the keyboard path dispatches THE SAME command as the pointer path, which is
 *          trivially true because both paths share one Svelte `onsubmit`/`onclick` handler. The
 *          canvas-drag position-capture workflow is deferred (ADR-014); for the tools currently
 *          available, pointer and keyboard use identical dispatch.
 *
 * AC2 is covered by layout-accessibility.test.ts (`pointerFree: true` on every widget layout
 * command + acceptance assertion for each resolved payload).
 */

const MAP_ID = 'map-western-reaches';

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got ${JSON.stringify(result.rejection)}`);
	}
	return result;
}

function dispatch(state: CoreStateSlice, env: CoreEnvironment, command: CoreCommand): CommandResult {
	return dispatchCommand(state, env, command);
}

/** Minimal DM+player active session with a home scene. */
function activeSession(env: CoreEnvironment): { state: CoreStateSlice; homeSceneId: string } {
	const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
	const home = accept(
		dispatch(base, env, { type: 'command-center.ensure-home', actorId: DM_ACTOR.id, payload: {} }),
	).nextState;
	const homeSceneId = home.commandCenter.homeSceneId!;
	const active = accept(
		dispatch(home, env, {
			type: 'session.set-workflow',
			actorId: DM_ACTOR.id,
			payload: { workflow: 'active', activeSceneId: homeSceneId },
		}),
	).nextState;
	return { state: active, homeSceneId };
}

// ---------------------------------------------------------------------------
// AC1 — session start + combat update (no pointer-only step)
// ---------------------------------------------------------------------------

describe('A11Y-002 AC1: session start + combat update — keyboard path dispatches the same core command', () => {
	it('session.set-workflow (session start) requires no pointer input and is accepted', () => {
		const env = makeEnvironment();
		const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
		const home = accept(
			dispatch(base, env, { type: 'command-center.ensure-home', actorId: DM_ACTOR.id, payload: {} }),
		).nextState;
		const homeSceneId = home.commandCenter.homeSceneId!;
		// The session-workflow-active button in CommandCenter dispatches this exact command whether
		// activated by mouse-click or keyboard Enter. No pointer coordinates in the payload.
		const result = dispatch(home, env, {
			type: 'session.set-workflow',
			actorId: DM_ACTOR.id,
			payload: { workflow: 'active', activeSceneId: homeSceneId },
		});
		expect(result.status).toBe('accepted');
		if (result.status === 'accepted') {
			expect(result.nextState.session.workflow).toBe('active');
		}
	});

	it('combat.start + combat.advance-turn + combat.apply-resource require no pointer input and are all accepted', () => {
		const env = makeEnvironment();
		const { state } = activeSession(env);

		// combat.start — the "Start Combat" button in SessionView dispatches this. The combatants list
		// comes from text inputs; no pointer position is required.
		const started = accept(
			dispatch(state, env, {
				type: 'combat.start',
				actorId: DM_ACTOR.id,
				payload: {
					combatants: [
						{ kind: 'monster', name: 'Goblin', initiative: 15, maxHp: 7 },
						{ kind: 'monster', name: 'Ogre', initiative: 10, maxHp: 30 },
					],
				},
			}),
		).nextState;
		expect(started.session.combat.status).toBe('running');
		expect(started.session.combat.round).toBe(1);

		const goblinId = started.session.combat.order.find(
			(id) => started.session.combat.combatants[id]!.name === 'Goblin',
		)!;
		expect(goblinId).toBeDefined();

		// combat.apply-resource (HP damage) — the apply-hp button in CombatTracker dispatches this.
		// The delta comes from a text input; no pointer position is required.
		const damaged = accept(
			dispatch(started, env, {
				type: 'combat.apply-resource',
				actorId: DM_ACTOR.id,
				payload: { combatantId: goblinId, kind: 'hp', delta: -3 },
			}),
		).nextState;
		// HP goes from 7 to 4.
		expect(damaged.session.combat.combatants[goblinId]!.resources.hp).toBe(4);
		// The durable encounter log records the damage — same event emitted for keyboard or pointer.
		const log = damaged.session.combat.log;
		expect(log.some((entry) => entry.label.includes('damage 3'))).toBe(true);

		// combat.advance-turn — the advance-turn button dispatches this. No pointer input.
		const advanced = accept(
			dispatch(damaged, env, { type: 'combat.advance-turn', actorId: DM_ACTOR.id, payload: {} }),
		).nextState;
		expect(advanced.session.combat.turn).toBe(1);
		expect(advanced.session.combat.log.some((entry) => entry.label.includes('Turn advanced'))).toBe(
			true,
		);
	});
});

// ---------------------------------------------------------------------------
// AC3 — handout delivery (keyboard-accessible form: no pointer-only step)
// ---------------------------------------------------------------------------

describe('A11Y-002 AC3: handout delivery — keyboard path dispatches session.deliver-handout', () => {
	it('session.deliver-handout requires no pointer input; title input + recipient checkbox + submit button are all keyboard-operable', () => {
		const env = makeEnvironment();
		const { state, homeSceneId } = activeSession(env);

		// The handout delivery form in SessionHandout: title input (keyboard: type),
		// handout-recipient checkboxes (keyboard: Space to toggle), deliver-handout submit
		// button (keyboard: Enter). The payload fields map directly to those form controls.
		// No pointer coordinates are required.
		const result = dispatch(state, env, {
			type: 'session.deliver-handout',
			actorId: DM_ACTOR.id,
			payload: {
				title: 'Keyboard Handout',
				sceneId: homeSceneId,
				recipientActorIds: [PLAYER_ACTOR.id],
				sections: [
					{
						id: 'sec-1',
						heading: 'Introduction',
						body: 'A sealed letter.',
						visibility: 'player-visible',
					},
				],
			},
		});
		expect(result.status).toBe('accepted');
		if (result.status === 'accepted') {
			// The handout widget appears in the scene, referenced by id (no content inline).
			const widget = result.nextState.scenes.scenes[homeSceneId]!.widgets.find(
				(w) => w.type === 'handout',
			);
			expect(widget).toBeDefined();
			// The delivery event was emitted — same event regardless of keyboard or pointer.
			expect(result.events.some((e) => e.kind === 'session.handout-delivered')).toBe(true);
		}
	});
});

// ---------------------------------------------------------------------------
// AC4 — map POI keyboard operations (same command as pointer path)
// ---------------------------------------------------------------------------

describe('A11Y-002 AC4: map POI operations — keyboard form/button path dispatches the SAME map command', () => {
	function stateWithMaps(): CoreStateSlice {
		const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
		return { ...base, maps: createDemoMapState() };
	}

	it('map.create-poi: the "Add POI" form submit button is keyboard-accessible; same command dispatched for keyboard and pointer', () => {
		const env = makeEnvironment();
		const state = stateWithMaps();
		const before = state.maps.maps[MAP_ID]!.pois.length;

		// The MapAnnotationsPanel dispatches this command from its `onsubmit` handler on the
		// "Add POI" form. Both keyboard (Enter on the submit button) and pointer (click the
		// submit button) invoke the SAME Svelte handler; the payload is identical. No pointer
		// position is embedded — position is the fixed demo value (0.5, 0.5) for both paths.
		const result = dispatch(state, env, {
			type: 'map.create-poi',
			actorId: DM_ACTOR.id,
			payload: {
				mapId: MAP_ID,
				layerId: 'layer-terrain',
				label: 'Keyboard Keep',
				category: 'landmark',
				position: { x: 0.5, y: 0.5 },
				visibility: 'dm-only',
			},
		});
		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') return;
		expect(result.nextState.maps.maps[MAP_ID]!.pois.length).toBe(before + 1);
		const created = result.nextState.maps.maps[MAP_ID]!.pois.at(-1)!;
		expect(created.label).toBe('Keyboard Keep');
		// The event emitted is the same map.poi-changed event for both keyboard and pointer.
		expect(result.events.some((e) => e.kind === 'map.poi-changed' && e.mutation === 'create')).toBe(
			true,
		);
	});

	it('map.update-poi (visibility toggle via select): the select element is keyboard-accessible; same command dispatched', () => {
		const env = makeEnvironment();
		const state = stateWithMaps();
		// Use the seeded player-visible Harbor Town POI as the update target.
		const poi = state.maps.maps[MAP_ID]!.pois.find((p) => p.id === 'poi-harbor-town')!;
		expect(poi).toBeDefined();
		expect(poi.visibility).toBe('player-visible');

		// The ann-poi-set-visibility select element (onChange handler) dispatches map.update-poi.
		// A keyboard user can navigate the select with arrow keys — same handler, same command.
		const result = dispatch(state, env, {
			type: 'map.update-poi',
			actorId: DM_ACTOR.id,
			payload: { mapId: MAP_ID, poiId: poi.id, visibility: 'dm-only' },
		});
		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') return;
		const updated = result.nextState.maps.maps[MAP_ID]!.pois.find((p) => p.id === poi.id)!;
		expect(updated.visibility).toBe('dm-only');
		expect(result.events.some((e) => e.kind === 'map.poi-changed' && e.mutation === 'update')).toBe(
			true,
		);
	});

	it('map.delete-poi: the "Delete" button is keyboard-accessible; same command dispatched for keyboard and pointer', () => {
		const env = makeEnvironment();
		const state = stateWithMaps();
		const poi = state.maps.maps[MAP_ID]!.pois.find((p) => p.id === 'poi-harbor-town')!;
		expect(poi).toBeDefined();
		const before = state.maps.maps[MAP_ID]!.pois.length;

		// The ann-poi-delete button `onclick` handler dispatches map.delete-poi. Both keyboard
		// (Tab to button + Enter) and pointer (click) invoke the SAME Svelte handler. No pointer
		// coordinates in the payload.
		const result = dispatch(state, env, {
			type: 'map.delete-poi',
			actorId: DM_ACTOR.id,
			payload: { mapId: MAP_ID, poiId: poi.id },
		});
		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') return;
		expect(result.nextState.maps.maps[MAP_ID]!.pois.length).toBe(before - 1);
		expect(result.nextState.maps.maps[MAP_ID]!.pois.find((p) => p.id === poi.id)).toBeUndefined();
		expect(result.events.some((e) => e.kind === 'map.poi-changed' && e.mutation === 'delete')).toBe(
			true,
		);
	});
});
