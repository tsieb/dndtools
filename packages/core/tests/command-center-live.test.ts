import { describe, expect, it } from 'vitest';
import {
	createDemoMapState,
	dispatchCommand,
	getActiveMapProjectionSummary,
	listCommandActions,
	listPaletteCommands,
	listPushableContent,
	listSessionPhaseActions,
	resolvePushHandoutCommand,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
	type SessionWorkflowState,
} from '../src';
import type { CoreEnvironment } from '../src/commands/types';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

const FORBIDDEN = 'FORBIDDEN-DM-SECRET-9K';

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got rejected: ${result.rejection.message}`);
	}
	return result;
}

function dispatch(
	state: CoreStateSlice,
	env: CoreEnvironment,
	command: CoreCommand,
): CommandResult {
	return dispatchCommand(state, env, command);
}

function withHome(): { env: CoreEnvironment; state: CoreStateSlice; homeSceneId: string } {
	const env = makeEnvironment();
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
	state = { ...state, maps: createDemoMapState() };
	const ensured = accept(
		dispatch(state, env, { type: 'command-center.ensure-home', actorId: DM_ACTOR.id, payload: {} }),
	);
	return {
		env,
		state: ensured.nextState,
		homeSceneId: ensured.nextState.commandCenter.homeSceneId!,
	};
}

function setWorkflow(
	state: CoreStateSlice,
	env: CoreEnvironment,
	workflow: SessionWorkflowState,
	activeSceneId: string | null,
): CoreStateSlice {
	const payload: { workflow: SessionWorkflowState; activeSceneId?: string | null } = { workflow };
	if (
		workflow === 'active' ||
		workflow === 'prep' ||
		workflow === 'paused' ||
		workflow === 'ending'
	) {
		payload.activeSceneId = activeSceneId;
	}
	return accept(
		dispatch(state, env, { type: 'session.set-workflow', actorId: DM_ACTOR.id, payload }),
	).nextState;
}

describe('UX-CMD-010 session phase actions', () => {
	it('offers Start (confirm) and Prepare from idle, hiding every invalid transition', () => {
		const { state } = withHome();
		const actions = listSessionPhaseActions(state, DM_ACTOR.id);
		expect(actions.map((a) => a.label)).toEqual(['Start session', 'Prepare session']);
		const start = actions.find((a) => a.label === 'Start session')!;
		expect(start.targetWorkflow).toBe('active');
		expect(start.confirmation).toBe('confirm');
		expect(start.confirmTitle).toBe('Start session?');
		// Archive / recap / pause are not legal from idle and are ABSENT, not disabled (UX-CMD-010).
		expect(actions.some((a) => a.targetWorkflow === 'archived')).toBe(false);
		expect(actions.some((a) => a.targetWorkflow === 'paused')).toBe(false);
	});

	it('offers immediate Pause and a two-step End from active (AC1/AC2)', () => {
		const { state, env, homeSceneId } = withHome();
		const active = setWorkflow(state, env, 'active', homeSceneId);
		const actions = listSessionPhaseActions(active, DM_ACTOR.id);
		const pause = actions.find((a) => a.targetWorkflow === 'paused')!;
		expect(pause.label).toBe('Pause session');
		expect(pause.confirmation).toBe('none'); // AC1: pause is immediate, no dialog.
		const end = actions.find((a) => a.label === 'End session')!;
		expect(end.targetWorkflow).toBe('ending');
		expect(end.confirmation).toBe('double-confirm'); // AC2: two confirmations required.
		expect(end.followUpWorkflow).toBe('recap');
	});

	it('offers immediate Resume from paused and confirmed Archive from recap', () => {
		const { state, env, homeSceneId } = withHome();
		let next = setWorkflow(state, env, 'active', homeSceneId);
		next = setWorkflow(next, env, 'paused', homeSceneId);
		const paused = listSessionPhaseActions(next, DM_ACTOR.id);
		const resume = paused.find((a) => a.targetWorkflow === 'active')!;
		expect(resume.label).toBe('Resume session');
		expect(resume.confirmation).toBe('none');

		next = setWorkflow(next, env, 'ending', homeSceneId);
		next = setWorkflow(next, env, 'recap', null);
		const recap = listSessionPhaseActions(next, DM_ACTOR.id);
		expect(recap.map((a) => a.label)).toEqual(['Archive session']);
		expect(recap[0]!.confirmation).toBe('confirm');
	});

	it('returns no actions for players, observers, and unknown actors (fail closed)', () => {
		const { state } = withHome();
		expect(listSessionPhaseActions(state, PLAYER_ACTOR.id)).toEqual([]);
		expect(listSessionPhaseActions(state, OBSERVER_ACTOR.id)).toEqual([]);
		expect(listSessionPhaseActions(state, 'nobody')).toEqual([]);
	});
});

describe('UX-CMD-006 pushable content selector', () => {
	function withContent(): { env: CoreEnvironment; state: CoreStateSlice } {
		const { env, state } = withHome();
		let next = state;
		next = accept(
			dispatch(next, env, {
				type: 'content.create-item',
				actorId: DM_ACTOR.id,
				payload: {
					kind: 'note',
					title: 'Tavern Rumors',
					body: 'The miller pays for moonstone.',
					visibility: 'player-visible',
				},
			}),
		).nextState;
		next = accept(
			dispatch(next, env, {
				type: 'content.create-item',
				actorId: DM_ACTOR.id,
				payload: {
					kind: 'note',
					title: `Hidden plot ${FORBIDDEN}`,
					body: `The lich is the miller ${FORBIDDEN}.`,
					visibility: 'dm-only',
				},
			}),
		).nextState;
		return { env, state: next };
	}

	it('lists player-visible content only — a dm-only note is never pushable (AC4)', () => {
		const { state } = withContent();
		const pushable = listPushableContent(state, DM_ACTOR.id);
		expect(pushable.map((item) => item.title)).toEqual(['Tavern Rumors']);
		// The hidden note leaks through NO field of the selector model.
		expect(JSON.stringify(pushable)).not.toContain(FORBIDDEN);
	});

	it('returns nothing for non-DM actors (the push flow cannot exist for them)', () => {
		const { state } = withContent();
		expect(listPushableContent(state, PLAYER_ACTOR.id)).toEqual([]);
		expect(listPushableContent(state, OBSERVER_ACTOR.id)).toEqual([]);
		expect(listPushableContent(state, 'nobody')).toEqual([]);
	});

	it('resolves a push to the exact session.deliver-handout command, and never an empty push', () => {
		const { state, env } = withContent();
		const { state: live, homeSceneId } = (() => {
			const homeSceneId = state.commandCenter.homeSceneId!;
			return { state: setWorkflow(state, env, 'active', homeSceneId), homeSceneId };
		})();
		const item = listPushableContent(live, DM_ACTOR.id)[0]!;
		expect(resolvePushHandoutCommand(item, [], homeSceneId)).toBeNull();

		const resolved = resolvePushHandoutCommand(item, [PLAYER_ACTOR.id], homeSceneId)!;
		expect(resolved.type).toBe('session.deliver-handout');
		// The resolved command is dispatchable as-is and delivers to the recipient only.
		const delivered = accept(
			dispatch(live, env, { ...resolved, actorId: DM_ACTOR.id } as CoreCommand),
		);
		const event = delivered.events.find((e) => e.kind === 'session.handout-delivered');
		expect(event).toBeDefined();
		const handout = Object.values(delivered.nextState.session.handouts)[0]!;
		expect(handout.title).toBe('Tavern Rumors');
		expect(handout.recipientActorIds).toEqual([PLAYER_ACTOR.id]);
		expect(handout.sections[0]!.visibility).toBe('player-visible');
	});
});

describe('UX-CMD-007 active-map projection summary', () => {
	it('reports Not projecting before, and Projecting after, a delivered projection', () => {
		const { env, homeSceneId } = withHome();
		let state = withHome().state;
		state = setWorkflow(state, env, 'active', homeSceneId);
		state = accept(
			dispatch(state, env, {
				type: 'session.set-active-map',
				actorId: DM_ACTOR.id,
				payload: { mapId: 'map-western-reaches', regionId: null },
			}),
		).nextState;

		expect(getActiveMapProjectionSummary(state, DM_ACTOR.id)).toEqual({
			projecting: false,
			deliveredCount: 0,
			queuedCount: 0,
		});

		state = accept(
			dispatch(state, env, {
				type: 'session.project-active-map',
				actorId: DM_ACTOR.id,
				payload: { playerActorIds: [PLAYER_ACTOR.id], connectionState: 'connected' },
			}),
		).nextState;
		expect(getActiveMapProjectionSummary(state, DM_ACTOR.id)).toEqual({
			projecting: true,
			deliveredCount: 1,
			queuedCount: 0,
		});

		// Changing the active map drops the stale projection from the glance state.
		state = accept(
			dispatch(state, env, {
				type: 'session.set-active-map',
				actorId: DM_ACTOR.id,
				payload: { mapId: 'map-ruined-keep', regionId: null },
			}),
		).nextState;
		expect(getActiveMapProjectionSummary(state, DM_ACTOR.id)?.projecting).toBe(false);
	});

	it('is DM-only (null for any other actor, fail closed)', () => {
		const { state } = withHome();
		expect(getActiveMapProjectionSummary(state, PLAYER_ACTOR.id)).toBeNull();
		expect(getActiveMapProjectionSummary(state, OBSERVER_ACTOR.id)).toBeNull();
		expect(getActiveMapProjectionSummary(state, 'nobody')).toBeNull();
	});
});

describe('UX-CMD-011 command palette parity for live controls', () => {
	const DESKTOP = { profileId: 'desktop' as const };

	it('registers phase, map, push, and preview commands for the DM', () => {
		const { env, state, homeSceneId } = withHome();
		const withNote = accept(
			dispatch(state, env, {
				type: 'content.create-item',
				actorId: DM_ACTOR.id,
				payload: {
					kind: 'note',
					title: 'Tavern Rumors',
					body: 'Rumors.',
					visibility: 'player-visible',
				},
			}),
		).nextState;
		const live = setWorkflow(withNote, env, 'active', homeSceneId);

		const actions = listCommandActions(live, DM_ACTOR.id, DESKTOP);
		const ids = actions.map((a) => a.id);
		expect(ids).toContain('cc.session.phase:paused');
		expect(ids).toContain('cc.session.phase:ending');
		expect(ids).toContain('cc.map.project');
		expect(ids.some((id) => id.startsWith('cc.map.set-active:'))).toBe(true);

		// Pause via the palette is the SAME command the Phase badge dispatches (AC2).
		const pause = actions.find((a) => a.id === 'cc.session.phase:paused')!;
		expect(pause.commandType).toBe('session.set-workflow');
		expect(pause.payload).toEqual({ workflow: 'paused', activeSceneId: homeSceneId });

		const palette = listPaletteCommands(live, DM_ACTOR.id, DESKTOP);
		// Preview parity: a navigation command per participant (UX-CMD-005).
		expect(palette.some((c) => c.id === `cc.preview-view:${PLAYER_ACTOR.id}`)).toBe(true);
		// Push parity: ONE contextual entry opening the confirmed flow — never per-item commands
		// (per-item entries would surface entity titles in the quick switcher's command mode).
		expect(palette.some((c) => c.id === 'cc.push-handout')).toBe(true);
		expect(palette.some((c) => c.id.startsWith('cc.push:'))).toBe(false);
		expect(palette.some((c) => c.title.includes('Tavern Rumors'))).toBe(false);
	});

	it('gates projection on session state with a non-leaking reason', () => {
		const { state } = withHome();
		const actions = listCommandActions(state, DM_ACTOR.id, { profileId: 'desktop' });
		const project = actions.find((a) => a.id === 'cc.map.project')!;
		expect(project.availability).toEqual({
			status: 'unavailable',
			reason: 'No active map selected.',
		});
	});

	it('hides every live-control command from non-DM actors entirely (AC3, no leak)', () => {
		const { env, state, homeSceneId } = withHome();
		const withSecret = accept(
			dispatch(state, env, {
				type: 'content.create-item',
				actorId: DM_ACTOR.id,
				payload: {
					kind: 'note',
					title: `Hidden plot ${FORBIDDEN}`,
					body: FORBIDDEN,
					visibility: 'dm-only',
				},
			}),
		).nextState;
		const live = setWorkflow(withSecret, env, 'active', homeSceneId);

		expect(listCommandActions(live, PLAYER_ACTOR.id, { profileId: 'desktop' })).toEqual([]);
		const playerPalette = listPaletteCommands(live, PLAYER_ACTOR.id, { profileId: 'desktop' });
		expect(playerPalette.some((c) => c.id.startsWith('cc.session.phase:'))).toBe(false);
		expect(playerPalette.some((c) => c.id.startsWith('cc.preview-view:'))).toBe(false);
		expect(playerPalette.some((c) => c.id === 'cc.push-handout')).toBe(false);
		// And the DM's own palette never lists the dm-only note as pushable (default-deny selector).
		const dmPalette = listPaletteCommands(live, DM_ACTOR.id, { profileId: 'desktop' });
		expect(JSON.stringify(dmPalette)).not.toContain(FORBIDDEN);
	});
});
