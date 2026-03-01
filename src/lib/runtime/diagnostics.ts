import { toStructuredErrorEvent } from '$lib/domain/error-taxonomy.js';
import {
	markDesktopSubsystemSuccess,
	recordDesktopPerformanceMeasurement,
	reportDesktopStructuredError,
} from '$lib/platform/desktop/bridge.js';
import type {
	ErrorCategory,
	HealthSubsystem,
	PerformanceMeasurementInput,
	PerformanceOperation,
} from '$lib/types/diagnostics.js';

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

export async function recordPerformanceMeasurement(
	input: Omit<PerformanceMeasurementInput, 'source'> & {
		source?: PerformanceMeasurementInput['source'];
	},
): Promise<void> {
	try {
		await recordDesktopPerformanceMeasurement({
			...input,
			source: input.source ?? 'renderer',
		});
	} catch {
		// Diagnostics reporting should not crash user flows.
	}
}

let perfMeasureCounter = 0;

export async function measureOperation<T>(
	operation: PerformanceOperation,
	run: () => Promise<T> | T,
	context?: Record<string, string | number | boolean | null>,
): Promise<T> {
	const markId = `${operation}-${Date.now()}-${perfMeasureCounter++}`;
	const startMark = `dndtools:${markId}:start`;
	const endMark = `dndtools:${markId}:end`;
	const measureName = `dndtools:${markId}:measure`;
	const startedAt = performance.now();
	performance.mark(startMark);
	try {
		return await run();
	} finally {
		performance.mark(endMark);
		performance.measure(measureName, startMark, endMark);
		const measured = performance.getEntriesByName(measureName, 'measure').at(-1);
		const durationMs = Number(
			((measured?.duration ?? performance.now() - startedAt) || 0).toFixed(2),
		);
		performance.clearMarks(startMark);
		performance.clearMarks(endMark);
		performance.clearMeasures(measureName);
		void recordPerformanceMeasurement({
			operation,
			durationMs,
			source: 'renderer',
			context,
		});
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
