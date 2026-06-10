import type { ActorId } from '../state/ids';
import type { Actor, PermissionState } from '../state/permission-state';
import type { SyncOperation } from '../sync/operation-log';
import type {
	PresenceEntry,
	PresenceOnlineStatus,
	PresenceState,
} from '../state/presence-state';

/**
 * COLLAB-004 — EPHEMERAL PRESENCE policy (Architecture Contract 1 `PresenceState`; Yjs awareness model).
 * The system provides online status, cursors, selections, and device availability WITHOUT requiring
 * presence to persist or merge for offline correctness. This module is the pure Processing-Core policy
 * that:
 *
 *   1. PROJECTS the ephemeral presence state to a VIEWER, fail closed (COLLAB-004 AC1). A participant
 *      sees the presence of OTHER authorized participants — never DM-only/hidden participant identity or
 *      DM-only presence detail. The DM sees everyone. A non-DM sees only participants in the same session
 *      that are visible to them (Contract 3 visibility fails closed for presence too — presence must not
 *      LEAK a hidden participant the same way a stream must not leak hidden content). An observer, who has
 *      no character data, still sees coarse online presence of co-participants but never cursor/selection
 *      hints scoped to content they cannot see.
 *
 *   2. GUARDS against presence being replayed as authoritative durable history (COLLAB-004 AC2). After
 *      everyone goes offline and reconnects, durable state is intact (it is the op-log / state documents),
 *      but OLD presence must NOT be replayed as authoritative history. `assertNoPresenceInOperationLog`
 *      proves the durable op-log carries no presence op; `restorePresenceOnReconnect` always returns the
 *      EMPTY presence (presence is rebuilt from fresh broadcasts, never restored from a cache).
 *
 * It REUSES the PERM model for participant visibility (a non-DM cannot even see that a DM-only participant
 * exists) and does NOT re-implement permission/visibility. Presence carries NO durable authority: a
 * cursor/selection is a UI hint, never a write grant. Per ADR-014 the LIVE presence broadcast transport
 * (websocket awareness, cursor streaming) is deferred; this is the policy a transport plugs into. Pure +
 * deterministic over plain data (apart from an optional `now` for staleness) — no DOM/storage/network.
 *
 * FAIL CLOSED throughout:
 *   - An unknown/unauthenticated viewer sees the EMPTY presence list (no actor ⇒ nothing visible).
 *   - A presence entry for an actor the viewer cannot see is OMITTED entirely (not merely hidden) — its
 *     existence is not probeable from the projected list.
 *   - Cursor/selection hints scoped to a scene the viewer cannot see are STRIPPED, leaving only coarse
 *     online status, so a hint never leaks the existence of a hidden scene/widget.
 */

/** Why a participant's presence is hidden from a viewer (the structured reason; sender-side only). */
export type PresenceWithholdReason =
	| 'unknown-viewer' // the viewer is not an authenticated participant
	| 'participant-not-visible'; // the viewed participant is not visible to the viewer

/**
 * How the presence projection resolves whether a viewer may see ANOTHER participant at all, and what that
 * participant's role is. Given the viewed participant's actor id, the source returns the participant's
 * {@link Actor} when the viewer may see them, or `undefined` to OMIT the participant (fail closed). The
 * transport supplies this from the session's participant model (typically the PERM `actors` map plus any
 * session-specific hidden-participant rules). Returning `undefined` for an unknown/hidden participant is
 * how a session keeps a DM-only participant out of a non-DM viewer's presence entirely.
 */
export type ParticipantVisibilitySource = (viewer: Actor, participantActorId: ActorId) => Actor | undefined;

/**
 * How the projection resolves whether a viewer may see a SCENE that a cursor/selection hint references.
 * When a hint targets a scene the viewer cannot see, the hint is stripped (only coarse online status
 * survives) so presence never leaks the existence of a hidden scene/widget. Absent ⇒ no scene gating
 * (the caller has already scoped hints to shared scenes); supply it to fail closed on a hidden scene.
 */
export type PresenceSceneVisibilitySource = (viewer: Actor, sceneId: string) => boolean;

/** A presence entry as projected to a viewer — already filtered (omitted entries, stripped hints). */
export type ProjectedPresenceEntry = PresenceEntry;

/** One participant's presence withheld from a viewer (sender-side diagnostics only — never sent). */
export interface WithheldPresence {
	actorId: ActorId;
	reason: PresenceWithholdReason;
}

/** The presence projected for ONE viewer: the entries they may see + the sender-side withheld record. */
export interface PresenceProjection {
	viewerActorId: ActorId | null;
	/** The presence entries the viewer may see, sorted by actor id for deterministic rendering. */
	visible: ProjectedPresenceEntry[];
	/** Participants whose presence was withheld from this viewer (sender diagnostics only). */
	withheld: WithheldPresence[];
}

export interface ProjectPresenceOptions {
	/**
	 * Decide whether the viewer may see another participant, and resolve that participant's role. Required
	 * to project anyone other than the viewer themselves — without it, only the viewer's own presence is
	 * shown (fail closed: an un-resolvable participant is omitted).
	 */
	resolveParticipantVisibility?: ParticipantVisibilitySource;
	/** Decide whether the viewer may see a scene a cursor/selection hint references. */
	resolveSceneVisibility?: PresenceSceneVisibilitySource;
	/**
	 * Optional staleness window in ms. A presence entry older than this relative to `now` is treated as
	 * `away` (it is not removed — removal is the broadcaster's job — but a stale cursor is not shown as
	 * live). Absent ⇒ no staleness reclassification.
	 */
	stalenessMs?: number;
	/** The current time, for staleness. Absent ⇒ staleness is not evaluated. */
	now?: string;
}

/** Strip a hint that references a scene the viewer cannot see (fail closed: no leak of a hidden scene). */
function stripHiddenSceneHints(
	entry: PresenceEntry,
	viewer: Actor,
	resolveSceneVisibility: PresenceSceneVisibilitySource | undefined,
): PresenceEntry {
	if (viewer.role === 'dm' || !resolveSceneVisibility) return entry;
	const next: PresenceEntry = { ...entry };
	if (next.activeSceneId && !resolveSceneVisibility(viewer, next.activeSceneId)) {
		delete next.activeSceneId;
	}
	if (next.cursor && !resolveSceneVisibility(viewer, next.cursor.sceneId)) {
		delete next.cursor;
	}
	if (next.selection && !resolveSceneVisibility(viewer, next.selection.sceneId)) {
		delete next.selection;
	}
	return next;
}

/** Reclassify an entry older than the staleness window as `away` (a stale cursor is not shown as live). */
function applyStaleness(
	entry: PresenceEntry,
	options: ProjectPresenceOptions,
): PresenceEntry {
	if (options.stalenessMs === undefined || options.now === undefined) return entry;
	const updated = Date.parse(entry.updatedAt);
	const current = Date.parse(options.now);
	if (Number.isNaN(updated) || Number.isNaN(current)) return entry;
	if (current - updated <= options.stalenessMs) return entry;
	if (entry.status !== 'online') return entry;
	const stale: PresenceEntry = { ...entry, status: 'away' as PresenceOnlineStatus };
	// A stale entry's cursor is no longer live; drop it so the GUI never renders a frozen cursor as live.
	delete stale.cursor;
	return stale;
}

/**
 * COLLAB-004 AC1 — project the ephemeral presence to ONE viewer, fail closed. For each OTHER participant
 * with a live presence entry, the entry is delivered ONLY when the viewer may see that participant; a
 * not-visible participant is OMITTED entirely (its existence is not probeable). A delivered entry has any
 * cursor/selection hint scoped to a scene the viewer cannot see STRIPPED. The viewer always sees their OWN
 * presence (self is always visible). The DM sees every entry. An unknown viewer sees nothing.
 *
 * Pure + deterministic; the visible list is sorted by actor id.
 */
export function projectPresenceForViewer(
	presence: PresenceState,
	viewer: Actor | undefined,
	options: ProjectPresenceOptions = {},
): PresenceProjection {
	if (!viewer) {
		// Fail closed: an unknown viewer sees no presence, and every entry is recorded as withheld.
		return {
			viewerActorId: null,
			visible: [],
			withheld: Object.keys(presence.entries)
				.sort()
				.map((actorId) => ({ actorId, reason: 'unknown-viewer' as const })),
		};
	}

	const resolveParticipant = options.resolveParticipantVisibility;
	const visible: ProjectedPresenceEntry[] = [];
	const withheld: WithheldPresence[] = [];

	for (const actorId of Object.keys(presence.entries).sort()) {
		const entry = presence.entries[actorId]!;
		// The viewer always sees their own presence.
		if (actorId === viewer.id) {
			visible.push(applyStaleness(entry, options));
			continue;
		}
		// The viewed participant must resolve to a known, visible actor (fail closed otherwise). With no
		// participant-visibility source, only the viewer's own presence is shown — never another actor's.
		const participant = resolveParticipant?.(viewer, actorId);
		if (!participant) {
			withheld.push({ actorId, reason: 'participant-not-visible' });
			continue;
		}
		const scoped = stripHiddenSceneHints(entry, viewer, options.resolveSceneVisibility);
		visible.push(applyStaleness(scoped, options));
	}

	return { viewerActorId: viewer.id, visible, withheld };
}

/**
 * Project presence using the session's PERMISSION state to decide participant visibility. A viewer sees
 * the DM and every registered participant; a participant absent from `permission.actors` is treated as
 * NOT a session participant and is withheld (fail closed). This is the convenience wrapper a transport
 * uses when participant visibility is the standard Contract-3 base-role rule.
 */
export function projectSessionPresence(
	presence: PresenceState,
	permission: PermissionState,
	viewerActorId: string,
	options: Omit<ProjectPresenceOptions, 'resolveParticipantVisibility'> = {},
): PresenceProjection {
	const viewer = permission.actors[viewerActorId];
	const resolveParticipantVisibility: ParticipantVisibilitySource = (_currentViewer, participantActorId) => {
		// A participant must be a REGISTERED session actor to be visible to anyone (fail closed). Under the
		// Contract-3 base-role rule every registered co-participant is mutually presence-visible; a session
		// that hides participants supplies its own stricter source via `projectPresenceForViewer`.
		return permission.actors[participantActorId];
	};
	return projectPresenceForViewer(presence, viewer, { ...options, resolveParticipantVisibility });
}

/**
 * COLLAB-004 AC2 — RESTORE presence on reconnect: presence is NEVER restored from a cache or replayed as
 * authoritative history. After everyone goes offline and reconnects, durable state is intact but presence
 * starts EMPTY and is rebuilt from fresh live broadcasts. This always returns the empty presence state —
 * the executable proof that old presence is not replayed. (`_priorPresence` is accepted only to make the
 * intent explicit at the call site; it is deliberately ignored.)
 */
export function restorePresenceOnReconnect(_priorPresence?: PresenceState): PresenceState {
	return { entries: {}, schemaVersion: 1 };
}

/**
 * COLLAB-004 AC2 — the hard, fail-closed guard that NO presence is durable. Presence must never enter the
 * operation log (Contract 2: "Presence | Ephemeral broadcast, no durable merge"; Cloud Storage Model:
 * presence is device-local only). Given an op stream, throws if any op concerns presence (its entity type
 * or op type names presence) — so a buggy transport that tried to durably record a cursor/selection is
 * caught at the boundary rather than replaying presence as authoritative history. Pure (apart from
 * throwing).
 */
export function assertNoPresenceInOperationLog(operations: readonly SyncOperation[]): void {
	for (const op of operations) {
		const entityType = op.entityType.toLowerCase();
		const opType = op.opType.toLowerCase();
		if (
			entityType === PRESENCE_ENTITY_TYPE ||
			entityType.includes('presence') ||
			opType.includes('presence') ||
			opType.includes('cursor')
		) {
			throw new Error(
				`Presence must never be durable: operation "${op.id}" (entityType="${op.entityType}", opType="${op.opType}") looks like a presence op and must not enter the operation log.`,
			);
		}
	}
}

/** The reserved entity-type token presence would use if it were durable — used only by the leak guard. */
export const PRESENCE_ENTITY_TYPE = 'presence' as const;

/**
 * Whether a presence projection is SAFE to broadcast to a viewer: every visible entry's owner is one the
 * viewer may see, and no stripped-scene hint leaked. Re-runs the participant-visibility check and throws
 * on any leak — the fail-closed boundary guard a transport runs before sending presence to a viewer.
 */
export function assertPresenceProjectionIsClean(
	projection: PresenceProjection,
	viewer: Actor | undefined,
	resolveParticipantVisibility: ParticipantVisibilitySource,
): void {
	if (!viewer) {
		if (projection.visible.length > 0) {
			throw new Error('Presence leak: an unknown viewer must receive no presence entries.');
		}
		return;
	}
	for (const entry of projection.visible) {
		if (entry.actorId === viewer.id) continue;
		if (!resolveParticipantVisibility(viewer, entry.actorId)) {
			throw new Error(
				`Presence leak: viewer "${viewer.id}" must not receive presence for participant "${entry.actorId}".`,
			);
		}
	}
}
