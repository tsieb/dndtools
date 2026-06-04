import type { ActorId, SceneId, SectionId, WidgetInstanceId } from './ids';

export const SESSION_STATE_SCHEMA_VERSION = 1 as const;

export interface SessionTimer {
	id: string;
	sceneId: SceneId;
	widgetInstanceId: WidgetInstanceId;
	status: 'idle' | 'running' | 'paused';
	durationSeconds: number;
	startedAt: string | null;
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

export interface SessionState {
	timers: Record<WidgetInstanceId, SessionTimer>;
	playerViewAssignments: Record<ActorId, SessionPlayerViewAssignment>;
	schemaVersion: typeof SESSION_STATE_SCHEMA_VERSION;
}

export const EMPTY_SESSION_STATE: SessionState = Object.freeze({
	timers: {},
	playerViewAssignments: {},
	schemaVersion: SESSION_STATE_SCHEMA_VERSION,
});
