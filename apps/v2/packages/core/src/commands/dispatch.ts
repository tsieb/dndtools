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
	handleDestroyWidget,
	handleDockWidget,
	handleGroupWidgets,
	handleLayerWidget,
	handleMoveGroup,
	handleMoveWidget,
	handlePinWidget,
	handleResizeWidget,
} from './widget';
import { handleDispatchWidgetCommand } from './widget-command';
import {
	handleDisableWidgetPackage,
	handleEnableWidgetPackage,
	handleInstallWidgetPackage,
	handleRemoveWidgetPackage,
	handleUpgradeWidgetPackage,
} from './widget-package';

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
		case 'scene.destroy-widget':
			return handleDestroyWidget(state, env, command.actorId, command.payload);
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
	}
}

export type { CoreCommand };
