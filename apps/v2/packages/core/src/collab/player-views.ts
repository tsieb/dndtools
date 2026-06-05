import type { ActorId } from '../state/ids';
import type { Actor, PermissionState } from '../state/permission-state';
import type { SceneState } from '../state/scene-state';
import type { SessionPlayerViewAssignment, SessionState } from '../state/session-state';
import { actorCanCoEditScene } from '../permissions/grants';
import {
	getPlayerViewForActor,
	type PlayerViewQueryResult,
	type SceneQueryOptions,
} from '../queries/scene';

/**
 * COLLAB-005 — the DM controls DIFFERENT PLAYER VIEW assignments for DIFFERENT players during the SAME
 * session (Glossary "Player View"; Architecture Contract 4 "Player View Rules"). This module is the COLLAB
 * layer ON TOP of the CANVAS player-view machinery — it does NOT re-implement projection, visibility, or
 * binding filtering. The DM already projects per-player subsets via the `session.project-player-view`
 * command (one {@link SessionPlayerViewAssignment} per player) and each player's filtered scene is read
 * through {@link getPlayerViewForActor}. COLLAB-005 adds the two things the requirement needs beyond that
 * single-player read:
 *
 *   1. A MULTI-PLAYER PROJECTION SNAPSHOT (COLLAB-005 AC1). Given Player A and Player B connected at the
 *      same time, {@link projectPlayerViews} resolves EACH connected participant's OWN player view through
 *      the SAME actor-filtered read, so each receives ONLY their assigned subset. The snapshot is the
 *      executable proof that the projections are PER-PLAYER and INDEPENDENT: A's view is computed against
 *      A's assignment + A's visibility, B's against B's — A never sees B's subset and vice versa. Fail
 *      closed: a participant with no assignment gets an `unassigned` entry (no default DM layout leaks),
 *      and every widget in a delivered view is already visibility/binding-filtered for that actor by the
 *      underlying query (a hidden bound field never reaches the player device — Contract 4 Player View
 *      rule 5).
 *   2. The PLAYER-VIEW WIDGET-EDIT GATE (COLLAB-005 AC2). A player may NOT add/move/remove/configure a
 *      widget on their Player View unless the DM granted them scene `co-editor` (Contract 4 Player View
 *      rule 2). {@link playerCanEditPlayerView} is the executable expression of that authority — it is the
 *      SAME `actorCanCoEditScene` rule the scene-edit command reducers (`scene.add-widget`, etc.) enforce,
 *      surfaced here so the COLLAB layer can assert the gate and a GUI can disable the affordance. It is
 *      NOT a second authority source: the command reducer remains the fail-closed enforcement point; this
 *      mirrors it so a player without `co-editor` is reported as unable to edit, fail closed.
 *
 * Pure + deterministic over plain data (scenes, permissions, session, actor). No DOM/storage/clock/entropy:
 * the participant-filtered reads are delegated to the existing query layer, which is itself pure.
 */

/** Why a participant is excluded from the multi-player projection snapshot. */
export type PlayerViewExclusionReason =
	| 'unknown-actor' // the id is not a registered participant
	| 'is-dm'; // the DM is the projector, not a projection recipient

/**
 * ONE connected participant's resolved player view in a multi-player projection snapshot. `view` is the
 * SAME {@link PlayerViewQueryResult} the participant's device would receive — already actor-filtered
 * (assigned subset only, hidden bindings redacted/omitted). `canEditPlayerView` reports whether this
 * participant may edit widgets on the view (scene `co-editor`); for a player without the grant it is
 * `false` (COLLAB-005 AC2).
 */
export interface ParticipantPlayerView {
	actorId: ActorId;
	role: Actor['role'];
	displayName: string;
	/** The participant's OWN filtered player view (assignment-scoped, visibility-filtered). */
	view: PlayerViewQueryResult;
	/** The participant's active assignment, when one exists (else null — `unassigned` view). */
	assignment: SessionPlayerViewAssignment | null;
	/** Whether this participant may edit widgets on their player view (scene `co-editor`; COLLAB-005 AC2). */
	canEditPlayerView: boolean;
}

/** A participant excluded from the snapshot (the DM, or an unknown id), with the structured reason. */
export interface ExcludedParticipant {
	actorId: ActorId;
	reason: PlayerViewExclusionReason;
}

/**
 * The multi-player projection snapshot (COLLAB-005 AC1): every connected participant's OWN player view,
 * resolved independently. The DM is excluded (they are the projector). The snapshot is the executable
 * proof that different players receive different, independent subsets at the same time.
 */
export interface PlayerViewProjectionSnapshot {
	/** One entry per connected, non-DM participant — each carrying ONLY their own assigned subset. */
	participants: ParticipantPlayerView[];
	/** Participants asked for but excluded (DM / unknown), with reasons. Never carries view data. */
	excluded: ExcludedParticipant[];
}

/**
 * COLLAB-005 AC2 — whether a participant may EDIT widgets on their player view. A player may add, move,
 * resize, remove, or configure a widget on their Player View ONLY when the DM granted them scene
 * `co-editor` (Contract 4 Player View rule 2). This delegates to the SAME `actorCanCoEditScene` rule the
 * scene-edit command reducers enforce, so the reported authority always matches what a command would
 * accept. The DM always may (their authority is inherent); an observer never may (no write grants —
 * Contract 3); a player may only with the `co-editor` grant on the projected scene. Fail closed: an
 * unknown actor or a missing scene id yields `false`.
 */
export function playerCanEditPlayerView(
	permission: PermissionState,
	actorId: ActorId,
	sceneId: string,
	now?: string,
): boolean {
	if (!sceneId) return false;
	return actorCanCoEditScene(permission, actorId, sceneId, now);
}

/**
 * The scene id a participant's player view is projected from, or null when they have no active assignment.
 * Used so the edit gate is evaluated against the scene the player is actually viewing.
 */
function projectedSceneId(session: SessionState, actorId: ActorId): string | null {
	return session.playerViewAssignments[actorId]?.target.sceneId ?? null;
}

/**
 * COLLAB-005 AC1 — resolve a MULTI-PLAYER projection snapshot: each connected, non-DM participant's OWN
 * filtered player view, computed independently through {@link getPlayerViewForActor}. Player A's entry is
 * A's assigned subset filtered for A; Player B's is B's subset filtered for B — neither entry can contain
 * the other's content, because each is produced by the actor-filtered read against that actor's own
 * assignment + visibility. A participant with no assignment gets an `unassigned` view (no default DM
 * layout leaks). The DM is excluded as the projector; an unknown id is excluded fail closed.
 *
 * `connectedActorIds`, when supplied, scopes the snapshot to the currently-connected participants (the
 * requirement's "Player A and Player B are connected"); absent ⇒ every registered non-DM participant is
 * resolved. Either way the per-participant view is identical to what that participant's device receives.
 */
export function projectPlayerViews(
	scenes: SceneState,
	permission: PermissionState,
	session: SessionState,
	connectedActorIds: readonly ActorId[] | undefined,
	options: Omit<SceneQueryOptions, 'projectionScope'> = {},
): PlayerViewProjectionSnapshot {
	const candidateIds =
		connectedActorIds ??
		Object.keys(permission.actors).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

	const participants: ParticipantPlayerView[] = [];
	const excluded: ExcludedParticipant[] = [];

	for (const actorId of candidateIds) {
		const actor = permission.actors[actorId];
		if (!actor) {
			excluded.push({ actorId, reason: 'unknown-actor' });
			continue;
		}
		if (actor.role === 'dm') {
			excluded.push({ actorId, reason: 'is-dm' });
			continue;
		}

		const assignment = session.playerViewAssignments[actorId] ?? null;
		// Each participant's view is computed independently against their OWN assignment + visibility, so
		// it carries ONLY their assigned, filtered subset (COLLAB-005 AC1).
		const view = getPlayerViewForActor(scenes, permission, session, actorId, options);
		const sceneId = projectedSceneId(session, actorId);
		const canEditPlayerView = sceneId
			? playerCanEditPlayerView(permission, actorId, sceneId)
			: false;

		participants.push({
			actorId: actor.id,
			role: actor.role,
			displayName: actor.displayName,
			view,
			assignment,
			canEditPlayerView,
		});
	}

	participants.sort((a, b) => (a.actorId < b.actorId ? -1 : a.actorId > b.actorId ? 1 : 0));
	excluded.sort((a, b) => (a.actorId < b.actorId ? -1 : a.actorId > b.actorId ? 1 : 0));
	return { participants, excluded };
}

/**
 * The delivered widget instance ids in a resolved player view (the assigned subset), or `[]` when the view
 * is unassigned/denied. A widget that resolved to a hidden/missing/unbound placeholder still occupies an
 * instance id but carries NO content; this lists the instance ids actually delivered to the participant so
 * a snapshot can be compared across participants for disjointness.
 */
export function deliveredWidgetInstanceIds(view: PlayerViewQueryResult): string[] {
	if (view.kind !== 'assigned') return [];
	return view.widgets
		.map((payload) =>
			payload.kind === 'available' || payload.kind === 'degraded'
				? payload.widget.id
				: payload.widgetInstanceId,
		)
		.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * COLLAB-005 AC1 — HARD assertion that two participants' projected player views are INDEPENDENT: neither
 * participant's delivered subset contains a widget instance the OTHER was NOT also explicitly projected.
 * This is the executable contract a test calls to prove "each player receives only their assigned subset":
 * it returns the widget instance ids that leaked from one participant's assignment into the other's
 * delivered view but were not in that other participant's own assignment. An empty result proves no
 * cross-player leak. Pure.
 *
 * Note: two players MAY be projected the SAME widget intentionally (the DM projects a shared widget to
 * both). This assertion does NOT forbid shared projection; it proves a participant's delivered view never
 * contains a widget that is NOT covered by their OWN assignment — i.e. the read is genuinely per-player and
 * one player's view is not silently widened by another's assignment.
 */
export function crossPlayerLeakedWidgetIds(
	session: SessionState,
	participant: ParticipantPlayerView,
): string[] {
	const assignment = participant.assignment;
	const delivered = deliveredWidgetInstanceIds(participant.view);
	// A scene-kind assignment (or an assignment with a null widget subset) delivers the whole assigned
	// scene, so every delivered widget is by definition within the participant's own assignment.
	const assignedSubset = assignment?.target.widgetInstanceIds ?? null;
	if (assignedSubset === null) return [];
	const allowed = new Set(assignedSubset);
	return delivered.filter((id) => !allowed.has(id));
}
