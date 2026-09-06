import { useEffect, useState } from 'react';
import type { CoreStateSlice } from '@dndtools/core';
import { useRuntime } from '../../runtime/RuntimeContext';

/**
 * RC-SES-1.1 — the shell's SESSION POSTURE: is the table live, and for how long.
 *
 * The whole shell changes shape while `session.workflow === 'active'` (the Session nav item pulses,
 * the desktop right rail opens, the phone grows a status strip, the top bar says so), so all four
 * surfaces read the one derivation here rather than each re-deriving "live" from a different field.
 * Before this the sidebar and the rail both used `session.activeSceneId != null`, which is a
 * different question — a scene stays selected through Standby, so the shell claimed LIVE while the
 * Core was refusing every session command.
 *
 * WHERE THE CLOCK COMES FROM. `SessionState` has no `liveSinceAt`, and adding one is a core change
 * this story does not own, so the start instant is READ BACK off the durable operation log: the last
 * `session.set-workflow` operation that moved the workflow to `active` carries the `issuedAt` the
 * Core stamped. That log is persisted and rehydrated, so the elapsed time survives a reload — and
 * when no such operation is present (a state restored without its log) there is simply no clock
 * rather than a fabricated one.
 */

const SET_WORKFLOW_OP = 'session.set-workflow';

/** The ISO instant the session last went live, or null when it is not live (or the log has no record). */
export function sessionLiveSinceAt(state: CoreStateSlice): string | null {
	if (state.session.workflow !== 'active') return null;
	const operations = state.sync.operations;
	for (let i = operations.length - 1; i >= 0; i -= 1) {
		const op = operations[i]!;
		if (op.opType !== SET_WORKFLOW_OP) continue;
		const value = op.value as { to?: unknown } | undefined;
		if (value?.to !== 'active') continue;
		return typeof op.issuedAt === 'string' && op.issuedAt.length > 0 ? op.issuedAt : null;
	}
	return null;
}

/**
 * Elapsed milliseconds as a clock: `mm:ss` under an hour, `h:mm:ss` beyond it. Digits are padded so
 * the label has a stable width and the top bar does not reflow on every tick. A negative input (a
 * device clock behind the stamped instant) reads as `00:00` rather than a minus sign.
 */
export function formatElapsed(milliseconds: number): string {
	const total = Math.max(0, Math.floor(milliseconds / 1000));
	const seconds = total % 60;
	const minutes = Math.floor(total / 60) % 60;
	const hours = Math.floor(total / 3600);
	const mm = String(minutes).padStart(2, '0');
	const ss = String(seconds).padStart(2, '0');
	return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export interface SessionPosture {
	/** True while the Core's session workflow is `active`. */
	live: boolean;
	/** The instant the session went live, or null. */
	liveSinceAt: string | null;
	/** The running clock (`01:12`), or null when live with no recorded start instant. */
	elapsed: string | null;
}

/**
 * Subscribe to the session posture. The one-second interval only runs while the session is live and
 * a start instant is known, so an idle app schedules no timer at all.
 */
export function useSessionPosture(): SessionPosture {
	const runtime = useRuntime();
	const liveSinceAt = sessionLiveSinceAt(runtime.state);
	const live = runtime.state.session.workflow === 'active';
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (!liveSinceAt) return;
		setNow(Date.now());
		const handle = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(handle);
	}, [liveSinceAt]);
	if (!live || !liveSinceAt) return { live, liveSinceAt: null, elapsed: null };
	const startedAt = Date.parse(liveSinceAt);
	if (Number.isNaN(startedAt)) return { live, liveSinceAt, elapsed: null };
	return { live, liveSinceAt, elapsed: formatElapsed(now - startedAt) };
}
