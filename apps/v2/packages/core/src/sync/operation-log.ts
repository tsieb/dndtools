import type { ActorId, OperationId } from '../state/ids';

export const SYNC_OPERATION_SCHEMA_VERSION = 1 as const;

export interface SyncOperation {
	id: OperationId;
	vaultId: string;
	sourceId: string;
	actorId: ActorId;
	entityType: string;
	entityId: string;
	opType: string;
	path?: string;
	value?: unknown;
	beforeRevision?: number;
	afterRevision?: number;
	dependencies: OperationId[];
	issuedAt: string;
	schemaVersion: typeof SYNC_OPERATION_SCHEMA_VERSION;
}

export interface OperationLog {
	operations: SyncOperation[];
}

export const EMPTY_OPERATION_LOG: OperationLog = Object.freeze({ operations: [] });

export function appendOperation(log: OperationLog, op: SyncOperation): OperationLog {
	return { operations: [...log.operations, op] };
}
