import type { SessionTimer } from '../state/session-state';

/**
 * UX-SES-012 — the PURE timer countdown view model.
 *
 * The durable {@link SessionTimer} document records only status + remaining duration + the running
 * start instant (SES-005). This query derives everything the Timer widget renders — remaining
 * seconds, the arm's-length display string, the depletion fraction for the progress bar, and the
 * urgency band — as a pure function of (timer, nowIso). The GUI ticks a platform-layer clock and
 * re-derives; it never owns countdown state of its own (Architecture Contract 1: timers flow through
 * core session state, the platform layer owns the time primitive).
 *
 * Deterministic: the same (timer, nowIso) always yields the same view. No ambient Date.now().
 */

/** The urgency band driving numeral/bar color (UX-SES-012 spec). */
export type TimerUrgency = 'normal' | 'warning' | 'danger';

/** The widget-facing countdown status. `stopped` covers an idle/reset/never-started timer;
 * `expired` is a running timer whose remaining time has reached zero (the "Time's up!" state). */
export type TimerCountdownStatus = 'stopped' | 'running' | 'paused' | 'expired';

export interface TimerCountdownView {
	status: TimerCountdownStatus;
	/** Remaining seconds, clamped to >= 0. Fractional while running (sub-second display). */
	remainingSeconds: number;
	/** Arm's-length display: `M:SS` at >= 10 s (or paused/stopped), `S.s` in the final 10 running
	 * seconds (e.g. "9.4"), `0:00` when expired (UX-SES-012 spec). */
	display: string;
	/** Remaining fraction of the full duration in [0, 1] (drives the depleting bar). */
	fractionRemaining: number;
	urgency: TimerUrgency;
	/** The operator status label: "Running" / "Paused" / "Stopped" / "Time's up". */
	statusLabel: string;
}

/** Final-seconds urgency threshold (UX-SES-012: red numerals/bar in the final 10 s). */
export const TIMER_DANGER_SECONDS = 10;
/** Remaining-fraction threshold for the amber bar (UX-SES-012: amber at 30% remaining). */
export const TIMER_WARNING_FRACTION = 0.3;

/** Format whole remaining seconds as `M:SS` (e.g. `1:05`, `0:42`). */
function formatMinutesSeconds(totalSeconds: number): string {
	const whole = Math.max(0, Math.floor(totalSeconds));
	const minutes = Math.floor(whole / 60);
	const seconds = whole % 60;
	return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Elapsed seconds between two ISO instants, clamped to >= 0 (a skewed clock never goes negative). */
function elapsedSecondsBetween(startedAtIso: string, nowIso: string): number {
	const started = Date.parse(startedAtIso);
	const now = Date.parse(nowIso);
	if (Number.isNaN(started) || Number.isNaN(now)) return 0;
	return Math.max(0, (now - started) / 1000);
}

/**
 * Derive the countdown view for a timer at `nowIso`. `fullDurationSeconds` is the best-known full
 * (configured) duration used as the bar denominator; it falls back to the timer's own remaining
 * duration so a bare timer still renders a sane bar.
 */
export function getTimerCountdown(
	timer: SessionTimer | undefined | null,
	nowIso: string,
	fullDurationSeconds = 0,
): TimerCountdownView {
	// A never-started timer renders the best-known full (configured) duration at rest.
	const base = timer ? timer.durationSeconds : fullDurationSeconds;
	let status: TimerCountdownStatus = 'stopped';
	let remaining = base;

	if (timer?.status === 'paused') {
		status = 'paused';
	} else if (timer?.status === 'running') {
		// Remaining = recorded duration minus time elapsed since the recorded start. Pausing folds
		// elapsed time back into `durationSeconds`, so this is exact across pause/resume cycles.
		const elapsed = timer.startedAt ? elapsedSecondsBetween(timer.startedAt, nowIso) : 0;
		remaining = base - elapsed;
		if (remaining <= 0) {
			remaining = 0;
			status = 'expired';
		} else {
			status = 'running';
		}
	}

	const denominator = fullDurationSeconds > 0 ? fullDurationSeconds : base;
	const fractionRemaining =
		denominator > 0 ? Math.min(1, Math.max(0, remaining / denominator)) : 0;

	// Urgency applies to a live (running/paused/expired) timer, never a freshly stopped one.
	let urgency: TimerUrgency = 'normal';
	if (status !== 'stopped') {
		if (status === 'expired' || remaining <= TIMER_DANGER_SECONDS) urgency = 'danger';
		else if (fractionRemaining <= TIMER_WARNING_FRACTION) urgency = 'warning';
	}

	let display: string;
	if (status === 'expired') {
		display = '0:00';
	} else if (status === 'running' && remaining < TIMER_DANGER_SECONDS) {
		// Final-seconds format "S.s" (UX-SES-012 spec: sub-10 s reads as e.g. "9.4").
		display = (Math.max(0, Math.floor(remaining * 10)) / 10).toFixed(1);
	} else {
		display = formatMinutesSeconds(remaining);
	}

	const statusLabel =
		status === 'running'
			? 'Running'
			: status === 'paused'
				? 'Paused'
				: status === 'expired'
					? "Time's up"
					: 'Stopped';

	return { status, remainingSeconds: remaining, display, fractionRemaining, urgency, statusLabel };
}
