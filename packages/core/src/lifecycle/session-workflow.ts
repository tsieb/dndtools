import type { CoreCommand } from '../commands/types';
import type { SessionWorkflowState } from '../state/session-state';
import { SESSION_WORKFLOW_STATES } from '../state/session-state';

/**
 * SES-011: the SESSION WORKFLOW STATE MACHINE.
 *
 * The seven session workflow states are `idle`, `prep`, `active`, `paused`, `ending`, `recap`, and
 * `archived` (the canonical set defined in `state/session-state.ts`). This module is the SINGLE pure
 * Processing-Core policy that decides which workflow transitions are allowed and which session
 * commands are available in each state. It is deterministic and depends on no DOM/storage/GUI — the
 * GUI dispatches a transition intent and renders the computed availability; it never decides policy
 * (Contract 1).
 *
 * COMPATIBILITY INVARIANT (do not break): `active` remains the ONLY state in which the existing
 * session-writing commands (combat / dice / handouts / timers / active-map projection) are accepted.
 * The per-command guards in `commands/*.ts` still check `state.session.workflow === 'active'`; this
 * machine formalizes the surrounding lifecycle without changing that gate's meaning. The command
 * availability table below is kept consistent with those guards and is regression-tested.
 */

/**
 * The explicit ALLOWED-TRANSITION table. A transition `from → to` is allowed only if `to` is listed
 * for `from`. Every state may transition to itself (an idempotent re-assert of the same state — the
 * existing GUI re-clicks the active button, and self-transitions never destabilize live state). Any
 * pair NOT listed is rejected fail-closed by {@link isTransitionAllowed}.
 *
 * Rationale per source state:
 * - `idle`: no live session. Start prep, or jump straight to active (the existing default start), or
 *   recover an archived session.
 * - `prep`: pre-session prep. Go live (active), abandon back to idle, or recover an archive.
 * - `active`: the live session. Pause, wind down (ending), jump straight to recap, or reset to idle.
 * - `paused`: temporarily suspended. Resume (active), wind down (ending), recap, or reset to idle.
 * - `ending`: winding down. Move to recap, re-open back to active, or reset to idle.
 * - `recap`: post-session review (the live state was archived on entry). Archive durably, start fresh
 *   (idle), or recover the archive back into review.
 * - `archived`: durable archive. Start a fresh session (idle/prep) or RECOVER the archived session.
 */
export const SESSION_WORKFLOW_TRANSITIONS: Readonly<
	Record<SessionWorkflowState, readonly SessionWorkflowState[]>
> = Object.freeze({
	idle: Object.freeze<SessionWorkflowState[]>(['idle', 'prep', 'active', 'recap', 'archived']),
	prep: Object.freeze<SessionWorkflowState[]>(['prep', 'active', 'idle', 'archived']),
	active: Object.freeze<SessionWorkflowState[]>(['active', 'paused', 'ending', 'recap', 'idle']),
	paused: Object.freeze<SessionWorkflowState[]>(['paused', 'active', 'ending', 'recap', 'idle']),
	ending: Object.freeze<SessionWorkflowState[]>(['ending', 'recap', 'active', 'idle']),
	recap: Object.freeze<SessionWorkflowState[]>(['recap', 'archived', 'idle']),
	archived: Object.freeze<SessionWorkflowState[]>(['archived', 'idle', 'prep', 'active', 'recap']),
});

/** Whether `to` is an allowed transition from `from` (fail-closed: unknown pairs are not allowed). */
export function isTransitionAllowed(
	from: SessionWorkflowState,
	to: SessionWorkflowState,
): boolean {
	return SESSION_WORKFLOW_TRANSITIONS[from].includes(to);
}

/** The workflow states reachable from `from` in a single transition. */
export function allowedTransitionsFrom(
	from: SessionWorkflowState,
): readonly SessionWorkflowState[] {
	return SESSION_WORKFLOW_TRANSITIONS[from];
}

/**
 * The named SESSION LIFECYCLE INTENTS (SES-001). Each is a durable, validated transition. `recover`
 * is the restore path: it moves a non-live session (`archived`/`recap`) back into review (`recap`) so
 * the recovered live state is read-only inputs (SES-011 AC2) until the DM explicitly re-opens it.
 */
export type SessionLifecycleIntent =
	| 'start' // begin a live session
	| 'prep' // open pre-session prep
	| 'pause' // suspend a live session
	| 'resume' // resume a paused session
	| 'end' // wind a session down
	| 'recap' // move to post-session recap (archives live state)
	| 'archive' // durably archive the recap
	| 'recover' // restore an archived session into recap review
	| 'reset'; // clear back to idle

/** The target workflow each lifecycle intent transitions INTO. */
export const SESSION_INTENT_TARGET: Readonly<Record<SessionLifecycleIntent, SessionWorkflowState>> =
	Object.freeze({
		start: 'active',
		prep: 'prep',
		pause: 'paused',
		resume: 'active',
		end: 'ending',
		recap: 'recap',
		archive: 'archived',
		recover: 'recap',
		reset: 'idle',
	});

/**
 * Whether a lifecycle intent is allowed from the current workflow state. `recover` is additionally
 * gated: it is only meaningful from a non-live session that has an archive to restore, which the
 * lifecycle command enforces (this table only checks the transition shape).
 */
export function isLifecycleIntentAllowed(
	from: SessionWorkflowState,
	intent: SessionLifecycleIntent,
): boolean {
	return isTransitionAllowed(from, SESSION_INTENT_TARGET[intent]);
}

/**
 * The COMMAND-AVAILABILITY categories for session commands. A category groups command types by the
 * workflow rule that governs them:
 * - `live-session`: session-writing commands accepted ONLY while `active` (combat / dice / handouts /
 *   timers / active-map projection). This is the existing active-session gate, formalized here.
 * - `lifecycle`: the workflow transition command itself; always available (it is how you leave a
 *   state). Whether a SPECIFIC transition is allowed is decided by the transition table, not here.
 * - `dm-admin`: DM authoring/admin session commands that are available in any non-idle workflow
 *   (player-view projection, active-map selection, quick-reference pinning, calendar continuity).
 *   These do not require the live `active` gate but are not meaningful with no session at all.
 * - `always`: commands not tied to a live session (e.g. reading recap; calendar continuity is
 *   campaign-level). Available in every workflow state including `idle`.
 */
export type SessionCommandAvailability = 'live-session' | 'lifecycle' | 'dm-admin' | 'always';

/**
 * The session command types this machine governs, mapped to their availability category. Command
 * types NOT listed here are governed by their own slice policy (this map covers the session domain).
 * The `live-session` set MUST stay in lockstep with the `workflow === 'active'` guards in
 * `commands/*.ts` — the regression test asserts both agree.
 */
export const SESSION_COMMAND_AVAILABILITY: Partial<
	Record<CoreCommand['type'], SessionCommandAvailability>
> = Object.freeze({
	// Lifecycle transition — always dispatchable; the transition table decides if the move is legal.
	'session.set-workflow': 'lifecycle',
	// Live-session writes: accepted only while `active` (the existing gate).
	'session.record-dice': 'live-session',
	'dice.roll': 'live-session',
	'dice.roll-table': 'live-session',
	'combat.start': 'live-session',
	'combat.advance-turn': 'live-session',
	'combat.apply-resource': 'live-session',
	'combat.end': 'live-session',
	'session.deliver-handout': 'live-session',
	'session.reveal-handout-section': 'live-session',
	'session.project-active-map': 'live-session',
	'character.update-combat-resource': 'live-session',
	// DM admin session commands: available in any non-idle workflow.
	'session.project-player-view': 'dm-admin',
	'session.revoke-player-view': 'dm-admin',
	'session.set-active-map': 'dm-admin',
	'session.pin-quick-reference': 'dm-admin',
	'session.unpin-quick-reference': 'dm-admin',
	// Campaign calendar continuity is campaign-level (never reset between sessions), so it is always
	// available regardless of the live workflow.
	'session.set-campaign-date': 'always',
	'session.link-calendar-date': 'always',
	'session.unlink-calendar-date': 'always',
});

/**
 * Whether a governed session command is AVAILABLE in the given workflow state (SES-011 per-state
 * command availability). Fail-closed: a command whose category is unknown to this machine is reported
 * unavailable here (its own slice still enforces the authoritative policy). This is a pure predicate
 * the GUI can use to disable controls; the Processing-Core command guards remain authoritative.
 */
export function isSessionCommandAvailable(
	commandType: CoreCommand['type'],
	workflow: SessionWorkflowState,
): boolean {
	const availability = SESSION_COMMAND_AVAILABILITY[commandType];
	if (!availability) return false;
	switch (availability) {
		case 'always':
			return true;
		case 'lifecycle':
			return true;
		case 'live-session':
			return workflow === 'active';
		case 'dm-admin':
			return workflow !== 'idle';
	}
}

/** The governed session command types available in the given workflow state, sorted for stability. */
export function availableSessionCommands(
	workflow: SessionWorkflowState,
): CoreCommand['type'][] {
	return (Object.keys(SESSION_COMMAND_AVAILABILITY) as CoreCommand['type'][])
		.filter((type) => isSessionCommandAvailable(type, workflow))
		.sort();
}

/** Re-export the canonical state list so callers can import the machine surface from one module. */
export { SESSION_WORKFLOW_STATES };
