import type { SceneId, WidgetInstanceId } from './ids';

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

export interface SessionState {
	timers: Record<WidgetInstanceId, SessionTimer>;
	schemaVersion: typeof SESSION_STATE_SCHEMA_VERSION;
}

export const EMPTY_SESSION_STATE: SessionState = Object.freeze({
	timers: {},
	schemaVersion: SESSION_STATE_SCHEMA_VERSION,
});
