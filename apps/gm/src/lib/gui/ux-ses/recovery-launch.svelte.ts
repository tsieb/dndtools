/**
 * UX-SES-002 — per-LAUNCH recovery acknowledgment.
 *
 * The recovery prompt must appear once per application launch (a restart during a live session),
 * not on every client-side navigation back to the Session route. Module-level reactive state is
 * exactly per-JS-load — a hard reload (the "app restart") resets it, while SPA navigation within
 * the same launch keeps the acknowledgment. No browser storage is involved (PLAT-012: GUI never
 * touches browser primitives), so the semantics are precisely "this launch".
 */

class RecoveryLaunchState {
	acknowledged = $state(false);

	acknowledge(): void {
		this.acknowledged = true;
	}

	/** Test hook: reset to the fresh-launch state. */
	reset(): void {
		this.acknowledged = false;
	}
}

export const recoveryLaunch = new RecoveryLaunchState();
