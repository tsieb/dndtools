import { hasDmAuthority } from '../state/permission-state';
import type { PermissionState } from '../state/permission-state';
import type { ActorId } from '../state/ids';
import type { SessionQuickTimer } from '../state/session-state';
import { getTimerCountdown, type TimerCountdownView } from './timer-countdown';

/**
 * RC-SES-4.4 — the ACTOR-SCOPED view of the quick-panel timer (SES-002: actor-scoped reads only, the
 * core decides what a player sees). A DM gets the full control surface (the raw document + the
 * derived countdown, for either kind). A player gets nothing for a COUNTDOWN — it is a DM-only
 * pacing tool — but sees a `breakCard` while the DM is running a BREAK, so the table knows when play
 * resumes without the DM announcing it out loud.
 */
export interface QuickTimerView {
	/** Present only for a DM/co-DM; null for a player regardless of what timer is running. */
	control: { timer: SessionQuickTimer; countdown: TimerCountdownView } | null;
	/** The player-facing "Back in M:SS" card, present only while a BREAK timer is running or paused. */
	breakCard: { display: string; label: string | null } | null;
}

export function getQuickTimerForActor(
	quickTimer: SessionQuickTimer | null,
	permissions: PermissionState,
	actorId: ActorId,
	nowIso: string,
): QuickTimerView {
	const isDm = hasDmAuthority(permissions.actors[actorId]?.role);
	if (!quickTimer) return { control: null, breakCard: null };

	// getTimerCountdown is keyed to the per-widget SessionTimer shape; the quick timer has no scene/
	// widget of its own, so the fields it never reads are filled with harmless placeholders.
	const countdown = getTimerCountdown(
		{
			id: quickTimer.id,
			sceneId: '',
			widgetInstanceId: quickTimer.id,
			status: quickTimer.status,
			durationSeconds: quickTimer.durationSeconds,
			startedAt: quickTimer.startedAt,
			revision: quickTimer.revision,
		},
		nowIso,
		quickTimer.durationSeconds,
	);

	const control = isDm ? { timer: quickTimer, countdown } : null;
	const breakCard =
		quickTimer.kind === 'break' && countdown.status !== 'stopped'
			? { display: countdown.display, label: quickTimer.label }
			: null;
	return { control, breakCard };
}
