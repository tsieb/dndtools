import Dexie, { type Table } from 'dexie';
import {
	EMPTY_OPERATION_LOG,
	EMPTY_PERMISSION_STATE,
	EMPTY_SCENE_STATE,
	type CoreStateSlice,
	type OperationLog,
	type PermissionState,
	type SceneState,
	type SyncOperation,
} from '@dndtools/v2-core';

const DB_NAME = 'dndtools-v2';
const DB_VERSION = 1;
const SCENE_STATE_KEY = 'scene-state';
const PERMISSION_STATE_KEY = 'permission-state';

interface DocumentRecord {
	key: string;
	doc: unknown;
}

interface OperationRecord {
	id: string;
	op: SyncOperation;
	sequence: number;
}

class V2Database extends Dexie {
	documents!: Table<DocumentRecord, string>;
	operations!: Table<OperationRecord, string>;

	constructor() {
		super(DB_NAME);
		this.version(DB_VERSION).stores({
			documents: '&key',
			operations: '&id, sequence',
		});
	}
}

let dbInstance: V2Database | null = null;

function db(): V2Database {
	if (!dbInstance) {
		dbInstance = new V2Database();
	}
	return dbInstance;
}

export async function loadCoreState(): Promise<CoreStateSlice> {
	const database = db();
	const [sceneDoc, permissionDoc, operationRecords] = await Promise.all([
		database.documents.get(SCENE_STATE_KEY),
		database.documents.get(PERMISSION_STATE_KEY),
		database.operations.orderBy('sequence').toArray(),
	]);
	const scenes = (sceneDoc?.doc as SceneState | undefined) ?? {
		scenes: {},
		schemaVersion: EMPTY_SCENE_STATE.schemaVersion,
	};
	const permissions =
		(permissionDoc?.doc as PermissionState | undefined) ?? {
			actors: {},
			grants: [],
			schemaVersion: EMPTY_PERMISSION_STATE.schemaVersion,
		};
	const sync: OperationLog = {
		operations: operationRecords.map((r) => r.op),
	};
	return { scenes, permissions, sync };
}

export async function persistSceneState(scenes: SceneState): Promise<void> {
	await db().documents.put({ key: SCENE_STATE_KEY, doc: scenes });
}

export async function persistPermissionState(permissions: PermissionState): Promise<void> {
	await db().documents.put({ key: PERMISSION_STATE_KEY, doc: permissions });
}

export async function appendOperations(operations: SyncOperation[]): Promise<void> {
	if (operations.length === 0) return;
	const database = db();
	const existing = await database.operations.count();
	const records = operations.map((op, idx) => ({
		id: op.id,
		op,
		sequence: existing + idx,
	}));
	await database.operations.bulkPut(records);
}

export async function persistFullState(
	previous: CoreStateSlice,
	next: CoreStateSlice,
): Promise<void> {
	const newOperations = next.sync.operations.slice(previous.sync.operations.length);
	await Promise.all([
		persistSceneState(next.scenes),
		persistPermissionState(next.permissions),
		appendOperations(newOperations),
	]);
}

export async function resetCoreStorage(): Promise<void> {
	const database = db();
	await Promise.all([database.documents.clear(), database.operations.clear()]);
}

export const __testing = {
	closeDb: async (): Promise<void> => {
		if (dbInstance) {
			await dbInstance.close();
			dbInstance = null;
		}
	},
	setDb: (mock: V2Database | null): void => {
		dbInstance = mock;
	},
	DB_NAME,
	SCENE_STATE_KEY,
	PERMISSION_STATE_KEY,
};
