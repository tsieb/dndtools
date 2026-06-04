import Dexie, { type Table } from 'dexie';
import {
	EMPTY_COMMAND_CENTER_STATE,
	EMPTY_MAP_STATE,
	EMPTY_PERMISSION_STATE,
	EMPTY_SCENE_STATE,
	EMPTY_SESSION_STATE,
	EMPTY_WIDGET_PACKAGE_STATE,
	createOperationLog,
	createDemoMapState,
	mergeSystemWidgetPackages,
	type CommandCenterState,
	type CoreStateSlice,
	type MapState,
	type PermissionState,
	type SceneState,
	type SessionState,
	type SyncOperation,
	type WidgetPackageState,
} from '@dndtools/v2-core';

const DB_NAME = 'dndtools-v2';
const DB_VERSION = 1;
const SCENE_STATE_KEY = 'scene-state';
const MAP_STATE_KEY = 'map-state';
const PERMISSION_STATE_KEY = 'permission-state';
const SESSION_STATE_KEY = 'session-state';
const WIDGET_PACKAGE_STATE_KEY = 'widget-package-state';
const COMMAND_CENTER_STATE_KEY = 'command-center-state';

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
	const [mapDoc, sessionDoc, widgetPackageDoc, commandCenterDoc] = await Promise.all([
		database.documents.get(MAP_STATE_KEY),
		database.documents.get(SESSION_STATE_KEY),
		database.documents.get(WIDGET_PACKAGE_STATE_KEY),
		database.documents.get(COMMAND_CENTER_STATE_KEY),
	]);
	const scenes = (sceneDoc?.doc as SceneState | undefined) ?? {
		scenes: {},
		schemaVersion: EMPTY_SCENE_STATE.schemaVersion,
	};
	const maps = (mapDoc?.doc as MapState | undefined) ?? createDemoMapState();
	maps.maps ??= { ...EMPTY_MAP_STATE.maps };
	const permissions = (permissionDoc?.doc as PermissionState | undefined) ?? {
		actors: {},
		grants: [],
		schemaVersion: EMPTY_PERMISSION_STATE.schemaVersion,
	};
	const session = (sessionDoc?.doc as SessionState | undefined) ?? {
		workflow: EMPTY_SESSION_STATE.workflow,
		workflowRevision: EMPTY_SESSION_STATE.workflowRevision,
		activeSceneId: EMPTY_SESSION_STATE.activeSceneId,
		activeMap: EMPTY_SESSION_STATE.activeMap,
		combat: { ...EMPTY_SESSION_STATE.combat },
		diceHistory: [...EMPTY_SESSION_STATE.diceHistory],
		timers: {},
		playerViewAssignments: {},
		activeMapProjections: {},
		recapArchiveId: null,
		archives: {},
		schemaVersion: EMPTY_SESSION_STATE.schemaVersion,
	};
	session.workflow ??= EMPTY_SESSION_STATE.workflow;
	session.workflowRevision ??= EMPTY_SESSION_STATE.workflowRevision;
	session.activeSceneId ??= EMPTY_SESSION_STATE.activeSceneId;
	session.activeMap ??= EMPTY_SESSION_STATE.activeMap;
	session.combat ??= { ...EMPTY_SESSION_STATE.combat };
	session.combat.combatantIds ??= [];
	session.diceHistory ??= [];
	session.timers ??= {};
	session.playerViewAssignments ??= {};
	session.activeMapProjections ??= {};
	session.recapArchiveId ??= null;
	session.archives ??= {};
	const widgets = mergeSystemWidgetPackages(
		(widgetPackageDoc?.doc as WidgetPackageState | undefined) ?? {
			packages: {},
			schemaVersion: EMPTY_WIDGET_PACKAGE_STATE.schemaVersion,
		},
	);
	const commandCenter = (commandCenterDoc?.doc as CommandCenterState | undefined) ?? {
		homeSceneId: EMPTY_COMMAND_CENTER_STATE.homeSceneId,
		presets: {},
		schemaVersion: EMPTY_COMMAND_CENTER_STATE.schemaVersion,
	};
	const sync = createOperationLog(operationRecords.map((r) => r.op));
	return { scenes, maps, permissions, session, widgets, commandCenter, sync };
}

async function persistSceneState(scenes: SceneState): Promise<void> {
	await db().documents.put({ key: SCENE_STATE_KEY, doc: scenes });
}

async function persistMapState(maps: MapState): Promise<void> {
	await db().documents.put({ key: MAP_STATE_KEY, doc: maps });
}

async function persistPermissionState(permissions: PermissionState): Promise<void> {
	await db().documents.put({ key: PERMISSION_STATE_KEY, doc: permissions });
}

async function persistSessionState(session: SessionState): Promise<void> {
	await db().documents.put({ key: SESSION_STATE_KEY, doc: session });
}

async function persistWidgetPackageState(widgets: WidgetPackageState): Promise<void> {
	await db().documents.put({ key: WIDGET_PACKAGE_STATE_KEY, doc: widgets });
}

async function persistCommandCenterState(commandCenter: CommandCenterState): Promise<void> {
	await db().documents.put({ key: COMMAND_CENTER_STATE_KEY, doc: commandCenter });
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

// Reducers are immutable, so an unchanged slice keeps its reference and the cheap
// identity check short-circuits on the dispatch hot path. Only when a reference
// differs (a real mutation, or independently-constructed states during seeding) do
// we fall back to a structural compare to confirm the content actually changed.
function sliceChanged(previous: unknown, next: unknown): boolean {
	if (previous === next) return false;
	return JSON.stringify(previous) !== JSON.stringify(next);
}

export async function persistFullState(
	previous: CoreStateSlice,
	next: CoreStateSlice,
): Promise<void> {
	const newOperations = next.sync.operations.slice(previous.sync.operations.length);
	const durableStateChanged =
		sliceChanged(previous.scenes, next.scenes) ||
		sliceChanged(previous.maps, next.maps) ||
		sliceChanged(previous.permissions, next.permissions) ||
		sliceChanged(previous.session, next.session) ||
		sliceChanged(previous.widgets, next.widgets) ||
		sliceChanged(previous.commandCenter, next.commandCenter);
	if (durableStateChanged && newOperations.length === 0) {
		throw new Error('Durable state changed without an accepted Processing Core operation.');
	}
	await Promise.all([
		persistSceneState(next.scenes),
		persistMapState(next.maps),
		persistPermissionState(next.permissions),
		persistSessionState(next.session),
		persistWidgetPackageState(next.widgets),
		persistCommandCenterState(next.commandCenter),
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
	MAP_STATE_KEY,
	PERMISSION_STATE_KEY,
	SESSION_STATE_KEY,
	WIDGET_PACKAGE_STATE_KEY,
	COMMAND_CENTER_STATE_KEY,
};
