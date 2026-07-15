import { describe, expect, it } from 'vitest';
import {
	ALLOWED_SERVER_METADATA_CLASSES,
	DNDTOOLS_CLOUD_SECURITY_DECISION_RECORD,
	DNDTOOLS_CLOUD_SYNC_SECURITY_MODEL,
	assertCompromiseMatchesTrustBoundary,
	assertServerSeesOnlyAllowedMetadata,
	canEnableCloudSync,
	canReleaseCloud,
	createVaultKeyring,
	decryptFromKeyring,
	encryptForKeyring,
	envelopeAsStoredArtifact,
	envelopeServerVisibleFields,
	evaluateCloudSyncGate,
	evaluateDndtoolsCloudRelease,
	findServerVisibilityViolations,
	openWithKeyMaterial,
	rotateVaultKeyring,
	sealWithKeyMaterial,
	validateCloudSecurityRecord,
	type ParticipantKeyHolding,
	type VaultArtifactContext,
	type VaultKeyring,
} from '../src';

/**
 * ADR-017 — concrete client-held E2EE. These tests exercise the REAL AES-256-GCM crypto (WebCrypto is
 * present in the Node test runtime) and prove the three things the deferred-crypto gate always required:
 * (1) artifacts round-trip only with the right key, (2) the server sees ONLY opaque ciphertext + allowed
 * metadata, (3) key rotation on revocation cryptographically locks a revoked party out of new epochs —
 * and therefore the release-approved model legitimately OPENS the SYNC-017 / SEC-009 gates.
 */

// A payload that is unambiguously secret content the server must never read (it trips the redaction guard).
const SECRET_PAYLOAD = {
	title: 'The lich phylactery is hidden beneath the chapel',
	dmNote: 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.super.secret',
	path: '/home/dm/campaign/secrets.md',
};

const CONTEXT: VaultArtifactContext = {
	accountId: 'account-a',
	vaultId: 'primary',
	kind: 'snapshot',
	revision: 7,
};

describe('ADR-017 AES-256-GCM round-trip', () => {
	it('seals and opens a value under the current keyring epoch', async () => {
		const keyring = createVaultKeyring();
		const envelope = await encryptForKeyring(keyring, SECRET_PAYLOAD, CONTEXT);
		expect(envelope.alg).toBe('AES-GCM');
		expect(envelope.v).toBe(2);
		expect(envelope.ctx).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(envelope.epoch).toBe(keyring.currentEpoch);
		const opened = await decryptFromKeyring(keyring, envelope, CONTEXT);
		expect(opened).toEqual(SECRET_PAYLOAD);
	});

	it('produces a different IV/ciphertext each time (randomized encryption)', async () => {
		const keyring = createVaultKeyring();
		const a = await encryptForKeyring(keyring, SECRET_PAYLOAD, CONTEXT);
		const b = await encryptForKeyring(keyring, SECRET_PAYLOAD, CONTEXT);
		expect(a.iv).not.toBe(b.iv);
		expect(a.ct).not.toBe(b.ct);
	});

	it('rejects a tampered ciphertext (GCM auth tag)', async () => {
		const material = new Uint8Array(32).fill(7);
		const envelope = await sealWithKeyMaterial(material, 0, SECRET_PAYLOAD, CONTEXT);
		const flipped = envelope.ct.startsWith('A')
			? 'B' + envelope.ct.slice(1)
			: 'A' + envelope.ct.slice(1);
		await expect(
			openWithKeyMaterial(material, { ...envelope, ct: flipped }, CONTEXT),
		).rejects.toThrow();
	});

	it('rejects a non-canonical base64url envelope encoding', async () => {
		const keyring = createVaultKeyring();
		const envelope = await encryptForKeyring(keyring, SECRET_PAYLOAD, CONTEXT);
		const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
		const finalIndex = alphabet.indexOf(envelope.contentHash.at(-1)!);
		// A 32-byte hash leaves two unused bits, so adding one changes only those unused bits and
		// decodes to the same bytes. Strict wire validation must still reject the alternate spelling.
		const alternate = alphabet[(finalIndex & ~3) + 1]!;
		const nonCanonical = {
			...envelope,
			contentHash: `${envelope.contentHash.slice(0, -1)}${alternate}`,
		};

		await expect(decryptFromKeyring(keyring, nonCanonical, CONTEXT)).rejects.toThrow(
			/non-canonical base64url/i,
		);
	});

	it('rejects valid ciphertext when account, vault, kind, or revision context changes', async () => {
		const keyring = createVaultKeyring();
		const envelope = await encryptForKeyring(keyring, SECRET_PAYLOAD, CONTEXT);
		for (const changed of [
			{ ...CONTEXT, accountId: 'account-b' },
			{ ...CONTEXT, vaultId: 'secondary' },
			{ ...CONTEXT, kind: 'operation' as const },
			{ ...CONTEXT, revision: CONTEXT.revision + 1 },
		]) {
			await expect(decryptFromKeyring(keyring, envelope, changed)).rejects.toThrow(/context/i);
		}
	});

	it('fails closed on legacy unbound ciphertext', async () => {
		const keyring = createVaultKeyring();
		const envelope = await encryptForKeyring(keyring, SECRET_PAYLOAD, CONTEXT);
		const legacy = { ...envelope, v: 1 as const } as unknown as Parameters<
			typeof decryptFromKeyring
		>[1];
		delete (legacy as unknown as { ctx?: string }).ctx;
		await expect(decryptFromKeyring(keyring, legacy, CONTEXT)).rejects.toThrow(
			/legacy cloud ciphertext/i,
		);
	});
});

describe('ADR-017 the sealed envelope is opaque to the server (SEC-009 AC4 / SEC-012 AC3)', () => {
	it('ciphertext/iv/contentHash are base64url with no path/JWT/secret shape', async () => {
		const envelope = await encryptForKeyring(createVaultKeyring(), SECRET_PAYLOAD, CONTEXT);
		for (const field of [envelope.iv, envelope.ct, envelope.contentHash]) {
			expect(field).toMatch(/^[A-Za-z0-9_-]+$/); // base64url — no '/', '+', '=', or '.'
		}
	});

	it('the stored envelope passes the compromised-store trust boundary as ciphertext', () => {
		return encryptForKeyring(createVaultKeyring(), SECRET_PAYLOAD, CONTEXT).then((envelope) => {
			// No throw ⇒ the redaction guard finds no readable secret/content in the ciphertext.
			expect(() =>
				assertCompromiseMatchesTrustBoundary([envelopeAsStoredArtifact('op-1', envelope)]),
			).not.toThrow();
		});
	});

	it('the envelope contributes only allowed server-visible metadata (content-hash + size)', async () => {
		const envelope = await encryptForKeyring(createVaultKeyring(), SECRET_PAYLOAD, CONTEXT);
		const fields = envelopeServerVisibleFields(envelope);
		expect(fields.map((f) => f.metadataClass).sort()).toEqual(['content-hash', 'operation-size']);
		for (const field of fields) {
			expect(ALLOWED_SERVER_METADATA_CLASSES).toContain(field.metadataClass);
		}
		expect(findServerVisibilityViolations(DNDTOOLS_CLOUD_SECURITY_DECISION_RECORD, fields)).toEqual(
			[],
		);
		expect(() =>
			assertServerSeesOnlyAllowedMetadata(DNDTOOLS_CLOUD_SECURITY_DECISION_RECORD, fields),
		).not.toThrow();
	});
});

describe('ADR-017 key rotation on revocation locks out the revoked party (SEC-012 AC1)', () => {
	it('a revoked keyring cannot decrypt content sealed under the new epoch', async () => {
		const keyring = createVaultKeyring();
		// Snapshot the keyring as the (soon-to-be) revoked participant holds it BEFORE rotation.
		const revokedKeyring: VaultKeyring = { ...keyring, keys: { ...keyring.keys } };
		const holding: ParticipantKeyHolding = {
			participantActorId: 'actor-evicted',
			joinedAtEpoch: 0,
			revokedAtEpoch: null,
		};

		const { keyring: rotated } = rotateVaultKeyring(keyring, holding);
		expect(rotated.currentEpoch).toBe(keyring.currentEpoch + 1);

		// New content is sealed under the new epoch; the revoked snapshot lacks that key ⇒ fail closed.
		const newEpochArtifact = await encryptForKeyring(
			rotated,
			{ note: 'post-revocation secret' },
			CONTEXT,
		);
		await expect(decryptFromKeyring(revokedKeyring, newEpochArtifact, CONTEXT)).rejects.toThrow(
			/no key for epoch/i,
		);

		// The still-authorized (rotated) keyring reads it fine, and old-epoch content still opens too.
		expect(await decryptFromKeyring(rotated, newEpochArtifact, CONTEXT)).toEqual({
			note: 'post-revocation secret',
		});
	});
});

describe('ADR-017 the release-approved model opens the deferred gates', () => {
	it('the SYNC-017 gate can enable under the release-approved security model', () => {
		expect(canEnableCloudSync(DNDTOOLS_CLOUD_SYNC_SECURITY_MODEL)).toBe(true);
		const gate = evaluateCloudSyncGate({ securityModel: DNDTOOLS_CLOUD_SYNC_SECURITY_MODEL });
		expect(gate.canEnable).toBe(true);
		expect(gate.unmetPrerequisiteIds).toEqual([]);
		// Still off by default until explicitly opted in (fail-closed enablement preserved).
		expect(gate.enabled).toBe(false);
	});

	it('the recovery limitation is still surfaced even though the prerequisite is met (AC3)', () => {
		const gate = evaluateCloudSyncGate({ securityModel: DNDTOOLS_CLOUD_SYNC_SECURITY_MODEL });
		const recovery = gate.prerequisites.find((p) => p.id === 'key-recovery');
		expect(recovery?.met).toBe(true);
		expect(recovery?.detail).toMatch(/unsupported by design/i);
	});

	it('the SEC-009 decision record is complete, consistent, and releasable', () => {
		expect(validateCloudSecurityRecord(DNDTOOLS_CLOUD_SECURITY_DECISION_RECORD)).toEqual([]);
		expect(
			canReleaseCloud(DNDTOOLS_CLOUD_SECURITY_DECISION_RECORD, DNDTOOLS_CLOUD_SYNC_SECURITY_MODEL),
		).toBe(true);
		expect(evaluateDndtoolsCloudRelease().canRelease).toBe(true);
	});
});
