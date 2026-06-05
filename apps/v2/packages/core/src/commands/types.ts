import type { ActorId, OperationId, SceneId } from '../state/ids';
import type { Clock, IdGenerator } from '../state/ids';
import type { CommandCenterState } from '../state/command-center-state';
import type { MapState } from '../state/map-state';
import type { MapLayerMutationKind } from '../state/map-layers';
import type { MapImportAdapterRegistry } from '../state/map-import';
import type { PermissionState } from '../state/permission-state';
import type { SceneState } from '../state/scene-state';
import type { SessionWorkflowState, SessionState } from '../state/session-state';
import type { WidgetPackageState } from '../state/widget-package-state';
import type { OperationLog, SyncOperation } from '../sync/operation-log';

export interface CoreStateSlice {
	scenes: SceneState;
	maps: MapState;
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
	/**
	 * MAP-002 / MAP-020 — declared external-format import adapters. Optional; when absent NO external
	 * scene format is declared, so every external import is rejected fail-closed (only native image/SVG
	 * imports succeed). Modeled as a typed registry so a format can never be imported without a declared
	 * adapter.
	 */
	mapImportAdapters?: MapImportAdapterRegistry;
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
	  }
	| { type: 'session.set-workflow'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'session.update-combat'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'session.record-dice'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'session.set-active-map'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| {
			type: 'session.project-active-map';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	| {
			type: 'permission.grant-capability-set';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	| { type: 'permission.revoke-grant'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| {
			type: 'permission.transfer-ownership';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	| { type: 'map.create-layer'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'map.rename-layer'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'map.reorder-layer'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'map.duplicate-layer'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'map.lock-layer'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'map.delete-layer'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| {
			type: 'map.set-layer-visibility';
			actorId: ActorId;
			payload: unknown;
			idempotencyKey?: string;
	  }
	| { type: 'map.set-layer-enabled'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'map.set-layer-opacity'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	| { type: 'map.set-layer-tags'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// MAP-003: draw/paint edit (before+after content capture for undo and sync).
	| { type: 'map.edit-layer'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// MAP-004: deterministic procedural generation saved as editable map layers.
	| { type: 'map.generate-layers'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// MAP-001: create a map entity (name, scale, projection, default visibility, initial layers).
	| { type: 'map.create'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// MAP-002: import a native image/SVG as a content-addressed map asset.
	| { type: 'map.import-asset'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// MAP-020: commit a previewed import as a transaction (rollback-safe, no partial commit).
	| { type: 'map.commit-import'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// MAP-008 / MAP-017: embed a child map in a parent (cycle + depth fail-closed in the reducer).
	| { type: 'map.embed-child'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// MAP-008: update an embed's transform / transition behavior / threshold.
	| { type: 'map.update-embed'; actorId: ActorId; payload: unknown; idempotencyKey?: string }
	// MAP-008: remove an embed (never deletes the child map).
	| { type: 'map.remove-embed'; actorId: ActorId; payload: unknown; idempotencyKey?: string };

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
	  }
	| {
			kind: 'session.workflow-changed';
			actorId: ActorId;
			from: SessionWorkflowState;
			to: SessionWorkflowState;
			activeSceneId: SceneId | null;
			recapArchiveId: string | null;
	  }
	| { kind: 'session.archived'; actorId: ActorId; archiveId: string }
	| { kind: 'session.combat-updated'; actorId: ActorId; revision: number }
	| { kind: 'session.dice-recorded'; actorId: ActorId; rollId: string }
	| {
			kind: 'session.active-map-changed';
			actorId: ActorId;
			sceneId: SceneId;
			widgetInstanceId: string;
			mapId: string;
			regionId: string | null;
	  }
	| {
			kind: 'session.active-map-projected';
			actorId: ActorId;
			playerActorId: ActorId;
			projectionId: string;
			mapId: string;
			regionId: string | null;
			deliveryStatus: 'delivered' | 'queued';
	  }
	| {
			kind: 'permission.grant-added';
			grantId: string;
			entityType: string;
			entityId: string;
			playerActorId: ActorId;
			capabilitySet: string;
			actorId: ActorId;
	  }
	| {
			kind: 'permission.grant-revoked';
			grantId: string;
			entityType: string;
			entityId: string;
			playerActorId: ActorId;
			capabilitySet: string;
			actorId: ActorId;
	  }
	| {
			kind: 'permission.ownership-transferred';
			entityType: string;
			entityId: string;
			toPlayerActorId: ActorId;
			newGrantId: string;
			revokedGrantIds: string[];
			capabilitySet: string;
			actorId: ActorId;
	  }
	| {
			kind: 'map.layer-changed';
			mapId: string;
			layerId: string;
			mutation: MapLayerMutationKind;
			actorId: ActorId;
	  }
	| { kind: 'map.created'; mapId: string; actorId: ActorId }
	| {
			kind: 'map.embed-changed';
			parentMapId: string;
			embedId: string;
			childMapId: string;
			mutation: 'embed' | 'update' | 'remove';
			actorId: ActorId;
	  }
	| {
			kind: 'map.import-committed';
			mapId: string;
			mapCreated: boolean;
			assetId: string | null;
			assetDeduped: boolean;
			droppedElementCount: number;
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
	| 'map-not-found'
	| 'revision-conflict'
	| 'hidden-target'
	| 'conflicted-target'
	| 'template-source-not-template'
	| 'command-center-not-configured'
	| 'preset-not-found'
	// MAP-017 — nesting integrity rejections (cycle / depth bound), kept fail-closed and distinct so
	// the DM authoring UI can explain exactly why an embed was refused.
	| 'nesting-cycle'
	| 'nesting-max-depth';

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
