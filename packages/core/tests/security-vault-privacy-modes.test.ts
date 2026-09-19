import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
	DNDTOOLS_CLOUD_ENHANCED_SECURITY_DECISION_RECORD,
	DNDTOOLS_CLOUD_ENHANCED_SYNC_SECURITY_MODEL,
	DNDTOOLS_CLOUD_SECURITY_DECISION_RECORD,
	DNDTOOLS_CLOUD_SYNC_SECURITY_MODEL,
	VAULT_PRIVACY_MODES,
	assertPlaintextUploadPermitted,
	assertServerVisibilityForRecord,
	createVaultKeyring,
	evaluateCloudEnhancedRelease,
	evaluateDndtoolsCloudRelease,
	isPlaintextUploadPermitted,
	isVaultPrivacyMode,
	mergeKeyrings,
	openKeyringRecoveryFile,
	rotateVaultKeyring,
	sealKeyringRecoveryFile,
	securityDecisionRecordForVaultMode,
	securityModelForVaultMode,
	validateCloudSecurityRecord,
	validateVaultKeyring,
	type CloudSecurityDecisionRecord,
	type ServerVisibleField,
	type VaultKeyring,
} from '../src/index';
import {
	isSanctionedSecurityDecisionRecord,
	sanctionSecurityDecisionRecord,
} from '../src/security/cloud-security-model';

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

	it('relaxes ONLY for a SANCTIONED complete, approved server-readable record (the phase-2 shape)', () => {
		const approved = sanctionSecurityDecisionRecord({
			...DNDTOOLS_CLOUD_ENHANCED_SECURITY_DECISION_RECORD,
			approved: true,
		});
		expect(() => assertServerVisibilityForRecord(approved, CONTENT_FIELD)).not.toThrow();
		// An approved-but-incomplete server-readable record still fails closed.
		const incomplete = sanctionSecurityDecisionRecord({ ...approved, decisionRecordRef: '' });
		expect(() => assertServerVisibilityForRecord(incomplete, [])).toThrow(/fail closed/i);
	});

	it('refuses an UNSANCTIONED approved look-alike — the relaxation holds by construction', () => {
		// This is checklist item 7: before the sanctioned-record registry, this forged record opened
		// the relaxation, so `approved: false` on the shipped record was enforced only by convention.
		const forged = { ...DNDTOOLS_CLOUD_ENHANCED_SECURITY_DECISION_RECORD, approved: true };
		expect(validateCloudSecurityRecord(forged)).toEqual([]);
		expect(() => assertServerVisibilityForRecord(forged, CONTENT_FIELD)).toThrow(/fail closed/i);
		expect(() => assertServerVisibilityForRecord(forged, [])).toThrow(/sanctioned/i);
	});

	it('sanctions the two shipped records and nothing else reachable from the selector', () => {
		for (const mode of VAULT_PRIVACY_MODES) {
			expect(isSanctionedSecurityDecisionRecord(securityDecisionRecordForVaultMode(mode))).toBe(
				true,
			);
		}
		expect(isSanctionedSecurityDecisionRecord({ ...DNDTOOLS_CLOUD_SECURITY_DECISION_RECORD })).toBe(
			false,
		);
	});
});

// RC-CLD-2.2 — the closed gate, made permanent for RC-1. The Cloud-Enhanced platform is deferred to
// roadmap epic CLD-6, and RC-CLD-6.5 is the only story allowed to approve the record. Until then an
// approval must not be manufacturable: every way a caller can hold an `approved: true` Cloud-Enhanced
// record without going through the shipped selector is refused by every server-readable path.
describe('RC-CLD-2.2 — an approval cannot be manufactured outside the shipped selector', () => {
	const shipped = securityDecisionRecordForVaultMode('cloud-enhanced');
	const approvedLookAlikes: Array<[string, () => CloudSecurityDecisionRecord]> = [
		['an object spread', () => ({ ...shipped, approved: true })],
		['a JSON round-trip', () => ({ ...JSON.parse(JSON.stringify(shipped)), approved: true })],
		['a structuredClone', () => Object.assign(structuredClone(shipped), { approved: true })],
		[
			'a copy with its own frozen metadata list',
			() =>
				Object.freeze({
					...shipped,
					approved: true,
					allowedServerMetadata: Object.freeze([...shipped.allowedServerMetadata]),
				}),
		],
	];

	it('ships the record UNAPPROVED — only RC-CLD-6.5 may flip it, no RC-1 story', () => {
		expect(
			shipped.approved,
			'The Cloud-Enhanced record may only be approved by RC-CLD-6.5 (epic CLD-6), with the ' +
				'complete phase-2 checklist signed in docs/security/vault-privacy-modes-threat-model.md.',
		).toBe(false);
		expect(shipped).toBe(DNDTOOLS_CLOUD_ENHANCED_SECURITY_DECISION_RECORD);
		expect(evaluateCloudEnhancedRelease().canRelease).toBe(false);
	});

	it('the shipped record cannot be approved in place — it is frozen', () => {
		expect(Object.isFrozen(shipped)).toBe(true);
		expect(() => {
			(shipped as { approved: boolean }).approved = true;
		}).toThrow(TypeError);
		expect(shipped.approved).toBe(false);
	});

	it.each(approvedLookAlikes)(
		'%s of the shipped record, approved, opens no server-readable path',
		(_label, forge) => {
			const forged = forge();
			// Shape alone would pass: the record is complete and approved by every field check.
			expect(forged.approved).toBe(true);
			expect(validateCloudSecurityRecord(forged)).toEqual([]);
			expect(isSanctionedSecurityDecisionRecord(forged)).toBe(false);
			// The SEC-009 relaxation stays shut, for content and for harmless metadata alike.
			expect(() => assertServerVisibilityForRecord(forged, CONTENT_FIELD)).toThrow(/fail closed/i);
			expect(() => assertServerVisibilityForRecord(forged, ALLOWED_FIELDS)).toThrow(/fail closed/i);
			// The plaintext-upload gate refuses it even for a vault the server registered as
			// Cloud-Enhanced — the registration cannot stand in for the review.
			expect(isPlaintextUploadPermitted('cloud-enhanced', forged)).toBe(false);
			expect(() => assertPlaintextUploadPermitted('cloud-enhanced', forged)).toThrow(
				/fail closed/i,
			);
		},
	);

	it('the selector hands out only the sanctioned, unapproved instance for either mode', () => {
		for (const mode of VAULT_PRIVACY_MODES) {
			const record = securityDecisionRecordForVaultMode(mode);
			expect(isSanctionedSecurityDecisionRecord(record)).toBe(true);
			if (record.encryption === 'server-side-encrypted') {
				expect(isPlaintextUploadPermitted('cloud-enhanced', record)).toBe(false);
				expect(() => assertServerVisibilityForRecord(record, CONTENT_FIELD)).toThrow(
					/fail closed/i,
				);
			}
		}
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
		const tampered = {
			...sealed,
			ct: sealed.ct.slice(0, -2) + (sealed.ct.endsWith('AA') ? 'BB' : 'AA'),
		};
		await expect(openKeyringRecoveryFile(tampered, 'correct horse battery')).rejects.toThrow();
	});

	it('refuses short passphrases and malformed files', async () => {
		const keyring = createVaultKeyring();
		await expect(sealKeyringRecoveryFile(keyring, 'short')).rejects.toThrow(/at least 8/i);
		await expect(
			openKeyringRecoveryFile({ hello: 'world' }, 'correct horse battery'),
		).rejects.toThrow(/not a .*recovery-key file/i);
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

describe('ADR-026 phase-2 checklist item 7 — the sanctioning chokepoint is contained', () => {
	// `sanctionSecurityDecisionRecord` is exported from the barrel (the Copilot unit tests in other
	// packages must simulate the post-review posture), so ANY caller that can import it can mint a
	// record the relaxation accepts. This scan is therefore the containment: it pins the exact set of
	// files permitted to make that call, so a future server route cannot quietly sanction its own
	// record without failing a test. It is a review tripwire, not a type-level impossibility — see
	// the `sanctionSecurityDecisionRecord` JSDoc for the precise scope of the guarantee.
	const REPO = path.join(import.meta.dirname, '..', '..', '..');
	// Every in-repo root that can contain TypeScript. `archive/` is the retired Svelte app and is
	// skipped below; `docs/` and `state/` hold no TypeScript. A root added to the repo without being
	// added here would be an unscanned hole, so the existence assertion below is deliberate.
	const SOURCE_ROOTS = ['apps', 'config', 'infra', 'packages', 'scripts', 'tests', 'tools'];
	const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.next', 'coverage', 'archive']);
	const ALLOWED = [
		'packages/core/src/index.ts',
		'packages/core/src/security/cloud-security-decision.ts',
		'packages/core/src/security/cloud-security-model.ts',
	];
	// Test files are excluded from the product-source scan because simulating the post-review
	// posture is exactly what they are for. That exclusion is itself a blind spot, so the second
	// test below pins them to this enumerated list rather than leaving them unbounded.
	const ALLOWED_TEST_SANCTIONERS = [
		'apps/gm-react/src/cloud/copilot.test.ts',
		'packages/cloud-fns/src/copilot/indexer.test.ts',
		'packages/core/tests/security-cloud-security-model.test.ts',
		'packages/core/tests/security-vault-privacy-modes.test.ts',
	];

	function typescriptFiles(dir: string, out: string[] = []): string[] {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			if (SKIP_DIRS.has(entry.name)) continue;
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) typescriptFiles(full, out);
			else if (/\.tsx?$/.test(entry.name)) out.push(full);
		}
		return out;
	}

	function sanctioningFiles(predicate: (name: string) => boolean): string[] {
		const roots = SOURCE_ROOTS.map((r) => path.join(REPO, r)).filter((r) => fs.existsSync(r));
		expect(roots.length).toBe(SOURCE_ROOTS.length);
		return roots
			.flatMap((root) => typescriptFiles(root))
			.filter((file) => predicate(path.basename(file)))
			.filter((file) => fs.readFileSync(file, 'utf8').includes('sanctionSecurityDecisionRecord'))
			.map((file) => path.relative(REPO, file).split(path.sep).join('/'))
			.sort();
	}

	const isTest = (name: string) => /\.test\.tsx?$/.test(name);

	it('only the decision module mints sanctioned records in product source', () => {
		expect(sanctioningFiles((name) => !isTest(name))).toEqual(ALLOWED);
	});

	it('the test files that mint sanctioned records are an enumerated, reviewed set', () => {
		expect(sanctioningFiles(isTest)).toEqual(ALLOWED_TEST_SANCTIONERS);
	});
});
