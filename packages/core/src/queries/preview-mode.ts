import type { ActorId } from '../state/ids';
import type { Actor, PermissionState } from '../state/permission-state';

/**
 * UX-PERM-006 — "Preview as player / observer" mode: the Processing-Core side.
 *
 * The whole point of preview mode is that it is NOT a cosmetic overlay: the DM's shell re-renders
 * through the SAME actor-filtered core queries a real player/observer session would use, just with a
 * different requesting actor id. This module owns the pieces that make that safe:
 *
 *   - RESERVED GENERIC PREVIEW ACTORS — "Preview as player" with no specific player chosen renders
 *     as a synthetic zero-grant player ({@link PREVIEW_PLAYER_ACTOR_ID}); likewise for observer.
 *     They see `player-visible` content only — `dm-only` is absent and `shared` is absent because
 *     no delivery channel exists for them (UX-PERM-006 AC1).
 *   - {@link permissionsWithPreviewActors} — a PURE projection that adds the reserved actors to a
 *     permission state for the duration of a preview render, and STRIPS any grant addressed to a
 *     reserved id, so adversarial persisted data can never smuggle `shared` content into a generic
 *     preview (fail closed).
 *   - {@link resolvePreviewActor} — fail-closed selection: an unknown / non-player "specific player"
 *     falls back to the generic preview actor for the requested role, and a requested `dm` role is
 *     impossible (previewing "as DM" is just the normal view; the least-visible non-DM fallback is
 *     used instead).
 *   - {@link parsePreviewParam} — the `?preview=` URL value is an allowlist of the two roles;
 *     anything else is `null` (no preview), never a guessed role.
 *
 * Writes are blocked OUTSIDE this module at the GUI runtime's single dispatch choke point; the
 * read-only message lives here ({@link PREVIEW_READONLY_MESSAGE}) so every surface shows the same
 * copy.
 */

/** The roles a DM may preview as. Never `dm` (that is just the normal view). Includes `co-dm`: the
 *  trusted elevated seat, whose generic preview actor carries full dm-authority read visibility. */
export type PreviewRole = 'player' | 'observer' | 'co-dm';

/** Reserved synthetic actor ids for the generic (no specific player) previews. */
export const PREVIEW_PLAYER_ACTOR_ID: ActorId = 'preview-generic-player';
export const PREVIEW_OBSERVER_ACTOR_ID: ActorId = 'preview-generic-observer';
export const PREVIEW_CODM_ACTOR_ID: ActorId = 'preview-generic-codm';

const RESERVED_PREVIEW_IDS: ReadonlySet<string> = new Set([
	PREVIEW_PLAYER_ACTOR_ID,
	PREVIEW_OBSERVER_ACTOR_ID,
	PREVIEW_CODM_ACTOR_ID,
]);

/** True for the reserved generic preview actor ids. */
export function isPreviewActorId(actorId: string): boolean {
	return RESERVED_PREVIEW_IDS.has(actorId);
}

/** What the DM asked to preview: a role, optionally a specific connected player to emulate. */
export interface PreviewSelection {
	role: PreviewRole;
	/** When previewing a specific player's exact grants (UX-PERM-006 AC3). */
	playerActorId?: ActorId | null;
}

/** The resolved preview: the actor id every core query is made with while previewing. */
export interface ResolvedPreview {
	role: PreviewRole;
	actorId: ActorId;
	/** Banner label: "Player", "Observer", or "Maya (Player)" for a specific player. */
	label: string;
	/** True when a specific player's exact grants are being emulated. */
	specific: boolean;
}

const GENERIC_PREVIEW_ACTORS: Readonly<Record<PreviewRole, Actor>> = Object.freeze({
	player: Object.freeze({
		id: PREVIEW_PLAYER_ACTOR_ID,
		role: 'player',
		displayName: 'Player (preview)',
	}) as Actor,
	observer: Object.freeze({
		id: PREVIEW_OBSERVER_ACTOR_ID,
		role: 'observer',
		displayName: 'Observer (preview)',
	}) as Actor,
	'co-dm': Object.freeze({
		id: PREVIEW_CODM_ACTOR_ID,
		role: 'co-dm',
		displayName: 'Co-DM (preview)',
	}) as Actor,
});

const PREVIEW_ROLE_LABEL: Readonly<Record<PreviewRole, string>> = Object.freeze({
	player: 'Player',
	observer: 'Observer',
	'co-dm': 'Co-DM',
});

/** Coerce an arbitrary requested role to a previewable one. `dm`/unknown ⇒ `observer` (least visible). */
function normalizePreviewRole(role: unknown): PreviewRole {
	return role === 'player' ? 'player' : role === 'co-dm' ? 'co-dm' : 'observer';
}

/**
 * Resolve a preview selection to the actor the shell renders as. Fail closed: a specific
 * `playerActorId` is honoured ONLY when it names a known actor whose role is `player`; anything
 * else (unknown id, a DM id, an observer id, a reserved preview id) falls back to the generic
 * zero-grant actor for the requested role.
 */
export function resolvePreviewActor(
	permissions: PermissionState,
	selection: PreviewSelection,
): ResolvedPreview {
	const role = normalizePreviewRole(selection.role);
	// A specific participant is honoured for `player` and `co-dm` only when the named actor exists AND
	// holds exactly that role (fail closed for observers, unknown ids, and reserved preview ids).
	if (
		(role === 'player' || role === 'co-dm') &&
		selection.playerActorId &&
		!isPreviewActorId(selection.playerActorId)
	) {
		const actor = permissions.actors[selection.playerActorId];
		if (actor && actor.role === role) {
			return {
				role,
				actorId: actor.id,
				label: `${actor.displayName} (${PREVIEW_ROLE_LABEL[role]})`,
				specific: true,
			};
		}
	}
	const generic = GENERIC_PREVIEW_ACTORS[role];
	return {
		role,
		actorId: generic.id,
		label: PREVIEW_ROLE_LABEL[role],
		specific: false,
	};
}

/**
 * PURE projection: a permission state with the two reserved generic preview actors present and with
 * every grant addressed to a reserved preview id REMOVED. The input state is never mutated, and the
 * reserved entries always use the canonical zero-grant definitions — even if a persisted record
 * squatted on a reserved id, it is replaced, so the generic preview can never carry grants.
 */
export function permissionsWithPreviewActors(permissions: PermissionState): PermissionState {
	return {
		...permissions,
		actors: {
			...permissions.actors,
			[PREVIEW_PLAYER_ACTOR_ID]: GENERIC_PREVIEW_ACTORS.player,
			[PREVIEW_OBSERVER_ACTOR_ID]: GENERIC_PREVIEW_ACTORS.observer,
			[PREVIEW_CODM_ACTOR_ID]: GENERIC_PREVIEW_ACTORS['co-dm'],
		},
		grants: permissions.grants.filter((grant) => !isPreviewActorId(grant.playerActorId)),
	};
}

/**
 * Parse the `?preview=` URL parameter. Strict allowlist: exactly `player` or `observer`; any other
 * value (including `dm`, casing variants, empty) is `null` — no preview (fail closed).
 */
export function parsePreviewParam(value: string | null | undefined): PreviewRole | null {
	return value === 'player' || value === 'observer' || value === 'co-dm' ? value : null;
}

// --- Banner / copy --------------------------------------------------------------------------------

/** The single read-only rejection copy shown when any write is attempted during preview. */
export const PREVIEW_READONLY_MESSAGE =
	'Preview mode is read-only — exit preview to make changes.';

/** The persistent banner + live announcement model (UX-PERM-006 §spec). */
export interface PreviewBannerModel {
	/** "Previewing as: Player" / "Previewing as: Maya (Player)". */
	title: string;
	subtitle: string;
	exitLabel: string;
	/** Assertive announcement on entry. */
	announcement: string;
	/** Documented exit shortcut, for `aria-keyshortcuts` on the banner. */
	ariaKeyShortcuts: string;
}

export function previewBannerModel(resolved: ResolvedPreview): PreviewBannerModel {
	return {
		title: `Previewing as: ${resolved.label}`,
		subtitle: 'You cannot make changes in this mode',
		exitLabel: 'Exit preview',
		announcement: `Entering preview mode as ${resolved.label} — all editing is disabled`,
		ariaKeyShortcuts: 'Shift+Escape',
	};
}

/** The assertive announcement on exit, mirroring the entry announcement. */
export const PREVIEW_EXIT_ANNOUNCEMENT = 'Preview mode closed — full view restored.';
