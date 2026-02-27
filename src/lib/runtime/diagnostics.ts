import { toStructuredErrorEvent } from '$lib/domain/error-taxonomy.js';
import {
	markDesktopSubsystemSuccess,
	reportDesktopStructuredError,
} from '$lib/platform/desktop/bridge.js';
import type { ErrorCategory, HealthSubsystem } from '$lib/types/diagnostics.js';

let globalHandlersBound = false;

export async function reportRuntimeError(input: {
	category: ErrorCategory;
	error: unknown;
	code?: string;
	context?: Record<string, string | number | boolean | null>;
}): Promise<void> {
	const event = toStructuredErrorEvent(input);
	try {
		await reportDesktopStructuredError(event);
	} catch {
		// Diagnostics reporting should not crash user flows.
	}
}

export async function markSubsystemSuccess(subsystem: HealthSubsystem): Promise<void> {
	try {
		await markDesktopSubsystemSuccess(subsystem);
	} catch {
		// Best-effort telemetry.
	}
}

export function installGlobalRuntimeDiagnostics(): void {
	if (globalHandlersBound || typeof window === 'undefined') return;
	globalHandlersBound = true;

	window.addEventListener('error', (event) => {
		void reportRuntimeError({
			category: 'ui_runtime',
			error: event.error ?? event.message,
			code: 'WINDOW_ERROR',
			context: {
				filename: event.filename ?? null,
				lineno: event.lineno ?? 0,
				colno: event.colno ?? 0,
			},
		});
	});

	window.addEventListener('unhandledrejection', (event) => {
		void reportRuntimeError({
			category: 'ui_runtime',
			error: event.reason,
			code: 'UNHANDLED_REJECTION',
		});
	});
}
