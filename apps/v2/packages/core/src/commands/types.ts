import type { ActorId, OperationId, SceneId } from '../state/ids';
import type { Clock, IdGenerator } from '../state/ids';
import type { PermissionState } from '../state/permission-state';
import type { SceneState } from '../state/scene-state';
import type { OperationLog, SyncOperation } from '../sync/operation-log';

export interface CoreStateSlice {
	scenes: SceneState;
	permissions: PermissionState;
	sync: OperationLog;
}

export interface CoreEnvironment {
	vaultId: string;
	sourceId: string;
	ids: IdGenerator;
	clock: Clock;
}

export type CoreCommand =
	| { type: 'scene.create'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'scene.update-metadata'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'scene.set-sections'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'scene.save-template'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| {
			type: 'scene.instantiate-template';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	| { type: 'scene.add-widget'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'scene.move-widget'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'scene.resize-widget'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'scene.layer-widget'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'scene.group-widgets'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'scene.move-group'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'scene.dock-widget'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'scene.pin-widget'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'scene.destroy-widget'; actorId: ActorId; payload: unknown; idempotencyKey?: string };

export type CoreEvent =
	| { kind: 'scene.created'; sceneId: SceneId; actorId: ActorId }
	| { kind: 'scene.metadata-changed'; sceneId: SceneId; actorId: ActorId; paths: string[] }
	| { kind: 'scene.sections-changed'; sceneId: SceneId; actorId: ActorId }
	| { kind: 'scene.widget-added'; sceneId: SceneId; widgetInstanceId: string; actorId: ActorId }
	| { kind: 'scene.widget-layout-changed'; sceneId: SceneId; widgetInstanceId: string; actorId: ActorId; field: 'position' | 'size' | 'z' | 'dock' | 'pin' | 'group' }
	| { kind: 'scene.widget-destroyed'; sceneId: SceneId; widgetInstanceId: string; actorId: ActorId }
	| { kind: 'scene.template-saved'; templateSceneId: SceneId; sourceSceneId: SceneId; actorId: ActorId }
	| { kind: 'scene.template-instantiated'; templateSceneId: SceneId; newSceneId: SceneId; actorId: ActorId };

export type RejectionCode =
	| 'unknown-actor'
	| 'actor-not-authorized'
	| 'scene-not-found'
	| 'widget-not-found'
	| 'invalid-payload'
	| 'idempotency-replay'
	| 'invalid-state'
	| 'template-source-not-template';

export interface CommandRejection {
	code: RejectionCode;
	message: string;
	issues?: Array<{ path: string; message: string }>;
}

export type CommandResult =
	| {
			status: 'accepted';
			nextState: CoreStateSlice;
			events: CoreEvent[];
			operationIds: OperationId[];
	  }
	| {
			status: 'rejected';
			rejection: CommandRejection;
			nextState: CoreStateSlice;
	  };

export interface ReducerOutput {
	nextState: CoreStateSlice;
	events: CoreEvent[];
	operations: SyncOperation[];
}
