import { containsSensitiveData } from '../diagnostics/redaction';

/**
 * SYNC-007 + SYNC-008 — the TYPED, FAIL-CLOSED data-classification registry that decides what is
 * eligible to leave the device for cloud storage and what stays DEVICE-LOCAL.
 *
 * Architecture Contract 2 (Cloud Storage Model) names exactly what cloud storage may contain and
 * what is device-local only. This module is the single structured source of that policy. It is pure
 * Processing-Core policy: a deterministic function over the data category + whether cloud sync is
 * ENABLED for the vault. It moves no bytes and touches no storage (ADR-014: live cloud transport is
 * deferred — this is the classification SEAM a future transport plugs into).
 *
 * Three hard, fail-closed invariants the tests prove:
 *
 *   1. A DEVICE-LOCAL category is NEVER classified `cloud-syncable` — for any input, ever.
 *   2. An UNKNOWN / unclassified category defaults to `device-local` (never cloud).
 *   3. When cloud sync is DISABLED, NOTHING is eligible for cloud — the eligible cloud set is empty.
 *
 * The device-local secret/path categories reuse the diagnostics redaction guard (`redaction.ts`) to
 * PROVE a generated cloud payload carries no raw absolute paths or auth tokens (SYNC-008 AC1).
 */

/** Whether a data category may be stored in the cloud (when enabled) or must stay on the device. */
export type StorageClassification = 'cloud-syncable' | 'device-local';

/**
 * Every known storage data category. CLOUD-SYNCABLE categories mirror Contract 2's "Cloud storage
 * contains" list; DEVICE-LOCAL categories mirror its "Device-local only" / "Cloud storage must not
 * contain" lists. The union is `string` so an unrecognized future category is accepted by the
 * classifier and fails closed to device-local rather than being a type error at a call site.
 */
export type StorageDataCategory =
	// --- cloud-syncable (only when cloud sync is enabled for the vault) ---
	| 'cloud-vault-identity' // cloud-enabled vault identity + sync metadata
	| 'durable-operation-log' // the durable operation log
	| 'compacted-snapshot' // compacted entity snapshots
	| 'collaboration-session-state' // session state intended for collaboration
	| 'permission-metadata' // permission grants, visibility metadata, capability-set schema versions
	| 'asset-blob' // content-addressed asset blobs + metadata (SYNC-009)
	| 'conflict-record' // conflict records + sync audit metadata
	// --- device-local only (never leaves the device unless explicitly exported by the user) ---
	| 'auth-refresh-token' // auth refresh tokens
	| 'os-credential-record' // OS keychain / credential records
	| 'raw-absolute-path' // raw vault filesystem absolute paths
	| 'rebuildable-index' // local cache indexes that can be rebuilt
	| 'presence-state' // ephemeral presence
	| 'local-diagnostics' // unexported/unsubmitted local diagnostics bundle contents
	| 'temporary-ui-state' // temporary UI state
	| 'device-platform-preference' // device-specific platform profile preferences
	| 'local-mcp-process-state' // local MCP process state
	| 'imported-file-staging' // imported files before the user adds them to the vault
	| (string & {});

/** The canonical, declared classification table. Frozen so the policy cannot be mutated at runtime. */
export const STORAGE_CLASSIFICATION_REGISTRY: Readonly<
	Record<
		Exclude<StorageDataCategory, string & {}>,
		StorageClassification
	>
> = Object.freeze({
	'cloud-vault-identity': 'cloud-syncable',
	'durable-operation-log': 'cloud-syncable',
	'compacted-snapshot': 'cloud-syncable',
	'collaboration-session-state': 'cloud-syncable',
	'permission-metadata': 'cloud-syncable',
	'asset-blob': 'cloud-syncable',
	'conflict-record': 'cloud-syncable',
	'auth-refresh-token': 'device-local',
	'os-credential-record': 'device-local',
	'raw-absolute-path': 'device-local',
	'rebuildable-index': 'device-local',
	'presence-state': 'device-local',
	'local-diagnostics': 'device-local',
	'temporary-ui-state': 'device-local',
	'device-platform-preference': 'device-local',
	'local-mcp-process-state': 'device-local',
	'imported-file-staging': 'device-local',
});

/** The fail-closed default for an unknown/unclassified category: the most private classification. */
export const FAIL_CLOSED_CLASSIFICATION: StorageClassification = 'device-local';

/** The cloud-syncable categories as a typed list (used by callers building eligible-cloud sets). */
export const CLOUD_SYNCABLE_CATEGORIES: readonly StorageDataCategory[] = Object.freeze(
	(Object.keys(STORAGE_CLASSIFICATION_REGISTRY) as StorageDataCategory[]).filter(
		(category) => STORAGE_CLASSIFICATION_REGISTRY[category as never] === 'cloud-syncable',
	),
);

/** The device-local categories as a typed list. */
export const DEVICE_LOCAL_CATEGORIES: readonly StorageDataCategory[] = Object.freeze(
	(Object.keys(STORAGE_CLASSIFICATION_REGISTRY) as StorageDataCategory[]).filter(
		(category) => STORAGE_CLASSIFICATION_REGISTRY[category as never] === 'device-local',
	),
);

/** True when `category` is a declared (recognized) category in the registry. */
export function isKnownStorageCategory(category: StorageDataCategory): boolean {
	return Object.prototype.hasOwnProperty.call(STORAGE_CLASSIFICATION_REGISTRY, category);
}

/**
 * The DECLARED classification of a category, IGNORING whether cloud sync is enabled. Fails closed:
 * an unknown category returns `device-local`. Use {@link classifyStorageCategory} for the effective
 * (enablement-aware) classification used to decide eligibility for a cloud write.
 */
export function declaredClassification(category: StorageDataCategory): StorageClassification {
	if (!isKnownStorageCategory(category)) return FAIL_CLOSED_CLASSIFICATION;
	return STORAGE_CLASSIFICATION_REGISTRY[category as never];
}

/**
 * The EFFECTIVE classification of a category given whether cloud sync is enabled for the vault. This
 * is the function the storage layer consults before any cloud write. Fails closed three ways:
 *
 *   - an unknown category ⇒ `device-local` (never cloud);
 *   - a device-local category ⇒ `device-local` always, regardless of enablement;
 *   - when cloud sync is DISABLED ⇒ EVERYTHING is `device-local` (nothing is eligible for cloud).
 *
 * Only when cloud sync is enabled AND the category is declared cloud-syncable is the result
 * `cloud-syncable`.
 */
export function classifyStorageCategory(
	category: StorageDataCategory,
	cloudSyncEnabled: boolean,
): StorageClassification {
	if (!cloudSyncEnabled) return 'device-local';
	return declaredClassification(category);
}

/** True only when the category is eligible to be written to cloud storage right now. */
export function isCloudEligible(category: StorageDataCategory, cloudSyncEnabled: boolean): boolean {
	return classifyStorageCategory(category, cloudSyncEnabled) === 'cloud-syncable';
}

/**
 * The set of categories ELIGIBLE for cloud storage given the enablement flag. When cloud sync is
 * disabled this is ALWAYS empty (SYNC-007 AC1 — no cloud writes are attempted). When enabled it is
 * exactly the declared cloud-syncable categories. Unknown categories are never included.
 */
export function eligibleCloudCategories(cloudSyncEnabled: boolean): StorageDataCategory[] {
	if (!cloudSyncEnabled) return [];
	return [...CLOUD_SYNCABLE_CATEGORIES];
}

/** A single classified storage record the partitioner / cloud-write planner operates on. */
export interface ClassifiedStorageRecord {
	/** Stable id of the record (used only for routing/diagnostics; never its contents). */
	id: string;
	category: StorageDataCategory;
}

export interface StorageClassificationPlan {
	/** Records eligible for a cloud write (empty when cloud sync is disabled). */
	cloudSyncable: ClassifiedStorageRecord[];
	/** Records that must stay on this device. */
	deviceLocal: ClassifiedStorageRecord[];
	/** Records whose category was not recognized; they fail closed into `deviceLocal` too. */
	unknownCategoryIds: string[];
}

/**
 * Partition a batch of records into the cloud-eligible set and the device-local set, fail-closed.
 * Unknown categories land in `deviceLocal` AND are reported in `unknownCategoryIds` so a diagnostic
 * can surface an unclassified category without ever shipping it to the cloud. When cloud sync is
 * disabled, `cloudSyncable` is empty by construction.
 */
export function partitionStorageRecords(
	records: readonly ClassifiedStorageRecord[],
	cloudSyncEnabled: boolean,
): StorageClassificationPlan {
	const cloudSyncable: ClassifiedStorageRecord[] = [];
	const deviceLocal: ClassifiedStorageRecord[] = [];
	const unknownCategoryIds: string[] = [];

	for (const record of records) {
		if (!isKnownStorageCategory(record.category)) {
			unknownCategoryIds.push(record.id);
		}
		if (isCloudEligible(record.category, cloudSyncEnabled)) {
			cloudSyncable.push(record);
		} else {
			deviceLocal.push(record);
		}
	}

	return { cloudSyncable, deviceLocal, unknownCategoryIds };
}

/** Why a generated cloud payload was rejected as carrying data that must never leave the device. */
export type CloudPayloadLeakReason =
	| 'device-local-category' // a record classified device-local appeared in the cloud payload
	| 'sensitive-data'; // the payload still contains a raw absolute path or auth-token-shaped value

export interface CloudPayloadLeakFinding {
	recordId: string;
	category: StorageDataCategory;
	reason: CloudPayloadLeakReason;
}

/**
 * A generated cloud payload record: a classified record plus the value that would be transmitted.
 * The classifier inspects the VALUE only through the redaction guard (no content is read into the
 * finding) so this assertion is safe to run on any payload.
 */
export interface CloudPayloadRecord extends ClassifiedStorageRecord {
	value: unknown;
}

/**
 * Inspect a generated cloud payload for leaks, fail-closed (SYNC-008 AC1). A record leaks when:
 *
 *   - its category is NOT cloud-syncable (device-local data must never be in a cloud payload), OR
 *   - its value still contains a raw absolute filesystem path or an auth-token-shaped secret, as
 *     detected by the diagnostics redaction guard (`containsSensitiveData`).
 *
 * Returns every finding so the test suite and a pre-send guard can fail closed. An empty array
 * means the payload is clean. This is evidence, not aspiration: the same guard that scrubs support
 * bundles proves the cloud payload carries no paths/tokens.
 */
export function findCloudPayloadLeaks(
	payload: readonly CloudPayloadRecord[],
	cloudSyncEnabled: boolean,
): CloudPayloadLeakFinding[] {
	const findings: CloudPayloadLeakFinding[] = [];
	for (const record of payload) {
		if (!isCloudEligible(record.category, cloudSyncEnabled)) {
			findings.push({ recordId: record.id, category: record.category, reason: 'device-local-category' });
			// A device-local record is already disqualified; still check its value below would be
			// redundant, so continue to the next record.
			continue;
		}
		if (containsSensitiveData(record.value)) {
			findings.push({ recordId: record.id, category: record.category, reason: 'sensitive-data' });
		}
	}
	return findings;
}

/**
 * Assert a generated cloud payload carries no device-local data and no raw paths/tokens. Throws with
 * an actionable message naming the first offending record. This is the fail-closed guard the cloud
 * write path calls before any record leaves the device, and the assertion the tests use as hard
 * evidence (SYNC-007 AC1 + SYNC-008 AC1).
 */
export function assertCloudPayloadIsClean(
	payload: readonly CloudPayloadRecord[],
	cloudSyncEnabled: boolean,
): void {
	const findings = findCloudPayloadLeaks(payload, cloudSyncEnabled);
	if (findings.length > 0) {
		const first = findings[0]!;
		const detail =
			first.reason === 'device-local-category'
				? `category "${first.category}" is device-local and must never be written to cloud storage`
				: `it still contains a raw absolute path or auth-token-shaped secret`;
		throw new Error(
			`Cloud payload record ${first.recordId} must not leave the device: ${detail}. ` +
				`Device-local data (auth tokens, OS credentials, raw paths, rebuildable indexes, presence, ` +
				`local diagnostics, temporary UI state) stays on the device unless the user explicitly exports it.`,
		);
	}
}
