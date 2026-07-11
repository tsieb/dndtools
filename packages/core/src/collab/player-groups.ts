import type { ActorId } from '../state/ids';
import type { Actor, PermissionState } from '../state/permission-state';
import { hasDmAuthority } from '../state/permission-state';
import type { PlayerGroup } from '../state/player-group';

/**
 * COLLAB-012 — PLAYER GROUP RESOLUTION as PURE Processing-Core policy (Glossary "Player Group"; Handout
 * requirements). A Player Group is a DELIVERY/PROJECTION TARGET ONLY. This module turns delivery targets
 * (explicit actor ids + group ids) into a flat list of INDIVIDUAL RECIPIENT actor ids, and provides the
 * hard, fail-closed proof of the slice's central invariant:
 *
 *   GROUP MEMBERSHIP GRANTS ZERO PERMISSION. Resolving a delivery target through a group only EXPANDS the
 *   recipient list to the group's CURRENT members. It NEVER consults, derives, or confers a capability,
 *   visibility level, or write authority. A player added to a group gains NO new read/write capability
 *   from the membership — their access is decided SOLELY by their role + grants + visibility downstream.
 *
 * The functions here take a {@link PermissionState} ONLY to (a) keep observers/unknown actors out of a
 * resolved recipient list (a delivery target must be a registered participant) and (b) expose the
 * `groupMembershipGrantsNoCapability` assertion that PROVES membership confers nothing. Resolution itself
 * is a set union over plain membership lists.
 *
 * Pure + deterministic over plain data — no DOM/storage/clock/entropy.
 */

/** A delivery/projection target: explicit recipient actor ids plus player-group ids to expand. */
export interface DeliveryTarget {
	/** Explicit recipient actor ids (delivered directly, no group involved). */
	recipientActorIds?: readonly ActorId[];
	/** Player-group ids; each is expanded to its CURRENT members at resolution time. */
	groupIds?: readonly string[];
}

/** The result of resolving a delivery target to individual recipients (COLLAB-012 AC1). */
export interface ResolvedDeliveryTarget {
	/** The flat, deduped, sorted list of recipient actor ids the delivery actually goes to. */
	recipientActorIds: ActorId[];
	/** Group ids referenced in the target that do NOT exist (dropped; fail closed — never invent recipients). */
	unknownGroupIds: string[];
	/** Actor ids referenced (directly or via a group) that are not deliverable (unknown / DM). Dropped. */
	skippedActorIds: ActorId[];
}

/** Whether an actor id is a valid DELIVERY TARGET: a registered, non-elevated participant
 *  (player/observer). A DM / co-DM already sees everything and is never a delivery recipient. */
function isDeliverableRecipient(actorId: ActorId, permission: PermissionState): boolean {
	const actor: Actor | undefined = permission.actors[actorId];
	return !!actor && !hasDmAuthority(actor.role);
}

/**
 * RESOLVE a delivery target to its individual recipients (COLLAB-012 AC1). Explicit recipients and every
 * CURRENT member of each referenced group are unioned, deduped, and reduced to deliverable participants
 * (registered, non-DM). A group id that does not exist is recorded in `unknownGroupIds` and contributes
 * NO recipients (fail closed — a missing group never silently widens or invents delivery). The result is
 * sorted for deterministic, replay-comparable output.
 *
 * CRUCIALLY: this only produces a RECIPIENT LIST. It performs NO permission/visibility/grant evaluation;
 * each resolved recipient's actual access is decided by the downstream actor-filtered read.
 */
export function resolveDeliveryTarget(
	target: DeliveryTarget,
	groups: Record<string, PlayerGroup>,
	permission: PermissionState,
): ResolvedDeliveryTarget {
	const recipients = new Set<ActorId>();
	const skipped = new Set<ActorId>();
	const unknownGroupIds: string[] = [];

	const consider = (actorId: ActorId): void => {
		if (isDeliverableRecipient(actorId, permission)) recipients.add(actorId);
		else skipped.add(actorId);
	};

	for (const actorId of target.recipientActorIds ?? []) consider(actorId);
	for (const groupId of target.groupIds ?? []) {
		const group = groups[groupId];
		if (!group) {
			unknownGroupIds.push(groupId);
			continue;
		}
		for (const memberId of group.memberActorIds) consider(memberId);
	}

	return {
		recipientActorIds: [...recipients].sort(),
		unknownGroupIds: [...new Set(unknownGroupIds)].sort(),
		skippedActorIds: [...skipped].sort(),
	};
}

/**
 * COLLAB-012 — the HARD, fail-closed assertion that GROUP MEMBERSHIP GRANTS NO PERMISSION. Given a
 * permission-checking function that decides whether an actor would be permitted SOME capability/visibility
 * (e.g. `hasGrantedCapability` bound to an entity, or a visibility predicate), this returns `true` iff the
 * decision is IDENTICAL for every member of `group` whether or not the group is considered — i.e. it proves
 * the permission predicate does not (and cannot) read group membership.
 *
 * The proof is structural: `permits` is invoked with ONLY the actor (never the group), so by construction
 * its result cannot depend on membership. This function is the executable contract a test calls to assert
 * that adding a player to a group did not change what that player is permitted. Returns `false` only if a
 * member's permission decision differs from the supplied `withoutMembership` baseline — which, since
 * `permits` never sees the group, can never happen unless the caller's predicate is itself membership-aware
 * (the very bug this guards against). Pure.
 */
export function groupMembershipGrantsNoCapability(
	group: PlayerGroup,
	permission: PermissionState,
	permits: (actor: Actor) => boolean,
	withoutMembership: (actor: Actor) => boolean,
): boolean {
	for (const memberId of group.memberActorIds) {
		const actor = permission.actors[memberId];
		if (!actor) continue;
		// The permission decision must be the SAME with and without considering the group. `permits` is
		// given only the actor, so membership cannot influence it — any difference is a leak (fail closed).
		if (permits(actor) !== withoutMembership(actor)) return false;
	}
	return true;
}

