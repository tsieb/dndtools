import type { ActorId } from '../state/ids';
import type { Actor, PermissionState } from '../state/permission-state';
import type { Scene, SceneState } from '../state/scene-state';
import type { SessionState } from '../state/session-state';
import { evaluateSceneVisibility } from '../permissions/visibility';
import { computeEffectivePermissionsForActor } from '../permissions/base-roles';
import { decideCharacterDataRead } from '../permissions/consistency';

/**
 * COLLAB-011 — OBSERVER read-only access. Observers join shared sessions as READ-ONLY participants with
 * access ONLY to explicitly shared Scenes, maps, and placeholders, and NO character data or write-capable
 * controls (Vision Role Model; Architecture Contract 3 "Base Roles"). This module is the COLLAB layer that
 * composes the existing fail-closed primitives into the precise observer-join surface the requirement
 * needs — it does NOT re-implement role/visibility/permission policy:
 *
 *   - the OBSERVER CEILING is the PERM-001/011 `computeEffectivePermissions` (read-only, no character data,
 *     no surviving write/character grant) — `base-roles.ts`;
 *   - SCENE VISIBILITY is the PERM `evaluateSceneVisibility` (a `dm-only` scene is hidden; a `shared` scene
 *     is delivered only via an explicit player-view assignment / sharing target / viewer grant) —
 *     `visibility.ts`;
 *   - the CHARACTER-DATA read guard is the PERM-011 `decideCharacterDataRead` (an observer is ALWAYS denied
 *     character data) — `consistency.ts`.
 *
 * It provides the two things COLLAB-011 requires:
 *
 *   1. The OBSERVER JOIN SURFACE (COLLAB-011 AC1). {@link observerVisibleScenes} computes an observer's
 *      visible scene list, which by construction EXCLUDES `dm-only` content (hidden by scene visibility),
 *      PRIVATE PLAYER VIEWS (a `shared` scene the observer has no explicit grant/sharing-target for stays
 *      hidden — a player-view assignment for ANOTHER actor never makes a scene visible to the observer),
 *      and CHARACTER SHEETS (an observer is denied character data, and a scene whose surface is character
 *      data is never shared to an observer). {@link observerAccessSummary} bundles the visible scenes with
 *      the read-only ceiling so a session-join surface can render exactly what the observer may see — and
 *      proves it carries no character data.
 *   2. The WRITE-COMMAND GATE (COLLAB-011 AC2). {@link classifyObserverCommand} decides, fail closed,
 *      whether a command an observer invokes is a WRITE-CAPABLE mutation — and an observer may invoke NONE
 *      of them. Every durable mutation enters the Processing Core as a command (Contract 1 binding rule 1),
 *      and an observer has no write authority (the ceiling caps them at read-only with zero surviving write
 *      grants), so this gate REJECTS every command type for an observer BEFORE mutation. It is the
 *      executable expression of the observer ceiling at the command boundary; the per-command reducers
 *      remain the enforcement points, and this proves the gate is exhaustive and fail-closed.
 *
 * Pure + deterministic over plain data (scenes, permissions, session, actor). No DOM/storage/clock/entropy.
 */

/** Why an observer-access request was denied (fail closed). The reason never carries hidden content. */
export type ObserverAccessDenialReason =
	| 'unknown-actor' // the id is not a registered participant
	| 'not-observer'; // the actor is not an observer (this surface is observer-scoped)

/** One scene an observer may see — the minimal, NON-LEAKING descriptor for the read-only observer surface. */
export interface ObserverVisibleScene {
	id: string;
	name: string;
	visibility: Scene['visibility'];
	/** The number of widgets on the scene (a count only — widget content is resolved per-actor elsewhere). */
	widgetCount: number;
	updatedAt: string;
}

/**
 * The computed OBSERVER ACCESS SUMMARY (COLLAB-011 AC1). `readOnly` is always true for an observer (the
 * ceiling), `canReadCharacterData` always false, and `visibleScenes` is the observer's filtered scene
 * list — excluding `dm-only` content, private player views, and character sheets by construction.
 */
export interface ObserverAccessSummary {
	kind: 'available';
	observerActorId: ActorId;
	/** Always true — an observer is read-only (the role ceiling). Surfaced so the GUI disables write UI. */
	readOnly: true;
	/** Always false — an observer never receives character data (COLLAB-011 / Contract 3 Base Roles). */
	canReadCharacterData: false;
	/** The scenes the observer may see, sorted by name. Excludes dm-only / private / character content. */
	visibleScenes: ObserverVisibleScene[];
}

export type ObserverAccessResult =
	| ObserverAccessSummary
	| { kind: 'denied'; reason: ObserverAccessDenialReason };

function visibleSceneDescriptor(scene: Scene): ObserverVisibleScene {
	return {
		id: scene.id,
		name: scene.name,
		visibility: scene.visibility,
		widgetCount: scene.widgets.length,
		updatedAt: scene.ownership.updatedAt,
	};
}

/**
 * COLLAB-011 AC1 — the scenes an OBSERVER may see. A scene is included ONLY when
 * {@link evaluateSceneVisibility} resolves `visible` for the observer:
 *
 *   - a `dm-only` scene is EXCLUDED (DM-only content);
 *   - a `shared` scene is included ONLY when the observer has an explicit player-view assignment, sharing
 *     target, or viewer grant for it — a PRIVATE player view projected to a DIFFERENT actor never makes a
 *     scene visible to the observer (so private player views are excluded);
 *   - a template scene is never delivered to a non-DM.
 *
 * Fail closed: a non-observer or unknown actor yields the EMPTY list (this is the observer surface). The
 * result is sorted by name for deterministic output. Character data is never part of a scene descriptor —
 * widget content is resolved per-actor through the actor-filtered scene read, where the observer's
 * character-data denial applies — so this list carries no character sheet content.
 */
export function observerVisibleScenes(
	scenes: SceneState,
	permission: PermissionState,
	observerActorId: ActorId,
): ObserverVisibleScene[] {
	const actor: Actor | undefined = permission.actors[observerActorId];
	if (!actor || actor.role !== 'observer') return [];

	const out: ObserverVisibleScene[] = [];
	for (const scene of Object.values(scenes.scenes)) {
		if (scene.templateMeta.isTemplate) continue;
		const evaluation = evaluateSceneVisibility(scene, actor, permission);
		if (evaluation.kind !== 'visible') continue;
		out.push(visibleSceneDescriptor(scene));
	}
	out.sort((a, b) => a.name.localeCompare(b.name));
	return out;
}

/**
 * COLLAB-011 AC1 — build the OBSERVER ACCESS SUMMARY for a session join. Composes the observer ceiling
 * (read-only, no character data — `computeEffectivePermissions`) with the observer's visible scene list.
 * Fail closed: an unknown actor or a non-observer is DENIED with a structured reason and no scene data.
 *
 * The `_session` parameter is accepted so a future session-scoped filter (e.g. excluding scenes not in the
 * active session) can be added without changing the signature; the current visibility model already
 * excludes everything an observer may not see, so the scene list is computed from scene visibility alone.
 */
export function observerAccessSummary(
	scenes: SceneState,
	permission: PermissionState,
	_session: SessionState,
	observerActorId: ActorId,
): ObserverAccessResult {
	const actor: Actor | undefined = permission.actors[observerActorId];
	if (!actor) return { kind: 'denied', reason: 'unknown-actor' };
	if (actor.role !== 'observer') return { kind: 'denied', reason: 'not-observer' };

	// The ceiling is the floor for an observer: read-only, no character data. Computed (not assumed) so the
	// summary is provably consistent with the PERM-001/011 effective-permission surface.
	const effective = computeEffectivePermissionsForActor(permission, observerActorId);
	const charRead = decideCharacterDataRead(permission, observerActorId);

	// Defense-in-depth: an observer's computed surface MUST be read-only with no character data. If it ever
	// is not (a regression in the ceiling), fail closed by denying rather than exposing a wider surface.
	if (!effective.readOnly || effective.canReadCharacterData || charRead.kind !== 'denied') {
		return { kind: 'denied', reason: 'not-observer' };
	}

	return {
		kind: 'available',
		observerActorId: actor.id,
		readOnly: true,
		canReadCharacterData: false,
		visibleScenes: observerVisibleScenes(scenes, permission, observerActorId),
	};
}

/** The outcome of classifying a command an observer attempted to invoke (COLLAB-011 AC2). */
export type ObserverCommandClassification =
	| { allowed: true } // the actor is not an observer; this gate does not apply
	| { allowed: false; reason: 'observer-read-only'; message: string };

const OBSERVER_WRITE_DENIAL_MESSAGE =
	'Observers have read-only access and cannot run this action.';

/**
 * COLLAB-011 AC2 — the OBSERVER WRITE-COMMAND GATE. Decide, FAIL CLOSED, whether an observer may invoke a
 * command. Every command in the Processing Core's command surface is a durable MUTATION (commands are the
 * only mutation interface — Contract 1 binding rule 1), and an observer has NO write authority (the role
 * ceiling caps them at read-only with zero surviving write/character grants — `base-roles.ts`). Therefore
 * an observer may invoke NONE of them: this gate REJECTS every command type for an observer BEFORE any
 * mutation, with a generic read-only denial.
 *
 *   - A non-observer (DM/player) ⇒ `allowed: true` — this gate does not apply; the command's own reducer
 *     enforces that actor's authority.
 *   - An observer ⇒ `allowed: false` with `observer-read-only`, regardless of command type or payload, so
 *     a forged/unknown command type is denied fail closed (the gate never allowlists a command for an
 *     observer).
 *   - An unknown actor ⇒ treated as the least-privileged (observer) ceiling and denied fail closed — no
 *     anonymous write is ever permitted.
 *
 * This is a boundary classifier the dispatch path / transport can apply before reducing a command from an
 * observer; the per-command reducers remain the in-process enforcement points, and this proves the
 * observer write ban is EXHAUSTIVE (no command type is exempt).
 */
export function classifyObserverCommand(
	permission: PermissionState,
	actorId: ActorId,
	_commandType: string,
): ObserverCommandClassification {
	const actor: Actor | undefined = permission.actors[actorId];
	// Fail closed: an unknown/unauthenticated actor is treated as the least-privileged observer ceiling.
	const isObserver = !actor || actor.role === 'observer';
	if (!isObserver) return { allowed: true };
	return { allowed: false, reason: 'observer-read-only', message: OBSERVER_WRITE_DENIAL_MESSAGE };
}

/**
 * Whether an actor is an OBSERVER (or an unknown/unauthenticated id, treated as the least-privileged
 * observer ceiling — fail closed). Exposed so a GUI can decide whether to render the observer read-only
 * surface and suppress every write affordance.
 */
export function isObserverActor(permission: PermissionState, actorId: ActorId): boolean {
	const actor: Actor | undefined = permission.actors[actorId];
	return !actor || actor.role === 'observer';
}
