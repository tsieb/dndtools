import { describe, expect, it } from 'vitest';
import {
	classifyObserverCommand,
	dispatchCommand,
	isObserverActor,
	observerAccessSummary,
	observerVisibleScenes,
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
 * COLLAB-011 — Observers join shared sessions as READ-ONLY participants with access ONLY to explicitly
 * shared Scenes, maps, and placeholders, and NO character data or write-capable controls.
 *
 *   AC1: Given an observer joins a session, when join succeeds, then their visible scene list EXCLUDES
 *        character sheets, private player views, and DM-only content.
 *   AC2: Given an observer invokes any write-capable command, when the command is validated, then it is
 *        rejected BEFORE mutation.
 */

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got rejected: ${result.rejection.message}`);
	}
	return result;
}

function createScene(
	state: CoreStateSlice,
	env: CoreEnvironment,
	name: string,
	visibility: 'dm-only' | 'shared' | 'player-visible',
): { state: CoreStateSlice; sceneId: string } {
	const before = new Set(Object.keys(state.scenes.scenes));
	const result = accept(
		dispatchCommand(state, env, {
			type: 'scene.create',
			actorId: DM_ACTOR.id,
			payload: { name, visibility },
		}),
	);
	const sceneId = Object.keys(result.nextState.scenes.scenes).find((id) => !before.has(id));
	if (!sceneId) throw new Error('missing scene id');
	return { state: result.nextState, sceneId };
}

describe('COLLAB-011: observer read-only access', () => {
	it('AC1: an observer scene list excludes dm-only content and private player views', () => {
		const env = makeEnvironment();
		const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
		// A DM-only scene (never visible to a non-DM), a player-visible scene (the observer may see), and a
		// shared scene projected privately to the PLAYER only (a private player view — not the observer's).
		const dmOnly = createScene(base, env, 'DM Secrets', 'dm-only');
		const shown = createScene(dmOnly.state, env, 'Tavern', 'player-visible');
		const privateShared = createScene(shown.state, env, 'Player A Private', 'shared');

		// Project the shared scene privately to the PLAYER (this is Player A's private view, not the observer's).
		const projected = accept(
			dispatchCommand(privateShared.state, env, {
				type: 'session.project-player-view',
				actorId: DM_ACTOR.id,
				payload: {
					playerActorIds: [PLAYER_ACTOR.id],
					connectionState: 'connected',
					target: {
						kind: 'scene',
						sceneId: privateShared.sceneId,
						sectionIds: null,
						widgetInstanceIds: null,
						displayState: null,
						mapRegion: null,
					},
				},
			}),
		).nextState;

		const scenes = observerVisibleScenes(projected.scenes, projected.permissions, OBSERVER_ACTOR.id);
		const ids = scenes.map((s) => s.id);
		// Only the player-visible scene is visible to the observer.
		expect(ids).toEqual([shown.sceneId]);
		// DM-only content is excluded.
		expect(ids).not.toContain(dmOnly.sceneId);
		// The PLAYER's private shared player view is NOT visible to the observer.
		expect(ids).not.toContain(privateShared.sceneId);
	});

	it('AC1: an observer access summary is read-only with no character data and carries no character content', () => {
		const env = makeEnvironment();
		const base = buildInitialState(DM_ACTOR, OBSERVER_ACTOR);
		const shown = createScene(base, env, 'Shared Map Room', 'player-visible');
		const result = observerAccessSummary(
			shown.state.scenes,
			shown.state.permissions,
			shown.state.session,
			OBSERVER_ACTOR.id,
		);
		expect(result.kind).toBe('available');
		if (result.kind !== 'available') return;
		expect(result.readOnly).toBe(true);
		expect(result.canReadCharacterData).toBe(false);
		expect(result.visibleScenes.map((s) => s.id)).toEqual([shown.sceneId]);
		// The summary carries no character-sheet fields (it is scene descriptors only).
		expect(JSON.stringify(result)).not.toContain('dmNotes');
	});

	it('AC1: the observer surface is denied (fail closed) for non-observers and unknown actors', () => {
		const env = makeEnvironment();
		const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
		const { state } = createScene(base, env, 'Tavern', 'player-visible');
		// A player is not the observer surface.
		expect(observerAccessSummary(state.scenes, state.permissions, state.session, PLAYER_ACTOR.id)).toEqual(
			{ kind: 'denied', reason: 'not-observer' },
		);
		// The DM is not the observer surface.
		expect(observerAccessSummary(state.scenes, state.permissions, state.session, DM_ACTOR.id)).toEqual({
			kind: 'denied',
			reason: 'not-observer',
		});
		// An unknown id is denied.
		expect(observerAccessSummary(state.scenes, state.permissions, state.session, 'actor-ghost')).toEqual(
			{ kind: 'denied', reason: 'unknown-actor' },
		);
		// observerVisibleScenes returns empty for a non-observer.
		expect(observerVisibleScenes(state.scenes, state.permissions, PLAYER_ACTOR.id)).toEqual([]);
	});

	it('AC2: an observer invoking ANY write-capable command is rejected before mutation', () => {
		const env = makeEnvironment();
		const base = buildInitialState(DM_ACTOR, OBSERVER_ACTOR);
		// A representative spread of write commands across domains — every one must be rejected fail closed.
		const writeCommands: CoreCommand[] = [
			{ type: 'scene.create', actorId: OBSERVER_ACTOR.id, payload: { name: 'X', visibility: 'dm-only' } },
			{
				type: 'scene.add-widget',
				actorId: OBSERVER_ACTOR.id,
				payload: { sceneId: 'scene-x', widget: { type: 'note', version: '1.0.0', layout: { x: 0, y: 0, w: 1, h: 1 } } },
			},
			{ type: 'dice.roll', actorId: OBSERVER_ACTOR.id, payload: { expression: '1d20' } },
			{
				type: 'session.set-workflow',
				actorId: OBSERVER_ACTOR.id,
				payload: { workflow: 'active' },
			},
			{
				type: 'character.quick-create',
				actorId: OBSERVER_ACTOR.id,
				payload: { name: 'Goblin', kind: 'monster' },
			},
			{
				type: 'session.acknowledge-handout',
				actorId: OBSERVER_ACTOR.id,
				payload: { handoutId: 'handout-x' },
			},
		];

		for (const command of writeCommands) {
			const result = dispatchCommand(base, env, command);
			expect(result.status, `${command.type} must be rejected for observer`).toBe('rejected');
			if (result.status === 'rejected') {
				expect(result.rejection.code).toBe('actor-not-authorized');
			}
			// No mutation: state is unchanged.
			expect(result.nextState).toBe(base);
		}
	});

	it('AC2: the observer command gate is exhaustive (fail closed) — even an unknown/forged command type', () => {
		const base = buildInitialState(DM_ACTOR, OBSERVER_ACTOR);
		// classifyObserverCommand denies an observer for ANY command type, including a forged one.
		expect(classifyObserverCommand(base.permissions, OBSERVER_ACTOR.id, 'totally.made-up')).toEqual({
			allowed: false,
			reason: 'observer-read-only',
			message: 'Observers have read-only access and cannot run this action.',
		});
		// A non-observer is allowed through the gate (their own reducer enforces authority).
		expect(classifyObserverCommand(base.permissions, DM_ACTOR.id, 'scene.create')).toEqual({
			allowed: true,
		});
		// An unknown/unauthenticated actor is treated as the least-privileged observer ceiling (denied).
		expect(classifyObserverCommand(base.permissions, 'actor-ghost', 'scene.create').allowed).toBe(false);
		expect(isObserverActor(base.permissions, 'actor-ghost')).toBe(true);
		expect(isObserverActor(base.permissions, OBSERVER_ACTOR.id)).toBe(true);
		expect(isObserverActor(base.permissions, DM_ACTOR.id)).toBe(false);
	});

	it('AC2: a DM write command still succeeds (the gate does not over-block non-observers)', () => {
		const env = makeEnvironment();
		const base = buildInitialState(DM_ACTOR, OBSERVER_ACTOR);
		const result = dispatchCommand(base, env, {
			type: 'scene.create',
			actorId: DM_ACTOR.id,
			payload: { name: 'DM Scene', visibility: 'dm-only' },
		});
		expect(result.status).toBe('accepted');
	});
});
