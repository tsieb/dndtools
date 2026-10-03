import { useRef, useState } from 'react';
import {
	screenLayoutPolicy,
	type Scene,
	type SceneBackground,
	type WidgetLibraryEntry,
} from '@dndtools/core';
import { Toaster } from '../../ds';
import type { SceneRuntime } from '../../runtime/SceneRuntime';
import { widgetRejectionMessage } from '../../app/widget-rejection';
import { useLayoutHistory } from '../../app/canvas/useLayoutHistory';
import { addTileCommand, type BoardWidget } from '../../app/board-helpers';
import { useI18n } from '../../i18n';

export interface SceneMetadataDraft {
	name: string;
	description: string;
	tags: string[];
	visualSettings: { background: SceneBackground };
}

/**
 * Every durable write the scene editor makes, through the single dispatch choke point:
 * `scene.add-widget`, `scene.move-widget`, `scene.resize-widget`, `scene.configure-widget`,
 * `scene.destroy-widget`, `scene.set-layout-policy`, `scene.set-focus-order`,
 * `scene.update-metadata` and a widget's own declared commands (`widget.dispatch-command`).
 * Moved out of `index.tsx` by RC-POL-1.3; the screen keeps the view state.
 */
export function useSceneCommands({
	runtime,
	sceneId,
	scene,
	widgets,
}: {
	runtime: SceneRuntime;
	sceneId: string;
	scene: Scene | undefined;
	widgets: BoardWidget[];
}) {
	const { t } = useI18n();
	const actorId = runtime.defaultActorId;
	const [error, setError] = useState<string | null>(null);
	const configQueue = useRef(Promise.resolve());

	// `SceneRuntime.dispatchNow` RETHROWS after a failed `persistFullState`, and every caller here is
	// fire-and-forget (`void onMove(...)`, `onClick={savePreset}`), so an IndexedDB quota or
	// private-mode failure produced an unhandled rejection, no message at all, and the optimistic
	// draft was dropped — the widget silently snapped back to where it had been.
	async function dispatch(command: Parameters<typeof runtime.dispatch>[0]): Promise<boolean> {
		// Clear before the attempt: `error` lives in a `role="alert"`, which announces on INSERTION,
		// and re-setting the identical string is an `Object.is` bail-out — so a REPEATED identical
		// failure re-rendered nothing and was announced only the first time.
		setError(null);
		let result;
		try {
			result = await runtime.dispatch(command);
		} catch {
			setError(t('sceneEditor.persistFailed'));
			return false;
		}
		if (result.status === 'rejected') {
			setError(widgetRejectionMessage(result.rejection));
			return false;
		}
		return true;
	}

	// RC-CAN-1.3: the local, never-synced undo stack for this scene. It is cleared whenever the id
	// changes, so Ctrl+Z on one scene can never dispatch an inverse addressed to the previous one.
	const history = useLayoutHistory({ sceneId: sceneId || null, runtime, dispatch });
	// The Undo toast's callback outlives the render that raised it (the toast store is outside React),
	// so it reads the stack through a ref rather than closing over one render's copy.
	const historyRef = useRef(history);
	historyRef.current = history;
	const titleOf = (widgetInstanceId: string) =>
		widgets.find((w) => w.id === widgetInstanceId)?.title ?? t('sceneEditor.widgetFallback');

	function move(widgetInstanceId: string, x: number, y: number) {
		return history.run(
			{ type: 'scene.move-widget', actorId, payload: { sceneId, widgetInstanceId, x, y } },
			t('sceneEditor.history.moved', { name: titleOf(widgetInstanceId) }),
		);
	}
	function resize(widgetInstanceId: string, w: number, h: number) {
		return history.run(
			{ type: 'scene.resize-widget', actorId, payload: { sceneId, widgetInstanceId, w, h } },
			t('sceneEditor.history.resized', { name: titleOf(widgetInstanceId) }),
		);
	}
	// The policy is durable scene state, not a view toggle: `scene.set-layout-policy` writes the
	// policy and nothing else, so widget identity, configuration and bindings come through untouched.
	function setLayoutPolicy(current: string, next: string) {
		if (next === current) return;
		return dispatch({
			type: 'scene.set-layout-policy',
			actorId,
			payload: { sceneId, layoutPolicy: next },
		});
	}
	// RC-CAN-4.1: the gallery picks the first open slot and focuses the placed tile.
	// RC-CAN-8.1: sized from the shared default-size table, and undoable like every other edit.
	async function addWidget(entry: WidgetLibraryEntry, position: { x: number; y: number }) {
		const policy = scene && screenLayoutPolicy(scene) === 'flow' ? 'flow' : 'canvas';
		const command = addTileCommand(entry, sceneId, position, policy);
		if (!command) return false;
		return history.run(
			{ type: command.type, actorId, payload: command.payload },
			t('sceneEditor.history.added', { name: entry.displayName }),
		);
	}
	// Removing a widget used to stage a confirm dialog, because a destroy took the instance's
	// configuration with it for good. RC-CAN-1.2 gave the core `scene.restore-widget`, so both entry
	// points (the Inspector's Remove button and Delete/Backspace on a focused frame) now just do it
	// and offer Undo — in a toast that holds open until it is taken or dismissed, and on Ctrl+Z.
	async function destroy(widgetInstanceId: string) {
		const removed = t('sceneEditor.history.removed', { name: titleOf(widgetInstanceId) });
		const ok = await history.run(
			{ type: 'scene.destroy-widget', actorId, payload: { sceneId, widgetInstanceId } },
			removed,
		);
		if (ok) {
			Toaster.show({
				message: removed,
				action: t('common.action.undo'),
				onAction: () => {
					void historyRef.current.undo();
				},
			});
		}
	}
	// VIEW-mode widget operation (SES-005/SES-003): dispatch a widget-DECLARED durable command through
	// the one envelope the core accepts — fresh idempotencyKey per press + the scene's current revision
	// (`expectedRevision`, packages/core/src/commands/widget-command.ts).
	function operateWidget(
		widgetInstanceId: string,
		commandType: string,
		payload: Record<string, unknown>,
	) {
		if (!scene) return;
		return dispatch({
			type: 'widget.dispatch-command',
			actorId,
			idempotencyKey: runtime.newId(),
			payload: {
				sceneId,
				widgetInstanceId,
				commandType,
				payload,
				expectedRevision: scene.ownership.revision,
			},
		});
	}
	// SCENE METADATA (scene.update-metadata) — scenes are no longer permanently named at creation.
	async function saveMetadata(meta: SceneMetadataDraft) {
		const ok = await dispatch({
			type: 'scene.update-metadata',
			actorId,
			payload: { sceneId, ...meta },
		});
		// The panel closes on success, so its Save button takes the only visible confirmation with it.
		if (ok) Toaster.success(t('sceneEditor.detailsSaved'));
		return ok;
	}
	// CANVAS-016 — pin a widget's explicit keyboard traversal position (null clears it back to the
	// core's derived order).
	function setFocusOrder(widgetInstanceId: string, focusOrder: number | null) {
		return dispatch({
			type: 'scene.set-focus-order',
			actorId,
			payload: { sceneId, widgetInstanceId, focusOrder },
		});
	}
	// Round-trip a single declared config field through the core. A free-form configuration merge —
	// exactly what `scene.configure-widget` persists — so the canvas body re-renders from the new value
	// and the edit survives reload identically to any other authored change.
	function setConfig(widgetInstanceId: string, key: string, value: unknown) {
		// A blur and a discrete field change can arrive before persistence re-renders the panel.
		// Read the latest configuration after prior edits commit so one tab cannot erase another.
		configQueue.current = configQueue.current.then(async () => {
			const latest = runtime.state.scenes.scenes[sceneId]?.widgets.find(
				(w) => w.id === widgetInstanceId,
			);
			if (!latest) return;
			await dispatch({
				type: 'scene.configure-widget',
				actorId,
				payload: {
					sceneId,
					widgetInstanceId,
					configuration: { ...latest.configuration, [key]: value },
				},
			});
		});
		return configQueue.current;
	}

	return {
		error,
		clearError: () => setError(null),
		history,
		undo: () => void historyRef.current.undo(),
		move,
		resize,
		setLayoutPolicy,
		addWidget,
		destroy,
		operateWidget,
		saveMetadata,
		setFocusOrder,
		setConfig,
	};
}
