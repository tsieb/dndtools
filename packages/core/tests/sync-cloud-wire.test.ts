import { describe, expect, it } from 'vitest';
import {
	DNDTOOLS_CLOUD_SECURITY_DECISION_RECORD,
	assertServerSeesOnlyAllowedMetadata,
	findServerVisibilityViolations,
	opServerVisibleFields,
	snapshotServerVisibleFields,
	type CloudOpMeta,
	type CloudSnapshotMeta,
} from '../src';

/**
 * The cloud-sync wire contract must, by construction, expose only the six ALLOWED_SERVER_METADATA classes
 * and never carry plaintext content — that is what lets the untrusted server route/order/dedupe while an
 * E2EE claim holds. These tests pin that: the *ServerVisibleFields helpers pass the server-visibility
 * guard for clean metadata, and fail closed when a field smuggles a secret.
 */

const opMeta: CloudOpMeta = {
	participantId: 'actor-dm',
	revision: 7,
	size: 128,
	contentHash: 'aGFzaC12YWx1ZQ',
	issuedAt: '2026-07-06T00:00:00.000Z',
};

const snapMeta: CloudSnapshotMeta = {
	revision: 42,
	size: 4096,
	contentHash: 'c25hcHNob3Q',
	issuedAt: '2026-07-06T00:00:00.000Z',
};

describe('cloud-sync wire server-visibility', () => {
	it('op fields map only to allowed metadata classes', () => {
		const classes = opServerVisibleFields('vault-1', opMeta).map((f) => f.metadataClass).sort();
		expect(classes).toEqual(['content-hash', 'operation-revision', 'operation-size', 'participant-id', 'timestamp', 'vault-id']);
	});

	it('clean op metadata passes the server-visibility guard', () => {
		expect(findServerVisibilityViolations(DNDTOOLS_CLOUD_SECURITY_DECISION_RECORD, opServerVisibleFields('vault-1', opMeta))).toEqual([]);
		expect(() =>
			assertServerSeesOnlyAllowedMetadata(DNDTOOLS_CLOUD_SECURITY_DECISION_RECORD, opServerVisibleFields('vault-1', opMeta)),
		).not.toThrow();
	});

	it('clean snapshot metadata passes the server-visibility guard', () => {
		expect(() =>
			assertServerSeesOnlyAllowedMetadata(DNDTOOLS_CLOUD_SECURITY_DECISION_RECORD, snapshotServerVisibleFields('vault-1', snapMeta)),
		).not.toThrow();
	});

	it('fails closed when a metadata field carries a plaintext secret', () => {
		const evil = { ...opMeta, participantId: 'Bearer eyJhbGci.OiJI.UzI1' };
		const violations = findServerVisibilityViolations(DNDTOOLS_CLOUD_SECURITY_DECISION_RECORD, opServerVisibleFields('vault-1', evil));
		expect(violations.length).toBeGreaterThan(0);
		expect(violations[0]!.reason).toBe('plaintext-content');
		expect(() =>
			assertServerSeesOnlyAllowedMetadata(DNDTOOLS_CLOUD_SECURITY_DECISION_RECORD, opServerVisibleFields('vault-1', evil)),
		).toThrow();
	});
});
