import { projectPlayerViewInputSchema, revokePlayerViewInputSchema } from '../schemas/commands';
import type {
	PlayerViewDeliveryStatus,
	PlayerViewProjectionTarget,
	SessionPlayerViewAssignment,
} from '../state/session-state';
import { resolveDeliveryTarget } from '../collab/player-groups';
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
		if (!player || player.role === 'dm') {
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
			{ code: 'invalid-payload', message: `Unknown player group(s): ${resolved.unknownGroupIds.join(', ')}.` },
			state,
		);
	}
	const projectionPlayerIds = resolved.recipientActorIds;
	if (projectionPlayerIds.length === 0) {
		return reject(
			{ code: 'invalid-payload', message: 'Select at least one player or a non-empty player group.' },
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
	const deliveryStatus: PlayerViewDeliveryStatus =
		parsed.data.connectionState === 'offline' ? 'queued' : 'delivered';
	const now = env.clock();
	const nextAssignments = { ...state.session.playerViewAssignments };
	const events: CoreEvent[] = [];
	let nextLog = state.sync;
	const operationIds: string[] = [];

	for (const playerActorId of projectionPlayerIds) {
		const previous = nextAssignments[playerActorId];
		const assignment: SessionPlayerViewAssignment = {
			id: previous?.id ?? env.ids(),
			playerActorId,
			target,
			deliveryStatus,
			deliveryReason: parsed.data.connectionState,
			createdBy: actor.id,
			createdAt: previous?.createdAt ?? now,
			updatedAt: now,
			revision: (previous?.revision ?? 0) + 1,
		};
		nextAssignments[playerActorId] = assignment;
		const draft = appendOperationDraft(env, nextLog, actor.id, {
			entityType: 'session',
			entityId: 'session-default',
			opType: 'session.project-player-view',
			path: `playerViews/${playerActorId}/${target.kind}/${targetWidgetPath(target)}`,
			value: assignment,
			beforeRevision: previous?.revision ?? 0,
			afterRevision: assignment.revision,
			dependencies: [`scene:${scene.id}@${scene.ownership.revision}`],
		});
		nextLog = draft.log;
		operationIds.push(draft.op.id);
		events.push({
			kind: 'session.player-view-projected',
			assignmentId: assignment.id,
			sceneId: scene.id,
			playerActorId,
			actorId: actor.id,
			deliveryStatus,
		});
	}

	return {
		status: 'accepted',
		nextState: {
			...state,
			session: { ...state.session, playerViewAssignments: nextAssignments },
			sync: nextLog,
		},
		events,
		operationIds,
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

	const nextAssignments = { ...state.session.playerViewAssignments };
	const events: CoreEvent[] = [];
	let nextLog = state.sync;
	const operationIds: string[] = [];

	for (const playerActorId of parsed.data.playerActorIds) {
		const previous = nextAssignments[playerActorId];
		if (!previous) continue;
		delete nextAssignments[playerActorId];
		const draft = appendOperationDraft(env, nextLog, actor.id, {
			entityType: 'session',
			entityId: 'session-default',
			opType: 'session.revoke-player-view',
			path: `playerViews/${playerActorId}`,
			value: { assignmentId: previous.id, playerActorId, sceneId: previous.target.sceneId },
			beforeRevision: previous.revision,
			afterRevision: previous.revision + 1,
		});
		nextLog = draft.log;
		operationIds.push(draft.op.id);
		events.push({
			kind: 'session.player-view-revoked',
			assignmentId: previous.id,
			sceneId: previous.target.sceneId,
			playerActorId,
			actorId: actor.id,
		});
	}

	return {
		status: 'accepted',
		nextState: {
			...state,
			session: { ...state.session, playerViewAssignments: nextAssignments },
			sync: nextLog,
		},
		events,
		operationIds,
	};
}
