/**
 * Canvas performance instrumentation (UX-CANVAS-014): the perceived-performance guarantees the canvas
 * runtime must measure and act on. Three concerns, each pure-tested:
 *
 *  1. Hot-interaction acknowledgement — a pan/zoom control must acknowledge within ~100 ms
 *     ({@link InteractionTracker}). Because the viewport transform is applied synchronously, the
 *     measured latency proves the control acknowledged inside budget.
 *  2. Frame budget + poster-frame degradation — when real frame time exceeds 20 ms for more than 3
 *     consecutive frames during a pan/zoom gesture, the canvas drops to a static poster frame and
 *     shows a calm "rendering…" indicator until the budget recovers ({@link FrameMonitor},
 *     {@link shouldDegrade}).
 *  3. Soft widget-count warning — past 150 widgets the DM is nudged (non-blocking) to group or split
 *     the scene ({@link widgetCountWarning}).
 *
 * The classes hold mutable counters but expose only derived readings; the Svelte runtime mirrors those
 * into `$state`. No DOM, no timers — the caller feeds `performance.now()` timestamps, so every decision
 * is deterministic under test.
 */

/** 60 fps target — 16.7 ms per frame (UX-CANVAS-014 §Frame target). */
export const FRAME_BUDGET_MS = 16.7;

/** A frame slower than this is "slow" and counts toward poster-frame degradation. */
export const DEGRADE_FRAME_MS = 20;

/** Poster-frame engages after MORE THAN this many consecutive slow frames (UX-CANVAS-014 spec). */
export const DEGRADE_CONSECUTIVE = 3;

/** Hot-interaction acknowledgement budget (UX-CANVAS-014 / live-play readiness). */
export const ACK_BUDGET_MS = 100;

/** Soft warning threshold for total widget count (UX-CANVAS-014 §Max widgets soft limit). */
export const WIDGET_WARN_THRESHOLD = 150;

/** Whether the canvas should drop to poster-frame mode given the consecutive-slow-frame run length. */
export function shouldDegrade(consecutiveSlowFrames: number): boolean {
	return consecutiveSlowFrames > DEGRADE_CONSECUTIVE;
}

/**
 * Non-blocking performance advisory when a canvas holds many widgets, or `null` below the threshold
 * (UX-CANVAS-014 AC4). Never a hard cap — the message only suggests grouping or splitting the scene.
 */
export function widgetCountWarning(count: number): string | null {
	if (count <= WIDGET_WARN_THRESHOLD) return null;
	return `This canvas has ${count} widgets. Consider grouping or moving widgets to separate scenes for best performance.`;
}

/** A reading of the most recent frame-timing window. */
export interface FrameReading {
	fps: number;
	frameMs: number;
	degraded: boolean;
	consecutiveSlow: number;
}

/**
 * Tracks per-frame timing during an active pan/zoom gesture and decides when to enter/leave
 * poster-frame mode. Feed it `performance.now()` once per animation frame; read `degraded` to drive
 * the "rendering…" indicator.
 */
export class FrameMonitor {
	#last = 0;
	#hasPrev = false;
	#consecutiveSlow = 0;
	#degraded = false;
	#fps = 60;
	#frameMs = FRAME_BUDGET_MS;

	/** Record a frame timestamp (ms). Returns whether the canvas is now in poster-frame mode. */
	frame(now: number): boolean {
		if (this.#hasPrev) {
			const dt = now - this.#last;
			this.#frameMs = dt;
			this.#fps = dt > 0 ? Math.round(1000 / dt) : 60;
			if (dt > DEGRADE_FRAME_MS) {
				this.#consecutiveSlow += 1;
			} else {
				this.#consecutiveSlow = 0;
			}
			this.#degraded = shouldDegrade(this.#consecutiveSlow);
		}
		this.#last = now;
		this.#hasPrev = true;
		return this.#degraded;
	}

	/** Force a recovery from poster-frame mode (gesture ended / budget recovered). */
	recover(): void {
		this.#consecutiveSlow = 0;
		this.#degraded = false;
	}

	/** Clear all timing state (start of a fresh gesture). */
	reset(): void {
		this.#last = 0;
		this.#hasPrev = false;
		this.#consecutiveSlow = 0;
		this.#degraded = false;
		this.#fps = 60;
		this.#frameMs = FRAME_BUDGET_MS;
	}

	get reading(): FrameReading {
		return {
			fps: this.#fps,
			frameMs: this.#frameMs,
			degraded: this.#degraded,
			consecutiveSlow: this.#consecutiveSlow,
		};
	}

	get degraded(): boolean {
		return this.#degraded;
	}
}

/**
 * Measures how long a hot interaction took to acknowledge (request → applied visual change). With a
 * synchronous transform the latency is sub-millisecond, proving the ≤100 ms budget is met; the reading
 * is surfaced in the canvas diagnostics so the guarantee is observable, not just asserted.
 */
export class InteractionTracker {
	#startedAt: number | null = null;
	#lastAckMs: number | null = null;
	#withinBudget = true;

	/** Mark the start of an interaction (button press / key / gesture step). */
	start(now: number): void {
		this.#startedAt = now;
	}

	/** Mark the interaction acknowledged (transform applied). Returns the latency in ms, or `null`. */
	acknowledge(now: number): number | null {
		if (this.#startedAt === null) return null;
		const ms = Math.max(0, now - this.#startedAt);
		this.#lastAckMs = ms;
		this.#withinBudget = ms <= ACK_BUDGET_MS;
		this.#startedAt = null;
		return ms;
	}

	get lastAckMs(): number | null {
		return this.#lastAckMs;
	}

	get withinBudget(): boolean {
		return this.#withinBudget;
	}
}
