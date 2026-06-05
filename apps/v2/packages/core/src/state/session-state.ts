import type { ActorId, SceneId, SectionId, WidgetInstanceId } from './ids';
import {
	EMPTY_SESSION_COMBAT_STATE as EMPTY_COMBAT_TRACKER_STATE,
	type SessionCombatState,
} from './combat-tracker';
import type { ActorRole } from './permission-state';
import type { EvaluatedTerm } from './dice';

export const SESSION_STATE_SCHEMA_VERSION = 1 as const;

// SES-002 — the full combat-tracker state now lives in `combat-tracker.ts` (initiative order, rounds,
// turns, per-combatant resources, stat-block previews, encounter log). Re-exported here so existing
// session-state importers keep their import site while the model is owned by the SES combat slice.
export type { SessionCombatState } from './combat-tracker';
export { EMPTY_SESSION_COMBAT_STATE } from './combat-tracker';

export type SessionWorkflowState =
	| 'idle'
	| 'prep'
	| 'active'
	| 'paused'
	| 'ending'
	| 'recap'
	| 'archived';

export const SESSION_WORKFLOW_STATES: readonly SessionWorkflowState[] = Object.freeze([
	'idle',
	'prep',
	'active',
	'paused',
	'ending',
	'recap',
	'archived',
]);

export interface SessionTimer {
	id: string;
	sceneId: SceneId;
	widgetInstanceId: WidgetInstanceId;
	status: 'idle' | 'running' | 'paused';
	durationSeconds: number;
	startedAt: string | null;
	revision: number;
}

/**
 * The VISIBILITY of a recorded roll (SES-003 AC3/AC4). `session-visible` is the v2 player-visible
 * default for a roll made in session; `dm-only` is a secret/DM-only roll never exposed to players;
 * `shared` is delivered only to the explicitly listed participants. Fails closed: an unknown value is
 * treated as `dm-only` by the read filter.
 */
export type DiceRollVisibility = 'session-visible' | 'dm-only' | 'shared';

export const DICE_ROLL_VISIBILITIES: readonly DiceRollVisibility[] = Object.freeze([
	'session-visible',
	'dm-only',
	'shared',
]);

/** How a recorded roll was produced: a free dice expression/macro/inline, or a rollable-table draw. */
export type DiceRollSourceKind = 'expression' | 'macro' | 'inline' | 'table';

/**
 * SES-003 / SES-008 — ONE durable, REPRODUCIBLE roll in the session ROLL HISTORY.
 *
 * The random OUTCOME is computed ONCE in the Processing Core and stored here, so every participant sees
 * the SAME result and the roll is reproducible by replaying `seed` + `expression` (Contract 2). The
 * record carries the dice, kept values, modifier, total, per-term breakdown, the actor (+ role) that
 * rolled, a timestamp, the visibility, and — for a table draw (SES-008) — the table source + selected
 * row, plus optional attribution of the note the result was appended to.
 *
 * Back-compat: the recorded fields beyond the original `expression`/`total` are OPTIONAL so a record
 * persisted by the legacy `session.record-dice` command (manual total, no draw) hydrates safely.
 */
export interface SessionDiceRoll {
	id: string;
	actorId: ActorId;
	/** The actor role at roll time (for the read filter; back-compat optional). */
	actorRole?: ActorRole;
	/** The canonical dice expression rolled. */
	expression: string;
	/** The grand total. */
	total: number;
	rolledAt: string;
	/** How the roll was produced. Absent ⇒ a legacy manual record (`expression`). */
	sourceKind?: DiceRollSourceKind;
	/** The 32-bit seed the dice were drawn from; recording it makes the roll reproducible. */
	seed?: number;
	/** The kept dice values that counted toward the total, in roll order. */
	dice?: number[];
	/** The kept values (same as {@link dice} after keep policy). */
	kept?: number[];
	/** The flat modifier sum (signed). */
	modifier?: number;
	/** The full per-term evaluation (dice with kept flags, constants). */
	terms?: EvaluatedTerm[];
	/** The roll's visibility. Absent ⇒ fails closed to `session-visible` on hydrate for legacy records. */
	visibility?: DiceRollVisibility;
	/** For a `shared` roll, the participant actor ids it is delivered to. */
	sharedWith?: ActorId[];
	/** A short optional human label/reason (e.g. "Stealth check"). Withheld from non-recipients. */
	label?: string;
	/** For a table draw (SES-008): the `dice-table` content item id the draw resolved against. */
	tableItemId?: string;
	/** For a table draw: the 1-based row selected and its text. */
	tableRowNumber?: number;
	tableRowText?: string;
	/** SES-008 attribution: the note this result was appended to, when it was (else absent). */
	appendedToItemId?: string;
	/** The op id this roll record corresponds to, for traceability against the sync log. */
	operationId?: string;
}

export interface SessionActiveMapSelection {
	mapId: string;
	regionId: string | null;
	sceneId: SceneId;
	widgetInstanceId: WidgetInstanceId;
	updatedBy: ActorId;
	updatedAt: string;
	revision: number;
}

export type ActiveMapDeliveryStatus = 'delivered' | 'queued';

export interface SessionActiveMapProjection {
	id: string;
	playerActorId: ActorId;
	mapId: string;
	regionId: string | null;
	deliveryStatus: ActiveMapDeliveryStatus;
	deliveryReason: 'connected' | 'offline';
	createdBy: ActorId;
	createdAt: string;
	updatedAt: string;
	revision: number;
}

export type PlayerViewProjectionKind =
	| 'scene'
	| 'widget-subset'
	| 'handout'
	| 'map-region'
	| 'display-state';

export type PlayerViewDeliveryStatus = 'delivered' | 'queued';

export interface PlayerViewProjectionTarget {
	kind: PlayerViewProjectionKind;
	sceneId: SceneId;
	sectionIds: SectionId[] | null;
	widgetInstanceIds: WidgetInstanceId[] | null;
	displayState: Record<string, unknown> | null;
	mapRegion: { mapId: string; regionId: string } | null;
}

export interface SessionPlayerViewAssignment {
	id: string;
	playerActorId: ActorId;
	target: PlayerViewProjectionTarget;
	deliveryStatus: PlayerViewDeliveryStatus;
	deliveryReason: 'connected' | 'offline';
	createdBy: ActorId;
	createdAt: string;
	updatedAt: string;
	revision: number;
}

export interface SessionArchiveSnapshot {
	id: string;
	archivedBy: ActorId;
	archivedAt: string;
	workflowBeforeArchive: SessionWorkflowState;
	activeSceneId: SceneId | null;
	activeMap: SessionActiveMapSelection | null;
	combat: SessionCombatState;
	diceHistory: SessionDiceRoll[];
	timers: Record<WidgetInstanceId, SessionTimer>;
	playerViewAssignments: Record<ActorId, SessionPlayerViewAssignment>;
	activeMapProjections: Record<ActorId, SessionActiveMapProjection>;
}

export interface SessionState {
	workflow: SessionWorkflowState;
	workflowRevision: number;
	activeSceneId: SceneId | null;
	activeMap: SessionActiveMapSelection | null;
	combat: SessionCombatState;
	diceHistory: SessionDiceRoll[];
	timers: Record<WidgetInstanceId, SessionTimer>;
	playerViewAssignments: Record<ActorId, SessionPlayerViewAssignment>;
	activeMapProjections: Record<ActorId, SessionActiveMapProjection>;
	recapArchiveId: string | null;
	archives: Record<string, SessionArchiveSnapshot>;
	schemaVersion: typeof SESSION_STATE_SCHEMA_VERSION;
}

export const EMPTY_SESSION_STATE: SessionState = Object.freeze({
	workflow: 'idle',
	workflowRevision: 0,
	activeSceneId: null,
	activeMap: null,
	combat: EMPTY_COMBAT_TRACKER_STATE,
	diceHistory: [],
	timers: {},
	playerViewAssignments: {},
	activeMapProjections: {},
	recapArchiveId: null,
	archives: {},
	schemaVersion: SESSION_STATE_SCHEMA_VERSION,
});
