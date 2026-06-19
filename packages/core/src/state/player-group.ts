import type { ActorId } from './ids';

/**
 * COLLAB-012 — the durable PLAYER GROUP model (Glossary "Player Group"; Handout requirements).
 *
 * A Player Group is a DM-authored, NAMED set of participant actors used ONLY as a PROJECTION and
 * HANDOUT-DELIVERY TARGET. It is the single most important invariant of this slice — and the one this
 * model is shaped to make IMPOSSIBLE to violate:
 *
 *   A PLAYER GROUP IS NOT A PERMISSION RECORD. Group membership is delivery-targeting metadata; it
 *   carries NO capability, NO visibility, and NO write authority. A player added to a group gains
 *   ZERO new read/write capability from the membership itself — their actual access is still governed
 *   SOLELY by their role + grants + visibility (the PERM model). A group only expands the set of
 *   individual recipients a delivery RESOLVES to; each resolved recipient's access is then decided by
 *   the normal actor-filtered read.
 *
 * This module is therefore deliberately a PLAIN MEMBERSHIP LIST with NO link to {@link PermissionState},
 * grants, or capability sets. There is no field here a permission check could read, so membership can
 * never become a permission backdoor. The pure resolution helper (`state/player-group` resolver +
 * `collab/player-groups`) only ever turns group ids into a list of actor ids — it never grants anything.
 *
 * Pure data. No GUI, no storage, no clock — ids/clock are supplied by the command env.
 */

export const PLAYER_GROUP_SCHEMA_VERSION = 1 as const;

/** The entity type a player group is addressed by in ops/events. */
export const PLAYER_GROUP_ENTITY_TYPE = 'player-group' as const;

/**
 * ONE durable Player Group: a DM-authored name + an ordered, deduped set of MEMBER actor ids. The
 * members are participant (player/observer) actor ids — never the DM. Crucially this record holds NO
 * permission/visibility data: it is purely a delivery-targeting set.
 */
export interface PlayerGroup {
	id: string;
	/** A DM-authored display name (e.g. "The Front Line"). Does not affect permissions. */
	name: string;
	/** The member participant actor ids, deduped, in insertion order. DELIVERY TARGETS ONLY. */
	memberActorIds: ActorId[];
	createdBy: ActorId;
	createdAt: string;
	updatedAt: string;
	revision: number;
}

/** Normalize a member list: dedupe while preserving first-seen order (no empties). Pure. */
export function normalizeMembers(members: readonly ActorId[]): ActorId[] {
	const seen = new Set<ActorId>();
	const result: ActorId[] = [];
	for (const id of members) {
		if (!id || seen.has(id)) continue;
		seen.add(id);
		result.push(id);
	}
	return result;
}


/** Tolerantly hydrate a possibly-undefined/partial persisted player-group map (safe empty default). */
export function ensurePlayerGroups(
	groups: Record<string, PlayerGroup> | undefined,
): Record<string, PlayerGroup> {
	const result: Record<string, PlayerGroup> = {};
	for (const [id, group] of Object.entries(groups ?? {})) {
		result[id] = {
			id: group.id ?? id,
			name: group.name ?? '',
			memberActorIds: normalizeMembers(group.memberActorIds ?? []),
			createdBy: group.createdBy ?? '',
			createdAt: group.createdAt ?? '',
			updatedAt: group.updatedAt ?? group.createdAt ?? '',
			revision: group.revision ?? 0,
		};
	}
	return result;
}
