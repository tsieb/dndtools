import { useRef, useState } from 'react';
import type { WidgetLibraryEntry } from '@dndtools/core';
import { Toaster } from '../../ds';
import { useI18n } from '../../i18n';
import type { useRuntime } from '../../runtime/RuntimeContext';
import { widgetRejectionMessage } from '../../app/widget-rejection';
import {
	addTileCommand,
	boardLayoutIssues,
	clampToColumns,
	clampWidthToColumns,
	repackBoardColumns,
	type BoardWidget,
} from '../../app/board-helpers';
import { useLayoutHistory } from '../../app/canvas/useLayoutHistory';

/**
 * RC-POL-1.2 — the board's writes, out of `Board.tsx`: the guarded dispatch behind every board
 * command, the undo stack, and the move / resize / remove / operate / add / fix-layout handlers the
 * canvas, the inspector and the layout banner share.
 */
export function useBoardActions({
	runtime,
	sceneId,
	sceneRevision,
	widgets,
	flow,
	editing,
	setEditing,
	setSelectedId,
	newIdempotencyKey,
}: {
	runtime: ReturnType<typeof useRuntime>;
	sceneId: string;
	/** The scene revision a widget command's envelope carries (`expectedRevision`). */
	sceneRevision: number;
	widgets: BoardWidget[];
	flow: boolean;
	editing: boolean;
	setEditing: (next: boolean) => void;
	setSelectedId: (update: (current: string | null) => string | null) => void;
	/** A fresh key per widget command (minted by the screen, under its platform-access exception). */
	newIdempotencyKey: () => string;
}) {
	const { t } = useI18n();
	const actorId = runtime.defaultActorId;
	const [status, setStatus] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	// `SceneRuntime.dispatchNow` RETHROWS after a failed `persistFullState`, and every caller here is
	// fire-and-forget (`void onMove(...)`, `onClick={savePreset}`), so an IndexedDB quota or
	// private-mode failure produced an unhandled rejection, no message at all, and the optimistic
	// draft was dropped — the widget silently snapped back to where it had been.
	async function dispatch(command: Parameters<typeof runtime.dispatch>[0]): Promise<boolean> {
		// Clear before the attempt, not only after it. `error` renders inside a `role="alert"`, which
		// announces on INSERTION — and setting the identical string again is an `Object.is` bail-out,
		// so React never re-renders and a REPEATED identical failure (press save, it fails, press save,
		// it fails again) was announced exactly once. Clearing first guarantees the region is removed
		// and re-inserted, and the await below always puts the two updates in separate ticks.
		setError(null);
		let result;
		try {
			result = await runtime.dispatch(command);
		} catch {
			setStatus(null);
			setError(t('board.persistFailed'));
			return false;
		}
		if (result.status === 'rejected') {
			// A rejection is NOT a confirmation: routing both into `status` rendered "that change
			// couldn't be applied" in the same neutral grey, with the same info icon, as "Layout saved".
			setStatus(null);
			setError(widgetRejectionMessage(result.rejection));
			return false;
		}
		setError(null);
		// A confirmation describes ONE action. `status` was only ever cleared on rejection, so a
		// "Layout 'Combat night' saved." (or the restore-a-safe-point offer) survived every later move,
		// resize, add and preset apply — the live region kept asserting something that was no longer
		// true. Callers that want a message set it immediately after their own dispatch resolves.
		setStatus(null);
		return true;
	}

	const history = useLayoutHistory({ sceneId, runtime, dispatch });
	// A stable callback for the Undo toast: the toast store lives outside React, so the closure it
	// keeps must not capture a particular render's stack.
	const historyRef = useRef(history);
	historyRef.current = history;
	const undoLast = () => {
		void historyRef.current.undo();
	};

	// RC-CAN-1.3: every layout write goes through the local undo stack, so `Ctrl+Z` and the canvas's
	// Undo button reverse it by dispatching the core-built inverse — an ordinary durable command.
	const titleOf = (widgetInstanceId: string) =>
		widgets.find((w) => w.id === widgetInstanceId)?.title ?? t('boardCanvas.step.untitled');

	// RC-CAN-3.3: the bounded board has no free horizontal scroll (SceneBoardCanvas fit-scales its
	// whole extent to the pane), so a drag or arrow-nudge past the board's own right edge either
	// dragged that scale down for every widget or landed invisibly on another one. Every move/resize
	// is clamped to the board's columns here, at the one place both the pointer and keyboard paths
	// (SceneBoardCanvas's `onMove`/`onResize`) commit through — the drop is "snapped back" onto the
	// grid instead of silently growing the board.
	function move(widgetInstanceId: string, x: number, y: number) {
		const widget = widgets.find((w) => w.id === widgetInstanceId);
		// Flow uses x/y as order keys, including negative y when moving before the first tile.
		const clampedX = widget && !flow ? clampToColumns(x, widget.w) : x;
		return history.run(
			{
				type: 'scene.move-widget',
				actorId,
				payload: { sceneId, widgetInstanceId, x: clampedX, y: flow ? y : Math.max(0, y) },
			},
			t('boardCanvas.step.moved', { title: titleOf(widgetInstanceId) }),
		);
	}
	function resize(widgetInstanceId: string, w: number, h: number) {
		const widget = widgets.find((wid) => wid.id === widgetInstanceId);
		const clampedW = widget && !flow ? clampWidthToColumns(widget.x, w) : w;
		return history.run(
			{
				type: 'scene.resize-widget',
				actorId,
				payload: { sceneId, widgetInstanceId, w: clampedW, h },
			},
			t('boardCanvas.step.resized', { title: titleOf(widgetInstanceId) }),
		);
	}
	// The banner's fix: a deterministic greedy repack of every widget back into the board's columns,
	// each changed position committed as its own `scene.move-widget` (the same undoable path a drag
	// takes), so "Fix layout" is a real durable action rather than a client-only visual snap.
	const layoutIssues = flow ? [] : boardLayoutIssues(widgets);
	async function fixLayout() {
		const next = repackBoardColumns(widgets);
		for (const widget of widgets) {
			const pos = next.get(widget.id);
			if (!pos || (pos.x === widget.x && pos.y === widget.y)) continue;
			await move(widget.id, pos.x, pos.y);
		}
		setStatus(t('board.layoutFixed'));
	}
	// Delete/Backspace and the inspector share the same recoverable removal.
	// RC-CAN-1.2 gave the core `scene.restore-widget`, so removal happens immediately and
	// offers Undo in a toast — the toast holds open until it is taken or dismissed (Toast.jsx pins any
	// toast carrying an action), and the same reversal is on `Ctrl+Z`.
	async function remove(widgetInstanceId: string) {
		const title = titleOf(widgetInstanceId);
		setSelectedId((cur) => (cur === widgetInstanceId ? null : cur));
		const ok = await history.run(
			{
				type: 'scene.destroy-widget',
				actorId,
				payload: { sceneId, widgetInstanceId },
			},
			t('boardCanvas.step.removed', { title }),
		);
		if (ok)
			Toaster.show({
				message: t('boardCanvas.removedToast', { title }),
				action: t('common.action.undo'),
				onAction: undoLast,
			});
	}
	// VIEW-mode widget operation (SES-005/SES-003): a widget-DECLARED durable command through the one
	// envelope the core accepts — fresh idempotencyKey per press + the scene's current revision.
	async function operateWidget(
		widgetInstanceId: string,
		commandType: string,
		payload: Record<string, unknown>,
	) {
		const ok = await history.run(
			{
				type: 'widget.dispatch-command',
				actorId,
				idempotencyKey: newIdempotencyKey(),
				payload: {
					sceneId,
					widgetInstanceId,
					commandType,
					payload,
					expectedRevision: sceneRevision,
				},
			},
			t('boardCanvas.step.changed', { title: titleOf(widgetInstanceId) }),
		);
		if (ok) setStatus(null);
	}
	// RC-CAN-4.1: the gallery chooses the slot and focuses the placed tile. RC-CAN-8.1: sized from
	// the one default-size table, and an undo step like every other edit. RC-CAN-8.5: the slot comes
	// from the shared `placeNewTile` (the first free one in view, at the size the table gives), so
	// the board takes it as given, and the gallery hands the new tile back to be selected.
	async function addWidget(entry: WidgetLibraryEntry, position: { x: number; y: number }) {
		const command = addTileCommand(entry, sceneId, position, flow ? 'flow' : 'bounded');
		if (!command) return false;
		const ok = await history.run(
			{ type: command.type, actorId, payload: command.payload },
			t('boardCanvas.step.added', { title: entry.displayName }),
		);
		if (ok && !editing) setEditing(true);
		return ok;
	}

	return {
		status,
		setStatus,
		error,
		dispatch,
		history,
		historyRef,
		titleOf,
		move,
		resize,
		layoutIssues,
		fixLayout,
		remove,
		operateWidget,
		addWidget,
	};
}
