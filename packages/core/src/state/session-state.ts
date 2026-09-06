import type { ActorId, SceneId, SectionId, WidgetInstanceId } from './ids';
import {
	EMPTY_SESSION_COMBAT_STATE as EMPTY_COMBAT_TRACKER_STATE,
	type SessionCombatState,
} from './combat-tracker';
import type { ActorRole } from './permission-state';
import type { EvaluatedTerm } from './dice';
import {
	EMPTY_CALENDAR_CONTINUITY_STATE,
	type CalendarContinuityState,
} from './calendar-continuity';
import type { PlayerGroup } from './player-group';
import { EMPTY_SESSION_AUDIO_STATE, type SessionAudioState } from './session-audio';
import { EMPTY_SCENE_CARD_STATE, type SceneCardState } from './scene-card';

// COLLAB-012 — durable PLAYER GROUPS (DM-authored delivery/projection target sets) live on the session
// document. Re-exported here so existing session-state importers keep their import site while the model
// is owned by the player-group slice. A group carries NO permission data (delivery-targeting only).
export type { PlayerGroup } from './player-group';
export {
	PLAYER_GROUP_ENTITY_TYPE,
	PLAYER_GROUP_SCHEMA_VERSION,
	ensurePlayerGroups,
} from './player-group';

// I11 S11.2 — the durable SCENE CARD (atmosphere) slice lives ON the session document but is
// CAMPAIGN-level (cards/queue/push history are NOT reset between sessions — the calendar-continuity
// precedent). Re-exported here so existing session-state importers keep their import site.
export type {
	SceneCard,
	SceneCardHeroImage,
	SceneCardMood,
	SceneCardPushRecord,
	SceneCardState,
	SceneCardTransitionStyle,
	SceneCardVisibility,
} from './scene-card';
export {
	EMPTY_SCENE_CARD_STATE,
	SCENE_CARD_ENTITY_TYPE,
	SCENE_CARD_FLAVOR_MAX_LENGTH,
	SCENE_CARD_SCHEMA_VERSION,
	ensureSceneCardState,
	isLiveSceneCard,
} from './scene-card';

export const SESSION_STATE_SCHEMA_VERSION = 1 as const;

// SES-012 — the durable CAMPAIGN CALENDAR CONTINUITY slice (current campaign date + dated links by
// reference) lives ON the session document but is CAMPAIGN-level: it is never reset between sessions.
// Re-exported here so existing session-state importers keep their import site.
export type { CalendarContinuityState, CalendarLink } from './calendar-continuity';
export { EMPTY_CALENDAR_CONTINUITY_STATE } from './calendar-continuity';

// SES-002 — the full combat-tracker state now lives in `combat-tracker.ts` (initiative order, rounds,
// turns, per-combatant resources, stat-block previews, encounter log). Re-exported here so existing
// session-state importers keep their import site while the model is owned by the SES combat slice.
export type { SessionCombatState } from './combat-tracker';
export { EMPTY_SESSION_COMBAT_STATE } from './combat-tracker';

// AUDIO-002 / AUDIO-003 — the SESSION-OWNED currently-playing audio state (Contract 4 Widget State
// Ownership: "Audio track currently playing — Session state"). It lives ON the session document so it is
// durable, syncs as session state (not widget-private state), and survives audio-widget removal. The model
// is owned by the session-audio slice; re-exported here so existing importers keep their import site.
export type {
	SessionAudioDelivery,
	SessionAudioDeliveryStatus,
	SessionAudioState,
	SessionAudioStatus,
	SessionAudioTrack,
} from './session-audio';
export {
	EMPTY_SESSION_AUDIO_STATE,
	SESSION_AUDIO_SCHEMA_VERSION,
	ensureSessionAudioState,
} from './session-audio';

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

/**
 * RC-MAP-1.4 — where the PARTY currently stands on the atlas: one map + a normalized (0..1) position
 * on it. Campaign-level, like {@link CalendarContinuityState}: it is NOT reset by a session workflow
 * transition (unlike `activeMap`/`combat`), so the prep/recap digest can always show "the party is
 * here" even between sessions. `revision` is a plain per-mark counter so `session.mark-party` carries
 * a meaningful before/after revision in the op log; it is not itself player-facing.
 */
export interface SessionPartyLocation {
	mapId: string;
	x: number;
	y: number;
	revision: number;
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
 * COLLAB-007 — the KIND of content a handout carries. The DM can deliver handouts, IMAGES, NOTES, MAP
 * FRAGMENTS, CIPHERS, and RUMORS (the requirement's explicit content kinds). The kind is descriptive
 * metadata for the GUI/recipient surface; it does NOT change the delivery/visibility/revocation rules
 * (every kind is delivered, acknowledged, and revoked the same way). Fails closed to `handout` on hydrate.
 */
export type HandoutKind = 'handout' | 'image' | 'note' | 'map-fragment' | 'cipher' | 'rumor';

export const HANDOUT_KINDS: readonly HandoutKind[] = Object.freeze([
	'handout',
	'image',
	'note',
	'map-fragment',
	'cipher',
	'rumor',
]);

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

/**
 * COLLAB-007 — a durable DELIVERY ACKNOWLEDGEMENT: the recipient CONFIRMED RECEIPT of the handout. The
 * DM uses this to see delivered/opened status. Recorded per recipient (latest acknowledgement wins on
 * re-ack); carries only the recipient + time, never recipient-only content (no leak into the audit).
 */
export interface HandoutAcknowledgement {
	recipientActorId: ActorId;
	acknowledgedAt: string;
}

/**
 * COLLAB-007 — a durable REVOCATION: the DM REVOKED this handout from ONE recipient. A revoked recipient's
 * access is SEALED — the actor-filtered read returns the handout as unavailable (sealed) to them, exactly
 * like a participant whose session cache was sealed (COLLAB-010/014, reused via the seal disposition).
 * Revocation is honored UNLESS the recipient holds explicit PERSISTENT access (see
 * {@link SessionHandout.persistentRecipientActorIds}).
 */
export interface HandoutRevocation {
	recipientActorId: ActorId;
	revokedBy: ActorId;
	revokedAt: string;
}

export interface SessionHandout {
	id: string;
	/** COLLAB-007 — the content kind (handout/image/note/map-fragment/cipher/rumor). Descriptive only. */
	kind: HandoutKind;
	title: string;
	sections: HandoutSection[];
	/** Section ids whose `shared` content has been REVEALED to recipients (progressive reveal). */
	revealedSectionIds: string[];
	/** The recipients this handout is currently delivered to (drives the visibility-filter `sharedWith`). */
	recipientActorIds: ActorId[];
	/**
	 * COLLAB-007 — recipients the DM granted PERSISTENT access to. A persistent recipient KEEPS the handout
	 * even after revocation or session end (the COLLAB-010 persistent-grant exception, applied to handouts).
	 * Revoking a persistent recipient is a no-op seal; the read still returns the content to them.
	 */
	persistentRecipientActorIds: ActorId[];
	/** The durable delivery history: every delivery to every recipient, oldest first (SES-004). */
	deliveries: HandoutDeliveryRecord[];
	/** COLLAB-007 — delivery ACKNOWLEDGEMENTS, one per recipient (latest wins). */
	acknowledgements: HandoutAcknowledgement[];
	/** COLLAB-007 — REVOCATIONS, one per revoked recipient. A revoked, non-persistent recipient is sealed. */
	revocations: HandoutRevocation[];
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

/**
 * A DM-AUTHORED RECAP written onto a session archive (SES-009 recap authoring). The markdown is the
 * DM's prose summary of the archived session; `revision` bumps on each re-authoring so the latest
 * authored recap is unambiguous. Optional on the snapshot so archives persisted before hydrate safely.
 */
export interface SessionArchiveRecap {
	markdown: string;
	authoredBy: ActorId;
	authoredAt: string;
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
	/** AUDIO-002 / AUDIO-003 — the session-owned currently-playing audio state at archive time (back-compat optional). */
	audioPlayback?: SessionAudioState;
	/** SES-009 — the DM-authored recap markdown for this archive (back-compat optional; absent ⇒ none). */
	recap?: SessionArchiveRecap;
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
	/**
	 * AUDIO-002 / AUDIO-003 — the SESSION-OWNED currently-playing audio state (the active track + per-player
	 * delivery records). Session-owned, not widget-private: removing the audio widget never clears it; only a
	 * stop command does. Syncs to collaborators as session state.
	 */
	audioPlayback: SessionAudioState;
	/** COLLAB-012 — durable PLAYER GROUPS keyed by group id (DM delivery/projection targets; no permission). */
	playerGroups: Record<string, PlayerGroup>;
	/**
	 * SES-012 — durable CAMPAIGN calendar continuity (current campaign date + dated links by reference).
	 * Campaign-level: this is NOT reset when the session workflow transitions (unlike the live fields).
	 */
	calendarContinuity: CalendarContinuityState;
	/**
	 * I11 S11.2 — durable SCENE CARDS (atmosphere): the card library, the ordered display queue, the
	 * active card, the transition style, and the player-visible push history. Campaign-level (not reset
	 * between sessions).
	 */
	sceneCards: SceneCardState;
	recapArchiveId: string | null;
	archives: Record<string, SessionArchiveSnapshot>;
	/**
	 * RC-MAP-1.4 — the party's current atlas location (campaign-level; additive; null before the DM
	 * first marks it). See {@link SessionPartyLocation}.
	 */
	partyLocation: SessionPartyLocation | null;
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
	audioPlayback: EMPTY_SESSION_AUDIO_STATE,
	playerGroups: {},
	calendarContinuity: EMPTY_CALENDAR_CONTINUITY_STATE,
	sceneCards: EMPTY_SCENE_CARD_STATE,
	recapArchiveId: null,
	archives: {},
	partyLocation: null,
	schemaVersion: SESSION_STATE_SCHEMA_VERSION,
});
