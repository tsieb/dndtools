import { describe, expect, it } from 'vitest';
import {
	dispatchCommand,
	getPlayerViewController,
	getPlayerViewForActor,
	type Actor,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
	type SceneVisibility,
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
 * RC-SES-7.2 — the table view: one command shows a scene to every player and observer at once, a
 * DM-only scene is refused with nothing written, a participant who joins later inherits it, and a
 * per-player assignment made afterwards still wins for that one participant.
 */

const PLAYER_TWO: Actor = { id: 'actor-player-2', role: 'player', displayName: 'Second Player' };
const CO_DM: Actor = { id: 'actor-co-dm', role: 'co-dm', displayName: 'Co GM' };

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got rejected: ${result.rejection.message}`);
	}
	return result;
}

function run(state: CoreStateSlice, env: CoreEnvironment, command: CoreCommand) {
	return dispatchCommand(state, env, command);
}

function createScene(
	state: CoreStateSlice,
	env: CoreEnvironment,
	name: string,
	visibility: SceneVisibility,
): { state: CoreStateSlice; sceneId: string } {
	const created = accept(
		run(state, env, {
			type: 'scene.create',
			actorId: DM_ACTOR.id,
			payload: { name, visibility },
		}),
	);
	const event = created.events.find((candidate) => candidate.kind === 'scene.created');
	if (!event || event.kind !== 'scene.created') throw new Error('missing scene.created event');
	return { state: created.nextState, sceneId: event.sceneId };
}

function showToTable(state: CoreStateSlice, env: CoreEnvironment, sceneId: string | null) {
	return run(state, env, {
		type: 'session.project-table-view',
		actorId: DM_ACTOR.id,
		payload: { sceneId },
	});
}

function stageOf(state: CoreStateSlice, actorId: string): string | null {
	const view = getPlayerViewForActor(state.scenes, state.permissions, state.session, actorId, {
		widgetPackages: state.widgets,
	});
	return view.kind === 'assigned' ? view.name : null;
}

function fixture() {
	const env = makeEnvironment();
	const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR, PLAYER_TWO, OBSERVER_ACTOR, CO_DM);
	const tavern = createScene(base, env, 'The Gilded Tankard', 'shared');
	const vault = createScene(tavern.state, env, 'Drowned Vault', 'player-visible');
	const secret = createScene(vault.state, env, 'Villain Lair', 'dm-only');
	return {
		env,
		state: secret.state,
		tavernId: tavern.sceneId,
		vaultId: vault.sceneId,
		secretId: secret.sceneId,
	};
}

describe('RC-SES-7.2 session.project-table-view', () => {
	it('assigns the scene to every player and observer in one accepted result', () => {
		const { env, state, tavernId } = fixture();
		const result = accept(showToTable(state, env, tavernId));
		const next = result.nextState;

		const participants = [PLAYER_ACTOR.id, PLAYER_TWO.id, OBSERVER_ACTOR.id].sort();
		expect(Object.keys(next.session.playerViewAssignments).sort()).toEqual(participants);
		for (const id of participants) {
			expect(next.session.playerViewAssignments[id]?.target).toMatchObject({
				kind: 'scene',
				sceneId: tavernId,
				widgetInstanceIds: null,
			});
			expect(stageOf(next, id)).toBe('The Gilded Tankard');
		}
		// The GM side is the projector, never a target.
		expect(next.session.playerViewAssignments[DM_ACTOR.id]).toBeUndefined();
		expect(next.session.playerViewAssignments[CO_DM.id]).toBeUndefined();
		expect(next.session.tableView).toMatchObject({
			target: { sceneId: tavernId },
			setBy: DM_ACTOR.id,
			revision: 1,
		});

		// Atomic: one table op plus one per-participant op, all from this one command.
		const appended = next.sync.operations.slice(state.sync.operations.length);
		expect(appended.map((op) => op.opType)).toEqual([
			'session.project-table-view',
			'session.project-player-view',
			'session.project-player-view',
			'session.project-player-view',
		]);
		expect(result.operationIds).toEqual(appended.map((op) => op.id));
		expect(result.events.at(-1)).toMatchObject({
			kind: 'session.table-view-set',
			sceneId: tavernId,
			playerActorIds: participants,
		});

		const controller = getPlayerViewController(next, DM_ACTOR.id);
		if (controller.kind !== 'available') throw new Error('controller unavailable');
		expect(controller.tableView).toMatchObject({
			kind: 'assigned',
			sceneId: tavernId,
			sceneName: 'The Gilded Tankard',
		});
	});

	it('replaces every existing per-player view when the table is shown a new scene', () => {
		const { env, state, tavernId, vaultId } = fixture();
		const first = accept(showToTable(state, env, tavernId)).nextState;
		const second = accept(showToTable(first, env, vaultId)).nextState;
		for (const id of [PLAYER_ACTOR.id, PLAYER_TWO.id, OBSERVER_ACTOR.id]) {
			expect(stageOf(second, id)).toBe('Drowned Vault');
			expect(second.session.playerViewAssignments[id]?.revision).toBe(2);
		}
		expect(second.session.tableView?.revision).toBe(2);
	});

	it('refuses a DM-only scene fail-closed and writes nothing', () => {
		const { env, state, tavernId, secretId } = fixture();
		const shown = accept(showToTable(state, env, tavernId)).nextState;
		const refused = showToTable(shown, env, secretId);
		expect(refused.status).toBe('rejected');
		if (refused.status !== 'rejected') return;
		expect(refused.rejection.code).toBe('hidden-target');
		expect(refused.nextState).toBe(shown);
		// The table keeps what it was shown; the DM-only scene reached nobody.
		expect(stageOf(refused.nextState, PLAYER_ACTOR.id)).toBe('The Gilded Tankard');
		expect(refused.nextState.session.tableView?.target.sceneId).toBe(tavernId);

		const controller = getPlayerViewController(state, DM_ACTOR.id);
		if (controller.kind !== 'available') throw new Error('controller unavailable');
		expect(controller.sceneOptions.find((scene) => scene.id === secretId)?.shareable).toBe(false);
		expect(controller.sceneOptions.find((scene) => scene.id === tavernId)?.shareable).toBe(true);
	});

	it('refuses an unknown scene, a non-DM actor, and an observer', () => {
		const { env, state, tavernId } = fixture();
		const missing = showToTable(state, env, 'scene-does-not-exist');
		expect(missing.status === 'rejected' && missing.rejection.code).toBe('scene-not-found');
		for (const actorId of [PLAYER_ACTOR.id, OBSERVER_ACTOR.id]) {
			const denied = run(state, env, {
				type: 'session.project-table-view',
				actorId,
				payload: { sceneId: tavernId },
			});
			expect(denied.status).toBe('rejected');
			expect(denied.nextState).toBe(state);
		}
	});

	it('lets a later joiner inherit the table view', () => {
		const { env, state, tavernId } = fixture();
		const shown = accept(showToTable(state, env, tavernId)).nextState;

		const added = accept(
			run(shown, env, {
				type: 'permission.add-players',
				actorId: DM_ACTOR.id,
				payload: { displayNames: ['Late Arrival'] },
			}),
		);
		const joiner = Object.values(added.nextState.permissions.actors).find(
			(actor) => actor.displayName === 'Late Arrival',
		);
		if (!joiner) throw new Error('joiner missing');
		expect(stageOf(added.nextState, joiner.id)).toBe('The Gilded Tankard');
		expect(added.events.map((event) => event.kind)).toEqual([
			'permission.player-added',
			'session.player-view-projected',
		]);

		// A co-GM seat moved to the player side joins the table too.
		const moved = accept(
			run(added.nextState, env, {
				type: 'permission.assign-role',
				actorId: DM_ACTOR.id,
				payload: { targetActorId: CO_DM.id, role: 'observer' },
			}),
		).nextState;
		expect(stageOf(moved, CO_DM.id)).toBe('The Gilded Tankard');
	});

	it('gives a joiner nothing when no table view is set', () => {
		const { env, state } = fixture();
		const added = accept(
			run(state, env, {
				type: 'permission.add-players',
				actorId: DM_ACTOR.id,
				payload: { displayNames: ['Late Arrival'] },
			}),
		).nextState;
		const joiner = Object.values(added.permissions.actors).find(
			(actor) => actor.displayName === 'Late Arrival',
		);
		expect(joiner && added.session.playerViewAssignments[joiner.id]).toBeUndefined();
	});

	it('keeps a per-player override after the table view and through a later joiner', () => {
		const { env, state, tavernId, secretId } = fixture();
		const shown = accept(showToTable(state, env, tavernId)).nextState;
		// The per-player command is the exception path, and may still send a DM-only scene to one person.
		const overridden = accept(
			run(shown, env, {
				type: 'session.project-player-view',
				actorId: DM_ACTOR.id,
				payload: {
					playerActorIds: [PLAYER_TWO.id],
					target: {
						kind: 'scene',
						sceneId: secretId,
						sectionIds: null,
						widgetInstanceIds: null,
						displayState: null,
						mapRegion: null,
					},
				},
			}),
		).nextState;
		expect(stageOf(overridden, PLAYER_TWO.id)).toBe('Villain Lair');
		expect(stageOf(overridden, PLAYER_ACTOR.id)).toBe('The Gilded Tankard');
		expect(overridden.session.tableView?.target.sceneId).toBe(tavernId);

		const joined = accept(
			run(overridden, env, {
				type: 'permission.add-players',
				actorId: DM_ACTOR.id,
				payload: { displayNames: ['Late Arrival'] },
			}),
		).nextState;
		expect(stageOf(joined, PLAYER_TWO.id)).toBe('Villain Lair');
	});

	it('takes the table view down with null, and a session reset clears it', () => {
		const { env, state, tavernId } = fixture();
		const shown = accept(showToTable(state, env, tavernId)).nextState;
		const cleared = accept(showToTable(shown, env, null)).nextState;
		expect(cleared.session.tableView).toBeNull();
		expect(cleared.session.playerViewAssignments).toEqual({});
		expect(stageOf(cleared, PLAYER_ACTOR.id)).toBeNull();
		expect(showToTable(cleared, env, null).status).toBe('rejected');

		const live = accept(
			run(state, env, {
				type: 'session.set-workflow',
				actorId: DM_ACTOR.id,
				payload: { workflow: 'active', activeSceneId: tavernId },
			}),
		).nextState;
		const shownLive = accept(showToTable(live, env, tavernId)).nextState;
		const ended = accept(
			run(shownLive, env, {
				type: 'session.set-workflow',
				actorId: DM_ACTOR.id,
				payload: { workflow: 'idle' },
			}),
		).nextState;
		expect(ended.session.tableView).toBeNull();
		const added = accept(
			run(ended, env, {
				type: 'permission.add-players',
				actorId: DM_ACTOR.id,
				payload: { displayNames: ['Next Week'] },
			}),
		).nextState;
		expect(Object.keys(added.session.playerViewAssignments)).toEqual([]);
	});

	it('Start session on a shared scene shows it to the table in the same result', () => {
		const { env, state, tavernId } = fixture();
		const started = accept(
			run(state, env, {
				type: 'session.set-workflow',
				actorId: DM_ACTOR.id,
				payload: { workflow: 'active', activeSceneId: tavernId },
			}),
		);
		const next = started.nextState;
		expect(next.session.workflow).toBe('active');
		expect(next.session.tableView?.target.sceneId).toBe(tavernId);
		for (const id of [PLAYER_ACTOR.id, PLAYER_TWO.id, OBSERVER_ACTOR.id]) {
			expect(stageOf(next, id)).toBe('The Gilded Tankard');
		}
		expect(started.events.map((event) => event.kind)).toContain('session.workflow-changed');
		expect(started.events.at(-1)).toMatchObject({ kind: 'session.table-view-set' });
	});

	it('Start session leaves the stage empty when told not to, or when the scene is DM-only', () => {
		const { env, state, tavernId, secretId } = fixture();
		const optedOut = accept(
			run(state, env, {
				type: 'session.set-workflow',
				actorId: DM_ACTOR.id,
				payload: { workflow: 'active', activeSceneId: tavernId, showToTable: false },
			}),
		).nextState;
		expect(optedOut.session.workflow).toBe('active');
		expect(optedOut.session.tableView ?? null).toBeNull();
		expect(optedOut.session.playerViewAssignments).toEqual({});

		// Fail closed: the start succeeds, the DM-only scene reaches nobody.
		const secret = accept(
			run(state, env, {
				type: 'session.set-workflow',
				actorId: DM_ACTOR.id,
				payload: { workflow: 'active', activeSceneId: secretId },
			}),
		).nextState;
		expect(secret.session.workflow).toBe('active');
		expect(secret.session.tableView ?? null).toBeNull();
		expect(secret.session.playerViewAssignments).toEqual({});
	});

	it('Start session keeps a table view chosen in Prep, and a resume is not a start', () => {
		const { env, state, tavernId, vaultId } = fixture();
		const prep = accept(
			run(state, env, {
				type: 'session.set-workflow',
				actorId: DM_ACTOR.id,
				payload: { workflow: 'prep', activeSceneId: tavernId },
			}),
		).nextState;
		expect(prep.session.tableView ?? null).toBeNull();
		const chosen = accept(showToTable(prep, env, vaultId)).nextState;
		const live = accept(
			run(chosen, env, {
				type: 'session.set-workflow',
				actorId: DM_ACTOR.id,
				payload: { workflow: 'active', activeSceneId: tavernId },
			}),
		).nextState;
		expect(live.session.tableView?.target.sceneId).toBe(vaultId);
		expect(stageOf(live, PLAYER_ACTOR.id)).toBe('Drowned Vault');

		const cleared = accept(showToTable(live, env, null)).nextState;
		const paused = accept(
			run(cleared, env, {
				type: 'session.set-workflow',
				actorId: DM_ACTOR.id,
				payload: { workflow: 'paused' },
			}),
		).nextState;
		const resumed = accept(
			run(paused, env, {
				type: 'session.set-workflow',
				actorId: DM_ACTOR.id,
				payload: { workflow: 'active' },
			}),
		).nextState;
		expect(resumed.session.tableView ?? null).toBeNull();
		expect(resumed.session.playerViewAssignments).toEqual({});
	});
});
