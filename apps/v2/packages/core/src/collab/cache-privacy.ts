import type { ActorId } from '../state/ids';
import type { Actor, PermissionState } from '../state/permission-state';
import { hasGrantedCapability } from '../permissions/grants';

/**
 * COLLAB-010 + COLLAB-014 — the EXPLICIT SESSION-CACHE PRIVACY POLICY (Architecture Contract 2, "Sync
 * Security and Privacy" rule 4 — "Device-local caches must be purged when a player leaves a session
 * unless the DM has granted persistent access"; Security key-custody requirements).
 *
 * When a player LEAVES a session, their participant device's session-only cached content must be PURGED
 * or SEALED so it becomes unreadable — UNLESS the DM granted PERSISTENT ACCESS to that content. This
 * module is the single pure Processing-Core policy that decides, per cached entry, whether it is
 * RETAINED, PURGED, or SEALED, and computes the explicit cache policy the participant device enforces
 * (TTL, sealed-key invalidation, persistent-grant exceptions, offline-revocation behavior).
 *
 * THE FAIL-CLOSED CRUX (COLLAB-014 AC2): a revocation/seal applies EVEN IF THE PARTICIPANT IS OFFLINE.
 * An offline participant's cache is SEALED/unreadable at the configured TTL expiry, not left open until
 * the revoke op is delivered. Sealing is modeled as KEY INVALIDATION: a session-only entry is encrypted
 * under the SESSION CACHE KEY; sealing the session (or reaching TTL) INVALIDATES that key, so the entry
 * is unreadable LOCALLY with no network round-trip. (Per ADR-014 the real key custody / crypto is
 * deferred; this is the policy model + the seam a crypto implementation plugs into — it decides WHICH
 * entries become unreadable WHEN, not the cipher.)
 *
 * It REUSES the PERM grant model (`hasGrantedCapability`) to decide the persistent-grant exception:
 * cached content is retained only when the participant holds a still-active, viewer-capable PERSISTENT
 * grant on it. Everything else is session-only and is purged/sealed on leave. Pure + deterministic over
 * plain data (apart from the `now` clock passed in for TTL evaluation).
 */

export const SESSION_CACHE_POLICY_SCHEMA_VERSION = 1 as const;

/** The lifecycle of a session, as it affects the participant cache. */
export type SessionCacheLifecycle =
	| 'active' // the participant is in the session; session-only content is readable
	| 'left' // the participant left / was removed; session-only content must be purged or sealed
	| 'ended'; // the whole session ended; same purge/seal rule, persistent grants still honored

/**
 * The DISPOSITION computed for one cached entry on a participant device.
 *
 *   - `retained`  — the participant holds a persistent grant; the entry stays readable per the grant.
 *   - `purge`     — session-only; remove the plaintext entry from the cache (preferred where possible).
 *   - `seal`      — session-only; the entry cannot be removed yet (e.g. offline), so its session cache
 *                   KEY is invalidated, making it unreadable in place until it can be purged.
 */
export type CacheEntryDisposition = 'retained' | 'purge' | 'seal';

/** One entry in a participant's device cache, classified for the privacy decision. */
export interface ParticipantCacheEntry {
	/** A stable cache key (e.g. `handout:<id>` or `entityType:entityId`). */
	cacheKey: string;
	entityType: string;
	entityId: string;
	/**
	 * Whether the entry is SESSION-ONLY (delivered for the live session — handouts, projected scenes,
	 * combat snapshots) vs durable vault content the participant owns/authored. Only session-only
	 * entries are subject to purge/seal; durable owned content is never touched by session leave.
	 */
	sessionOnly: boolean;
}

/**
 * The EXPLICIT session-cache policy (COLLAB-014) a participant device enforces. It is computed in the
 * core and handed to the device; the device applies it WITHOUT further policy decisions.
 */
export interface SessionCachePolicy {
	schemaVersion: typeof SESSION_CACHE_POLICY_SCHEMA_VERSION;
	/**
	 * The session-only cache TTL, in milliseconds. After the policy is issued, a session-only entry that
	 * is not purged becomes SEALED (key-invalidated) no later than `issuedAt + ttlMs`, EVEN OFFLINE
	 * (COLLAB-014 AC2). A non-positive TTL means seal immediately on leave.
	 */
	ttlMs: number;
	/** When this policy was issued (the TTL clock origin). */
	issuedAt: string;
	/**
	 * Whether sealing INVALIDATES THE SESSION CACHE KEY. Always true in this model: sealing is key
	 * invalidation, so a sealed entry is unreadable locally with no network (the offline-revocation
	 * guarantee). Declared explicitly so the contract is inspectable.
	 */
	invalidatesSessionKey: boolean;
	/**
	 * Cache keys that are EXEMPT from purge/seal because the participant holds a persistent grant on the
	 * underlying content (the COLLAB-010 persistent-access exception). These remain readable.
	 */
	persistentGrantExemptKeys: string[];
}

/** The default session-only cache TTL: 24h. Conservative — bounds how long a sealed-but-unpurged entry can linger. */
export const DEFAULT_SESSION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Inputs for evaluating a participant's cache on session leave/end.
 */
export interface CachePrivacyInput {
	/** The participant whose device cache is being evaluated. */
	participant: Actor;
	/** The participant's device cache entries. */
	entries: ParticipantCacheEntry[];
	/** The permission state (for the persistent-grant check). */
	permission: PermissionState;
	/** Whether the participant device is currently ONLINE (can purge now) or OFFLINE (must seal). */
	online: boolean;
	/** The current time, for grant-expiry evaluation. Optional. */
	now?: string;
}

/** The disposition computed for one cache entry. */
export interface CacheEntryDecision {
	cacheKey: string;
	entityType: string;
	entityId: string;
	disposition: CacheEntryDisposition;
	/** True when the entry survives because of a persistent grant (the COLLAB-010 exception). */
	persistentGrant: boolean;
}

/**
 * Whether the participant holds a PERSISTENT (non-expiring relative to `now`), viewer-capable grant on a
 * cached entry's underlying content — the COLLAB-010 persistent-access exception. Reuses
 * `hasGrantedCapability` (a `viewer` grant suffices to keep content readable). The DM is not a cache
 * participant here (the DM device is the host); a non-DM with an active viewer grant retains the entry.
 */
export function hasPersistentAccess(
	entry: ParticipantCacheEntry,
	participant: Actor,
	permission: PermissionState,
	now?: string,
): boolean {
	if (participant.role === 'observer') return false; // observers never receive grants (Contract 3)
	return hasGrantedCapability(
		permission,
		participant,
		entry.entityType,
		entry.entityId,
		'viewer',
		now,
	);
}

/**
 * Decide the disposition of ONE cache entry on session leave/end. Fail closed:
 *
 *   - A NON-session-only entry (durable owned content) is always `retained` — session leave never
 *     touches a participant's own durable content.
 *   - A session-only entry with a persistent grant is `retained` (the COLLAB-010 exception).
 *   - A session-only entry WITHOUT a persistent grant is `purge` when the device is ONLINE (remove the
 *     plaintext) or `seal` when OFFLINE (invalidate the session key so it is unreadable in place —
 *     COLLAB-014 AC2 offline revocation). Either way the content becomes unreadable.
 */
export function decideCacheEntry(
	entry: ParticipantCacheEntry,
	participant: Actor,
	permission: PermissionState,
	online: boolean,
	now?: string,
): CacheEntryDecision {
	const head = { cacheKey: entry.cacheKey, entityType: entry.entityType, entityId: entry.entityId };
	if (!entry.sessionOnly) {
		return { ...head, disposition: 'retained', persistentGrant: false };
	}
	if (hasPersistentAccess(entry, participant, permission, now)) {
		return { ...head, disposition: 'retained', persistentGrant: true };
	}
	return { ...head, disposition: online ? 'purge' : 'seal', persistentGrant: false };
}

/** The full result of evaluating a participant's cache for the privacy policy. */
export interface CachePrivacyResult {
	participantActorId: ActorId;
	lifecycle: SessionCacheLifecycle;
	decisions: CacheEntryDecision[];
	/** Cache keys to PURGE (plaintext removed). */
	purgedKeys: string[];
	/** Cache keys to SEAL (session key invalidated; unreadable in place). */
	sealedKeys: string[];
	/** Cache keys RETAINED (persistent grant or durable owned content). */
	retainedKeys: string[];
	/** The explicit policy the device enforces (TTL, key invalidation, persistent exemptions). */
	policy: SessionCachePolicy;
}

/**
 * Evaluate a participant's device cache for the privacy policy on session leave/end (COLLAB-010 +
 * COLLAB-014). For an `active` lifecycle no purge/seal occurs (everything readable); for `left`/`ended`,
 * every session-only entry without a persistent grant is purged (online) or sealed (offline), and the
 * explicit `SessionCachePolicy` (TTL + key invalidation + persistent-grant exemptions) is computed so
 * the device can enforce sealing even if it goes offline before the next reconnect.
 *
 * Pure + deterministic. The arrays are sorted for stable, replay-comparable output.
 */
export function evaluateCachePrivacy(
	input: CachePrivacyInput,
	lifecycle: SessionCacheLifecycle,
	options: { ttlMs?: number; issuedAt?: string } = {},
): CachePrivacyResult {
	const { participant, entries, permission, online } = input;
	const ttlMs = options.ttlMs ?? DEFAULT_SESSION_CACHE_TTL_MS;
	const issuedAt = options.issuedAt ?? input.now ?? new Date(0).toISOString();

	const decisions: CacheEntryDecision[] = entries.map((entry) =>
		lifecycle === 'active'
			? {
					cacheKey: entry.cacheKey,
					entityType: entry.entityType,
					entityId: entry.entityId,
					disposition: 'retained' as const,
					persistentGrant: hasPersistentAccess(entry, participant, permission, input.now),
				}
			: decideCacheEntry(entry, participant, permission, online, input.now),
	);

	const purgedKeys = decisions.filter((d) => d.disposition === 'purge').map((d) => d.cacheKey).sort();
	const sealedKeys = decisions.filter((d) => d.disposition === 'seal').map((d) => d.cacheKey).sort();
	const retainedKeys = decisions
		.filter((d) => d.disposition === 'retained')
		.map((d) => d.cacheKey)
		.sort();
	const persistentGrantExemptKeys = decisions
		.filter((d) => d.persistentGrant)
		.map((d) => d.cacheKey)
		.sort();

	return {
		participantActorId: participant.id,
		lifecycle,
		decisions,
		purgedKeys,
		sealedKeys,
		retainedKeys,
		policy: {
			schemaVersion: SESSION_CACHE_POLICY_SCHEMA_VERSION,
			ttlMs,
			issuedAt,
			invalidatesSessionKey: true,
			persistentGrantExemptKeys,
		},
	};
}

/**
 * OFFLINE-REVOCATION evaluation (COLLAB-014 AC2): is a sealed session-only entry now UNREADABLE because
 * the local TTL has elapsed, EVEN IF the revoke operation has not been delivered? Pure function of the
 * policy + the entry's seal time vs `now`. Fail closed: a non-positive TTL ⇒ unreadable immediately; an
 * entry exempted by a persistent grant is NOT subject to TTL sealing (it stays readable).
 *
 * `sealedAt` defaults to the policy `issuedAt` (the TTL clock origin), so an entry sealed on leave
 * becomes unreadable at `issuedAt + ttlMs` with no network round-trip.
 */
export function isSealedCacheEntryUnreadable(
	policy: SessionCachePolicy,
	cacheKey: string,
	now: string,
	sealedAt?: string,
): boolean {
	if (policy.persistentGrantExemptKeys.includes(cacheKey)) return false;
	if (policy.ttlMs <= 0) return true;
	const origin = Date.parse(sealedAt ?? policy.issuedAt);
	const current = Date.parse(now);
	if (Number.isNaN(origin) || Number.isNaN(current)) return true; // fail closed on a bad clock
	return current - origin >= policy.ttlMs;
}

/**
 * PURGE-CONFIRMATION status (COLLAB-010 AC4 / COLLAB-014 AC4). A participant device acknowledges that it
 * purged/sealed its session-only cache. Until it does, the DM privacy-status surface marks the
 * participant `purge-unconfirmed`. Crucially this NEVER exposes device secrets — only the participant id
 * and a coarse status — so a failed/absent confirmation is visible without leaking what was cached.
 */
export type CachePurgeStatus = 'confirmed' | 'purge-unconfirmed';

/** One participant's cache-privacy status, as the DM sees it. Carries no device secrets / cached content. */
export interface ParticipantCachePrivacyStatus {
	participantActorId: ActorId;
	status: CachePurgeStatus;
	/** A generic, non-leaking explanation suitable for the DM privacy-status surface. */
	message: string;
}

const PURGE_STATUS_MESSAGES: Record<CachePurgeStatus, string> = {
	confirmed: 'Session cache purge confirmed on this participant device.',
	'purge-unconfirmed':
		'Session cache purge is not yet confirmed for this participant. Sealed content remains unreadable per the cache policy.',
};

/**
 * Compute the DM-facing purge status for each participant who left/was-removed. A participant whose
 * device CONFIRMED the purge is `confirmed`; everyone else (no acknowledgement, or an explicit failure)
 * is `purge-unconfirmed`. The output carries only the participant id + coarse status + a generic message
 * — never device secrets or cached content references (COLLAB-010 AC4 non-leak).
 */
export function computeParticipantCachePrivacyStatus(
	departedParticipantIds: readonly ActorId[],
	confirmedPurgeParticipantIds: ReadonlySet<ActorId>,
): ParticipantCachePrivacyStatus[] {
	return [...departedParticipantIds]
		.sort()
		.map((participantActorId) => {
			const status: CachePurgeStatus = confirmedPurgeParticipantIds.has(participantActorId)
				? 'confirmed'
				: 'purge-unconfirmed';
			return { participantActorId, status, message: PURGE_STATUS_MESSAGES[status] };
		});
}
