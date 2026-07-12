import { hasDmAuthority } from '../state/permission-state';
import type { ActorId } from '../state/ids';
import type { PermissionState } from '../state/permission-state';
import type { SessionState } from '../state/session-state';
import type { SceneState } from '../state/scene-state';
import type { MapState } from '../state/map-state';
import { getCombatTrackerForActor } from './combat-tracker-view';

/**
 * UX-SES-002 — the SESSION RECOVERY read model.
 *
 * When the application restarts (vault open) during an `active` or `paused` session, the GUI must
 * either confirm a full restore or present an explicit recovery prompt BEFORE the DM interacts with
 * any session tool. This query computes that decision deterministically from durable state:
 *
 *   - `none`     — no live session to recover (workflow is not active/paused), or the viewer is not
 *                  the DM (the recovery prompt is a DM session-tool surface; players/observers never
 *                  see restore internals — fail closed, no leak of session internals).
 *   - `restored` — a live session was found and every cross-referenced item resolves: the GUI shows
 *                  a non-blocking "Session restored" confirmation (UX-SES-002 AC1 full-restore arm).
 *   - `partial`  — a live session was found but one or more referenced items could NOT be resolved
 *                  (active scene/map records missing, combat order naming unknown combatants, or an
 *                  out-of-range turn position). The GUI must show the MODAL recovery banner naming
 *                  each missing item (UX-SES-002 AC2/AC3) before any session tool is interactive.
 *
 * The active-combatant name is taken from the actor-filtered tracker view, so even this DM-facing
 * summary flows through the sanctioned visibility choke point (Architecture Contract 3).
 *
 * Pure + deterministic: a function of (state, actorId) only. No GUI, no storage, no clock.
 */

/** A state slice view sufficient to compute session recovery. `CoreStateSlice` satisfies this. */
export interface SessionRecoveryStateView {
	session: SessionState;
	permissions: PermissionState;
	scenes: SceneState;
	maps: MapState;
}

export interface SessionRecoveryPrompt {
	/** `none` (no prompt), `restored` (full restore confirmation), or `partial` (modal recovery). */
	kind: 'none' | 'restored' | 'partial';
	workflow: SessionState['workflow'];
	/** Combat round when combat is running, else null. */
	round: number | null;
	/** The active combatant's (viewer-filtered) name when combat is running, else null. */
	activeCombatantName: string | null;
	/** Human summaries of what WAS restored (e.g. "Combat — round 2, 3 combatants"). */
	restoredItems: string[];
	/** UX-SES-002 AC3 — the specific item(s) that could not be restored. Empty for full restores. */
	missingItems: string[];
}

const NO_PROMPT: SessionRecoveryPrompt = Object.freeze({
	kind: 'none',
	workflow: 'idle',
	round: null,
	activeCombatantName: null,
	restoredItems: [],
	missingItems: [],
}) as SessionRecoveryPrompt;

/**
 * UX-SES-002 — compute the recovery prompt for a restart during a live (`active`/`paused`) session.
 * DM-gated fail closed: any other (or unknown) actor receives `kind: 'none'`.
 */
export function getSessionRecoveryPrompt(
	state: SessionRecoveryStateView,
	actorId: ActorId,
): SessionRecoveryPrompt {
	const actor = state.permissions.actors[actorId];
	if (!actor || !hasDmAuthority(actor.role)) return NO_PROMPT;

	const session = state.session;
	if (session.workflow !== 'active' && session.workflow !== 'paused') {
		return { ...NO_PROMPT, workflow: session.workflow };
	}

	const restoredItems: string[] = [];
	const missingItems: string[] = [];

	// Active scene: the live session references its active scene by id. A dangling reference means
	// the scene record could not be restored.
	if (session.activeSceneId !== null) {
		if (state.scenes.scenes[session.activeSceneId]) {
			restoredItems.push('Active scene');
		} else {
			missingItems.push('Active scene');
		}
	}

	// Active map selection (when set): the referenced map record must exist.
	if (session.activeMap !== null) {
		if (state.maps.maps[session.activeMap.mapId]) {
			restoredItems.push('Active map');
		} else {
			missingItems.push('Active map');
		}
	}

	// Combat: when running, every id in the initiative order must resolve to a combatant record and
	// the turn position must point inside the order.
	const combat = session.combat;
	let round: number | null = null;
	let activeCombatantName: string | null = null;
	if (combat.status === 'running') {
		round = combat.round;
		const missingCombatants = combat.order.filter((id) => !combat.combatants[id]);
		const turnInRange = combat.turn >= 0 && combat.turn < combat.order.length;
		if (missingCombatants.length > 0) {
			missingItems.push(
				`Combat order (${missingCombatants.length} combatant record${
					missingCombatants.length === 1 ? '' : 's'
				} missing)`,
			);
		}
		if (!turnInRange) missingItems.push('Combat turn position');
		if (missingCombatants.length === 0 && turnInRange) {
			restoredItems.push(`Combat — round ${combat.round}, ${combat.order.length} combatant(s)`);
		}
		// The active combatant's name flows through the actor-filtered tracker view (the single
		// sanctioned combat read path), never the raw record.
		const tracker = getCombatTrackerForActor(combat, state.permissions, actorId);
		const active = tracker.combatants.find((row) => row.isActive) ?? null;
		activeCombatantName = active?.name ?? null;
	}

	// Self-contained live collections restore with their slice; summarize them for "View details".
	if (session.diceHistory.length > 0) {
		restoredItems.push(`Dice history (${session.diceHistory.length} roll(s))`);
	}
	const timerCount = Object.keys(session.timers).length;
	if (timerCount > 0) restoredItems.push(`Timers (${timerCount})`);
	const handoutCount = Object.keys(session.handouts).length;
	if (handoutCount > 0) restoredItems.push(`Handout log (${handoutCount})`);

	return {
		kind: missingItems.length > 0 ? 'partial' : 'restored',
		workflow: session.workflow,
		round,
		activeCombatantName,
		restoredItems,
		missingItems,
	};
}
