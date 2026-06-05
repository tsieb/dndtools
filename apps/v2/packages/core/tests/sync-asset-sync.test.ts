import { describe, expect, it } from 'vitest';
import {
	MAX_OPERATION_VALUE_BYTES,
	SYNC_OPERATION_SCHEMA_VERSION,
	assertNoBinaryInOperationLog,
	buildMapAsset,
	deriveAssetAvailability,
	dispatchCommand,
	findBinaryPayloadsInOperations,
	hashAssetBytes,
	operationCarriesBinaryPayload,
	type MapAsset,
	type SyncOperation,
} from '../src';
import { buildInitialState, makeEnvironment } from '../src/testing/fixtures';

/**
 * SYNC-009 — large binary assets sync as content-addressed asset records + metadata operations, never
 * by embedding binary payloads in the op-log. These tests are the primary evidence:
 *   - identical content dedupes by hash (reuse MAP-002),
 *   - no op-log entry embeds binary data (assertion-grade guard),
 *   - the GUI gets a clean asset-missing/degraded availability model (AC2).
 */

function op(overrides: Partial<SyncOperation>): SyncOperation {
	return {
		id: overrides.id ?? 'op-1',
		vaultId: 'vault',
		sourceId: 'local-vault',
		actorId: 'actor-dm',
		entityType: 'map',
		entityId: 'map-1',
		opType: 'map.import.attach',
		path: 'assets/fnv1a64-abc',
		value: { assetId: 'fnv1a64-abc', assetDeduped: false },
		dependencies: [],
		issuedAt: '2026-06-05T00:00:00.000Z',
		schemaVersion: SYNC_OPERATION_SCHEMA_VERSION,
		...overrides,
	};
}

const PNG_HEADER = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

describe('SYNC-009 content-addressed dedupe (reuse MAP-002)', () => {
	it('identical bytes produce the same asset id (dedupe by hash)', () => {
		const a = buildMapAsset({
			bytes: PNG_HEADER,
			mimeType: 'image/png',
			fileName: 'forest.png',
			importedBy: 'actor-dm',
			importedAt: '2026-06-05T00:00:00.000Z',
		}) as MapAsset;
		const b = buildMapAsset({
			bytes: Uint8Array.from(PNG_HEADER),
			mimeType: 'image/png',
			fileName: 'forest-copy.png',
			importedBy: 'actor-dm',
			importedAt: '2026-06-05T01:00:00.000Z',
		}) as MapAsset;
		expect(a.id).toBe(b.id);
		expect(a.checksum).toBe(hashAssetBytes(PNG_HEADER));
	});

	it('different bytes produce different asset ids', () => {
		const a = hashAssetBytes(PNG_HEADER);
		const b = hashAssetBytes(Uint8Array.from([...PNG_HEADER, 5]));
		expect(a).not.toBe(b);
	});
});

describe('SYNC-009 no binary in the op-log', () => {
	it('a metadata operation that references the asset by hash carries no binary', () => {
		expect(operationCarriesBinaryPayload(op({}))).toBeNull();
		expect(findBinaryPayloadsInOperations([op({ id: 'op-a' }), op({ id: 'op-b' })])).toEqual([]);
		expect(() => assertNoBinaryInOperationLog([op({})])).not.toThrow();
	});

	it('detects a raw typed-array (bytes) embedded in an op value', () => {
		const finding = operationCarriesBinaryPayload(
			op({ id: 'bad', value: { assetId: 'fnv1a64-abc', bytes: PNG_HEADER } }),
		);
		expect(finding?.reason).toBe('binary-buffer');
		expect(finding?.path).toBe('bytes');
		expect(() => assertNoBinaryInOperationLog([op({ id: 'bad', value: { bytes: PNG_HEADER } })])).toThrow(
			/content-addressed asset records/,
		);
	});

	it('detects an ArrayBuffer and a Blob-like object embedded in an op value', () => {
		const buffer = PNG_HEADER.buffer.slice(0);
		expect(operationCarriesBinaryPayload(op({ id: 'b1', value: { blob: buffer } }))?.reason).toBe(
			'binary-buffer',
		);
		const blobLike = { size: 1024, type: 'image/png', arrayBuffer: () => Promise.resolve(buffer) };
		expect(operationCarriesBinaryPayload(op({ id: 'b2', value: { file: blobLike } }))?.reason).toBe(
			'blob',
		);
	});

	it('flags an oversized op value as a binary-shaped payload (fail closed)', () => {
		const big = 'x'.repeat(MAX_OPERATION_VALUE_BYTES + 1);
		const finding = operationCarriesBinaryPayload(op({ id: 'huge', value: { blob: big } }));
		expect(finding?.reason).toBe('oversized-value');
	});

	it('the durable op produced by importing a map asset carries the hash, never the bytes', () => {
		const env = makeEnvironment();
		const state = buildInitialState();
		const created = dispatchCommand(state, env, {
			type: 'map.create',
			actorId: 'actor-dm',
			payload: { name: 'Forest' },
		});
		expect(created.status).toBe('accepted');
		if (created.status !== 'accepted') return;
		const mapId = created.events.find((e) => e.kind === 'map.created')?.mapId as string;

		const imported = dispatchCommand(created.nextState, env, {
			type: 'map.import-asset',
			actorId: 'actor-dm',
			payload: {
				mapId,
				bytes: [...PNG_HEADER],
				asset: { mimeType: 'image/png', fileName: 'forest.png', dimensions: null },
			},
		});
		expect(imported.status).toBe('accepted');
		if (imported.status !== 'accepted') return;

		// The whole resulting op-log must be binary-free, and the import op must reference the hash.
		expect(() => assertNoBinaryInOperationLog(imported.nextState.sync.operations)).not.toThrow();
		const importOp = imported.nextState.sync.operations.find((o) =>
			o.opType.startsWith('map.import'),
		);
		expect(importOp).toBeDefined();
		const value = importOp!.value as { assetId: string | null };
		expect(value.assetId).toMatch(/^fnv1a64-/);
		// And the asset record (with the content hash as its id) exists in map state.
		const asset = Object.values(imported.nextState.maps.assets)[0] as MapAsset | undefined;
		expect(asset?.id).toBe(value.assetId);
		expect(asset && 'bytes' in (asset as unknown as Record<string, unknown>)).toBe(false);
	});

	it('importing the same bytes twice dedupes to one asset record and a no-binary op', () => {
		const env = makeEnvironment();
		const state = buildInitialState();
		const created = dispatchCommand(state, env, {
			type: 'map.create',
			actorId: 'actor-dm',
			payload: { name: 'Forest' },
		});
		if (created.status !== 'accepted') throw new Error('map.create failed');
		const mapId = created.events.find((e) => e.kind === 'map.created')?.mapId as string;
		const payload = {
			mapId,
			bytes: [...PNG_HEADER],
			asset: { mimeType: 'image/png', fileName: 'forest.png', dimensions: null },
		};
		const first = dispatchCommand(created.nextState, env, {
			type: 'map.import-asset',
			actorId: 'actor-dm',
			payload,
		});
		if (first.status !== 'accepted') throw new Error('first import failed');
		const second = dispatchCommand(first.nextState, env, {
			type: 'map.import-asset',
			actorId: 'actor-dm',
			payload,
		});
		if (second.status !== 'accepted') throw new Error('second import failed');

		// One physical asset record (deduped by content hash) even after two imports.
		expect(Object.keys(second.nextState.maps.assets)).toHaveLength(1);
		const secondImportOp = second.nextState.sync.operations
			.filter((o) => o.opType.startsWith('map.import'))
			.at(-1)!;
		expect((secondImportOp.value as { assetDeduped: boolean }).assetDeduped).toBe(true);
		expect(() => assertNoBinaryInOperationLog(second.nextState.sync.operations)).not.toThrow();
	});
});

describe('SYNC-009 asset availability (AC2 asset-missing/degraded state)', () => {
	const records: Record<string, MapAsset> = {
		'fnv1a64-a': buildMapAsset({
			bytes: PNG_HEADER,
			mimeType: 'image/png',
			fileName: 'a.png',
			importedBy: 'actor-dm',
			importedAt: '2026-06-05T00:00:00.000Z',
		}) as MapAsset,
	};

	it('reports available when every referenced blob is resolved on the device', () => {
		const view = deriveAssetAvailability(
			{ id: 'map-1', assetIds: ['fnv1a64-a'] },
			records,
			new Set(['fnv1a64-a']),
		);
		expect(view.availability).toBe('available');
		expect(view.missingAssetIds).toEqual([]);
		expect(view.message).toBeNull();
	});

	it('reports degraded when some blobs are missing on the device', () => {
		const view = deriveAssetAvailability(
			{ id: 'map-1', assetIds: ['fnv1a64-a', 'fnv1a64-b'] },
			records,
			new Set(['fnv1a64-a']),
		);
		expect(view.availability).toBe('degraded');
		expect(view.missingAssetIds).toEqual(['fnv1a64-b']);
		expect(view.message).toMatch(/has not synced/);
		// The known record but unresolved blob is reported structurally, with no bytes.
		const missing = view.entries.find((e) => e.assetId === 'fnv1a64-b');
		expect(missing?.state).toBe('missing');
		expect(missing?.blobResolved).toBe(false);
	});

	it('reports unavailable when no referenced blob is resolved on the device', () => {
		const view = deriveAssetAvailability(
			{ id: 'map-1', assetIds: ['fnv1a64-a'] },
			records,
			new Set<string>(),
		);
		expect(view.availability).toBe('unavailable');
		expect(view.message).toMatch(/has not synced/);
	});

	it('a map with no referenced assets is trivially available', () => {
		const view = deriveAssetAvailability({ id: 'map-1', assetIds: [] }, {}, new Set<string>());
		expect(view.availability).toBe('available');
		expect(view.entries).toEqual([]);
	});
});
