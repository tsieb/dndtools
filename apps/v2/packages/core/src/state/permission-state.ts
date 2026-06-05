import type { ActorId, GrantId } from './ids';

export const PERMISSION_STATE_SCHEMA_VERSION = 1 as const;

export type ActorRole = 'dm' | 'player' | 'observer';

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
