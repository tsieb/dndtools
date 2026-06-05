import type { ZodError, ZodType } from 'zod';
import type { CommandRejection, CoreEnvironment, CoreStateSlice } from './types';
import type { Actor, PermissionState } from '../state/permission-state';
import type { Scene, SceneState, WidgetInstance } from '../state/scene-state';
import type { ActorId } from '../state/ids';
import { appendOperation, type OperationLog, type SyncOperation } from '../sync/operation-log';
import { SCENE_STATE_SCHEMA_VERSION, SCENE_SCHEMA_VERSION } from '../state/scene-state';
import { SYNC_OPERATION_SCHEMA_VERSION } from '../sync/operation-log';
import type { WidgetDataSchema, WidgetPackageState } from '../state/widget-package-state';
import type { SessionState } from '../state/session-state';
import { EMPTY_SESSION_COMBAT_STATE, SESSION_STATE_SCHEMA_VERSION } from '../state/session-state';
import { WIDGET_PACKAGE_STATE_SCHEMA_VERSION } from '../state/widget-package-state';
import type { MapState } from '../state/map-state';
import { MAP_STATE_SCHEMA_VERSION } from '../state/map-state';
import type { CharacterState } from '../state/character-state';
import { ensureCharacterState } from '../state/character-state';

export function reject(rejection: CommandRejection, state: CoreStateSlice) {
	return { status: 'rejected' as const, rejection, nextState: state };
}

export function getActor(state: CoreStateSlice, actorId: ActorId): Actor | undefined {
	return state.permissions.actors[actorId];
}

export function requireActor(state: CoreStateSlice, actorId: ActorId): Actor | CommandRejection {
	const actor = getActor(state, actorId);
	if (!actor) {
		return { code: 'unknown-actor', message: `Actor ${actorId} is not registered.` };
	}
	return actor;
}

export function requireDm(actor: Actor): CommandRejection | null {
	if (actor.role !== 'dm') {
		return { code: 'actor-not-authorized', message: 'Only the DM may perform this action.' };
	}
	return null;
}

export function getScene(state: CoreStateSlice, sceneId: string): Scene | undefined {
	return state.scenes.scenes[sceneId];
}

export function requireScene(state: CoreStateSlice, sceneId: string): Scene | CommandRejection {
	const scene = getScene(state, sceneId);
	if (!scene) {
		return { code: 'scene-not-found', message: `Scene ${sceneId} does not exist.` };
	}
	return scene;
}

export function parseInput<TSchema extends ZodType>(
	schema: TSchema,
	raw: unknown,
): { ok: true; data: ReturnType<TSchema['parse']> } | { ok: false; rejection: CommandRejection } {
	const result = schema.safeParse(raw);
	if (result.success) {
		return { ok: true, data: result.data as ReturnType<TSchema['parse']> };
	}
	const error = result.error as ZodError;
	const issues = error.issues.map((issue) => ({
		path: issue.path.map(String).join('.') || '(root)',
		message: issue.message,
	}));
	return {
		ok: false,
		rejection: {
			code: 'invalid-payload',
			message: 'Command payload failed schema validation.',
			issues,
		},
	};
}

export function withScene(
	state: SceneState,
	sceneId: string,
	updater: (scene: Scene) => Scene,
): SceneState {
	const previous = state.scenes[sceneId];
	if (!previous) return state;
	const nextScene = updater(previous);
	return {
		schemaVersion: state.schemaVersion,
		scenes: { ...state.scenes, [sceneId]: nextScene },
	};
}

export function bumpRevision(scene: Scene, env: CoreEnvironment): Scene {
	return {
		...scene,
		ownership: {
			...scene.ownership,
			updatedAt: env.clock(),
			revision: scene.ownership.revision + 1,
		},
	};
}

export function findWidget(scene: Scene, widgetInstanceId: string): WidgetInstance | undefined {
	return scene.widgets.find((w) => w.id === widgetInstanceId);
}

export function replaceWidget(scene: Scene, widget: WidgetInstance): Scene {
	return {
		...scene,
		widgets: scene.widgets.map((w) => (w.id === widget.id ? widget : w)),
	};
}

export function withWidgetPackageState(
	state: WidgetPackageState,
	updater: (packages: WidgetPackageState) => WidgetPackageState,
): WidgetPackageState {
	return updater(state);
}

export function withSessionState(
	state: SessionState,
	updater: (session: SessionState) => SessionState,
): SessionState {
	return updater(state);
}

export interface OperationDraft {
	entityType: string;
	entityId: string;
	opType: string;
	path?: string;
	value?: unknown;
	beforeRevision?: number;
	afterRevision?: number;
	dependencies?: string[];
}

export function appendOperationDraft(
	env: CoreEnvironment,
	log: OperationLog,
	actorId: ActorId,
	draft: OperationDraft,
): { log: OperationLog; op: SyncOperation } {
	const op: SyncOperation = {
		id: env.ids(),
		vaultId: env.vaultId,
		sourceId: env.sourceId,
		actorId,
		entityType: draft.entityType,
		entityId: draft.entityId,
		opType: draft.opType,
		path: draft.path,
		value: draft.value,
		beforeRevision: draft.beforeRevision,
		afterRevision: draft.afterRevision,
		dependencies: draft.dependencies ?? [],
		issuedAt: env.clock(),
		schemaVersion: SYNC_OPERATION_SCHEMA_VERSION,
	};
	return { log: appendOperation(log, op), op };
}

export function validateObjectAgainstSchema(
	schema: WidgetDataSchema,
	value: Record<string, unknown>,
): Array<{ path: string; message: string }> {
	const issues: Array<{ path: string; message: string }> = [];
	for (const required of schema.required ?? []) {
		if (!(required in value)) {
			issues.push({ path: required, message: 'Required field is missing.' });
		}
	}
	for (const [key, raw] of Object.entries(value)) {
		const declared = schema.properties?.[key];
		if (!declared) {
			if (schema.additionalProperties === false) {
				issues.push({ path: key, message: 'Field is not declared by the schema.' });
			}
			continue;
		}
		if (declared.type === 'array') {
			if (!Array.isArray(raw)) issues.push({ path: key, message: 'Expected array.' });
			continue;
		}
		if (declared.type === 'object') {
			if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
				issues.push({ path: key, message: 'Expected object.' });
			}
			continue;
		}
		if (typeof raw !== declared.type) {
			issues.push({ path: key, message: `Expected ${declared.type}.` });
		}
	}
	return issues;
}

export function ensureSceneState(state: SceneState | undefined): SceneState {
	return state ?? { scenes: {}, schemaVersion: SCENE_STATE_SCHEMA_VERSION };
}

export function ensureSessionState(state: SessionState | undefined): SessionState {
	return {
		workflow: state?.workflow ?? 'idle',
		workflowRevision: state?.workflowRevision ?? 0,
		activeSceneId: state?.activeSceneId ?? null,
		activeMap: state?.activeMap ?? null,
		combat: state?.combat ?? { ...EMPTY_SESSION_COMBAT_STATE },
		diceHistory: state?.diceHistory ?? [],
		timers: state?.timers ?? {},
		playerViewAssignments: state?.playerViewAssignments ?? {},
		activeMapProjections: state?.activeMapProjections ?? {},
		recapArchiveId: state?.recapArchiveId ?? null,
		archives: state?.archives ?? {},
		schemaVersion: SESSION_STATE_SCHEMA_VERSION,
	};
}

export function ensureMapState(state: MapState | undefined): MapState {
	return state ?? { maps: {}, assets: {}, schemaVersion: MAP_STATE_SCHEMA_VERSION };
}

export function ensureWidgetPackageState(
	state: WidgetPackageState | undefined,
): WidgetPackageState {
	return state ?? { packages: {}, schemaVersion: WIDGET_PACKAGE_STATE_SCHEMA_VERSION };
}

export function ensureCharacterStateSlice(state: CharacterState | undefined): CharacterState {
	return ensureCharacterState(state);
}

export const SCENE_VERSION_CONSTANTS = {
	scene: SCENE_SCHEMA_VERSION,
	sceneState: SCENE_STATE_SCHEMA_VERSION,
};

export function isPermissionStateValid(_p: PermissionState): true {
	return true;
}
