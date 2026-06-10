/**
 * A11Y-006 — LIVE ANNOUNCER POLICY.
 *
 * Pure, deterministic functions that decide WHAT to say (and WHEN to say it) for the
 * application's aria-live regions. All surfaces that emit AT announcements route through
 * these helpers so that announcement text is concise and testable, and duplication /
 * high-frequency flooding is prevented in one place rather than scattered across components.
 *
 * SURFACES COVERED (A11Y-006 statement):
 *   - Route changes       → resolved in queries/navigation-view.ts (routeA11y.announcement)
 *   - Async command status / save state → saveStateAnnouncement (AC1)
 *   - Sync state          → syncStatusAnnouncement + shouldAnnounceSyncChange (AC2)
 *   - Validation failures → role="alert" on individual validation items (polite assertive, per pattern)
 *   - Session events      → sessionStatusAnnouncement (connected/stale/reconnecting changes)
 *
 * AC1: a successful save emits a CONCISE label ("Note saved.") — never the raw lifecycle object.
 * AC2: rapidly-repeated sync-state transitions are DEBOUNCED: the same summary within the
 *      SYNC_DEBOUNCE_MS window is suppressed, and identical consecutive summaries are always
 *      suppressed regardless of timing (last-wins deduplication).
 */

import type { CommandLifecycleStatus } from '../lifecycle/command-lifecycle';
import type { SystemHealthLevel } from '../diagnostics/health';

// ---------------------------------------------------------------------------
// Save-state (AC1)
// ---------------------------------------------------------------------------

/**
 * A11Y-006 AC1 — map a PLAT-018 lifecycle status to a CONCISE live announcement for the note
 * editor. Returns '' for states that do not need a live announcement (failure is handled by
 * role="alert" inline; idle/draft/cancelled/undone carry no audible information).
 *
 * Pure + deterministic: identical input → identical output.
 */
export function saveStateAnnouncement(status: CommandLifecycleStatus): string {
	switch (status) {
		case 'pending':
			return 'Saving note…';
		case 'success':
			return 'Note saved.';
		// failure is emitted as role="alert" by the GUI directly — not a live-polite announcement.
		// idle / draft / cancelled / undone carry no audible information.
		default:
			return '';
	}
}

// ---------------------------------------------------------------------------
// Sync-state debounce (AC2)
// ---------------------------------------------------------------------------

/**
 * The minimum number of milliseconds that must elapse between consecutive IDENTICAL sync-status
 * announcements. Rapid-fire sync events (e.g. a burst of operation acknowledgements) produce the
 * same health/online/pending summary multiple times; the debounce window collapses these into at
 * most one announcement per window per distinct summary.
 *
 * Set conservatively (2 s) so a sustained state change is still reported promptly, while a burst
 * of identical events within two seconds produces at most one announcement.
 */
export const SYNC_DEBOUNCE_MS = 2_000;

/**
 * A11Y-006 AC2 — build a stable string key summarising sync status for deduplication. Two
 * consecutive invocations that produce the same key represent the SAME audible state and do not
 * need a second announcement.
 */
export function syncStatusKey(
	health: SystemHealthLevel,
	online: boolean,
	pendingCount: number,
): string {
	// Bucket pending counts so minor fluctuations around a threshold do not trigger
	// separate announcements (e.g. 3 → 2 → 1 pending would be three announcements).
	// We treat "0 pending" as distinct from "any pending" and cap the announced bucket.
	const pendingBucket = pendingCount === 0 ? 'none' : pendingCount <= 5 ? 'few' : 'many';
	return `${health}|${online ? 'online' : 'offline'}|${pendingBucket}`;
}

/**
 * A11Y-006 AC2 — build a CONCISE human-readable announcement for the current sync status. The
 * text is intentionally brief so a screen reader delivers it quickly without interrupting the
 * user's primary task.
 */
export function syncStatusAnnouncement(
	health: SystemHealthLevel,
	online: boolean,
	pendingCount: number,
): string {
	const onlineLabel = online ? 'online' : 'offline';
	if (health === 'healthy' && pendingCount === 0) {
		return `Sync up to date, ${onlineLabel}.`;
	}
	if (health === 'healthy' && pendingCount > 0) {
		return `Sync ${onlineLabel}, ${pendingCount} change${pendingCount === 1 ? '' : 's'} pending.`;
	}
	if (health === 'degraded') {
		const pending = pendingCount > 0 ? `, ${pendingCount} pending` : '';
		return `Sync degraded${pending}, ${onlineLabel}.`;
	}
	// unhealthy
	const pending = pendingCount > 0 ? `, ${pendingCount} pending` : '';
	return `Sync unhealthy${pending}, ${onlineLabel}.`;
}

/**
 * A11Y-006 AC2 — decide whether a sync-state change should be announced RIGHT NOW.
 *
 * @param prevKey      The key returned by the LAST call to `syncStatusKey` that was announced
 *                     (or null if nothing has been announced yet).
 * @param nextKey      The key for the INCOMING sync state.
 * @param lastMs       Timestamp (ms since epoch) of the last announcement, 0 if never.
 * @param nowMs        Current timestamp (ms since epoch).
 * @param debounceMs   Minimum interval between announcements of the SAME key (default: SYNC_DEBOUNCE_MS).
 * @returns            true when the change should be announced; false when it should be suppressed.
 */
export function shouldAnnounceSyncChange(
	prevKey: string | null,
	nextKey: string,
	lastMs: number,
	nowMs: number,
	debounceMs: number = SYNC_DEBOUNCE_MS,
): boolean {
	// Never suppress a key that is truly different from the previous announcement.
	if (prevKey !== nextKey) return true;
	// Same key: suppress if we are still within the debounce window.
	return nowMs - lastMs >= debounceMs;
}

// ---------------------------------------------------------------------------
// Session events
// ---------------------------------------------------------------------------

/**
 * A11Y-006 — build a CONCISE live announcement for a live-session status change (COLLAB-003).
 * Returns '' for the nominal 'live' state so screen readers are not spammed when everything is
 * working normally; only degraded/stale/reconnecting transitions are announced.
 */
export function sessionStatusAnnouncement(status: string, stale: boolean): string {
	if (!stale && status === 'live') return '';
	if (stale) return `Session view may be out of date: ${status}.`;
	return `Session: ${status}.`;
}
