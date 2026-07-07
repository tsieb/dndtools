import type { EncryptedEnvelope } from '../security/vault-crypto';
import type { ServerVisibleField } from '../security/cloud-security-model';

/**
 * THE CLOUD-SYNC WIRE CONTRACT (shared by the client sync engine and the sync-api Lambda). Cloud sync is
 * END-TO-END ENCRYPTED: the CIPHERTEXT (an {@link EncryptedEnvelope}) carries the whole sensitive artifact
 * — for an operation that is the ENTIRE {@link SyncOperation} (value, entityType/entityId/opType, path,
 * dependencies …); for a snapshot it is the entire serialized CoreStateSlice. The server sees ONLY the
 * bounded metadata below, which maps 1:1 to the six `ALLOWED_SERVER_METADATA_CLASSES` — never any of the
 * hidden content. `opServerVisibleFields` / `snapshotServerVisibleFields` produce the exact
 * {@link ServerVisibleField} list a publish path (and the server) runs through
 * `assertServerSeesOnlyAllowedMetadata` to PROVE the E2EE claim before anything is stored.
 *
 * Note what is deliberately NOT here: an operation's id, entity type/id, op type, and value are all
 * ciphertext. Server-side ordering uses `revision` (a client-assigned monotonic sequence, the
 * `operation-revision` class); server-side dedupe/integrity uses `contentHash`.
 */

export const CLOUD_SYNC_WIRE_VERSION = 1 as const;

/** Server-visible metadata for one encrypted operation — the six allowed classes only, no content. */
export interface CloudOpMeta {
	/** `participant-id` — the authoring actor (routing / access control). */
	participantId: string;
	/** `operation-revision` — client-assigned monotonic sequence within the vault (ordering + idempotent key). */
	revision: number;
	/** `operation-size` — ciphertext byte length. */
	size: number;
	/** `content-hash` — SHA-256 of the ciphertext (== envelope.contentHash); dedupe + integrity. */
	contentHash: string;
	/** `timestamp` — the operation's issuedAt (ordering / freshness). */
	issuedAt: string;
}

/** One encrypted operation on the wire: bounded metadata + the opaque envelope (the whole SyncOperation). */
export interface CloudOpRecord {
	meta: CloudOpMeta;
	envelope: EncryptedEnvelope;
}

/** Server-visible metadata for one encrypted full-state snapshot — allowed classes only. */
export interface CloudSnapshotMeta {
	/** `operation-revision` — the op-log length the snapshot was taken at (monotonic snapshot version). */
	revision: number;
	/** `operation-size` — ciphertext byte length. */
	size: number;
	/** `content-hash` — SHA-256 of the ciphertext. */
	contentHash: string;
	/** `timestamp` — when the snapshot was taken. */
	issuedAt: string;
}

/** One encrypted full-state snapshot on the wire: bounded metadata + the opaque envelope (the whole slice). */
export interface CloudSnapshotRecord {
	meta: CloudSnapshotMeta;
	envelope: EncryptedEnvelope;
}

/**
 * The server-visible fields for one operation, tagged with their metadata class. Running these through
 * `assertServerSeesOnlyAllowedMetadata` proves the server sees only allowed metadata and no plaintext
 * content (SEC-009 AC4). `vaultId` is supplied by the server from the authenticated request, not the client.
 */
export function opServerVisibleFields(vaultId: string, meta: CloudOpMeta): ServerVisibleField[] {
	return [
		{ field: 'vaultId', metadataClass: 'vault-id', value: vaultId },
		{ field: 'participantId', metadataClass: 'participant-id', value: meta.participantId },
		{ field: 'revision', metadataClass: 'operation-revision', value: meta.revision },
		{ field: 'size', metadataClass: 'operation-size', value: meta.size },
		{ field: 'contentHash', metadataClass: 'content-hash', value: meta.contentHash },
		{ field: 'issuedAt', metadataClass: 'timestamp', value: meta.issuedAt },
	];
}

/** The server-visible fields for one snapshot, tagged with their metadata class (see {@link opServerVisibleFields}). */
export function snapshotServerVisibleFields(vaultId: string, meta: CloudSnapshotMeta): ServerVisibleField[] {
	return [
		{ field: 'vaultId', metadataClass: 'vault-id', value: vaultId },
		{ field: 'revision', metadataClass: 'operation-revision', value: meta.revision },
		{ field: 'size', metadataClass: 'operation-size', value: meta.size },
		{ field: 'contentHash', metadataClass: 'content-hash', value: meta.contentHash },
		{ field: 'issuedAt', metadataClass: 'timestamp', value: meta.issuedAt },
	];
}
