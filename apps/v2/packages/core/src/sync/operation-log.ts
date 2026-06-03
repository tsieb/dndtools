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
	idempotencyKeys: ReadonlySet<string>;
}

function operationIdempotencyKey(op: SyncOperation): string | undefined {
	const value = op.value as { idempotencyKey?: unknown } | undefined;
	return typeof value?.idempotencyKey === 'string' ? value.idempotencyKey : undefined;
}

export function createOperationLog(operations: SyncOperation[] = []): OperationLog {
	const idempotencyKeys = new Set<string>();
	for (const op of operations) {
		const key = operationIdempotencyKey(op);
		if (key) idempotencyKeys.add(key);
	}
	return { operations, idempotencyKeys };
}

export const EMPTY_OPERATION_LOG: OperationLog = Object.freeze(createOperationLog());

export function appendOperation(log: OperationLog, op: SyncOperation): OperationLog {
	const key = operationIdempotencyKey(op);
	let idempotencyKeys = log.idempotencyKeys;
	if (key && !idempotencyKeys.has(key)) {
		idempotencyKeys = new Set(idempotencyKeys).add(key);
	}
	return { operations: [...log.operations, op], idempotencyKeys };
}

export function hasIdempotencyKey(log: OperationLog, idempotencyKey: string): boolean {
	return log.idempotencyKeys.has(idempotencyKey);
}

export function findOperationByIdempotencyKey(
	log: OperationLog,
	idempotencyKey: string,
): SyncOperation | undefined {
	return log.operations.find((op) => operationIdempotencyKey(op) === idempotencyKey);
}
