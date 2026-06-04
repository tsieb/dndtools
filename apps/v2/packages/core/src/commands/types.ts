import type { ActorId, OperationId, SceneId } from '../state/ids';
import type { Clock, IdGenerator } from '../state/ids';
import type { CommandCenterState } from '../state/command-center-state';
import type { PermissionState } from '../state/permission-state';
import type { SceneState } from '../state/scene-state';
import type { SessionState } from '../state/session-state';
import type { WidgetPackageState } from '../state/widget-package-state';
import type { OperationLog, SyncOperation } from '../sync/operation-log';

export interface CoreStateSlice {
	scenes: SceneState;
	permissions: PermissionState;
	session: SessionState;
	widgets: WidgetPackageState;
	commandCenter: CommandCenterState;
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
	| { type: 'scene.set-focus-order'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'scene.destroy-widget'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'scene.configure-widget'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'widget.package.install'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'widget.package.enable'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'widget.package.disable'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'widget.package.remove'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'widget.package.upgrade'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| {
			type: 'widget.dispatch-command';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	| {
			type: 'command-center.ensure-home';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	| {
			type: 'command-center.save-preset';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	| {
			type: 'command-center.apply-preset';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	| {
			type: 'session.project-player-view';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	| {
			type: 'session.revoke-player-view';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  };

export type CoreEvent =
	| { kind: 'scene.created'; sceneId: SceneId; actorId: ActorId }
	| { kind: 'scene.metadata-changed'; sceneId: SceneId; actorId: ActorId; paths: string[] }
	| { kind: 'scene.sections-changed'; sceneId: SceneId; actorId: ActorId }
	| { kind: 'scene.widget-added'; sceneId: SceneId; widgetInstanceId: string; actorId: ActorId }
	| {
			kind: 'scene.widget-layout-changed';
			sceneId: SceneId;
			widgetInstanceId: string;
			actorId: ActorId;
			field: 'position' | 'size' | 'z' | 'dock' | 'pin' | 'group' | 'focusOrder';
	  }
	| { kind: 'scene.widget-destroyed'; sceneId: SceneId; widgetInstanceId: string; actorId: ActorId }
	| {
			kind: 'scene.widget-configured';
			sceneId: SceneId;
			widgetInstanceId: string;
			actorId: ActorId;
	  }
	| {
			kind: 'scene.template-saved';
			templateSceneId: SceneId;
			sourceSceneId: SceneId;
			actorId: ActorId;
	  }
	| {
			kind: 'scene.template-instantiated';
			templateSceneId: SceneId;
			newSceneId: SceneId;
			actorId: ActorId;
	  }
	| { kind: 'widget.package-installed'; packageId: string; actorId: ActorId }
	| { kind: 'widget.package-enabled'; packageId: string; actorId: ActorId }
	| { kind: 'widget.package-disabled'; packageId: string; actorId: ActorId }
	| { kind: 'widget.package-removed'; packageId: string; actorId: ActorId }
	| { kind: 'widget.package-upgraded'; packageId: string; actorId: ActorId }
	| { kind: 'session.timer-started'; sceneId: SceneId; widgetInstanceId: string; actorId: ActorId }
	| { kind: 'command-center.home-created'; sceneId: SceneId; actorId: ActorId }
	| { kind: 'command-center.home-ready'; sceneId: SceneId; actorId: ActorId }
	| {
			kind: 'command-center.preset-saved';
			presetId: string;
			sceneId: SceneId;
			actorId: ActorId;
	  }
	| {
			kind: 'command-center.preset-restored';
			presetId: string;
			sceneId: SceneId;
			actorId: ActorId;
			restoredWidgetCount: number;
			missingWidgetTypes: string[];
	  }
	| {
			kind: 'session.player-view-projected';
			assignmentId: string;
			sceneId: SceneId;
			playerActorId: ActorId;
			actorId: ActorId;
			deliveryStatus: 'delivered' | 'queued';
	  }
	| {
			kind: 'session.player-view-revoked';
			assignmentId: string;
			sceneId: SceneId;
			playerActorId: ActorId;
			actorId: ActorId;
	  };

export type RejectionCode =
	| 'unknown-actor'
	| 'actor-not-authorized'
	| 'scene-not-found'
	| 'widget-not-found'
	| 'package-not-found'
	| 'package-disabled'
	| 'command-not-declared'
	| 'invalid-payload'
	| 'idempotency-replay'
	| 'invalid-state'
	| 'revision-conflict'
	| 'hidden-target'
	| 'conflicted-target'
	| 'template-source-not-template'
	| 'command-center-not-configured'
	| 'preset-not-found';

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
