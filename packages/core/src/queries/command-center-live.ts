import type { ActorId } from '../state/ids';
import type { PermissionState } from '../state/permission-state';
import type { SessionState, SessionWorkflowState } from '../state/session-state';
import type { VaultContentState } from '../state/content';
import { isTransitionAllowed } from '../lifecycle/session-workflow';
import { getContentItemsForActor } from './content-query';

/**
 * UX-CMD-006 / UX-CMD-007 / UX-CMD-010 — the Command Center LIVE-CONTROL read models.
 *
 * The Command Center's live controls (phase transitions, handout push, active-map projection) are the
 * hot-path surfaces a DM operates under table pressure — and the exact places an accidental reveal
 * happens. This module is the Processing-Core side of those controls, all fail-closed and DM-gated:
 *
 *   - {@link listSessionPhaseActions} — the VALID next-phase transitions from the current workflow as
 *     labeled actions with their confirmation contract (pause/resume immediate, start/archive one
 *     confirmation, end-session a hard two-step — UX-CMD-010). Invalid transitions are ABSENT, never
 *     disabled; a non-DM actor receives an empty list so the controls cannot exist for them.
 *   - {@link listPushableContent} — the vault content the DM may PUSH to player canvases
 *     (UX-CMD-006). Default-deny: ONLY `player-visible` items qualify. A `dm-only` note is never
 *     listed (UX-CMD-006 AC4), and `shared` items are excluded too because their audience is a
 *     specific grant list — pushing one to arbitrary recipients could over-deliver (fail closed).
 *   - {@link resolvePushHandoutCommand} — turns a pushable item + recipients into the EXACT
 *     `session.deliver-handout` command the handout surface dispatches, so the push flow and the
 *     command palette share one validated delivery path (UX-CMD-011 parity, Contract 1).
 *   - {@link getActiveMapProjectionSummary} — the DM-only "Projecting / Not projecting" glance state
 *     for the active-map embed (UX-CMD-007), derived from the durable per-player projection records.
 *
 * Pure + deterministic: functions of (state, actor) only. No GUI, no storage, no clock.
 */

/** How a phase action must be confirmed before it dispatches (UX-CMD-010 §spec). */
export type PhaseActionConfirmation = 'none' | 'confirm' | 'double-confirm';

/** One valid session phase transition, presented as a labeled Command Center action. */
export interface SessionPhaseAction {
	/** Stable id, `cc.session.phase:<target>`. */
	id: string;
	label: string;
	targetWorkflow: SessionWorkflowState;
	confirmation: PhaseActionConfirmation;
	/** Confirmation dialog title/body; `null` for immediate (no-confirmation) actions. */
	confirmTitle: string | null;
	confirmBody: string | null;
	/**
	 * For the two-step "End session" flow only: the SECOND transition (ending → recap) the GUI offers
	 * in dialog 2 after the first transition lands (UX-CMD-010 AC2). `null` everywhere else.
	 */
	followUpWorkflow: SessionWorkflowState | null;
	/** The `aria-live` announcement after the transition lands. */
	announcement: string;
}

interface PhasePresentation {
	label: string;
	confirmation: PhaseActionConfirmation;
	confirmTitle: string | null;
	confirmBody: string | null;
	followUpWorkflow: SessionWorkflowState | null;
	announcement: string;
}

/**
 * The spec'd phase actions, keyed `<from>-><to>`. Only the transitions UX-CMD-010 names appear in the
 * popover; the full workflow matrix stays available on the session-workflow toolbar. Confirmation
 * levels follow the spec: pause/resume/recap immediate; start + archive one confirmation; end-session
 * a hard TWO-step (dialog 1 confirms `ending`, dialog 2 moves to `recap`).
 */
const PHASE_ACTION_PRESENTATION: Readonly<Record<string, PhasePresentation>> = Object.freeze({
	'idle->prep': {
		label: 'Prepare session',
		confirmation: 'none',
		confirmTitle: null,
		confirmBody: null,
		followUpWorkflow: null,
		announcement: 'Session moved to prep.',
	},
	'idle->active': {
		label: 'Start session',
		confirmation: 'confirm',
		confirmTitle: 'Start session?',
		confirmBody: 'Connected players will see the active scene.',
		followUpWorkflow: null,
		announcement: 'Session active. Players have been notified.',
	},
	'prep->active': {
		label: 'Start session',
		confirmation: 'confirm',
		confirmTitle: 'Start session?',
		confirmBody: 'Connected players will see the active scene.',
		followUpWorkflow: null,
		announcement: 'Session active. Players have been notified.',
	},
	'active->paused': {
		label: 'Pause session',
		confirmation: 'none',
		confirmTitle: null,
		confirmBody: null,
		followUpWorkflow: null,
		announcement: 'Session paused. Players see the paused screen.',
	},
	'paused->active': {
		label: 'Resume session',
		confirmation: 'none',
		confirmTitle: null,
		confirmBody: null,
		followUpWorkflow: null,
		announcement: 'Session resumed.',
	},
	'active->ending': {
		label: 'End session',
		confirmation: 'double-confirm',
		confirmTitle: 'End this session?',
		confirmBody: 'Live play stops for every participant. You can review everything in the recap.',
		followUpWorkflow: 'recap',
		announcement: 'Session ending. Players have been notified.',
	},
	'paused->ending': {
		label: 'End session',
		confirmation: 'double-confirm',
		confirmTitle: 'End this session?',
		confirmBody: 'Live play stops for every participant. You can review everything in the recap.',
		followUpWorkflow: 'recap',
		announcement: 'Session ending. Players have been notified.',
	},
	'ending->recap': {
		label: 'Open recap',
		confirmation: 'none',
		confirmTitle: null,
		confirmBody: null,
		followUpWorkflow: null,
		announcement: 'Session recap is open.',
	},
	'ending->active': {
		label: 'Resume session',
		confirmation: 'none',
		confirmTitle: null,
		confirmBody: null,
		followUpWorkflow: null,
		announcement: 'Session resumed.',
	},
	'recap->archived': {
		label: 'Archive session',
		confirmation: 'confirm',
		confirmTitle: 'Archive this session?',
		confirmBody: 'It will be read-only.',
		followUpWorkflow: null,
		announcement: 'Session archived.',
	},
	'archived->prep': {
		label: 'Prepare next session',
		confirmation: 'none',
		confirmTitle: null,
		confirmBody: null,
		followUpWorkflow: null,
		announcement: 'Session moved to prep.',
	},
});

/** The popover ordering of the spec'd targets (stable, glanceable). */
const PHASE_ACTION_ORDER: readonly SessionWorkflowState[] = Object.freeze([
	'active',
	'paused',
	'ending',
	'recap',
	'archived',
	'prep',
]);

/**
 * UX-CMD-010 — the valid, spec'd phase transitions from the CURRENT workflow as labeled actions.
 * Invalid transitions are hidden (absent), not disabled. DM-only, fail closed: a player/observer (or
 * unknown actor) receives `[]`, so the phase controls never exist for a non-DM home.
 */
/** The state slices the live-control read models need. `CoreStateSlice` satisfies this structurally. */
export interface CommandCenterLiveStateView {
	session: SessionState;
	permissions: PermissionState;
}

export function listSessionPhaseActions(
	state: CommandCenterLiveStateView,
	actorId: ActorId,
): SessionPhaseAction[] {
	const actor = state.permissions.actors[actorId];
	if (!actor || actor.role !== 'dm') return [];

	const from = state.session.workflow;
	const actions: SessionPhaseAction[] = [];
	for (const target of PHASE_ACTION_ORDER) {
		if (target === from) continue;
		const presentation = PHASE_ACTION_PRESENTATION[`${from}->${target}`];
		if (!presentation) continue;
		// Belt-and-braces: the presentation table only names legal pairs, but the transition table
		// stays the single source of truth (a presentation entry can never enable an illegal move).
		if (!isTransitionAllowed(from, target)) continue;
		actions.push({
			id: `cc.session.phase:${target}`,
			targetWorkflow: target,
			...presentation,
		});
	}
	return actions;
}

/** One vault content item the DM may push to player canvases (already player-safe). */
export interface PushableContentItem {
	id: string;
	title: string;
	kind: string;
	/** The item body delivered as the handout section content. */
	body: string;
}

/**
 * UX-CMD-006 — the vault content offered by the "Push to players" content selector. DEFAULT-DENY:
 * only `player-visible` items are pushable. A hidden `dm-only` note is NEVER listed (AC4), and
 * `shared` items are excluded too — their audience is a specific grant list, so pushing one to an
 * arbitrary recipient set could deliver beyond its grants (fail closed). DM-only: any other actor
 * receives `[]` (the push flow cannot exist for them).
 */
export function listPushableContent(
	state: { content: VaultContentState; permissions: PermissionState },
	actorId: ActorId,
): PushableContentItem[] {
	const actor = state.permissions.actors[actorId];
	if (!actor || actor.role !== 'dm') return [];
	return getContentItemsForActor(state.content, state.permissions, actorId)
		.filter((item) => item.visibility === 'player-visible')
		.map((item) => ({ id: item.id, title: item.title, kind: item.kind, body: item.body }))
		.sort((a, b) => a.title.localeCompare(b.title));
}

/** The dispatch-ready push command (sans actorId/idempotencyKey, like ResolvedCommandAction). */
export interface ResolvedPushHandoutCommand {
	type: 'session.deliver-handout';
	payload: {
		title: string;
		sceneId: string;
		recipientActorIds: string[];
		groupIds: string[];
		sections: Array<{ id: string; heading: string; body: string; visibility: 'player-visible' }>;
		revealedSectionIds: string[];
		connectionState: 'connected';
	};
}

/**
 * UX-CMD-006 / UX-CMD-011 — resolve a pushable item + recipients to the EXACT `session.deliver-handout`
 * command the handout surface dispatches (one validated delivery path for the push flow AND the
 * command palette). Returns `null` when nothing would be delivered (no recipients), so a caller can
 * never dispatch an empty push. The section is delivered `player-visible` — the item was already
 * player-visible, so the push reveals nothing new.
 */
export function resolvePushHandoutCommand(
	item: PushableContentItem,
	recipientActorIds: ActorId[],
	sceneId: string,
): ResolvedPushHandoutCommand | null {
	if (recipientActorIds.length === 0 || !sceneId) return null;
	return {
		type: 'session.deliver-handout',
		payload: {
			title: item.title,
			sceneId,
			recipientActorIds: [...recipientActorIds],
			groupIds: [],
			sections: [
				{
					id: `push-${item.id}`,
					heading: item.title,
					body: item.body,
					visibility: 'player-visible',
				},
			],
			revealedSectionIds: [],
			connectionState: 'connected',
		},
	};
}

/** The DM-only glance state of the active-map projection (UX-CMD-007 "Projecting" indicator). */
export interface ActiveMapProjectionSummary {
	/** True when at least one player currently holds a DELIVERED projection of the active map+region. */
	projecting: boolean;
	deliveredCount: number;
	queuedCount: number;
}

/**
 * UX-CMD-007 — whether the CURRENT active map (map + region) is projected to players, from the durable
 * per-player projection records. A projection of a previously-active map does not count (the embed
 * shows "Projecting" only while what players hold matches what the DM sees). DM-only; `null` for any
 * other actor, fail closed.
 */
export function getActiveMapProjectionSummary(
	state: CommandCenterLiveStateView,
	actorId: ActorId,
): ActiveMapProjectionSummary | null {
	const actor = state.permissions.actors[actorId];
	if (!actor || actor.role !== 'dm') return null;
	const active = state.session.activeMap;
	if (!active) return { projecting: false, deliveredCount: 0, queuedCount: 0 };

	let deliveredCount = 0;
	let queuedCount = 0;
	for (const projection of Object.values(state.session.activeMapProjections)) {
		if (projection.mapId !== active.mapId || projection.regionId !== active.regionId) continue;
		if (projection.deliveryStatus === 'delivered') deliveredCount += 1;
		else queuedCount += 1;
	}
	return { projecting: deliveredCount > 0, deliveredCount, queuedCount };
}
