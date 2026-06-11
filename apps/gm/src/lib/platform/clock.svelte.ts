/**
 * UX-SES-012 — the platform-layer SESSION CLOCK tick.
 *
 * The Timer widget's durable state lives in the Processing Core (`SessionTimer` + the pure
 * `getTimerCountdown` view); the GUI re-derives the countdown from that state plus the CURRENT
 * INSTANT. This store is the single platform-layer owner of the wall-clock/scheduling primitive
 * (Contract 1 / PLAT-006: the platform layer owns time — GUI components never run ad-hoc
 * `setInterval` countdown state of their own). Components `start()` the tick while a timer is
 * live and `stop()` it on teardown; the reactive `nowIso` drives the pure core derivation.
 *
 * SSR/test-safe: all timer access is guarded; without a `window` the store stays at its initial
 * instant (the core view degrades to a static render, never a crash).
 */

import { SvelteDate } from 'svelte/reactivity';

/** Tick granularity. 200 ms keeps the sub-10-second "S.s" display visibly moving (UX-SES-012)
 * without meaningful render cost; reduced-motion only affects CSS, not data ticks. */
const TICK_MS = 200;

/** The current wall-clock instant as an ISO string (the same shape the runtime's CoreEnvironment
 * clock produces). A SvelteDate is constructed-then-read immediately — no shared mutable Date. */
function currentInstantIso(): string {
	return new SvelteDate(Date.now()).toISOString();
}

export class SessionClock {
	nowIso = $state(currentInstantIso());
	#interval: ReturnType<typeof setInterval> | null = null;

	/** Begin ticking (idempotent). No-op outside the browser. */
	start(): void {
		if (this.#interval !== null || typeof window === 'undefined') return;
		this.nowIso = currentInstantIso();
		this.#interval = setInterval(() => {
			this.nowIso = currentInstantIso();
		}, TICK_MS);
	}

	/** Stop ticking (idempotent). The last instant stays readable. */
	stop(): void {
		if (this.#interval === null) return;
		clearInterval(this.#interval);
		this.#interval = null;
	}
}
