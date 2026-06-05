import type { CommandResult, CoreCommand, CoreEnvironment, CoreStateSlice } from './types';
import {
	handleCreateScene,
	handleInstantiateSceneTemplate,
	handleSaveSceneTemplate,
	handleSetSceneSections,
	handleUpdateSceneMetadata,
} from './scene-meta';
import {
	handleAddWidget,
	handleConfigureWidget,
	handleDestroyWidget,
	handleDockWidget,
	handleGroupWidgets,
	handleLayerWidget,
	handleMoveGroup,
	handleMoveWidget,
	handlePinWidget,
	handleResizeWidget,
	handleSetWidgetFocusOrder,
} from './widget';
import { handleDispatchWidgetCommand } from './widget-command';
import {
	handleApplyCommandCenterPreset,
	handleEnsureCommandCenterHome,
	handleSaveCommandCenterPreset,
} from './command-center';
import { handleProjectPlayerView, handleRevokePlayerView } from './player-view';
import { handleGrantCapabilitySet, handleRevokeGrant, handleTransferOwnership } from './grant';
import {
	handleProjectActiveMap,
	handleRecordSessionDice,
	handleSetActiveMap,
	handleSetSessionWorkflow,
	handleUpdateSessionCombat,
} from './session-control';
import {
	handleDisableWidgetPackage,
	handleEnableWidgetPackage,
	handleInstallWidgetPackage,
	handleRemoveWidgetPackage,
	handleUpgradeWidgetPackage,
} from './widget-package';
import {
	handleCreateMapLayer,
	handleDeleteMapLayer,
	handleDuplicateMapLayer,
	handleLockMapLayer,
	handleRenameMapLayer,
	handleReorderMapLayer,
	handleSetMapLayerEnabled,
	handleSetMapLayerOpacity,
	handleSetMapLayerTags,
	handleSetMapLayerVisibility,
} from './map-layer';
import { handleEditMapLayer, handleGenerateMapLayers } from './map-editing';

export function dispatchCommand(
	state: CoreStateSlice,
	env: CoreEnvironment,
	command: CoreCommand,
): CommandResult {
	switch (command.type) {
		case 'scene.create':
			return handleCreateScene(state, env, command.actorId, command.payload);
		case 'scene.update-metadata':
			return handleUpdateSceneMetadata(state, env, command.actorId, command.payload);
		case 'scene.set-sections':
			return handleSetSceneSections(state, env, command.actorId, command.payload);
		case 'scene.save-template':
			return handleSaveSceneTemplate(state, env, command.actorId, command.payload);
		case 'scene.instantiate-template':
			return handleInstantiateSceneTemplate(state, env, command.actorId, command.payload);
		case 'scene.add-widget':
			return handleAddWidget(state, env, command.actorId, command.payload);
		case 'scene.move-widget':
			return handleMoveWidget(state, env, command.actorId, command.payload);
		case 'scene.resize-widget':
			return handleResizeWidget(state, env, command.actorId, command.payload);
		case 'scene.layer-widget':
			return handleLayerWidget(state, env, command.actorId, command.payload);
		case 'scene.group-widgets':
			return handleGroupWidgets(state, env, command.actorId, command.payload);
		case 'scene.move-group':
			return handleMoveGroup(state, env, command.actorId, command.payload);
		case 'scene.dock-widget':
			return handleDockWidget(state, env, command.actorId, command.payload);
		case 'scene.pin-widget':
			return handlePinWidget(state, env, command.actorId, command.payload);
		case 'scene.set-focus-order':
			return handleSetWidgetFocusOrder(state, env, command.actorId, command.payload);
		case 'scene.destroy-widget':
			return handleDestroyWidget(state, env, command.actorId, command.payload);
		case 'scene.configure-widget':
			return handleConfigureWidget(state, env, command.actorId, command.payload);
		case 'widget.package.install':
			return handleInstallWidgetPackage(state, env, command.actorId, command.payload);
		case 'widget.package.enable':
			return handleEnableWidgetPackage(state, env, command.actorId, command.payload);
		case 'widget.package.disable':
			return handleDisableWidgetPackage(state, env, command.actorId, command.payload);
		case 'widget.package.remove':
			return handleRemoveWidgetPackage(state, env, command.actorId, command.payload);
		case 'widget.package.upgrade':
			return handleUpgradeWidgetPackage(state, env, command.actorId, command.payload);
		case 'widget.dispatch-command':
			return handleDispatchWidgetCommand(
				state,
				env,
				command.actorId,
				command.payload,
				command.idempotencyKey,
			);
		case 'command-center.ensure-home':
			return handleEnsureCommandCenterHome(state, env, command.actorId, command.payload);
		case 'command-center.save-preset':
			return handleSaveCommandCenterPreset(state, env, command.actorId, command.payload);
		case 'command-center.apply-preset':
			return handleApplyCommandCenterPreset(state, env, command.actorId, command.payload);
		case 'session.project-player-view':
			return handleProjectPlayerView(state, env, command.actorId, command.payload);
		case 'session.revoke-player-view':
			return handleRevokePlayerView(state, env, command.actorId, command.payload);
		case 'session.set-workflow':
			return handleSetSessionWorkflow(state, env, command.actorId, command.payload);
		case 'session.update-combat':
			return handleUpdateSessionCombat(state, env, command.actorId, command.payload);
		case 'session.record-dice':
			return handleRecordSessionDice(state, env, command.actorId, command.payload);
		case 'session.set-active-map':
			return handleSetActiveMap(state, env, command.actorId, command.payload);
		case 'session.project-active-map':
			return handleProjectActiveMap(state, env, command.actorId, command.payload);
		case 'permission.grant-capability-set':
			return handleGrantCapabilitySet(state, env, command.actorId, command.payload);
		case 'permission.revoke-grant':
			return handleRevokeGrant(state, env, command.actorId, command.payload);
		case 'permission.transfer-ownership':
			return handleTransferOwnership(state, env, command.actorId, command.payload);
		case 'map.create-layer':
			return handleCreateMapLayer(state, env, command.actorId, command.payload);
		case 'map.rename-layer':
			return handleRenameMapLayer(state, env, command.actorId, command.payload);
		case 'map.reorder-layer':
			return handleReorderMapLayer(state, env, command.actorId, command.payload);
		case 'map.duplicate-layer':
			return handleDuplicateMapLayer(state, env, command.actorId, command.payload);
		case 'map.lock-layer':
			return handleLockMapLayer(state, env, command.actorId, command.payload);
		case 'map.delete-layer':
			return handleDeleteMapLayer(state, env, command.actorId, command.payload);
		case 'map.set-layer-visibility':
			return handleSetMapLayerVisibility(state, env, command.actorId, command.payload);
		case 'map.set-layer-enabled':
			return handleSetMapLayerEnabled(state, env, command.actorId, command.payload);
		case 'map.set-layer-opacity':
			return handleSetMapLayerOpacity(state, env, command.actorId, command.payload);
		case 'map.set-layer-tags':
			return handleSetMapLayerTags(state, env, command.actorId, command.payload);
		case 'map.edit-layer':
			return handleEditMapLayer(state, env, command.actorId, command.payload);
		case 'map.generate-layers':
			return handleGenerateMapLayers(state, env, command.actorId, command.payload);
	}
}

export type { CoreCommand };
