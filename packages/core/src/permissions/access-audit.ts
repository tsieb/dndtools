import { hasDmAuthority } from '../state/permission-state';
import type { ActorId } from '../state/ids';
import type { PermissionState } from '../state/permission-state';
import type { ConsistencyEntityRecord, ConsistencyEntityVisibility } from './consistency';

/**
 * PERM-010 — audit of denied access attempts that cross a trust boundary, WITHOUT leaking hidden
 * content (Architecture Contract 3, Visibility evaluation order step 6; Security model).
 *
 * Two guarantees, both fail-closed:
 *
 *   1. The denial returned to the actor and the audit record persisted for the DM carry ONLY the
 *      actor id, the target ENTITY REFERENCE (type + id), and a coarse reason CATEGORY. They never
 *      carry the entity title, any field value, or any player-only shared content.
 *   2. The actor learns only that access was denied. Where the requirement says denial must be
 *      indistinguishable from not-found (a hidden entity the actor was never meant to know exists),
 *      the public reason collapses to `not-found` so the actor cannot probe existence by id.
 *
 * A "trust boundary crossing" is a non-DM actor attempting to reach content they are not entitled
 * to. A DM never crosses a trust boundary (full authority), and a request for content the actor is
 * already entitled to is not a denial. Both are reported as `not-a-denial` and produce no audit
 * record.
 */

/** The coarse reason a denial is attributed to, for the audit trail (DM-facing, non-leaking). */
export type AccessDenialReason =
	| 'not-visible' // entity exists but is not visible to this actor (e.g. dm-only)
	| 'not-shared' // a `shared` entity not shared with this actor
	| 'no-permission' // visible, but the actor lacks the required write/operate grant
	| 'unknown-actor' // the requester is not a known participant
	| 'not-found'; // entity does not exist — also the public face of a hidden-existence denial

/**
 * The reason surfaced TO THE ACTOR. It is a strict, lossy projection of {@link AccessDenialReason}:
 * any reason that would let the actor infer the existence of content they may not know about
 * collapses to `not-found`. The actor never sees `not-visible`/`not-shared`/`no-permission` for a
 * dm-only / unshared target.
 */
export type PublicDenialReason = 'not-found' | 'no-permission' | 'unknown-actor';

export type AccessKind = 'read' | 'write';

export interface AccessRequest {
	actorId: ActorId | null | undefined;
	entityType: string;
	entityId: string;
	access: AccessKind;
}

/** What the actor is told. Carries no entity title or field value — only a coarse public reason. */
export interface AccessDenialPublicResult {
	kind: 'denied';
	publicReason: PublicDenialReason;
	/** A fixed, generic message safe to show the actor. Never includes a title or value. */
	message: string;
}

/** The DM-facing audit record for a denied cross-trust-boundary attempt. Non-leaking by shape. */
export interface AccessDenialAuditRecord {
	kind: 'access-denied';
	actorId: ActorId;
	/** Entity reference only — never a title or field value. */
	entityType: string;
	entityId: string;
	access: AccessKind;
	/** The precise (DM-facing) reason category. */
	reason: AccessDenialReason;
	/** The lossy public reason the actor saw, recorded so the DM can confirm no leak occurred. */
	publicReason: PublicDenialReason;
	/** True when the denial was masked as not-found to hide the entity's existence. */
	maskedAsNotFound: boolean;
}

export type AccessAuditResult =
	| { kind: 'granted' }
	| { kind: 'not-a-denial' }
	| {
			kind: 'denied';
			public: AccessDenialPublicResult;
			audit: AccessDenialAuditRecord;
	  };

const PUBLIC_NOT_FOUND_MESSAGE = 'The requested content is unavailable.' as const;
const PUBLIC_NO_PERMISSION_MESSAGE = 'You do not have permission to perform this action.' as const;
const PUBLIC_UNKNOWN_ACTOR_MESSAGE = 'The requested content is unavailable.' as const;

/**
 * Coarse visibility used ONLY to CLASSIFY an already-denied access into a public/audit reason
 * (`not-visible` vs `not-shared`). It is NOT the live access gate and intentionally does not consult
 * grants: a viewer-granted actor is admitted by the grant-aware live gate (e.g. content-query's
 * `itemVisibleToActor`) and so never reaches `auditAccessAttempt` — by the time this runs, the actor
 * genuinely cannot see the entity, so a grant-blind decision here is correct by construction.
 */
function entityVisibleToActor(
	visibility: ConsistencyEntityVisibility,
	sharedWith: ActorId[] | undefined,
	actorId: ActorId,
): boolean {
	if (visibility === 'player-visible') return true;
	if (visibility === 'dm-only') return false;
	return (sharedWith ?? []).includes(actorId);
}

/**
 * Map a precise denial reason to the reason surfaced to the actor. `not-visible` and `not-shared`
 * collapse to `not-found` so a non-entitled actor cannot distinguish "hidden" from "does not
 * exist" — they cannot probe existence by id. `no-permission` is only ever returned when the actor
 * can already SEE the entity (so its existence is not secret); otherwise it too is masked.
 */
function toPublicReason(reason: AccessDenialReason): PublicDenialReason {
	switch (reason) {
		case 'no-permission':
			return 'no-permission';
		case 'unknown-actor':
			return 'unknown-actor';
		case 'not-visible':
		case 'not-shared':
		case 'not-found':
			return 'not-found';
	}
}

function publicMessageFor(reason: PublicDenialReason): string {
	switch (reason) {
		case 'no-permission':
			return PUBLIC_NO_PERMISSION_MESSAGE;
		case 'unknown-actor':
			return PUBLIC_UNKNOWN_ACTOR_MESSAGE;
		case 'not-found':
			return PUBLIC_NOT_FOUND_MESSAGE;
	}
}

function denial(
	actorId: ActorId,
	request: { entityType: string; entityId: string; access: AccessKind },
	reason: AccessDenialReason,
): AccessAuditResult {
	const publicReason = toPublicReason(reason);
	const maskedAsNotFound = reason !== 'not-found' && publicReason === 'not-found';
	return {
		kind: 'denied',
		public: {
			kind: 'denied',
			publicReason,
			message: publicMessageFor(publicReason),
		},
		audit: {
			kind: 'access-denied',
			actorId,
			entityType: request.entityType,
			entityId: request.entityId,
			access: request.access,
			reason,
			publicReason,
			maskedAsNotFound,
		},
	};
}

export interface AuditAccessOptions {
	/**
	 * Whether the actor already holds the write/operate permission required for a `write` request.
	 * Only consulted when the entity is visible to the actor. The caller computes this from the
	 * effective permission surface (it is not this function's job to re-evaluate grants).
	 */
	hasRequiredPermission?: boolean;
}

/**
 * Evaluate an access attempt and, if it is a denied trust-boundary crossing, produce the
 * non-leaking public denial AND the DM-facing audit record. Pure and read-only.
 *
 * Fail-closed order:
 *
 *   1. Unknown/unauthenticated requester → denied `unknown-actor` (masked appropriately).
 *   2. DM → never a trust-boundary denial (`not-a-denial`); DM authority is inherent.
 *   3. Entity has no record → does not exist → denied `not-found`.
 *   4. Entity not visible to the actor → denied `not-visible`/`not-shared`, masked as not-found so
 *      existence stays hidden.
 *   5. Entity visible but a `write` request lacks the required permission → denied `no-permission`
 *      (existence is not secret here, so the actor may be told it is a permission problem).
 *   6. Otherwise → granted.
 */
export function auditAccessAttempt(
	permissions: PermissionState,
	request: AccessRequest,
	entities: ConsistencyEntityRecord[],
	options: AuditAccessOptions = {},
): AccessAuditResult {
	const { actorId, entityType, entityId, access } = request;

	if (actorId === null || actorId === undefined || actorId === '') {
		return denial('', { entityType, entityId, access }, 'unknown-actor');
	}
	const actor = permissions.actors[actorId];
	if (!actor) {
		return denial(actorId, { entityType, entityId, access }, 'unknown-actor');
	}
	if (hasDmAuthority(actor.role)) {
		return { kind: 'not-a-denial' };
	}

	const key = `${entityType}:${entityId}`;
	const record = entities.find((entry) => `${entry.entityType}:${entry.entityId}` === key);

	if (!record) {
		return denial(actorId, { entityType, entityId, access }, 'not-found');
	}

	if (!entityVisibleToActor(record.visibility, record.sharedWith, actorId)) {
		const reason: AccessDenialReason = record.visibility === 'shared' ? 'not-shared' : 'not-visible';
		return denial(actorId, { entityType, entityId, access }, reason);
	}

	if (access === 'write' && options.hasRequiredPermission !== true) {
		return denial(actorId, { entityType, entityId, access }, 'no-permission');
	}

	return { kind: 'granted' };
}
