import type { ActorId, GrantId } from './ids';

export const PERMISSION_STATE_SCHEMA_VERSION = 1 as const;

/**
 * Base roles, most to least privileged. `co-dm` is the trusted elevated seat: it carries full
 * DM-grade READ visibility (dm-only scenes/notes/maps/combatants are visible) and DM-grade
 * AUTHORING authority, but NEVER the campaign-owner powers — granting/revoking permissions,
 * changing roles, transferring ownership, or minting invites stay with the owner DM
 * ({@link isCampaignOwnerRole}). Policy code must gate on {@link hasDmAuthority} for
 * elevated read/author checks and on {@link isCampaignOwnerRole} for owner-scoped checks.
 */
export type ActorRole = 'dm' | 'co-dm' | 'player' | 'observer';

/**
 * DM-level authority: full read visibility + DM-grade authoring. True for the campaign-owner DM
 * and for a co-DM. Accepts any string-ish input and fails closed for unknown values.
 */
export function hasDmAuthority(role: ActorRole | string | null | undefined): boolean {
	return role === 'dm' || role === 'co-dm';
}

/**
 * Campaign-owner powers (role assignment, permission grants/revokes/transfers, invites, vault /
 * account / sync settings, campaign deletion): the DM only — NEVER a co-DM. Fails closed.
 */
export function isCampaignOwnerRole(role: ActorRole | string | null | undefined): boolean {
	return role === 'dm';
}

export interface Actor {
	id: ActorId;
	role: ActorRole;
	displayName: string;
}

export type SceneCapabilitySet = 'co-editor' | 'viewer';
export type WidgetCapabilitySet = 'manager' | 'operator' | 'viewer';
export type CapabilitySet = SceneCapabilitySet | WidgetCapabilitySet | string;

export interface PermissionGrant {
	id: GrantId;
	entityType: 'scene' | 'widget' | 'character' | 'note' | 'note-section' | string;
	entityId: string;
	playerActorId: ActorId;
	capabilitySet: CapabilitySet;
	/** The DM (author) who created the grant. Grants are DM-authored only (Contract 3). */
	createdBy: ActorId;
	createdAt: string;
	/**
	 * Last time the grant record was authored/updated. Optional for backward compatibility with
	 * grants persisted before PERM-004 added it; absent ⇒ treat as equal to `createdAt`.
	 */
	updatedAt?: string;
	/**
	 * Optional ISO expiry. When set and in the past relative to the evaluation clock, the grant is
	 * inert: it confers no capabilities and is excluded from the effective surface (PERM-004).
	 * Absent or `null` ⇒ the grant does not expire.
	 */
	expiresAt?: string | null;
}

export interface PermissionState {
	actors: Record<ActorId, Actor>;
	grants: PermissionGrant[];
	schemaVersion: typeof PERMISSION_STATE_SCHEMA_VERSION;
}

export const EMPTY_PERMISSION_STATE: PermissionState = Object.freeze({
	actors: {},
	grants: [],
	schemaVersion: PERMISSION_STATE_SCHEMA_VERSION,
});

export function getActor(state: PermissionState, actorId: ActorId): Actor | undefined {
	return state.actors[actorId];
}

/** How many actors currently hold the `co-dm` role (for seat-entitlement checks). */
export function countCoDmActors(state: PermissionState): number {
	return Object.values(state.actors).filter((actor) => actor.role === 'co-dm').length;
}
