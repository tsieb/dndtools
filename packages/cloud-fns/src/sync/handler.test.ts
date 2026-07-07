import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

// The sync-api handler is an UNTRUSTED, E2EE store: it takes AES-GCM envelopes + a bounded metadata set,
// stores ciphertext, and NEVER decrypts. These tests drive the real handler against an in-memory fake of
// the AWS layer, while the SEC-009 server-visibility guard runs the REAL @dndtools/core policy (aliased
// to source in vitest.cloud.config.ts). Env must be set before the handler module evaluates.
vi.hoisted(() => {
	process.env.SYNC_OPS_TABLE = 'ops';
	process.env.CIPHERTEXT_BUCKET = 'bucket';
	process.env.AWS_REGION = 'ca-central-1';
});

const store = vi.hoisted(() => {
	const items = new Map<string, Record<string, string>>(); // `${pk}|${sk}` -> row
	const objects = new Map<string, unknown>(); // s3 key -> value
	return { items, objects };
});

vi.mock('../lib/aws.ts', () => ({
	putItem: async (_table: string, obj: Record<string, string | number>) => {
		const row: Record<string, string> = {};
		for (const [k, v] of Object.entries(obj)) row[k] = String(v);
		store.items.set(`${obj.vaultId}|${obj.sk}`, row);
	},
	getItem: async (_table: string, key: Record<string, string>) =>
		store.items.get(`${key.vaultId}|${key.sk}`),
	queryPartition: async (
		_table: string,
		pk: { value: string },
		skRange?: { lo: string; hi: string },
	) => {
		const rows = [...store.items.entries()]
			.filter(([k]) => k.startsWith(`${pk.value}|`))
			.map(([, v]) => v)
			.filter((r) => (skRange ? r.sk >= skRange.lo && r.sk <= skRange.hi : true))
			.sort((a, b) => a.sk.localeCompare(b.sk));
		return rows;
	},
}));

vi.mock('../lib/s3.ts', () => ({
	putJson: async (_bucket: string, key: string, value: unknown) => {
		store.objects.set(key, value);
	},
	getJson: async (_bucket: string, key: string) => store.objects.get(key) ?? null,
}));

const { handler } = await import('./handler.ts');

const envelope = { v: 1, alg: 'AES-GCM', epoch: 0, iv: 'aXY_', ct: 'Zm9v', contentHash: 'aGFzaA' };
const goodMeta = { participantId: 'actor-dm', revision: 0, size: 3, contentHash: 'aGFzaA', issuedAt: '2026-07-06T00:00:00.000Z' };

function event(routeKey: string, opts: { vaultId?: string; sub?: string; body?: unknown; since?: string } = {}) {
	const [method, rawPath] = routeKey.split(' ');
	return {
		routeKey,
		rawPath,
		requestContext: { http: { method }, authorizer: { jwt: { claims: { sub: opts.sub ?? 'user-1' } } } },
		pathParameters: { vaultId: opts.vaultId ?? 'primary' },
		queryStringParameters: opts.since !== undefined ? { since: opts.since } : undefined,
		body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
	} as unknown as APIGatewayProxyEventV2;
}

const call = (e: APIGatewayProxyEventV2) => handler(e, {} as never, () => {}) as Promise<{ statusCode: number; body: string }>;

beforeEach(() => {
	store.items.clear();
	store.objects.clear();
});

describe('sync-api handler — E2EE cloud store', () => {
	it('rejects an unauthenticated request (no sub)', async () => {
		const res = await call(event('POST /vaults/{vaultId}/operations', { sub: '', body: { ops: [] } }));
		expect(res.statusCode).toBe(401);
	});

	it('accepts a well-formed encrypted op and pulls it back as ciphertext', async () => {
		const push = await call(event('POST /vaults/{vaultId}/operations', { body: { ops: [{ meta: goodMeta, envelope }] } }));
		expect(push.statusCode).toBe(200);
		expect(JSON.parse(push.body).accepted).toEqual([0]);
		// Stored under the sub-namespaced partition; the S3 value is the opaque envelope.
		expect(store.objects.get('user-1/primary/ops/000000000000.json')).toEqual(envelope);

		const pull = await call(event('GET /vaults/{vaultId}/operations', { since: '-1' }));
		const body = JSON.parse(pull.body);
		expect(body.ops).toHaveLength(1);
		expect(body.ops[0].envelope).toEqual(envelope);
		expect(body.ops[0].meta.contentHash).toBe('aGFzaA');
	});

	it('rejects a content-hash mismatch (integrity, fail closed)', async () => {
		const res = await call(
			event('POST /vaults/{vaultId}/operations', {
				body: { ops: [{ meta: { ...goodMeta, contentHash: 'tampered' }, envelope }] },
			}),
		);
		expect(res.statusCode).toBe(400);
	});

	it('rejects plaintext smuggled into a metadata field (SEC-009 AC4, real core policy)', async () => {
		const res = await call(
			event('POST /vaults/{vaultId}/operations', {
				body: { ops: [{ meta: { ...goodMeta, participantId: 'Bearer eyJevil.tok.en' }, envelope }] },
			}),
		);
		expect(res.statusCode).toBe(400);
	});

	it('stores and restores a full-state snapshot', async () => {
		const snapMeta = { revision: 5, size: 3, contentHash: 'aGFzaA', issuedAt: '2026-07-06T00:00:00.000Z' };
		const put = await call(event('PUT /vaults/{vaultId}/snapshot', { body: { meta: snapMeta, envelope } }));
		expect(put.statusCode).toBe(200);

		const get = await call(event('GET /vaults/{vaultId}/snapshot/latest'));
		const body = JSON.parse(get.body);
		expect(body.meta.revision).toBe(5);
		expect(body.envelope).toEqual(envelope);
	});

	it('returns 404 when no snapshot exists', async () => {
		const res = await call(event('GET /vaults/{vaultId}/snapshot/latest'));
		expect(res.statusCode).toBe(404);
	});

	it('isolates tenants by sub (a different user sees nothing)', async () => {
		await call(event('POST /vaults/{vaultId}/operations', { sub: 'user-1', body: { ops: [{ meta: goodMeta, envelope }] } }));
		const pull = await call(event('GET /vaults/{vaultId}/operations', { sub: 'user-2', since: '-1' }));
		expect(JSON.parse(pull.body).ops).toHaveLength(0);
	});
});
