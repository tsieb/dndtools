import Dexie, { type Table } from 'dexie';
import {
	DURABLE_STATE_DOCUMENT_IDS,
	EMPTY_COMMAND_CENTER_STATE,
	EMPTY_MAP_STATE,
	EMPTY_PERMISSION_STATE,
	EMPTY_SCENE_STATE,
	EMPTY_SESSION_STATE,
	EMPTY_WIDGET_PACKAGE_STATE,
	createOperationLog,
	createDemoMapState,
	createStoragePlatformServiceRegistry,
	mergeSystemWidgetPackages,
	recoverFromJournal,
	validatePlatformRequest,
	type CommandCenterState,
	type CoreStateSlice,
	type DurableStateDocumentId,
	type MapState,
	type MigrationJournalEntry,
	type PermissionState,
	type PlatformServiceRegistry,
	type RecoveryDecision,
	type SceneState,
	type SessionState,
	type StoragePort,
	type SyncOperation,
	type WidgetPackageState,
} from '@dndtools/v2-core';

const DB_NAME = 'dndtools-v2';
const DB_VERSION = 2;
const SCENE_STATE_KEY = 'scene-state';
const MAP_STATE_KEY = 'map-state';
const PERMISSION_STATE_KEY = 'permission-state';
const SESSION_STATE_KEY = 'session-state';
const WIDGET_PACKAGE_STATE_KEY = 'widget-package-state';
const COMMAND_CENTER_STATE_KEY = 'command-center-state';
const MIGRATION_JOURNAL_KEY = 'migration-journal';

// Maps a durable document id to its persisted document key, so a write-ahead snapshot
// can be restored back into the exact records a migration would have rewritten.
const DOCUMENT_KEY_BY_ID: Record<DurableStateDocumentId, string> = {
	scenes: SCENE_STATE_KEY,
	maps: MAP_STATE_KEY,
	permissions: PERMISSION_STATE_KEY,
	session: SESSION_STATE_KEY,
	widgets: WIDGET_PACKAGE_STATE_KEY,
	commandCenter: COMMAND_CENTER_STATE_KEY,
};

interface DocumentRecord {
	key: string;
	doc: unknown;
}

interface OperationRecord {
	id: string;
	op: SyncOperation;
	sequence: number;
}

interface MigrationJournalRecord {
	key: string;
	entry: MigrationJournalEntry;
}

class V2Database extends Dexie {
	documents!: Table<DocumentRecord, string>;
	operations!: Table<OperationRecord, string>;
	migrationJournal!: Table<MigrationJournalRecord, string>;

	constructor() {
		super(DB_NAME);
		// Version 1 shipped without the migration journal table; version 2 adds it. Dexie
		// preserves the existing documents/operations stores across the upgrade.
		this.version(1).stores({
			documents: '&key',
			operations: '&id, sequence',
		});
		this.version(DB_VERSION).stores({
			documents: '&key',
			operations: '&id, sequence',
			migrationJournal: '&key',
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

async function readMigrationJournal(): Promise<MigrationJournalEntry | null> {
	const record = await db().migrationJournal.get(MIGRATION_JOURNAL_KEY);
	return record?.entry ?? null;
}

export async function writeMigrationJournal(entry: MigrationJournalEntry): Promise<void> {
	await db().migrationJournal.put({ key: MIGRATION_JOURNAL_KEY, entry });
}

async function clearMigrationJournal(): Promise<void> {
	await db().migrationJournal.delete(MIGRATION_JOURNAL_KEY);
}

/**
 * Apply the write-ahead recovery decision the Processing Core computed for the last
 * migration journal (PLAT-008 AC2). A `roll-back` restores every document captured in
 * the safety snapshot, so a migration that died mid-write leaves a consistent state on
 * the next start; other phases clear the journal. The decision itself is pure core
 * logic; this function only performs the storage writes it asks for.
 */
export async function recoverPendingMigration(): Promise<RecoveryDecision> {
	const entry = await readMigrationJournal();
	const decision = recoverFromJournal(entry);
	if (decision.action === 'roll-back' && decision.snapshot) {
		const writes = DURABLE_STATE_DOCUMENT_IDS.map((documentId) =>
			db().documents.put({
				key: DOCUMENT_KEY_BY_ID[documentId],
				doc: decision.snapshot?.documents[documentId],
			}),
		);
		await Promise.all(writes);
		await clearMigrationJournal();
	} else if (decision.action === 'clear-journal') {
		await clearMigrationJournal();
	}
	return decision;
}

export async function loadCoreState(): Promise<CoreStateSlice> {
	const database = db();
	// Recover any migration that died mid-write before trusting persisted documents
	// (PLAT-008 AC2). On a clean start this is a no-op.
	await recoverPendingMigration();
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

// PLAT-007: the storage adapter is a platform-service boundary (Contract 1). Every durable
// write is validated against a named-method runtime schema with a payload size limit before
// any business logic runs. Wiring the registry once keeps the allowlist authoritative.
const platformRegistry: PlatformServiceRegistry = createStoragePlatformServiceRegistry();

/** Structured error thrown when a platform-service request is rejected at the boundary. */
export class PlatformBoundaryRejectionError extends Error {
	readonly code: string;
	readonly method: string;
	constructor(code: string, method: string, message: string) {
		super(message);
		this.name = 'PlatformBoundaryRejectionError';
		this.code = code;
		this.method = method;
	}
}

export async function persistFullState(
	previous: CoreStateSlice,
	next: CoreStateSlice,
): Promise<void> {
	// Validate the request crossing the boundary first: unknown method, oversized, or
	// malformed payloads fail closed before we touch IndexedDB (PLAT-007 AC1/AC2).
	const validated = validatePlatformRequest(platformRegistry, 'storage.persistFullState', {
		previous,
		next,
	});
	if (!validated.ok) {
		throw new PlatformBoundaryRejectionError(
			validated.error.code,
			validated.error.method,
			validated.error.message,
		);
	}
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
	await Promise.all([
		database.documents.clear(),
		database.operations.clear(),
		database.migrationJournal.clear(),
	]);
}

/**
 * The single durable-storage port the GUI/runtime is allowed to depend on (PLAT-006).
 * GUI components dispatch core commands and the runtime calls these named methods; nothing
 * outside this adapter touches Dexie/IndexedDB. The shape conforms to the type-only
 * `StoragePort` contract (PLAT-011) so the dependency carries no runtime weight.
 */
export const storagePort: StoragePort = {
	loadCoreState,
	persistFullState,
	recoverPendingMigration,
	resetCoreStorage,
};

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
	// Test-only: write a raw persisted document, bypassing the command-operation guard, to
	// simulate a corrupting mid-write before recovery runs.
	putRawDocument: async (key: string, doc: unknown): Promise<void> => {
		await db().documents.put({ key, doc });
	},
	DB_NAME,
	SCENE_STATE_KEY,
	MAP_STATE_KEY,
	PERMISSION_STATE_KEY,
	SESSION_STATE_KEY,
	WIDGET_PACKAGE_STATE_KEY,
	COMMAND_CENTER_STATE_KEY,
	MIGRATION_JOURNAL_KEY,
	DOCUMENT_KEY_BY_ID,
};
