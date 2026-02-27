import type { ErrorCategory, StructuredErrorEvent } from '$lib/types/diagnostics.js';

const ERROR_CODE_BY_CATEGORY: Record<ErrorCategory, string> = {
	storage: 'STORAGE_FAILURE',
	parsing: 'PARSING_FAILURE',
	ipc: 'IPC_FAILURE',
	mcp_sidecar: 'MCP_SIDECAR_FAILURE',
	ui_runtime: 'UI_RUNTIME_FAILURE',
};

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

export function toStructuredErrorEvent(input: {
	category: ErrorCategory;
	error: unknown;
	code?: string;
	context?: Record<string, string | number | boolean | null>;
}): StructuredErrorEvent {
	const normalized = normalizeUnknownError(input.error);
	return {
		id: randomId(),
		at: new Date().toISOString(),
		category: input.category,
		code: input.code ?? ERROR_CODE_BY_CATEGORY[input.category],
		message: normalized.message,
		severity: 'error',
		details: normalized.details,
		context: input.context ?? {},
	};
}
