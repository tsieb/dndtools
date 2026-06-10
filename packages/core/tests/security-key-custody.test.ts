import { describe, expect, it } from 'vitest';
import {
	ALLOWED_SERVER_METADATA_CLASSES,
	assertCompromiseMatchesTrustBoundary,
	assertRecoveryWithinScope,
	assertRevokedCannotDecryptNewEpoch,
	canDecryptEpoch,
	evaluateServerTrustBoundary,
	keyMaterialStaysDeviceLocal,
	partitionRecoveryScope,
	rotateKeyOnRevocation,
	type CloudStoredArtifact,
	type ParticipantKeyHolding,
	type RecoverableItem,
	type RecoveryScope,
} from '../src';

/**
 * SEC-012 — cloud key custody / rotation / participant revocation / recovery, enforced by tests. The logical
 * key-epoch model (no cipher, per ADR-014) proves: rotation on revocation locks a removed participant out of
 * the new content epoch; recovery restores only the approved scope; a compromised store exposes only
 * ciphertext + documented metadata.
 */

describe('SEC-012 AC1 — rotating the key on revocation locks the removed participant out of new content', () => {
	const removed: ParticipantKeyHolding = {
		participantActorId: 'actor-player',
		joinedAtEpoch: 0,
		revokedAtEpoch: null,
	};

	it('a removed participant cannot decrypt content encrypted under the post-rotation epoch', () => {
		const currentEpoch = 3;
		const { newCurrentEpoch, revokedHolding } = rotateKeyOnRevocation(currentEpoch, removed);
		expect(newCurrentEpoch).toBe(4);
		// They keep the old epochs they already held...
		expect(canDecryptEpoch(revokedHolding, 3)).toBe(true);
		// ...but cannot decrypt the new (post-rotation) epoch.
		expect(canDecryptEpoch(revokedHolding, newCurrentEpoch)).toBe(false);
		expect(() => assertRevokedCannotDecryptNewEpoch(revokedHolding, newCurrentEpoch)).not.toThrow();
	});

	it('the assertion throws if a (mis-modeled) holding could still open the new epoch', () => {
		// A holding that was NOT closed on revocation (still open-ended) would be a bug — prove the guard catches it.
		const stillOpen: ParticipantKeyHolding = { ...removed };
		expect(() => assertRevokedCannotDecryptNewEpoch(stillOpen, 4)).toThrow();
	});

	it('content from before a participant joined is never decryptable by them', () => {
		const lateJoiner: ParticipantKeyHolding = {
			participantActorId: 'actor-late',
			joinedAtEpoch: 5,
			revokedAtEpoch: null,
		};
		expect(canDecryptEpoch(lateJoiner, 4)).toBe(false);
		expect(canDecryptEpoch(lateJoiner, 5)).toBe(true);
	});
});

describe('SEC-012 AC2 — a recovery flow restores ONLY the approved scope', () => {
	const scope: RecoveryScope = {
		vaultId: 'vault-1',
		tenantId: 'tenant-a',
		participantActorId: 'actor-player',
	};

	const items: RecoverableItem[] = [
		{ id: 'in-scope', vaultId: 'vault-1', tenantId: 'tenant-a', participantActorId: 'actor-player' },
		{ id: 'other-vault', vaultId: 'vault-2', tenantId: 'tenant-a', participantActorId: 'actor-player' },
		{ id: 'other-tenant', vaultId: 'vault-1', tenantId: 'tenant-b', participantActorId: 'actor-player' },
		{ id: 'other-stream', vaultId: 'vault-1', tenantId: 'tenant-a', participantActorId: 'actor-other' },
	];

	it('restores only in-scope content; cross vault/tenant/stream items are excluded', () => {
		const result = partitionRecoveryScope(scope, items);
		expect(result.restored.map((r) => r.id)).toEqual(['in-scope']);
		expect(result.violations.map((v) => v.reason).sort()).toEqual([
			'cross-participant-stream',
			'cross-tenant',
			'cross-vault',
		]);
	});

	it('the assertion throws when any out-of-scope item would be restored', () => {
		expect(() => assertRecoveryWithinScope(scope, items)).toThrow();
		expect(() => assertRecoveryWithinScope(scope, [items[0]!])).not.toThrow();
	});
});

describe('SEC-012 AC3 — a compromised cloud store exposes only ciphertext + documented metadata', () => {
	const SECRET = 'The dragon hoard map: third tile from the river.';

	it('plaintext content in the store exceeds the trust boundary', () => {
		const artifacts: CloudStoredArtifact[] = [
			{ id: 'meta', dataClass: 'vault-id', value: 'vault-1' },
			{ id: 'leak', dataClass: 'plaintext-content', value: SECRET },
		];
		const exposures = evaluateServerTrustBoundary(artifacts);
		expect(exposures.some((e) => e.reason === 'plaintext-content-exposed')).toBe(true);
		expect(JSON.stringify(exposures)).not.toContain(SECRET);
		expect(() => assertCompromiseMatchesTrustBoundary(artifacts)).toThrow();
	});

	it('ciphertext that still contains a readable secret is a violation', () => {
		const artifacts: CloudStoredArtifact[] = [
			{ id: 'bad-cipher', dataClass: 'ciphertext', value: { authorization: 'Bearer sk-live-zzz999' } },
		];
		const exposures = evaluateServerTrustBoundary(artifacts);
		expect(exposures[0]?.reason).toBe('ciphertext-leaks-plaintext');
	});

	it('a metadata class outside the documented set is a violation', () => {
		const artifacts: CloudStoredArtifact[] = [
			// 'note-title' is NOT in the documented allowed-server-metadata set.
			{ id: 'undoc', dataClass: 'note-title' as never, value: 'The Lich Vault' },
		];
		expect(evaluateServerTrustBoundary(artifacts)[0]?.reason).toBe('metadata-class-not-documented');
	});

	it('a store of only opaque ciphertext + documented metadata matches the trust boundary', () => {
		const artifacts: CloudStoredArtifact[] = [
			...ALLOWED_SERVER_METADATA_CLASSES.map((cls, i) => ({
				id: `m${i}`,
				dataClass: cls,
				value: `routing-${i}`,
			})),
			{ id: 'cipher', dataClass: 'ciphertext', value: 'a8f3c0d1e2b4...' },
		];
		expect(evaluateServerTrustBoundary(artifacts)).toEqual([]);
		expect(() => assertCompromiseMatchesTrustBoundary(artifacts)).not.toThrow();
	});
});

describe('SEC-012 — key material stays device-local (never cloud-syncable)', () => {
	it('the device-local key/credential categories are never cloud-eligible', () => {
		expect(keyMaterialStaysDeviceLocal('auth-refresh-token')).toBe(true);
		expect(keyMaterialStaysDeviceLocal('os-credential-record')).toBe(true);
		// An unknown category fails closed to device-local.
		expect(keyMaterialStaysDeviceLocal('totally-unknown')).toBe(true);
		// A cloud-syncable category is (correctly) NOT key material.
		expect(keyMaterialStaysDeviceLocal('durable-operation-log')).toBe(false);
	});
});
