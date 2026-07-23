import { describe, expect, it } from 'vitest';
import {
	DNDTOOLS_CLOUD_ENHANCED_SECURITY_DECISION_RECORD,
	DNDTOOLS_CLOUD_ENHANCED_SYNC_SECURITY_MODEL,
	DNDTOOLS_CLOUD_SECURITY_DECISION_RECORD,
	DNDTOOLS_CLOUD_SYNC_SECURITY_MODEL,
	VAULT_PRIVACY_MODES,
	assertServerVisibilityForRecord,
	createVaultKeyring,
	evaluateCloudEnhancedRelease,
	evaluateDndtoolsCloudRelease,
	isVaultPrivacyMode,
	mergeKeyrings,
	openKeyringRecoveryFile,
	rotateVaultKeyring,
	sealKeyringRecoveryFile,
	securityDecisionRecordForVaultMode,
	securityModelForVaultMode,
	validateCloudSecurityRecord,
	validateVaultKeyring,
	type ServerVisibleField,
	type VaultKeyring,
} from '../src/index';

// ADR-026 — opt-in vault privacy modes. These tests are the machine-checkable proof of the phase-1
// posture: Private (E2EE) stays releasable, Cloud-Enhanced exists but is BLOCKED until the phase-2
// security review approves its record, the mode selectors are the only mode→record mapping, and the
// SEC-009 relaxation is scoped to approved server-readable records only.

const ALLOWED_FIELDS: ServerVisibleField[] = [
	{ field: 'vaultId', metadataClass: 'vault-id', value: 'vault-1' },
	{ field: 'revision', metadataClass: 'operation-revision', value: 7 },
];

const CONTENT_FIELD: ServerVisibleField[] = [
	{ field: 'body', metadataClass: 'content', value: 'the lich is secretly the mayor' },
];

describe('ADR-026 vault privacy modes — selection', () => {
	it('declares exactly the two modes, private-first', () => {
		expect(VAULT_PRIVACY_MODES).toEqual(['private-e2ee', 'cloud-enhanced']);
	});

	it('guards untrusted mode values (absence/garbage must resolve to Private at call sites)', () => {
		expect(isVaultPrivacyMode('private-e2ee')).toBe(true);
		expect(isVaultPrivacyMode('cloud-enhanced')).toBe(true);
		expect(isVaultPrivacyMode('server-readable')).toBe(false);
		expect(isVaultPrivacyMode('')).toBe(false);
		expect(isVaultPrivacyMode(null)).toBe(false);
		expect(isVaultPrivacyMode(undefined)).toBe(false);
	});

	it('maps private-e2ee to the E2EE record/model and cloud-enhanced to the KMS record/model', () => {
		expect(securityDecisionRecordForVaultMode('private-e2ee')).toBe(
			DNDTOOLS_CLOUD_SECURITY_DECISION_RECORD,
		);
		expect(securityModelForVaultMode('private-e2ee')).toBe(DNDTOOLS_CLOUD_SYNC_SECURITY_MODEL);
		expect(securityDecisionRecordForVaultMode('cloud-enhanced')).toBe(
			DNDTOOLS_CLOUD_ENHANCED_SECURITY_DECISION_RECORD,
		);
		expect(securityModelForVaultMode('cloud-enhanced')).toBe(
			DNDTOOLS_CLOUD_ENHANCED_SYNC_SECURITY_MODEL,
		);
	});
});

describe('ADR-026 phase-1 release posture', () => {
	it('the Private (E2EE) release gate stays open with recovery now declared supported', () => {
		expect(DNDTOOLS_CLOUD_SECURITY_DECISION_RECORD.recovery).toBe('supported');
		expect(DNDTOOLS_CLOUD_SYNC_SECURITY_MODEL.recovery).toBe('supported');
		const gate = evaluateDndtoolsCloudRelease();
		expect(gate.canRelease).toBe(true);
		expect(gate.recordProblems).toEqual([]);
		expect(gate.unmetPrerequisiteIds).toEqual([]);
	});

	it('the Cloud-Enhanced record is complete but UNAPPROVED — the only blocking problem', () => {
		const problems = validateCloudSecurityRecord(DNDTOOLS_CLOUD_ENHANCED_SECURITY_DECISION_RECORD);
		expect(problems.map((p) => p.kind)).toEqual(['not-approved']);
	});

	it('the Cloud-Enhanced release gate is BLOCKED (approved: false is load-bearing)', () => {
		const gate = evaluateCloudEnhancedRelease();
		expect(gate.canRelease).toBe(false);
		expect(gate.recordProblems.map((p) => p.kind)).toEqual(['not-approved']);
		// The declared SYNC-017 model itself is satisfied — approval is the single latch.
		expect(gate.unmetPrerequisiteIds).toEqual([]);
	});
});

describe('ADR-026 mode-aware server visibility (SEC-009 relaxation scoping)', () => {
	it('enforces the metadata boundary unchanged for the E2EE record', () => {
		expect(() =>
			assertServerVisibilityForRecord(DNDTOOLS_CLOUD_SECURITY_DECISION_RECORD, ALLOWED_FIELDS),
		).not.toThrow();
		expect(() =>
			assertServerVisibilityForRecord(DNDTOOLS_CLOUD_SECURITY_DECISION_RECORD, CONTENT_FIELD),
		).toThrow(/not an allowed server-visible/i);
	});

	it('fails closed for the UNAPPROVED Cloud-Enhanced record — even for harmless metadata', () => {
		expect(() =>
			assertServerVisibilityForRecord(
				DNDTOOLS_CLOUD_ENHANCED_SECURITY_DECISION_RECORD,
				ALLOWED_FIELDS,
			),
		).toThrow(/fail closed/i);
		expect(() =>
			assertServerVisibilityForRecord(DNDTOOLS_CLOUD_ENHANCED_SECURITY_DECISION_RECORD, []),
		).toThrow(/fail closed/i);
	});

	it('relaxes ONLY for a complete, approved server-readable record (the phase-2 shape)', () => {
		const approved = {
			...DNDTOOLS_CLOUD_ENHANCED_SECURITY_DECISION_RECORD,
			approved: true,
		};
		expect(() => assertServerVisibilityForRecord(approved, CONTENT_FIELD)).not.toThrow();
		// An approved-but-incomplete server-readable record still fails closed.
		const incomplete = { ...approved, decisionRecordRef: '' };
		expect(() => assertServerVisibilityForRecord(incomplete, [])).toThrow(/fail closed/i);
	});
});

describe('ADR-026 recovery-key file (seal/open/merge)', () => {
	it('round-trips a keyring through seal + open with the right passphrase', async () => {
		const keyring = createVaultKeyring();
		const file = sealKeyringRecoveryFile(keyring, 'correct horse battery');
		const sealed = await file;
		expect(sealed.format).toBe('dndtools-vault-recovery');
		expect(sealed.iterations).toBe(600_000);
		// The file carries no plaintext key material.
		expect(JSON.stringify(sealed)).not.toContain(keyring.keys[0]);
		const opened = await openKeyringRecoveryFile(sealed, 'correct horse battery');
		expect(opened).toEqual(keyring);
	});

	it('rejects a wrong passphrase and a tampered ciphertext fail-closed', async () => {
		const keyring = createVaultKeyring();
		const sealed = await sealKeyringRecoveryFile(keyring, 'correct horse battery');
		await expect(openKeyringRecoveryFile(sealed, 'wrong horse battery')).rejects.toThrow(
			/wrong passphrase|damaged/i,
		);
		const tampered = { ...sealed, ct: sealed.ct.slice(0, -2) + (sealed.ct.endsWith('AA') ? 'BB' : 'AA') };
		await expect(openKeyringRecoveryFile(tampered, 'correct horse battery')).rejects.toThrow();
	});

	it('refuses short passphrases and malformed files', async () => {
		const keyring = createVaultKeyring();
		await expect(sealKeyringRecoveryFile(keyring, 'short')).rejects.toThrow(/at least 8/i);
		await expect(openKeyringRecoveryFile({ hello: 'world' }, 'correct horse battery')).rejects.toThrow(
			/not a .*recovery-key file/i,
		);
		const sealed = await sealKeyringRecoveryFile(keyring, 'correct horse battery');
		await expect(
			openKeyringRecoveryFile({ ...sealed, iterations: 10 }, 'correct horse battery'),
		).rejects.toThrow(/not a valid/i);
	});

	it('merge: existing epochs win, the current epoch never rolls backwards', () => {
		const original = createVaultKeyring();
		// Device A rotated once — it holds epochs 0 and 1, current 1.
		const rotated = rotateVaultKeyring(original, {
			participantActorId: 'p1',
			joinedAtEpoch: 0,
			revokedAtEpoch: null,
		}).keyring;
		// The recovery file was exported BEFORE the rotation (only epoch 0, current 0).
		const merged = mergeKeyrings(rotated, original);
		expect(merged.currentEpoch).toBe(rotated.currentEpoch);
		expect(merged.keys).toEqual(rotated.keys);
		// And the inverse direction: a fresh device (only the recovered file) gains the newer state.
		const freshImport = mergeKeyrings(original, rotated);
		expect(freshImport.currentEpoch).toBe(rotated.currentEpoch);
		expect(freshImport.keys[0]).toBe(original.keys[0]); // existing wins on collision
		expect(freshImport.keys[rotated.currentEpoch]).toBe(rotated.keys[rotated.currentEpoch]);
	});

	it('validateVaultKeyring rejects shape violations fail-closed', () => {
		const good = createVaultKeyring();
		expect(() => validateVaultKeyring(good)).not.toThrow();
		expect(() => validateVaultKeyring(null)).toThrow(/invalid/i);
		expect(() => validateVaultKeyring({ ...good, currentEpoch: 5 })).toThrow(/invalid/i);
		expect(() => validateVaultKeyring({ ...good, extra: true })).toThrow(/invalid/i);
		const badMaterial: VaultKeyring = { ...good, keys: { 0: 'too-short' } } as VaultKeyring;
		expect(() => validateVaultKeyring(badMaterial)).toThrow(/invalid/i);
	});
});
