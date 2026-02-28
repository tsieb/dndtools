import type { ErrorCategory, ErrorSeverity, StructuredErrorEvent } from '$lib/types/diagnostics.js';

// ─── Taxonomy registry ────────────────────────────────────────────────────────

/**
 * A single entry in the error taxonomy.
 *
 * Every known error code maps to a category, a stable human-readable message,
 * a recovery hint the UI can surface, and a default severity level.
 */
export interface TaxonomyEntry {
	category: ErrorCategory;
	humanMessage: string;
	/** One-sentence guidance on how to resolve this class of error. */
	recoveryHint: string;
	severity: ErrorSeverity;
}

/**
 * Canonical registry of all known error codes.
 *
 * Every error thrown in the application should use a code defined here.
 * Unknown codes fall back to the generic per-category entry.
 *
 * Naming convention: CATEGORY_DESCRIPTION (SCREAMING_SNAKE_CASE).
 */
export const ERROR_TAXONOMY: Readonly<Record<string, TaxonomyEntry>> = {
	// ── Storage ─────────────────────────────────────────────────────────────
	STORAGE_FAILURE: {
		category: 'storage',
		humanMessage: 'A storage operation failed.',
		recoveryHint: 'Check vault disk space and file permissions.',
		severity: 'error',
	},
	STORAGE_INIT_FAILED: {
		category: 'storage',
		humanMessage: 'Vault storage failed to initialize.',
		recoveryHint: 'Verify the vault directory exists and the application has read/write access.',
		severity: 'error',
	},
	STORAGE_READ_FAILED: {
		category: 'storage',
		humanMessage: 'Failed to read data from vault storage.',
		recoveryHint: 'Check vault file permissions and disk health.',
		severity: 'error',
	},
	STORAGE_WRITE_FAILED: {
		category: 'storage',
		humanMessage: 'Failed to write data to vault storage.',
		recoveryHint: 'Check vault disk space and write permissions.',
		severity: 'error',
	},
	STORAGE_CORRUPTION_DETECTED: {
		category: 'storage',
		humanMessage: 'Vault data appears corrupted.',
		recoveryHint: 'Run the vault integrity check in Settings → Vault to repair.',
		severity: 'error',
	},
	STORAGE_MIGRATION_FAILED: {
		category: 'storage',
		humanMessage: 'Schema migration failed.',
		recoveryHint: 'Open Settings → Vault and run migrations manually.',
		severity: 'error',
	},
	STORAGE_JOURNAL_REPLAY_FAILED: {
		category: 'storage',
		humanMessage: 'Write-journal recovery failed.',
		recoveryHint: 'Check vault permissions; manual repair may be needed via Settings → Vault.',
		severity: 'error',
	},

	// ── Parsing ──────────────────────────────────────────────────────────────
	PARSING_FAILURE: {
		category: 'parsing',
		humanMessage: 'Failed to parse document content.',
		recoveryHint: 'Check the note for invalid syntax.',
		severity: 'warning',
	},
	PARSING_MARKDOWN_FAILED: {
		category: 'parsing',
		humanMessage: 'Markdown parsing error.',
		recoveryHint: 'Check the note for unsupported markdown syntax.',
		severity: 'warning',
	},
	PARSING_FRONTMATTER_FAILED: {
		category: 'parsing',
		humanMessage: 'YAML frontmatter is invalid.',
		recoveryHint: 'Open the note and fix the frontmatter YAML block.',
		severity: 'warning',
	},
	PARSING_WIKILINK_FAILED: {
		category: 'parsing',
		humanMessage: 'Failed to resolve a wikilink.',
		recoveryHint: 'Verify the link target note exists.',
		severity: 'info',
	},

	// ── IPC ──────────────────────────────────────────────────────────────────
	IPC_FAILURE: {
		category: 'ipc',
		humanMessage: 'IPC communication failed.',
		recoveryHint: 'Restart the application.',
		severity: 'error',
	},
	IPC_CHANNEL_DOWN: {
		category: 'ipc',
		humanMessage: 'IPC channel is unavailable.',
		recoveryHint: 'Restart the application.',
		severity: 'error',
	},
	IPC_VALIDATION_FAILED: {
		category: 'ipc',
		humanMessage: 'IPC payload validation was rejected.',
		recoveryHint: 'This may indicate a version mismatch — try restarting the application.',
		severity: 'error',
	},
	IPC_TIMEOUT: {
		category: 'ipc',
		humanMessage: 'IPC request timed out.',
		recoveryHint: 'Restart the application if this issue persists.',
		severity: 'warning',
	},

	// ── MCP sidecar ──────────────────────────────────────────────────────────
	MCP_SIDECAR_FAILURE: {
		category: 'mcp_sidecar',
		humanMessage: 'MCP sidecar error.',
		recoveryHint: 'Restart the MCP sidecar from Settings → System Health.',
		severity: 'error',
	},
	MCP_SIDECAR_START_FAILED: {
		category: 'mcp_sidecar',
		humanMessage: 'MCP sidecar failed to start.',
		recoveryHint: 'Ensure the sidecar is built (pnpm mcp:build) and restart.',
		severity: 'error',
	},
	MCP_SIDECAR_CRASH: {
		category: 'mcp_sidecar',
		humanMessage: 'MCP sidecar crashed unexpectedly.',
		recoveryHint: 'Check system resources; restart from Settings → System Health.',
		severity: 'error',
	},
	MCP_SIDECAR_RESTART_FAILED: {
		category: 'mcp_sidecar',
		humanMessage: 'MCP sidecar restart failed.',
		recoveryHint: 'Run pnpm mcp:build to rebuild the sidecar bundle, then restart.',
		severity: 'error',
	},
	MCP_SIDECAR_MISSING_BUNDLE: {
		category: 'mcp_sidecar',
		humanMessage: 'MCP sidecar bundle not found.',
		recoveryHint: 'Run pnpm mcp:build to compile the sidecar.',
		severity: 'error',
	},

	// ── UI runtime ───────────────────────────────────────────────────────────
	UI_RUNTIME_FAILURE: {
		category: 'ui_runtime',
		humanMessage: 'A UI runtime error occurred.',
		recoveryHint: 'Reload the application.',
		severity: 'error',
	},
	BOOTSTRAP_FAILED: {
		category: 'ui_runtime',
		humanMessage: 'Application startup failed.',
		recoveryHint: 'Check vault directory access and restart the application.',
		severity: 'error',
	},
	WINDOW_ERROR: {
		category: 'ui_runtime',
		humanMessage: 'Unhandled JavaScript error.',
		recoveryHint: 'Reload the application.',
		severity: 'error',
	},
	UNHANDLED_REJECTION: {
		category: 'ui_runtime',
		humanMessage: 'Unhandled promise rejection.',
		recoveryHint: 'Reload the application if this issue persists.',
		severity: 'warning',
	},
	MAIN_UNCAUGHT_EXCEPTION: {
		category: 'ui_runtime',
		humanMessage: 'Main process unhandled exception.',
		recoveryHint: 'Restart the application.',
		severity: 'error',
	},
	MAIN_UNHANDLED_REJECTION: {
		category: 'ui_runtime',
		humanMessage: 'Main process unhandled rejection.',
		recoveryHint: 'Restart the application if this issue persists.',
		severity: 'warning',
	},
};

/**
 * Default error code for each category, used when no specific code is provided.
 * Maps to the corresponding generic fallback entry in ERROR_TAXONOMY.
 */
const CATEGORY_DEFAULT_CODE: Record<ErrorCategory, string> = {
	storage: 'STORAGE_FAILURE',
	parsing: 'PARSING_FAILURE',
	ipc: 'IPC_FAILURE',
	mcp_sidecar: 'MCP_SIDECAR_FAILURE',
	ui_runtime: 'UI_RUNTIME_FAILURE',
};

/**
 * Look up a taxonomy entry by error code.
 *
 * Returns `null` when the code is not in the registry (use
 * {@link CATEGORY_DEFAULT_CODE} to find the category fallback code).
 */
export function getErrorTaxonomyEntry(code: string): TaxonomyEntry | null {
	return ERROR_TAXONOMY[code] ?? null;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function randomId(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeUnknownError(error: unknown): {
	message: string;
	details: string | null;
} {
	if (error instanceof Error) {
		return {
			message: error.message,
			details: error.stack ?? null,
		};
	}

	return {
		message: String(error),
		details: null,
	};
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Convert an arbitrary caught error into a `StructuredErrorEvent` suitable for
 * recording in the diagnostics system.
 *
 * When `code` matches a known taxonomy entry the entry's `severity` and
 * `recoveryHint` are used as defaults (both can be overridden by the caller).
 * Unknown codes fall back to the category-level defaults.
 */
export function toStructuredErrorEvent(input: {
	category: ErrorCategory;
	error: unknown;
	code?: string;
	severity?: ErrorSeverity;
	recoveryHint?: string | null;
	context?: Record<string, string | number | boolean | null>;
}): StructuredErrorEvent {
	const normalized = normalizeUnknownError(input.error);
	const code = input.code ?? CATEGORY_DEFAULT_CODE[input.category];
	const entry =
		getErrorTaxonomyEntry(code) ?? getErrorTaxonomyEntry(CATEGORY_DEFAULT_CODE[input.category]);

	return {
		id: randomId(),
		at: new Date().toISOString(),
		category: input.category,
		code,
		message: normalized.message,
		severity: input.severity ?? entry?.severity ?? 'error',
		recoveryHint:
			input.recoveryHint !== undefined ? input.recoveryHint : (entry?.recoveryHint ?? null),
		details: normalized.details,
		context: input.context ?? {},
	};
}
