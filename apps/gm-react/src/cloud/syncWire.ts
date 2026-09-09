// THE SYNC-API WIRE PARSERS. Everything the sync-api hands back crosses a trust boundary: it is
// ciphertext plus the six allowed metadata classes, produced by a server that must never be able to
// steer this client. These parsers accept an EXACT key set and re-check that each record's metadata
// describes the ciphertext it arrived with, so a swapped, truncated or re-labelled record fails here
// rather than reaching the vault key or the conflict lifecycle.

import {
	validateEncryptedEnvelope,
	type CloudOpRecord,
	type CloudSnapshotRecord,
} from '@dndtools/core';

/** Highest revision the sync-api will store; a record beyond it cannot be genuine. */
export const MAX_CLOUD_OPERATION_REVISION = 250_000;

/** Byte length of a base64url string (no padding): 4 chars → 3 bytes. */
export function b64urlBytes(s: string): number {
	return Math.floor((s.length * 3) / 4);
}

export function plainRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseSnapshotResponse(value: unknown): CloudSnapshotRecord {
	if (
		!plainRecord(value) ||
		JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(['envelope', 'meta']) ||
		!plainRecord(value.meta) ||
		JSON.stringify(Object.keys(value.meta).sort()) !==
			JSON.stringify(['contentHash', 'issuedAt', 'revision', 'size'])
	) {
		throw new Error('Cloud restore returned an invalid snapshot record.');
	}
	const { revision, size, contentHash, issuedAt } = value.meta;
	if (
		!Number.isSafeInteger(revision) ||
		Number(revision) < 0 ||
		!Number.isSafeInteger(size) ||
		Number(size) < 0 ||
		typeof contentHash !== 'string' ||
		typeof issuedAt !== 'string' ||
		!Number.isFinite(Date.parse(issuedAt))
	) {
		throw new Error('Cloud restore returned invalid snapshot metadata.');
	}
	validateEncryptedEnvelope(value.envelope);
	if (
		value.envelope.contentHash !== contentHash ||
		b64urlBytes(value.envelope.ct) !== Number(size)
	) {
		throw new Error('Cloud restore snapshot metadata does not match its ciphertext.');
	}
	return {
		meta: {
			revision: Number(revision),
			size: Number(size),
			contentHash,
			issuedAt,
		},
		envelope: value.envelope,
	};
}

/** One decrypted cloud operation and the revision the server stored it at. */
export interface PulledOperation {
	revision: number;
	operation: unknown;
}

export function parseOperationsResponse(value: unknown): {
	ops: CloudOpRecord[];
	highWater: number;
	hasMore: boolean;
} {
	if (
		!plainRecord(value) ||
		JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(['hasMore', 'highWater', 'ops']) ||
		!Array.isArray(value.ops) ||
		typeof value.hasMore !== 'boolean' ||
		!Number.isSafeInteger(value.highWater)
	) {
		throw new Error('Cloud sync returned an invalid change list.');
	}
	const ops: CloudOpRecord[] = [];
	for (const raw of value.ops) {
		if (
			!plainRecord(raw) ||
			JSON.stringify(Object.keys(raw).sort()) !== JSON.stringify(['envelope', 'meta']) ||
			!plainRecord(raw.meta) ||
			JSON.stringify(Object.keys(raw.meta).sort()) !==
				JSON.stringify(['contentHash', 'issuedAt', 'participantId', 'revision', 'size'])
		) {
			throw new Error('Cloud sync returned an invalid change record.');
		}
		const { participantId, revision, size, contentHash, issuedAt } = raw.meta;
		if (
			typeof participantId !== 'string' ||
			!Number.isSafeInteger(revision) ||
			Number(revision) < 0 ||
			Number(revision) > MAX_CLOUD_OPERATION_REVISION ||
			!Number.isSafeInteger(size) ||
			Number(size) < 0 ||
			typeof contentHash !== 'string' ||
			typeof issuedAt !== 'string'
		) {
			throw new Error('Cloud sync returned invalid change metadata.');
		}
		validateEncryptedEnvelope(raw.envelope);
		// The same integrity check the snapshot path makes: server metadata must describe the exact
		// ciphertext it came with, or the pair has been tampered with or corrupted in transit.
		if (raw.envelope.contentHash !== contentHash || b64urlBytes(raw.envelope.ct) !== Number(size)) {
			throw new Error('A cloud change’s metadata does not match its ciphertext.');
		}
		ops.push({
			meta: {
				participantId,
				revision: Number(revision),
				size: Number(size),
				contentHash,
				issuedAt,
			},
			envelope: raw.envelope,
		});
	}
	return { ops, highWater: Number(value.highWater), hasMore: value.hasMore };
}
