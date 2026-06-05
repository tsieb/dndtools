import type { ActorId } from '../state/ids';
import type { Actor, PermissionState } from '../state/permission-state';
import type { ConsistencyEntityRecord } from './consistency';
import {
	evaluateVisibility,
	normalizeVisibilityLevel,
	type EntityVisibilityMetadata,
	type VisibilityLevel,
	type VisibilityRule,
} from './visibility-filter';

/**
 * PERM-012 — visibility revoke/change + invalidation (Architecture Contract 3, Axis 1 + Sync
 * Security and Privacy Rules; Contract 1 binding rule 5). Changing or revoking visibility at ANY
 * granularity (entity / section / field) must invalidate the affected subscriptions, sync streams,
 * cached data, and widget bindings so a now-hidden surface IMMEDIATELY disappears from the affected
 * actors' computed surface and a stale cache never serves it.
 *
 * This reuses the SAME fingerprint-diff invalidation pattern as `capability-cache.ts` (whose trigger
 * list already names "visibility"): a per-actor visibility fingerprint folds in every granular rule
 * and the actor's effective access to it. When the fingerprint changes, the entry is stale and the
 * actor must be re-evaluated before receiving catch-up operations.
 *
 * Pure Processing-Core policy. Synchronous on the triggering change — no timers, no background
 * system. Fail closed: when the affected actor set cannot be determined precisely, every actor is
 * invalidated.
 */

/** A point in an entity to track for visibility changes: the entity, a section, or a field. */
export interface VisibilitySurfaceRef {
	entityType: string;
	entityId: string;
	sectionId?: string;
	fieldPath?: string;
}

function surfaceKey(ref: VisibilitySurfaceRef): string {
	return [
		ref.entityType,
		ref.entityId,
		ref.sectionId ?? '',
		ref.fieldPath ?? '',
	].join('|');
}

function metaKey(meta: EntityVisibilityMetadata): string {
	return `${meta.entityType}:${meta.entityId}`;
}

function ruleToken(rule: VisibilityRule | undefined): string {
	if (!rule) return '-';
	const level = normalizeVisibilityLevel(rule.level);
	const shared = level === 'shared' ? [...(rule.sharedWith ?? [])].sort().join(',') : '';
	return `${level}#${shared}`;
}

/**
 * A deterministic, actor-INDEPENDENT fingerprint of all granular visibility metadata for a set of
 * entities. Folding the whole metadata (entity + every section + every field rule, plus the
 * field→section attribution) means ANY visibility edit at ANY granularity changes the fingerprint.
 * Two metadata sets with the same fingerprint yield identical visibility decisions for every actor.
 */
export function computeVisibilityMetadataFingerprint(
	metadata: readonly EntityVisibilityMetadata[],
): string {
	const perEntity = metadata
		.map((meta) => {
			const sections = Object.keys(meta.sections ?? {})
				.sort()
				.map((id) => `s:${id}=${ruleToken(meta.sections?.[id])}`);
			const fields = Object.keys(meta.fields ?? {})
				.sort()
				.map((path) => `f:${path}=${ruleToken(meta.fields?.[path])}`);
			const fieldSections = Object.keys(meta.fieldSections ?? {})
				.sort()
				.map((path) => `fs:${path}=${meta.fieldSections?.[path] ?? ''}`);
			return [
				`e:${metaKey(meta)}=${ruleToken(meta.entity)}`,
				...sections,
				...fields,
				...fieldSections,
			].join(';');
		})
		.sort();
	return perEntity.join('||');
}

/**
 * A per-ACTOR fingerprint of their effective visibility over a set of surfaces. This captures the
 * actual access decision (visible / hidden + reason + deciding scope) for every tracked surface, so
 * the fingerprint changes exactly when the actor's surface changes — whether the cause is the
 * entity, a section, or a field rule, or the actor's `shared`-delivery/grant state. The grant set is
 * read from `permission` so revoking a viewer grant on a `shared` surface also re-fingerprints.
 */
export function computeActorVisibilityFingerprint(
	actor: Actor,
	metadata: readonly EntityVisibilityMetadata[],
	surfaces: readonly VisibilitySurfaceRef[],
	permission?: PermissionState,
): string {
	const metaByKey = new Map<string, EntityVisibilityMetadata>();
	for (const meta of metadata) metaByKey.set(`${meta.entityType}:${meta.entityId}`, meta);

	const tokens = surfaces
		.map((ref) => {
			const meta = metaByKey.get(`${ref.entityType}:${ref.entityId}`) ?? {
				entityType: ref.entityType,
				entityId: ref.entityId,
			};
			const decision = evaluateVisibility(
				meta,
				{ sectionId: ref.sectionId, fieldPath: ref.fieldPath },
				actor,
				permission,
			);
			const verdict = decision.visible
				? 'visible'
				: `hidden:${decision.reason}:${decision.scope}`;
			return `${surfaceKey(ref)}=>${verdict}`;
		})
		.sort();
	return `actor=${actor.id}|role=${actor.role}|surfaces=[${tokens.join(';')}]`;
}

/** A cached visibility entry for one actor over the tracked surfaces. */
export interface VisibilityCacheEntry {
	actorId: ActorId;
	fingerprint: string;
}

export interface VisibilityCache {
	entries: Record<ActorId, VisibilityCacheEntry>;
}

export const EMPTY_VISIBILITY_CACHE: VisibilityCache = Object.freeze({ entries: {} });

export interface VisibilityCacheInputs {
	permissions: PermissionState;
	metadata: readonly EntityVisibilityMetadata[];
	/** The surfaces (entity/section/field) whose delivery to actors is being tracked. */
	surfaces: readonly VisibilitySurfaceRef[];
}

/**
 * Build a fresh visibility cache for every actor in the permission state. Each entry carries the
 * actor's current visibility fingerprint over the tracked surfaces. This is the validated cache a
 * session join / reconnect populates AFTER re-evaluating visibility (PERM-012 AC2: visibility is
 * re-evaluated before catch-up operations are delivered).
 */
export function buildVisibilityCache(inputs: VisibilityCacheInputs): VisibilityCache {
	const entries: Record<ActorId, VisibilityCacheEntry> = {};
	for (const actorId of Object.keys(inputs.permissions.actors)) {
		const actor = inputs.permissions.actors[actorId]!;
		entries[actorId] = {
			actorId,
			fingerprint: computeActorVisibilityFingerprint(
				actor,
				inputs.metadata,
				inputs.surfaces,
				inputs.permissions,
			),
		};
	}
	return { entries };
}

export interface VisibilityInvalidationResult {
	/** Actors whose visibility surface changed and whose cache/subscriptions/streams must refresh. */
	invalidatedActorIds: ActorId[];
	/** The next cache: unchanged entries preserved, changed/added entries re-fingerprinted. */
	cache: VisibilityCache;
	/** True when invalidation was forced wholesale because the affected set was indeterminate. */
	failedClosed: boolean;
}

/**
 * Recompute the visibility cache against new metadata/grants and invalidate EXACTLY the actors whose
 * effective visibility surface changed. Synchronous and pure.
 *
 *   - An actor present before but absent now (left the session) is dropped from the cache.
 *   - An actor absent before but present now is invalidated (must compute).
 *   - Otherwise an actor is invalidated iff their visibility fingerprint changed — i.e. a now-hidden
 *     section/field/entity, a newly-visible surface, or a changed `shared`-delivery/grant state.
 *
 * The DM is included for completeness but their fingerprint never changes from a visibility edit
 * (the DM sees everything), so a DM-only metadata churn does not spuriously invalidate them.
 */
export function invalidateVisibilityCache(
	previous: VisibilityCache,
	nextInputs: VisibilityCacheInputs,
): VisibilityInvalidationResult {
	const nextActorIds = Object.keys(nextInputs.permissions.actors);
	const nextFingerprints = new Map<ActorId, string>();
	for (const actorId of nextActorIds) {
		const actor = nextInputs.permissions.actors[actorId]!;
		nextFingerprints.set(
			actorId,
			computeActorVisibilityFingerprint(
				actor,
				nextInputs.metadata,
				nextInputs.surfaces,
				nextInputs.permissions,
			),
		);
	}

	const invalidated = new Set<ActorId>();
	const entries: Record<ActorId, VisibilityCacheEntry> = {};
	for (const actorId of nextActorIds) {
		const nextFingerprint = nextFingerprints.get(actorId)!;
		const prevEntry = previous.entries[actorId];
		if (!prevEntry || prevEntry.fingerprint !== nextFingerprint) invalidated.add(actorId);
		entries[actorId] = { actorId, fingerprint: nextFingerprint };
	}
	for (const actorId of Object.keys(previous.entries)) {
		if (!nextFingerprints.has(actorId)) invalidated.add(actorId);
	}

	return {
		invalidatedActorIds: [...invalidated].sort(),
		cache: { entries },
		failedClosed: false,
	};
}

/**
 * True when an actor's cached visibility entry is still valid for the given inputs. A stale entry
 * (fingerprint mismatch) or a missing entry reads as invalid, so the caller fails closed and
 * re-evaluates visibility before serving cached data or catch-up operations (PERM-012). A previously
 * cached visibility that has since been narrowed is therefore NEVER served.
 */
/**
 * Bridge granular visibility metadata to the entity-level {@link ConsistencyEntityRecord} shape the
 * EXISTING capability cache (`capability-cache.ts`) and entity consistency audit consume. Only the
 * ENTITY-level rule maps (those layers reason at entity granularity); section/field narrowing is
 * tracked by the visibility cache above. This lets an entity-level visibility change flow straight
 * into the existing capability-cache invalidation (whose trigger list already names "visibility")
 * without duplicating that engine. Fail closed: absent entity rule ⇒ `dm-only`.
 */
export function toConsistencyEntityRecords(
	metadata: readonly EntityVisibilityMetadata[],
): ConsistencyEntityRecord[] {
	return metadata.map((meta) => {
		const level: VisibilityLevel = normalizeVisibilityLevel(meta.entity?.level);
		const record: ConsistencyEntityRecord = {
			entityType: meta.entityType,
			entityId: meta.entityId,
			visibility: level,
		};
		if (level === 'shared') record.sharedWith = [...(meta.entity?.sharedWith ?? [])];
		return record;
	});
}

export function isVisibilityCacheEntryValid(
	cache: VisibilityCache,
	actorId: ActorId,
	inputs: VisibilityCacheInputs,
): boolean {
	const actor = inputs.permissions.actors[actorId];
	if (!actor) return false;
	const entry = cache.entries[actorId];
	if (!entry) return false;
	return (
		entry.fingerprint ===
		computeActorVisibilityFingerprint(actor, inputs.metadata, inputs.surfaces, inputs.permissions)
	);
}
