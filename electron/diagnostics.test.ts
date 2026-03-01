// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DiagnosticsTracker } from './diagnostics.js';

describe('DiagnosticsTracker performance telemetry', () => {
	it('aggregates p50/p95/p99 summaries by operation', () => {
		const tracker = new DiagnosticsTracker();
		tracker.recordPerformance({
			operation: 'note_save',
			durationMs: 50,
			source: 'renderer',
			at: '2026-03-01T00:00:00.000Z',
		});
		tracker.recordPerformance({
			operation: 'note_save',
			durationMs: 75,
			source: 'renderer',
			at: '2026-03-01T00:00:01.000Z',
		});
		tracker.recordPerformance({
			operation: 'note_save',
			durationMs: 150,
			source: 'renderer',
			at: '2026-03-01T00:00:02.000Z',
		});

		const snapshot = tracker.getHealthSnapshot();
		const noteSave = snapshot.performance.summaries.find(
			(entry) => entry.operation === 'note_save',
		);
		expect(noteSave).toBeTruthy();
		expect(noteSave?.sampleCount).toBe(3);
		expect(noteSave?.p50Ms).toBe(75);
		expect(noteSave?.p95Ms).toBe(150);
		expect(noteSave?.p99Ms).toBe(150);
		expect(noteSave?.exceededBudgetCount).toBe(1);
	});

	it('deduplicates repeated performance samples', () => {
		const tracker = new DiagnosticsTracker();
		const sample = {
			operation: 'search_response' as const,
			durationMs: 42,
			source: 'renderer' as const,
			at: '2026-03-01T00:00:00.000Z',
			context: { queryLength: 3 },
		};
		tracker.recordPerformance(sample);
		tracker.recordPerformance(sample);

		const summary = tracker
			.getHealthSnapshot()
			.performance.summaries.find((entry) => entry.operation === 'search_response');
		expect(summary?.sampleCount).toBe(1);
	});
});
