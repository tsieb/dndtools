import type { ActorId } from '../state/ids';
import type { Actor, CapabilitySet, PermissionState } from '../state/permission-state';
import { capabilitySetGrants, inheritedCapabilitySets } from './capability-sets';
import { isGrantActive } from './grant-records';

/**
 * Whether a player (via their grants) holds a required capability on a specific entity. Inheritance
 * is applied per entity type (PERM-006): an `owner` grant on a character confers `combat-participant`,
 * `backstory-editor`, and `viewer`; a `co-editor` scene grant confers `viewer`, etc. EXPIRED grants
 * do not contribute — an expired grant is inert (PERM-004 fail-closed).
 *
 * The DM bypasses capability-set restrictions inherently (Contract 3 DM Authority); they always hold
 * every capability. This function is read-only and pure (apart from the `now` clock used to test
 * expiry, which is passed in).
 */
export function hasGrantedCapability(
	permission: PermissionState,
	actor: Actor,
	entityType: string,
	entityId: string,
	required: CapabilitySet,
	now?: string,
): boolean {
	if (actor.role === 'dm') return true;
	if (actor.role === 'observer') return false;
	for (const grant of permission.grants) {
		if (grant.playerActorId !== actor.id) continue;
		if (grant.entityType !== entityType) continue;
		if (grant.entityId !== entityId) continue;
		if (!isGrantActive(grant, now)) continue;
		if (capabilitySetGrants(entityType, grant.capabilitySet, required)) return true;
	}
	return false;
}

/**
 * The full set of capability sets a player effectively holds on one entity, after applying
 * inheritance to every ACTIVE grant the player has on that entity (PERM-006). Expired grants are
 * excluded. The DM holds every capability set defined for the entity type implicitly, but this
 * function reports only grant-derived sets for players; callers treat the DM via role, not grants.
 *
 * Returned sets are deduped. Used by the effective-permission surface and the per-entity preview.
 */
export function effectiveCapabilitySetsForActorOnEntity(
	permission: PermissionState,
	actorId: ActorId,
	entityType: string,
	entityId: string,
	now?: string,
): CapabilitySet[] {
	const result = new Set<CapabilitySet>();
	for (const grant of permission.grants) {
		if (grant.playerActorId !== actorId) continue;
		if (grant.entityType !== entityType) continue;
		if (grant.entityId !== entityId) continue;
		if (!isGrantActive(grant, now)) continue;
		for (const set of inheritedCapabilitySets(entityType, grant.capabilitySet)) {
			result.add(set);
		}
	}
	return [...result];
}

export function actorCanAuthorScene(actor: Actor | undefined): boolean {
	return !!actor && actor.role === 'dm';
}

export function actorCanCoEditScene(
	permission: PermissionState,
	actorId: ActorId,
	sceneId: string,
	now?: string,
): boolean {
	const actor = permission.actors[actorId];
	if (!actor) return false;
	if (actor.role === 'dm') return true;
	return hasGrantedCapability(permission, actor, 'scene', sceneId, 'co-editor', now);
}
