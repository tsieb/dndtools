import type { ActorId, SceneId, SectionId, WidgetInstanceId } from './ids';
import {
	EMPTY_SESSION_COMBAT_STATE as EMPTY_COMBAT_TRACKER_STATE,
	type SessionCombatState,
} from './combat-tracker';

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

export interface SessionDiceRoll {
	id: string;
	actorId: ActorId;
	expression: string;
	total: number;
	rolledAt: string;
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
