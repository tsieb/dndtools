import { actorCanCoEditScene } from '../permissions/grants';
import type { PermissionState } from '../state/permission-state';
import type { ActorId } from '../state/ids';
import type { Scene, WidgetDock, WidgetInstance } from '../state/scene-state';
import type { CoreCommand } from '../commands/types';

/**
 * Keyboard- and touch-accessible Scene/widget layout operations (CANVAS-012).
 *
 * Every Must-have layout operation from CANVAS-003 (move, resize, layer, dock, pin,
 * group) plus explicit focus ordering (CANVAS-016) and widget removal is exposed here
 * as a discrete command descriptor. The GUI renders these as focusable controls, so
 * no operation depends on drag-only or hover-only affordances. The descriptors carry
 * the dispatchable Processing Core command type, keeping the GUI free of layout
 * mutation logic (Contract 1).
 */
export type SceneLayoutCommandGroup =
	| 'move'
	| 'size'
	| 'layer'
	| 'dock'
	| 'pin'
	| 'group'
	| 'focus'
	| 'lifecycle';

export type SceneLayoutCommandId =
	| 'move-left'
	| 'move-right'
	| 'move-up'
	| 'move-down'
	| 'grow-width'
	| 'shrink-width'
	| 'grow-height'
	| 'shrink-height'
	| 'layer-forward'
	| 'layer-backward'
	| 'dock-left'
	| 'dock-right'
	| 'dock-top'
	| 'dock-bottom'
	| 'dock-none'
	| 'pin'
	| 'unpin'
	| 'focus-earlier'
	| 'focus-later'
	| 'focus-clear'
	| 'group-selection'
	| 'destroy';

export type SceneLayoutCommandType = Extract<
	CoreCommand['type'],
	| 'scene.move-widget'
	| 'scene.resize-widget'
	| 'scene.layer-widget'
	| 'scene.dock-widget'
	| 'scene.pin-widget'
	| 'scene.set-focus-order'
	| 'scene.group-widgets'
	| 'scene.destroy-widget'
>;

export interface SceneLayoutCommand {
	id: SceneLayoutCommandId;
	label: string;
	group: SceneLayoutCommandGroup;
	commandType: SceneLayoutCommandType;
	/**
	 * `self` commands act on the single widget and can be resolved to a concrete
	 * payload by {@link resolveLayoutCommandPayload}. `selection` commands (grouping)
	 * act on a GUI-managed multi-widget selection.
	 */
	targets: 'self' | 'selection';
	/** Documents that this command requires neither drag nor hover (CANVAS-012). */
	pointerFree: true;
}

export interface LayoutStep {
	/** Pixels a directional move nudges the widget. */
	move: number;
	/** Pixels a grow/shrink changes a dimension. */
	resize: number;
}

export const DEFAULT_LAYOUT_STEP: LayoutStep = { move: 20, resize: 20 };

/** Minimum widget extent a shrink may produce; resize schema requires positive sizes. */
export const MIN_WIDGET_EXTENT = 40;

function selfCommand(
	id: SceneLayoutCommandId,
	label: string,
	group: SceneLayoutCommandGroup,
	commandType: SceneLayoutCommandType,
): SceneLayoutCommand {
	return { id, label, group, commandType, targets: 'self', pointerFree: true };
}

/**
 * List the accessible layout commands available for a widget to the given actor.
 * Returns an empty list when the actor cannot edit the Scene (Contract 3): only the
 * DM or a Scene `co-editor` may rearrange layout. The command set is state-aware so
 * it never offers no-op operations (e.g., `unpin` only appears for a pinned widget).
 */
export function listWidgetLayoutCommands(
	scene: Scene,
	widget: WidgetInstance,
	permission: PermissionState,
	actorId: ActorId,
): SceneLayoutCommand[] {
	if (!actorCanCoEditScene(permission, actorId, scene.id)) return [];

	const commands: SceneLayoutCommand[] = [
		selfCommand('move-left', 'Move left', 'move', 'scene.move-widget'),
		selfCommand('move-right', 'Move right', 'move', 'scene.move-widget'),
		selfCommand('move-up', 'Move up', 'move', 'scene.move-widget'),
		selfCommand('move-down', 'Move down', 'move', 'scene.move-widget'),
		selfCommand('grow-width', 'Widen', 'size', 'scene.resize-widget'),
		selfCommand('shrink-width', 'Narrow', 'size', 'scene.resize-widget'),
		selfCommand('grow-height', 'Taller', 'size', 'scene.resize-widget'),
		selfCommand('shrink-height', 'Shorter', 'size', 'scene.resize-widget'),
		selfCommand('layer-forward', 'Bring forward', 'layer', 'scene.layer-widget'),
		selfCommand('layer-backward', 'Send backward', 'layer', 'scene.layer-widget'),
	];

	const dockTargets: Array<{ id: SceneLayoutCommandId; label: string; dock: WidgetDock }> = [
		{ id: 'dock-left', label: 'Dock left', dock: 'left' },
		{ id: 'dock-right', label: 'Dock right', dock: 'right' },
		{ id: 'dock-top', label: 'Dock top', dock: 'top' },
		{ id: 'dock-bottom', label: 'Dock bottom', dock: 'bottom' },
	];
	for (const target of dockTargets) {
		if (widget.layout.dock !== target.dock) {
			commands.push(selfCommand(target.id, target.label, 'dock', 'scene.dock-widget'));
		}
	}
	if (widget.layout.dock !== null) {
		commands.push(selfCommand('dock-none', 'Undock', 'dock', 'scene.dock-widget'));
	}

	commands.push(
		widget.layout.pinned
			? selfCommand('unpin', 'Unpin', 'pin', 'scene.pin-widget')
			: selfCommand('pin', 'Pin', 'pin', 'scene.pin-widget'),
	);

	commands.push(
		selfCommand('focus-earlier', 'Focus earlier', 'focus', 'scene.set-focus-order'),
		selfCommand('focus-later', 'Focus later', 'focus', 'scene.set-focus-order'),
	);
	if (widget.layout.focusOrder !== null) {
		commands.push(
			selfCommand('focus-clear', 'Clear focus order', 'focus', 'scene.set-focus-order'),
		);
	}

	commands.push({
		id: 'group-selection',
		label: 'Group selected widgets',
		group: 'group',
		commandType: 'scene.group-widgets',
		targets: 'selection',
		pointerFree: true,
	});

	commands.push(selfCommand('destroy', 'Remove widget', 'lifecycle', 'scene.destroy-widget'));

	return commands;
}

export interface ResolvedLayoutCommand {
	type: SceneLayoutCommandType;
	payload: Record<string, unknown>;
}

/**
 * Resolve a `self` layout command to a concrete, dispatch-ready command payload from
 * the widget's current layout. Scene layout coordinate math lives in the core, not the
 * GUI, so a keyboard nudge or resize produces identical results on every platform
 * (Contract 1). Returns `null` for `selection` commands, which the GUI resolves from
 * its own multi-widget selection.
 */
export function resolveLayoutCommandPayload(
	command: SceneLayoutCommand,
	scene: Scene,
	widget: WidgetInstance,
	step: LayoutStep = DEFAULT_LAYOUT_STEP,
): ResolvedLayoutCommand | null {
	if (command.targets !== 'self') return null;
	const layout = widget.layout;
	const base = { sceneId: scene.id, widgetInstanceId: widget.id };

	switch (command.id) {
		case 'move-left':
			return { type: 'scene.move-widget', payload: { ...base, x: Math.max(0, layout.x - step.move), y: layout.y } };
		case 'move-right':
			return { type: 'scene.move-widget', payload: { ...base, x: layout.x + step.move, y: layout.y } };
		case 'move-up':
			return { type: 'scene.move-widget', payload: { ...base, x: layout.x, y: Math.max(0, layout.y - step.move) } };
		case 'move-down':
			return { type: 'scene.move-widget', payload: { ...base, x: layout.x, y: layout.y + step.move } };
		case 'grow-width':
			return { type: 'scene.resize-widget', payload: { ...base, w: layout.w + step.resize, h: layout.h } };
		case 'shrink-width':
			return { type: 'scene.resize-widget', payload: { ...base, w: Math.max(MIN_WIDGET_EXTENT, layout.w - step.resize), h: layout.h } };
		case 'grow-height':
			return { type: 'scene.resize-widget', payload: { ...base, w: layout.w, h: layout.h + step.resize } };
		case 'shrink-height':
			return { type: 'scene.resize-widget', payload: { ...base, w: layout.w, h: Math.max(MIN_WIDGET_EXTENT, layout.h - step.resize) } };
		case 'layer-forward':
			return { type: 'scene.layer-widget', payload: { ...base, z: layout.z + 1 } };
		case 'layer-backward':
			return { type: 'scene.layer-widget', payload: { ...base, z: layout.z - 1 } };
		case 'dock-left':
			return { type: 'scene.dock-widget', payload: { ...base, dock: 'left' } };
		case 'dock-right':
			return { type: 'scene.dock-widget', payload: { ...base, dock: 'right' } };
		case 'dock-top':
			return { type: 'scene.dock-widget', payload: { ...base, dock: 'top' } };
		case 'dock-bottom':
			return { type: 'scene.dock-widget', payload: { ...base, dock: 'bottom' } };
		case 'dock-none':
			return { type: 'scene.dock-widget', payload: { ...base, dock: null } };
		case 'pin':
			return { type: 'scene.pin-widget', payload: { ...base, pinned: true } };
		case 'unpin':
			return { type: 'scene.pin-widget', payload: { ...base, pinned: false } };
		case 'focus-earlier':
			return {
				type: 'scene.set-focus-order',
				payload: { ...base, focusOrder: Math.max(0, (layout.focusOrder ?? 0) - 1) },
			};
		case 'focus-later':
			return {
				type: 'scene.set-focus-order',
				payload: { ...base, focusOrder: (layout.focusOrder ?? 0) + 1 },
			};
		case 'focus-clear':
			return { type: 'scene.set-focus-order', payload: { ...base, focusOrder: null } };
		case 'destroy':
			return { type: 'scene.destroy-widget', payload: { ...base } };
		case 'group-selection':
			return null;
	}
}
