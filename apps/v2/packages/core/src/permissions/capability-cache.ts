import type { ActorId } from '../state/ids';
import type { PermissionState } from '../state/permission-state';
import { computeEffectivePermissionsForActor } from './base-roles';
import { CAPABILITY_SCHEMA_VERSION } from './capability-schema';
import type { ConsistencyEntityRecord } from './consistency';

/**
 * PERM-009 — participant capability cache + deterministic, synchronous invalidation (Architecture
 * Contract 3, Session Join Model rule 4: "Grant changes during a session invalidate affected
 * participant capability caches immediately").
 *
 * Design constraints from the epic:
 *
 *   - The cache and its invalidation are modeled in the PURE core, keyed by the inputs/version.
 *   - Invalidation is SYNCHRONOUS on the triggering change — no timers, no background system.
 *   - A change to any trigger (grants, visibility, roles, ownership, capability schema version)
 *     invalidates EXACTLY the affected participants.
 *   - Fail closed: when the affected set cannot be determined precisely, invalidate everyone.
 *
 * The cache is keyed by a per-participant FINGERPRINT computed deterministically from every input
 * that can change that participant's effective capabilities. If the fingerprint changes, the entry
 * is stale and must be re-evaluated before the participant receives catch-up operations (PERM-009
 * AC2). The fingerprint is a string, so the cache is trivially serializable and replay-stable.
 */

/** The inputs that determine a participant's effective capabilities, hashed into a fingerprint. */
export interface CapabilityCacheInputs {
	permissions: PermissionState;
	/** Visibility records (actor-independent) for entities the participant may be granted/see. */
	entities: ConsistencyEntityRecord[];
	/** The capability-set schema version in force. Defaults to the current schema version. */
	capabilitySchemaVersion?: string;
}

/** One cached, validated capability entry for a participant. Opaque payload + its fingerprint. */
export interface CapabilityCacheEntry {
	actorId: ActorId;
	/** Deterministic fingerprint of the inputs this entry was computed from. */
	fingerprint: string;
}

export interface CapabilityCache {
	entries: Record<ActorId, CapabilityCacheEntry>;
	/** The capability-set schema version the whole cache was last computed under. */
	capabilitySchemaVersion: string;
}

export const EMPTY_CAPABILITY_CACHE: CapabilityCache = Object.freeze({
	entries: {},
	capabilitySchemaVersion: CAPABILITY_SCHEMA_VERSION,
});

function entityKey(entityType: string, entityId: string): string {
	return `${entityType}:${entityId}`;
}

/**
 * The triggers that can invalidate capability caches. `ownership` is modeled as the singular owner
 * grant changing; it is listed separately because Contract 3 calls it out explicitly and because a
 * future ownership representation may live outside the grant list.
 */
export type CapabilityCacheTrigger =
	| 'grant'
	| 'visibility'
	| 'role'
	| 'ownership'
	| 'capability-schema-version';

/**
 * Compute a deterministic fingerprint of everything that affects one participant's effective
 * capabilities:
 *
 *   - their resolved role + whether it was normalized (role/ownership/grant ceiling all fold into
 *     `computeEffectivePermissionsForActor`),
 *   - their surviving + dropped grants (so a revoked grant changes the fingerprint),
 *   - the visibility of every entity any of their grants targets (so hiding granted content, i.e. a
 *     visibility change, changes the fingerprint),
 *   - the capability-set schema version.
 *
 * Two states that yield the same fingerprint are guaranteed to yield the same effective
 * capabilities, so a participant whose fingerprint is unchanged is safe to serve from cache. Any
 * change to a relevant input changes the fingerprint, so the entry is invalidated.
 */
export function computeCapabilityFingerprint(
	actorId: ActorId,
	inputs: CapabilityCacheInputs,
): string {
	const schemaVersion = inputs.capabilitySchemaVersion ?? CAPABILITY_SCHEMA_VERSION;
	const effective = computeEffectivePermissionsForActor(inputs.permissions, actorId);

	const visibilityByKey = new Map<string, string>();
	for (const record of inputs.entities) {
		const sharedWith = [...(record.sharedWith ?? [])].sort().join(',');
		visibilityByKey.set(
			entityKey(record.entityType, record.entityId),
			`${record.visibility}|${sharedWith}`,
		);
	}

	// Every grant for this actor (surviving OR dropped) contributes; a dropped write grant becoming
	// effective (or vice versa) must change the fingerprint, as must hiding the granted entity. The
	// `dropped` flag distinguishes a surviving grant from a dropped one with the same fields.
	const fingerprintGrant = (
		entityType: string,
		entityId: string,
		capabilitySet: string,
		dropped: boolean,
	): string => {
		const key = entityKey(entityType, entityId);
		const visibility = visibilityByKey.get(key) ?? 'dm-only|';
		return `${entityType}:${entityId}:${capabilitySet}:${dropped ? '1' : '0'}:${visibility}`;
	};
	const grantFingerprints = [
		...effective.effectiveGrants.map((grant) =>
			fingerprintGrant(grant.entityType, grant.entityId, grant.capabilitySet, false),
		),
		...effective.droppedGrants.map((grant) =>
			fingerprintGrant(grant.entityType, grant.entityId, grant.capabilitySet, true),
		),
	].sort();

	return [
		`v=${schemaVersion}`,
		`actor=${actorId}`,
		`role=${effective.role}`,
		`auth=${effective.authenticated ? '1' : '0'}`,
		`norm=${effective.roleNormalized ? '1' : '0'}`,
		`write=${effective.canWrite ? '1' : '0'}`,
		`char=${effective.canReadCharacterData ? '1' : '0'}`,
		`grants=[${grantFingerprints.join(';')}]`,
	].join('|');
}

/**
 * Build a fresh capability cache for every authenticated participant in the state. Each entry
 * carries the participant's current fingerprint. This is the validated cache a session join /
 * reconnect populates after re-evaluating role, visibility, and grants (PERM-009 AC2).
 */
export function buildCapabilityCache(inputs: CapabilityCacheInputs): CapabilityCache {
	const schemaVersion = inputs.capabilitySchemaVersion ?? CAPABILITY_SCHEMA_VERSION;
	const entries: Record<ActorId, CapabilityCacheEntry> = {};
	for (const actorId of Object.keys(inputs.permissions.actors)) {
		entries[actorId] = {
			actorId,
			fingerprint: computeCapabilityFingerprint(actorId, inputs),
		};
	}
	return { entries, capabilitySchemaVersion: schemaVersion };
}

export interface InvalidationResult {
	/** The participants whose cache entries were invalidated (stale) and must be re-evaluated. */
	invalidatedActorIds: ActorId[];
	/** The next cache, with invalid entries removed and unchanged entries preserved. */
	cache: CapabilityCache;
	/** True when invalidation was forced wholesale because the affected set was indeterminate. */
	failedClosed: boolean;
}

/**
 * Recompute the cache against new inputs and invalidate EXACTLY the participants whose effective
 * capabilities changed. Synchronous and pure.
 *
 * Fail-closed rules:
 *
 *   - If the capability-set schema version changed, EVERY participant is invalidated (the meaning
 *     of granted capabilities may have shifted even with identical grant records). This is the
 *     wholesale fail-closed path.
 *   - A participant present before but absent now (removed) is dropped from the cache.
 *   - A participant absent before but present now (added) is treated as invalidated (must compute).
 *   - Otherwise a participant is invalidated iff their fingerprint changed.
 *
 * The caller passes the PREVIOUS cache and the NEW inputs; this returns the set to re-evaluate and
 * the next cache that already reflects the unchanged entries plus fresh fingerprints for the rest.
 */
export function invalidateCapabilityCache(
	previous: CapabilityCache,
	nextInputs: CapabilityCacheInputs,
): InvalidationResult {
	const nextSchemaVersion = nextInputs.capabilitySchemaVersion ?? CAPABILITY_SCHEMA_VERSION;
	const schemaChanged = previous.capabilitySchemaVersion !== nextSchemaVersion;

	const nextActorIds = Object.keys(nextInputs.permissions.actors);
	const nextFingerprints = new Map<ActorId, string>();
	for (const actorId of nextActorIds) {
		nextFingerprints.set(actorId, computeCapabilityFingerprint(actorId, nextInputs));
	}

	const invalidated = new Set<ActorId>();
	const entries: Record<ActorId, CapabilityCacheEntry> = {};

	for (const actorId of nextActorIds) {
		const nextFingerprint = nextFingerprints.get(actorId)!;
		const prevEntry = previous.entries[actorId];
		// Fail closed: schema-version change invalidates everyone regardless of fingerprint.
		const changed = schemaChanged || !prevEntry || prevEntry.fingerprint !== nextFingerprint;
		if (changed) invalidated.add(actorId);
		entries[actorId] = { actorId, fingerprint: nextFingerprint };
	}

	// A participant who existed in the old cache but is gone now is implicitly invalidated (their
	// entry must not survive), but they are not in the next cache.
	for (const actorId of Object.keys(previous.entries)) {
		if (!nextFingerprints.has(actorId)) invalidated.add(actorId);
	}

	return {
		invalidatedActorIds: [...invalidated].sort(),
		cache: { entries, capabilitySchemaVersion: nextSchemaVersion },
		failedClosed: schemaChanged,
	};
}

/**
 * True when a participant's cached capability entry is still valid for the given inputs. A stale
 * entry (fingerprint mismatch), a missing entry, or a schema-version change all read as invalid, so
 * the caller fails closed and re-evaluates before serving catch-up operations (PERM-009 AC2).
 */
export function isCapabilityCacheEntryValid(
	cache: CapabilityCache,
	actorId: ActorId,
	inputs: CapabilityCacheInputs,
): boolean {
	const schemaVersion = inputs.capabilitySchemaVersion ?? CAPABILITY_SCHEMA_VERSION;
	if (cache.capabilitySchemaVersion !== schemaVersion) return false;
	const entry = cache.entries[actorId];
	if (!entry) return false;
	return entry.fingerprint === computeCapabilityFingerprint(actorId, inputs);
}
