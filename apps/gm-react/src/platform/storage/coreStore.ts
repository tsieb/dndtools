import Dexie, { type Table } from 'dexie';
import {
	DURABLE_STATE_DOCUMENT_IDS,
	EMPTY_CHARACTER_STATE,
	EMPTY_COMMAND_CENTER_STATE,
	EMPTY_MAP_STATE,
	EMPTY_PERMISSION_STATE,
	EMPTY_SCENE_STATE,
	EMPTY_SESSION_STATE,
	EMPTY_WIDGET_PACKAGE_STATE,
	createOperationLog,
	createStoragePlatformServiceRegistry,
	ensureAudioState,
	ensureCalendarContinuityState,
	ensureEncounterState,
	ensureMcpPolicyState,
	ensureSessionAudioState,
	ensureSessionCombatState,
	ensureVaultContentState,
	mergeSystemWidgetPackages,
	recoverFromJournal,
	validatePlatformRequest,
	type AudioState,
	type CharacterState,
	type CommandCenterState,
	type CoreStateSlice,
	type DurableStateDocumentId,
	type EncounterState,
	type MapState,
	type McpPolicyState,
	type MigrationJournalEntry,
	type PermissionState,
	type PlatformServiceRegistry,
	type RecoveryDecision,
	type SceneState,
	type SessionState,
	type StoragePort,
	type SyncOperation,
	type VaultContentState,
	type WidgetPackageState,
} from '@dndtools/core';

const DB_NAME = 'dndtools-v2';
const DB_VERSION = 3;
const SCENE_STATE_KEY = 'scene-state';
const MAP_STATE_KEY = 'map-state';
const PERMISSION_STATE_KEY = 'permission-state';
const SESSION_STATE_KEY = 'session-state';
const WIDGET_PACKAGE_STATE_KEY = 'widget-package-state';
const COMMAND_CENTER_STATE_KEY = 'command-center-state';
const CHARACTER_STATE_KEY = 'character-state';
const CONTENT_STATE_KEY = 'content-state';
const ENCOUNTER_STATE_KEY = 'encounter-state';
const AUDIO_STATE_KEY = 'audio-state';
const MCP_POLICY_STATE_KEY = 'mcp-policy-state';
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
	characters: CHARACTER_STATE_KEY,
	content: CONTENT_STATE_KEY,
	encounters: ENCOUNTER_STATE_KEY,
	audio: AUDIO_STATE_KEY,
	mcp: MCP_POLICY_STATE_KEY,
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

/**
 * One content-addressed binary blob (ADR-014 amendment). The id IS the content hash of the
 * bytes (`assetId(hashAssetBytes(bytes))` in core), so the blob key always agrees with the
 * asset METADATA the core already stores in `maps.assets` / `audio.assets` — identical bytes
 * dedupe to one record. Bytes never enter `CoreStateSlice` or the operation log.
 */
export interface AssetBlobRecord {
	id: string;
	bytes: ArrayBuffer;
	mime: string;
	byteLength: number;
	createdAt: string;
}

class V2Database extends Dexie {
	documents!: Table<DocumentRecord, string>;
	operations!: Table<OperationRecord, string>;
	migrationJournal!: Table<MigrationJournalRecord, string>;
	assetBlobs!: Table<AssetBlobRecord, string>;

	constructor() {
		super(DB_NAME);
		// Version 1 shipped without the migration journal table; version 2 adds it. Dexie
		// preserves the existing documents/operations stores across the upgrade.
		this.version(1).stores({
			documents: '&key',
			operations: '&id, sequence',
		});
		this.version(2).stores({
			documents: '&key',
			operations: '&id, sequence',
			migrationJournal: '&key',
		});
		// Version 3 adds the asset-byte store. ADDITIVE ONLY — no upgrade function touches the
		// existing stores, so the defensive fail-closed hydration in loadCoreState remains the
		// sole migration path for documents (PLAT-008 stays intact).
		this.version(DB_VERSION).stores({
			documents: '&key',
			operations: '&id, sequence',
			migrationJournal: '&key',
			assetBlobs: '&id',
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
	const [
		mapDoc,
		sessionDoc,
		widgetPackageDoc,
		commandCenterDoc,
		characterDoc,
		contentDoc,
		encounterDoc,
		audioDoc,
		mcpDoc,
	] = await Promise.all([
		database.documents.get(MAP_STATE_KEY),
		database.documents.get(SESSION_STATE_KEY),
		database.documents.get(WIDGET_PACKAGE_STATE_KEY),
		database.documents.get(COMMAND_CENTER_STATE_KEY),
		database.documents.get(CHARACTER_STATE_KEY),
		database.documents.get(CONTENT_STATE_KEY),
		database.documents.get(ENCOUNTER_STATE_KEY),
		database.documents.get(AUDIO_STATE_KEY),
		database.documents.get(MCP_POLICY_STATE_KEY),
	]);
	const scenes = (sceneDoc?.doc as SceneState | undefined) ?? {
		scenes: {},
		schemaVersion: EMPTY_SCENE_STATE.schemaVersion,
	};
	// No persisted map document defaults EMPTY, not demo: SceneRuntime.ensureDefaultActor owns
	// demo-map population, and it must be able to honor onboarding's "start fresh" vault choice —
	// substituting the demo state here would make that guard unreachable on the post-wipe reload.
	const maps = (mapDoc?.doc as MapState | undefined) ?? {
		maps: { ...EMPTY_MAP_STATE.maps },
		assets: { ...EMPTY_MAP_STATE.assets },
		schemaVersion: EMPTY_MAP_STATE.schemaVersion,
	};
	maps.maps ??= { ...EMPTY_MAP_STATE.maps };
	// MAP-002: a map document persisted before the content-addressed asset store existed has no
	// `assets` map; default it so older vaults stay readable without a destructive migration.
	maps.assets ??= { ...EMPTY_MAP_STATE.assets };
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
		combat: ensureSessionCombatState(EMPTY_SESSION_STATE.combat),
		diceHistory: [...EMPTY_SESSION_STATE.diceHistory],
		timers: {},
		playerViewAssignments: {},
		activeMapProjections: {},
		handouts: {},
		quickReferencePanels: {},
		audioPlayback: ensureSessionAudioState(EMPTY_SESSION_STATE.audioPlayback),
		playerGroups: {},
		calendarContinuity: { ...EMPTY_SESSION_STATE.calendarContinuity },
		recapArchiveId: null,
		archives: {},
		schemaVersion: EMPTY_SESSION_STATE.schemaVersion,
	};
	session.workflow ??= EMPTY_SESSION_STATE.workflow;
	session.workflowRevision ??= EMPTY_SESSION_STATE.workflowRevision;
	session.activeSceneId ??= EMPTY_SESSION_STATE.activeSceneId;
	session.activeMap ??= EMPTY_SESSION_STATE.activeMap;
	// SES-002: hydrate the combat-tracker slice fail-closed; a vault persisted before this slice (or
	// with the old minimal combat placeholder) hydrates to a safe empty tracker.
	session.combat = ensureSessionCombatState(session.combat);
	session.diceHistory ??= [];
	session.timers ??= {};
	session.playerViewAssignments ??= {};
	session.activeMapProjections ??= {};
	// SES-004 / SES-007 — a session document persisted before these slices restores with no handouts and
	// no pinned panels (fail closed, never undefined).
	session.handouts ??= {};
	session.quickReferencePanels ??= {};
	// AUDIO-002 / AUDIO-003 — hydrate the session-owned audio playback slice fail-closed: a session document
	// persisted before this slice restores to the stopped/silent state with no deliveries (an older vault
	// never re-starts audio from a corrupt record).
	session.audioPlayback = ensureSessionAudioState(session.audioPlayback);
	// COLLAB-012 — a session document persisted before Player Groups restores with no groups (fail closed).
	session.playerGroups ??= {};
	// SES-012 — a session document persisted before campaign calendar continuity restores with no current
	// date and no links (fail closed, never undefined).
	session.calendarContinuity = ensureCalendarContinuityState(session.calendarContinuity);
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
	// CHAR-001/002: the durable character slice. A vault persisted before this slice existed has no
	// character document; default it so older prototype vaults stay readable without a destructive
	// migration (safe-default hydration).
	const characters = (characterDoc?.doc as CharacterState | undefined) ?? {
		characters: {},
		drafts: {},
		schemaVersion: EMPTY_CHARACTER_STATE.schemaVersion,
	};
	characters.characters ??= {};
	characters.drafts ??= {};
	// CONTENT-011 / SRCH-004: the durable content slice (calendar registry + calendar-aware items +
	// saved searches). A vault persisted before this slice existed has no content document; route it
	// through `ensureVaultContentState` so older prototype vaults stay readable without a destructive
	// migration (safe-default, fail-closed hydration — saved searches default to an empty map and any
	// persisted saved search re-normalizes its filter and defaults its visibility to `dm-only`).
	const content = ensureVaultContentState(contentDoc?.doc as VaultContentState | undefined);
	// SES-006: the durable encounter slice. A vault persisted before this slice has no encounter
	// document; default it so older prototype vaults stay readable (safe-default hydration).
	const encounters = ensureEncounterState(encounterDoc?.doc as EncounterState | undefined);
	// AUDIO-004/009/010: the durable audio slice (asset library + declared source registry). A vault
	// persisted before this slice has no audio document; route it through `ensureAudioState` so older
	// vaults stay readable without a destructive migration (safe-default, fail-closed hydration — an
	// undeclared asset license stays `unknown` and a source with undeclared cache behavior stays
	// playback-disabled).
	const audio = ensureAudioState(audioDoc?.doc as AudioState | undefined);
	// MCP-003/009/011: the durable MCP identity/policy/staged-writes slice. A vault persisted before this
	// slice has no MCP document; route it through `ensureMcpPolicyState` so older vaults stay readable
	// without a destructive migration (safe-default, fail-closed hydration — an unknown policy mode or
	// proposal status collapses to the most restrictive, and the vault default stays `strict_review`).
	const mcp = ensureMcpPolicyState(mcpDoc?.doc as McpPolicyState | undefined);
	const sync = createOperationLog(operationRecords.map((r) => r.op));
	return {
		scenes,
		maps,
		permissions,
		session,
		widgets,
		commandCenter,
		characters,
		content,
		encounters,
		audio,
		mcp,
		sync,
	};
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

async function persistCharacterState(characters: CharacterState): Promise<void> {
	await db().documents.put({ key: CHARACTER_STATE_KEY, doc: characters });
}

async function persistContentState(content: VaultContentState): Promise<void> {
	await db().documents.put({ key: CONTENT_STATE_KEY, doc: content });
}

async function persistEncounterState(encounters: EncounterState): Promise<void> {
	await db().documents.put({ key: ENCOUNTER_STATE_KEY, doc: encounters });
}

async function persistAudioState(audio: AudioState): Promise<void> {
	await db().documents.put({ key: AUDIO_STATE_KEY, doc: audio });
}

async function persistMcpPolicyState(mcp: McpPolicyState): Promise<void> {
	await db().documents.put({ key: MCP_POLICY_STATE_KEY, doc: mcp });
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
		sliceChanged(previous.commandCenter, next.commandCenter) ||
		sliceChanged(previous.characters, next.characters) ||
		sliceChanged(previous.content, next.content) ||
		sliceChanged(previous.encounters, next.encounters) ||
		sliceChanged(previous.audio, next.audio) ||
		sliceChanged(previous.mcp, next.mcp);
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
		persistCharacterState(next.characters),
		persistContentState(next.content),
		persistEncounterState(next.encounters),
		persistAudioState(next.audio),
		persistMcpPolicyState(next.mcp),
		appendOperations(newOperations),
	]);
}

/**
 * Overwrite ALL durable storage with a restored full slice (cloud restore / fresh-device bootstrap).
 * Clears every table first, then writes each slice document + the whole op log, so sequences restart at 0.
 * This deliberately bypasses the persistFullState op-growth guard: a restore is an authoritative BULK
 * load of a decrypted cloud snapshot, not an incremental Processing-Core command dispatch. Callers
 * reload the runtime from storage afterwards (SceneRuntime.load).
 *
 * Asset BYTES are deliberately preserved: a cloud snapshot carries only asset metadata, so wiping
 * local blobs here would orphan bytes the restored metadata still references. Callers that need a
 * true wipe use resetCoreStorage; unreferenced blobs are reclaimed by assetStore.collectGarbage.
 */
export async function restoreCoreState(slice: CoreStateSlice): Promise<void> {
	await clearStateTables();
	await Promise.all([
		persistSceneState(slice.scenes),
		persistMapState(slice.maps),
		persistPermissionState(slice.permissions),
		persistSessionState(slice.session),
		persistWidgetPackageState(slice.widgets),
		persistCommandCenterState(slice.commandCenter),
		persistCharacterState(slice.characters),
		persistContentState(slice.content),
		persistEncounterState(slice.encounters),
		persistAudioState(slice.audio),
		persistMcpPolicyState(slice.mcp),
		appendOperations(slice.sync.operations),
	]);
}

async function clearStateTables(): Promise<void> {
	const database = db();
	await Promise.all([
		database.documents.clear(),
		database.operations.clear(),
		database.migrationJournal.clear(),
	]);
}

/** Full wipe (onboarding "start fresh"): durable state AND asset bytes. */
export async function resetCoreStorage(): Promise<void> {
	await clearStateTables();
	await db().assetBlobs.clear();
}

/**
 * Internal seam for the asset-byte store (assetStore.ts) — the ONLY other module allowed to
 * touch Dexie, and only this table. GUI code goes through assetStore's validated API.
 */
export function assetBlobsTable(): Table<AssetBlobRecord, string> {
	return db().assetBlobs;
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
	CHARACTER_STATE_KEY,
	MIGRATION_JOURNAL_KEY,
	DOCUMENT_KEY_BY_ID,
};
