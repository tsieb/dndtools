import {
	ALLOWED_SERVER_METADATA_CLASSES,
	CLOUD_SECURITY_MODEL_SCHEMA_VERSION,
	evaluateCloudReleaseGate,
	type CloudReleaseGateResult,
	type CloudSecurityDecisionRecord,
} from './cloud-security-model';
import type { CloudSyncSecurityModel } from '../sync/cloud-sync-gate';

/**
 * ADR-017 (concrete crypto) + ADR-015 (Accepted) + ADR-026 (opt-in vault privacy modes) — THE
 * RELEASE-APPROVED cloud security models for DND Tools. ADR-026 makes the model PER-VAULT: the user
 * explicitly chooses between two modes at onboarding, and these are the populated records each mode
 * selects between. Supplying a record to the SYNC-017 / SEC-009 gates opens (or keeps blocking) them
 * with NO call-site change — exactly as those modules were designed to be plugged into.
 *
 * PRIVATE MODE (`private-e2ee`) — today's shipped model, truthful against the real E2EE in
 * {@link ../security/vault-crypto}:
 *   - encryption at rest + in transit: every cloud artifact is AES-256-GCM sealed client-side before it
 *     leaves the device (vault-crypto), so the server stores and transports only ciphertext.
 *   - key custody: CLIENT-HELD. The 256-bit content keys live only in the OS credential store /
 *     device-local encrypted storage; the server never receives key material (SEC-004).
 *   - key rotation: supported. On revocation the keyring rotates to a fresh random key at a new epoch
 *     (vault-crypto `rotateVaultKeyring` composing SEC-012 `rotateKeyOnRevocation`); the revoked party
 *     never holds the new epoch key, so new content is cryptographically undecryptable to them.
 *   - recovery: SUPPORTED (user-managed, per ADR-026 — previously unsupported-by-design). The user can
 *     export a passphrase-sealed recovery-key file (vault-crypto `sealKeyringRecoveryFile`) and import
 *     it on another device. There is still NO provider-side escrow: losing every device AND the
 *     exported file (or its passphrase) still means the encrypted cloud copy cannot be recovered, and
 *     the app surfaces exactly that at enable time.
 *
 * CLOUD-ENHANCED MODE (`cloud-enhanced`) — the ADR-026 server-readable model: encrypted in transit
 * (TLS) and at rest under SERVER-MANAGED KMS keys (`server-side-encrypted` / `provider-held`), so
 * consented server-side feature code (managed AI/RAG, search, keyless browser access) can read vault
 * content. Its record ships `approved: false` — DELIBERATELY. Phase 1 (current) is consent capture
 * only: the transport for BOTH modes remains the E2EE pipeline, and the unapproved record keeps
 * {@link evaluateCloudEnhancedRelease} BLOCKED, so no server-readable code path can open until the
 * phase-2 security review (docs/security/vault-privacy-modes-threat-model.md) flips `approved`.
 */

/**
 * ADR-026 — the per-vault privacy mode the user explicitly chooses at onboarding. An absent or
 * unrecognized stored value MUST resolve to `private-e2ee` (fail closed: trust never widens by
 * accident); only a recorded, explicit consent selects `cloud-enhanced`.
 */
export type VaultPrivacyMode = 'private-e2ee' | 'cloud-enhanced';

export const VAULT_PRIVACY_MODES: readonly VaultPrivacyMode[] = Object.freeze([
	'private-e2ee',
	'cloud-enhanced',
]);

/** Type guard for untrusted stored mode values (localStorage, wire). */
export function isVaultPrivacyMode(value: unknown): value is VaultPrivacyMode {
	return (VAULT_PRIVACY_MODES as readonly unknown[]).includes(value);
}

/** The release-approved SYNC-017 security model for PRIVATE vaults. Supplying this opens {@link evaluateCloudSyncGate}. */
export const DNDTOOLS_CLOUD_SYNC_SECURITY_MODEL: CloudSyncSecurityModel = Object.freeze({
	encryptionAtRest: true,
	encryptionInTransit: true,
	keyCustodyDeclared: true,
	keyRotationSupported: true,
	recovery: 'supported',
});

/** The release-approved SEC-009 decision record for PRIVATE vaults. Complete + approved + internally consistent (E2EE ⇒ client-held). */
export const DNDTOOLS_CLOUD_SECURITY_DECISION_RECORD: CloudSecurityDecisionRecord = Object.freeze({
	schemaVersion: CLOUD_SECURITY_MODEL_SCHEMA_VERSION,
	approved: true,
	encryption: 'end-to-end-encrypted',
	keyCustodian: 'client-held',
	credentialRotationDeclared: true,
	recovery: 'supported',
	allowedServerMetadata: Object.freeze([...ALLOWED_SERVER_METADATA_CLASSES]),
	decisionRecordRef: 'docs/adr/026-opt-in-vault-privacy-modes.md',
});

/**
 * The declared SYNC-017 model for CLOUD-ENHANCED vaults (ADR-026 phase 2 target): TLS in transit,
 * SSE-KMS at rest, provider-held custody with managed rotation, account-based recovery. Honest as a
 * DECLARATION of the target; enablement still turns on the decision record below, which is unapproved.
 */
export const DNDTOOLS_CLOUD_ENHANCED_SYNC_SECURITY_MODEL: CloudSyncSecurityModel = Object.freeze({
	encryptionAtRest: true,
	encryptionInTransit: true,
	keyCustodyDeclared: true,
	keyRotationSupported: true,
	recovery: 'supported',
});

/**
 * The SEC-009 decision record for CLOUD-ENHANCED vaults. `approved: false` is the phase-1 posture and
 * is LOAD-BEARING: it keeps {@link evaluateCloudEnhancedRelease} blocked and makes the mode-aware
 * `assertServerVisibilityForRecord` fail closed, so consent UX can ship while every server-readable
 * path stays unreleasable. Flipping `approved` requires the phase-2 security review (ADR-026).
 * `allowedServerMetadata` is empty because the class set is only meaningful under E2EE — under a
 * server-readable model the server reads content by consent, not a metadata subset.
 */
export const DNDTOOLS_CLOUD_ENHANCED_SECURITY_DECISION_RECORD: CloudSecurityDecisionRecord =
	Object.freeze({
		schemaVersion: CLOUD_SECURITY_MODEL_SCHEMA_VERSION,
		approved: false,
		encryption: 'server-side-encrypted',
		keyCustodian: 'provider-held',
		credentialRotationDeclared: true,
		recovery: 'supported',
		allowedServerMetadata: Object.freeze([]),
		decisionRecordRef: 'docs/adr/026-opt-in-vault-privacy-modes.md',
	});

/**
 * ADR-026 — the ONLY sanctioned mapping from a vault's privacy mode to its decision record. Call
 * sites must never pair a mode with a record by hand; routing through this selector is what makes
 * "a Private vault can never be evaluated under the relaxed record" auditable.
 */
export function securityDecisionRecordForVaultMode(
	mode: VaultPrivacyMode,
): CloudSecurityDecisionRecord {
	return mode === 'cloud-enhanced'
		? DNDTOOLS_CLOUD_ENHANCED_SECURITY_DECISION_RECORD
		: DNDTOOLS_CLOUD_SECURITY_DECISION_RECORD;
}

/** The SYNC-017 model a vault's privacy mode declares (companion to {@link securityDecisionRecordForVaultMode}). */
export function securityModelForVaultMode(mode: VaultPrivacyMode): CloudSyncSecurityModel {
	return mode === 'cloud-enhanced'
		? DNDTOOLS_CLOUD_ENHANCED_SYNC_SECURITY_MODEL
		: DNDTOOLS_CLOUD_SYNC_SECURITY_MODEL;
}

/**
 * Evaluate the SEC-009 cloud-release gate against the release-approved PRIVATE record + model. With the
 * shipped crypto this returns `canRelease: true` — the machine-checkable evidence that ADR-015 may stay
 * Accepted.
 */
export function evaluateDndtoolsCloudRelease(): CloudReleaseGateResult {
	return evaluateCloudReleaseGate(DNDTOOLS_CLOUD_SECURITY_DECISION_RECORD, DNDTOOLS_CLOUD_SYNC_SECURITY_MODEL);
}

/**
 * Evaluate the SEC-009 release gate for the CLOUD-ENHANCED mode. Returns `canRelease: false` today
 * (the record is unapproved) — the machine-checkable proof that ADR-026 phase 1 ships consent without
 * shipping a server-readable path. When phase 2 lands with its security review, flipping the record's
 * `approved` opens this gate with no call-site change.
 */
export function evaluateCloudEnhancedRelease(): CloudReleaseGateResult {
	return evaluateCloudReleaseGate(
		DNDTOOLS_CLOUD_ENHANCED_SECURITY_DECISION_RECORD,
		DNDTOOLS_CLOUD_ENHANCED_SYNC_SECURITY_MODEL,
	);
}
