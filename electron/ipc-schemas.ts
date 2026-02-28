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
	'npc',
	'location',
	'faction',
	'quest',
	'item',
	'encounter',
	'timeline_event',
]);

const objectRelationshipSchema = z.object({
	type: z.enum(['parent', 'child', 'ally', 'enemy', 'appears_in_session']),
	targetId: idSchema.optional(),
	sessionId: idSchema.optional(),
	description: z.string().max(MAX_STRING_LENGTH).optional(),
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

const sessionBoardTileSchema = z
	.object({
		id: z.string().min(1).max(MAX_ID_LENGTH),
		noteId: idSchema,
		x: z.number().int().min(0).max(31),
		y: z.number().int().min(0).max(200),
		w: z.number().int().min(1).max(32),
		h: z.number().int().min(1).max(8),
		style: sessionBoardTileStyleSchema.optional(),
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
	'mcpPolicySettings',
]);

/** MCP write-review policy settings shape for the mcp-policy:set channel. */
export const mcpPolicySettingsSchema = z.object({
	defaultPresetId: z.enum(['strict_review', 'balanced', 'trusted']),
	perAgent: z.record(
		z.string().max(MAX_STRING_LENGTH),
		z.enum(['strict_review', 'balanced', 'trusted']),
	),
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
	details: z.string().max(MAX_CONTENT_LENGTH).nullable(),
	context: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
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
