import type { ActorId } from '../state/ids';
import { containsSensitiveData } from '../diagnostics/redaction';
import {
	declaredClassification,
	type StorageDataCategory,
} from '../sync/storage-classification';
import {
	ALLOWED_SERVER_METADATA_CLASSES,
	type AllowedServerMetadataClass,
} from './cloud-security-model';

/**
 * SEC-012 — CLOUD KEY CUSTODY, ROTATION, PARTICIPANT REVOCATION, AND RECOVERY — ENFORCED BY TESTS. Before any
 * cloud sync/collaboration release, these behaviors must be ENFORCED by tests (SEC-012 statement; Vision
 * Cloud Sync & Multi-User; Feature Inventory I7 encryption). This module is the deterministic POLICY those
 * tests assert against, composing the seams already built:
 *
 *   - the SYNC-017 cloud-sync gate (encryption / key custody / rotation / recovery prerequisites) and the
 *     SEC-009 decision record (this epic) — which declare the model; and
 *   - the COLLAB-014 cache-privacy seal model — which makes a departed participant's session cache unreadable.
 *
 * Per ADR-014 the real crypto is DEFERRED. This module models the LOGICAL key-epoch behavior — WHICH keys a
 * participant holds and WHETHER a given key can decrypt a given content epoch — WITHOUT a cipher. The three
 * SEC-012 invariants it proves, fail closed:
 *
 *   1. ROTATION ON REVOCATION (AC1): when a participant is removed and keys rotate, content encrypted under
 *      the NEW key epoch cannot be decrypted with the removed participant's (old-epoch) credentials.
 *   2. RECOVERY SCOPE (AC2): a recovery flow restores ONLY the approved scope and never another vault,
 *      tenant, or participant stream.
 *   3. SERVER TRUST BOUNDARY (AC3): if cloud storage is compromised, the exposed plaintext + metadata classes
 *      match the documented server trust boundary (no hidden content beyond the allowed metadata).
 *
 * Pure Processing-Core policy: deterministic over plain data. No DOM, Node, Svelte, or crypto APIs.
 */

export const KEY_CUSTODY_SCHEMA_VERSION = 1 as const;

// --- Key epochs + rotation on revocation (SEC-012 AC1) --------------------------------------------

/**
 * A logical KEY EPOCH: a monotonically increasing generation of the session/content key. A participant holds
 * the key for a RANGE of epochs `[joinedAtEpoch, revokedAtEpoch)` — they can decrypt content encrypted under
 * an epoch they hold, and nothing else. Rotation BUMPS the current epoch; a revoked participant's epoch range
 * ENDS at the rotation, so they cannot decrypt the new epoch (fail closed).
 */
export interface ParticipantKeyHolding {
	participantActorId: ActorId;
	/** The first key epoch this participant can decrypt (inclusive). */
	joinedAtEpoch: number;
	/**
	 * The epoch at which this participant was REVOKED (exclusive upper bound on what they can decrypt). A
	 * still-active participant has `null` — they hold every epoch from `joinedAtEpoch` onward. A revoked
	 * participant can decrypt only epochs strictly BELOW this value.
	 */
	revokedAtEpoch: number | null;
}

/**
 * Whether a participant's held key can decrypt content encrypted under `contentEpoch`. Fail closed:
 *
 *   - content BELOW their `joinedAtEpoch` (before they joined) is NOT decryptable;
 *   - a revoked participant can decrypt only epochs STRICTLY BELOW `revokedAtEpoch` — content at/after the
 *     rotation epoch (SEC-012 AC1) is NOT decryptable with their credentials.
 *
 * This is the logical proof that rotating the key on revocation locks the removed participant out of newly
 * delivered/synced content, without a cipher.
 */
export function canDecryptEpoch(holding: ParticipantKeyHolding, contentEpoch: number): boolean {
	if (contentEpoch < holding.joinedAtEpoch) return false;
	if (holding.revokedAtEpoch !== null && contentEpoch >= holding.revokedAtEpoch) return false;
	return true;
}

/**
 * Rotate the session key on a participant's revocation: bump the current epoch and END the revoked
 * participant's epoch range at the OLD epoch, so any content encrypted under the NEW epoch is undecryptable
 * with their credentials (SEC-012 AC1). Pure: returns the new current epoch + the updated holding; the input
 * holding is never mutated. The remaining participants keep their (open-ended) holdings and roll forward.
 */
export interface KeyRotationResult {
	/** The new current key epoch (content from here on is encrypted under this epoch). */
	newCurrentEpoch: number;
	/** The revoked participant's updated holding (epoch range now closed at the old epoch). */
	revokedHolding: ParticipantKeyHolding;
}

export function rotateKeyOnRevocation(
	currentEpoch: number,
	revokedHolding: ParticipantKeyHolding,
): KeyRotationResult {
	const newCurrentEpoch = currentEpoch + 1;
	return {
		newCurrentEpoch,
		// The revoked participant can decrypt only epochs strictly below the rotation point (the old epoch).
		revokedHolding: { ...revokedHolding, revokedAtEpoch: newCurrentEpoch },
	};
}

/**
 * SEC-012 AC1 — assert that a removed participant CANNOT decrypt content encrypted under the post-rotation
 * epoch. Throws fail-closed if their credentials would still open new content. The hard evidence the tests
 * assert against.
 */
export function assertRevokedCannotDecryptNewEpoch(
	revokedHolding: ParticipantKeyHolding,
	newCurrentEpoch: number,
): void {
	if (canDecryptEpoch(revokedHolding, newCurrentEpoch)) {
		throw new Error(
			`Revoked participant ${revokedHolding.participantActorId} can still decrypt the post-rotation epoch ` +
				`${newCurrentEpoch}; key rotation on revocation failed to lock them out (SEC-012 AC1).`,
		);
	}
}

// --- Recovery scope isolation (SEC-012 AC2) -------------------------------------------------------

/** The SCOPE a recovery flow is approved to restore — the ONLY content a recovery may touch (SEC-012 AC2). */
export interface RecoveryScope {
	vaultId: string;
	tenantId: string;
	/** The participant whose stream/keys the recovery restores (their OWN scope only). */
	participantActorId: ActorId;
}

/** A content item a recovery flow proposes to restore, tagged with the scope it belongs to. */
export interface RecoverableItem {
	id: string;
	vaultId: string;
	tenantId: string;
	participantActorId: ActorId;
}

/** Why a recovery item is OUT OF the approved scope (and must be excluded, fail closed). */
export type RecoveryScopeViolationReason =
	| 'cross-vault'
	| 'cross-tenant'
	| 'cross-participant-stream';

export interface RecoveryScopeViolation {
	itemId: string;
	reason: RecoveryScopeViolationReason;
}

/**
 * Partition recovery items into those WITHIN the approved scope and those that VIOLATE it (another vault,
 * tenant, or participant stream — SEC-012 AC2). Fail closed: any mismatch is a violation and is EXCLUDED
 * from the restored set. Returns both lists so a test/guard can prove no cross-scope content is restored.
 */
export interface RecoveryScopeResult {
	restored: RecoverableItem[];
	violations: RecoveryScopeViolation[];
}

export function partitionRecoveryScope(
	scope: RecoveryScope,
	items: readonly RecoverableItem[],
): RecoveryScopeResult {
	const restored: RecoverableItem[] = [];
	const violations: RecoveryScopeViolation[] = [];
	for (const item of items) {
		if (item.vaultId !== scope.vaultId) {
			violations.push({ itemId: item.id, reason: 'cross-vault' });
			continue;
		}
		if (item.tenantId !== scope.tenantId) {
			violations.push({ itemId: item.id, reason: 'cross-tenant' });
			continue;
		}
		if (item.participantActorId !== scope.participantActorId) {
			violations.push({ itemId: item.id, reason: 'cross-participant-stream' });
			continue;
		}
		restored.push(item);
	}
	return { restored, violations };
}

/**
 * SEC-012 AC2 — assert a recovery restores ONLY the approved scope. Throws fail-closed naming the first
 * out-of-scope item, so a recovery that would expose another vault/tenant/participant stream cannot proceed.
 */
export function assertRecoveryWithinScope(
	scope: RecoveryScope,
	items: readonly RecoverableItem[],
): void {
	const { violations } = partitionRecoveryScope(scope, items);
	if (violations.length > 0) {
		const first = violations[0]!;
		throw new Error(
			`Recovery item ${first.itemId} is out of the approved recovery scope (${first.reason}); a recovery ` +
				`flow must never expose another vault, tenant, or participant stream (SEC-012 AC2).`,
		);
	}
}

// --- Server trust boundary under compromise (SEC-012 AC3) -----------------------------------------

/** What class of data a piece of cloud-stored content is, for the compromise threat model. */
export type CloudStoredDataClass = AllowedServerMetadataClass | 'ciphertext' | 'plaintext-content';

/** One cloud-stored artifact, as it would be EXPOSED if cloud storage were compromised. */
export interface CloudStoredArtifact {
	id: string;
	dataClass: CloudStoredDataClass;
	/** The value an attacker would read from the compromised store. */
	value: unknown;
}

/** Why a compromised-store artifact EXCEEDS the documented server trust boundary (SEC-012 AC3). */
export type TrustBoundaryViolationReason =
	| 'plaintext-content-exposed' // hidden content is readable in the compromised store (must be ciphertext)
	| 'metadata-class-not-documented' // a metadata class outside the documented allowed set is exposed
	| 'ciphertext-leaks-plaintext'; // an artifact labeled ciphertext still contains readable secret/content

export interface TrustBoundaryExposure {
	artifactId: string;
	dataClass: CloudStoredDataClass;
	reason: TrustBoundaryViolationReason;
}

/**
 * SEC-012 AC3 — evaluate, against the approved key-custody model, what a COMPROMISED cloud store would expose
 * and whether it matches the documented server trust boundary. Fail closed — an artifact EXCEEDS the boundary
 * when:
 *
 *   - it is `plaintext-content` (hidden content readable in the store — under an E2EE model this must be
 *     ciphertext), OR
 *   - it is a metadata class OUTSIDE the documented `allowedMetadata` set, OR
 *   - it is labeled `ciphertext` but its value still contains a readable secret/content (the "encryption"
 *     leaks), detected by the diagnostics redaction guard.
 *
 * `allowedMetadata` defaults to the canonical {@link ALLOWED_SERVER_METADATA_CLASSES} (the documented
 * E2EE boundary). Returns every exposure so a test proves the exposed classes match the documented boundary.
 */
export function evaluateServerTrustBoundary(
	artifacts: readonly CloudStoredArtifact[],
	allowedMetadata: readonly AllowedServerMetadataClass[] = ALLOWED_SERVER_METADATA_CLASSES,
): TrustBoundaryExposure[] {
	const allowed = new Set<string>(allowedMetadata);
	const exposures: TrustBoundaryExposure[] = [];
	for (const artifact of artifacts) {
		if (artifact.dataClass === 'plaintext-content') {
			exposures.push({
				artifactId: artifact.id,
				dataClass: artifact.dataClass,
				reason: 'plaintext-content-exposed',
			});
			continue;
		}
		if (artifact.dataClass === 'ciphertext') {
			// Ciphertext is permitted in the store, but it must NOT actually contain readable content/secret.
			if (containsSensitiveData(artifact.value)) {
				exposures.push({
					artifactId: artifact.id,
					dataClass: artifact.dataClass,
					reason: 'ciphertext-leaks-plaintext',
				});
			}
			continue;
		}
		// Otherwise it is a metadata class: it must be in the documented allowed set.
		if (!allowed.has(artifact.dataClass)) {
			exposures.push({
				artifactId: artifact.id,
				dataClass: artifact.dataClass,
				reason: 'metadata-class-not-documented',
			});
		}
	}
	return exposures;
}

/**
 * SEC-012 AC3 — assert a compromised cloud store would expose ONLY ciphertext + documented metadata classes.
 * Throws fail-closed naming the first artifact that exceeds the documented boundary. Hard evidence that the
 * exposed plaintext/metadata classes match the documented server trust boundary.
 */
export function assertCompromiseMatchesTrustBoundary(
	artifacts: readonly CloudStoredArtifact[],
	allowedMetadata: readonly AllowedServerMetadataClass[] = ALLOWED_SERVER_METADATA_CLASSES,
): void {
	const exposures = evaluateServerTrustBoundary(artifacts, allowedMetadata);
	if (exposures.length > 0) {
		const first = exposures[0]!;
		throw new Error(
			`Cloud artifact ${first.artifactId} (class "${first.dataClass}") exceeds the documented server trust ` +
				`boundary if cloud storage is compromised: ${first.reason} (SEC-012 AC3).`,
		);
	}
}

/**
 * Whether the storage category a key-bearing record occupies is device-local — keys/credentials must never be
 * cloud-syncable. Composes the SYNC classification registry, mirroring the SEC-004 secret-custody invariant
 * for the key-custody surface. Fail closed: an unknown category resolves to device-local.
 */
export function keyMaterialStaysDeviceLocal(category: StorageDataCategory): boolean {
	return declaredClassification(category) === 'device-local';
}
