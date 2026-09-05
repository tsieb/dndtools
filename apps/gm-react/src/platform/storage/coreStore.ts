import Dexie, { type Table } from 'dexie';
import {
	DURABLE_STATE_DOCUMENT_IDS,
	MAX_ASSET_BLOB_BYTES,
	assetId,
	EMPTY_CHARACTER_STATE,
	EMPTY_COMMAND_CENTER_STATE,
	EMPTY_MAP_STATE,
	EMPTY_PERMISSION_STATE,
	EMPTY_SCENE_STATE,
	EMPTY_SESSION_STATE,
	EMPTY_WIDGET_PACKAGE_STATE,
	TARGET_SCHEMA_VERSIONS,
	createOperationLog,
	createStoragePlatformServiceRegistry,
	ensureAudioState,
	ensureCalendarContinuityState,
	ensureSceneCardState,
	ensureEncounterState,
	ensureMcpPolicyState,
	ensureSessionAudioState,
	ensureSessionCombatState,
	ensureVaultContentState,
	hashAssetBytes,
	hydrateSystemsState,
	mergeSystemWidgetPackages,
	recoverFromJournal,
	validateSyncOperationShape,
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
	type SystemsState,
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
const SYSTEMS_STATE_KEY = 'systems-state';
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
	systems: SYSTEMS_STATE_KEY,
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
	if (!record) return null;
	const untrusted: unknown = record.entry;
	if (
		!plainRecord(untrusted) ||
		untrusted.schemaVersion !== 1 ||
		typeof untrusted.migrationId !== 'string' ||
		untrusted.migrationId.length === 0 ||
		typeof untrusted.phase !== 'string' ||
		!plainRecord(untrusted.targetVersions) ||
		!plainRecord(untrusted.snapshot)
	) {
		throw new Error(
			'Stored migration recovery data is damaged. No recovery changes were applied; restore a known-good local backup.',
		);
	}
	const snapshot = untrusted.snapshot;
	if (
		typeof snapshot.id !== 'string' ||
		snapshot.id.length === 0 ||
		snapshot.migrationId !== untrusted.migrationId ||
		!plainRecord(snapshot.fromVersions) ||
		!plainRecord(snapshot.documents)
	) {
		throw new Error(
			'Stored migration recovery data is damaged. No recovery changes were applied; restore a known-good local backup.',
		);
	}
	for (const documentId of DURABLE_STATE_DOCUMENT_IDS) {
		const targetVersion = untrusted.targetVersions[documentId];
		const previousVersion = snapshot.fromVersions[documentId];
		if (
			!Number.isSafeInteger(targetVersion) ||
			Number(targetVersion) < 1 ||
			(previousVersion !== null &&
				(!Number.isSafeInteger(previousVersion) || Number(previousVersion) < 1))
		) {
			throw new Error(
				'Stored migration recovery data is damaged. No recovery changes were applied; restore a known-good local backup.',
			);
		}
	}
	return untrusted as unknown as MigrationJournalEntry;
}

export async function writeMigrationJournal(entry: MigrationJournalEntry): Promise<void> {
	await db().migrationJournal.put({ key: MIGRATION_JOURNAL_KEY, entry });
}

async function clearMigrationJournal(): Promise<void> {
	await db().migrationJournal.delete(MIGRATION_JOURNAL_KEY);
}

/** Minimum containers that every released document of this kind has always required. */
const REQUIRED_PERSISTED_RECORD_FIELDS: Partial<Record<DurableStateDocumentId, readonly string[]>> =
	{
		scenes: ['scenes'],
		maps: ['maps'],
		permissions: ['actors'],
		widgets: ['packages'],
		commandCenter: ['presets'],
	};

/** Containers added compatibly over time: absence is safe, but a present wrong type is corruption. */
const OPTIONAL_PERSISTED_RECORD_FIELDS: Partial<Record<DurableStateDocumentId, readonly string[]>> =
	{
		maps: ['assets'],
		session: [
			'timers',
			'playerViewAssignments',
			'activeMapProjections',
			'handouts',
			'quickReferencePanels',
			'playerGroups',
			'archives',
		],
		characters: ['characters', 'drafts'],
		content: ['calendars', 'items', 'savedSearches', 'customObjectTypes'],
		encounters: ['encounters'],
		audio: ['assets', 'sources', 'automationRules', 'associations', 'presets'],
		mcp: ['bindings', 'policies', 'proposals'],
	};

const OPTIONAL_PERSISTED_OBJECT_FIELDS: Partial<Record<DurableStateDocumentId, readonly string[]>> =
	{
		session: ['activeMap', 'combat', 'audioPlayback', 'calendarContinuity', 'sceneCards'],
		commandCenter: ['autoSave'],
		characters: ['party', 'journals'],
	};

const REQUIRED_PERSISTED_ARRAY_FIELDS: Partial<Record<DurableStateDocumentId, readonly string[]>> =
	{ permissions: ['grants'] };

const OPTIONAL_PERSISTED_ARRAY_FIELDS: Partial<Record<DurableStateDocumentId, readonly string[]>> =
	{ session: ['diceHistory'], mcp: ['auditEntries'] };

function damagedPersistedDocument(documentId: DurableStateDocumentId): Error {
	return new Error(`Stored ${documentId} state is damaged and was not loaded.`);
}

function validatePersistedDocumentContainers(
	document: Record<string, unknown>,
	documentId: DurableStateDocumentId,
): void {
	const validateRecordMap = (field: string, required: boolean): void => {
		const value = document[field];
		if (value === undefined && !required) return;
		if (!plainRecord(value) || Object.values(value).some((entry) => !plainRecord(entry))) {
			throw damagedPersistedDocument(documentId);
		}
	};
	for (const field of REQUIRED_PERSISTED_RECORD_FIELDS[documentId] ?? []) {
		validateRecordMap(field, true);
	}
	for (const field of OPTIONAL_PERSISTED_RECORD_FIELDS[documentId] ?? []) {
		validateRecordMap(field, false);
	}
	for (const field of OPTIONAL_PERSISTED_OBJECT_FIELDS[documentId] ?? []) {
		const value = document[field];
		if (value !== undefined && value !== null && !plainRecord(value)) {
			throw damagedPersistedDocument(documentId);
		}
	}
	for (const field of REQUIRED_PERSISTED_ARRAY_FIELDS[documentId] ?? []) {
		if (!Array.isArray(document[field])) throw damagedPersistedDocument(documentId);
	}
	for (const field of OPTIONAL_PERSISTED_ARRAY_FIELDS[documentId] ?? []) {
		const value = document[field];
		if (value !== undefined && !Array.isArray(value)) throw damagedPersistedDocument(documentId);
	}

	if (documentId === 'scenes') {
		for (const [id, scene] of Object.entries(document.scenes as Record<string, unknown>)) {
			if ((scene as Record<string, unknown>).id !== id) throw damagedPersistedDocument(documentId);
		}
	}
	if (documentId === 'permissions') {
		for (const [id, actor] of Object.entries(document.actors as Record<string, unknown>)) {
			const candidate = actor as Record<string, unknown>;
			if (
				candidate.id !== id ||
				typeof candidate.displayName !== 'string' ||
				!['dm', 'co-dm', 'player', 'observer'].includes(String(candidate.role))
			) {
				throw damagedPersistedDocument(documentId);
			}
		}
		if ((document.grants as unknown[]).some((grant) => !plainRecord(grant))) {
			throw damagedPersistedDocument(documentId);
		}
	}
	if (documentId === 'session') {
		if (
			(document.workflow !== undefined &&
				!['idle', 'prep', 'active', 'paused', 'ending', 'recap', 'archived'].includes(
					String(document.workflow),
				)) ||
			(document.workflowRevision !== undefined &&
				(!Number.isSafeInteger(document.workflowRevision) ||
					Number(document.workflowRevision) < 0)) ||
			(document.activeSceneId !== undefined &&
				document.activeSceneId !== null &&
				typeof document.activeSceneId !== 'string') ||
			(document.recapArchiveId !== undefined &&
				document.recapArchiveId !== null &&
				typeof document.recapArchiveId !== 'string')
		) {
			throw damagedPersistedDocument(documentId);
		}
	}
}

function trustedPersistedDocument<T>(
	record: DocumentRecord | undefined,
	documentId: DurableStateDocumentId,
): T | undefined {
	if (!record) return undefined;
	const document = record.doc;
	if (!plainRecord(document) || !Number.isSafeInteger(document.schemaVersion)) {
		throw new Error(`Stored ${documentId} state is damaged and was not loaded.`);
	}
	const version = Number(document.schemaVersion);
	const target = TARGET_SCHEMA_VERSIONS[documentId];
	if (version > target) {
		throw new Error(
			`Stored ${documentId} state was written by a newer app version (schema ${version}; this build supports ${target}). Upgrade the app before opening this vault.`,
		);
	}
	if (version < 1) {
		throw new Error(`Stored ${documentId} state has an invalid schema version and was not loaded.`);
	}
	validatePersistedDocumentContainers(document, documentId);
	return document as T;
}

function trustedPersistedOperations(records: readonly OperationRecord[]): SyncOperation[] {
	const ids = new Set<string>();
	return records.map((record, sequence) => {
		const untrustedRecord: unknown = record;
		if (!plainRecord(untrustedRecord) || !plainRecord(untrustedRecord.op)) {
			throw new Error(
				`Stored operation history is damaged at sequence ${sequence}; the vault was not partially loaded.`,
			);
		}
		const operation = untrustedRecord.op;
		const operationId = operation.id;
		const issuedAt = operation.issuedAt;
		const validation = validateSyncOperationShape(operation);
		if (
			untrustedRecord.sequence !== sequence ||
			untrustedRecord.id !== operationId ||
			!validation.conformant ||
			typeof operationId !== 'string' ||
			typeof issuedAt !== 'string' ||
			issuedAt.length > 40 ||
			!Number.isFinite(Date.parse(issuedAt)) ||
			ids.has(operationId)
		) {
			throw new Error(
				`Stored operation history is damaged at sequence ${sequence}; the vault was not partially loaded.`,
			);
		}
		ids.add(operationId);
		return operation as unknown as SyncOperation;
	});
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
		const database = db();
		const restored: DocumentRecord[] = [];
		const absent: string[] = [];
		for (const documentId of DURABLE_STATE_DOCUMENT_IDS) {
			const previousVersion = decision.snapshot.fromVersions[documentId];
			if (previousVersion === null) {
				// Preserve exact absence. Writing `{ doc: undefined }` would turn an absent legacy slice
				// into a damaged record under fail-closed hydration.
				absent.push(DOCUMENT_KEY_BY_ID[documentId]);
				continue;
			}
			if (!Number.isSafeInteger(previousVersion) || Number(previousVersion) < 1) {
				throw new Error(
					`Migration snapshot for ${documentId} has an invalid prior schema version.`,
				);
			}
			const snapshotDocument = decision.snapshot.documents[documentId];
			const trusted = trustedPersistedDocument<unknown>(
				{ key: DOCUMENT_KEY_BY_ID[documentId], doc: snapshotDocument },
				documentId,
			);
			if ((snapshotDocument as { schemaVersion?: unknown }).schemaVersion !== previousVersion) {
				throw new Error(
					`Migration snapshot for ${documentId} does not match its declared prior schema version.`,
				);
			}
			restored.push({
				key: DOCUMENT_KEY_BY_ID[documentId],
				doc: trusted,
			});
		}
		// Recovery itself must be crash-safe. Restoring documents and clearing the journal in one
		// transaction prevents a quota/clone failure from leaving another partial rollback behind.
		await database.transaction('rw', database.documents, database.migrationJournal, async () => {
			await Promise.all([
				database.documents.bulkDelete(absent),
				database.documents.bulkPut(restored),
			]);
			await database.migrationJournal.delete(MIGRATION_JOURNAL_KEY);
		});
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
		systemsDoc,
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
		database.documents.get(SYSTEMS_STATE_KEY),
	]);
	const scenes = trustedPersistedDocument<SceneState>(sceneDoc, 'scenes') ?? {
		scenes: {},
		schemaVersion: EMPTY_SCENE_STATE.schemaVersion,
	};
	// No persisted map document defaults EMPTY, not demo: SceneRuntime.ensureDefaultActor owns
	// demo-map population, and it must be able to honor onboarding's "start fresh" vault choice —
	// substituting the demo state here would make that guard unreachable on the post-wipe reload.
	const maps = trustedPersistedDocument<MapState>(mapDoc, 'maps') ?? {
		maps: { ...EMPTY_MAP_STATE.maps },
		assets: { ...EMPTY_MAP_STATE.assets },
		schemaVersion: EMPTY_MAP_STATE.schemaVersion,
	};
	maps.maps ??= { ...EMPTY_MAP_STATE.maps };
	// MAP-002: a map document persisted before the content-addressed asset store existed has no
	// `assets` map; default it so older vaults stay readable without a destructive migration.
	maps.assets ??= { ...EMPTY_MAP_STATE.assets };
	const permissions = trustedPersistedDocument<PermissionState>(permissionDoc, 'permissions') ?? {
		actors: {},
		grants: [],
		schemaVersion: EMPTY_PERMISSION_STATE.schemaVersion,
	};
	const session = trustedPersistedDocument<SessionState>(sessionDoc, 'session') ?? {
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
		sceneCards: { ...EMPTY_SESSION_STATE.sceneCards },
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
	// I11 S11.2 — a session document persisted before scene cards restores with no cards/queue/history
	// (fail closed): the tolerant hydrator drops dangling refs and collapses corrupt enums.
	session.sceneCards = ensureSceneCardState(session.sceneCards);
	session.recapArchiveId ??= null;
	session.archives ??= {};
	const widgets = mergeSystemWidgetPackages(
		trustedPersistedDocument<WidgetPackageState>(widgetPackageDoc, 'widgets') ?? {
			packages: {},
			schemaVersion: EMPTY_WIDGET_PACKAGE_STATE.schemaVersion,
		},
	);
	const commandCenter = trustedPersistedDocument<CommandCenterState>(
		commandCenterDoc,
		'commandCenter',
	) ?? {
		homeSceneId: EMPTY_COMMAND_CENTER_STATE.homeSceneId,
		presets: {},
		schemaVersion: EMPTY_COMMAND_CENTER_STATE.schemaVersion,
	};
	// CHAR-001/002: the durable character slice. A vault persisted before this slice existed has no
	// character document; default it so older prototype vaults stay readable without a destructive
	// migration (safe-default hydration).
	const characters = trustedPersistedDocument<CharacterState>(characterDoc, 'characters') ?? {
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
	const content = ensureVaultContentState(
		trustedPersistedDocument<VaultContentState>(contentDoc, 'content'),
	);
	// SES-006: the durable encounter slice. A vault persisted before this slice has no encounter
	// document; default it so older prototype vaults stay readable (safe-default hydration).
	const encounters = ensureEncounterState(
		trustedPersistedDocument<EncounterState>(encounterDoc, 'encounters'),
	);
	// AUDIO-004/009/010: the durable audio slice (asset library + declared source registry). A vault
	// persisted before this slice has no audio document; route it through `ensureAudioState` so older
	// vaults stay readable without a destructive migration (safe-default, fail-closed hydration — an
	// undeclared asset license stays `unknown` and a source with undeclared cache behavior stays
	// playback-disabled).
	const audio = ensureAudioState(trustedPersistedDocument<AudioState>(audioDoc, 'audio'));
	// MCP-003/009/011: the durable MCP identity/policy/staged-writes slice. A vault persisted before this
	// slice has no MCP document; route it through `ensureMcpPolicyState` so older vaults stay readable
	// without a destructive migration (safe-default, fail-closed hydration — an unknown policy mode or
	// proposal status collapses to the most restrictive, and the vault default stays `strict_review`).
	const mcp = ensureMcpPolicyState(trustedPersistedDocument<McpPolicyState>(mcpDoc, 'mcp'));
	// RC-SYS-1.1: the durable SYSTEM PACKAGE slice. A vault persisted before this slice has no
	// `systems` document; `hydrateSystemsState` defaults it to the built-in 5e package and carries the
	// legacy `widgets.activeSystemPackageId` across, so a DM's earlier system choice survives.
	const systems = hydrateSystemsState(
		trustedPersistedDocument<SystemsState>(systemsDoc, 'systems'),
		widgetPackageDoc?.doc as { activeSystemPackageId?: string | null } | undefined,
	);
	const sync = createOperationLog(trustedPersistedOperations(operationRecords));
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
		systems,
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

async function persistSystemsState(systems: SystemsState): Promise<void> {
	await db().documents.put({ key: SYSTEMS_STATE_KEY, doc: systems });
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
		sliceChanged(previous.mcp, next.mcp) ||
		sliceChanged(previous.systems, next.systems);
	if (durableStateChanged && newOperations.length === 0) {
		throw new Error('Durable state changed without an accepted Processing Core operation.');
	}
	const database = db();
	// State documents and the operation tail are one logical command commit. Dexie rolls the whole
	// transaction back if quota, cloning, or any individual store write fails, so reload can never see
	// a new slice without its audit operation (or vice versa).
	await database.transaction('rw', database.documents, database.operations, async () => {
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
			persistSystemsState(next.systems),
			appendOperations(newOperations),
		]);
	});
}

const RESTORE_STATE_KEYS = [
	'audio',
	'characters',
	'commandCenter',
	'content',
	'encounters',
	'maps',
	'mcp',
	'permissions',
	'scenes',
	'session',
	'sync',
	'widgets',
] as const;
/** Server accepts operation revisions 0..250000, i.e. at most 250001 operations. */
const MAX_RESTORED_OPERATIONS = 250_001;
const MAX_RESTORED_JSON_BYTES = 16 * 1024 * 1024;

const RESTORE_DOCUMENT_IDS: Record<
	Exclude<(typeof RESTORE_STATE_KEYS)[number], 'sync'>,
	DurableStateDocumentId
> = {
	audio: 'audio',
	characters: 'characters',
	commandCenter: 'commandCenter',
	content: 'content',
	encounters: 'encounters',
	maps: 'maps',
	mcp: 'mcp',
	permissions: 'permissions',
	scenes: 'scenes',
	session: 'session',
	widgets: 'widgets',
};

const REQUIRED_OBJECT_FIELDS: Partial<Record<DurableStateDocumentId, readonly string[]>> = {
	scenes: ['scenes'],
	maps: ['maps', 'assets'],
	permissions: ['actors'],
	widgets: ['packages'],
	commandCenter: ['presets'],
	characters: ['characters', 'drafts'],
	content: ['calendars', 'items', 'savedSearches', 'customObjectTypes'],
	encounters: ['encounters'],
	audio: ['assets', 'sources', 'automationRules', 'associations', 'presets'],
	mcp: ['bindings', 'policies', 'proposals'],
	systems: ['packages'],
};

/**
 * RC-SYS-1.1 — durable slices a backup MAY omit. A file written by a build from before the slice
 * existed cannot carry `systems`, and refusing that backup would strand a released vault; it
 * hydrates to the built-in 5e default exactly as local startup does. Present slices are still
 * validated as strictly as any required one.
 */
const OPTIONAL_RESTORE_STATE_KEYS: readonly string[] = Object.freeze(['systems']);

const REQUIRED_ARRAY_FIELDS: Partial<Record<DurableStateDocumentId, readonly string[]>> = {
	permissions: ['grants'],
	mcp: ['auditEntries'],
};

function plainRecord(value: unknown): value is Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

/**
 * Validate an untrusted decrypted cloud snapshot completely before storage mutation. This is deliberately
 * stricter than tolerant local hydration: a backup claiming the current schema must contain every current
 * durable slice, matching schema versions, sane containers, and a canonical unique operation log.
 */
export function validateRestoredCoreState(candidate: unknown): CoreStateSlice {
	let serialized: string;
	try {
		serialized = JSON.stringify(candidate);
	} catch {
		throw new Error('Cloud backup is not valid JSON state; the local campaign was not changed.');
	}
	if (!serialized || new TextEncoder().encode(serialized).byteLength > MAX_RESTORED_JSON_BYTES) {
		throw new Error(
			'Cloud backup exceeds the safe restore size; the local campaign was not changed.',
		);
	}
	if (
		!plainRecord(candidate) ||
		JSON.stringify(
			Object.keys(candidate)
				.filter((key) => !OPTIONAL_RESTORE_STATE_KEYS.includes(key))
				.sort(),
		) !== JSON.stringify(RESTORE_STATE_KEYS)
	) {
		throw new Error(
			'Cloud backup has an unexpected state shape; the local campaign was not changed.',
		);
	}
	// The optional `systems` slice, when the backup carries one, is held to the same bar.
	if (candidate.systems !== undefined) {
		const systemsDocument = candidate.systems;
		if (
			!plainRecord(systemsDocument) ||
			systemsDocument.schemaVersion !== TARGET_SCHEMA_VERSIONS.systems ||
			!plainRecord(systemsDocument.packages)
		) {
			throw new Error(
				'Cloud backup systems schema is unsupported; the local campaign was not changed.',
			);
		}
	}

	for (const [stateKey, documentId] of Object.entries(RESTORE_DOCUMENT_IDS) as Array<
		[Exclude<(typeof RESTORE_STATE_KEYS)[number], 'sync'>, DurableStateDocumentId]
	>) {
		const document = candidate[stateKey];
		if (!plainRecord(document) || document.schemaVersion !== TARGET_SCHEMA_VERSIONS[documentId]) {
			throw new Error(
				`Cloud backup ${stateKey} schema is unsupported; the local campaign was not changed.`,
			);
		}
		for (const field of REQUIRED_OBJECT_FIELDS[documentId] ?? []) {
			if (!plainRecord(document[field])) {
				throw new Error(
					`Cloud backup ${stateKey}.${field} is invalid; the local campaign was not changed.`,
				);
			}
		}
		for (const field of REQUIRED_ARRAY_FIELDS[documentId] ?? []) {
			if (!Array.isArray(document[field])) {
				throw new Error(
					`Cloud backup ${stateKey}.${field} is invalid; the local campaign was not changed.`,
				);
			}
		}
		try {
			// Apply the same released-data compatibility checks used by startup hydration before any
			// restore transaction begins. This keeps an apparently valid backup from replacing the
			// current vault only to fail on the next boot (while still accepting v0.2 documents whose
			// later, optional containers are absent).
			validatePersistedDocumentContainers(document, documentId);
		} catch {
			throw new Error(
				`Cloud backup ${stateKey} data is invalid; the local campaign was not changed.`,
			);
		}
	}
	try {
		const session = candidate.session as unknown as SessionState;
		ensureSessionCombatState(session.combat);
		ensureSessionAudioState(session.audioPlayback);
		ensureCalendarContinuityState(session.calendarContinuity);
		ensureSceneCardState(session.sceneCards);
		mergeSystemWidgetPackages(candidate.widgets as unknown as WidgetPackageState);
		ensureVaultContentState(candidate.content as unknown as VaultContentState);
		ensureEncounterState(candidate.encounters as unknown as EncounterState);
		ensureAudioState(candidate.audio as unknown as AudioState);
		ensureMcpPolicyState(candidate.mcp as unknown as McpPolicyState);
	} catch {
		throw new Error(
			'Cloud backup contains damaged nested state; the local campaign was not changed.',
		);
	}

	const sync = candidate.sync;
	if (
		!plainRecord(sync) ||
		JSON.stringify(Object.keys(sync).sort()) !== JSON.stringify(['operations']) ||
		!Array.isArray(sync.operations) ||
		sync.operations.length > MAX_RESTORED_OPERATIONS
	) {
		throw new Error('Cloud backup operation log is invalid; the local campaign was not changed.');
	}
	const operationIds = new Set<string>();
	for (const operation of sync.operations) {
		const validation = validateSyncOperationShape(operation);
		if (
			!validation.conformant ||
			!plainRecord(operation) ||
			!Number.isFinite(Date.parse(String(operation.issuedAt))) ||
			operationIds.has(String(operation.id))
		) {
			throw new Error(
				'Cloud backup contains an invalid or duplicate operation; the local campaign was not changed.',
			);
		}
		operationIds.add(String(operation.id));
	}

	return {
		scenes: candidate.scenes as unknown as SceneState,
		maps: candidate.maps as unknown as MapState,
		permissions: candidate.permissions as unknown as PermissionState,
		session: candidate.session as unknown as SessionState,
		widgets: candidate.widgets as unknown as WidgetPackageState,
		systems: hydrateSystemsState(candidate.systems as unknown as SystemsState | undefined),
		commandCenter: candidate.commandCenter as unknown as CommandCenterState,
		characters: candidate.characters as unknown as CharacterState,
		content: candidate.content as unknown as VaultContentState,
		encounters: candidate.encounters as unknown as EncounterState,
		audio: candidate.audio as unknown as AudioState,
		mcp: candidate.mcp as unknown as McpPolicyState,
		sync: createOperationLog(sync.operations as SyncOperation[]),
	};
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
export async function restoreCoreState(candidate: unknown): Promise<void> {
	const slice = validateRestoredCoreState(candidate);
	const database = db();
	const { documents, operations } = restoredRecords(slice);
	// One IndexedDB transaction makes the replacement all-or-nothing. If any document or operation
	// write fails, the preceding clears roll back too and the current local vault remains intact.
	await database.transaction(
		'rw',
		database.documents,
		database.operations,
		database.migrationJournal,
		async () => {
			await Promise.all([
				database.documents.clear(),
				database.operations.clear(),
				database.migrationJournal.clear(),
			]);
			await Promise.all([
				database.documents.bulkPut(documents),
				database.operations.bulkPut(operations),
			]);
		},
	);
}

function restoredRecords(slice: CoreStateSlice): {
	documents: DocumentRecord[];
	operations: OperationRecord[];
} {
	const documents: DocumentRecord[] = [
		{ key: SCENE_STATE_KEY, doc: slice.scenes },
		{ key: MAP_STATE_KEY, doc: slice.maps },
		{ key: PERMISSION_STATE_KEY, doc: slice.permissions },
		{ key: SESSION_STATE_KEY, doc: slice.session },
		{ key: WIDGET_PACKAGE_STATE_KEY, doc: slice.widgets },
		{ key: COMMAND_CENTER_STATE_KEY, doc: slice.commandCenter },
		{ key: CHARACTER_STATE_KEY, doc: slice.characters },
		{ key: CONTENT_STATE_KEY, doc: slice.content },
		{ key: ENCOUNTER_STATE_KEY, doc: slice.encounters },
		{ key: AUDIO_STATE_KEY, doc: slice.audio },
		{ key: MCP_POLICY_STATE_KEY, doc: slice.mcp },
	];
	const operations: OperationRecord[] = slice.sync.operations.map((op, sequence) => ({
		id: op.id,
		op,
		sequence,
	}));
	return { documents, operations };
}

/**
 * Authoritative local-backup restore: atomically replaces durable state AND every asset blob. Cloud
 * restore intentionally uses `restoreCoreState` instead because cloud snapshots do not carry bytes.
 */
export async function restoreFullVaultState(
	candidate: unknown,
	assetRecords: readonly AssetBlobRecord[],
): Promise<void> {
	const slice = validateRestoredCoreState(candidate);
	if (!Array.isArray(assetRecords) || assetRecords.length > 10_000) {
		throw new Error(
			'Vault backup asset collection is invalid; the local campaign was not changed.',
		);
	}
	const seen = new Set<string>();
	for (const record of assetRecords) {
		const untrusted: unknown = record;
		if (!plainRecord(untrusted)) {
			throw new Error(
				'Vault backup contains an invalid asset; the local campaign was not changed.',
			);
		}
		const { id, bytes, byteLength: rawByteLength, mime, createdAt } = untrusted;
		const byteLength = Number(rawByteLength);
		if (
			typeof id !== 'string' ||
			seen.has(id) ||
			!(bytes instanceof ArrayBuffer) ||
			!Number.isSafeInteger(byteLength) ||
			byteLength < 1 ||
			byteLength > MAX_ASSET_BLOB_BYTES ||
			byteLength !== bytes.byteLength ||
			assetId(hashAssetBytes(new Uint8Array(bytes))) !== id ||
			typeof mime !== 'string' ||
			mime.length < 1 ||
			mime.length > 255 ||
			typeof createdAt !== 'string' ||
			!Number.isFinite(Date.parse(createdAt))
		) {
			throw new Error(
				'Vault backup contains an invalid asset; the local campaign was not changed.',
			);
		}
		seen.add(id);
	}
	const database = db();
	const { documents, operations } = restoredRecords(slice);
	await database.transaction(
		'rw',
		database.documents,
		database.operations,
		database.migrationJournal,
		database.assetBlobs,
		async () => {
			await Promise.all([
				database.documents.clear(),
				database.operations.clear(),
				database.migrationJournal.clear(),
				database.assetBlobs.clear(),
			]);
			await Promise.all([
				database.documents.bulkPut(documents),
				database.operations.bulkPut(operations),
				database.assetBlobs.bulkPut([...assetRecords]),
			]);
		},
	);
}

/** Full wipe (onboarding "start fresh"): durable state AND asset bytes. */
export async function resetCoreStorage(): Promise<void> {
	const database = db();
	await database.transaction(
		'rw',
		database.documents,
		database.operations,
		database.migrationJournal,
		database.assetBlobs,
		async () => {
			await Promise.all([
				database.documents.clear(),
				database.operations.clear(),
				database.migrationJournal.clear(),
				database.assetBlobs.clear(),
			]);
		},
	);
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
	putRawOperation: async (id: string, sequence: number, op: unknown): Promise<void> => {
		await db().operations.put({ id, sequence, op: op as SyncOperation });
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
