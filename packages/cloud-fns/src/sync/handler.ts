// dndtools cloud sync-api — one Lambda behind an API Gateway HTTP API (Cognito JWT
// authorizer). It is an UNTRUSTED, end-to-end-encrypted store: clients hand it
// AES-256-GCM envelopes (opaque ciphertext) plus a strictly bounded metadata set;
// it stores ciphertext in S3 and the metadata index in DynamoDB, and NEVER holds a
// key or decrypts anything.
//
// Core-policy reuse (the SEC-009 crux): every write runs the client's OWN
// assertServerSeesOnlyAllowedMetadata over the request's server-visible fields — if a
// caller tried to smuggle plaintext content or a disallowed metadata class, the write
// is rejected fail-closed. The server does NOT (cannot) run replay-validation: replay
// ordering/visibility needs plaintext op contents, which are ciphertext here — the
// CLIENT runs validateReplayBatch on PULL before applying. Restore is snapshot-based
// (there is no generic op-applier), so a full-state snapshot is the materialized unit.
//
// Tenant isolation: every key is namespaced by the authenticated Cognito `sub`, so a
// user can only ever read/write their own vaults regardless of the vaultId they pass.
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import {
	DNDTOOLS_CLOUD_SECURITY_DECISION_RECORD,
	assertServerSeesOnlyAllowedMetadata,
	opServerVisibleFields,
	snapshotServerVisibleFields,
	type CloudOpRecord,
	type CloudSnapshotRecord,
	type EncryptedEnvelope,
} from '@dndtools/core';
import { putItem, getItem, queryPartition } from '../lib/aws.ts';
import { putJson, getJson } from '../lib/s3.ts';

const SYNC_OPS_TABLE = process.env.SYNC_OPS_TABLE!;
const CIPHERTEXT_BUCKET = process.env.CIPHERTEXT_BUCKET!;

const nowIso = () => new Date().toISOString();
const REV_WIDTH = 12;
const padRev = (n: number) => String(n).padStart(REV_WIDTH, '0');
const OP_SK = (rev: number) => `op#${padRev(rev)}`;
const SNAPSHOT_SK = 'snapshot#latest';

// Bounds so one request can't drive an unbounded number of S3/DynamoDB writes or
// store an oversized object (cost/DoS amplification — self-tenant, but still capped).
const MAX_OPS_PER_PUSH = 500;
const MAX_CIPHERTEXT_BYTES = 1024 * 1024; // 1 MiB per op envelope (op-log tail is small)
const MAX_SNAPSHOT_BYTES = 9 * 1024 * 1024; // full-state snapshot; under API GW's 10 MB payload cap

/**
 * A client-caused validation failure whose message is SAFE to return. Everything
 * NOT wrapped in this (AWS SDK faults, unexpected errors) is logged server-side and
 * answered with a generic 500 — never echoing internal detail (bucket/table/request
 * ids, key structure) back to the caller.
 */
class BadRequest extends Error {}

function json(statusCode: number, body: unknown) {
	return {
		statusCode,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	};
}

/** Run a server-visibility assertion, normalizing its (safe) failure to a BadRequest. */
function assertVisible(fn: () => void) {
	try {
		fn();
	} catch (e) {
		throw new BadRequest(e instanceof Error ? e.message : 'server-visibility violation');
	}
}

/** Minimal structural check that a value is an AES-GCM envelope (opaque; not decrypted). */
function isEnvelope(x: unknown): x is EncryptedEnvelope {
	const e = x as EncryptedEnvelope | undefined;
	return (
		!!e &&
		e.alg === 'AES-GCM' &&
		typeof e.iv === 'string' &&
		typeof e.ct === 'string' &&
		typeof e.contentHash === 'string' &&
		typeof e.epoch === 'number'
	);
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
	// The JWT authorizer guarantees a verified token; `sub` namespaces every key (tenant isolation).
	const claims = (
		event.requestContext as { authorizer?: { jwt?: { claims?: Record<string, unknown> } } }
	).authorizer?.jwt?.claims;
	const sub = claims?.sub ? String(claims.sub) : '';
	if (!sub) return json(401, { error: 'unauthenticated' });

	const rawVaultId = event.pathParameters?.vaultId;
	if (!rawVaultId) return json(400, { error: 'missing vaultId' });
	const vaultId = decodeURIComponent(rawVaultId);
	const pk = `${sub}#${vaultId}`;
	const prefix = `${sub}/${vaultId}`;
	const routeKey = event.routeKey; // e.g. "POST /vaults/{vaultId}/operations"

	try {
		if (routeKey === 'POST /vaults/{vaultId}/operations') {
			return await pushOperations(pk, prefix, vaultId, event.body);
		}
		if (routeKey === 'GET /vaults/{vaultId}/operations') {
			return await pullOperations(pk, event.queryStringParameters?.since);
		}
		if (routeKey === 'PUT /vaults/{vaultId}/snapshot') {
			return await putSnapshot(pk, prefix, vaultId, event.body);
		}
		if (routeKey === 'GET /vaults/{vaultId}/snapshot/latest') {
			return await getSnapshot(pk);
		}
		return json(404, { error: `unknown route ${routeKey}` });
	} catch (err) {
		// Client-caused validation failures carry a safe message; anything else is an
		// internal fault — log it (with context) and return a generic 500 so AWS SDK
		// error text (table/bucket/key/request-id detail) never reaches the caller.
		if (err instanceof BadRequest) return json(400, { error: err.message });
		if (err instanceof SyntaxError) return json(400, { error: 'malformed request body' });
		console.error('sync-api error', { routeKey, sub: sub.slice(0, 8), err });
		return json(500, { error: 'internal error' });
	}
};

// --- POST /operations: store encrypted op-log tail (idempotent by revision) --------
async function pushOperations(
	pk: string,
	prefix: string,
	vaultId: string,
	body: string | undefined,
) {
	const parsed = JSON.parse(body ?? '{}') as { ops?: CloudOpRecord[] };
	const ops = parsed.ops ?? [];
	if (!Array.isArray(ops)) throw new BadRequest('ops must be an array');
	if (ops.length > MAX_OPS_PER_PUSH) throw new BadRequest('too many operations in one push');
	const accepted: number[] = [];
	for (const record of ops) {
		if (!record?.meta || !isEnvelope(record.envelope))
			throw new BadRequest('malformed operation record');
		if (Buffer.byteLength(record.envelope.ct, 'utf8') > MAX_CIPHERTEXT_BYTES)
			throw new BadRequest('ciphertext too large');
		// Integrity: the declared content-hash must match the envelope's.
		if (record.meta.contentHash !== record.envelope.contentHash)
			throw new BadRequest('content-hash mismatch');
		// SEC-009 AC4 — the ONLY core policy the untrusted server enforces: server sees allowed metadata only.
		assertVisible(() =>
			assertServerSeesOnlyAllowedMetadata(
				DNDTOOLS_CLOUD_SECURITY_DECISION_RECORD,
				opServerVisibleFields(vaultId, record.meta),
			),
		);
		const rev = record.meta.revision;
		const s3Key = `${prefix}/ops/${padRev(rev)}.json`;
		await putJson(CIPHERTEXT_BUCKET, s3Key, record.envelope); // ciphertext only
		await putItem(SYNC_OPS_TABLE, {
			vaultId: pk,
			sk: OP_SK(rev),
			participantId: record.meta.participantId,
			revision: rev,
			size: record.meta.size,
			contentHash: record.meta.contentHash,
			issuedAt: record.meta.issuedAt,
			s3Key,
			receivedAt: nowIso(),
		});
		accepted.push(rev);
	}
	const highWater = accepted.length ? Math.max(...accepted) : undefined;
	return json(200, { accepted, highWater });
}

// --- GET /operations?since=<rev>: return encrypted ops after `since` ----------------
async function pullOperations(pk: string, since: string | undefined) {
	// `since` is exclusive. An ABSENT or EMPTY param means "from the start" (rev 0). Guard the empty
	// string explicitly: Number('') === 0 is finite, which would otherwise make from=1 and drop rev 0.
	const trimmed = since?.trim();
	const from = trimmed && Number.isFinite(Number(trimmed)) ? Number(trimmed) + 1 : 0;
	const rows = await queryPartition(
		SYNC_OPS_TABLE,
		{ name: 'vaultId', value: pk },
		{
			name: 'sk',
			lo: OP_SK(from),
			hi: OP_SK(Number.MAX_SAFE_INTEGER),
		},
	);
	const ops: CloudOpRecord[] = [];
	for (const row of rows) {
		const envelope = await getJson<EncryptedEnvelope>(CIPHERTEXT_BUCKET, row.s3Key);
		if (!envelope) continue;
		ops.push({
			meta: {
				participantId: row.participantId,
				revision: Number(row.revision),
				size: Number(row.size),
				contentHash: row.contentHash,
				issuedAt: row.issuedAt,
			},
			envelope,
		});
	}
	const highWater = ops.length ? Math.max(...ops.map((o) => o.meta.revision)) : Number(since ?? -1);
	return json(200, { ops, highWater });
}

// --- PUT /snapshot: store the latest full-state ciphertext snapshot ------------------
async function putSnapshot(pk: string, prefix: string, vaultId: string, body: string | undefined) {
	const record = JSON.parse(body ?? '{}') as CloudSnapshotRecord;
	if (!record?.meta || !isEnvelope(record.envelope))
		throw new BadRequest('malformed snapshot record');
	if (Buffer.byteLength(record.envelope.ct, 'utf8') > MAX_SNAPSHOT_BYTES)
		throw new BadRequest('snapshot too large');
	if (record.meta.contentHash !== record.envelope.contentHash)
		throw new BadRequest('content-hash mismatch');
	assertVisible(() =>
		assertServerSeesOnlyAllowedMetadata(
			DNDTOOLS_CLOUD_SECURITY_DECISION_RECORD,
			snapshotServerVisibleFields(vaultId, record.meta),
		),
	);
	const rev = record.meta.revision;
	// Overwrite a single STABLE key rather than a per-revision key. Only `snapshot#latest` ever points
	// at a snapshot, so per-revision objects are unreferenced garbage that accumulate unbounded (the
	// bucket lifecycle only expires NONCURRENT versions). Overwriting makes the prior object a noncurrent
	// version the 30-day lifecycle rule reclaims.
	const s3Key = `${prefix}/snapshots/latest.json`;
	await putJson(CIPHERTEXT_BUCKET, s3Key, record.envelope);
	await putItem(SYNC_OPS_TABLE, {
		vaultId: pk,
		sk: SNAPSHOT_SK,
		revision: rev,
		size: record.meta.size,
		contentHash: record.meta.contentHash,
		issuedAt: record.meta.issuedAt,
		s3Key,
		receivedAt: nowIso(),
	});
	return json(200, { ok: true, revision: rev });
}

// --- GET /snapshot/latest: return the latest encrypted full-state snapshot -----------
async function getSnapshot(pk: string) {
	const row = await getItem(SYNC_OPS_TABLE, { vaultId: pk, sk: SNAPSHOT_SK });
	if (!row) return json(404, { error: 'no snapshot' });
	const envelope = await getJson<EncryptedEnvelope>(CIPHERTEXT_BUCKET, row.s3Key);
	if (!envelope) return json(404, { error: 'snapshot ciphertext missing' });
	return json(200, {
		meta: {
			revision: Number(row.revision),
			size: Number(row.size),
			contentHash: row.contentHash,
			issuedAt: row.issuedAt,
		},
		envelope,
	});
}
