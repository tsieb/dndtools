import { describe, expect, it } from 'vitest';
import {
	ACK_BUDGET_MS,
	DEGRADE_CONSECUTIVE,
	DEGRADE_FRAME_MS,
	FrameMonitor,
	InteractionTracker,
	WIDGET_WARN_THRESHOLD,
	shouldDegrade,
	widgetCountWarning,
} from '../../src/lib/canvas-runtime/perf';

// UX-CANVAS-014: perceived-performance instrumentation — frame budget + poster-frame degradation,
// hot-interaction acknowledgement within ~100 ms, and a soft >150-widget warning.

describe('shouldDegrade (poster-frame trigger)', () => {
	it('engages only after MORE THAN the consecutive-slow-frame threshold', () => {
		expect(shouldDegrade(DEGRADE_CONSECUTIVE)).toBe(false);
		expect(shouldDegrade(DEGRADE_CONSECUTIVE + 1)).toBe(true);
	});
});

describe('FrameMonitor (UX-CANVAS-014 AC2: poster-frame on >3 slow frames)', () => {
	it('enters poster-frame after >3 consecutive slow frames and recovers on a fast frame', () => {
		const m = new FrameMonitor();
		let t = 0;
		const slow = DEGRADE_FRAME_MS + 5;
		m.frame((t += 0)); // first frame establishes the baseline (no dt)
		for (let i = 0; i < DEGRADE_CONSECUTIVE; i += 1) {
			expect(m.frame((t += slow))).toBe(false); // 3 slow frames: not yet degraded
		}
		expect(m.frame((t += slow))).toBe(true); // 4th slow frame: poster-frame engages
		expect(m.degraded).toBe(true);
		// A fast frame resets the consecutive counter and leaves poster-frame mode.
		expect(m.frame(t + 8)).toBe(false);
		expect(m.degraded).toBe(false);
	});

	it('reports an fps estimate from the frame delta', () => {
		const m = new FrameMonitor();
		m.frame(0);
		m.frame(16.7);
		expect(m.reading.fps).toBe(60);
	});

	it('recover() forces out of poster-frame mode', () => {
		const m = new FrameMonitor();
		let t = 0;
		m.frame(t);
		for (let i = 0; i < 5; i += 1) m.frame((t += DEGRADE_FRAME_MS + 5));
		expect(m.degraded).toBe(true);
		m.recover();
		expect(m.degraded).toBe(false);
	});
});

describe('InteractionTracker (UX-CANVAS-014: acknowledge within ~100 ms)', () => {
	it('records a within-budget acknowledgement for a synchronous transform', () => {
		const t = new InteractionTracker();
		t.start(1000);
		const ms = t.acknowledge(1000.4);
		expect(ms).toBeCloseTo(0.4, 6);
		expect(t.lastAckMs).toBeCloseTo(0.4, 6);
		expect(t.withinBudget).toBe(true);
	});
	it('flags an over-budget acknowledgement', () => {
		const t = new InteractionTracker();
		t.start(0);
		t.acknowledge(ACK_BUDGET_MS + 50);
		expect(t.withinBudget).toBe(false);
	});
	it('returns null when no interaction is in flight', () => {
		expect(new InteractionTracker().acknowledge(10)).toBeNull();
	});
});

describe('widgetCountWarning (UX-CANVAS-014 AC4: soft 150-widget advisory)', () => {
	it('is null at or below the threshold and a message above it', () => {
		expect(widgetCountWarning(WIDGET_WARN_THRESHOLD)).toBeNull();
		const warning = widgetCountWarning(WIDGET_WARN_THRESHOLD + 1);
		expect(warning).toContain(String(WIDGET_WARN_THRESHOLD + 1));
		expect(warning).toMatch(/grouping|separate scenes/);
	});
});
