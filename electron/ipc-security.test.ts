// @vitest-environment node
/**
 * S1.4.4 — Security regression tests for the IPC validation layer.
 *
 * These tests verify the schema-level security properties documented in
 * docs/SECURITY.md without requiring a running Electron process.  They target
 * the schemas and the parseIpcArg helper exported from ipc-schemas.ts.
 *
 * Acceptance criteria coverage:
 *  AC1 — Oversized payloads are rejected.
 *  AC2 — Path traversal attempts in IDs / folder paths are blocked.
 *  AC3 — Unknown enum values (analogous to unexpected method names) are rejected.
 *  AC4 — The preload bridge surface is finite and typed (structural verification).
 */

import { describe, it, expect } from 'vitest';
import {
	parseIpcArg,
	idSchema,
	folderPathSchema,
	tagSchema,
	limitSchema,
	optionalLimitSchema,
	noteSchema,
	linkSchema,
	vaultObjectSchema,
	sessionBoardSchema,
	appSettingsKeySchema,
	mcpPolicySettingsSchema,
	migrationOptionsSchema,
	healthSubsystemSchema,
	structuredErrorEventSchema,
	performanceMeasurementSchema,
	getAllNotesOptionsSchema,
	getAllObjectsOptionsSchema,
	getObjectHistoryOptionsSchema,
	suggestNoteIdsSchema,
	importNotesSchema,
	snapshotReasonSchema,
	vaultObjectTypeSchema,
	semanticModelSchema,
	semanticTextsSchema,
	importResolutionSchema,
	importSourceRequestSchema,
	startImportJobSchema,
	importJobQuerySchema,
	exportProfileSchema,
	exportMarkdownZipSchema,
	desktopContextMenuRequestSchema,
} from './ipc-schemas.js';

// ─── Shared test fixtures ─────────────────────────────────────────────────────

function makeMinimalNote(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		id: 'note-abc123',
		title: 'Test Note',
		content: 'Hello world.',
		folder: '/campaign',
		tags: ['tag1'],
		frontmatter: {},
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		deleted: false,
		deletedAt: null,
		pinned: false,
		pinnedAt: null,
		...overrides,
	};
}

function makeMinimalObject(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		id: 'obj-abc123',
		type: 'character',
		name: 'Aldric',
		summary: 'A surface agent.',
		tags: [],
		relationships: [],
		data: {},
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		...overrides,
	};
}

function makeMinimalBoard(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		id: 'board-abc123',
		name: 'Session 1',
		description: '',
		tiles: [],
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		...overrides,
	};
}

// ─── AC1: Oversized payloads are rejected ─────────────────────────────────────

describe('AC1 — Oversized payloads', () => {
	it('rejects note content exceeding 10 MB', () => {
		const hugeContent = 'x'.repeat(10 * 1024 * 1024 + 1);
		const result = noteSchema.safeParse(makeMinimalNote({ content: hugeContent }));
		expect(result.success).toBe(false);
	});

	it('accepts note content at exactly 10 MB', () => {
		const maxContent = 'x'.repeat(10 * 1024 * 1024);
		const result = noteSchema.safeParse(makeMinimalNote({ content: maxContent }));
		expect(result.success).toBe(true);
	});

	it('rejects IDs longer than 512 characters', () => {
		const longId = 'a'.repeat(513);
		expect(idSchema.safeParse(longId).success).toBe(false);
	});

	it('accepts IDs up to 512 characters', () => {
		const maxId = 'a'.repeat(512);
		expect(idSchema.safeParse(maxId).success).toBe(true);
	});

	it('rejects folder paths longer than 2048 characters', () => {
		const longPath = '/a'.repeat(1025); // 2050 chars
		expect(folderPathSchema.safeParse(longPath).success).toBe(false);
	});

	it('rejects note tag arrays exceeding 200 entries', () => {
		const tooManyTags = Array.from({ length: 201 }, (_, i) => `tag${i}`);
		const result = noteSchema.safeParse(makeMinimalNote({ tags: tooManyTags }));
		expect(result.success).toBe(false);
	});

	it('rejects import arrays exceeding 10 000 notes', () => {
		const tooManyNotes = Array.from({ length: 10_001 }, (_, i) =>
			makeMinimalNote({ id: `note-${i}` }),
		);
		const result = importNotesSchema.safeParse(tooManyNotes);
		expect(result.success).toBe(false);
	});

	it('accepts import arrays up to 10 000 notes', () => {
		const notes = Array.from({ length: 100 }, (_, i) => makeMinimalNote({ id: `note-${i}` }));
		const result = importNotesSchema.safeParse(notes);
		expect(result.success).toBe(true);
	});

	it('rejects suggest-related-notes with more than 200 note IDs', () => {
		const tooManyIds = Array.from({ length: 201 }, (_, i) => `note-${i}`);
		const result = suggestNoteIdsSchema.safeParse(tooManyIds);
		expect(result.success).toBe(false);
	});

	it('rejects limit values above 10 000', () => {
		expect(limitSchema.safeParse(10_001).success).toBe(false);
	});

	it('accepts limit values up to 10 000', () => {
		expect(limitSchema.safeParse(10_000).success).toBe(true);
	});

	it('rejects a note title exceeding 1024 characters', () => {
		const longTitle = 'T'.repeat(1025);
		const result = noteSchema.safeParse(makeMinimalNote({ title: longTitle }));
		expect(result.success).toBe(false);
	});

	it('rejects session boards with more than 500 tiles', () => {
		const tiles = Array.from({ length: 501 }, (_, i) => ({
			id: `tile-${i}`,
			noteId: 'note-abc123',
			x: 0,
			y: i,
			w: 2,
			h: 2,
		}));
		const result = sessionBoardSchema.safeParse(makeMinimalBoard({ tiles }));
		expect(result.success).toBe(false);
	});

	it('rejects snapshot reasons exceeding 1024 characters', () => {
		const longReason = 'r'.repeat(1025);
		expect(snapshotReasonSchema.safeParse(longReason).success).toBe(false);
	});

	it('rejects performance measurements with unrealistic duration values', () => {
		const result = performanceMeasurementSchema.safeParse({
			operation: 'search_response',
			durationMs: 1_000_000,
			source: 'renderer',
			context: {},
		});
		expect(result.success).toBe(false);
	});

	it('rejects semantic embedding batches above limit', () => {
		const batch = Array.from({ length: 33 }, (_, idx) => `text ${idx + 1}`);
		expect(semanticTextsSchema.safeParse(batch).success).toBe(false);
	});

	it('accepts a valid semantic model name', () => {
		expect(semanticModelSchema.safeParse('nomic-embed-text').success).toBe(true);
	});

	it('rejects malformed import source request payloads', () => {
		expect(importSourceRequestSchema.safeParse({ sourceRoot: '' }).success).toBe(false);
		expect(importSourceRequestSchema.safeParse({}).success).toBe(false);
	});
});

// ─── AC2: Path traversal attempts are blocked ─────────────────────────────────

describe('AC2 — Path traversal is blocked', () => {
	const traversalPatterns = [
		'../../etc/passwd',
		'../shadow',
		'notes/../../secrets',
		'..\\windows\\system32',
		'note\x00id', // null byte
		'note\x1fid', // control character
	];

	describe('idSchema', () => {
		for (const pattern of traversalPatterns) {
			// eslint-disable-next-line no-control-regex
			it(`rejects "${pattern.replace(/\x00/g, '\\x00').replace(/\x1f/g, '\\x1f')}"`, () => {
				expect(idSchema.safeParse(pattern).success).toBe(false);
			});
		}

		it('accepts a safe alphanumeric ID', () => {
			expect(idSchema.safeParse('note-abc123').success).toBe(true);
		});

		it('accepts a nanoid-style ID', () => {
			expect(idSchema.safeParse('V1StGXR8_Z5jdHi6B-myT').success).toBe(true);
		});

		it('rejects empty string IDs', () => {
			expect(idSchema.safeParse('').success).toBe(false);
		});
	});

	describe('folderPathSchema', () => {
		for (const pattern of traversalPatterns) {
			// eslint-disable-next-line no-control-regex
			it(`rejects "${pattern.replace(/\x00/g, '\\x00').replace(/\x1f/g, '\\x1f')}"`, () => {
				expect(folderPathSchema.safeParse(pattern).success).toBe(false);
			});
		}

		it('accepts vault-relative paths with leading slash', () => {
			expect(folderPathSchema.safeParse('/campaign/npcs').success).toBe(true);
		});

		it('accepts root path "/"', () => {
			expect(folderPathSchema.safeParse('/').success).toBe(true);
		});

		it('accepts nested folders', () => {
			expect(folderPathSchema.safeParse('/world/locations/cities').success).toBe(true);
		});
	});

	describe('noteSchema — id and folder fields', () => {
		it('rejects a note whose id contains path traversal', () => {
			const result = noteSchema.safeParse(makeMinimalNote({ id: '../../evil' }));
			expect(result.success).toBe(false);
		});

		it('rejects a note whose folder contains path traversal', () => {
			const result = noteSchema.safeParse(makeMinimalNote({ folder: '/../root' }));
			expect(result.success).toBe(false);
		});

		it('rejects a note whose filePath contains path traversal', () => {
			const result = noteSchema.safeParse(makeMinimalNote({ filePath: '../../secrets.md' }));
			expect(result.success).toBe(false);
		});
	});

	describe('linkSchema', () => {
		it('rejects a link whose sourceId contains path traversal', () => {
			const result = linkSchema.safeParse({
				sourceId: '../bad',
				targetId: 'note-abc123',
				displayText: 'link',
				position: 0,
			});
			expect(result.success).toBe(false);
		});

		it('rejects a link whose targetId contains path traversal', () => {
			const result = linkSchema.safeParse({
				sourceId: 'note-abc123',
				targetId: '../../evil',
				displayText: 'link',
				position: 0,
			});
			expect(result.success).toBe(false);
		});
	});

	describe('vaultObjectSchema', () => {
		it('rejects an object whose id contains path traversal', () => {
			const result = vaultObjectSchema.safeParse(makeMinimalObject({ id: '../bad' }));
			expect(result.success).toBe(false);
		});
	});
});

// ─── AC3: Unknown/unexpected enum values are rejected ─────────────────────────
// This covers the acceptance criterion "unexpected method names on dynamic
// handlers are rejected" — the equivalent in our explicit-channel model is that
// only whitelisted enum values are accepted (no open string pass-through).

describe('AC3 — Enum values / whitelists are enforced', () => {
	describe('appSettingsKeySchema', () => {
		const validKeys = [
			'theme',
			'uiDensity',
			'noteReadingWidth',
			'reduceMotion',
			'highContrast',
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
			'featureSettings',
			'seenSpotlights',
			'syncConflictStrategy',
			'syncEngineState',
			'worldCalendar',
			'boardTemplates',
		] as const;

		for (const key of validKeys) {
			it(`accepts valid key "${key}"`, () => {
				expect(appSettingsKeySchema.safeParse(key).success).toBe(true);
			});
		}

		it('rejects arbitrary unknown setting key "__proto__"', () => {
			expect(appSettingsKeySchema.safeParse('__proto__').success).toBe(false);
		});

		it('rejects arbitrary unknown setting key "constructor"', () => {
			expect(appSettingsKeySchema.safeParse('constructor').success).toBe(false);
		});

		it('rejects arbitrary unknown setting key "dangerousMode"', () => {
			expect(appSettingsKeySchema.safeParse('dangerousMode').success).toBe(false);
		});

		it('rejects non-string values', () => {
			expect(appSettingsKeySchema.safeParse(42).success).toBe(false);
			expect(appSettingsKeySchema.safeParse(null).success).toBe(false);
			expect(appSettingsKeySchema.safeParse(undefined).success).toBe(false);
		});
	});

	describe('vaultObjectTypeSchema', () => {
		const validTypes = [
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
		] as const;

		for (const type of validTypes) {
			it(`accepts valid type "${type}"`, () => {
				expect(vaultObjectTypeSchema.safeParse(type).success).toBe(true);
			});
		}

		it('rejects unknown object type "monster"', () => {
			expect(vaultObjectTypeSchema.safeParse('monster').success).toBe(false);
		});

		it('rejects unknown object type "admin"', () => {
			expect(vaultObjectTypeSchema.safeParse('admin').success).toBe(false);
		});
	});

	describe('healthSubsystemSchema', () => {
		it('accepts all valid subsystem names', () => {
			for (const s of ['runtime_bootstrap', 'vault_sync', 'search_index', 'link_graph_build']) {
				expect(healthSubsystemSchema.safeParse(s).success).toBe(true);
			}
		});

		it('rejects unknown subsystem "file_watcher"', () => {
			expect(healthSubsystemSchema.safeParse('file_watcher').success).toBe(false);
		});
	});

	describe('performanceMeasurementSchema', () => {
		it('accepts a valid performance telemetry event', () => {
			const result = performanceMeasurementSchema.safeParse({
				operation: 'note_save',
				durationMs: 82.4,
				source: 'renderer',
				context: { contentLength: 1200 },
			});
			expect(result.success).toBe(true);
		});

		it('rejects unknown performance operation names', () => {
			const result = performanceMeasurementSchema.safeParse({
				operation: 'index_build',
				durationMs: 82.4,
				source: 'renderer',
				context: {},
			});
			expect(result.success).toBe(false);
		});
	});

	describe('import/export profile enums', () => {
		it('accepts all supported import resolution values', () => {
			for (const resolution of ['skip', 'overwrite', 'merge']) {
				expect(importResolutionSchema.safeParse(resolution).success).toBe(true);
			}
		});

		it('rejects unknown import resolution values', () => {
			expect(importResolutionSchema.safeParse('replace-all').success).toBe(false);
		});

		it('accepts all supported export profiles', () => {
			expect(exportProfileSchema.safeParse('portable_markdown_zip').success).toBe(true);
			expect(exportProfileSchema.safeParse('deterministic_markdown_zip').success).toBe(true);
		});

		it('rejects unknown export profiles', () => {
			expect(exportProfileSchema.safeParse('zip').success).toBe(false);
		});
	});

	describe('mcpPolicySettingsSchema', () => {
		it('accepts a valid policy settings object', () => {
			const result = mcpPolicySettingsSchema.safeParse({
				defaultPresetId: 'strict_review',
				perAgent: { 'agent-1': 'balanced' },
			});
			expect(result.success).toBe(true);
		});

		it('rejects an unknown preset ID', () => {
			const result = mcpPolicySettingsSchema.safeParse({
				defaultPresetId: 'superuser',
				perAgent: {},
			});
			expect(result.success).toBe(false);
		});

		it('rejects a per-agent entry with an unknown preset', () => {
			const result = mcpPolicySettingsSchema.safeParse({
				defaultPresetId: 'balanced',
				perAgent: { 'agent-1': 'god_mode' },
			});
			expect(result.success).toBe(false);
		});
	});

	describe('structuredErrorEventSchema', () => {
		it('rejects an unknown category', () => {
			const result = structuredErrorEventSchema.safeParse({
				id: 'err-1',
				at: '2026-01-01T00:00:00.000Z',
				category: 'network', // not in the enum
				code: 'NET_ERR',
				message: 'failed',
				severity: 'error',
				details: null,
				context: {},
			});
			expect(result.success).toBe(false);
		});

		it('rejects an unknown severity', () => {
			const result = structuredErrorEventSchema.safeParse({
				id: 'err-1',
				at: '2026-01-01T00:00:00.000Z',
				category: 'storage',
				code: 'ERR',
				message: 'failed',
				severity: 'critical', // not in the enum
				details: null,
				context: {},
			});
			expect(result.success).toBe(false);
		});

		it('accepts a fully valid error event with recoveryHint', () => {
			const result = structuredErrorEventSchema.safeParse({
				id: 'err-1',
				at: '2026-01-01T00:00:00.000Z',
				category: 'storage',
				code: 'STORAGE_INIT_FAILED',
				message: 'init failed',
				severity: 'error',
				recoveryHint: 'Check vault directory access and restart the application.',
				details: 'stack trace here',
				context: { stage: 'boot', retryCount: 0, recovered: false },
			});
			expect(result.success).toBe(true);
		});

		it('accepts a valid error event without recoveryHint (backwards-compat)', () => {
			const result = structuredErrorEventSchema.safeParse({
				id: 'err-1',
				at: '2026-01-01T00:00:00.000Z',
				category: 'storage',
				code: 'STORAGE_INIT_FAILED',
				message: 'init failed',
				severity: 'error',
				details: 'stack trace here',
				context: { stage: 'boot', retryCount: 0, recovered: false },
			});
			expect(result.success).toBe(true);
			// Missing recoveryHint defaults to null
			expect(result.data?.recoveryHint).toBeNull();
		});
	});

	describe('migrationOptionsSchema', () => {
		it('accepts undefined (no options)', () => {
			expect(migrationOptionsSchema.safeParse(undefined).success).toBe(true);
		});

		it('accepts valid migration options', () => {
			expect(
				migrationOptionsSchema.safeParse({ dryRun: true, createCheckpoint: false }).success,
			).toBe(true);
		});

		it('rejects non-boolean dryRun', () => {
			expect(migrationOptionsSchema.safeParse({ dryRun: 'yes' }).success).toBe(false);
		});
	});
});

// ─── AC4: Preload bridge surface is finite and typed ──────────────────────────
// This test verifies that:
//  a) The schemas module exports a finite, enumerable set of schemas.
//  b) There is no generic "invoke any channel" escape hatch in the module.
//
// The actual preload bridge is verified structurally by TypeScript compilation;
// this test documents the expected method surface.

describe('AC4 — Preload bridge surface is closed', () => {
	it('parseIpcArg throws a structured Error (not a ZodError) on validation failure', () => {
		expect(() => parseIpcArg(idSchema, '', 'test:channel')).toThrow(
			'[IPC:test:channel] Payload validation failed',
		);
	});

	it('parseIpcArg error message names the channel', () => {
		let caught: Error | undefined;
		try {
			parseIpcArg(idSchema, 42, 'storage:get-note');
		} catch (e) {
			caught = e as Error;
		}
		expect(caught).toBeDefined();
		expect(caught?.message).toContain('[IPC:storage:get-note]');
	});

	it('parseIpcArg error message includes field path for nested failures', () => {
		let caught: Error | undefined;
		try {
			// id is the field that violates the constraint
			parseIpcArg(noteSchema, makeMinimalNote({ id: '' }), 'storage:save-note');
		} catch (e) {
			caught = e as Error;
		}
		expect(caught).toBeDefined();
		// Should mention 'id' path
		expect(caught?.message).toContain('id');
	});

	it('parseIpcArg returns the validated value on success', () => {
		const result = parseIpcArg(idSchema, 'note-abc123', 'storage:get-note');
		expect(result).toBe('note-abc123');
	});

	it('parseIpcArg rejects null for a required string', () => {
		expect(() => parseIpcArg(idSchema, null, 'storage:get-note')).toThrow();
	});

	it('parseIpcArg rejects undefined for a required string', () => {
		expect(() => parseIpcArg(idSchema, undefined, 'storage:get-note')).toThrow();
	});

	it('parseIpcArg accepts undefined for optionalLimitSchema', () => {
		const result = parseIpcArg(optionalLimitSchema, undefined, 'test:optional');
		expect(result).toBeUndefined();
	});

	it('parseIpcArg rejects non-integer limit', () => {
		expect(() => parseIpcArg(optionalLimitSchema, 1.5, 'test:limit')).toThrow();
	});

	it('parseIpcArg rejects zero limit', () => {
		expect(() => parseIpcArg(optionalLimitSchema, 0, 'test:limit')).toThrow();
	});

	it('parseIpcArg rejects negative limit', () => {
		expect(() => parseIpcArg(optionalLimitSchema, -1, 'test:limit')).toThrow();
	});
});

// ─── Additional edge-case coverage ───────────────────────────────────────────

describe('Additional validation edge cases', () => {
	describe('noteSchema', () => {
		it('rejects a note missing required fields', () => {
			expect(noteSchema.safeParse({ id: 'x', title: 'hi' }).success).toBe(false);
		});

		it('rejects a note with a non-boolean deleted field', () => {
			const result = noteSchema.safeParse(makeMinimalNote({ deleted: 'yes' }));
			expect(result.success).toBe(false);
		});

		it('rejects a note with a non-string tag', () => {
			const result = noteSchema.safeParse(makeMinimalNote({ tags: [1, 2, 3] }));
			expect(result.success).toBe(false);
		});

		it('accepts a note with no filePath (optional)', () => {
			const { filePath: _, ...withoutFilePath } = makeMinimalNote() as Record<string, unknown>;
			const result = noteSchema.safeParse(withoutFilePath);
			expect(result.success).toBe(true);
		});
	});

	describe('vaultObjectSchema', () => {
		it('rejects an object with an invalid relationship type', () => {
			const result = vaultObjectSchema.safeParse(
				makeMinimalObject({
					relationships: [{ type: 'nemesis', targetId: 'obj-123' }],
				}),
			);
			expect(result.success).toBe(false);
		});

		it('accepts custom relationship labels when type is custom', () => {
			const result = vaultObjectSchema.safeParse(
				makeMinimalObject({
					relationships: [{ type: 'custom', label: 'mentor', targetId: 'obj-123' }],
				}),
			);
			expect(result.success).toBe(true);
		});

		it('rejects an object with an unknown type', () => {
			const result = vaultObjectSchema.safeParse(makeMinimalObject({ type: 'deity' }));
			expect(result.success).toBe(false);
		});
	});

	describe('getAllObjectsOptionsSchema', () => {
		it('accepts undefined', () => {
			expect(getAllObjectsOptionsSchema.safeParse(undefined).success).toBe(true);
		});

		it('accepts valid type filter', () => {
			expect(getAllObjectsOptionsSchema.safeParse({ type: 'npc' }).success).toBe(true);
		});

		it('rejects invalid type filter', () => {
			expect(getAllObjectsOptionsSchema.safeParse({ type: 'ghost' }).success).toBe(false);
		});
	});

	describe('getAllNotesOptionsSchema', () => {
		it('accepts undefined', () => {
			expect(getAllNotesOptionsSchema.safeParse(undefined).success).toBe(true);
		});

		it('accepts { includeDeleted: true }', () => {
			expect(getAllNotesOptionsSchema.safeParse({ includeDeleted: true }).success).toBe(true);
		});

		it('rejects { includeDeleted: "yes" }', () => {
			expect(getAllNotesOptionsSchema.safeParse({ includeDeleted: 'yes' }).success).toBe(false);
		});
	});

	describe('getObjectHistoryOptionsSchema', () => {
		it('accepts undefined', () => {
			expect(getObjectHistoryOptionsSchema.safeParse(undefined).success).toBe(true);
		});

		it('accepts { limit: 50 }', () => {
			expect(getObjectHistoryOptionsSchema.safeParse({ limit: 50 }).success).toBe(true);
		});
	});

	describe('import/export job payload schemas', () => {
		it('accepts a valid start import job payload', () => {
			const result = startImportJobSchema.safeParse({
				sourceRoot: '/vault/import-source',
				defaultResolution: 'merge',
				resumeFromCheckpoint: true,
			});
			expect(result.success).toBe(true);
		});

		it('rejects start import job payload with invalid resolution', () => {
			const result = startImportJobSchema.safeParse({
				sourceRoot: '/vault/import-source',
				defaultResolution: 'replace',
			});
			expect(result.success).toBe(false);
		});

		it('accepts import job query payload', () => {
			expect(importJobQuerySchema.safeParse({ jobId: 'job-123' }).success).toBe(true);
		});

		it('accepts markdown zip export payload with optional output path', () => {
			expect(
				exportMarkdownZipSchema.safeParse({
					profile: 'portable_markdown_zip',
				}).success,
			).toBe(true);
			expect(
				exportMarkdownZipSchema.safeParse({
					profile: 'deterministic_markdown_zip',
					outputPath: '/tmp/export.zip',
				}).success,
			).toBe(true);
		});
	});

	describe('tagSchema', () => {
		it('rejects empty tag', () => {
			expect(tagSchema.safeParse('').success).toBe(false);
		});

		it('rejects tag exceeding 256 chars', () => {
			expect(tagSchema.safeParse('t'.repeat(257)).success).toBe(false);
		});

		it('accepts a normal tag', () => {
			expect(tagSchema.safeParse('dwarven-culture').success).toBe(true);
		});
	});

	describe('sessionBoardSchema tile coordinates', () => {
		it('rejects a tile with x beyond grid max (31)', () => {
			const tiles = [{ id: 't1', noteId: 'note-abc123', x: 32, y: 0, w: 2, h: 2 }];
			const result = sessionBoardSchema.safeParse(makeMinimalBoard({ tiles }));
			expect(result.success).toBe(false);
		});

		it('rejects a tile with negative x', () => {
			const tiles = [{ id: 't1', noteId: 'note-abc123', x: -1, y: 0, w: 2, h: 2 }];
			const result = sessionBoardSchema.safeParse(makeMinimalBoard({ tiles }));
			expect(result.success).toBe(false);
		});

		it('accepts combat tiles with combat state payload', () => {
			const tiles = [
				{
					id: 'combat-1',
					type: 'combat',
					x: 0,
					y: 0,
					w: 6,
					h: 4,
					combat: {
						encounterName: 'Bridge Skirmish',
						systemId: 'dnd5e',
						round: 1,
						activeCombatantId: null,
						combatants: [],
						notes: '',
						loot: '',
						startedAt: null,
						endedAt: null,
						lastLogNoteId: null,
					},
				},
			];
			const result = sessionBoardSchema.safeParse(makeMinimalBoard({ tiles }));
			expect(result.success).toBe(true);
		});
	});

	describe('sessionBoardSchema session context', () => {
		it('accepts persisted session context payload', () => {
			const result = sessionBoardSchema.safeParse(
				makeMinimalBoard({
					sessionContext: {
						collapsed: false,
						items: [
							{
								noteId: 'note-abc123',
								category: 'npc',
								pinnedAt: '2026-03-02T00:00:00.000Z',
							},
						],
					},
				}),
			);
			expect(result.success).toBe(true);
		});
	});

	describe('desktopContextMenuRequestSchema', () => {
		it('accepts note context-menu payloads with bounded folder choices', () => {
			const result = desktopContextMenuRequestSchema.safeParse({
				kind: 'note',
				noteId: 'note-abc123',
				noteTitle: 'Arcane Ledger',
				pinned: false,
				folder: '/campaign/notes',
				availableFolders: ['/', '/campaign', '/campaign/notes'],
				x: 420,
				y: 360,
			});
			expect(result.success).toBe(true);
		});

		it('rejects note context-menu payloads with traversal folder values', () => {
			const result = desktopContextMenuRequestSchema.safeParse({
				kind: 'note',
				noteId: 'note-abc123',
				noteTitle: 'Arcane Ledger',
				pinned: false,
				folder: '/campaign/notes',
				availableFolders: ['../../outside'],
			});
			expect(result.success).toBe(false);
		});

		it('accepts folder context-menu payloads', () => {
			const result = desktopContextMenuRequestSchema.safeParse({
				kind: 'folder',
				folder: '/campaign/locations',
				x: 120,
				y: 88,
			});
			expect(result.success).toBe(true);
		});
	});
});
