import { describe, expect, it } from 'vitest';
import {
	ALLOWED_SERVER_METADATA_CLASSES,
	UNDECLARED_CLOUD_SECURITY_DECISION_RECORD,
	assertServerSeesOnlyAllowedMetadata,
	canReleaseCloud,
	evaluateCloudReleaseGate,
	findServerVisibilityViolations,
	validateCloudSecurityRecord,
	type CloudSecurityDecisionRecord,
	type CloudSyncSecurityModel,
	type ServerVisibleField,
} from '../src';

/**
 * SEC-009 — the cloud security model decision record + release gate. Release is BLOCKED until a complete,
 * approved decision record (encryption / key custody / server trust boundary / rotation / recovery) AND the
 * SYNC-017 prerequisites are satisfied. Under an E2EE claim, server-side code paths see ONLY the allowed
 * metadata — never hidden content.
 */

const SATISFIED_MODEL: CloudSyncSecurityModel = {
	encryptionAtRest: true,
	encryptionInTransit: true,
	keyCustodyDeclared: true,
	keyRotationSupported: true,
	recovery: 'supported',
};

const COMPLETE_RECORD: CloudSecurityDecisionRecord = {
	schemaVersion: 1,
	approved: true,
	encryption: 'end-to-end-encrypted',
	keyCustodian: 'client-held',
	credentialRotationDeclared: true,
	recovery: 'unsupported-by-design',
	allowedServerMetadata: [...ALLOWED_SERVER_METADATA_CLASSES],
	decisionRecordRef: 'docs/adr/015-v2-cloud-security-model-and-key-custody.md',
};

describe('SEC-009 AC3 — release is blocked without an approved, complete decision record (fail closed default)', () => {
	it('the undeclared default record blocks release and reports every gap', () => {
		const problems = validateCloudSecurityRecord(UNDECLARED_CLOUD_SECURITY_DECISION_RECORD);
		const kinds = new Set(problems.map((p) => p.kind));
		expect(kinds.has('not-approved')).toBe(true);
		expect(kinds.has('encryption-undeclared')).toBe(true);
		expect(kinds.has('key-custody-undeclared')).toBe(true);
		expect(kinds.has('rotation-undeclared')).toBe(true);
		expect(kinds.has('recovery-undeclared')).toBe(true);
		expect(kinds.has('decision-record-ref-missing')).toBe(true);
		expect(canReleaseCloud()).toBe(false);
	});

	it('release stays blocked when the record is complete but the SYNC-017 model is unmet', () => {
		// Complete record, but the (default) deferred-crypto security model is unmet ⇒ still blocked.
		const gate = evaluateCloudReleaseGate(COMPLETE_RECORD);
		expect(gate.canRelease).toBe(false);
		expect(gate.recordProblems).toEqual([]);
		expect(gate.unmetPrerequisiteIds.length).toBeGreaterThan(0);
	});

	it('release stays blocked when the model is satisfied but the record is incomplete', () => {
		const incomplete: CloudSecurityDecisionRecord = { ...COMPLETE_RECORD, approved: false };
		const gate = evaluateCloudReleaseGate(incomplete, SATISFIED_MODEL);
		expect(gate.canRelease).toBe(false);
		expect(gate.recordProblems.some((p) => p.kind === 'not-approved')).toBe(true);
	});

	it('release opens ONLY when the record is complete AND the model is satisfied', () => {
		const gate = evaluateCloudReleaseGate(COMPLETE_RECORD, SATISFIED_MODEL);
		expect(gate.canRelease).toBe(true);
		expect(gate.recordProblems).toEqual([]);
		expect(gate.unmetPrerequisiteIds).toEqual([]);
		expect(canReleaseCloud(COMPLETE_RECORD, SATISFIED_MODEL)).toBe(true);
	});
});

describe('SEC-009 — decision-record internal consistency', () => {
	it('an E2EE claim with provider-held keys is rejected (the server could read plaintext)', () => {
		const record: CloudSecurityDecisionRecord = { ...COMPLETE_RECORD, keyCustodian: 'provider-held' };
		const problems = validateCloudSecurityRecord(record);
		expect(problems.some((p) => p.kind === 'e2ee-requires-client-held-keys')).toBe(true);
	});

	it('allowed-server-metadata declared under a non-E2EE model is a contradiction', () => {
		const record: CloudSecurityDecisionRecord = {
			...COMPLETE_RECORD,
			encryption: 'server-side-encrypted',
			allowedServerMetadata: ['vault-id'],
		};
		const problems = validateCloudSecurityRecord(record);
		expect(problems.some((p) => p.kind === 'metadata-not-allowed-under-non-e2ee')).toBe(true);
	});
});

describe('SEC-009 AC4 — under an E2EE claim the server sees ONLY allowed metadata, never hidden content', () => {
	const SECRET_BODY = 'The lich phylactery is hidden under the altar.';

	it('a server-visible field carrying plaintext content violates the E2EE claim', () => {
		const fields: ServerVisibleField[] = [
			{ field: 'vaultId', metadataClass: 'vault-id', value: 'vault-7' },
			// A field mislabeled as metadata that actually carries the hidden note body.
			{ field: 'noteBody', metadataClass: 'content', value: SECRET_BODY },
		];
		const violations = findServerVisibilityViolations(COMPLETE_RECORD, fields);
		expect(violations.length).toBeGreaterThan(0);
		expect(violations[0]?.reason).toBe('not-an-allowed-metadata-class');
		// The violation must not re-leak the secret body.
		expect(JSON.stringify(violations)).not.toContain(SECRET_BODY);
		expect(() => assertServerSeesOnlyAllowedMetadata(COMPLETE_RECORD, fields)).toThrow();
	});

	it('an allowed metadata class smuggling a token in its value is a violation', () => {
		const fields: ServerVisibleField[] = [
			{ field: 'participantId', metadataClass: 'participant-id', value: 'Bearer sk-live-abc123def456' },
		];
		const violations = findServerVisibilityViolations(COMPLETE_RECORD, fields);
		expect(violations[0]?.reason).toBe('plaintext-content');
	});

	it('only the documented allowed metadata classes pass the server-visibility check', () => {
		const fields: ServerVisibleField[] = ALLOWED_SERVER_METADATA_CLASSES.map((cls, i) => ({
			field: `f${i}`,
			metadataClass: cls,
			value: `routing-${i}`,
		}));
		expect(findServerVisibilityViolations(COMPLETE_RECORD, fields)).toEqual([]);
		expect(() => assertServerSeesOnlyAllowedMetadata(COMPLETE_RECORD, fields)).not.toThrow();
	});
});
