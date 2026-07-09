import { z } from 'zod';
import {
	createPlatformServiceRegistry,
	type PlatformServiceRegistry,
} from '../platform/service-boundary';

/**
 * PLAT-007 request schemas for the named storage platform-service methods.
 *
 * These describe only the shape of the request that crosses the boundary, not the durable
 * domain reducers. Durable mutation semantics still live in the Processing Core command
 * model (Contract 1 / Contract 4 non-negotiables). The boundary check guarantees the
 * adapter never receives an unvalidated, oversized, or unknown-method request.
 */

const schemaVersionField = z.number().int().nonnegative();

const durableDocumentEnvelope = z
	.object({ schemaVersion: schemaVersionField })
	.loose();

/** A single durable operation-log entry, as appended by accepted commands. */
const syncOperationSchema = z
	.object({
		id: z.string().min(1),
		vaultId: z.string().min(1),
		sourceId: z.string().min(1),
		actorId: z.string().min(1),
		entityType: z.string().min(1),
		entityId: z.string().min(1),
		opType: z.string().min(1),
		dependencies: z.array(z.string()),
		issuedAt: z.string().min(1),
		schemaVersion: schemaVersionField,
	})
	.loose();

/** loadCoreState, recoverPendingMigration, and resetCoreStorage take no caller payload. */
export const loadCoreStateRequestSchema = z.undefined();
export const recoverPendingMigrationRequestSchema = z.undefined();
export const resetCoreStorageRequestSchema = z.undefined();

/**
 * Hard per-blob ceiling for the asset-byte store (ADR-014 amendment). Equal to the largest
 * per-asset cap any domain declares (`DEFAULT_MAX_AUDIO_BYTES`); domain commands still apply
 * their own tighter limits (e.g. `DEFAULT_MAX_ASSET_BYTES` for map images) before bytes reach
 * the store, so this is the outer fail-closed bound, not the primary validator.
 */
export const MAX_ASSET_BLOB_BYTES = 32 * 1024 * 1024;

/**
 * Asset-byte methods validate a small DESCRIPTOR at the boundary, never the bytes themselves:
 * a multi-megabyte buffer is not JSON-serializable within the payload budget, and per
 * ADR-014/Contract 2 binary bytes stay out of core state and the operation log entirely. The
 * storage adapter enforces `byteLength` against the actual buffer it receives.
 */
export const putAssetBytesRequestSchema = z
	.object({
		id: z.string().min(1).max(120),
		mime: z.string().min(1).max(255),
		byteLength: z.number().int().positive().max(MAX_ASSET_BLOB_BYTES),
	})
	.strict();

export const getAssetBytesRequestSchema = z
	.object({ id: z.string().min(1).max(120) })
	.strict();

export const deleteAssetBytesRequestSchema = getAssetBytesRequestSchema;

/**
 * persistFullState receives the previous and next durable state slices the runtime is
 * about to write. The boundary only enforces structural shape and the size budget; the
 * adapter still enforces the "no durable change without an accepted operation" invariant.
 */
export const persistFullStateRequestSchema = z
	.object({
		previous: z
			.object({
				scenes: durableDocumentEnvelope,
				maps: durableDocumentEnvelope,
				permissions: durableDocumentEnvelope,
				session: durableDocumentEnvelope,
				widgets: durableDocumentEnvelope,
				commandCenter: durableDocumentEnvelope,
				characters: durableDocumentEnvelope,
				content: durableDocumentEnvelope,
				sync: z.object({ operations: z.array(syncOperationSchema) }).loose(),
			})
			.loose(),
		next: z
			.object({
				scenes: durableDocumentEnvelope,
				maps: durableDocumentEnvelope,
				permissions: durableDocumentEnvelope,
				session: durableDocumentEnvelope,
				widgets: durableDocumentEnvelope,
				commandCenter: durableDocumentEnvelope,
				characters: durableDocumentEnvelope,
				content: durableDocumentEnvelope,
				sync: z.object({ operations: z.array(syncOperationSchema) }).loose(),
			})
			.loose(),
	})
	.strict();

/**
 * The canonical registry for the storage platform-service boundary. Every storage method
 * the runtime can call is wired here with a runtime schema, so no handler exists without
 * validation (PLAT-007 AC1).
 */
export function createStoragePlatformServiceRegistry(): PlatformServiceRegistry {
	return createPlatformServiceRegistry([
		{ method: 'storage.loadCoreState', requestSchema: loadCoreStateRequestSchema },
		{ method: 'storage.persistFullState', requestSchema: persistFullStateRequestSchema },
		{
			method: 'storage.recoverPendingMigration',
			requestSchema: recoverPendingMigrationRequestSchema,
		},
		{ method: 'storage.resetCoreStorage', requestSchema: resetCoreStorageRequestSchema },
		{ method: 'storage.putAssetBytes', requestSchema: putAssetBytesRequestSchema },
		{ method: 'storage.getAssetBytes', requestSchema: getAssetBytesRequestSchema },
		{ method: 'storage.deleteAssetBytes', requestSchema: deleteAssetBytesRequestSchema },
	]);
}
