import type { PerfDiagnosticSample } from '@dndtools/core';

/**
 * RC-ENG-6.1 — collect the browser's recorded perf `measure` entries as local UX diagnostic samples
 * (PERF-009's local-only model: `packages/core/src/perf/diagnostics-privacy.ts`). Each measure's
 * `name` becomes the metric id and its `duration` the value; nothing else on the entry is read, so
 * there is no path/content to leak. Fails closed to an empty list when the Performance API is
 * unavailable.
 */
export function collectPerfMarks(): PerfDiagnosticSample[] {
	try {
		if (typeof performance === 'undefined' || !performance.getEntriesByType) return [];
		return performance.getEntriesByType('measure').map((entry) => ({
			metricId: entry.name,
			value: entry.duration,
			residency: 'local' as const,
		}));
	} catch {
		return [];
	}
}
