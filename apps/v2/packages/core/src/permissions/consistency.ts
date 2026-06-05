import type { ActorId } from '../state/ids';
import type { PermissionGrant, PermissionState } from '../state/permission-state';
import {
	computeEffectivePermissionsForActor,
	resolveBaseRole,
	roleRecordsForActor,
	type DroppedGrantReason,
} from './base-roles';

/**
 * PERM-011 (and the PERM-001 side of PERM-007) — DM-facing permission consistency audit.
 *
 * When a grant cannot be honored because it would exceed a participant's role ceiling (most
 * importantly an Observer write/character grant), the grant is ignored by the permission core and
 * a consistency error is surfaced HERE so the DM can repair it. The error message is generic and
 * MUST NOT leak hidden entity titles or field values; it carries only the entity reference, the
 * grant, and a remediation hint.
 *
 * This audit is read-only and pure. It does not mutate grants; dropping is enforced at
 * computation time by `computeEffectivePermissions`. The audit reports what was dropped and why.
 */

export type PermissionConsistencyProblemKind =
	| 'observer-write-grant'
	| 'observer-character-grant'
	| 'grant-exceeds-role-ceiling'
	| 'ambiguous-base-role'
	| 'orphan-grant-actor';

export type PermissionConsistencySeverity = 'error' | 'warning';

export interface PermissionConsistencyProblem {
	kind: PermissionConsistencyProblemKind;
	severity: PermissionConsistencySeverity;
	/** The participant the problem concerns. Never a display name. */
	actorId: ActorId;
	role: string;
	/** Present for grant-scoped problems. */
	grantId: PermissionGrant['id'] | null;
	entityType: string | null;
	entityId: string | null;
	capabilitySet: string | null;
	/** Generic, non-leaking remediation hint for the DM. */
	remediation: string;
}

export interface PermissionConsistencyReport {
	kind: 'permission-consistency';
	problems: PermissionConsistencyProblem[];
	hasErrors: boolean;
}

const DROP_REASON_TO_PROBLEM: Record<
	DroppedGrantReason,
	{ kind: PermissionConsistencyProblemKind; remediation: string }
> = {
	'observer-write-grant': {
		kind: 'observer-write-grant',
		remediation:
			'Observers cannot hold write grants. Remove this grant or change the participant role to Player.',
	},
	'observer-character-grant': {
		kind: 'observer-character-grant',
		remediation:
			'Observers cannot access character data. Remove this grant or change the participant role to Player.',
	},
	'exceeds-role-ceiling': {
		kind: 'grant-exceeds-role-ceiling',
		remediation:
			'This grant exceeds the participant role ceiling and was ignored. Remove it or adjust the role.',
	},
};

/**
 * Audit a single actor's grants against their resolved base role and report any grant that was
 * dropped because it would exceed the role ceiling. Used by `auditPermissionConsistency` and
 * directly testable for adversarial observer grants.
 */
export function auditActorGrantConsistency(
	permissions: PermissionState,
	actorId: ActorId,
): PermissionConsistencyProblem[] {
	const effective = computeEffectivePermissionsForActor(permissions, actorId);
	const problems: PermissionConsistencyProblem[] = [];

	if (effective.roleNormalized && effective.roleResolutionReason === 'conflicting-roles') {
		problems.push({
			kind: 'ambiguous-base-role',
			severity: 'error',
			actorId,
			role: effective.role,
			grantId: null,
			entityType: null,
			entityId: null,
			capabilitySet: null,
			remediation:
				'This participant has conflicting role records and was pinned to the least-privileged role. Assign exactly one base role.',
		});
	}

	for (const dropped of effective.droppedGrants) {
		const mapped = DROP_REASON_TO_PROBLEM[dropped.reason];
		problems.push({
			kind: mapped.kind,
			severity: 'error',
			actorId,
			role: effective.role,
			grantId: dropped.grantId,
			entityType: dropped.entityType,
			entityId: dropped.entityId,
			capabilitySet: dropped.capabilitySet,
			remediation: mapped.remediation,
		});
	}

	return problems;
}

/**
 * Audit the whole permission state for fail-closed consistency problems that the DM must see:
 * dropped observer write/character grants, grants that exceed any role ceiling, ambiguous base
 * roles, and grants whose actor does not exist. Pure and read-only.
 */
export function auditPermissionConsistency(
	permissions: PermissionState,
): PermissionConsistencyReport {
	const problems: PermissionConsistencyProblem[] = [];

	for (const actorId of Object.keys(permissions.actors)) {
		problems.push(...auditActorGrantConsistency(permissions, actorId));
	}

	// Grants that reference an actor with no record at all. These can never be honored (no
	// resolvable role) and are reported so the DM can remove the stale grant.
	for (const grant of permissions.grants) {
		if (!permissions.actors[grant.playerActorId]) {
			problems.push({
				kind: 'orphan-grant-actor',
				severity: 'warning',
				actorId: grant.playerActorId,
				role: 'observer',
				grantId: grant.id,
				entityType: grant.entityType,
				entityId: grant.entityId,
				capabilitySet: grant.capabilitySet,
				remediation:
					'This grant references a participant who is not in the session. Remove the stale grant.',
			});
		}
	}

	return {
		kind: 'permission-consistency',
		problems,
		hasErrors: problems.some((problem) => problem.severity === 'error'),
	};
}

/**
 * PERM-011 AC2 — character-data read guard. The Processing Core must return NO character fields to
 * an Observer when they request character data by id, regardless of any grant record. This is the
 * fail-closed read filter the query/binding layer calls before returning character data.
 *
 * Returns `granted` only when the resolved effective surface allows reading character data
 * (DM/Player floors, or a player with a surviving character grant). For an Observer it is ALWAYS
 * denied — an observer character grant is dropped at computation time, so it can never reach here.
 */
export type CharacterReadDecision =
	| { kind: 'granted' }
	| { kind: 'denied'; reason: 'observer-no-character-data' | 'unauthenticated' | 'unknown-actor' };

export function decideCharacterDataRead(
	permissions: PermissionState,
	actorId: ActorId | null | undefined,
): CharacterReadDecision {
	if (actorId === null || actorId === undefined || actorId === '') {
		return { kind: 'denied', reason: 'unauthenticated' };
	}
	if (!permissions.actors[actorId]) {
		return { kind: 'denied', reason: 'unknown-actor' };
	}
	const resolution = resolveBaseRole(actorId, roleRecordsForActor(permissions, actorId));
	const effective = computeEffectivePermissionsForActor(permissions, actorId);
	if (resolution.role === 'observer' || !effective.canReadCharacterData) {
		return { kind: 'denied', reason: 'observer-no-character-data' };
	}
	return { kind: 'granted' };
}

/**
 * Apply the character-data read guard to a character record. Returns the record only when the
 * actor may read character data; otherwise returns `null` (no character fields are returned). The
 * generic typing keeps this usable by the binding/query layer without it knowing the character
 * shape — it only enforces the fail-closed omit.
 */
export function readCharacterDataForActor<T>(
	permissions: PermissionState,
	actorId: ActorId | null | undefined,
	characterData: T,
): T | null {
	return decideCharacterDataRead(permissions, actorId).kind === 'granted' ? characterData : null;
}
