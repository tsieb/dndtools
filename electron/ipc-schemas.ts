/**
 * IPC payload validation schemas for the Electron main process.
 *
 * Every IPC handler in main.ts MUST validate its arguments through these
 * schemas before invoking business logic.  The goal is defence-in-depth:
 * even though the renderer runs in a sandboxed context with contextIsolation,
 * a compromised renderer should not be able to send malformed data that causes
 * unexpected behaviour in the main process or reaches the filesystem.
 *
 * Design principles:
 *  - All schemas are defined in terms of Zod only (no Electron imports) so
 *    they can be unit-tested outside the Electron runtime.
 *  - Invalid payloads cause a thrown Error, which Electron's ipcMain.handle
 *    infrastructure converts to a rejected promise on the renderer side.
 *    The main process itself never crashes.
 *  - Size limits guard against memory-exhaustion via oversized payloads.
 *  - Path-traversal guards prevent IDs and folder paths from escaping the
 *    vault directory on the filesystem layer.
 *  - Settings keys are whitelisted to prevent arbitrary key injection.
 */

import { z } from 'zod';

// ─── Payload size limits ──────────────────────────────────────────────────────

/** Maximum length for entity IDs used as filenames in the vault. */
const MAX_ID_LENGTH = 512;
/** Maximum length for general bounded strings (titles, tag names, etc.). */
const MAX_STRING_LENGTH = 1024;
/** Maximum character length for note/object content bodies (10 MB). */
const MAX_CONTENT_LENGTH = 10 * 1024 * 1024;
/** Maximum length for a single tag string. */
const MAX_TAG_LENGTH = 256;
/** Maximum number of tags on a single note or object. */
const MAX_TAGS = 200;
/** Maximum number of notes in a bulk import request. */
const MAX_IMPORT_NOTES = 10_000;
/** Maximum number of note IDs in a suggest-related-notes request. */
const MAX_SUGGEST_IDS = 200;
/** Maximum value for any integer limit parameter. */
const MAX_LIMIT = 10_000;
/** Maximum number of text chunks per semantic embedding request. */
const MAX_EMBED_TEXTS = 32;
/** Maximum number of tiles on a session board. */
const MAX_TILES = 500;
/** Maximum character length for filesystem paths. */
const MAX_PATH_LENGTH = 2048;

// ─── Path-safety helper ───────────────────────────────────────────────────────

/**
 * Returns true when the string does NOT contain path traversal sequences
 * (`..`) or control characters (including null bytes).
 *
 * Folder paths are allowed to contain `/` separators; only upward traversal
 * is rejected.
 */
function isPathSafe(value: string): boolean {
	// Reject '..' anywhere (covers '../', '..\\', '%2e%2e', etc. at source)
	if (value.includes('..')) return false;
	// Reject null bytes and other ASCII control characters
	// eslint-disable-next-line no-control-regex
	if (/[\x00-\x1F\x7F]/.test(value)) return false;
	return true;
}

// ─── Primitive schemas ────────────────────────────────────────────────────────

/**
 * Non-empty, length-bounded string safe for use as a vault entity ID.
 * Rejects path traversal sequences and control characters.
 */
export const idSchema = z
	.string()
	.min(1)
	.max(MAX_ID_LENGTH)
	.refine(isPathSafe, { message: 'Path traversal sequences are not allowed in IDs' });

/**
 * Vault-relative folder path.  May contain `/` separators but must not
 * contain `..` or control characters.
 */
export const folderPathSchema = z
	.string()
	.min(1)
	.max(MAX_PATH_LENGTH)
	.refine(isPathSafe, { message: 'Path traversal sequences are not allowed in folder paths' });

/** Single tag string — non-empty, length-bounded. */
export const tagSchema = z.string().min(1).max(MAX_TAG_LENGTH);

/** Positive integer limit with a hard ceiling. */
export const limitSchema = z.number().int().min(1).max(MAX_LIMIT);

/** Optional positive integer limit. */
export const optionalLimitSchema = limitSchema.optional();

// ─── Domain schemas ───────────────────────────────────────────────────────────

/** Schema for a Link record sent over IPC. */
export const linkSchema = z.object({
	sourceId: idSchema,
	targetId: idSchema,
	displayText: z.string().max(MAX_STRING_LENGTH),
	position: z.number().int().nonnegative(),
	resolvedBy: z.enum(['id', 'title', 'alias']).optional(),
	resolvedAlias: z.string().max(MAX_STRING_LENGTH).nullable().optional(),
	contextSnippet: z
		.string()
		.max(MAX_STRING_LENGTH * 4)
		.nullable()
		.optional(),
});

/**
 * Full Note shape expected by saveNote / importNotes.
 * Content is bounded to prevent memory exhaustion from oversized payloads.
 */
export const noteSchema = z.object({
	id: idSchema,
	title: z.string().min(1).max(MAX_STRING_LENGTH),
	content: z.string().max(MAX_CONTENT_LENGTH),
	folder: folderPathSchema,
	filePath: z
		.string()
		.max(MAX_PATH_LENGTH)
		.refine(isPathSafe, { message: 'Path traversal sequences are not allowed in file paths' })
		.optional(),
	tags: z.array(tagSchema).max(MAX_TAGS),
	frontmatter: z.record(z.string(), z.unknown()),
	createdAt: z.string().min(1).max(MAX_STRING_LENGTH),
	updatedAt: z.string().min(1).max(MAX_STRING_LENGTH),
	deleted: z.boolean(),
	deletedAt: z.string().max(MAX_STRING_LENGTH).nullable(),
	pinned: z.boolean(),
	pinnedAt: z.string().max(MAX_STRING_LENGTH).nullable(),
});

/** Enum of all recognised VaultObject type values. */
export const vaultObjectTypeSchema = z.enum([
	'stat_block',
	'character',
	'image',
	'map',
	'npc',
	'location',
	'faction',
	'quest',
	'item',
	'handout',
	'encounter',
	'timeline_event',
]);

const objectRelationshipCoreTypeSchema = z.enum([
	'parent',
	'child',
	'ally',
	'enemy',
	'appears_in_session',
]);

const objectRelationshipSchema = z
	.union([
		z
			.object({
				type: objectRelationshipCoreTypeSchema,
				targetId: idSchema.optional(),
				sessionId: idSchema.optional(),
				description: z.string().max(MAX_STRING_LENGTH).optional(),
			})
			.strict(),
		z
			.object({
				type: z.literal('custom'),
				label: z.string().min(1).max(120),
				targetId: idSchema.optional(),
				sessionId: idSchema.optional(),
				description: z.string().max(MAX_STRING_LENGTH).optional(),
			})
			.strict(),
	])
	.superRefine((value, ctx) => {
		if (!value.targetId && !value.sessionId) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'Relationship must include targetId or sessionId.',
				path: ['targetId'],
			});
		}
	});

/**
 * VaultObject shape for saveObject.
 * The `data` field is left as an open record because type-specific data
 * shapes are enforced by TypeScript at call sites; the IPC boundary only
 * needs structural presence validation.
 */
export const vaultObjectSchema = z.object({
	id: idSchema,
	type: vaultObjectTypeSchema,
	name: z.string().min(1).max(MAX_STRING_LENGTH),
	summary: z.string().max(MAX_CONTENT_LENGTH),
	tags: z.array(tagSchema).max(MAX_TAGS),
	relationships: z.array(objectRelationshipSchema).max(1000),
	data: z.record(z.string(), z.unknown()),
	createdAt: z.string().min(1).max(MAX_STRING_LENGTH),
	updatedAt: z.string().min(1).max(MAX_STRING_LENGTH),
});

const sessionBoardTileStyleSchema = z
	.object({
		backgroundColor: z.string().optional(),
		borderColor: z.string().optional(),
		borderWidth: z.number().int().min(0).max(8).optional(),
		borderRadius: z.number().int().min(0).max(36).optional(),
		opacity: z.number().min(0.2).max(1).optional(),
		scale: z.number().min(0.5).max(2.5).optional(),
	})
	.strict();

const sessionBoardTimerStateSchema = z
	.object({
		mode: z.enum(['elapsed', 'countdown']),
		running: z.boolean(),
		accumulatedMs: z.number().int().min(0).max(31_536_000_000),
		startedAtMs: z.number().int().nullable(),
		countdownMs: z.number().int().min(0).max(31_536_000_000),
		lapsMs: z.array(z.number().int().min(0).max(31_536_000_000)).max(200),
		minimalDisplay: z.boolean(),
	})
	.strict();

const sessionBoardTileBaseSchema = z.object({
	id: z.string().min(1).max(MAX_ID_LENGTH),
	x: z.number().int().min(0).max(31),
	y: z.number().int().min(0).max(200),
	w: z.number().int().min(1).max(32),
	h: z.number().int().min(1).max(8),
	style: sessionBoardTileStyleSchema.optional(),
});

const sessionBoardCombatantSchema = z
	.object({
		id: idSchema,
		name: z.string().min(1).max(MAX_STRING_LENGTH),
		initiative: z.number().int().min(-100).max(100).nullable(),
		initiativeModifier: z.number().int().min(-100).max(100),
		tieRank: z.number().int().min(0).max(1000),
		ready: z.boolean(),
		delayed: z.boolean(),
		isPlayerCharacter: z.boolean(),
		currentHp: z.number().int().min(-100_000).max(100_000).nullable(),
		maxHp: z.number().int().min(0).max(100_000).nullable(),
		armorClass: z.number().int().min(-50).max(100).nullable(),
		conditions: z.array(z.string().max(64)).max(64),
		concentration: z.boolean(),
		deathSaves: z
			.object({
				successes: z.number().int().min(0).max(3),
				failures: z.number().int().min(0).max(3),
			})
			.strict(),
		outcome: z.enum(['active', 'fell', 'fled']),
		damageDealt: z.number().int().min(0).max(1_000_000),
		startingHp: z.number().int().min(0).max(100_000).nullable().optional(),
		linkedObjectId: idSchema.optional(),
		linkedObjectType: z.enum(['stat_block', 'character']).optional(),
		linkedObjectName: z.string().max(MAX_STRING_LENGTH).optional(),
		statsPreview: z
			.object({
				size: z.string().max(64).optional(),
				creatureType: z.string().max(64).optional(),
				alignment: z.string().max(64).optional(),
				challengeRating: z.string().max(64).optional(),
				speed: z.string().max(128).optional(),
				proficiencyBonus: z.string().max(64).optional(),
				className: z.string().max(128).optional(),
				level: z.number().int().min(1).max(100).optional(),
				traits: z.array(z.string().max(MAX_STRING_LENGTH)).max(40),
				actions: z.array(z.string().max(MAX_STRING_LENGTH)).max(40),
				reactions: z.array(z.string().max(MAX_STRING_LENGTH)).max(40),
				legendaryActions: z.array(z.string().max(MAX_STRING_LENGTH)).max(40),
			})
			.strict()
			.optional(),
		statsExpanded: z.boolean().optional(),
	})
	.strict();

const sessionBoardCombatLegendaryActionSchema = z
	.object({
		id: idSchema,
		name: z.string().min(1).max(MAX_STRING_LENGTH),
		cost: z.number().int().min(1).max(5),
		usedCount: z.number().int().min(0).max(100_000),
	})
	.strict();

const sessionBoardCombatLegendaryTrackerSchema = z
	.object({
		combatantId: idSchema,
		combatantName: z.string().min(1).max(MAX_STRING_LENGTH),
		chargesMax: z.number().int().min(1).max(9),
		chargesRemaining: z.number().int().min(0).max(9),
		actions: z.array(sessionBoardCombatLegendaryActionSchema).max(40),
	})
	.strict();

const sessionBoardCombatLairActionSchema = z
	.object({
		id: idSchema,
		name: z.string().min(1).max(MAX_STRING_LENGTH),
		description: z.string().max(MAX_CONTENT_LENGTH).optional(),
		autoTrigger: z.boolean(),
		usedCount: z.number().int().min(0).max(100_000),
	})
	.strict();

const sessionBoardCombatLairTrackerSchema = z
	.object({
		enabled: z.boolean(),
		initiativeCount: z.number().int().min(1).max(30),
		lastTriggeredRound: z.number().int().min(0).max(999).nullable(),
		actions: z.array(sessionBoardCombatLairActionSchema).max(40),
	})
	.strict();

const sessionBoardCombatNotableRollSchema = z
	.object({
		id: idSchema,
		kind: z.enum(['critical_hit', 'critical_failure', 'death_save_success', 'death_save_failure']),
		combatantName: z.string().min(1).max(MAX_STRING_LENGTH),
		combatantId: idSchema.optional(),
		round: z.number().int().min(1).max(999),
		note: z.string().max(220).optional(),
		recordedAt: z.string().min(1).max(MAX_STRING_LENGTH),
	})
	.strict();

const sessionBoardCombatStateSchema = z
	.object({
		encounterName: z.string().max(120),
		systemId: z.string().max(64),
		round: z.number().int().min(0).max(999),
		activeCombatantId: idSchema.nullable(),
		combatants: z.array(sessionBoardCombatantSchema).max(200),
		legendaryTrackers: z.array(sessionBoardCombatLegendaryTrackerSchema).max(50).optional(),
		lairTracker: sessionBoardCombatLairTrackerSchema.optional(),
		notableRolls: z.array(sessionBoardCombatNotableRollSchema).max(200).optional(),
		outcome: z.string().max(600).optional(),
		notes: z.string().max(MAX_CONTENT_LENGTH).optional(),
		loot: z.string().max(MAX_CONTENT_LENGTH).optional(),
		startedAt: z.string().max(MAX_STRING_LENGTH).nullable(),
		endedAt: z.string().max(MAX_STRING_LENGTH).nullable(),
		lastLogNoteId: idSchema.nullable(),
	})
	.strict();

const sessionBoardEncounterStateSchema = z.record(z.string(), z.unknown());

const sessionBoardNoteTileSchema = sessionBoardTileBaseSchema
	.extend({
		type: z.literal('note').optional(),
		noteId: idSchema.optional(),
		previewDepth: z.enum(['title', 'summary', 'full']).optional(),
		previewLineCount: z.number().int().min(1).max(40).optional(),
	})
	.strict();

const sessionBoardCalendarTileSchema = sessionBoardTileBaseSchema
	.extend({
		type: z.literal('calendar'),
	})
	.strict();

const sessionBoardTimerTileSchema = sessionBoardTileBaseSchema
	.extend({
		type: z.literal('timer'),
		timer: sessionBoardTimerStateSchema.optional(),
	})
	.strict();

const sessionBoardCombatTileSchema = sessionBoardTileBaseSchema
	.extend({
		type: z.literal('combat'),
		combat: sessionBoardCombatStateSchema.optional(),
	})
	.strict();

const sessionBoardEncounterTileSchema = sessionBoardTileBaseSchema
	.extend({
		type: z.literal('encounter'),
		encounter: sessionBoardEncounterStateSchema.optional(),
	})
	.strict();

const sessionBoardDiceTileSchema = sessionBoardTileBaseSchema
	.extend({
		type: z.literal('dice'),
	})
	.strict();

const sessionBoardGeneratorTileSchema = sessionBoardTileBaseSchema
	.extend({
		type: z.literal('generator'),
	})
	.strict();

const sessionBoardHandoutTileSchema = sessionBoardTileBaseSchema
	.extend({
		type: z.literal('handouts'),
	})
	.strict();

const sessionBoardTileSchema = z.union([
	sessionBoardNoteTileSchema,
	sessionBoardCalendarTileSchema,
	sessionBoardTimerTileSchema,
	sessionBoardCombatTileSchema,
	sessionBoardEncounterTileSchema,
	sessionBoardDiceTileSchema,
	sessionBoardGeneratorTileSchema,
	sessionBoardHandoutTileSchema,
]);

const sessionContextItemSchema = z
	.object({
		noteId: idSchema,
		category: z.enum(['npc', 'location', 'quest', 'party']),
		pinnedAt: z.string().min(1).max(MAX_STRING_LENGTH),
	})
	.strict();

const sessionContextSchema = z
	.object({
		collapsed: z.boolean(),
		items: z.array(sessionContextItemSchema).max(24),
	})
	.strict();

const sessionBoardTemplateSchema = z
	.object({
		id: idSchema,
		name: z.string().min(1).max(80),
		description: z.string().max(300),
		tiles: z.array(sessionBoardTileSchema).max(MAX_TILES),
		layout: z
			.object({
				columns: z.number().int().min(8).max(32),
				rowHeight: z.number().int().min(70).max(220),
				minRows: z.number().int().min(6).max(240),
				gap: z.number().int().min(0).max(28),
			})
			.strict()
			.optional(),
		style: z
			.object({
				backgroundColor: z.string().optional(),
				backgroundPattern: z.enum(['none', 'grid', 'dots']).optional(),
				sectionTintColor: z.string().optional(),
				sectionTintOpacity: z.number().min(0).max(0.75).optional(),
			})
			.strict()
			.optional(),
		builtIn: z.boolean().optional(),
		createdAt: z.string().min(1).max(MAX_STRING_LENGTH),
		updatedAt: z.string().min(1).max(MAX_STRING_LENGTH),
	})
	.strict();

/** Full SessionBoard shape expected by saveSessionBoard. */
export const sessionBoardSchema = z.object({
	id: idSchema,
	name: z.string().min(1).max(80),
	description: z.string().max(300),
	tiles: z.array(sessionBoardTileSchema).max(MAX_TILES),
	layout: z
		.object({
			columns: z.number().int().min(8).max(32),
			rowHeight: z.number().int().min(70).max(220),
			minRows: z.number().int().min(6).max(240),
			gap: z.number().int().min(0).max(28),
		})
		.strict()
		.optional(),
	style: z
		.object({
			backgroundColor: z.string().optional(),
			backgroundPattern: z.enum(['none', 'grid', 'dots']).optional(),
			sectionTintColor: z.string().optional(),
			sectionTintOpacity: z.number().min(0).max(0.75).optional(),
		})
		.strict()
		.optional(),
	sessionContext: sessionContextSchema.optional(),
	createdAt: z.string().min(1).max(MAX_STRING_LENGTH),
	updatedAt: z.string().min(1).max(MAX_STRING_LENGTH),
});

/**
 * Whitelisted set of valid AppSettings keys.
 * Prevents a compromised renderer from writing arbitrary keys to the settings
 * store via the set-setting channel.
 */
export const appSettingsKeySchema = z.enum([
	'theme',
	'sidebarOpen',
	'sidebarWidth',
	'focusReading',
	'playerModeEnabled',
	'defaultNoteView',
	'editor',
	'autoSaveDelay',
	'trashRetentionDays',
	'backupCadence',
	'backupRetentionCount',
	'defaultSort',
	'savedSearches',
	'onboarding',
	'templateContext',
	'diceMacros',
	'mcpPolicySettings',
	'syncConflictStrategy',
	'syncEngineState',
	'worldCalendar',
	'boardTemplates',
]);

/** MCP write-review policy settings shape for the mcp-policy:set channel. */
export const mcpPolicySettingsSchema = z.object({
	defaultPresetId: z.enum(['strict_review', 'balanced', 'trusted']),
	perAgent: z.record(
		z.string().max(MAX_STRING_LENGTH),
		z.enum(['strict_review', 'balanced', 'trusted']),
	),
});

export const syncConflictStrategySchema = z.enum(['manual', 'use_latest']);
export const syncQueueEntityTypeSchema = z.enum([
	'note',
	'session_board',
	'object',
	'setting',
	'links',
	'bulk',
	'snapshot',
]);
export const syncQueueOperationSchema = z.enum([
	'note_upsert',
	'note_permanent_delete',
	'session_board_upsert',
	'session_board_delete',
	'object_upsert',
	'object_delete',
	'setting_update',
	'links_update',
	'bulk_import',
	'bulk_restore',
	'snapshot_create',
]);
export const syncConflictReasonSchema = z.enum([
	'remote_created_during_local_create',
	'remote_updated_since_ancestor',
	'remote_deleted_since_ancestor',
]);
export const syncQueueEntrySchema = z.object({
	id: z.string().min(1).max(MAX_STRING_LENGTH),
	createdAt: z.string().min(1).max(MAX_STRING_LENGTH),
	updatedAt: z.string().min(1).max(MAX_STRING_LENGTH),
	entityType: syncQueueEntityTypeSchema,
	operation: syncQueueOperationSchema,
	entityId: z.string().min(1).max(MAX_STRING_LENGTH),
	ancestorNote: noteSchema.nullable(),
	localNote: noteSchema.nullable(),
	attempts: z.number().int().min(0).max(100_000),
	lastError: z.string().max(MAX_CONTENT_LENGTH).nullable(),
});
export const syncConflictRecordSchema = z.object({
	id: z.string().min(1).max(MAX_STRING_LENGTH),
	queueEntryId: z.string().min(1).max(MAX_STRING_LENGTH),
	noteId: z.string().min(1).max(MAX_STRING_LENGTH),
	title: z.string().min(1).max(MAX_STRING_LENGTH),
	detectedAt: z.string().min(1).max(MAX_STRING_LENGTH),
	reason: syncConflictReasonSchema,
	ancestorNote: noteSchema.nullable(),
	localNote: noteSchema.nullable(),
	remoteNote: noteSchema.nullable(),
});
export const syncEngineStateSchema = z.object({
	version: z.number().int().min(1).max(100),
	queue: z.array(syncQueueEntrySchema).max(5_000),
	conflicts: z.array(syncConflictRecordSchema).max(2_000),
	remoteNotes: z.record(z.string().max(MAX_STRING_LENGTH), noteSchema),
	lastSyncAt: z.string().max(MAX_STRING_LENGTH).nullable(),
	lastSyncError: z.string().max(MAX_CONTENT_LENGTH).nullable(),
});

/** Optional options for schema migration runs. */
export const migrationOptionsSchema = z
	.object({
		dryRun: z.boolean().optional(),
		createCheckpoint: z.boolean().optional(),
	})
	.optional();

/** Valid health subsystem names for the diagnostics:mark-success channel. */
export const healthSubsystemSchema = z.enum([
	'runtime_bootstrap',
	'vault_sync',
	'search_index',
	'link_graph_build',
]);

/** Full StructuredErrorEvent shape for the diagnostics:record-error channel. */
export const structuredErrorEventSchema = z.object({
	id: z.string().min(1).max(MAX_STRING_LENGTH),
	at: z.string().min(1).max(MAX_STRING_LENGTH),
	category: z.enum(['storage', 'parsing', 'ipc', 'mcp_sidecar', 'ui_runtime']),
	code: z.string().min(1).max(MAX_STRING_LENGTH),
	message: z.string().min(1).max(MAX_CONTENT_LENGTH),
	severity: z.enum(['error', 'warning', 'info']),
	recoveryHint: z.string().max(MAX_STRING_LENGTH).nullable().optional().default(null),
	details: z.string().max(MAX_CONTENT_LENGTH).nullable(),
	context: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
});

/** Budgeted performance measurement payload for diagnostics:record-performance. */
export const performanceMeasurementSchema = z.object({
	operation: z.enum([
		'cold_start',
		'vault_open',
		'note_open',
		'search_response',
		'note_save',
		'graph_rebuild_incremental',
		'mcp_bundle_call',
	]),
	durationMs: z.number().finite().min(0).max(600_000),
	at: z.string().max(MAX_STRING_LENGTH).optional(),
	source: z.enum(['renderer', 'main', 'mcp']),
	context: z
		.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
		.optional(),
});

/** Options for getAllNotes. */
export const getAllNotesOptionsSchema = z
	.object({ includeDeleted: z.boolean().optional() })
	.optional();

/** Options for getAllObjects. */
export const getAllObjectsOptionsSchema = z
	.object({
		type: vaultObjectTypeSchema.optional(),
		query: z.string().max(MAX_STRING_LENGTH).optional(),
	})
	.optional();

/** Options for getObjectHistory. */
export const getObjectHistoryOptionsSchema = z.object({ limit: optionalLimitSchema }).optional();

/** Array of Note IDs for suggest-related-notes (first positional arg). */
export const suggestNoteIdsSchema = z.array(idSchema).max(MAX_SUGGEST_IDS);

/** Array of Notes for bulk import. */
export const importNotesSchema = z.array(noteSchema).max(MAX_IMPORT_NOTES);

/** Optional snapshot reason string. */
export const snapshotReasonSchema = z.string().max(MAX_STRING_LENGTH).optional();

/** Embedding model name passed to semantic embedding IPC endpoint. */
export const semanticModelSchema = z.string().min(1).max(MAX_STRING_LENGTH);

/** Bounded text array for semantic embedding requests. */
export const semanticTextsSchema = z
	.array(z.string().min(1).max(MAX_CONTENT_LENGTH))
	.min(1)
	.max(MAX_EMBED_TEXTS);

/** Supported conflict resolution behaviors for import collisions. */
export const importResolutionSchema = z.enum(['skip', 'overwrite', 'merge']);

/** Import analyze/start payload for desktop folder-based imports. */
export const importSourceRequestSchema = z.object({
	sourceRoot: folderPathSchema,
});

/** Start import job payload. */
export const startImportJobSchema = z.object({
	sourceRoot: folderPathSchema,
	defaultResolution: importResolutionSchema,
	resumeFromCheckpoint: z.boolean().optional(),
});

/** Query payload for a running import job. */
export const importJobQuerySchema = z.object({
	jobId: idSchema,
});

/** Supported zip export profiles for interoperability. */
export const exportProfileSchema = z.enum(['portable_markdown_zip', 'deterministic_markdown_zip']);

/** Payload for markdown zip export operation. */
export const exportMarkdownZipSchema = z.object({
	profile: exportProfileSchema,
	outputPath: folderPathSchema.optional(),
});

/** Vault-relative map asset path under `.vault/assets/maps/`. */
export const mapAssetRelativePathSchema = z
	.string()
	.min(1)
	.max(MAX_PATH_LENGTH)
	.refine(isPathSafe, { message: 'Path traversal sequences are not allowed in map asset paths' });

// ─── Per-key AppSettings value schemas ───────────────────────────────────────

/**
 * Maps each AppSettings key to the Zod schema its value must satisfy.
 * Used by the set-setting IPC handler to validate the value argument in
 * addition to the already-whitelisted key.  Closes risk R1 in SECURITY.md.
 */
export const settingValueSchemas: Record<string, z.ZodTypeAny> = {
	theme: z.enum(['light', 'dark', 'system']),
	sidebarOpen: z.boolean(),
	sidebarWidth: z.number().int().min(160).max(600),
	focusReading: z.boolean(),
	playerModeEnabled: z.boolean(),
	defaultNoteView: z.enum(['read', 'edit']),
	editor: z.object({
		fontSize: z.number().int().min(8).max(72),
		lineHeight: z.number().min(1).max(3),
		showLineNumbers: z.boolean(),
		wordWrap: z.boolean(),
		vimMode: z.boolean(),
		splitPane: z.boolean(),
		toolbarDensity: z.enum(['compact', 'comfortable']),
	}),
	autoSaveDelay: z.number().int().min(0).max(10_000),
	trashRetentionDays: z.number().int().min(0).max(365),
	backupCadence: z.enum(['hourly', 'daily', 'on-close', 'manual']),
	backupRetentionCount: z.number().int().min(1).max(100),
	defaultSort: z.object({
		field: z.enum(['title', 'updatedAt', 'createdAt']),
		direction: z.enum(['asc', 'desc']),
	}),
	savedSearches: z
		.array(
			z.object({
				id: z.string().min(1).max(MAX_STRING_LENGTH),
				name: z.string().min(1).max(MAX_STRING_LENGTH),
				query: z.string().max(MAX_STRING_LENGTH),
				createdAt: z.string().min(1).max(MAX_STRING_LENGTH),
				updatedAt: z.string().min(1).max(MAX_STRING_LENGTH),
			}),
		)
		.max(500),
	onboarding: z.object({
		dismissed: z.boolean(),
		completedSteps: z
			.array(z.enum(['create_first_note', 'add_link', 'add_tag', 'use_search', 'open_settings']))
			.max(50),
		dismissedTips: z.array(z.enum(['wikilinks', 'backlinks', 'object_embeds'])).max(50),
	}),
	templateContext: z.object({
		campaignName: z.string().max(MAX_STRING_LENGTH),
		sessionNumber: z.number().int().min(0).max(10_000),
		characterNames: z.array(z.string().max(MAX_STRING_LENGTH)).max(100),
	}),
	diceMacros: z
		.array(
			z.object({
				id: z.string().min(1).max(MAX_STRING_LENGTH),
				label: z.string().min(1).max(MAX_STRING_LENGTH),
				expression: z.string().min(1).max(MAX_STRING_LENGTH),
				createdAt: z.string().min(1).max(MAX_STRING_LENGTH),
				updatedAt: z.string().min(1).max(MAX_STRING_LENGTH),
			}),
		)
		.max(200),
	mcpPolicySettings: mcpPolicySettingsSchema,
	syncConflictStrategy: syncConflictStrategySchema,
	syncEngineState: syncEngineStateSchema,
	worldCalendar: z.object({
		version: z.literal(1),
		months: z
			.array(
				z.object({
					name: z.string().min(1).max(80),
					days: z.number().int().min(1).max(400),
				}),
			)
			.min(1)
			.max(100),
		weekLength: z.number().int().min(1).max(30),
		dayNames: z.array(z.string().min(1).max(80)).min(1).max(30),
		leapYearRules: z
			.array(
				z.object({
					name: z.string().min(1).max(80),
					interval: z.number().int().min(1).max(100_000),
					monthIndex: z.number().int().min(0).max(99),
					dayDelta: z.number().int().min(-100).max(100),
				}),
			)
			.max(100),
		eras: z
			.array(
				z.object({
					name: z.string().min(1).max(120),
					epochOffset: z.number().int().min(-1_000_000_000).max(1_000_000_000),
				}),
			)
			.min(1)
			.max(100),
		moonCycles: z
			.array(
				z.object({
					name: z.string().min(1).max(120),
					periodDays: z.number().int().min(1).max(100_000),
					phaseNames: z.array(z.string().min(1).max(120)).min(1).max(64),
					offsetDays: z.number().int().min(-1_000_000_000).max(1_000_000_000),
				}),
			)
			.max(100),
		currentDayOffset: z.number().int().min(-1_000_000_000).max(1_000_000_000),
	}),
	boardTemplates: z.array(sessionBoardTemplateSchema).max(100),
};

// ─── Validation helper ────────────────────────────────────────────────────────

/**
 * Parse and validate an IPC argument against the provided schema.
 *
 * On success, returns the parsed (and possibly transformed) value.
 * On failure, throws an `Error` with a human-readable message that includes
 * the channel name and each Zod issue.  Electron's `ipcMain.handle`
 * infrastructure catches this error and sends a rejected promise to the
 * renderer — the main process itself never crashes.
 *
 * @param schema  - Zod schema to validate against.
 * @param value   - Raw value received from the renderer (typed as `unknown`).
 * @param channel - IPC channel name used for error attribution (e.g.
 *                  `'storage:save-note'`).
 */
export function parseIpcArg<T>(schema: z.ZodType<T>, value: unknown, channel: string): T {
	const result = schema.safeParse(value);
	if (!result.success) {
		const issues = result.error.issues
			.map((i) => (i.path.length > 0 ? `${i.path.join('.')}: ${i.message}` : i.message))
			.join('; ');
		throw new Error(`[IPC:${channel}] Payload validation failed: ${issues}`);
	}
	return result.data;
}
