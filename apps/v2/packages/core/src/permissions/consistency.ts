import type { ActorId } from '../state/ids';
import type { PermissionGrant, PermissionState } from '../state/permission-state';
import {
	computeEffectivePermissionsForActor,
	isWriteCapableCapabilitySet,
	resolveBaseRole,
	roleRecordsForActor,
	type DroppedGrantReason,
} from './base-roles';
import {
	hasCapabilitySchemaForEntityType,
	isKnownCapabilitySet,
	singularOwnershipCapabilityFor,
} from './capability-schema';

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
 * PERM-007 — entity-scoped permission consistency audit (Architecture Contract 3, "Consistency
 * Requirements"). Beyond the role-ceiling drops covered by `auditPermissionConsistency`, the
 * following entity-relative states are invalid and must be surfaced to the DM:
 *
 *   - A player has a WRITE grant on content that is `dm-only` (or otherwise not visible to them).
 *     A grant never bypasses visibility (Contract 3 Axis 2 rule 4).
 *   - A grant references a capability set NOT defined for the entity type (unknown capability set).
 *   - A grant references a deleted/unavailable entity.
 *   - A character has more than one `owner` grant.
 *   - An observer holds any write-capable grant (re-surfaced here from the role-ceiling drop so a
 *     single entity audit is complete).
 *   - A player-view Scene contains a widget whose bound entity is not visible to that player.
 *
 * All checks are PURE functions of the supplied state + a declarative input describing entity
 * visibility, the set of known (non-deleted) entities, and player-view widget bindings. No problem
 * carries a hidden title or field value — only entity-type/id references, the grant, and a generic
 * remediation hint (PERM-014 non-leak guarantee).
 */

/** Visibility of an entity from the data layer, mirroring `EntityVisibility` in the binding query. */
export type ConsistencyEntityVisibility = 'dm-only' | 'player-visible' | 'shared';

/** A declarative record of one app-data entity's visibility, used by the entity consistency audit. */
export interface ConsistencyEntityRecord {
	entityType: string;
	entityId: string;
	visibility: ConsistencyEntityVisibility;
	/** Actor ids a `shared` entity is explicitly visible to. */
	sharedWith?: ActorId[];
}

/** A widget binding placed on a player-view scene, evaluated for the player it is delivered to. */
export interface PlayerViewWidgetBinding {
	sceneId: string;
	/** The player the player-view is delivered to. */
	playerActorId: ActorId;
	widgetInstanceId: string;
	/** The entity the widget is bound to. */
	boundEntityType: string;
	boundEntityId: string;
}

/**
 * The declarative input for the entity consistency audit. Everything here is actor-INDEPENDENT
 * source data: the audit itself derives per-actor visibility. Keeping it declarative lets the
 * binding/query layer feed it without the audit knowing entity shapes or titles.
 */
export interface EntityConsistencyInput {
	/** Visibility records keyed by `entityType:entityId`; absence means the entity is unknown. */
	entities: ConsistencyEntityRecord[];
	/**
	 * The authoritative set of known (existing, non-deleted) entity keys (`entityType:entityId`).
	 * When provided, a grant or binding targeting a key absent from this set is reported as
	 * referencing a deleted/unavailable entity. When omitted, only entities present in `entities`
	 * are treated as known.
	 */
	knownEntityKeys?: string[];
	/** Widgets on player-view scenes, evaluated against the delivered player's visibility. */
	playerViewWidgetBindings?: PlayerViewWidgetBinding[];
}

export type EntityConsistencyProblemKind =
	| 'write-grant-on-hidden-content'
	| 'unknown-capability-set'
	| 'grant-references-deleted-entity'
	| 'multiple-character-owners'
	| 'observer-write-grant'
	| 'hidden-widget-binding-in-player-view';

export interface EntityConsistencyProblem {
	kind: EntityConsistencyProblemKind;
	severity: PermissionConsistencySeverity;
	/** The participant the problem concerns, when actor-scoped. Never a display name. */
	actorId: ActorId | null;
	/** The grant that triggered the problem, when grant-scoped. */
	grantId: PermissionGrant['id'] | null;
	/** Entity reference only — never a title or field value. */
	entityType: string;
	entityId: string;
	capabilitySet: string | null;
	/** For player-view binding problems, the offending widget instance. */
	widgetInstanceId: string | null;
	/** Generic, non-leaking remediation hint for the DM. */
	remediation: string;
}

export interface EntityConsistencyReport {
	kind: 'entity-permission-consistency';
	problems: EntityConsistencyProblem[];
	hasErrors: boolean;
}

function entityKey(entityType: string, entityId: string): string {
	return `${entityType}:${entityId}`;
}

/**
 * Resolve whether an entity is visible to a specific actor from a visibility record. Fails closed:
 * an entity with no record is treated as not visible to a non-DM (default `dm-only`, Contract 3
 * Axis 1 rule 5). The DM always sees everything.
 */
function entityVisibleToActor(
	record: ConsistencyEntityRecord | undefined,
	actorRole: string,
	actorId: ActorId,
): boolean {
	if (actorRole === 'dm') return true;
	if (!record) return false;
	if (record.visibility === 'dm-only') return false;
	if (record.visibility === 'player-visible') return true;
	return (record.sharedWith ?? []).includes(actorId);
}

/**
 * Audit the permission + entity state for the invalid states in Contract 3's Consistency
 * Requirements. Pure and read-only. Returns one typed problem per detected invalid state; messages
 * never leak hidden titles or field values.
 */
export function auditEntityPermissionConsistency(
	permissions: PermissionState,
	input: EntityConsistencyInput,
): EntityConsistencyReport {
	const problems: EntityConsistencyProblem[] = [];

	const recordByKey = new Map<string, ConsistencyEntityRecord>();
	for (const record of input.entities) {
		recordByKey.set(entityKey(record.entityType, record.entityId), record);
	}

	// The set of known (existing) entity keys. Default to whatever has a visibility record so a
	// grant on an entity we have no record for is reported (fail closed) rather than ignored.
	const knownKeys = new Set<string>(input.knownEntityKeys ?? recordByKey.keys());

	// Track owner grants per character entity to detect more-than-one-owner.
	const ownerGrantsByEntity = new Map<string, PermissionGrant[]>();

	for (const grant of permissions.grants) {
		const actor = permissions.actors[grant.playerActorId];
		const role = actor?.role ?? 'observer';
		const key = entityKey(grant.entityType, grant.entityId);
		const writeCapable = isWriteCapableCapabilitySet(grant.capabilitySet);

		// Unknown capability set for this entity type (fail closed; unknown types have no schema).
		if (
			hasCapabilitySchemaForEntityType(grant.entityType) &&
			!isKnownCapabilitySet(grant.entityType, grant.capabilitySet)
		) {
			problems.push({
				kind: 'unknown-capability-set',
				severity: 'error',
				actorId: grant.playerActorId,
				grantId: grant.id,
				entityType: grant.entityType,
				entityId: grant.entityId,
				capabilitySet: grant.capabilitySet,
				widgetInstanceId: null,
				remediation:
					'This grant uses a capability set that is not defined for this entity type. Remove it or pick a defined capability set.',
			});
		}

		// Grant references a deleted/unavailable entity.
		if (!knownKeys.has(key)) {
			problems.push({
				kind: 'grant-references-deleted-entity',
				severity: 'error',
				actorId: grant.playerActorId,
				grantId: grant.id,
				entityType: grant.entityType,
				entityId: grant.entityId,
				capabilitySet: grant.capabilitySet,
				widgetInstanceId: null,
				remediation:
					'This grant references an entity that no longer exists or is unavailable. Remove the stale grant.',
			});
		}

		// Observer holding a write-capable grant (Contract 3 Base Roles rule 3). Re-surfaced here so
		// the entity audit is self-complete; the role-ceiling drop already neutralizes it at compute.
		if (role === 'observer' && writeCapable) {
			problems.push({
				kind: 'observer-write-grant',
				severity: 'error',
				actorId: grant.playerActorId,
				grantId: grant.id,
				entityType: grant.entityType,
				entityId: grant.entityId,
				capabilitySet: grant.capabilitySet,
				widgetInstanceId: null,
				remediation:
					'Observers cannot hold write grants. Remove this grant or change the participant role to Player.',
			});
		}

		// Write grant on content not visible to the player (a grant never bypasses visibility).
		// Only meaningful for grants the participant could otherwise act on, i.e. non-observers; an
		// observer write grant is already reported above. Skip when the entity is unknown (already
		// reported as deleted) so we don't double-fire on the same root cause.
		if (writeCapable && role !== 'observer' && role !== 'dm' && knownKeys.has(key)) {
			const record = recordByKey.get(key);
			if (!entityVisibleToActor(record, role, grant.playerActorId)) {
				problems.push({
					kind: 'write-grant-on-hidden-content',
					severity: 'error',
					actorId: grant.playerActorId,
					grantId: grant.id,
					entityType: grant.entityType,
					entityId: grant.entityId,
					capabilitySet: grant.capabilitySet,
					widgetInstanceId: null,
					remediation:
						'This write grant targets content the participant cannot see. Make the content visible to them or remove the grant.',
				});
			}
		}

		// Collect owner grants for the multiple-owner check.
		const singularCap = singularOwnershipCapabilityFor(grant.entityType);
		if (singularCap && grant.capabilitySet === singularCap) {
			const list = ownerGrantsByEntity.get(key) ?? [];
			list.push(grant);
			ownerGrantsByEntity.set(key, list);
		}
	}

	// More than one `owner` grant on a single character entity. Distinct owner-holders > 1.
	for (const [key, owners] of ownerGrantsByEntity) {
		const distinctOwners = new Set(owners.map((g) => g.playerActorId));
		if (distinctOwners.size > 1) {
			const first = owners[0]!;
			problems.push({
				kind: 'multiple-character-owners',
				severity: 'error',
				actorId: null,
				grantId: null,
				entityType: first.entityType,
				entityId: first.entityId,
				capabilitySet: singularOwnershipCapabilityFor(first.entityType),
				widgetInstanceId: null,
				remediation:
					'This character has more than one owner. Transfer or revoke ownership so exactly one owner remains.',
			});
		}
		void key;
	}

	// A player-view scene contains a widget bound to an entity the delivered player cannot see.
	for (const binding of input.playerViewWidgetBindings ?? []) {
		const actor = permissions.actors[binding.playerActorId];
		const role = actor?.role ?? 'observer';
		if (role === 'dm') continue; // a DM player-view is not a player-facing trust boundary.
		const key = entityKey(binding.boundEntityType, binding.boundEntityId);
		const record = recordByKey.get(key);
		if (!entityVisibleToActor(record, role, binding.playerActorId)) {
			problems.push({
				kind: 'hidden-widget-binding-in-player-view',
				severity: 'error',
				actorId: binding.playerActorId,
				grantId: null,
				entityType: binding.boundEntityType,
				entityId: binding.boundEntityId,
				capabilitySet: null,
				widgetInstanceId: binding.widgetInstanceId,
				remediation:
					'A widget on this player-view is bound to content the player cannot see. Remove the widget from the player-view or make its bound content visible.',
			});
		}
	}

	return {
		kind: 'entity-permission-consistency',
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
