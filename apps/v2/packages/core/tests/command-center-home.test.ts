import { describe, expect, it } from 'vitest';
import {
	dispatchCommand,
	getSessionStatusStrip,
	resolveCommandCenterHome,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
} from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

/**
 * UX-CMD-003 / UX-CMD-012 — the viewer-gated Command Center home read model. These tests are the
 * primary no-leak evidence for the most dangerous aggregating surface in the product: the role gate and
 * the status strip must never expose a DM-only scene, a connected-count, or a hidden combatant to a
 * player/observer.
 */

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got rejected: ${result.rejection.message}`);
	}
	return result;
}

function dispatch(state: CoreStateSlice, env: CoreEnvironment, command: CoreCommand): CommandResult {
	return dispatchCommand(state, env, command);
}

const FORBIDDEN = 'FORBIDDEN-DM-SECRET-7Q';

function homeWithSession(): { state: CoreStateSlice; env: CoreEnvironment; homeSceneId: string } {
	const env = makeEnvironment();
	const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
	const home = accept(
		dispatch(base, env, { type: 'command-center.ensure-home', actorId: DM_ACTOR.id, payload: {} }),
	).nextState;
	return { state: home, env, homeSceneId: home.commandCenter.homeSceneId! };
}

describe('UX-CMD-003 session status strip (viewer-filtered)', () => {
	it('shows the DM the players roster cell and reflects the session phase', () => {
		const { state } = homeWithSession();
		const strip = getSessionStatusStrip(state, DM_ACTOR.id);
		expect(strip.kind).toBe('status-strip');
		if (strip.kind !== 'status-strip') return;
		expect(strip.phase.phase).toBe('idle');
		expect(strip.phase.label).toBe('Idle');
		// The DM sees the roster cell: 1 player + 1 observer are non-DM participants.
		expect(strip.players).not.toBeNull();
		expect(strip.players?.connectedCount).toBe(2);
		expect(strip.audio.playing).toBe(false);
		expect(strip.turn.inCombat).toBe(false);
		expect(strip.turn.label).toBe('No combat');
	});

	it('withholds the players roster cell from a player and marks the observer', () => {
		const { state } = homeWithSession();
		const playerStrip = getSessionStatusStrip(state, PLAYER_ACTOR.id);
		const observerStrip = getSessionStatusStrip(state, OBSERVER_ACTOR.id);
		if (playerStrip.kind !== 'status-strip' || observerStrip.kind !== 'status-strip') {
			throw new Error('expected status strips');
		}
		// A participant never receives the roster cell (no connected-count leak — anti-pattern 10.7).
		expect(playerStrip.players).toBeNull();
		expect(observerStrip.players).toBeNull();
		expect(playerStrip.observerMode).toBe(false);
		expect(observerStrip.observerMode).toBe(true);
	});

	it('reflects the active phase after the session starts', () => {
		const { state, env, homeSceneId } = homeWithSession();
		const active = accept(
			dispatch(state, env, {
				type: 'session.set-workflow',
				actorId: DM_ACTOR.id,
				payload: { workflow: 'active', activeSceneId: homeSceneId },
			}),
		).nextState;
		const strip = getSessionStatusStrip(active, DM_ACTOR.id);
		if (strip.kind !== 'status-strip') return;
		expect(strip.phase.phase).toBe('active');
		expect(strip.phase.tone).toBe('live');
	});

	it('never names a hidden active combatant in a non-DM turn cell', () => {
		const { state, env, homeSceneId } = homeWithSession();
		const active = accept(
			dispatch(state, env, {
				type: 'session.set-workflow',
				actorId: DM_ACTOR.id,
				payload: { workflow: 'active', activeSceneId: homeSceneId },
			}),
		).nextState;
		// The highest-initiative combatant (active at turn 0) is HIDDEN with no placeholder.
		const started = accept(
			dispatch(active, env, {
				type: 'combat.start',
				actorId: DM_ACTOR.id,
				payload: {
					combatants: [
						{ kind: 'monster', name: 'Goblin', initiative: 8, maxHp: 7 },
						{
							kind: 'monster',
							name: `Assassin ${FORBIDDEN}`,
							initiative: 20,
							maxHp: 20,
							hidden: true,
						},
					],
				},
			}),
		).nextState;

		const dmStrip = getSessionStatusStrip(started, DM_ACTOR.id);
		const playerStrip = getSessionStatusStrip(started, PLAYER_ACTOR.id);
		if (dmStrip.kind !== 'status-strip' || playerStrip.kind !== 'status-strip') return;
		// The DM sees the real active combatant; the player never does.
		expect(dmStrip.turn.activeName).toContain('Assassin');
		expect(playerStrip.turn.activeName).toBeNull();
		expect(playerStrip.turn.inCombat).toBe(true);
		expect(playerStrip.turn.label).toBe('Combat in progress');
		expect(JSON.stringify(playerStrip)).not.toContain(FORBIDDEN);
	});
});

describe('UX-CMD-012 role-differentiated Command Center home', () => {
	it('gives the DM the dashboard pointer and the full status strip', () => {
		const { state, homeSceneId } = homeWithSession();
		const view = resolveCommandCenterHome(state, DM_ACTOR.id);
		expect(view.kind).toBe('dm');
		if (view.kind !== 'dm') return;
		expect(view.homeSceneId).toBe(homeSceneId);
		expect(view.statusStrip.players).not.toBeNull();
	});

	it('gives a player a participant home with their own (unassigned) player view, no dashboard', () => {
		const { state } = homeWithSession();
		const view = resolveCommandCenterHome(state, PLAYER_ACTOR.id);
		expect(view.kind).toBe('participant');
		if (view.kind !== 'participant') return;
		expect(view.role).toBe('player');
		expect(view.readOnly).toBe(false);
		expect(view.observerMode).toBe(false);
		// No assignment yet → the player sees the waiting state, never the DM home scene.
		expect(view.playerView.kind).toBe('unassigned');
		expect(view.statusStrip.players).toBeNull();
	});

	it('gives an observer a read-only participant home flagged "Observer mode"', () => {
		const { state } = homeWithSession();
		const view = resolveCommandCenterHome(state, OBSERVER_ACTOR.id);
		expect(view.kind).toBe('participant');
		if (view.kind !== 'participant') return;
		expect(view.role).toBe('observer');
		expect(view.readOnly).toBe(true);
		expect(view.observerMode).toBe(true);
	});

	it('fails closed for an unknown actor', () => {
		const { state } = homeWithSession();
		expect(resolveCommandCenterHome(state, 'actor-nobody').kind).toBe('unknown-actor');
		expect(getSessionStatusStrip(state, 'actor-nobody').kind).toBe('unknown-actor');
	});

	it('never leaks a DM-only scene name into a player/observer home view', () => {
		const { state, env } = homeWithSession();
		// The DM authors a DM-only scene carrying a recognizable forbidden marker in its name.
		const created = accept(
			dispatch(state, env, {
				type: 'scene.create',
				actorId: DM_ACTOR.id,
				payload: { name: `Secret Briefing ${FORBIDDEN}`, visibility: 'dm-only' },
			}),
		).nextState;

		// The DM's own dashboard view legitimately knows the home scene; the participants must not see
		// the DM-only scene anywhere in their resolved home (name, count, or structure).
		const playerView = resolveCommandCenterHome(created, PLAYER_ACTOR.id);
		const observerView = resolveCommandCenterHome(created, OBSERVER_ACTOR.id);
		expect(JSON.stringify(playerView)).not.toContain(FORBIDDEN);
		expect(JSON.stringify(observerView)).not.toContain(FORBIDDEN);
	});

	it('delivers only the actor-filtered assigned scene to a player', () => {
		const { state, env } = homeWithSession();
		// A player-visible scene with a player-visible note, assigned to the player.
		const created = accept(
			dispatch(state, env, {
				type: 'scene.create',
				actorId: DM_ACTOR.id,
				payload: { name: 'Tavern Common Room', visibility: 'player-visible' },
			}),
		);
		const sceneEvent = created.events.find((event) => event.kind === 'scene.created');
		if (!sceneEvent || sceneEvent.kind !== 'scene.created') throw new Error('missing scene');
		const sceneId = sceneEvent.sceneId;
		const assigned = accept(
			dispatch(created.nextState, env, {
				type: 'session.project-player-view',
				actorId: DM_ACTOR.id,
				payload: {
					playerActorIds: [PLAYER_ACTOR.id],
					connectionState: 'connected',
					target: {
						kind: 'scene',
						sceneId,
						sectionIds: null,
						widgetInstanceIds: null,
						displayState: null,
						mapRegion: null,
					},
				},
			}),
		).nextState;

		const view = resolveCommandCenterHome(assigned, PLAYER_ACTOR.id);
		if (view.kind !== 'participant') throw new Error('expected participant');
		expect(view.playerView.kind).toBe('assigned');
		if (view.playerView.kind !== 'assigned') return;
		expect(view.playerView.name).toBe('Tavern Common Room');
	});
});
