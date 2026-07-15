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
import { createHash } from 'node:crypto';
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
import {
	putItemConditional,
	getItem,
	queryPartition,
	batchDeleteItems,
	transactQuotaWrite,
} from '../lib/aws.ts';
import {
	putJsonVersioned,
	getJsonVersioned,
	deleteObjectVersion,
	deleteObjectVersionsPage,
} from '../lib/s3.ts';

const SYNC_OPS_TABLE = process.env.SYNC_OPS_TABLE!;
const CIPHERTEXT_BUCKET = process.env.CIPHERTEXT_BUCKET!;
const APP_TABLE = process.env.APP_TABLE!;

const nowIso = () => new Date().toISOString();
const REV_WIDTH = 12;
const padRev = (n: number) => String(n).padStart(REV_WIDTH, '0');
const OP_SK = (rev: number) => `op#${padRev(rev)}`;
const SNAPSHOT_SK = 'snapshot#latest';
const USAGE_SK = 'usage#quota';

// Bounds so one request can't drive an unbounded number of S3/DynamoDB writes or
// store an oversized object (cost/DoS amplification — self-tenant, but still capped).
const MAX_OPS_PER_PUSH = 200;
const MAX_OPS_PER_PULL = 500;
const S3_IO_CONCURRENCY = 10;
// Stay comfortably below the synchronous Lambda/API response ceiling after JSON
// framing, headers, and any integration-layer encoding. Pagination is determined
// from the actual UTF-8 representation, not the decoded ciphertext size.
const MAX_PULL_RESPONSE_BYTES = 5 * 1024 * 1024;
const PULL_RESPONSE_FRAMING_RESERVE_BYTES = 1024;
// API Gateway already rejects oversized requests, but checking the delivered body
// before JSON.parse avoids multiplying CPU/S3 work from one very large op batch.
const MAX_PUSH_REQUEST_BYTES = 5 * 1024 * 1024;
// Match the client serializer exactly. This also guarantees every newly accepted
// snapshot can be returned within the stricter encoded response ceiling below.
const MAX_SNAPSHOT_REQUEST_BYTES = 4 * 1024 * 1024;
const MAX_SNAPSHOT_RESPONSE_BYTES = 5 * 1024 * 1024;
// A vault can contain at most 250,001 op rows (zero-based revisions 0..250,000).
// A snapshot revision is the COUNT of operations it materializes, so it needs one
// additional representable value: a vault containing the final legal operation has
// snapshot revision 250,001.
const MAX_OPERATION_REVISION = 250_000;
const MAX_SNAPSHOT_REVISION = MAX_OPERATION_REVISION + 1;
function positiveIntegerEnv(name: string, fallback: number, maximum: number): number {
	const parsed = Number(process.env[name]);
	return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : fallback;
}
// One primary vault per account. The byte quota includes every accepted operation ciphertext
// plus the ONE currently referenced snapshot; superseded snapshots are deleted immediately.
const MAX_VAULT_CIPHERTEXT_BYTES = positiveIntegerEnv(
	'MAX_VAULT_CIPHERTEXT_BYTES',
	256 * 1024 * 1024,
	16 * 1024 * 1024 * 1024,
);
const MAX_VAULT_OPERATIONS = positiveIntegerEnv(
	'MAX_VAULT_OPERATIONS',
	50_000,
	MAX_OPERATION_REVISION + 1,
);
const MAX_CIPHERTEXT_BYTES = 64 * 1024;
// Base64 expands ciphertext by 4/3. Six MiB leaves room for the envelope + metadata
// beneath API Gateway's 10 MiB request limit.
const MAX_SNAPSHOT_BYTES = 6 * 1024 * 1024;
const MAX_DELETE_ROWS = 500;
// Deletion proof survives lost responses/retries, then DynamoDB removes the last account identifier.
// Forty-five days is well beyond the one-hour ID-token lifetime and DynamoDB's 35-day PITR window.
const DELETION_MARKER_TTL_SECONDS = 45 * 24 * 60 * 60;
const MAX_PARTICIPANT_ID_CHARS = 128;
const PARTICIPANT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
const HASH_BYTES = 32;
const GCM_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;

interface EnvelopeContext {
	accountId: string;
	vaultId: string;
	kind: 'operation' | 'snapshot';
	revision: number;
}

/**
 * A client-caused validation failure whose message is SAFE to return. Everything
 * NOT wrapped in this (AWS SDK faults, unexpected errors) is logged server-side and
 * answered with a generic 500 — never echoing internal detail (bucket/table/request
 * ids, key structure) back to the caller.
 */
class BadRequest extends Error {}
class Conflict extends Error {}
class QuotaExceeded extends Error {}
class PayloadTooLarge extends Error {}

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

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireExactKeys(
	value: Record<string, unknown>,
	expected: readonly string[],
	label: string,
) {
	const allowed = new Set(expected);
	if (Object.keys(value).some((key) => !allowed.has(key))) {
		throw new BadRequest(`${label} contains unsupported fields`);
	}
}

function decodeBase64Url(value: unknown, field: string): Buffer {
	if (typeof value !== 'string' || !BASE64URL_RE.test(value)) {
		throw new BadRequest(`${field} must be unpadded base64url`);
	}
	const decoded = Buffer.from(value, 'base64url');
	if (decoded.toString('base64url') !== value) {
		throw new BadRequest(`${field} must be canonical unpadded base64url`);
	}
	return decoded;
}

/** Validate and rebuild an envelope so unrecognized fields can never be persisted. */
function parseEnvelope(
	value: unknown,
	maxBytes: number,
	expectedContext?: EnvelopeContext,
): { envelope: EncryptedEnvelope; size: number } {
	if (!isPlainObject(value)) throw new BadRequest('malformed encrypted envelope');
	if (value.v === 1) {
		requireExactKeys(value, ['v', 'alg', 'epoch', 'iv', 'ct', 'contentHash'], 'envelope');
	} else if (value.v === 2) {
		requireExactKeys(value, ['v', 'alg', 'epoch', 'iv', 'ct', 'contentHash', 'ctx'], 'envelope');
	} else {
		throw new BadRequest('unsupported encrypted envelope');
	}
	if (value.alg !== 'AES-GCM') throw new BadRequest('unsupported encrypted envelope');
	if (!Number.isSafeInteger(value.epoch) || Number(value.epoch) < 0) {
		throw new BadRequest('envelope epoch must be a non-negative integer');
	}
	const iv = decodeBase64Url(value.iv, 'envelope iv');
	const ciphertext = decodeBase64Url(value.ct, 'envelope ciphertext');
	const contentHash = decodeBase64Url(value.contentHash, 'envelope contentHash');
	const contextHash = value.v === 2 ? decodeBase64Url(value.ctx, 'envelope ctx') : null;
	if (iv.byteLength !== GCM_IV_BYTES) throw new BadRequest('envelope iv must be 12 bytes');
	if (ciphertext.byteLength < GCM_TAG_BYTES)
		throw new BadRequest('envelope ciphertext is too short');
	if (ciphertext.byteLength > maxBytes) throw new BadRequest('ciphertext too large');
	if (contentHash.byteLength !== HASH_BYTES) throw new BadRequest('contentHash must be SHA-256');
	if (contextHash && contextHash.byteLength !== HASH_BYTES) {
		throw new BadRequest('ctx must be SHA-256');
	}
	if (value.v === 2 && expectedContext) {
		const expectedContextHash = createHash('sha256')
			.update(
				JSON.stringify([
					'dndtools-vault-artifact',
					2,
					expectedContext.accountId,
					expectedContext.vaultId,
					expectedContext.kind,
					expectedContext.revision,
				]),
			)
			.digest('base64url');
		if (value.ctx !== expectedContextHash) {
			throw new BadRequest('encrypted envelope context does not match this artifact');
		}
	}
	const actualHash = createHash('sha256').update(ciphertext).digest('base64url');
	if (actualHash !== value.contentHash) throw new BadRequest('ciphertext contentHash mismatch');
	const fields = {
		alg: 'AES-GCM' as const,
		epoch: Number(value.epoch),
		iv: String(value.iv),
		ct: String(value.ct),
		contentHash: String(value.contentHash),
	};
	const envelope: EncryptedEnvelope =
		value.v === 2 ? { v: 2, ...fields, ctx: String(value.ctx) } : { v: 1, ...fields };
	return { envelope, size: ciphertext.byteLength };
}

function requireRevision(value: unknown, maximum = MAX_OPERATION_REVISION): number {
	if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > maximum) {
		throw new BadRequest(`revision must be an integer from 0 to ${maximum}`);
	}
	return Number(value);
}

function requireIssuedAt(value: unknown): string {
	if (typeof value !== 'string' || value.length > 40 || !Number.isFinite(Date.parse(value))) {
		throw new BadRequest('issuedAt must be a valid timestamp');
	}
	return value;
}

function indexedEnvelopeVersion(row: Record<string, string>): 1 | 2 {
	const version = row.envelopeVersion === undefined ? 1 : Number(row.envelopeVersion);
	if (version !== 1 && version !== 2) throw new Error('invalid indexed envelope version');
	return version;
}

function indexedSize(row: Record<string, string> | undefined): number {
	if (!row) return 0;
	const size = Number(row.size);
	if (!Number.isSafeInteger(size) || size < 0) throw new Error('invalid indexed ciphertext size');
	return size;
}

function requireVaultId(raw: string | undefined): string {
	if (!raw) throw new BadRequest('missing vaultId');
	let decoded: string;
	try {
		decoded = decodeURIComponent(raw);
	} catch {
		throw new BadRequest('invalid vaultId encoding');
	}
	// The current client has exactly one account vault. Accepting arbitrary ids would let one
	// paid account multiply the server-side storage ceiling by choosing new path segments.
	if (decoded !== 'primary') throw new BadRequest('only the primary vault is supported');
	return decoded;
}

/** Read the authoritative app-api entitlement. Missing, malformed, deleted, and failed reads deny. */
async function hasCloudPlan(sub: string): Promise<boolean> {
	try {
		// Authorization and deletion tombstones must never be served from an
		// eventually-consistent replica: a just-downgraded/deleted account fails closed.
		const row = await getItem(APP_TABLE, { pk: `account#${sub}`, sk: 'entitlement' }, true);
		return !row?.deletedAt && (row?.plan === 'lantern' || row?.plan === 'beacon');
	} catch (err) {
		console.error('sync entitlement read failed closed', { sub: sub.slice(0, 8), err });
		return false;
	}
}

function usageNumbers(row: Record<string, string>): {
	storedBytes: number;
	operationCount: number;
} {
	const storedBytes = Number(row.storedBytes);
	const operationCount = Number(row.operationCount);
	if (
		!Number.isSafeInteger(storedBytes) ||
		storedBytes < 0 ||
		!Number.isSafeInteger(operationCount) ||
		operationCount < 0
	) {
		throw new Error('invalid vault usage row');
	}
	return { storedBytes, operationCount };
}

/**
 * Lazily initialize quota accounting for pre-quota vaults. Conditional creation serializes
 * concurrent initializers; all new-code writers wait for this row before their atomic quota write.
 * A legacy vault already beyond the operation ceiling is initialized saturated and can still read,
 * replay existing revisions, replace a same-sized snapshot, or delete its backup, but cannot grow.
 */
async function ensureVaultUsage(pk: string): Promise<Record<string, string>> {
	const key = { vaultId: pk, sk: USAGE_SK };
	const existing = await getItem(SYNC_OPS_TABLE, key, true);
	if (existing) {
		usageNumbers(existing);
		if (existing.state !== 'active') {
			throw new Conflict('This cloud backup is being removed and cannot accept new data.');
		}
		return existing;
	}
	const rows = await queryPartition(
		SYNC_OPS_TABLE,
		{ name: 'vaultId', value: pk },
		undefined,
		1000,
		MAX_VAULT_OPERATIONS + 3,
		true,
	);
	const operationRows = rows.filter((row) => row.sk.startsWith('op#'));
	const snapshot = rows.find((row) => row.sk === SNAPSHOT_SK);
	const legacyOverflow = operationRows.length > MAX_VAULT_OPERATIONS;
	let storedBytes = operationRows.reduce((sum, row) => sum + Number(row.size || 0), 0);
	storedBytes += Number(snapshot?.size || 0);
	if (!Number.isSafeInteger(storedBytes) || storedBytes < 0) {
		throw new Error('invalid legacy vault usage');
	}
	if (legacyOverflow) storedBytes = Math.max(storedBytes, MAX_VAULT_CIPHERTEXT_BYTES);
	const initialized = {
		vaultId: pk,
		sk: USAGE_SK,
		storedBytes,
		operationCount: operationRows.length,
		state: 'active',
		schemaVersion: 1,
		updatedAt: nowIso(),
	};
	const created = await putItemConditional(SYNC_OPS_TABLE, initialized, {
		expression: 'attribute_not_exists(#vault)',
		names: { '#vault': 'vaultId' },
	});
	if (created) {
		return Object.fromEntries(
			Object.entries(initialized).map(([name, value]) => [name, String(value)]),
		);
	}
	const winner = await getItem(SYNC_OPS_TABLE, key, true);
	if (!winner) throw new Error('vault usage initialization lost without a winner');
	usageNumbers(winner);
	if (winner.state !== 'active') {
		throw new Conflict('This cloud backup is being removed and cannot accept new data.');
	}
	return winner;
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
	// The JWT authorizer guarantees a verified token; `sub` namespaces every key (tenant isolation).
	const claims = (
		event.requestContext as { authorizer?: { jwt?: { claims?: Record<string, unknown> } } }
	).authorizer?.jwt?.claims;
	const sub = claims?.sub ? String(claims.sub) : '';
	if (!sub) return json(401, { error: 'unauthenticated' });

	const routeKey = event.routeKey; // e.g. "POST /vaults/{vaultId}/operations"

	try {
		const vaultId = requireVaultId(event.pathParameters?.vaultId);
		const pk = `${sub}#${vaultId}`;
		const prefix = `${sub}/${vaultId}`;
		const supportedRoutes = new Set([
			'POST /vaults/{vaultId}/operations',
			'GET /vaults/{vaultId}/operations',
			'PUT /vaults/{vaultId}/snapshot',
			'GET /vaults/{vaultId}/snapshot/latest',
			'DELETE /vaults/{vaultId}',
		]);
		if (!supportedRoutes.has(routeKey)) return json(404, { error: `unknown route ${routeKey}` });
		// Account deletion must always be able to purge ciphertext, even after downgrade,
		// tombstoning, or an app-table outage. Every read/write path requires Lantern/Beacon.
		if (routeKey !== 'DELETE /vaults/{vaultId}' && !(await hasCloudPlan(sub))) {
			return json(403, { error: 'cloud sync requires the Lantern or Beacon plan' });
		}
		if (routeKey === 'POST /vaults/{vaultId}/operations') {
			return await pushOperations(sub, pk, prefix, vaultId, event.body);
		}
		if (routeKey === 'GET /vaults/{vaultId}/operations') {
			return await pullOperations(pk, event.queryStringParameters?.since);
		}
		if (routeKey === 'PUT /vaults/{vaultId}/snapshot') {
			return await putSnapshot(sub, pk, prefix, vaultId, event.body);
		}
		if (routeKey === 'GET /vaults/{vaultId}/snapshot/latest') {
			return await getSnapshot(pk);
		}
		if (routeKey === 'DELETE /vaults/{vaultId}') {
			return await deleteVault(pk, `${prefix}/`);
		}
		return json(404, { error: `unknown route ${routeKey}` });
	} catch (err) {
		// Client-caused validation failures carry a safe message; anything else is an
		// internal fault — log it (with context) and return a generic 500 so AWS SDK
		// error text (table/bucket/key/request-id detail) never reaches the caller.
		if (err instanceof BadRequest) return json(400, { error: err.message });
		if (err instanceof Conflict) return json(409, { error: err.message });
		if (err instanceof QuotaExceeded) return json(413, { error: err.message });
		if (err instanceof PayloadTooLarge) return json(413, { error: err.message });
		if (err instanceof SyntaxError) return json(400, { error: 'malformed request body' });
		console.error('sync-api error', { routeKey, sub: sub.slice(0, 8), err });
		return json(500, { error: 'internal error' });
	}
};

// --- POST /operations: store encrypted op-log tail (idempotent by revision) --------
async function cleanupRetiredOperation(
	pk: string,
	row: Record<string, string> | undefined,
): Promise<Record<string, string> | undefined> {
	if (!row?.retiredS3Key || !row.retiredS3VersionId) return row;
	await deleteObjectVersion(CIPHERTEXT_BUCKET, row.retiredS3Key, row.retiredS3VersionId);
	const cleaned = { ...row };
	delete cleaned.retiredS3Key;
	delete cleaned.retiredS3VersionId;
	const updated = await putItemConditional(SYNC_OPS_TABLE, cleaned, {
		expression: '#revision = :revision AND #version = :version',
		names: { '#revision': 'revision', '#version': 's3VersionId' },
		values: { ':revision': Number(row.revision), ':version': row.s3VersionId },
	});
	if (updated) return cleaned;
	return getItem(SYNC_OPS_TABLE, { vaultId: pk, sk: row.sk }, true);
}

async function pushOperations(
	accountId: string,
	pk: string,
	prefix: string,
	vaultId: string,
	body: string | undefined,
) {
	if (Buffer.byteLength(body ?? '', 'utf8') > MAX_PUSH_REQUEST_BYTES) {
		throw new PayloadTooLarge('operation push body is too large');
	}
	const parsed: unknown = JSON.parse(body ?? '{}');
	if (!isPlainObject(parsed)) throw new BadRequest('request body must be an object');
	requireExactKeys(parsed, ['ops'], 'request body');
	const ops = parsed.ops ?? [];
	if (!Array.isArray(ops)) throw new BadRequest('ops must be an array');
	if (ops.length > MAX_OPS_PER_PUSH) throw new BadRequest('too many operations in one push');
	const validated: Array<{ record: CloudOpRecord; revision: number }> = [];
	const revisions = new Set<number>();
	for (const rawRecord of ops) {
		if (!isPlainObject(rawRecord)) throw new BadRequest('malformed operation record');
		requireExactKeys(rawRecord, ['meta', 'envelope'], 'operation record');
		if (!isPlainObject(rawRecord.meta)) throw new BadRequest('malformed operation metadata');
		requireExactKeys(
			rawRecord.meta,
			['participantId', 'revision', 'size', 'contentHash', 'issuedAt'],
			'operation metadata',
		);
		const participantId = rawRecord.meta.participantId;
		if (
			typeof participantId !== 'string' ||
			participantId.length > MAX_PARTICIPANT_ID_CHARS ||
			!PARTICIPANT_ID_RE.test(participantId)
		) {
			throw new BadRequest('participantId has an invalid format');
		}
		const rev = requireRevision(rawRecord.meta.revision);
		const { envelope, size } = parseEnvelope(rawRecord.envelope, MAX_CIPHERTEXT_BYTES, {
			accountId,
			vaultId,
			kind: 'operation',
			revision: rev,
		});
		if (revisions.has(rev))
			throw new BadRequest('operation revisions must be unique within a push');
		revisions.add(rev);
		const issuedAt = requireIssuedAt(rawRecord.meta.issuedAt);
		if (rawRecord.meta.size !== size) throw new BadRequest('operation size mismatch');
		if (rawRecord.meta.contentHash !== envelope.contentHash)
			throw new BadRequest('content-hash mismatch');
		const record: CloudOpRecord = {
			meta: { participantId, revision: rev, size, contentHash: envelope.contentHash, issuedAt },
			envelope,
		};
		// Integrity: the declared content-hash must match the envelope's.
		// SEC-009 AC4 — the ONLY core policy the untrusted server enforces: server sees allowed metadata only.
		assertVisible(() =>
			assertServerSeesOnlyAllowedMetadata(
				DNDTOOLS_CLOUD_SECURITY_DECISION_RECORD,
				opServerVisibleFields(vaultId, record.meta),
			),
		);
		validated.push({ record, revision: rev });
	}
	if (validated.length === 0) return json(200, { accepted: [] });
	await ensureVaultUsage(pk);
	// One transaction carries one aggregate usage update plus up to 99 immutable op rows,
	// avoiding a hot-usage-row transaction per operation while remaining parallel-request safe.
	for (let offset = 0; offset < validated.length; offset += 99) {
		const chunk = validated.slice(offset, offset + 99);
		const existingRows = await Promise.all(
			chunk.map(({ revision }) =>
				getItem(SYNC_OPS_TABLE, { vaultId: pk, sk: OP_SK(revision) }, true),
			),
		);
		const existing = await Promise.all(existingRows.map((row) => cleanupRetiredOperation(pk, row)));
		type OperationCandidate = (typeof chunk)[number] & {
			previous?: Record<string, string>;
		};
		const candidates: OperationCandidate[] = [];
		for (let index = 0; index < chunk.length; index += 1) {
			const candidate = chunk[index]!;
			const previous = existing[index];
			if (!previous) {
				candidates.push(candidate);
				continue;
			}
			// Same-revision records remain first-write-wins except for the one-way
			// compatibility migration from legacy v1 to context-bound v2. This lets
			// upgraded clients repair old backups without ever allowing v1 to replace v2.
			if (candidate.record.envelope.v === 2 && indexedEnvelopeVersion(previous) === 1) {
				candidates.push({ ...candidate, previous });
			}
		}
		if (candidates.length === 0) continue;
		type UploadedOperation = (typeof candidates)[number] & {
			s3Key: string;
			s3VersionId: string;
			retained: boolean;
			deleted: boolean;
			cleanupAllowed: boolean;
		};
		const uploaded: UploadedOperation[] = [];
		const discard = async (upload: UploadedOperation) => {
			if (upload.retained || upload.deleted || !upload.cleanupAllowed) return;
			await deleteObjectVersion(CIPHERTEXT_BUCKET, upload.s3Key, upload.s3VersionId);
			upload.deleted = true;
		};
		const discardAll = async (batch: UploadedOperation[]) => {
			const results = await Promise.allSettled(batch.map(discard));
			const failed = results.find(
				(result): result is PromiseRejectedResult => result.status === 'rejected',
			);
			if (failed) throw failed.reason;
		};
		const conditionFor = (upload: UploadedOperation) => {
			const previous = upload.previous;
			if (!previous) {
				return {
					expression: 'attribute_not_exists(#vault)',
					names: { '#vault': 'vaultId' },
				};
			}
			const names: Record<string, string> = {
				'#revision': 'revision',
				'#version': 's3VersionId',
				'#envelopeVersion': 'envelopeVersion',
			};
			const values: Record<string, string | number> = {
				':expectedRevision': Number(previous.revision),
				':legacy': 1,
			};
			if (previous.s3VersionId) {
				values[':expectedVersion'] = previous.s3VersionId;
				return {
					expression:
						'#revision = :expectedRevision AND #version = :expectedVersion AND (attribute_not_exists(#envelopeVersion) OR #envelopeVersion = :legacy)',
					names,
					values,
				};
			}
			names['#hash'] = 'contentHash';
			values[':expectedHash'] = previous.contentHash;
			return {
				expression:
					'#revision = :expectedRevision AND #hash = :expectedHash AND attribute_not_exists(#version) AND (attribute_not_exists(#envelopeVersion) OR #envelopeVersion = :legacy)',
				names,
				values,
			};
		};
		try {
			for (
				let uploadOffset = 0;
				uploadOffset < candidates.length;
				uploadOffset += S3_IO_CONCURRENCY
			) {
				// Wait for every upload in the bounded batch before inspecting failures.
				// Promise.all would reject early while other puts were still completing,
				// allowing those late versions to miss the finally cleanup below.
				const results = await Promise.allSettled(
					candidates
						.slice(uploadOffset, uploadOffset + S3_IO_CONCURRENCY)
						.map(async (candidate) => {
							const s3Key = `${prefix}/ops/${padRev(candidate.revision)}.json`;
							const s3VersionId = await putJsonVersioned(
								CIPHERTEXT_BUCKET,
								s3Key,
								candidate.record.envelope,
							);
							return {
								...candidate,
								s3Key,
								s3VersionId,
								retained: false,
								deleted: false,
								cleanupAllowed: true,
							} satisfies UploadedOperation;
						}),
				);
				for (const result of results) {
					if (result.status === 'fulfilled') uploaded.push(result.value);
				}
				const failed = results.find(
					(result): result is PromiseRejectedResult => result.status === 'rejected',
				);
				if (failed) throw failed.reason;
			}

			let pending = [...uploaded];
			while (pending.length > 0) {
				// A transport/service exception can arrive after DynamoDB committed. Do not
				// delete any possibly referenced S3 version unless DynamoDB definitively says
				// the transaction did not commit.
				for (const upload of pending) upload.cleanupAllowed = false;
				const result = await transactQuotaWrite(SYNC_OPS_TABLE, {
					usageKey: { vaultId: pk, sk: USAGE_SK },
					byteDelta: pending.reduce(
						(sum, upload) => sum + upload.record.meta.size - indexedSize(upload.previous),
						0,
					),
					operationDelta: pending.filter((upload) => !upload.previous).length,
					maxBytes: MAX_VAULT_CIPHERTEXT_BYTES,
					maxOperations: MAX_VAULT_OPERATIONS,
					items: pending.map((upload) => {
						const { record, revision, s3Key, s3VersionId } = upload;
						return {
							item: {
								vaultId: pk,
								sk: OP_SK(revision),
								participantId: record.meta.participantId,
								revision,
								size: record.meta.size,
								contentHash: record.meta.contentHash,
								issuedAt: record.meta.issuedAt,
								s3Key,
								s3VersionId,
								envelopeVersion: record.envelope.v,
								receivedAt: nowIso(),
								retiredS3Key: upload.previous?.s3VersionId ? upload.previous.s3Key : undefined,
								retiredS3VersionId: upload.previous?.s3VersionId,
							},
							condition: conditionFor(upload),
						};
					}),
				});
				for (const upload of pending) upload.cleanupAllowed = result !== 'written';
				if (result === 'written') {
					for (const upload of pending) upload.retained = true;
					for (
						let cleanupOffset = 0;
						cleanupOffset < pending.length;
						cleanupOffset += S3_IO_CONCURRENCY
					) {
						await Promise.all(
							pending
								.slice(cleanupOffset, cleanupOffset + S3_IO_CONCURRENCY)
								.map(async ({ revision }) => {
									const accepted = await getItem(
										SYNC_OPS_TABLE,
										{ vaultId: pk, sk: OP_SK(revision) },
										true,
									);
									await cleanupRetiredOperation(pk, accepted);
								}),
						);
					}
					break;
				}
				const winners = await Promise.all(
					pending.map(({ revision }) =>
						getItem(SYNC_OPS_TABLE, { vaultId: pk, sk: OP_SK(revision) }, true),
					),
				);
				let changedWinner = false;
				const lost = pending.filter((upload, index) => {
					const winner = winners[index];
					if (!winner) {
						if (upload.previous) {
							upload.previous = undefined;
							changedWinner = true;
						}
						return false;
					}
					if (indexedEnvelopeVersion(winner) >= upload.record.envelope.v) return true;
					upload.previous = winner;
					changedWinner = true;
					return false;
				});
				if (lost.length > 0) {
					for (
						let deleteOffset = 0;
						deleteOffset < lost.length;
						deleteOffset += S3_IO_CONCURRENCY
					) {
						await discardAll(lost.slice(deleteOffset, deleteOffset + S3_IO_CONCURRENCY));
					}
					const lostRevisions = new Set(lost.map(({ revision }) => revision));
					pending = pending.filter(({ revision }) => !lostRevisions.has(revision));
					continue;
				}
				if (changedWinner) continue;
				if (result === 'quota-exceeded' || result === 'condition-failed') {
					throw new QuotaExceeded(
						'This cloud backup has reached its storage limit and cannot accept more data.',
					);
				}
				throw new Error('operation transaction conflicted without an immutable winner');
			}
		} finally {
			for (
				let deleteOffset = 0;
				deleteOffset < uploaded.length;
				deleteOffset += S3_IO_CONCURRENCY
			) {
				await discardAll(uploaded.slice(deleteOffset, deleteOffset + S3_IO_CONCURRENCY));
			}
		}
	}
	const accepted = validated.map(({ revision }) => revision);
	const highWater = accepted.length ? Math.max(...accepted) : undefined;
	return json(200, { accepted, highWater });
}

// --- GET /operations?since=<rev>: return encrypted ops after `since` ----------------
async function pullOperations(pk: string, since: string | undefined) {
	// `since` is exclusive. An ABSENT or EMPTY param means "from the start" (rev 0). Guard the empty
	// string explicitly: Number('') === 0 is finite, which would otherwise make from=1 and drop rev 0.
	const trimmed = since?.trim();
	let sinceRevision = -1;
	if (trimmed) {
		if (!/^-?\d+$/.test(trimmed)) throw new BadRequest('since must be an integer revision');
		sinceRevision = Number(trimmed);
		if (
			!Number.isSafeInteger(sinceRevision) ||
			sinceRevision < -1 ||
			sinceRevision > MAX_OPERATION_REVISION
		) {
			throw new BadRequest(`since must be from -1 to ${MAX_OPERATION_REVISION}`);
		}
	}
	if (sinceRevision === MAX_OPERATION_REVISION) {
		return json(200, { ops: [], highWater: sinceRevision, hasMore: false });
	}
	const from = sinceRevision + 1;
	const rows = await queryPartition(
		SYNC_OPS_TABLE,
		{ name: 'vaultId', value: pk },
		{
			name: 'sk',
			lo: OP_SK(from),
			hi: OP_SK(MAX_OPERATION_REVISION),
		},
		MAX_OPS_PER_PULL + 1,
		MAX_OPS_PER_PULL + 1,
		true,
	);
	const ops: CloudOpRecord[] = [];
	let encodedArrayBytes = 2; // []
	let stoppedForBytes = false;
	const responseBudget = MAX_PULL_RESPONSE_BYTES - PULL_RESPONSE_FRAMING_RESERVE_BYTES;
	const pageRows = rows.slice(0, MAX_OPS_PER_PULL);
	for (let offset = 0; offset < pageRows.length; offset += S3_IO_CONCURRENCY) {
		const hydrated = await Promise.all(
			pageRows.slice(offset, offset + S3_IO_CONCURRENCY).map(async (row) => {
				const envelope = await getJsonVersioned<EncryptedEnvelope>(
					CIPHERTEXT_BUCKET,
					row.s3Key,
					row.s3VersionId || undefined,
				);
				// An index row without its exact immutable object is corruption, not an
				// empty page. Skipping it would advance highWater past unrecoverable data.
				if (!envelope) throw new Error('indexed operation ciphertext is missing');
				return {
					meta: {
						participantId: row.participantId,
						revision: Number(row.revision),
						size: Number(row.size),
						contentHash: row.contentHash,
						issuedAt: row.issuedAt,
					},
					envelope,
				} satisfies CloudOpRecord;
			}),
		);
		for (const operation of hydrated) {
			const operationBytes = Buffer.byteLength(JSON.stringify(operation), 'utf8');
			const projectedBytes = encodedArrayBytes + (ops.length > 0 ? 1 : 0) + operationBytes;
			if (projectedBytes > responseBudget) {
				if (ops.length === 0) throw new Error('indexed operation exceeds the response budget');
				stoppedForBytes = true;
				break;
			}
			ops.push(operation);
			encodedArrayBytes = projectedBytes;
		}
		if (stoppedForBytes) break;
	}
	const highWater = ops.length ? Math.max(...ops.map((o) => o.meta.revision)) : sinceRevision;
	const result = {
		ops,
		highWater,
		hasMore: stoppedForBytes || ops.length < rows.length,
	};
	if (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_PULL_RESPONSE_BYTES) {
		throw new Error('operation response exceeded its encoded byte budget');
	}
	return json(200, result);
}

async function cleanupRetiredSnapshot(
	row: Record<string, string>,
): Promise<Record<string, string>> {
	if (row.retiredS3Key && row.retiredS3VersionId) {
		await deleteObjectVersion(CIPHERTEXT_BUCKET, row.retiredS3Key, row.retiredS3VersionId);
		const cleaned = { ...row };
		delete cleaned.retiredS3Key;
		delete cleaned.retiredS3VersionId;
		const updated = await putItemConditional(SYNC_OPS_TABLE, cleaned, {
			expression: '#revision = :revision AND #version = :version',
			names: { '#revision': 'revision', '#version': 's3VersionId' },
			values: { ':revision': Number(row.revision), ':version': row.s3VersionId },
		});
		if (updated) return cleaned;
		return (
			(await getItem(SYNC_OPS_TABLE, { vaultId: row.vaultId, sk: SNAPSHOT_SK }, true)) ?? cleaned
		);
	}
	return row;
}

function sameSnapshotPointer(
	left: Record<string, string> | undefined,
	right: Record<string, string> | undefined,
): boolean {
	if (!left || !right) return left === right;
	return left.revision === right.revision && left.s3VersionId === right.s3VersionId;
}

// --- PUT /snapshot: store the latest full-state ciphertext snapshot ------------------
async function putSnapshot(
	accountId: string,
	pk: string,
	prefix: string,
	vaultId: string,
	body: string | undefined,
) {
	if (Buffer.byteLength(body ?? '', 'utf8') > MAX_SNAPSHOT_REQUEST_BYTES) {
		throw new PayloadTooLarge('snapshot body is too large');
	}
	const parsed: unknown = JSON.parse(body ?? '{}');
	if (!isPlainObject(parsed)) throw new BadRequest('malformed snapshot record');
	requireExactKeys(parsed, ['meta', 'envelope'], 'snapshot record');
	if (!isPlainObject(parsed.meta)) throw new BadRequest('malformed snapshot metadata');
	requireExactKeys(
		parsed.meta,
		['revision', 'size', 'contentHash', 'issuedAt'],
		'snapshot metadata',
	);
	const revision = requireRevision(parsed.meta.revision, MAX_SNAPSHOT_REVISION);
	const { envelope, size } = parseEnvelope(parsed.envelope, MAX_SNAPSHOT_BYTES, {
		accountId,
		vaultId,
		kind: 'snapshot',
		revision,
	});
	const issuedAt = requireIssuedAt(parsed.meta.issuedAt);
	if (parsed.meta.size !== size) throw new BadRequest('snapshot size mismatch');
	if (parsed.meta.contentHash !== envelope.contentHash)
		throw new BadRequest('content-hash mismatch');
	const record: CloudSnapshotRecord = {
		meta: { revision, size, contentHash: envelope.contentHash, issuedAt },
		envelope,
	};
	assertVisible(() =>
		assertServerSeesOnlyAllowedMetadata(
			DNDTOOLS_CLOUD_SECURITY_DECISION_RECORD,
			snapshotServerVisibleFields(vaultId, record.meta),
		),
	);
	const rev = record.meta.revision;
	const itemKey = { vaultId: pk, sk: SNAPSHOT_SK };
	await ensureVaultUsage(pk);
	let current = await getItem(SYNC_OPS_TABLE, itemKey, true);
	if (current) {
		// A prior accepted replacement records its exact retired version until a request
		// successfully removes it. Replays and later revisions therefore retry cleanup.
		current = await cleanupRetiredSnapshot(current);
		const existingRevision = Number(current.revision);
		if (existingRevision === rev) {
			// Replays are immutable first-write-wins, except for the one-way v1→v2
			// context-binding upgrade. A legacy request can never replace v2.
			if (!(record.envelope.v === 2 && indexedEnvelopeVersion(current) === 1)) {
				return json(200, { ok: true, revision: rev });
			}
		}
		if (existingRevision > rev) {
			throw new Conflict(
				'A newer cloud backup already exists. Sync this device before trying again.',
			);
		}
	}
	// Overwrite one stable VERSIONED key, then atomically advance both its exact DynamoDB pointer and
	// aggregate quota. The put condition names the exact prior pointer, so concurrent replacements retry
	// rather than deleting a version another request still references.
	const s3Key = `${prefix}/snapshots/latest.json`;
	const s3VersionId = await putJsonVersioned(CIPHERTEXT_BUCKET, s3Key, record.envelope);
	let keepVersion = false;
	let cleanupAllowed = true;
	try {
		for (let attempt = 0; attempt < 6; attempt += 1) {
			const previous = current;
			const previousSize = indexedSize(previous);
			const upgradingEnvelope = Boolean(previous && Number(previous.revision) === rev);
			let itemCondition: {
				expression: string;
				names: Record<string, string>;
				values?: Record<string, string | number>;
			};
			if (!previous) {
				itemCondition = {
					expression: 'attribute_not_exists(#vault)',
					names: { '#vault': 'vaultId' },
				};
			} else {
				const names: Record<string, string> = {
					'#revision': 'revision',
					'#version': 's3VersionId',
				};
				const values: Record<string, string | number> = {
					':expectedRevision': Number(previous.revision),
				};
				let expression = previous.s3VersionId
					? '#revision = :expectedRevision AND #version = :expectedVersion'
					: '#revision = :expectedRevision AND attribute_not_exists(#version)';
				if (previous.s3VersionId) values[':expectedVersion'] = previous.s3VersionId;
				if (upgradingEnvelope) {
					names['#envelopeVersion'] = 'envelopeVersion';
					values[':legacy'] = 1;
					expression +=
						' AND (attribute_not_exists(#envelopeVersion) OR #envelopeVersion = :legacy)';
				}
				itemCondition = { expression, names, values };
			}
			cleanupAllowed = false;
			const result = await transactQuotaWrite(SYNC_OPS_TABLE, {
				usageKey: { vaultId: pk, sk: USAGE_SK },
				byteDelta: record.meta.size - previousSize,
				operationDelta: 0,
				maxBytes: MAX_VAULT_CIPHERTEXT_BYTES,
				maxOperations: MAX_VAULT_OPERATIONS,
				items: [
					{
						item: {
							vaultId: pk,
							sk: SNAPSHOT_SK,
							revision: rev,
							size: record.meta.size,
							contentHash: record.meta.contentHash,
							issuedAt: record.meta.issuedAt,
							s3Key,
							s3VersionId,
							envelopeVersion: record.envelope.v,
							receivedAt: nowIso(),
							retiredS3Key: previous?.s3VersionId ? previous.s3Key : undefined,
							retiredS3VersionId: previous?.s3VersionId,
						},
						condition: itemCondition,
					},
				],
			});
			cleanupAllowed = result !== 'written';
			if (result === 'written') {
				keepVersion = true;
				const accepted = await getItem(SYNC_OPS_TABLE, itemKey, true);
				if (accepted) await cleanupRetiredSnapshot(accepted);
				return json(200, { ok: true, revision: rev });
			}

			const winner = await getItem(SYNC_OPS_TABLE, itemKey, true);
			if (winner) {
				const cleanedWinner = await cleanupRetiredSnapshot(winner);
				const winnerRevision = Number(cleanedWinner.revision);
				if (winnerRevision === rev && indexedEnvelopeVersion(cleanedWinner) >= record.envelope.v) {
					return json(200, { ok: true, revision: rev });
				}
				if (winnerRevision > rev) {
					throw new Conflict(
						'A newer cloud backup already exists. Sync this device before trying again.',
					);
				}
				current = cleanedWinner;
			} else {
				current = undefined;
			}
			if (!sameSnapshotPointer(previous, current)) {
				continue;
			}
			if (result === 'quota-exceeded' || result === 'condition-failed') {
				throw new QuotaExceeded(
					'This cloud backup has reached its storage limit and cannot accept more data.',
				);
			}
			throw new Error('snapshot transaction conflicted without a changed pointer');
		}
		throw new Conflict('The cloud backup changed several times while saving. Try again.');
	} finally {
		if (!keepVersion && cleanupAllowed) {
			await deleteObjectVersion(CIPHERTEXT_BUCKET, s3Key, s3VersionId);
		}
	}
}

// --- GET /snapshot/latest: return the latest encrypted full-state snapshot -----------
async function getSnapshot(pk: string) {
	// "latest" must not briefly resolve to an older index pointer immediately after
	// a successful PUT. The referenced S3 version is immutable, so a strong index
	// read gives restore an exact, current row/object pair.
	const row = await getItem(SYNC_OPS_TABLE, { vaultId: pk, sk: SNAPSHOT_SK }, true);
	if (!row) return json(404, { error: 'no snapshot' });
	const envelope = await getJsonVersioned<EncryptedEnvelope>(
		CIPHERTEXT_BUCKET,
		row.s3Key,
		row.s3VersionId || undefined,
	);
	if (!envelope) return json(404, { error: 'snapshot ciphertext missing' });
	const result = {
		meta: {
			revision: Number(row.revision),
			size: Number(row.size),
			contentHash: row.contentHash,
			issuedAt: row.issuedAt,
		},
		envelope,
	};
	if (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_SNAPSHOT_RESPONSE_BYTES) {
		throw new Error('snapshot response exceeded its encoded byte budget');
	}
	return json(200, result);
}

// --- DELETE /vaults/{vaultId}: account-deletion cleanup in bounded pages -----------------
async function deleteVault(pk: string, prefix: string) {
	const usageKey = { vaultId: pk, sk: USAGE_SK };
	// Serialize deletion against every quota transaction. The marker has no TTL while deletion is
	// incomplete. After verified purge it is retained for 45 days, comfortably beyond the one-hour
	// token lifetime and the backup recovery window, so stale clients cannot recreate data.
	const started = await putItemConditional(
		SYNC_OPS_TABLE,
		{
			...usageKey,
			storedBytes: 0,
			operationCount: 0,
			state: 'deleting',
			schemaVersion: 1,
			updatedAt: nowIso(),
		},
		{
			expression: 'attribute_not_exists(#vault) OR #state IN (:active, :deleting)',
			names: { '#vault': 'vaultId', '#state': 'state' },
			values: { ':active': 'active', ':deleting': 'deleting' },
		},
	);
	if (!started) {
		const marker = await getItem(SYNC_OPS_TABLE, usageKey, true);
		if (!marker || !['deleting', 'deleted'].includes(marker.state)) {
			throw new Error('vault deletion could not establish its purge marker');
		}
	}
	const rows = await queryPartition(
		SYNC_OPS_TABLE,
		{ name: 'vaultId', value: pk },
		undefined,
		MAX_DELETE_ROWS + 2,
		MAX_DELETE_ROWS + 2,
		true,
	);
	const dataRows = rows.filter((row) => row.sk !== USAGE_SK);
	const page = dataRows.slice(0, MAX_DELETE_ROWS);
	// Physically delete exact versions instead of adding delete markers. Starting from the S3 prefix
	// also catches unreferenced versions left by a write that failed before its DynamoDB commit.
	const versions = await deleteObjectVersionsPage(CIPHERTEXT_BUCKET, prefix);
	await batchDeleteItems(
		SYNC_OPS_TABLE,
		page.map((row) => ({ vaultId: pk, sk: row.sk })),
	);
	const hasMore = dataRows.length > MAX_DELETE_ROWS || versions.hasMore;
	if (!hasMore) {
		const purgedAt = nowIso();
		const finished = await putItemConditional(
			SYNC_OPS_TABLE,
			{
				...usageKey,
				storedBytes: 0,
				operationCount: 0,
				state: 'deleted',
				schemaVersion: 1,
				purgedAt,
				updatedAt: purgedAt,
				expiresAt: Math.floor(Date.now() / 1000) + DELETION_MARKER_TTL_SECONDS,
			},
			{
				expression: '#state = :deleting OR #state = :deleted',
				names: { '#state': 'state' },
				values: { ':deleting': 'deleting', ':deleted': 'deleted' },
			},
		);
		if (!finished) throw new Error('vault deletion tombstone changed unexpectedly');
	}
	// Verify the durable marker with a strongly consistent read before reporting
	// completion. The app-api can use the same row as its proof that ciphertext was
	// purged, including an account that never created a vault and repeated DELETEs.
	const marker = await getItem(SYNC_OPS_TABLE, usageKey, true);
	const expectedState = hasMore ? 'deleting' : 'deleted';
	if (!marker || marker.state !== expectedState) {
		throw new Error('vault purge marker was not durably recorded');
	}
	const usage = usageNumbers(marker);
	if (usage.storedBytes !== 0 || usage.operationCount !== 0) {
		throw new Error('vault purge marker retained nonzero usage');
	}
	return json(200, {
		// Report physical progress even when only orphan/noncurrent S3 versions remained.
		deleted: page.length + versions.deleted,
		hasMore,
	});
}
