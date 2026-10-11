import { hasDmAuthority } from '../state/permission-state';
import type { CoreStateSlice } from '../commands/types';
import type { ActorId } from '../state/ids';
import type { ActorRole } from '../state/permission-state';
import { screenMetaOf, type Scene, type SceneVisibility } from '../state/scene-state';
import type {
	PlayerViewDeliveryStatus,
	PlayerViewProjectionKind,
	PlayerViewProjectionTarget,
	SessionPlayerViewAssignment,
} from '../state/session-state';

/**
 * RC-SES-7.2 — the TABLE VIEW: the scene every player and observer is shown by default. Setting it
 * assigns the scene to every current participant at once (`session.project-table-view`), and a
 * participant who joins later inherits it; a per-player assignment made afterwards overrides it for
 * that participant only. Never a DM-only scene (refused fail-closed).
 */
export interface SessionTableView {
	target: PlayerViewProjectionTarget;
	setBy: ActorId;
	setAt: string;
	revision: number;
}

// The table view rides on the session slice as an optional, additive field: a session document
// persisted before it restores with none (the stores spread the persisted session), and the
// dispatcher clears it on every reset transition with the assignments it seeded
// (`clearTableViewOnReset`). Declared here, beside its only reader and writer, rather than in
// `state/session-state.ts`.
declare module '../state/session-state' {
	interface SessionState {
		/** RC-SES-7.2 — the default for what players see, or null/absent when none is set. */
		tableView?: SessionTableView | null;
	}
}

export interface PlayerViewControllerSceneOption {
	id: string;
	name: string;
	visibility: SceneVisibility;
	/** RC-SES-7.2 — whether the scene may be shown to the whole table ({@link canShowSceneToTable}). */
	shareable: boolean;
	widgetCount: number;
	updatedAt: string;
}

/**
 * RC-SES-7.2 — the table view as the controller reads it: the scene the whole table is shown by
 * default, or `missing-scene` when that scene has since been deleted.
 */
export interface PlayerViewControllerTableView {
	kind: 'assigned' | 'missing-scene';
	sceneId: string;
	sceneName: string | null;
	revision: number;
	setAt: string;
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
	role: Exclude<ActorRole, 'dm' | 'co-dm'>;
	assignment: PlayerViewControllerAssignment | null;
}

export type PlayerViewControllerQueryResult =
	| {
			kind: 'available';
			controllerActorId: ActorId;
			sceneOptions: PlayerViewControllerSceneOption[];
			participants: PlayerViewControllerParticipant[];
			tableView: PlayerViewControllerTableView | null;
	  }
	| { kind: 'denied'; reason: 'unknown-actor' | 'actor-not-authorized' };

const PARTICIPANT_ROLE_ORDER: Record<Exclude<ActorRole, 'dm' | 'co-dm'>, number> = {
	player: 0,
	observer: 1,
};

/**
 * RC-CAN-7.8 — the default GM workspaces (the Command Center and Session screens, ADR-041) are the
 * GM's own consoles, not something to put in front of a player; templates are not scenes yet.
 */
function isProjectableScene(scene: Scene): boolean {
	return !scene.templateMeta.isTemplate && screenMetaOf(scene).origin?.kind !== 'default';
}

/**
 * RC-SES-7.2 — whether `scene` may become the TABLE VIEW (shown to every player and observer, and to
 * anyone who joins later). Fail closed: a DM-only scene never may — a per-player projection is a
 * deliberate choice for one person, but "everyone" must never sweep a DM-only scene onto the table.
 */
export function canShowSceneToTable(scene: Scene | undefined): boolean {
	return !!scene && isProjectableScene(scene) && scene.visibility !== 'dm-only';
}

function sceneOption(scene: Scene): PlayerViewControllerSceneOption {
	return {
		id: scene.id,
		name: scene.name,
		visibility: scene.visibility,
		shareable: canShowSceneToTable(scene),
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
	if (!hasDmAuthority(actor.role)) return { kind: 'denied', reason: 'actor-not-authorized' };

	// The GM screen's board stays here; the default workspaces and templates do not.
	const sceneOptions = Object.values(state.scenes.scenes)
		.filter(isProjectableScene)
		.map(sceneOption)
		.sort((a, b) => a.name.localeCompare(b.name));

	const participants = Object.values(state.permissions.actors)
		.filter(
			(
				participant,
			): participant is typeof participant & {
				role: Exclude<ActorRole, 'dm' | 'co-dm'>;
			} =>
				// A DM / co-DM operates the Player-View controller; they are never a projection TARGET.
				!hasDmAuthority(participant.role),
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

	const table = state.session.tableView ?? null;
	const tableScene = table ? state.scenes.scenes[table.target.sceneId] : undefined;
	const tableView: PlayerViewControllerTableView | null = table
		? {
				kind: tableScene ? 'assigned' : 'missing-scene',
				sceneId: table.target.sceneId,
				sceneName: tableScene?.name ?? null,
				revision: table.revision,
				setAt: table.setAt,
			}
		: null;

	return {
		kind: 'available',
		controllerActorId: actor.id,
		sceneOptions,
		participants,
		tableView,
	};
}
