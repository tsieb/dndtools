import { hasDmAuthority } from '../state/permission-state';
import type { CommandResult, CoreEnvironment, CoreStateSlice } from '../commands/types';
import type { ActorId } from '../state/ids';
import type { ActorRole } from '../state/permission-state';
import { normalizeOnlineStatus, type PresenceOnlineStatus } from '../state/presence-state';
import { getPlayerViewForActor } from './scene';
import { deliveredMapIdsForActor, getMapViewForActor } from './map-query';
import { getContentItemsForActor } from './content-query';
import { listCharactersForActor } from './character-query';
import { isLiveScene, screenMetaOf, type Scene, type SceneVisibility } from '../state/scene-state';
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
 * anyone who joins later). Fail closed: a soft-deleted scene never may (players cannot read it), nor
 * a DM-only one — a per-player projection is a deliberate choice for one person, but "everyone" must
 * never sweep a DM-only scene onto the table.
 */
export function canShowSceneToTable(scene: Scene | undefined): boolean {
	return (
		!!scene && isLiveScene(scene) && isProjectableScene(scene) && scene.visibility !== 'dm-only'
	);
}

/** A scene a projection may still resolve: present and not soft-deleted (reads as missing otherwise). */
function liveSceneOf(state: CoreStateSlice, sceneId: string): Scene | undefined {
	const scene = state.scenes.scenes[sceneId];
	return scene && isLiveScene(scene) ? scene : undefined;
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

	// The GM screen's board stays here; the default workspaces, templates and deleted scenes do not.
	const sceneOptions = Object.values(state.scenes.scenes)
		.filter((scene) => isLiveScene(scene) && isProjectableScene(scene))
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
					assignment ? liveSceneOf(state, assignment.target.sceneId) : undefined,
				),
			};
		});

	const table = state.session.tableView ?? null;
	const tableScene = table ? liveSceneOf(state, table.target.sceneId) : undefined;
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

export interface PlayerViewSummaryParticipant {
	actorId: ActorId;
	displayName: string;
	role: Exclude<ActorRole, 'dm' | 'co-dm'>;
	connection: PresenceOnlineStatus;
	stage: { id: string; name: string } | null;
	projectedMap: { id: string; name: string } | null;
	/** The handouts their companion lists: the notes and objects revealed to this seat. */
	handoutCount: number;
	/** Full sheets available to this seat, not the public party overview. */
	characters: { id: string; name: string }[];
}

export type PlayerViewSummaryQueryResult =
	| { kind: 'available'; participants: PlayerViewSummaryParticipant[] }
	| { kind: 'denied'; reason: 'unknown-actor' };

/**
 * RC-SES-7.3 — what each seat can actually open. A DM/co-DM sees the same registered
 * player/observer roster as the controller; participants see only themselves. Resolve every
 * resource as the participant, even for a DM caller, so authoring names never stand in for
 * unavailable content. Presence is ephemeral: saved delivery acknowledgements are not a
 * connection signal. An explicitly projected private scene follows the companion's existing
 * projection policy; unrelated private scenes and authoring metadata never enter this result.
 */
export function getPlayerViewSummary(
	state: CoreStateSlice,
	actorId: ActorId,
): PlayerViewSummaryQueryResult {
	const viewer = state.permissions.actors[actorId];
	if (!viewer) return { kind: 'denied', reason: 'unknown-actor' };
	const participants = Object.values(state.permissions.actors)
		.filter(
			(actor): actor is typeof actor & { role: PlayerViewSummaryParticipant['role'] } =>
				!hasDmAuthority(actor.role) && (hasDmAuthority(viewer.role) || actor.id === actorId),
		)
		.sort(
			(a, b) =>
				PARTICIPANT_ROLE_ORDER[a.role] - PARTICIPANT_ROLE_ORDER[b.role] ||
				a.displayName.localeCompare(b.displayName) ||
				a.id.localeCompare(b.id),
		)
		.map((actor): PlayerViewSummaryParticipant => {
			const stage = getPlayerViewForActor(
				state.scenes,
				state.permissions,
				state.session,
				actor.id,
				{
					widgetPackages: state.widgets,
				},
			);
			// Same selection order as the companion's resolveProjectedMapForViewer.
			const delivered = deliveredMapIdsForActor(state.session, actor.id);
			const mapId = state.session.activeMapProjections[actor.id]?.mapId ?? [...delivered][0];
			const map =
				mapId && delivered.has(mapId)
					? getMapViewForActor(state.maps, state.permissions, actor.id, mapId, {
							deliveredMapIds: delivered,
							combat: state.session.combat,
						})
					: null;
			return {
				actorId: actor.id,
				displayName: actor.displayName,
				role: actor.role,
				connection: normalizeOnlineStatus(state.presence?.entries[actor.id]?.status),
				stage: stage.kind === 'assigned' ? { id: stage.id, name: stage.name } : null,
				projectedMap: map?.kind === 'available' ? { id: map.mapId, name: map.name } : null,
				// The companion's Handouts page lists exactly these (viewModels' `handouts`).
				handoutCount: getContentItemsForActor(state.content, state.permissions, actor.id).length,
				characters: listCharactersForActor(state.characters, state.permissions, actor.id)
					.filter((character) => character.kind === 'pc')
					.map(({ id, name }) => ({ id, name })),
			};
		});
	return { kind: 'available', participants };
}

/** RC-SES-7.3 — the Session screen row that renders {@link getPlayerViewSummary}. */
export const PLAYER_SUMMARY_WIDGET = Object.freeze({
	type: 'player-views',
	configuration: Object.freeze({ title: 'What players see', presentation: 'bare' }),
});

/**
 * RC-SES-7.3 — place the "What players see" row on a Session screen `command-center.ensure-home` has
 * just provisioned, directly under the Table roster in the side column; everything after the roster
 * moves down one row and one step in reading and focus order. Only a screen this result CREATED is
 * changed (and its `scene.create` operation with it, so a replay builds the same screen); an existing
 * Session screen, customized or not, is never touched. `commands/dispatch.ts` applies this to the
 * command's result.
 */
export function withPlayerSummaryOnNewSessionScreen(
	env: CoreEnvironment,
	result: CommandResult,
): CommandResult {
	if (result.status !== 'accepted') return result;
	const created = result.events.flatMap((event) =>
		event.kind === 'scene.created' ? [event.sceneId] : [],
	);
	const screen = created
		.map((id) => result.nextState.scenes.scenes[id])
		.find((scene) => scene && screenMetaOf(scene).origin?.defaultKey === 'session');
	if (!screen) return result;
	const roster = screen.widgets.find(
		(widget) => widget.type === 'session' && widget.configuration.view === 'roster',
	);
	if (!roster || screen.widgets.some((widget) => widget.type === PLAYER_SUMMARY_WIDGET.type))
		return result;
	// The screen is built in reading order, so everything after the roster's slot moves down.
	const index = screen.widgets.indexOf(roster) + 1;
	const bump = (order: number | null) => (order === null ? null : order + 1);
	const shifted = screen.widgets.map((widget, position) =>
		position < index
			? widget
			: {
					...widget,
					layout: {
						...widget.layout,
						y:
							widget.layout.groupId === roster.layout.groupId
								? widget.layout.y + roster.layout.h
								: widget.layout.y,
						z: widget.layout.z + 1,
						focusOrder: bump(widget.layout.focusOrder),
					},
				},
	);
	const placed: Scene = {
		...screen,
		widgets: [
			...shifted.slice(0, index),
			{
				id: env.ids(),
				type: PLAYER_SUMMARY_WIDGET.type,
				version: roster.version,
				layout: {
					...roster.layout,
					y: roster.layout.y + roster.layout.h,
					z: roster.layout.z + 1,
					focusOrder: bump(roster.layout.focusOrder),
				},
				configuration: { ...PLAYER_SUMMARY_WIDGET.configuration },
				localState: {},
				binding: null,
				disabled: null,
			},
			...shifted.slice(index),
		],
	};
	const { nextState } = result;
	return {
		...result,
		nextState: {
			...nextState,
			scenes: { ...nextState.scenes, scenes: { ...nextState.scenes.scenes, [placed.id]: placed } },
			sync: {
				...nextState.sync,
				operations: nextState.sync.operations.map((op) =>
					op.entityId === placed.id &&
					op.opType === 'scene.create' &&
					result.operationIds.includes(op.id)
						? { ...op, value: placed }
						: op,
				),
			},
		},
	};
}
