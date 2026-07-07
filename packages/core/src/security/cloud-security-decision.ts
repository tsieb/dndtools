import {
	ALLOWED_SERVER_METADATA_CLASSES,
	CLOUD_SECURITY_MODEL_SCHEMA_VERSION,
	evaluateCloudReleaseGate,
	type CloudReleaseGateResult,
	type CloudSecurityDecisionRecord,
} from './cloud-security-model';
import type { CloudSyncSecurityModel } from '../sync/cloud-sync-gate';

/**
 * ADR-017 (concrete crypto) + ADR-015 (Accepted) — THE RELEASE-APPROVED cloud security model for DND
 * Tools, made TRUTHFUL by the real E2EE in {@link ../security/vault-crypto}. These are the populated
 * mirrors of the fail-closed defaults (`UNMET_CLOUD_SYNC_SECURITY_MODEL` /
 * `UNDECLARED_CLOUD_SECURITY_DECISION_RECORD`): supplying them to the SYNC-017 / SEC-009 gates opens
 * them with NO call-site change, exactly as those modules were designed to be plugged into.
 *
 * The declaration is honest against the shipped implementation:
 *   - encryption at rest + in transit: every cloud artifact is AES-256-GCM sealed client-side before it
 *     leaves the device (vault-crypto), so the server stores and transports only ciphertext.
 *   - key custody: CLIENT-HELD. The 256-bit content keys live only in the OS credential store /
 *     device-local encrypted storage; the server never receives key material (SEC-004).
 *   - key rotation: supported. On revocation the keyring rotates to a fresh random key at a new epoch
 *     (vault-crypto `rotateVaultKeyring` composing SEC-012 `rotateKeyOnRevocation`); the revoked party
 *     never holds the new epoch key, so new content is cryptographically undecryptable to them.
 *   - recovery: UNSUPPORTED-BY-DESIGN (a valid declared limitation per SYNC-017 AC3). With no key
 *     escrow, loss of every device + its local key means the encrypted CLOUD copy cannot be recovered;
 *     local vault data is unaffected. The app surfaces this limitation at enable time.
 */

/** The release-approved SYNC-017 security model. Supplying this opens {@link evaluateCloudSyncGate}. */
export const DNDTOOLS_CLOUD_SYNC_SECURITY_MODEL: CloudSyncSecurityModel = Object.freeze({
	encryptionAtRest: true,
	encryptionInTransit: true,
	keyCustodyDeclared: true,
	keyRotationSupported: true,
	recovery: 'unsupported-by-design',
});

/** The release-approved SEC-009 decision record. Complete + approved + internally consistent (E2EE ⇒ client-held). */
export const DNDTOOLS_CLOUD_SECURITY_DECISION_RECORD: CloudSecurityDecisionRecord = Object.freeze({
	schemaVersion: CLOUD_SECURITY_MODEL_SCHEMA_VERSION,
	approved: true,
	encryption: 'end-to-end-encrypted',
	keyCustodian: 'client-held',
	credentialRotationDeclared: true,
	recovery: 'unsupported-by-design',
	allowedServerMetadata: Object.freeze([...ALLOWED_SERVER_METADATA_CLASSES]),
	decisionRecordRef: 'docs/adr/017-concrete-cloud-e2ee-crypto.md',
});

/**
 * Evaluate the SEC-009 cloud-release gate against the release-approved record + model. With the shipped
 * crypto this returns `canRelease: true` — the machine-checkable evidence that ADR-015 may move to Accepted.
 */
export function evaluateDndtoolsCloudRelease(): CloudReleaseGateResult {
	return evaluateCloudReleaseGate(DNDTOOLS_CLOUD_SECURITY_DECISION_RECORD, DNDTOOLS_CLOUD_SYNC_SECURITY_MODEL);
}
