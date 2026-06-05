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

/**
 * SES-004 — ONE durable HANDOUT delivered as a Scene widget. A handout carries a title and an ordered
 * list of SECTIONS, each with its OWN visibility (`shared` by default — delivered only to selected
 * recipients) so a single handout can hold both always-on and progressively-revealed content. The
 * `revealedSectionIds` set drives OPTIONAL REVEAL: a `shared` section is withheld from recipients until
 * the DM reveals it (progressive), while a `player-visible` section is shown to recipients immediately
 * (explicit/whole-handout reveal). Delivery to a recipient is recorded in {@link HandoutDeliveryRecord}.
 *
 * Visibility ENFORCEMENT is delegated to the PERM visibility-filter at read time (the recipient set is
 * reduced to `sharedWith` membership), so NON-recipients never receive any section. The Scene widget
 * the handout is delivered through references the handout BY ID (Contract 4 embed/projection) — the
 * widget never clones handout content.
 */
export type HandoutSectionVisibility = 'shared' | 'player-visible' | 'dm-only';

export interface HandoutSection {
	id: string;
	heading: string;
	body: string;
	/**
	 * The section's own visibility. `shared` ⇒ delivered only to selected recipients (and only once
	 * revealed, for progressive reveal). `player-visible` ⇒ shown to recipients without a reveal step.
	 * `dm-only` ⇒ never delivered to any recipient (DM eyes only). Fails closed to `dm-only` on hydrate.
	 */
	visibility: HandoutSectionVisibility;
}

/** A durable record that a handout was delivered to ONE recipient at a point in time (SES-004 history). */
export interface HandoutDeliveryRecord {
	id: string;
	recipientActorId: ActorId;
	deliveredBy: ActorId;
	deliveredAt: string;
	deliveryStatus: PlayerViewDeliveryStatus;
	deliveryReason: 'connected' | 'offline';
	/** The Scene this handout was delivered onto as a widget. */
	sceneId: SceneId;
	/** The handout widget instance created/reused for this delivery. */
	widgetInstanceId: WidgetInstanceId;
}

export interface SessionHandout {
	id: string;
	title: string;
	sections: HandoutSection[];
	/** Section ids whose `shared` content has been REVEALED to recipients (progressive reveal). */
	revealedSectionIds: string[];
	/** The recipients this handout is currently delivered to (drives the visibility-filter `sharedWith`). */
	recipientActorIds: ActorId[];
	/** The durable delivery history: every delivery to every recipient, oldest first (SES-004). */
	deliveries: HandoutDeliveryRecord[];
	createdBy: ActorId;
	createdAt: string;
	updatedAt: string;
	revision: number;
}

/**
 * SES-007 — the kind of content a quick-reference panel PINS, BY REFERENCE. Each kind resolves through
 * the matching actor-filtered query at read time, so a pinned panel shows only content the viewer may
 * see and degrades to an unavailable state when its target is hidden/deleted (no leak).
 */
export type QuickReferenceTargetKind =
	| 'note'
	| 'stat-block'
	| 'rules-snippet'
	| 'open-thread'
	| 'session-context';

/** A durable PINNED quick-reference panel (SES-007). References its content by id — never a content copy. */
export interface QuickReferencePanel {
	id: string;
	kind: QuickReferenceTargetKind;
	/** A short DM-authored label shown on the pinned panel (does not leak target content). */
	label: string;
	/**
	 * The referenced target's id. For `note`/`stat-block`/`open-thread` this is a content-item id; for
	 * `stat-block` bound to a character it is a character id; `session-context` panels carry a null
	 * target (they render live session context, not a referenced entity).
	 */
	targetId: string | null;
	/** Pin ORDER (ascending). Stable across route changes (durable pin state — SES-007 AC1). */
	order: number;
	createdBy: ActorId;
	createdAt: string;
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
	handouts: Record<string, SessionHandout>;
	quickReferencePanels: Record<string, QuickReferencePanel>;
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
	/** SES-004 — durable handouts keyed by handout id (delivery, history, reveal state). */
	handouts: Record<string, SessionHandout>;
	/** SES-007 — durable pinned quick-reference panels keyed by panel id. */
	quickReferencePanels: Record<string, QuickReferencePanel>;
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
	handouts: {},
	quickReferencePanels: {},
	recapArchiveId: null,
	archives: {},
	schemaVersion: SESSION_STATE_SCHEMA_VERSION,
});
