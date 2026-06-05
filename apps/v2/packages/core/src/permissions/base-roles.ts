import type { ActorId } from '../state/ids';
import type {
	Actor,
	ActorRole,
	CapabilitySet,
	PermissionGrant,
	PermissionState,
} from '../state/permission-state';

/**
 * PERM-001 / PERM-011 — base-role floor + observer ceiling computation.
 *
 * This is pure Processing-Core permission policy (Architecture Contract 3, Base Roles). The GUI
 * MUST consume the computed permission set; it MUST NOT compute or override permissions itself.
 *
 * Fail-closed posture, in order of evaluation:
 *
 *   1. Resolve a single base role for the participant. Any state that yields zero or multiple
 *      base roles is normalized to the LEAST privileged interpretation (`observer`). An
 *      unauthenticated participant has no role and is denied — no anonymous role is inferred.
 *   2. Compute a base permission floor purely from that role.
 *   3. Union additive grants, but cap them by the role ceiling. Grants can only ever add
 *      permissions WITHIN what the role permits. A grant that would exceed the ceiling is
 *      dropped and recorded as a consistency error surfaced to the DM.
 *
 * For Observers specifically, the ceiling is the floor: read-only, no character data, no writes.
 * No grant record — stale, invalid, conflicting, write-granting, or forged — can ever elevate an
 * Observer. The drop happens regardless of grant validity.
 */

/** The kinds of action a capability authorizes, independent of entity. */
export type PermissionAction = 'read' | 'write';

/**
 * The least-privileged base role. When role assignment is ambiguous (zero or multiple base
 * roles), computation fails closed to this role. Observer is read-only with no character data.
 */
export const LEAST_PRIVILEGED_ROLE: ActorRole = 'observer';

/** Ordering of roles from most to least privileged. Lower number = more authority. */
const ROLE_PRIVILEGE_RANK: Record<ActorRole, number> = {
	dm: 0,
	player: 1,
	observer: 2,
};

/**
 * A single, possibly-conflicting role assignment record for a participant. Real session state
 * should only ever carry one of these per participant, but stale/forged/duplicated records can
 * appear in storage or sync streams. `resolveBaseRole` is the choke point that normalizes any
 * such set down to exactly one base role, failing closed.
 */
export interface RoleAssignmentRecord {
	actorId: ActorId;
	role: ActorRole;
}

export type BaseRoleResolutionReason =
	| 'single-role'
	| 'no-role-record'
	| 'conflicting-roles'
	| 'unknown-role'
	| 'unauthenticated';

/**
 * The outcome of normalizing a participant's role records to exactly one base role.
 *
 * `authenticated` is false only when the participant has no identity at all (PERM-001 AC2: no
 * anonymous role is inferred and access is denied). A participant with an identity but ambiguous
 * or missing role records is still authenticated; they are simply pinned to the least-privileged
 * role and flagged so the DM can repair the inconsistency.
 */
export interface BaseRoleResolution {
	actorId: ActorId | null;
	role: ActorRole;
	authenticated: boolean;
	/** True when the records did not unambiguously yield exactly one valid role. */
	normalized: boolean;
	reason: BaseRoleResolutionReason;
}

const VALID_ROLES: ReadonlySet<string> = new Set<ActorRole>(['dm', 'player', 'observer']);

function isValidRole(role: unknown): role is ActorRole {
	return typeof role === 'string' && VALID_ROLES.has(role);
}

/**
 * Resolve exactly one base role for a participant from a set of (possibly conflicting) role
 * records. Fails closed:
 *
 *   - No authenticated identity → denied, `observer` floor, not authenticated.
 *   - No valid role record → `observer`, normalized.
 *   - Exactly one valid role → that role.
 *   - Multiple distinct valid roles → the LEAST privileged of them, normalized. We never pick the
 *     most privileged interpretation of conflicting state.
 *   - Any unknown/invalid role value → ignored; if nothing valid remains, `observer`.
 */
export function resolveBaseRole(
	actorId: ActorId | null | undefined,
	records: readonly RoleAssignmentRecord[],
): BaseRoleResolution {
	if (actorId === null || actorId === undefined || actorId === '') {
		return {
			actorId: null,
			role: LEAST_PRIVILEGED_ROLE,
			authenticated: false,
			normalized: true,
			reason: 'unauthenticated',
		};
	}

	const ownRecords = records.filter((record) => record.actorId === actorId);
	const validRoles = ownRecords.map((record) => record.role).filter(isValidRole);
	const hadInvalid = ownRecords.length > validRoles.length;
	const distinct = Array.from(new Set(validRoles));

	if (distinct.length === 0) {
		return {
			actorId,
			role: LEAST_PRIVILEGED_ROLE,
			authenticated: true,
			normalized: true,
			reason: hadInvalid ? 'unknown-role' : 'no-role-record',
		};
	}

	if (distinct.length === 1) {
		// A single valid role. Still flag if invalid records were dropped alongside it so the
		// DM can clean up forged/stale entries, but the role itself is unambiguous.
		const role = distinct[0]!;
		return {
			actorId,
			role,
			authenticated: true,
			normalized: hadInvalid,
			reason: hadInvalid ? 'unknown-role' : 'single-role',
		};
	}

	// Conflicting roles: pick the least privileged interpretation (highest rank number).
	const leastPrivileged = distinct.reduce((acc, role) =>
		ROLE_PRIVILEGE_RANK[role] > ROLE_PRIVILEGE_RANK[acc] ? role : acc,
	);
	return {
		actorId,
		role: leastPrivileged,
		authenticated: true,
		normalized: true,
		reason: 'conflicting-roles',
	};
}

/**
 * Derive the canonical role records for a participant from `PermissionState`. The `Actor` model
 * carries a single role today, but this indirection keeps the ambiguity-handling choke point in
 * one place so adversarial multi-record state (from sync/storage) resolves the same way.
 */
export function roleRecordsForActor(
	permissions: PermissionState,
	actorId: ActorId,
): RoleAssignmentRecord[] {
	const actor: Actor | undefined = permissions.actors[actorId];
	if (!actor) return [];
	return [{ actorId, role: actor.role }];
}

/**
 * The base permission floor computed purely from a role. This is a capability surface, not a list
 * of grants. Higher roles strictly dominate lower roles.
 *
 *   - `canWrite`: may the role ever hold a write-capable capability (before grants)?
 *   - `canReadCharacterData`: may the role ever see character entity data at all?
 *   - `maxGrantAction`: the strongest action a grant may add. Observers are capped at `read`,
 *     so any write-capable grant is dropped.
 *   - `allowsCharacterGrants`: may a grant ever target character data for this role? Observers
 *     never receive character data, so character grants are dropped.
 */
export interface BasePermissionFloor {
	role: ActorRole;
	canWrite: boolean;
	canReadCharacterData: boolean;
	readOnly: boolean;
	maxGrantAction: PermissionAction;
	allowsCharacterGrants: boolean;
}

const ROLE_FLOORS: Record<ActorRole, Omit<BasePermissionFloor, 'role'>> = {
	dm: {
		canWrite: true,
		canReadCharacterData: true,
		readOnly: false,
		maxGrantAction: 'write',
		allowsCharacterGrants: true,
	},
	player: {
		canWrite: true,
		canReadCharacterData: true,
		readOnly: false,
		maxGrantAction: 'write',
		allowsCharacterGrants: true,
	},
	// Observer ceiling: read-only, never character data, grants capped at read and never on
	// characters. This object is the single source of the observer ceiling.
	observer: {
		canWrite: false,
		canReadCharacterData: false,
		readOnly: true,
		maxGrantAction: 'read',
		allowsCharacterGrants: false,
	},
};

/** Compute the base permission floor purely from a role. Pure function of the role alone. */
export function computeBasePermissionFloor(role: ActorRole): BasePermissionFloor {
	return { role, ...ROLE_FLOORS[role] };
}

/**
 * Capability sets that imply (or are) write/operate capability. Anything not in the read-only set
 * is treated as write-capable and therefore exceeds the Observer ceiling. We allowlist the
 * read-only sets rather than denylisting writes so an unknown/forged capability set fails closed
 * to "write-capable" and is dropped for observers.
 */
const READ_ONLY_CAPABILITY_SETS: ReadonlySet<string> = new Set<CapabilitySet>(['viewer']);

/** Entity types that carry character data and must never reach an Observer. */
const CHARACTER_ENTITY_TYPES: ReadonlySet<string> = new Set(['character', 'character-field']);

/** True when a capability set authorizes any write/operate action (i.e. is not read-only). */
export function isWriteCapableCapabilitySet(capabilitySet: CapabilitySet): boolean {
	return !READ_ONLY_CAPABILITY_SETS.has(capabilitySet);
}

/** True when an entity type carries character data. */
export function isCharacterEntityType(entityType: string): boolean {
	return CHARACTER_ENTITY_TYPES.has(entityType);
}

export type DroppedGrantReason =
	| 'observer-write-grant'
	| 'observer-character-grant'
	| 'exceeds-role-ceiling';

/** A grant that was dropped because it would exceed the resolved role's ceiling. */
export interface DroppedGrant {
	grantId: PermissionGrant['id'];
	entityType: PermissionGrant['entityType'];
	entityId: PermissionGrant['entityId'];
	playerActorId: ActorId;
	capabilitySet: CapabilitySet;
	reason: DroppedGrantReason;
}

/**
 * The fully computed, fail-closed effective permission surface for one participant. This is the
 * object the GUI consumes. It never contains a write-capable or character grant for an Observer,
 * regardless of the input grant records.
 */
export interface EffectivePermissions {
	actorId: ActorId | null;
	role: ActorRole;
	authenticated: boolean;
	floor: BasePermissionFloor;
	/** Effective surface after applying the floor and capping grants by the ceiling. */
	canWrite: boolean;
	canReadCharacterData: boolean;
	readOnly: boolean;
	/** Grants that survived the ceiling and are additive over the floor. */
	effectiveGrants: PermissionGrant[];
	/** Grants dropped because they would exceed the resolved role's ceiling. */
	droppedGrants: DroppedGrant[];
	/** True when role resolution had to normalize ambiguous/missing/invalid role state. */
	roleNormalized: boolean;
	roleResolutionReason: BaseRoleResolutionReason;
}

function dropGrant(grant: PermissionGrant, reason: DroppedGrantReason): DroppedGrant {
	return {
		grantId: grant.id,
		entityType: grant.entityType,
		entityId: grant.entityId,
		playerActorId: grant.playerActorId,
		capabilitySet: grant.capabilitySet,
		reason,
	};
}

/**
 * Decide whether a single grant survives the role ceiling. Grants are additive but capped:
 *
 *   - DM: grants are irrelevant (DM authority is inherent), but they never elevate beyond DM and
 *     are kept as-is for completeness.
 *   - Player: may receive read or write grants on any entity type within their floor.
 *   - Observer: every write-capable grant and every character grant is dropped. A read-only,
 *     non-character grant (e.g. a `viewer` grant on a shared scene) may survive, because it does
 *     not elevate beyond the read-only, no-character ceiling.
 *
 * Unknown capability sets fail closed to write-capable, so a forged/garbage capability set on an
 * Observer is always dropped.
 */
function grantSurvivesCeiling(
	floor: BasePermissionFloor,
	grant: PermissionGrant,
): DroppedGrantReason | null {
	const writeCapable = isWriteCapableCapabilitySet(grant.capabilitySet);
	const character = isCharacterEntityType(grant.entityType);

	if (character && !floor.allowsCharacterGrants) {
		return floor.role === 'observer' ? 'observer-character-grant' : 'exceeds-role-ceiling';
	}
	if (writeCapable && floor.maxGrantAction === 'read') {
		return floor.role === 'observer' ? 'observer-write-grant' : 'exceeds-role-ceiling';
	}
	return null;
}

/**
 * Compute the effective permission surface for a participant from resolved role records plus the
 * grant set. This is the primary PERM-001/PERM-011 entry point.
 *
 * Order is load-bearing: the base role floor is computed FIRST and caps everything. Grants are
 * only ever applied within the ceiling the floor permits. An Observer's surface is therefore
 * always read-only with no character data, even if the grant set contains stale, invalid,
 * conflicting, or write-granting records for that observer.
 */
export function computeEffectivePermissions(
	actorId: ActorId | null | undefined,
	roleRecords: readonly RoleAssignmentRecord[],
	grants: readonly PermissionGrant[],
): EffectivePermissions {
	const resolution = resolveBaseRole(actorId, roleRecords);
	const floor = computeBasePermissionFloor(resolution.role);

	const effectiveGrants: PermissionGrant[] = [];
	const droppedGrants: DroppedGrant[] = [];

	// An unauthenticated participant gets no grants at all — no anonymous role is inferred.
	const candidateGrants = resolution.authenticated
		? grants.filter((grant) => grant.playerActorId === resolution.actorId)
		: [];

	for (const grant of candidateGrants) {
		const dropReason = grantSurvivesCeiling(floor, grant);
		if (dropReason) {
			droppedGrants.push(dropGrant(grant, dropReason));
		} else {
			effectiveGrants.push(grant);
		}
	}

	// The effective surface starts at the floor. Surviving grants are additive, but they can
	// never lift `canWrite`/`canReadCharacterData` above the floor's ceiling because any grant
	// that would do so was already dropped above.
	const grantAddsWrite = effectiveGrants.some((grant) =>
		isWriteCapableCapabilitySet(grant.capabilitySet),
	);
	const grantAddsCharacter = effectiveGrants.some((grant) =>
		isCharacterEntityType(grant.entityType),
	);

	const canWrite = floor.canWrite || (floor.maxGrantAction === 'write' && grantAddsWrite);
	const canReadCharacterData =
		floor.canReadCharacterData || (floor.allowsCharacterGrants && grantAddsCharacter);

	return {
		actorId: resolution.actorId,
		role: resolution.role,
		authenticated: resolution.authenticated,
		floor,
		canWrite,
		canReadCharacterData,
		readOnly: !canWrite,
		effectiveGrants,
		droppedGrants,
		roleNormalized: resolution.normalized,
		roleResolutionReason: resolution.reason,
	};
}

/**
 * Convenience wrapper that computes the effective permissions for an actor directly from
 * `PermissionState`. Resolves the actor's role records and applies the whole grant set.
 */
export function computeEffectivePermissionsForActor(
	permissions: PermissionState,
	actorId: ActorId | null | undefined,
): EffectivePermissions {
	const records =
		actorId !== null && actorId !== undefined && actorId !== ''
			? roleRecordsForActor(permissions, actorId)
			: [];
	return computeEffectivePermissions(actorId ?? null, records, permissions.grants);
}
