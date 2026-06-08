import type { ActorId, GrantId } from '../state/ids';
import type { CapabilitySet, PermissionGrant, PermissionState } from '../state/permission-state';
import {
	hasCapabilitySchemaForEntityType,
	isKnownCapabilitySet,
	singularOwnershipCapabilityFor,
} from './capability-schema';

/**
 * PERM-004 / PERM-013 — pure grant-record validation, expiry, and grant-list mutation primitives
 * (Architecture Contract 3, Axis 2 Permission Grants).
 *
 * The Processing Core owns durable grant semantics. These pure functions are the reducers the
 * grant/transfer command handlers compose; they never touch storage and they fail CLOSED:
 *
 *   - A grant referencing an unknown capability set for its entity type is rejected (PERM-005).
 *   - A grant referencing an entity type with no capability schema is rejected.
 *   - A grant on an Observer is rejected (Observers cannot receive write/character grants;
 *     read-only `viewer` grants are still pointless for an Observer and are rejected here so the
 *     command surface is unambiguous — Contract 3 Base Roles rule 3).
 *   - A grant for an unknown/DM actor is rejected.
 *   - An expired grant is INERT: it confers nothing and is excluded from the effective surface.
 *   - A transfer of a singular capability (e.g. character `owner`) atomically revokes the previous
 *     holder's grant as it issues the new one, so there is never a window with zero or two owners.
 */

/** A reason a grant record was rejected at validation time. */
export type GrantValidationError =
	| 'unknown-entity-type'
	| 'unknown-capability-set'
	| 'unknown-actor'
	| 'observer-cannot-receive-grant'
	| 'dm-needs-no-grant'
	| 'invalid-expiry'
	| 'expiry-in-past'
	| 'already-has-owner';

export type GrantValidationResult =
	| { ok: true }
	| { ok: false; error: GrantValidationError; message: string };

/** The author-supplied fields needed to validate/create a grant (PERM-004 grant record). */
export interface GrantRecordInput {
	entityType: string;
	entityId: string;
	playerActorId: ActorId;
	capabilitySet: CapabilitySet;
	/** Optional ISO expiry; absent/null ⇒ never expires. Must parse and be in the future. */
	expiresAt?: string | null;
}

function isParseableIso(value: string): boolean {
	const ms = Date.parse(value);
	return Number.isFinite(ms);
}

/**
 * Validate a candidate grant against the system schema and participant state. Fails closed: any
 * structural/role/expiry problem is a typed rejection, never a silently-accepted grant. `now` (the
 * clock) is required only when an expiry is supplied so a past expiry can be rejected up front.
 */
export function validateGrantRecord(
	permissions: PermissionState,
	input: GrantRecordInput,
	now?: string,
): GrantValidationResult {
	if (!hasCapabilitySchemaForEntityType(input.entityType)) {
		return {
			ok: false,
			error: 'unknown-entity-type',
			message: `No capability schema is defined for entity type "${input.entityType}".`,
		};
	}
	if (!isKnownCapabilitySet(input.entityType, input.capabilitySet)) {
		return {
			ok: false,
			error: 'unknown-capability-set',
			message: `Capability set "${input.capabilitySet}" is not defined for entity type "${input.entityType}".`,
		};
	}
	const actor = permissions.actors[input.playerActorId];
	if (!actor) {
		return {
			ok: false,
			error: 'unknown-actor',
			message: `Grant target "${input.playerActorId}" is not a registered participant.`,
		};
	}
	if (actor.role === 'observer') {
		return {
			ok: false,
			error: 'observer-cannot-receive-grant',
			message: 'Observers cannot receive grants. Change the participant to a Player first.',
		};
	}
	if (actor.role === 'dm') {
		return {
			ok: false,
			error: 'dm-needs-no-grant',
			message: 'The DM has full authority and does not receive grants.',
		};
	}
	if (input.expiresAt != null) {
		if (!isParseableIso(input.expiresAt)) {
			return {
				ok: false,
				error: 'invalid-expiry',
				message: `Grant expiry "${input.expiresAt}" is not a valid ISO timestamp.`,
			};
		}
		if (now != null && Date.parse(input.expiresAt) <= Date.parse(now)) {
			return {
				ok: false,
				error: 'expiry-in-past',
				message: 'Grant expiry must be in the future.',
			};
		}
	}
	return { ok: true };
}

/**
 * CHAR-003 AC2 — Check whether a plain `permission.grant-capability-set` command would create a
 * second holder of a singular-ownership capability (e.g. character `owner`). Returns a rejection
 * result if a DIFFERENT player already holds an active grant for this entity/capability, or `null`
 * if the grant may proceed. This check does NOT apply to `permission.transfer-ownership`, which is
 * the explicit semantic for changing ownership atomically (PERM-013).
 */
export function checkSingularOwnershipConflict(
	permissions: PermissionState,
	input: GrantRecordInput,
	now?: string,
): GrantValidationResult {
	const singular = singularOwnershipCapabilityFor(input.entityType);
	if (!singular || input.capabilitySet !== singular) return { ok: true };
	const conflicting = permissions.grants.find(
		(g) =>
			g.entityType === input.entityType &&
			g.entityId === input.entityId &&
			g.capabilitySet === singular &&
			g.playerActorId !== input.playerActorId &&
			isGrantActive(g, now),
	);
	if (conflicting) {
		return {
			ok: false,
			error: 'already-has-owner',
			message:
				'This character already has an owner. Use the permission.transfer-ownership command to transfer ownership.',
		};
	}
	return { ok: true };
}

/**
 * Whether a grant is currently ACTIVE (not expired) relative to `now`. A grant with no expiry is
 * always active. A grant whose expiry is at or before `now` is inert. Fails closed: an unparseable
 * expiry is treated as expired (inert), never as never-expiring. When `now` is omitted, only the
 * presence/validity of the expiry is considered and a parseable future-or-not expiry is active —
 * callers that care about expiry MUST pass `now`.
 */
export function isGrantActive(grant: PermissionGrant, now?: string): boolean {
	if (grant.expiresAt == null) return true;
	const expiresMs = Date.parse(grant.expiresAt);
	if (!Number.isFinite(expiresMs)) return false; // unparseable expiry ⇒ inert (fail closed)
	if (now == null) return true;
	const nowMs = Date.parse(now);
	if (!Number.isFinite(nowMs)) return false; // unparseable clock ⇒ fail closed
	return expiresMs > nowMs;
}

/** True when the grant is expired relative to `now`. Convenience inverse of {@link isGrantActive}. */
export function isGrantExpired(grant: PermissionGrant, now: string): boolean {
	return grant.expiresAt != null && !isGrantActive(grant, now);
}

/** Build a fully-formed grant record from validated input plus author/clock/id. */
export function buildGrantRecord(
	input: GrantRecordInput,
	meta: { id: GrantId; createdBy: ActorId; now: string },
): PermissionGrant {
	return {
		id: meta.id,
		entityType: input.entityType,
		entityId: input.entityId,
		playerActorId: input.playerActorId,
		capabilitySet: input.capabilitySet,
		createdBy: meta.createdBy,
		createdAt: meta.now,
		updatedAt: meta.now,
		expiresAt: input.expiresAt ?? null,
	};
}

/**
 * Add or replace a grant in the grant list. If a non-expired grant already exists for the same
 * (entity, player, capabilitySet) it is REPLACED in place (idempotent re-grant / expiry update);
 * otherwise the new grant is appended. Pure: returns a new array, never mutates the input.
 */
export function upsertGrant(
	grants: readonly PermissionGrant[],
	grant: PermissionGrant,
): PermissionGrant[] {
	const matchIndex = grants.findIndex(
		(existing) =>
			existing.entityType === grant.entityType &&
			existing.entityId === grant.entityId &&
			existing.playerActorId === grant.playerActorId &&
			existing.capabilitySet === grant.capabilitySet,
	);
	if (matchIndex === -1) return [...grants, grant];
	const next = [...grants];
	next[matchIndex] = { ...grant, id: grants[matchIndex]!.id, createdAt: grants[matchIndex]!.createdAt };
	return next;
}

/** Remove a grant by id. Pure. */
export function revokeGrantById(
	grants: readonly PermissionGrant[],
	grantId: GrantId,
): PermissionGrant[] {
	return grants.filter((grant) => grant.id !== grantId);
}

/**
 * The grants that confer the singular capability (e.g. `owner`) on one entity, held by anyone OTHER
 * than `exceptPlayerActorId`. Used by transfer to find the prior holder(s) to revoke atomically.
 * Includes both active and expired records so a stale prior-owner grant is also cleared.
 */
export function singularGrantsOnEntity(
	grants: readonly PermissionGrant[],
	entityType: string,
	entityId: string,
	exceptPlayerActorId?: ActorId,
): PermissionGrant[] {
	const singular = singularOwnershipCapabilityFor(entityType);
	if (!singular) return [];
	return grants.filter(
		(grant) =>
			grant.entityType === entityType &&
			grant.entityId === entityId &&
			grant.capabilitySet === singular &&
			grant.playerActorId !== exceptPlayerActorId,
	);
}

/** A typed reason a transfer of a singular capability was rejected. */
export type TransferValidationError =
	| GrantValidationError
	| 'not-singular-capability'
	| 'already-holder';

export type TransferValidationResult =
	| { ok: true }
	| { ok: false; error: TransferValidationError; message: string };

/**
 * Validate a transfer of the singular capability for an entity type to a new holder. The capability
 * MUST be the singular-by-ownership set for the entity type (e.g. character `owner`); transfers
 * apply only to singular assignments (PERM-013). The new holder must pass the same grant validation
 * as PERM-004. Fails closed.
 */
export function validateOwnershipTransfer(
	permissions: PermissionState,
	input: GrantRecordInput,
	now?: string,
): TransferValidationResult {
	const singular = singularOwnershipCapabilityFor(input.entityType);
	if (!singular || input.capabilitySet !== singular) {
		return {
			ok: false,
			error: 'not-singular-capability',
			message: `Capability set "${input.capabilitySet}" is not a transferable singular ownership capability for "${input.entityType}".`,
		};
	}
	return validateGrantRecord(permissions, input, now);
}

/** The result of computing an atomic ownership transfer over a grant list. */
export interface OwnershipTransferResult {
	/** The next grant list: prior singular holders revoked, new holder's grant present. */
	grants: PermissionGrant[];
	/** Grant ids revoked from prior holders in the same operation. */
	revokedGrantIds: GrantId[];
	/** The grant id of the new holder's singular grant. */
	newGrantId: GrantId;
	/** Actor ids whose effective capabilities changed (prior holders + new holder). */
	affectedActorIds: ActorId[];
}

/**
 * Compute an ATOMIC singular-capability transfer: revoke EVERY prior holder's singular grant for the
 * entity and issue the new holder's singular grant in ONE returned grant list. There is never a
 * window with zero or two holders, because the revoke and the issue are applied to the same array in
 * a single pure step. The new holder's grant replaces any existing same-key grant (idempotent).
 *
 * `meta.id` is the id for the new holder's grant (or reused if one already exists for that holder).
 */
export function computeOwnershipTransfer(
	grants: readonly PermissionGrant[],
	input: GrantRecordInput,
	meta: { id: GrantId; createdBy: ActorId; now: string },
): OwnershipTransferResult {
	// Find prior holders to revoke (everyone except the new holder).
	const priorHolderGrants = singularGrantsOnEntity(
		grants,
		input.entityType,
		input.entityId,
		input.playerActorId,
	);
	const revokedGrantIds = priorHolderGrants.map((grant) => grant.id);
	const revokedSet = new Set(revokedGrantIds);

	// Remove all prior-holder singular grants first.
	const afterRevoke = grants.filter((grant) => !revokedSet.has(grant.id));

	// Then upsert the new holder's singular grant into the SAME list — one atomic transition.
	const newGrant = buildGrantRecord(input, meta);
	const afterIssue = upsertGrant(afterRevoke, newGrant);
	// The upsert may have reused an existing grant id for the new holder; resolve the final id.
	const finalNewGrant = afterIssue.find(
		(grant) =>
			grant.entityType === input.entityType &&
			grant.entityId === input.entityId &&
			grant.playerActorId === input.playerActorId &&
			grant.capabilitySet === input.capabilitySet,
	)!;

	const affected = new Set<ActorId>([input.playerActorId]);
	for (const grant of priorHolderGrants) affected.add(grant.playerActorId);

	return {
		grants: afterIssue,
		revokedGrantIds,
		newGrantId: finalNewGrant.id,
		affectedActorIds: [...affected],
	};
}
