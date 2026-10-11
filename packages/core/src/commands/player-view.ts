import {
	projectPlayerViewInputSchema,
	projectTableViewInputSchema,
	revokePlayerViewInputSchema,
} from '../schemas/commands';
import type {
	PlayerViewDeliveryStatus,
	PlayerViewProjectionTarget,
	SessionPlayerViewAssignment,
} from '../state/session-state';
import type { Scene } from '../state/scene-state';
import type { ActorId } from '../state/ids';
import type { OperationLog } from '../sync/operation-log';
import { resolveDeliveryTarget } from '../collab/player-groups';
import { hasDmAuthority } from '../state/permission-state';
import { canShowSceneToTable, type SessionTableView } from '../queries/player-view-control';
import type { CommandResult, CoreEnvironment, CoreEvent, CoreStateSlice } from './types';
import {
	appendOperationDraft,
	findWidget,
	parseInput,
	reject,
	requireActor,
	requireDm,
	requireScene,
} from './helpers';

function validateProjectionTarget(
	state: CoreStateSlice,
	target: PlayerViewProjectionTarget,
): { ok: true } | { ok: false; message: string } {
	const scene = requireScene(state, target.sceneId);
	if ('code' in scene) return { ok: false, message: scene.message };

	if (target.sectionIds) {
		for (const sectionId of target.sectionIds) {
			if (!scene.sections.some((section) => section.id === sectionId)) {
				return { ok: false, message: `Section ${sectionId} does not exist on Scene ${scene.id}.` };
			}
		}
	}

	if (target.widgetInstanceIds) {
		for (const widgetInstanceId of target.widgetInstanceIds) {
			if (!findWidget(scene, widgetInstanceId)) {
				return {
					ok: false,
					message: `Widget ${widgetInstanceId} does not exist on Scene ${scene.id}.`,
				};
			}
		}
	}

	return { ok: true };
}

function targetWidgetPath(target: PlayerViewProjectionTarget): string {
	if (!target.widgetInstanceIds) return 'all';
	return target.widgetInstanceIds.join(',');
}

export function handleProjectPlayerView(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(projectPlayerViewInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	for (const playerActorId of parsed.data.playerActorIds) {
		const player = state.permissions.actors[playerActorId];
		if (!player || hasDmAuthority(player.role)) {
			return reject(
				{
					code: 'invalid-payload',
					message: `Player View target ${playerActorId} must be a registered player or observer.`,
				},
				state,
			);
		}
	}

	// COLLAB-012 — resolve explicit players + Player Group ids to individual recipients (delivery-only; a
	// group expands the projection target list, it confers no permission). Unknown groups reject; an empty
	// resolution rejects.
	const resolved = resolveDeliveryTarget(
		{ recipientActorIds: parsed.data.playerActorIds, groupIds: parsed.data.groupIds },
		state.session.playerGroups,
		state.permissions,
	);
	if (resolved.unknownGroupIds.length > 0) {
		return reject(
			{
				code: 'invalid-payload',
				message: `Unknown player group(s): ${resolved.unknownGroupIds.join(', ')}.`,
			},
			state,
		);
	}
	const projectionPlayerIds = resolved.recipientActorIds;
	if (projectionPlayerIds.length === 0) {
		return reject(
			{
				code: 'invalid-payload',
				message: 'Select at least one player or a non-empty player group.',
			},
			state,
		);
	}

	const target = parsed.data.target;
	const targetCheck = validateProjectionTarget(state, target);
	if (!targetCheck.ok) {
		return reject({ code: 'invalid-state', message: targetCheck.message }, state);
	}

	const scene = state.scenes.scenes[target.sceneId];
	if (!scene)
		return reject({ code: 'scene-not-found', message: `Scene ${target.sceneId} missing.` }, state);
	const projected = assignPlayerViews(state, env, actor.id, projectionPlayerIds, target, scene, {
		connectionState: parsed.data.connectionState,
	});

	return {
		status: 'accepted',
		nextState: {
			...state,
			session: { ...state.session, playerViewAssignments: projected.assignments },
			sync: projected.log,
		},
		events: projected.events,
		operationIds: projected.operationIds,
	};
}

interface AssignedPlayerViews {
	assignments: Record<ActorId, SessionPlayerViewAssignment>;
	log: OperationLog;
	events: CoreEvent[];
	operationIds: string[];
}

/**
 * Write one `session.project-player-view` assignment per participant onto `state`'s assignments and
 * op log. Shared by the per-player command, the table view and a joiner inheriting the table view,
 * so every path records the same op shape (the mobile catch-up classifier and the per-player reads
 * see no difference between them).
 */
function assignPlayerViews(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: ActorId,
	playerActorIds: readonly ActorId[],
	target: PlayerViewProjectionTarget,
	scene: Scene,
	options: { connectionState: 'connected' | 'offline'; log?: OperationLog },
): AssignedPlayerViews {
	const deliveryStatus: PlayerViewDeliveryStatus =
		options.connectionState === 'offline' ? 'queued' : 'delivered';
	const now = env.clock();
	const assignments = { ...state.session.playerViewAssignments };
	const events: CoreEvent[] = [];
	let log = options.log ?? state.sync;
	const operationIds: string[] = [];

	for (const playerActorId of playerActorIds) {
		const previous = assignments[playerActorId];
		const assignment: SessionPlayerViewAssignment = {
			id: previous?.id ?? env.ids(),
			playerActorId,
			target,
			deliveryStatus,
			deliveryReason: options.connectionState,
			createdBy: actorId,
			createdAt: previous?.createdAt ?? now,
			updatedAt: now,
			revision: (previous?.revision ?? 0) + 1,
		};
		assignments[playerActorId] = assignment;
		const draft = appendOperationDraft(env, log, actorId, {
			entityType: 'session',
			entityId: 'session-default',
			opType: 'session.project-player-view',
			path: `playerViews/${playerActorId}/${target.kind}/${targetWidgetPath(target)}`,
			value: assignment,
			beforeRevision: previous?.revision ?? 0,
			afterRevision: assignment.revision,
			dependencies: [`scene:${scene.id}@${scene.ownership.revision}`],
		});
		log = draft.log;
		operationIds.push(draft.op.id);
		events.push({
			kind: 'session.player-view-projected',
			assignmentId: assignment.id,
			sceneId: scene.id,
			playerActorId,
			actorId,
			deliveryStatus,
		});
	}

	return { assignments, log, events, operationIds };
}

/** Every registered player and observer, in a stable order — the "everyone" of the table view. */
function tableParticipantIds(state: CoreStateSlice): ActorId[] {
	return Object.values(state.permissions.actors)
		.filter((participant) => !hasDmAuthority(participant.role))
		.map((participant) => participant.id)
		.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function sceneTarget(sceneId: string): PlayerViewProjectionTarget {
	return {
		kind: 'scene',
		sceneId,
		sectionIds: null,
		widgetInstanceIds: null,
		displayState: null,
		mapRegion: null,
	};
}

/**
 * RC-SES-7.2 — `session.project-table-view`: show one scene to the whole table. In ONE accepted result
 * it records the table view (the default for what players see) and assigns the scene to every
 * registered player and observer, replacing whatever each was shown; a participant who joins later
 * inherits it ({@link inheritTableView}). `session.project-player-view` stays the way to make an
 * exception for one participant, and that exception wins until the table is shown a scene again.
 *
 * Fail closed: a DM-only scene, a template and a default GM workspace are refused (`hidden-target`)
 * with nothing written — "everyone" must never sweep a DM-only scene onto the table. `sceneId: null`
 * takes the table view down and clears every participant's assignment.
 */
export function handleProjectTableView(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(projectTableViewInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const previous = state.session.tableView ?? null;
	const participantIds = tableParticipantIds(state);
	const { sceneId } = parsed.data;

	if (sceneId === null) {
		if (!previous)
			return reject({ code: 'invalid-state', message: 'No scene is shown to the table.' }, state);
		const revoked = revokePlayerViews(state, env, actor.id, participantIds);
		const draft = appendOperationDraft(env, revoked.log, actor.id, {
			entityType: 'session',
			entityId: 'session-default',
			opType: 'session.project-table-view',
			path: 'tableView',
			value: null,
			beforeRevision: previous.revision,
			afterRevision: previous.revision + 1,
		});
		return {
			status: 'accepted',
			nextState: {
				...state,
				session: {
					...state.session,
					tableView: null,
					playerViewAssignments: revoked.assignments,
				},
				sync: draft.log,
			},
			events: [
				...revoked.events,
				{
					kind: 'session.table-view-set',
					sceneId: null,
					playerActorIds: participantIds,
					actorId: actor.id,
				},
			],
			operationIds: [...revoked.operationIds, draft.op.id],
		};
	}

	// A soft-deleted scene reads as missing, as it does for the per-player command.
	const scene = requireScene(state, sceneId);
	if ('code' in scene) return reject(scene, state);
	if (!canShowSceneToTable(scene)) {
		return reject(
			{
				code: 'hidden-target',
				message: `${scene.name} is not shared with players, so it cannot be shown to the whole table.`,
			},
			state,
		);
	}

	const target = sceneTarget(scene.id);
	const tableView: SessionTableView = {
		target,
		setBy: actor.id,
		setAt: env.clock(),
		revision: (previous?.revision ?? 0) + 1,
	};
	const tableOp = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'session',
		entityId: 'session-default',
		opType: 'session.project-table-view',
		path: 'tableView',
		value: tableView,
		beforeRevision: previous?.revision ?? 0,
		afterRevision: tableView.revision,
		dependencies: [`scene:${scene.id}@${scene.ownership.revision}`],
	});
	const projected = assignPlayerViews(state, env, actor.id, participantIds, target, scene, {
		connectionState: 'connected',
		log: tableOp.log,
	});

	return {
		status: 'accepted',
		nextState: {
			...state,
			session: {
				...state.session,
				tableView,
				playerViewAssignments: projected.assignments,
			},
			sync: projected.log,
		},
		events: [
			...projected.events,
			{
				kind: 'session.table-view-set',
				sceneId: scene.id,
				playerActorIds: participantIds,
				actorId: actor.id,
			},
		],
		operationIds: [tableOp.op.id, ...projected.operationIds],
	};
}

/**
 * RC-SES-7.2 — a participant who JOINS the table inherits the table view. Wraps the roster commands
 * (`permission.add-players`, `permission.assign-role`) in the dispatcher: after the roster command is
 * accepted, every actor who is now a player or observer but was not one before (a new seat, or a
 * seat moved off the DM side) and has no view of their own is assigned the table view, in the same
 * accepted result. A rejected command, no table view, or a table scene that has since stopped being
 * shareable (deleted, or made DM-only) leaves the result untouched — fail closed.
 */
export function inheritTableView(
	before: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	result: CommandResult,
): CommandResult {
	if (result.status !== 'accepted') return result;
	const state = result.nextState;
	const tableView = state.session.tableView;
	if (!tableView) return result;
	const scene = state.scenes.scenes[tableView.target.sceneId];
	if (!scene || !canShowSceneToTable(scene)) return result;

	const joinerIds = tableParticipantIds(state).filter((participantId) => {
		const previous = before.permissions.actors[participantId];
		const joined = !previous || hasDmAuthority(previous.role);
		return joined && !state.session.playerViewAssignments[participantId];
	});
	if (joinerIds.length === 0) return result;

	const projected = assignPlayerViews(state, env, actorId, joinerIds, tableView.target, scene, {
		connectionState: 'connected',
	});
	return {
		...result,
		nextState: {
			...state,
			session: { ...state.session, playerViewAssignments: projected.assignments },
			sync: projected.log,
		},
		events: [...result.events, ...projected.events],
		operationIds: [...result.operationIds, ...projected.operationIds],
	};
}

/** The transitions that run the core's live-session reset (and so clear the assignments). */
const RESET_WORKFLOWS: ReadonlySet<string> = new Set(['idle', 'recap', 'archived']);
/** The states Start session leaves from; `paused → active` is a resume, not a start. */
const START_FROM_WORKFLOWS: ReadonlySet<string> = new Set(['idle', 'prep']);

/**
 * RC-SES-7.2 — the table view's part in `session.set-workflow`, applied by the dispatcher to the
 * accepted transition in the same result:
 *
 * - **Start session** (Standby or Prep → Live) shows the active scene to the table, the option's
 *   default — unless the start passes `showToTable: false`, a table view is already in force (one
 *   the GM chose in Prep is kept), or the scene is not one players may see (a DM-only scene is never
 *   swept onto the table; the start itself still succeeds with nothing shown).
 * - **Every reset** (to Standby, Recap or Archived) clears the table view, as the core's reset clears
 *   the assignments it seeded, so next session's joiners never inherit an ended session's scene.
 */
export function applyTableViewOnWorkflow(
	before: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
	result: CommandResult,
): CommandResult {
	if (result.status !== 'accepted') return result;
	const session = result.nextState.session;

	if (RESET_WORKFLOWS.has(session.workflow)) {
		if (!session.tableView) return result;
		return {
			...result,
			nextState: { ...result.nextState, session: { ...session, tableView: null } },
		};
	}

	// The payload already passed the handler's schema, so these reads only pick out the request.
	const request = (rawPayload ?? {}) as { workflow?: unknown; showToTable?: unknown };
	const starting =
		request.workflow === 'active' && START_FROM_WORKFLOWS.has(before.session.workflow);
	const optedOut = request.showToTable === false;
	const sceneId = session.activeSceneId;
	if (!starting || optedOut || session.tableView || !sceneId) return result;
	if (!canShowSceneToTable(result.nextState.scenes.scenes[sceneId])) return result;

	const shown = handleProjectTableView(result.nextState, env, actorId, { sceneId });
	if (shown.status !== 'accepted') return result;
	return {
		...shown,
		events: [...result.events, ...shown.events],
		operationIds: [...result.operationIds, ...shown.operationIds],
	};
}

export function handleRevokePlayerView(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(revokePlayerViewInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const revoked = revokePlayerViews(state, env, actor.id, parsed.data.playerActorIds);

	return {
		status: 'accepted',
		nextState: {
			...state,
			session: { ...state.session, playerViewAssignments: revoked.assignments },
			sync: revoked.log,
		},
		events: revoked.events,
		operationIds: revoked.operationIds,
	};
}

/** Remove each listed participant's assignment (one `session.revoke-player-view` op each); unassigned ids are skipped. */
function revokePlayerViews(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: ActorId,
	playerActorIds: readonly ActorId[],
): AssignedPlayerViews {
	const assignments = { ...state.session.playerViewAssignments };
	const events: CoreEvent[] = [];
	let log = state.sync;
	const operationIds: string[] = [];

	for (const playerActorId of playerActorIds) {
		const previous = assignments[playerActorId];
		if (!previous) continue;
		delete assignments[playerActorId];
		const draft = appendOperationDraft(env, log, actorId, {
			entityType: 'session',
			entityId: 'session-default',
			opType: 'session.revoke-player-view',
			path: `playerViews/${playerActorId}`,
			value: { assignmentId: previous.id, playerActorId, sceneId: previous.target.sceneId },
			beforeRevision: previous.revision,
			afterRevision: previous.revision + 1,
		});
		log = draft.log;
		operationIds.push(draft.op.id);
		events.push({
			kind: 'session.player-view-revoked',
			assignmentId: previous.id,
			sceneId: previous.target.sceneId,
			playerActorId,
			actorId,
		});
	}

	return { assignments, log, events, operationIds };
}
