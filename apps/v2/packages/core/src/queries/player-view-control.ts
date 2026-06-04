import type { CoreStateSlice } from '../commands/types';
import type { ActorId } from '../state/ids';
import type { ActorRole } from '../state/permission-state';
import type { Scene, SceneVisibility } from '../state/scene-state';
import type {
	PlayerViewDeliveryStatus,
	PlayerViewProjectionKind,
	SessionPlayerViewAssignment,
} from '../state/session-state';

export interface PlayerViewControllerSceneOption {
	id: string;
	name: string;
	visibility: SceneVisibility;
	widgetCount: number;
	updatedAt: string;
}

export interface PlayerViewControllerAssignment {
	kind: 'assigned' | 'missing-scene';
	assignmentId: string;
	sceneId: string;
	sceneName: string | null;
	projectionKind: PlayerViewProjectionKind;
	deliveryStatus: PlayerViewDeliveryStatus;
	deliveryReason: SessionPlayerViewAssignment['deliveryReason'];
	projectedWidgetInstanceIds: string[] | null;
	projectedWidgetCount: number | null;
	revision: number;
	updatedAt: string;
}

export interface PlayerViewControllerParticipant {
	actorId: ActorId;
	displayName: string;
	role: Exclude<ActorRole, 'dm'>;
	assignment: PlayerViewControllerAssignment | null;
}

export type PlayerViewControllerQueryResult =
	| {
			kind: 'available';
			controllerActorId: ActorId;
			sceneOptions: PlayerViewControllerSceneOption[];
			participants: PlayerViewControllerParticipant[];
	  }
	| { kind: 'denied'; reason: 'unknown-actor' | 'actor-not-authorized' };

const PARTICIPANT_ROLE_ORDER: Record<Exclude<ActorRole, 'dm'>, number> = {
	player: 0,
	observer: 1,
};

function sceneOption(scene: Scene): PlayerViewControllerSceneOption {
	return {
		id: scene.id,
		name: scene.name,
		visibility: scene.visibility,
		widgetCount: scene.widgets.length,
		updatedAt: scene.ownership.updatedAt,
	};
}

function summarizeAssignment(
	assignment: SessionPlayerViewAssignment | undefined,
	scene: Scene | undefined,
): PlayerViewControllerAssignment | null {
	if (!assignment) return null;
	const projectedWidgetInstanceIds = assignment.target.widgetInstanceIds
		? [...assignment.target.widgetInstanceIds]
		: null;
	return {
		kind: scene ? 'assigned' : 'missing-scene',
		assignmentId: assignment.id,
		sceneId: assignment.target.sceneId,
		sceneName: scene?.name ?? null,
		projectionKind: assignment.target.kind,
		deliveryStatus: assignment.deliveryStatus,
		deliveryReason: assignment.deliveryReason,
		projectedWidgetInstanceIds,
		projectedWidgetCount: projectedWidgetInstanceIds
			? projectedWidgetInstanceIds.length
			: (scene?.widgets.length ?? null),
		revision: assignment.revision,
		updatedAt: assignment.updatedAt,
	};
}

export function getPlayerViewController(
	state: CoreStateSlice,
	actorId: ActorId,
): PlayerViewControllerQueryResult {
	const actor = state.permissions.actors[actorId];
	if (!actor) return { kind: 'denied', reason: 'unknown-actor' };
	if (actor.role !== 'dm') return { kind: 'denied', reason: 'actor-not-authorized' };

	const sceneOptions = Object.values(state.scenes.scenes)
		.filter((scene) => !scene.templateMeta.isTemplate)
		.map(sceneOption)
		.sort((a, b) => a.name.localeCompare(b.name));

	const participants = Object.values(state.permissions.actors)
		.filter(
			(participant): participant is typeof participant & { role: Exclude<ActorRole, 'dm'> } =>
				participant.role !== 'dm',
		)
		.sort((a, b) => {
			const roleDelta = PARTICIPANT_ROLE_ORDER[a.role] - PARTICIPANT_ROLE_ORDER[b.role];
			if (roleDelta !== 0) return roleDelta;
			return a.displayName.localeCompare(b.displayName);
		})
		.map((participant) => {
			const assignment = state.session.playerViewAssignments[participant.id];
			return {
				actorId: participant.id,
				displayName: participant.displayName,
				role: participant.role,
				assignment: summarizeAssignment(
					assignment,
					assignment ? state.scenes.scenes[assignment.target.sceneId] : undefined,
				),
			};
		});

	return { kind: 'available', controllerActorId: actor.id, sceneOptions, participants };
}
