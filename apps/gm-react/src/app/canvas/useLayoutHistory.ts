import { useCallback, useEffect, useRef, useState } from 'react';
import { buildWidgetInverse, type CoreCommand, type CoreStateSlice } from '@dndtools/core';

/**
 * RC-CAN-1.3 / ADR-029 §2 — the SCENE CANVAS UNDO STACK, and it lives here on purpose.
 *
 * The core exports only `buildWidgetInverse` (a pure command → inverse-command function). The stack
 * that remembers those inverses is app state, per-editing-session, and is NEVER synced — the same
 * shape `app/map/useMapEditor.ts:295` already uses for the map editor:
 *
 *   - a co-DM must not be able to undo your drag from across the table. Undo belongs to one person's
 *     editing session, not to the campaign.
 *   - undoing is an ORDINARY durable mutation: the inverse goes back through the screen's own
 *     `dispatch`, so it is authorized and op-logged like any other command. Nothing rewinds the log.
 *
 * The stack is dropped whenever `sceneId` changes: an inverse names a scene and a widget instance,
 * so carrying entries across a scene switch would let Ctrl+Z on scene B dispatch against scene A.
 */

/** Roadmap RC-CAN-1.3: stack depth 50. Older entries fall off the bottom. */
export const MAX_LAYOUT_HISTORY = 50;

interface LayoutHistoryEntry {
	/** The command the user ran, kept so redo can replay it. */
	forward: CoreCommand;
	/** The command that undoes `forward`, built against the state `forward` was dispatched on. */
	inverse: CoreCommand;
	/** Past tense, widget named: "Moved Timer". Drives both the button title and the announcement. */
	label: string;
}

/** A live region update. `seq` re-keys the node so REPEATING an identical undo still announces. */
export interface LayoutAnnouncement {
	text: string;
	seq: number;
}

export interface LayoutHistory {
	/** Dispatch `command` and, if the core accepts it and can invert it, remember it as one undo step. */
	run: (command: CoreCommand, label: string) => Promise<boolean>;
	undo: () => Promise<boolean>;
	redo: () => Promise<boolean>;
	canUndo: boolean;
	canRedo: boolean;
	/** "Moved Timer" — what the next Ctrl+Z would reverse, for the button's accessible name. */
	undoLabel: string | null;
	redoLabel: string | null;
	announcement: LayoutAnnouncement | null;
}

/** "Moved Timer" → "moved Timer", so the announcement reads "Undone: moved Timer". */
function asPhrase(label: string): string {
	return label.charAt(0).toLowerCase() + label.slice(1);
}

export function useLayoutHistory(options: {
	/** The scene the stack belongs to. A change clears it. `null` disables recording. */
	sceneId: string | null;
	/** The live Core state, read the instant before each dispatch. The screen passes its own
	 *  `SceneRuntime` rather than the hook reaching for the context, so the stack can be exercised
	 *  against a plain state holder in a test — including the resize case, which no shipped
	 *  system-tier widget currently exposes a control for. */
	runtime: { readonly state: CoreStateSlice };
	/** The screen's own guarded dispatch — it owns rejection and persist-failure messaging. */
	dispatch: (command: CoreCommand) => Promise<boolean>;
}): LayoutHistory {
	const { sceneId, dispatch, runtime } = options;
	const [past, setPast] = useState<LayoutHistoryEntry[]>([]);
	const [future, setFuture] = useState<LayoutHistoryEntry[]>([]);
	const [announcement, setAnnouncement] = useState<LayoutAnnouncement | null>(null);
	// Undo/redo read the stack inside an async callback, so they must not close over a stale render's
	// array — the map editor learned this the same way.
	const pastRef = useRef(past);
	const futureRef = useRef(future);
	const busyRef = useRef(false);
	const seqRef = useRef(0);
	pastRef.current = past;
	futureRef.current = future;

	useEffect(() => {
		setPast([]);
		setFuture([]);
		setAnnouncement(null);
	}, [sceneId]);

	const announce = useCallback((text: string) => {
		seqRef.current += 1;
		setAnnouncement({ text, seq: seqRef.current });
	}, []);

	const run = useCallback(
		async (command: CoreCommand, label: string): Promise<boolean> => {
			// Read the state BEFORE dispatching: every layout command overwrites its field outright, so
			// the value to restore only exists in the state the command was dispatched against.
			const stateBefore = runtime.state;
			const ok = await dispatch(command);
			if (!ok) return false;
			if (!sceneId) return true;
			const inverse = buildWidgetInverse(command, stateBefore);
			// Honestly not undoable (the core refuses `scene.add-widget` / `scene.group-widgets`, whose
			// handlers mint ids): leave the stack alone rather than pushing a wrong inverse.
			if (!inverse) return true;
			setPast((prev) =>
				[...prev, { forward: command, inverse: inverse.command, label }].slice(-MAX_LAYOUT_HISTORY),
			);
			// Any new action invalidates the redo branch — redoing onto a diverged layout would be a
			// different edit than the one the user reversed.
			setFuture([]);
			return true;
		},
		[dispatch, runtime, sceneId],
	);

	const undo = useCallback(async (): Promise<boolean> => {
		if (busyRef.current) return false;
		const entry = pastRef.current[pastRef.current.length - 1];
		if (!entry) return false;
		busyRef.current = true;
		try {
			const stateBefore = runtime.state;
			const ok = await dispatch(entry.inverse);
			if (!ok) return false;
			// Re-derive the forward command's inverse against the state the UNDO ran on, so a redo of it
			// can itself be undone exactly (revisions and neighbouring widgets have moved on).
			const redone = buildWidgetInverse(entry.inverse, stateBefore);
			setPast((prev) => prev.slice(0, -1));
			setFuture((prev) =>
				[
					...prev,
					{ forward: redone?.command ?? entry.forward, inverse: entry.inverse, label: entry.label },
				].slice(-MAX_LAYOUT_HISTORY),
			);
			announce(`Undone: ${asPhrase(entry.label)}`);
			return true;
		} finally {
			busyRef.current = false;
		}
	}, [announce, dispatch, runtime]);

	const redo = useCallback(async (): Promise<boolean> => {
		if (busyRef.current) return false;
		const entry = futureRef.current[futureRef.current.length - 1];
		if (!entry) return false;
		busyRef.current = true;
		try {
			const stateBefore = runtime.state;
			const ok = await dispatch(entry.forward);
			if (!ok) return false;
			const inverse = buildWidgetInverse(entry.forward, stateBefore);
			setFuture((prev) => prev.slice(0, -1));
			setPast((prev) =>
				[
					...prev,
					{
						forward: entry.forward,
						inverse: inverse?.command ?? entry.inverse,
						label: entry.label,
					},
				].slice(-MAX_LAYOUT_HISTORY),
			);
			announce(`Redone: ${asPhrase(entry.label)}`);
			return true;
		} finally {
			busyRef.current = false;
		}
	}, [announce, dispatch, runtime]);

	return {
		run,
		undo,
		redo,
		canUndo: past.length > 0,
		canRedo: future.length > 0,
		undoLabel: past.length > 0 ? past[past.length - 1].label : null,
		redoLabel: future.length > 0 ? future[future.length - 1].label : null,
		announcement,
	};
}
