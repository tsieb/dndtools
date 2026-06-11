import { describe, expect, it } from 'vitest';
import {
	dispatchCommand,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
} from '../src';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

/**
 * UX-CMD-008 — the recoverable last-known-good auto-save slot (save / restore). The slot is a single,
 * unnamed snapshot the DM can roll back to after a crash or an unwanted experimental change.
 */

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got rejected: ${result.rejection.message}`);
	}
	return result;
}

function rejected(result: CommandResult): Extract<CommandResult, { status: 'rejected' }> {
	if (result.status !== 'rejected') throw new Error('expected rejected');
	return result;
}

function dispatch(state: CoreStateSlice, env: CoreEnvironment, command: CoreCommand): CommandResult {
	return dispatchCommand(state, env, command);
}

function homeState(): { state: CoreStateSlice; env: CoreEnvironment; homeSceneId: string } {
	const env = makeEnvironment();
	const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
	const home = accept(
		dispatch(base, env, { type: 'command-center.ensure-home', actorId: DM_ACTOR.id, payload: {} }),
	).nextState;
	return { state: home, env, homeSceneId: home.commandCenter.homeSceneId! };
}

function firstWidget(state: CoreStateSlice, homeSceneId: string) {
	return state.scenes.scenes[homeSceneId]!.widgets[0]!;
}

function moveWidget(
	state: CoreStateSlice,
	env: CoreEnvironment,
	homeSceneId: string,
	widgetInstanceId: string,
	x: number,
	y: number,
): CoreStateSlice {
	return accept(
		dispatch(state, env, {
			type: 'scene.move-widget',
			actorId: DM_ACTOR.id,
			payload: { sceneId: homeSceneId, widgetInstanceId, x, y },
		}),
	).nextState;
}

describe('UX-CMD-008 Command Center last-known-good auto-save', () => {
	it('captures a safe point and restores the layout back to it', () => {
		const { state, env, homeSceneId } = homeState();
		const widget = firstWidget(state, homeSceneId);
		const baselineX = widget.layout.x;

		// Capture the current good layout into the auto-save slot.
		const snapped = accept(
			dispatch(state, env, {
				type: 'command-center.snapshot-auto-save',
				actorId: DM_ACTOR.id,
				payload: {},
			}),
		).nextState;
		expect(snapped.commandCenter.autoSave).not.toBeNull();
		expect(snapped.commandCenter.autoSave?.widgets.length).toBe(
			state.scenes.scenes[homeSceneId]!.widgets.length,
		);

		// Make an experimental change (NOT auto-saved).
		const moved = moveWidget(snapped, env, homeSceneId, widget.id, baselineX + 200, widget.layout.y);
		expect(firstWidget(moved, homeSceneId).layout.x).toBe(baselineX + 200);

		// Restore the safe point: the layout returns to the captured baseline.
		const restoredResult = accept(
			dispatch(moved, env, {
				type: 'command-center.restore-auto-save',
				actorId: DM_ACTOR.id,
				payload: {},
			}),
		);
		const restored = restoredResult.nextState;
		// Widgets are re-materialized with fresh ids but the same layout position.
		expect(restored.scenes.scenes[homeSceneId]!.widgets[0]!.layout.x).toBe(baselineX);
		const event = restoredResult.events.find(
			(candidate) => candidate.kind === 'command-center.auto-save-restored',
		);
		expect(event?.kind).toBe('command-center.auto-save-restored');
	});

	it('rejects restore when no safe point has been captured', () => {
		const { state, env } = homeState();
		const result = rejected(
			dispatch(state, env, {
				type: 'command-center.restore-auto-save',
				actorId: DM_ACTOR.id,
				payload: {},
			}),
		);
		expect(result.rejection.code).toBe('auto-save-not-available');
	});

	it('refuses auto-save commands from a non-DM actor (fail closed)', () => {
		const { state, env } = homeState();
		const snapResult = rejected(
			dispatch(state, env, {
				type: 'command-center.snapshot-auto-save',
				actorId: PLAYER_ACTOR.id,
				payload: {},
			}),
		);
		expect(snapResult.rejection.code).toBe('actor-not-authorized');
	});
});
