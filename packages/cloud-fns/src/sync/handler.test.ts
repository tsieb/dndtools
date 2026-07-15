import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { createHash } from 'node:crypto';
import { openWithKeyMaterial, sealWithKeyMaterial } from '@dndtools/core';

// The sync-api handler is an UNTRUSTED, E2EE store: it takes AES-GCM envelopes + a bounded metadata set,
// stores ciphertext, and NEVER decrypts. These tests drive the real handler against an in-memory fake of
// the AWS layer, while the SEC-009 server-visibility guard runs the REAL @dndtools/core policy (aliased
// to source in vitest.cloud.config.ts). Env must be set before the handler module evaluates.
vi.hoisted(() => {
	process.env.SYNC_OPS_TABLE = 'ops';
	process.env.CIPHERTEXT_BUCKET = 'bucket';
	process.env.APP_TABLE = 'app';
	process.env.AWS_REGION = 'ca-central-1';
	process.env.MAX_VAULT_CIPHERTEXT_BYTES = '4096';
	process.env.MAX_VAULT_OPERATIONS = '2';
});

const store = vi.hoisted(() => {
	const items = new Map<string, Record<string, string>>(); // `${pk}|${sk}` -> row
	const objects = new Map<string, unknown>(); // s3 key -> value
	const versions = new Map<string, Array<{ id: string; value: unknown }>>();
	let versionSeq = 0;
	return {
		items,
		objects,
		versions,
		planReadFails: false,
		throwAfterNextQuotaCommit: false,
		appReadConsistency: [] as boolean[],
		snapshotReadConsistency: [] as boolean[],
		queryConsistency: [] as boolean[],
		failUploadKey: '' as string,
		delayedUploadKeys: new Set<string>(),
		readDelayMs: 0,
		activeReads: 0,
		maxActiveReads: 0,
		get nextVersion() {
			return `v-${versionSeq++}`;
		},
		resetVersions() {
			versionSeq = 0;
		},
	};
});

vi.mock('../lib/aws.ts', () => ({
	putItemConditional: async (
		_table: string,
		obj: Record<string, string | number>,
		condition: {
			expression: string;
			values?: Record<string, string | number>;
		},
	) => {
		const key = `${obj.vaultId}|${obj.sk}`;
		const existing = store.items.get(key);
		if (condition.expression === 'attribute_not_exists(#vault)' && existing) return false;
		if (condition.expression.includes('#revision = :revision')) {
			if (
				!existing ||
				Number(existing.revision) !== Number(condition.values?.[':revision']) ||
				existing.s3VersionId !== condition.values?.[':version']
			) {
				return false;
			}
		}
		if (condition.expression.includes('#state IN')) {
			if (existing && !['active', 'deleting'].includes(existing.state)) return false;
		}
		if (condition.expression.includes('#state = :deleting')) {
			if (!existing || !['deleting', 'deleted'].includes(existing.state)) return false;
		}
		const row: Record<string, string> = {};
		for (const [k, v] of Object.entries(obj)) row[k] = String(v);
		store.items.set(key, row);
		return true;
	},
	transactQuotaWrite: async (
		_table: string,
		write: {
			usageKey: Record<string, string>;
			byteDelta: number;
			operationDelta: number;
			maxBytes: number;
			maxOperations: number;
			items: Array<{
				item: Record<string, string | number | undefined>;
				condition: { expression: string; values?: Record<string, string | number> };
			}>;
		},
	) => {
		const usageKey = `${write.usageKey.vaultId}|${write.usageKey.sk}`;
		const usage = store.items.get(usageKey);
		if (!usage || usage.state !== 'active') return 'quota-exceeded';
		const nextBytes = Number(usage.storedBytes) + write.byteDelta;
		const nextOperations = Number(usage.operationCount) + write.operationDelta;
		const conflicts = write.items.some(({ item, condition }) => {
			const current = store.items.get(`${item.vaultId}|${item.sk}`);
			if (condition.expression === 'attribute_not_exists(#vault)') return Boolean(current);
			if (!current) return true;
			if (Number(current.revision) !== Number(condition.values?.[':expectedRevision'])) return true;
			const expectedVersion = condition.values?.[':expectedVersion'];
			return expectedVersion === undefined
				? Boolean(current.s3VersionId)
				: current.s3VersionId !== expectedVersion;
		});
		if (conflicts) return 'item-conflict';
		if (
			nextBytes < 0 ||
			nextBytes > write.maxBytes ||
			nextOperations < 0 ||
			nextOperations > write.maxOperations
		) {
			return 'quota-exceeded';
		}
		store.items.set(usageKey, {
			...usage,
			storedBytes: String(nextBytes),
			operationCount: String(nextOperations),
		});
		for (const { item } of write.items) {
			const row: Record<string, string> = {};
			for (const [name, value] of Object.entries(item)) {
				if (value !== undefined) row[name] = String(value);
			}
			store.items.set(`${item.vaultId}|${item.sk}`, row);
		}
		if (store.throwAfterNextQuotaCommit) {
			store.throwAfterNextQuotaCommit = false;
			throw new Error('simulated lost transaction response');
		}
		return 'written';
	},
	getItem: async (table: string, key: Record<string, string>, consistentRead = false) => {
		if (table === 'app') store.appReadConsistency.push(consistentRead);
		if (table === 'ops' && key.sk === 'snapshot#latest') {
			store.snapshotReadConsistency.push(consistentRead);
		}
		if (table === 'app' && store.planReadFails) throw new Error('simulated entitlement outage');
		return store.items.get(`${key.vaultId ?? key.pk}|${key.sk}`);
	},
	queryPartition: async (
		_table: string,
		pk: { value: string },
		skRange?: { lo: string; hi: string },
		_pageSize?: number,
		_maxItems?: number,
		consistentRead = false,
	) => {
		store.queryConsistency.push(consistentRead);
		const rows = [...store.items.entries()]
			.filter(([k]) => k.startsWith(`${pk.value}|`))
			.map(([, v]) => v)
			.filter((r) => (skRange ? r.sk >= skRange.lo && r.sk <= skRange.hi : true))
			.sort((a, b) => a.sk.localeCompare(b.sk));
		return rows;
	},
	batchDeleteItems: async (_table: string, keys: Array<Record<string, string>>) => {
		for (const key of keys) store.items.delete(`${key.vaultId}|${key.sk}`);
	},
}));

vi.mock('../lib/s3.ts', () => ({
	putJsonVersioned: async (_bucket: string, key: string, value: unknown) => {
		if (store.failUploadKey === key) throw new Error('simulated S3 upload failure');
		if (store.delayedUploadKeys.has(key)) {
			await new Promise((resolve) => setTimeout(resolve, 5));
		}
		const id = store.nextVersion;
		store.versions.set(key, [...(store.versions.get(key) ?? []), { id, value }]);
		store.objects.set(key, value);
		return id;
	},
	getJsonVersioned: async (_bucket: string, key: string, versionId?: string) => {
		store.activeReads += 1;
		store.maxActiveReads = Math.max(store.maxActiveReads, store.activeReads);
		if (store.readDelayMs > 0) {
			await new Promise((resolve) => setTimeout(resolve, store.readDelayMs));
		}
		try {
			return versionId
				? (store.versions.get(key)?.find((version) => version.id === versionId)?.value ?? null)
				: (store.objects.get(key) ?? null);
		} finally {
			store.activeReads -= 1;
		}
	},
	deleteObjectVersion: async (_bucket: string, key: string, versionId: string) => {
		const remaining = (store.versions.get(key) ?? []).filter((version) => version.id !== versionId);
		store.versions.set(key, remaining);
		if (remaining.length > 0) store.objects.set(key, remaining.at(-1)!.value);
		else store.objects.delete(key);
	},
	deleteObjects: async (_bucket: string, keys: string[]) => {
		for (const key of keys) {
			store.objects.delete(key);
			store.versions.delete(key);
		}
	},
	deleteObjectVersionsPage: async (_bucket: string, prefix: string) => {
		let deleted = 0;
		for (const key of [...store.versions.keys()]) {
			if (!key.startsWith(prefix)) continue;
			deleted += store.versions.get(key)?.length ?? 0;
			store.versions.delete(key);
			store.objects.delete(key);
		}
		return { deleted, hasMore: false };
	},
}));

const { handler } = await import('./handler.ts');

const envelope = {
	v: 1,
	alg: 'AES-GCM',
	epoch: 0,
	iv: 'AAAAAAAAAAAAAAAA',
	ct: 'AAAAAAAAAAAAAAAAAAAAAA',
	contentHash: 'N0cI__dxndWXnsh11WzSKG9tPPfsMXo7JWMqqyjsN7s',
};
const goodMeta = {
	participantId: 'actor-dm',
	revision: 0,
	size: 16,
	contentHash: envelope.contentHash,
	issuedAt: '2026-07-06T00:00:00.000Z',
};

function alternateEnvelope() {
	const bytes = Buffer.alloc(16, 1);
	return {
		...envelope,
		ct: bytes.toString('base64url'),
		contentHash: createHash('sha256').update(bytes).digest('base64url'),
	};
}

function contextHash(
	kind: 'operation' | 'snapshot',
	revision: number,
	accountId = 'user-1',
	vaultId = 'primary',
): string {
	return createHash('sha256')
		.update(JSON.stringify(['dndtools-vault-artifact', 2, accountId, vaultId, kind, revision]))
		.digest('base64url');
}

function contextBoundEnvelope(
	fill = 2,
	size = 16,
	kind: 'operation' | 'snapshot' = 'operation',
	revision = 0,
) {
	const bytes = Buffer.alloc(size, fill);
	return {
		v: 2 as const,
		alg: 'AES-GCM' as const,
		epoch: 0,
		iv: Buffer.alloc(12, fill).toString('base64url'),
		ct: bytes.toString('base64url'),
		contentHash: createHash('sha256').update(bytes).digest('base64url'),
		ctx: contextHash(kind, revision),
	};
}

function envelopeWithSize(size: number, fill: number) {
	const bytes = Buffer.alloc(size, fill);
	return {
		...envelope,
		ct: bytes.toString('base64url'),
		contentHash: createHash('sha256').update(bytes).digest('base64url'),
	};
}

function event(
	routeKey: string,
	opts: { vaultId?: string; sub?: string; body?: unknown; since?: string } = {},
) {
	const [method, rawPath] = routeKey.split(' ');
	return {
		routeKey,
		rawPath,
		requestContext: {
			http: { method },
			authorizer: { jwt: { claims: { sub: opts.sub ?? 'user-1' } } },
		},
		pathParameters: { vaultId: opts.vaultId ?? 'primary' },
		queryStringParameters: opts.since !== undefined ? { since: opts.since } : undefined,
		body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
	} as unknown as APIGatewayProxyEventV2;
}

const call = (e: APIGatewayProxyEventV2) =>
	handler(e, {} as never, () => {}) as Promise<{ statusCode: number; body: string }>;

function seedIndexedOperation(revision: number, value: typeof envelope): void {
	const sk = `op#${String(revision).padStart(12, '0')}`;
	const s3Key = `user-1/primary/ops/${String(revision).padStart(12, '0')}.json`;
	const versionId = `seed-${revision}`;
	store.items.set(`user-1#primary|${sk}`, {
		vaultId: 'user-1#primary',
		sk,
		participantId: 'actor-dm',
		revision: String(revision),
		size: String(Buffer.from(value.ct, 'base64url').byteLength),
		contentHash: value.contentHash,
		issuedAt: '2026-07-06T00:00:00.000Z',
		s3Key,
		s3VersionId: versionId,
	});
	store.versions.set(s3Key, [{ id: versionId, value }]);
	store.objects.set(s3Key, value);
}

beforeEach(() => {
	store.items.clear();
	store.objects.clear();
	store.versions.clear();
	store.resetVersions();
	store.planReadFails = false;
	store.throwAfterNextQuotaCommit = false;
	store.appReadConsistency.length = 0;
	store.snapshotReadConsistency.length = 0;
	store.queryConsistency.length = 0;
	store.failUploadKey = '';
	store.delayedUploadKeys.clear();
	store.readDelayMs = 0;
	store.activeReads = 0;
	store.maxActiveReads = 0;
	for (const sub of ['user-1', 'user-2']) {
		store.items.set(`account#${sub}|entitlement`, {
			pk: `account#${sub}`,
			sk: 'entitlement',
			plan: 'lantern',
		});
	}
});

describe('sync-api handler — E2EE cloud store', () => {
	it('rejects an unauthenticated request (no sub)', async () => {
		const res = await call(
			event('POST /vaults/{vaultId}/operations', { sub: '', body: { ops: [] } }),
		);
		expect(res.statusCode).toBe(401);
	});

	it('accepts a well-formed encrypted op and pulls it back as ciphertext', async () => {
		const push = await call(
			event('POST /vaults/{vaultId}/operations', { body: { ops: [{ meta: goodMeta, envelope }] } }),
		);
		expect(push.statusCode).toBe(200);
		expect(JSON.parse(push.body).accepted).toEqual([0]);
		// Stored under the sub-namespaced partition; the S3 value is the opaque envelope.
		expect(store.objects.get('user-1/primary/ops/000000000000.json')).toEqual(envelope);

		const pull = await call(event('GET /vaults/{vaultId}/operations', { since: '-1' }));
		const body = JSON.parse(pull.body);
		expect(body.ops).toHaveLength(1);
		expect(body.ops[0].envelope).toEqual(envelope);
		expect(body.ops[0].meta.contentHash).toBe(envelope.contentHash);
	});

	it('round-trips real core v2 operation and snapshot envelopes with the exact client contexts', async () => {
		const key = new Uint8Array(32).fill(9);
		const operationContext = {
			accountId: 'user-1',
			vaultId: 'primary',
			kind: 'operation' as const,
			revision: 0,
		};
		const operationValue = { id: 'op-real', actorId: 'actor-dm', value: { hp: 12 } };
		const operationEnvelope = await sealWithKeyMaterial(key, 0, operationValue, operationContext);
		const operationSize = Buffer.from(operationEnvelope.ct, 'base64url').byteLength;
		const pushed = await call(
			event('POST /vaults/{vaultId}/operations', {
				body: {
					ops: [
						{
							meta: {
								participantId: 'actor-dm',
								revision: 0,
								size: operationSize,
								contentHash: operationEnvelope.contentHash,
								issuedAt: '2026-07-06T00:00:00.000Z',
							},
							envelope: operationEnvelope,
						},
					],
				},
			}),
		);
		expect(pushed.statusCode).toBe(200);
		const pulled = JSON.parse(
			(await call(event('GET /vaults/{vaultId}/operations', { since: '-1' }))).body,
		);
		expect(pulled.ops[0].envelope).toEqual(operationEnvelope);
		expect(await openWithKeyMaterial(key, pulled.ops[0].envelope, operationContext)).toEqual(
			operationValue,
		);

		const snapshotContext = {
			accountId: 'user-1',
			vaultId: 'primary',
			kind: 'snapshot' as const,
			revision: 1,
		};
		const snapshotValue = { sync: { operations: [operationValue] } };
		const snapshotEnvelope = await sealWithKeyMaterial(key, 0, snapshotValue, snapshotContext);
		const snapshotSize = Buffer.from(snapshotEnvelope.ct, 'base64url').byteLength;
		const saved = await call(
			event('PUT /vaults/{vaultId}/snapshot', {
				body: {
					meta: {
						revision: 1,
						size: snapshotSize,
						contentHash: snapshotEnvelope.contentHash,
						issuedAt: '2026-07-06T00:00:01.000Z',
					},
					envelope: snapshotEnvelope,
				},
			}),
		);
		expect(saved.statusCode).toBe(200);
		store.snapshotReadConsistency.length = 0;
		const restored = JSON.parse((await call(event('GET /vaults/{vaultId}/snapshot/latest'))).body);
		expect(store.snapshotReadConsistency).toEqual([true]);
		expect(restored.envelope).toEqual(snapshotEnvelope);
		expect(await openWithKeyMaterial(key, restored.envelope, snapshotContext)).toEqual(
			snapshotValue,
		);
	});

	it('rejects a valid v2 envelope bound to another account, artifact kind, or revision', async () => {
		const key = new Uint8Array(32).fill(8);
		for (const context of [
			{ accountId: 'user-2', vaultId: 'primary', kind: 'operation' as const, revision: 0 },
			{ accountId: 'user-1', vaultId: 'primary', kind: 'snapshot' as const, revision: 0 },
			{ accountId: 'user-1', vaultId: 'primary', kind: 'operation' as const, revision: 1 },
		]) {
			const candidate = await sealWithKeyMaterial(key, 0, { id: 'wrong-context' }, context);
			const response = await call(
				event('POST /vaults/{vaultId}/operations', {
					body: {
						ops: [
							{
								meta: {
									...goodMeta,
									size: Buffer.from(candidate.ct, 'base64url').byteLength,
									contentHash: candidate.contentHash,
								},
								envelope: candidate,
							},
						],
					},
				}),
			);
			expect(response.statusCode).toBe(400);
			expect(JSON.parse(response.body).error).toMatch(/context/i);
		}
		expect(store.objects.size).toBe(0);
	});

	it('settles a failed parallel upload batch and removes every successful late version', async () => {
		store.failUploadKey = 'user-1/primary/ops/000000000000.json';
		store.delayedUploadKeys.add('user-1/primary/ops/000000000001.json');
		const failed = await call(
			event('POST /vaults/{vaultId}/operations', {
				body: {
					ops: [
						{ meta: goodMeta, envelope },
						{ meta: { ...goodMeta, revision: 1 }, envelope },
					],
				},
			}),
		);

		expect(failed.statusCode).toBe(500);
		expect(store.objects.size).toBe(0);
		expect([...store.versions.values()].flat()).toHaveLength(0);
	});

	it('rejects an oversized operation request before parsing or starting uploads', async () => {
		const response = await call(
			event('POST /vaults/{vaultId}/operations', {
				body: { ops: [], padding: 'x'.repeat(5 * 1024 * 1024) },
			}),
		);

		expect(response.statusCode).toBe(413);
		expect(JSON.parse(response.body)).toEqual({ error: 'operation push body is too large' });
		expect(store.objects.size).toBe(0);
	});

	it('paginates pulls below the encoded response budget with bounded S3 concurrency', async () => {
		const largeEnvelope = envelopeWithSize(64 * 1024, 7);
		for (let revision = 0; revision < 70; revision += 1) {
			seedIndexedOperation(revision, largeEnvelope);
		}
		store.readDelayMs = 1;

		const first = await call(event('GET /vaults/{vaultId}/operations', { since: '-1' }));
		const firstBody = JSON.parse(first.body);
		expect(first.statusCode).toBe(200);
		expect(Buffer.byteLength(first.body, 'utf8')).toBeLessThanOrEqual(5 * 1024 * 1024);
		expect(firstBody.ops.length).toBeGreaterThan(0);
		expect(firstBody.ops.length).toBeLessThan(70);
		expect(firstBody.hasMore).toBe(true);
		expect(store.maxActiveReads).toBeLessThanOrEqual(10);

		const second = await call(
			event('GET /vaults/{vaultId}/operations', { since: String(firstBody.highWater) }),
		);
		const secondBody = JSON.parse(second.body);
		expect(secondBody.ops[0].meta.revision).toBe(firstBody.highWater + 1);
		expect(secondBody.ops.at(-1).meta.revision).toBe(69);
		expect(secondBody.hasMore).toBe(false);
		expect(store.queryConsistency.every(Boolean)).toBe(true);
	});

	it('fails a pull instead of silently advancing past an indexed operation missing from S3', async () => {
		seedIndexedOperation(0, envelope);
		store.objects.clear();
		store.versions.clear();

		const response = await call(event('GET /vaults/{vaultId}/operations', { since: '-1' }));
		expect(response.statusCode).toBe(500);
		expect(JSON.parse(response.body)).toEqual({ error: 'internal error' });
	});

	it('acknowledges a different-ciphertext operation replay without replacing the first version', async () => {
		await call(
			event('POST /vaults/{vaultId}/operations', { body: { ops: [{ meta: goodMeta, envelope }] } }),
		);
		const other = alternateEnvelope();
		const replay = await call(
			event('POST /vaults/{vaultId}/operations', {
				body: { ops: [{ meta: { ...goodMeta, contentHash: other.contentHash }, envelope: other }] },
			}),
		);
		expect(replay.statusCode).toBe(200);
		expect(JSON.parse(replay.body).accepted).toEqual([0]);
		expect(store.versions.get('user-1/primary/ops/000000000000.json')).toHaveLength(1);
		const pull = await call(event('GET /vaults/{vaultId}/operations', { since: '-1' }));
		expect(JSON.parse(pull.body).ops[0]).toMatchObject({
			meta: { contentHash: envelope.contentHash },
			envelope,
		});
	});

	it('upgrades a legacy same-revision operation to v2 exactly once without double-counting quota', async () => {
		expect(
			(
				await call(
					event('POST /vaults/{vaultId}/operations', {
						body: { ops: [{ meta: goodMeta, envelope }] },
					}),
				)
			).statusCode,
		).toBe(200);
		const v2 = contextBoundEnvelope(2, 20);
		const upgraded = await call(
			event('POST /vaults/{vaultId}/operations', {
				body: {
					ops: [
						{
							meta: { ...goodMeta, size: 20, contentHash: v2.contentHash },
							envelope: v2,
						},
					],
				},
			}),
		);

		expect(upgraded.statusCode).toBe(200);
		expect(store.items.get('user-1#primary|op#000000000000')).toMatchObject({
			envelopeVersion: '2',
			contentHash: v2.contentHash,
		});
		expect(store.items.get('user-1#primary|usage#quota')).toMatchObject({
			storedBytes: '20',
			operationCount: '1',
		});
		expect(store.versions.get('user-1/primary/ops/000000000000.json')).toHaveLength(1);
		expect(store.objects.get('user-1/primary/ops/000000000000.json')).toEqual(v2);

		expect(
			(
				await call(
					event('POST /vaults/{vaultId}/operations', {
						body: {
							ops: [
								{
									meta: { ...goodMeta, size: 20, contentHash: v2.contentHash },
									envelope: v2,
								},
							],
						},
					}),
				)
			).statusCode,
		).toBe(200);
		expect(store.versions.get('user-1/primary/ops/000000000000.json')).toHaveLength(1);
	});

	it('never permits a legacy operation replay to replace a context-bound revision', async () => {
		const v2 = contextBoundEnvelope();
		await call(
			event('POST /vaults/{vaultId}/operations', {
				body: {
					ops: [
						{
							meta: { ...goodMeta, contentHash: v2.contentHash },
							envelope: v2,
						},
					],
				},
			}),
		);
		const replay = await call(
			event('POST /vaults/{vaultId}/operations', {
				body: { ops: [{ meta: goodMeta, envelope }] },
			}),
		);

		expect(replay.statusCode).toBe(200);
		expect(store.objects.get('user-1/primary/ops/000000000000.json')).toEqual(v2);
		expect(store.versions.get('user-1/primary/ops/000000000000.json')).toHaveLength(1);
	});

	it('treats an identical operation retry as idempotent without creating another S3 version', async () => {
		const request = event('POST /vaults/{vaultId}/operations', {
			body: { ops: [{ meta: goodMeta, envelope }] },
		});
		expect((await call(request)).statusCode).toBe(200);
		expect((await call(request)).statusCode).toBe(200);
		expect(store.versions.get('user-1/primary/ops/000000000000.json')).toHaveLength(1);
	});

	it('acknowledges a fresh-IV operation replay without creating another S3 version', async () => {
		await call(
			event('POST /vaults/{vaultId}/operations', { body: { ops: [{ meta: goodMeta, envelope }] } }),
		);
		const differentIv = { ...envelope, iv: Buffer.alloc(12, 1).toString('base64url') };
		const replay = await call(
			event('POST /vaults/{vaultId}/operations', {
				body: { ops: [{ meta: goodMeta, envelope: differentIv }] },
			}),
		);
		expect(replay.statusCode).toBe(200);
		expect(store.versions.get('user-1/primary/ops/000000000000.json')).toHaveLength(1);
		expect(store.objects.get('user-1/primary/ops/000000000000.json')).toEqual(envelope);
	});

	it('rejects a content-hash mismatch (integrity, fail closed)', async () => {
		const res = await call(
			event('POST /vaults/{vaultId}/operations', {
				body: { ops: [{ meta: { ...goodMeta, contentHash: 'tampered' }, envelope }] },
			}),
		);
		expect(res.statusCode).toBe(400);
	});

	it('recomputes the ciphertext hash and rejects a self-consistent forged declaration', async () => {
		const forged = { ...envelope, contentHash: 'A'.repeat(43) };
		const res = await call(
			event('POST /vaults/{vaultId}/operations', {
				body: {
					ops: [{ meta: { ...goodMeta, contentHash: forged.contentHash }, envelope: forged }],
				},
			}),
		);
		expect(res.statusCode).toBe(400);
		expect(store.objects.size).toBe(0);
	});

	it('rejects unknown envelope/metadata fields so plaintext cannot be smuggled into storage', async () => {
		const extraEnvelope = await call(
			event('POST /vaults/{vaultId}/operations', {
				body: {
					ops: [{ meta: goodMeta, envelope: { ...envelope, plaintext: 'secret encounter notes' } }],
				},
			}),
		);
		expect(extraEnvelope.statusCode).toBe(400);

		const extraMeta = await call(
			event('POST /vaults/{vaultId}/operations', {
				body: { ops: [{ meta: { ...goodMeta, title: 'secret title' }, envelope }] },
			}),
		);
		expect(extraMeta.statusCode).toBe(400);
		expect(store.objects.size).toBe(0);
	});

	it('accepts only exact legacy/current envelope schemas and a 32-byte v2 context hash', async () => {
		const v2 = contextBoundEnvelope();
		const missingContext = await call(
			event('POST /vaults/{vaultId}/operations', {
				body: {
					ops: [
						{
							meta: { ...goodMeta, contentHash: v2.contentHash },
							envelope: { ...v2, ctx: undefined },
						},
					],
				},
			}),
		);
		const shortContext = await call(
			event('POST /vaults/{vaultId}/operations', {
				body: {
					ops: [
						{
							meta: { ...goodMeta, contentHash: v2.contentHash },
							envelope: { ...v2, ctx: Buffer.alloc(31).toString('base64url') },
						},
					],
				},
			}),
		);
		const contextOnLegacy = await call(
			event('POST /vaults/{vaultId}/operations', {
				body: {
					ops: [{ meta: goodMeta, envelope: { ...envelope, ctx: v2.ctx } }],
				},
			}),
		);

		expect(missingContext.statusCode).toBe(400);
		expect(shortContext.statusCode).toBe(400);
		expect(contextOnLegacy.statusCode).toBe(400);
		expect(store.objects.size).toBe(0);
	});

	it('rejects alternate trailing-bit base64url encodings even when they decode to the same hash', async () => {
		const v2 = contextBoundEnvelope();
		const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
		const finalIndex = alphabet.indexOf(v2.contentHash.at(-1)!);
		const aliasedHash = `${v2.contentHash.slice(0, -1)}${alphabet[finalIndex + 1]}`;
		expect(Buffer.from(aliasedHash, 'base64url')).toEqual(Buffer.from(v2.contentHash, 'base64url'));

		const response = await call(
			event('POST /vaults/{vaultId}/operations', {
				body: {
					ops: [
						{
							meta: { ...goodMeta, contentHash: aliasedHash },
							envelope: { ...v2, contentHash: aliasedHash },
						},
					],
				},
			}),
		);
		expect(response.statusCode).toBe(400);
		expect(JSON.parse(response.body).error).toMatch(/canonical/i);
		expect(store.objects.size).toBe(0);
	});

	it('rejects one operation whose decoded ciphertext exceeds 64 KiB', async () => {
		const oversized = envelopeWithSize(64 * 1024 + 1, 6);
		const response = await call(
			event('POST /vaults/{vaultId}/operations', {
				body: {
					ops: [
						{
							meta: {
								...goodMeta,
								size: 64 * 1024 + 1,
								contentHash: oversized.contentHash,
							},
							envelope: oversized,
						},
					],
				},
			}),
		);
		expect(response.statusCode).toBe(400);
		expect(JSON.parse(response.body)).toEqual({ error: 'ciphertext too large' });
	});

	it('rejects false sizes, invalid revisions, and every unsupported vault id', async () => {
		const falseSize = await call(
			event('POST /vaults/{vaultId}/operations', {
				body: { ops: [{ meta: { ...goodMeta, size: 1 }, envelope }] },
			}),
		);
		expect(falseSize.statusCode).toBe(400);

		const badRevision = await call(
			event('POST /vaults/{vaultId}/operations', {
				body: { ops: [{ meta: { ...goodMeta, revision: -1 }, envelope }] },
			}),
		);
		expect(badRevision.statusCode).toBe(400);

		const badVault = await call(
			event('POST /vaults/{vaultId}/operations', {
				vaultId: '../other',
				body: { ops: [{ meta: goodMeta, envelope }] },
			}),
		);
		expect(badVault.statusCode).toBe(400);
		const secondary = await call(
			event('POST /vaults/{vaultId}/operations', {
				vaultId: 'secondary',
				body: { ops: [{ meta: goodMeta, envelope }] },
			}),
		);
		expect(secondary.statusCode).toBe(400);
	});

	it('rejects plaintext smuggled into a metadata field (SEC-009 AC4, real core policy)', async () => {
		const res = await call(
			event('POST /vaults/{vaultId}/operations', {
				body: {
					ops: [{ meta: { ...goodMeta, participantId: 'Bearer eyJevil.tok.en' }, envelope }],
				},
			}),
		);
		expect(res.statusCode).toBe(400);
	});

	it('stores and restores a full-state snapshot', async () => {
		const snapMeta = {
			revision: 5,
			size: 16,
			contentHash: envelope.contentHash,
			issuedAt: '2026-07-06T00:00:00.000Z',
		};
		const put = await call(
			event('PUT /vaults/{vaultId}/snapshot', { body: { meta: snapMeta, envelope } }),
		);
		expect(put.statusCode).toBe(200);

		const get = await call(event('GET /vaults/{vaultId}/snapshot/latest'));
		const body = JSON.parse(get.body);
		expect(body.meta.revision).toBe(5);
		expect(body.envelope).toEqual(envelope);
	});

	it('treats an identical snapshot retry as idempotent without another S3 version', async () => {
		const snapMeta = {
			revision: 5,
			size: 16,
			contentHash: envelope.contentHash,
			issuedAt: '2026-07-06T00:00:00.000Z',
		};
		const request = event('PUT /vaults/{vaultId}/snapshot', {
			body: { meta: snapMeta, envelope },
		});
		expect((await call(request)).statusCode).toBe(200);
		expect((await call(request)).statusCode).toBe(200);
		expect(store.versions.get('user-1/primary/snapshots/latest.json')).toHaveLength(1);
	});

	it('acknowledges a different-ciphertext snapshot replay without replacing the first version', async () => {
		const snapMeta = {
			revision: 5,
			size: 16,
			contentHash: envelope.contentHash,
			issuedAt: '2026-07-06T00:00:00.000Z',
		};
		expect(
			(await call(event('PUT /vaults/{vaultId}/snapshot', { body: { meta: snapMeta, envelope } })))
				.statusCode,
		).toBe(200);

		const other = alternateEnvelope();
		const replay = await call(
			event('PUT /vaults/{vaultId}/snapshot', {
				body: {
					meta: { ...snapMeta, contentHash: other.contentHash },
					envelope: other,
				},
			}),
		);

		expect(replay.statusCode).toBe(200);
		expect(store.versions.get('user-1/primary/snapshots/latest.json')).toHaveLength(1);
		const restored = await call(event('GET /vaults/{vaultId}/snapshot/latest'));
		expect(JSON.parse(restored.body)).toMatchObject({
			meta: { revision: 5, contentHash: envelope.contentHash },
			envelope,
		});
		expect(store.queryConsistency.every(Boolean)).toBe(true);
	});

	it('upgrades a legacy same-revision snapshot to v2 once and keeps quota exact', async () => {
		const legacyMeta = {
			revision: 5,
			size: 16,
			contentHash: envelope.contentHash,
			issuedAt: '2026-07-06T00:00:00.000Z',
		};
		await call(event('PUT /vaults/{vaultId}/snapshot', { body: { meta: legacyMeta, envelope } }));
		const v2 = contextBoundEnvelope(3, 20, 'snapshot', 5);
		const upgraded = await call(
			event('PUT /vaults/{vaultId}/snapshot', {
				body: {
					meta: { ...legacyMeta, size: 20, contentHash: v2.contentHash },
					envelope: v2,
				},
			}),
		);

		expect(upgraded.statusCode).toBe(200);
		expect(store.items.get('user-1#primary|snapshot#latest')).toMatchObject({
			envelopeVersion: '2',
			contentHash: v2.contentHash,
		});
		expect(store.items.get('user-1#primary|usage#quota')).toMatchObject({
			storedBytes: '20',
			operationCount: '0',
		});
		expect(store.versions.get('user-1/primary/snapshots/latest.json')).toHaveLength(1);
		expect(store.objects.get('user-1/primary/snapshots/latest.json')).toEqual(v2);

		await call(
			event('PUT /vaults/{vaultId}/snapshot', {
				body: {
					meta: { ...legacyMeta, size: 20, contentHash: v2.contentHash },
					envelope: v2,
				},
			}),
		);
		expect(store.versions.get('user-1/primary/snapshots/latest.json')).toHaveLength(1);
	});

	it('never permits a legacy snapshot replay to replace a context-bound revision', async () => {
		const v2 = contextBoundEnvelope(4, 16, 'snapshot', 5);
		const meta = {
			revision: 5,
			size: 16,
			contentHash: v2.contentHash,
			issuedAt: '2026-07-06T00:00:00.000Z',
		};
		await call(event('PUT /vaults/{vaultId}/snapshot', { body: { meta, envelope: v2 } }));
		const replay = await call(
			event('PUT /vaults/{vaultId}/snapshot', {
				body: { meta: { ...meta, contentHash: envelope.contentHash }, envelope },
			}),
		);

		expect(replay.statusCode).toBe(200);
		expect(store.objects.get('user-1/primary/snapshots/latest.json')).toEqual(v2);
		expect(store.versions.get('user-1/primary/snapshots/latest.json')).toHaveLength(1);
	});

	it('represents the snapshot after the final legal operation revision', async () => {
		const finalOperationRevision = 250_000;
		const finalSnapshotRevision = finalOperationRevision + 1;
		const operation = await call(
			event('POST /vaults/{vaultId}/operations', {
				body: { ops: [{ meta: { ...goodMeta, revision: finalOperationRevision }, envelope }] },
			}),
		);
		expect(operation.statusCode).toBe(200);

		const snapshot = await call(
			event('PUT /vaults/{vaultId}/snapshot', {
				body: {
					meta: {
						revision: finalSnapshotRevision,
						size: 16,
						contentHash: envelope.contentHash,
						issuedAt: '2026-07-06T00:00:00.000Z',
					},
					envelope,
				},
			}),
		);
		expect(snapshot.statusCode).toBe(200);

		const exhaustedPull = await call(
			event('GET /vaults/{vaultId}/operations', { since: String(finalOperationRevision) }),
		);
		expect(JSON.parse(exhaustedPull.body)).toEqual({
			ops: [],
			highWater: finalOperationRevision,
			hasMore: false,
		});

		const operationPastLimit = await call(
			event('POST /vaults/{vaultId}/operations', {
				body: { ops: [{ meta: { ...goodMeta, revision: finalSnapshotRevision }, envelope }] },
			}),
		);
		expect(operationPastLimit.statusCode).toBe(400);

		const snapshotPastLimit = await call(
			event('PUT /vaults/{vaultId}/snapshot', {
				body: {
					meta: {
						revision: finalSnapshotRevision + 1,
						size: 16,
						contentHash: envelope.contentHash,
						issuedAt: '2026-07-06T00:00:00.000Z',
					},
					envelope,
				},
			}),
		);
		expect(snapshotPastLimit.statusCode).toBe(400);
	});

	it('refuses to regress the latest snapshot and preserves the referenced S3 version', async () => {
		const newerMeta = {
			revision: 5,
			size: 16,
			contentHash: envelope.contentHash,
			issuedAt: '2026-07-06T00:00:00.000Z',
		};
		expect(
			(await call(event('PUT /vaults/{vaultId}/snapshot', { body: { meta: newerMeta, envelope } })))
				.statusCode,
		).toBe(200);
		const other = alternateEnvelope();
		const stale = await call(
			event('PUT /vaults/{vaultId}/snapshot', {
				body: {
					meta: {
						revision: 4,
						size: 16,
						contentHash: other.contentHash,
						issuedAt: '2026-07-05T00:00:00.000Z',
					},
					envelope: other,
				},
			}),
		);
		expect(stale.statusCode).toBe(409);
		const restored = await call(event('GET /vaults/{vaultId}/snapshot/latest'));
		expect(JSON.parse(restored.body)).toMatchObject({ meta: { revision: 5 }, envelope });
	});

	it('returns 404 when no snapshot exists', async () => {
		const res = await call(event('GET /vaults/{vaultId}/snapshot/latest'));
		expect(res.statusCode).toBe(404);
	});

	it('rejects snapshot PUT bodies above the client-aligned 4 MiB wire ceiling', async () => {
		const response = await call(
			event('PUT /vaults/{vaultId}/snapshot', {
				body: { padding: 'x'.repeat(4 * 1024 * 1024) },
			}),
		);
		expect(response.statusCode).toBe(413);
		expect(JSON.parse(response.body)).toEqual({ error: 'snapshot body is too large' });
		expect(store.objects.size).toBe(0);
	});

	it('fails closed before returning a legacy snapshot above the 5 MiB response ceiling', async () => {
		const oversized = envelopeWithSize(4 * 1024 * 1024, 5);
		const s3Key = 'user-1/primary/snapshots/latest.json';
		store.items.set('user-1#primary|snapshot#latest', {
			vaultId: 'user-1#primary',
			sk: 'snapshot#latest',
			revision: '0',
			size: String(4 * 1024 * 1024),
			contentHash: oversized.contentHash,
			issuedAt: '2026-07-06T00:00:00.000Z',
			s3Key,
			s3VersionId: 'legacy-large',
		});
		store.versions.set(s3Key, [{ id: 'legacy-large', value: oversized }]);
		store.objects.set(s3Key, oversized);

		const response = await call(event('GET /vaults/{vaultId}/snapshot/latest'));
		expect(response.statusCode).toBe(500);
		expect(JSON.parse(response.body)).toEqual({ error: 'internal error' });
	});

	it('deletes encrypted operation and snapshot data before account removal', async () => {
		await call(
			event('POST /vaults/{vaultId}/operations', { body: { ops: [{ meta: goodMeta, envelope }] } }),
		);
		const snapMeta = {
			revision: 1,
			size: 16,
			contentHash: envelope.contentHash,
			issuedAt: '2026-07-06T00:00:00.000Z',
		};
		await call(event('PUT /vaults/{vaultId}/snapshot', { body: { meta: snapMeta, envelope } }));

		const removed = await call(event('DELETE /vaults/{vaultId}'));
		expect(removed.statusCode).toBe(200);
		expect(JSON.parse(removed.body)).toEqual({ deleted: 4, hasMore: false });
		expect(store.items.get('user-1#primary|usage#quota')).toMatchObject({
			state: 'deleted',
			storedBytes: '0',
			operationCount: '0',
			schemaVersion: '1',
		});
		expect(store.items.get('user-1#primary|usage#quota')?.purgedAt).toBeTruthy();
		expect(Number(store.items.get('user-1#primary|usage#quota')?.expiresAt)).toBeGreaterThan(
			Math.floor(Date.now() / 1000) + 44 * 24 * 60 * 60,
		);
		expect(
			JSON.parse((await call(event('GET /vaults/{vaultId}/operations', { since: '-1' }))).body).ops,
		).toEqual([]);
		expect((await call(event('GET /vaults/{vaultId}/snapshot/latest'))).statusCode).toBe(404);
	});

	it('reports and removes progress when only an orphaned S3 version remains', async () => {
		store.versions.set('user-1/primary/ops/orphan.json', [{ id: 'orphan-v1', value: envelope }]);
		store.objects.set('user-1/primary/ops/orphan.json', envelope);
		const removed = await call(event('DELETE /vaults/{vaultId}'));
		expect(JSON.parse(removed.body)).toEqual({ deleted: 1, hasMore: false });
		expect(store.versions.size).toBe(0);
	});

	it('creates and re-verifies a deleted purge marker for an empty vault and DELETE retries', async () => {
		const first = await call(event('DELETE /vaults/{vaultId}'));
		const marker = store.items.get('user-1#primary|usage#quota');
		expect(first.statusCode).toBe(200);
		expect(JSON.parse(first.body)).toEqual({ deleted: 0, hasMore: false });
		expect(marker).toMatchObject({ state: 'deleted', storedBytes: '0', operationCount: '0' });
		expect(Number(marker?.expiresAt)).toBeGreaterThan(Math.floor(Date.now() / 1000));

		const retry = await call(event('DELETE /vaults/{vaultId}'));
		expect(retry.statusCode).toBe(200);
		expect(JSON.parse(retry.body)).toEqual({ deleted: 0, hasMore: false });
		expect(store.items.get('user-1#primary|usage#quota')).toMatchObject({
			state: 'deleted',
			storedBytes: '0',
			operationCount: '0',
		});
		expect(store.queryConsistency.every(Boolean)).toBe(true);
	});

	it('fails entitlement checks closed while keeping DELETE available for account cleanup', async () => {
		store.items.delete('account#user-1|entitlement');
		const missing = await call(event('GET /vaults/{vaultId}/operations', { since: '-1' }));
		expect(missing.statusCode).toBe(403);

		store.items.set('account#user-1|entitlement', {
			pk: 'account#user-1',
			sk: 'entitlement',
			plan: 'beacon',
			deletedAt: '2026-07-14T00:00:00.000Z',
		});
		const deletedAccount = await call(event('GET /vaults/{vaultId}/snapshot/latest'));
		expect(deletedAccount.statusCode).toBe(403);

		store.planReadFails = true;
		const outage = await call(event('GET /vaults/{vaultId}/operations', { since: '-1' }));
		expect(outage.statusCode).toBe(403);
		expect((await call(event('DELETE /vaults/{vaultId}'))).statusCode).toBe(200);
		expect(store.appReadConsistency.length).toBeGreaterThan(0);
		expect(store.appReadConsistency.every(Boolean)).toBe(true);
	});

	it('isolates tenants by sub (a different user sees nothing)', async () => {
		await call(
			event('POST /vaults/{vaultId}/operations', {
				sub: 'user-1',
				body: { ops: [{ meta: goodMeta, envelope }] },
			}),
		);
		const pull = await call(
			event('GET /vaults/{vaultId}/operations', { sub: 'user-2', since: '-1' }),
		);
		expect(JSON.parse(pull.body).ops).toHaveLength(0);
	});
});
