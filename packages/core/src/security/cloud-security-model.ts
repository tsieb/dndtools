import {
	evaluateCloudSyncGate,
	type CloudSyncSecurityModel,
	type RecoveryDeclaration,
} from '../sync/cloud-sync-gate';
import { containsSensitiveData } from '../diagnostics/redaction';

/**
 * SEC-009 — THE CLOUD SECURITY MODEL DECISION RECORD + RELEASE GATE. Before cloud sync or collaboration is
 * released, the cloud security model MUST declare encryption responsibilities, key custody, server trust
 * boundaries, credential rotation, and recovery tradeoffs (SEC-009 statement; Vision Cloud Sync & Multi-User;
 * OWASP ASVS; NIST session guidance). Until that decision record EXISTS and is approved, release gating for
 * cloud sync/collaboration is BLOCKED (SEC-009 AC3).
 *
 * ADR-014 originally DEFERRED the real encryption / key custody / crypto to a later ADR. This module is the
 * machine-checkable EXPRESSION of that decision-record requirement: a typed {@link CloudSecurityDecisionRecord}
 * (what the prose ADR/threat-model must declare), a fail-closed release gate that BLOCKS cloud release unless
 * a complete, approved record exists AND the {@link CloudSyncSecurityModel} prerequisites are satisfied
 * (composing the existing SYNC-017 {@link evaluateCloudSyncGate}), and the SERVER-VISIBILITY classifier that
 * proves an E2EE claim: when the model claims end-to-end encryption, the server may see ONLY the metadata
 * the record explicitly allows — hidden content is unavailable to server-side code paths (SEC-009 AC4).
 *
 * ADR-017 has since supplied that deferred crypto (AES-256-GCM, client-held per-epoch keys), so ADR-015 is
 * Accepted and the gate now OPENS on a satisfied model — exactly as designed, with no call-site change. The
 * gate remains fail-closed by construction: an incomplete or unapproved record still BLOCKS release, and
 * enablement additionally requires explicit user opt-in and on-device key custody.
 *
 * Pure Processing-Core policy: deterministic over plain data. No DOM, Node, Svelte, or crypto APIs.
 */

export const CLOUD_SECURITY_MODEL_SCHEMA_VERSION = 1 as const;

/** Whether the model claims end-to-end encryption (server cannot read content) or server-readable encryption. */
export type EncryptionResponsibility = 'end-to-end-encrypted' | 'server-side-encrypted' | 'undeclared';

/** Who holds the keys. `client-held` ⇒ the server never sees plaintext keys (required for an E2EE claim). */
export type KeyCustodian = 'client-held' | 'provider-held' | 'split-escrow' | 'undeclared';

/**
 * A metadata CLASS the server is permitted to see even under an E2EE model. These are the ONLY things a
 * server-side code path may read when the model claims end-to-end encryption (SEC-009 AC4). Anything not in
 * this set (note bodies, handout content, hidden titles, secrets) must be ciphertext to the server.
 */
export type AllowedServerMetadataClass =
	| 'vault-id' // the cloud-vault identity (routing)
	| 'participant-id' // participant ids (routing / access control)
	| 'operation-revision' // op revision/sequence numbers (ordering)
	| 'operation-size' // ciphertext size (transport)
	| 'content-hash' // content-addressed asset hashes (dedupe/integrity)
	| 'timestamp'; // server-receipt timestamps (ordering / freshness)

export const ALLOWED_SERVER_METADATA_CLASSES: readonly AllowedServerMetadataClass[] = Object.freeze([
	'vault-id',
	'participant-id',
	'operation-revision',
	'operation-size',
	'content-hash',
	'timestamp',
]);

/**
 * THE CLOUD SECURITY DECISION RECORD (SEC-009). The machine-checkable mirror of the prose ADR / threat model.
 * Every field defaults to the FAIL-CLOSED value when absent, so an incomplete record never passes the gate.
 */
export interface CloudSecurityDecisionRecord {
	schemaVersion: typeof CLOUD_SECURITY_MODEL_SCHEMA_VERSION;
	/** Whether the model is approved for release. Fail closed: an unapproved record blocks cloud release. */
	approved: boolean;
	/** The encryption-at-rest / in-transit / E2EE responsibility declaration. */
	encryption: EncryptionResponsibility;
	/** Who holds the keys. An E2EE claim REQUIRES `client-held` (the server never holds plaintext keys). */
	keyCustodian: KeyCustodian;
	/** Whether credential/session-key rotation is declared (SEC-009 AC2). */
	credentialRotationDeclared: boolean;
	/** The recovery tradeoff declaration (a declared "no recovery" is valid; `undeclared` is not). */
	recovery: RecoveryDeclaration;
	/** The metadata classes the server is allowed to see under the model (only meaningful under E2EE). */
	allowedServerMetadata: readonly AllowedServerMetadataClass[];
	/** A reference to the prose decision record (the ADR / threat-model doc), for traceability. */
	decisionRecordRef: string;
}

/**
 * The fail-closed DEFAULT decision record (ADR-014 defers crypto). Unapproved, undeclared encryption/custody,
 * no rotation, undeclared recovery, no allowed metadata. With this record the release gate is BLOCKED.
 */
export const UNDECLARED_CLOUD_SECURITY_DECISION_RECORD: CloudSecurityDecisionRecord = Object.freeze({
	schemaVersion: CLOUD_SECURITY_MODEL_SCHEMA_VERSION,
	approved: false,
	encryption: 'undeclared',
	keyCustodian: 'undeclared',
	credentialRotationDeclared: false,
	recovery: 'undeclared',
	allowedServerMetadata: Object.freeze([]),
	decisionRecordRef: '',
});

/** A problem that makes a decision record INCOMPLETE (and therefore release-blocking). */
export type CloudSecurityRecordProblemKind =
	| 'not-approved'
	| 'encryption-undeclared'
	| 'key-custody-undeclared'
	| 'rotation-undeclared'
	| 'recovery-undeclared'
	| 'decision-record-ref-missing'
	| 'e2ee-requires-client-held-keys'
	| 'metadata-not-allowed-under-non-e2ee';

export interface CloudSecurityRecordProblem {
	kind: CloudSecurityRecordProblemKind;
	message: string;
}

/**
 * Validate the decision record's COMPLETENESS + internal consistency, fail closed. A record is complete only
 * when it is approved, declares encryption + key custody + rotation + recovery, references the prose record,
 * and is internally consistent (an E2EE claim REQUIRES client-held keys; allowed-server-metadata is only
 * meaningful under E2EE). Any problem blocks cloud release (SEC-009 AC3). Pure: a function of the record.
 */
export function validateCloudSecurityRecord(
	record: CloudSecurityDecisionRecord = UNDECLARED_CLOUD_SECURITY_DECISION_RECORD,
): CloudSecurityRecordProblem[] {
	const problems: CloudSecurityRecordProblem[] = [];
	const add = (kind: CloudSecurityRecordProblemKind, message: string) => problems.push({ kind, message });

	if (!record.approved) add('not-approved', 'The cloud security decision record is not approved for release.');
	if (record.encryption === 'undeclared')
		add('encryption-undeclared', 'Encryption responsibilities (at rest / in transit / E2EE) are not declared.');
	if (record.keyCustodian === 'undeclared')
		add('key-custody-undeclared', 'Key custody (who holds the keys) is not declared.');
	if (!record.credentialRotationDeclared)
		add('rotation-undeclared', 'Credential / session-key rotation behavior is not declared.');
	if (record.recovery === 'undeclared')
		add('recovery-undeclared', 'Recovery tradeoffs (including an intentional "no recovery") are not declared.');
	if (record.decisionRecordRef.trim().length === 0)
		add('decision-record-ref-missing', 'The decision record must reference the prose ADR / threat-model document.');

	// Internal consistency: an end-to-end-encrypted claim is meaningless if the provider holds the keys.
	if (record.encryption === 'end-to-end-encrypted' && record.keyCustodian !== 'client-held') {
		add(
			'e2ee-requires-client-held-keys',
			'An end-to-end-encryption claim requires client-held keys; a provider-held / escrow custodian ' +
				'lets the server read plaintext and contradicts the E2EE claim.',
		);
	}
	// Allowed-server-metadata is only meaningful under E2EE; declaring it under a server-readable model is a
	// contradiction (under server-side encryption the server reads everything, not a metadata subset).
	if (record.encryption !== 'end-to-end-encrypted' && record.allowedServerMetadata.length > 0) {
		add(
			'metadata-not-allowed-under-non-e2ee',
			'allowedServerMetadata is only meaningful under an end-to-end-encrypted model.',
		);
	}

	return problems;
}

/** The result of the cloud-release gate: whether cloud sync/collaboration MAY be released, and why not. */
export interface CloudReleaseGateResult {
	/** Whether cloud sync/collaboration may be released. Fail closed: false unless the record is complete. */
	canRelease: boolean;
	/** The decision-record problems blocking release (empty ⇒ the record is complete). */
	recordProblems: CloudSecurityRecordProblem[];
	/** The unmet SYNC-017 security-model prerequisite ids (empty ⇒ all met). */
	unmetPrerequisiteIds: string[];
	/** A generic, action-oriented summary for the release-gate surface. */
	summary: string;
}

/**
 * SEC-009 AC3 — the CLOUD-RELEASE GATE. Cloud sync/collaboration may be released ONLY when:
 *
 *   1. the decision record is COMPLETE and approved ({@link validateCloudSecurityRecord} returns no problems), AND
 *   2. the SYNC-017 {@link CloudSyncSecurityModel} prerequisites are satisfied (composing the existing gate).
 *
 * Fail closed: with no decision record (the default) release is BLOCKED — exactly the posture this epic
 * proves. When a future ADR supplies a complete approved record + a satisfied model, the gate opens.
 */
export function evaluateCloudReleaseGate(
	record: CloudSecurityDecisionRecord = UNDECLARED_CLOUD_SECURITY_DECISION_RECORD,
	securityModel?: CloudSyncSecurityModel,
): CloudReleaseGateResult {
	const recordProblems = validateCloudSecurityRecord(record);
	const gate = evaluateCloudSyncGate(securityModel ? { securityModel } : {});
	const unmetPrerequisiteIds = [...gate.unmetPrerequisiteIds];
	const canRelease = recordProblems.length === 0 && unmetPrerequisiteIds.length === 0;

	const summary = canRelease
		? 'Cloud sync/collaboration may be released under the approved cloud security model.'
		: `Cloud release is blocked: ${recordProblems.length} decision-record gap(s) and ` +
			`${unmetPrerequisiteIds.length} unmet security prerequisite(s) must be resolved by the ` +
			`release-approved encryption, key custody, rotation, and recovery model.`;

	return { canRelease, recordProblems, unmetPrerequisiteIds, summary };
}

/** Convenience predicate: may cloud sync/collaboration be released right now? Fail-closed default: false. */
export function canReleaseCloud(
	record: CloudSecurityDecisionRecord = UNDECLARED_CLOUD_SECURITY_DECISION_RECORD,
	securityModel?: CloudSyncSecurityModel,
): boolean {
	return evaluateCloudReleaseGate(record, securityModel).canRelease;
}

// --- Server-visibility classification under an E2EE claim (SEC-009 AC4) ----------------------------

/** Why a server-visible payload field is DISALLOWED under the E2EE model. */
export type ServerVisibilityViolationReason =
	| 'not-an-allowed-metadata-class' // the field is not in the record's allowed-metadata set
	| 'plaintext-content'; // the field still carries plaintext content/secret a server must not read

export interface ServerVisibilityViolation {
	/** The field key the server-side path would read. */
	field: string;
	reason: ServerVisibilityViolationReason;
	/** A generic, NON-leaking explanation. Never carries the field's value. */
	message: string;
}

/**
 * A field a SERVER-SIDE code path would read off a cloud payload: the metadata class it claims to be, plus
 * the value the server would see. Under E2EE the field's class must be in the record's allowed set AND the
 * value must not still carry plaintext content/secret (SEC-009 AC4).
 */
export interface ServerVisibleField {
	field: string;
	metadataClass: AllowedServerMetadataClass | 'content';
	value: unknown;
}

/**
 * SEC-009 AC4 — inspect what a SERVER-SIDE code path can see for an E2EE-claimed model, fail closed. A
 * server-visible field VIOLATES the claim when:
 *
 *   - its metadata class is NOT in the record's `allowedServerMetadata` set (including the literal `content`
 *     class, which is never server-visible under E2EE), OR
 *   - its value still contains plaintext content / a secret (detected by the diagnostics redaction guard) —
 *     i.e. the "ciphertext" still leaks readable content.
 *
 * Returns every violation so a test and a pre-publish guard can fail closed. An empty result proves the
 * server sees ONLY the metadata the record explicitly allows. NOT applicable to a server-readable model
 * (where the server is expected to read content) — call only when the record claims E2EE.
 */
export function findServerVisibilityViolations(
	record: CloudSecurityDecisionRecord,
	fields: readonly ServerVisibleField[],
): ServerVisibilityViolation[] {
	const allowed = new Set<string>(record.allowedServerMetadata);
	const violations: ServerVisibilityViolation[] = [];
	for (const field of fields) {
		if (field.metadataClass === 'content' || !allowed.has(field.metadataClass)) {
			violations.push({
				field: field.field,
				reason: 'not-an-allowed-metadata-class',
				message:
					`Field "${field.field}" (class "${field.metadataClass}") is not an allowed server-visible ` +
					`metadata class under the end-to-end-encrypted model; the server must see only ciphertext for it.`,
			});
			continue;
		}
		// Even an allowed metadata class must not smuggle plaintext content/secret in its value.
		if (containsSensitiveData(field.value)) {
			violations.push({
				field: field.field,
				reason: 'plaintext-content',
				message:
					`Field "${field.field}" carries plaintext content or a secret the server must not read under ` +
					`the end-to-end-encrypted model.`,
			});
		}
	}
	return violations;
}

/**
 * Assert that, under an E2EE-claimed model, server-side code paths see ONLY the allowed metadata and no
 * plaintext content/secret (SEC-009 AC4). Throws fail-closed naming the first violating field. This is the
 * guard a cloud-publish path runs before a payload is stored server-side, and the assertion the tests use as
 * hard evidence of the E2EE claim.
 */
export function assertServerSeesOnlyAllowedMetadata(
	record: CloudSecurityDecisionRecord,
	fields: readonly ServerVisibleField[],
): void {
	const violations = findServerVisibilityViolations(record, fields);
	if (violations.length > 0) throw new Error(violations[0]!.message);
}
