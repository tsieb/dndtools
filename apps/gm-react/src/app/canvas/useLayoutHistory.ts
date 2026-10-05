import { useCallback, useEffect, useRef, useState } from 'react';
import {
	buildWidgetInverse,
	findWidgetDefinition,
	type CoreCommand,
	type CoreStateSlice,
	type SyncOperation,
} from '@dndtools/core';

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

/**
 * One undo step. RC-CAN-8.1 made a step a LIST of commands, so the moves of one keyboard burst or one
 * group drag, and every tile a template places, come back with one Ctrl+Z. `forward` replays in
 * order; `inverse` is already in undo order (last command's inverse first).
 */
interface LayoutHistoryEntry {
	forward: CoreCommand[];
	inverse: CoreCommand[];
	/** Past tense, widget named: "Moved Timer". Drives both the button title and the announcement. */
	label: string;
}

/** A live region update. `seq` re-keys the node so REPEATING an identical undo still announces. */
export interface LayoutAnnouncement {
	text: string;
	seq: number;
}

export interface LayoutHistory {
	/** Dispatch `command` and, if the core accepts it and it can be inverted, remember it as one undo
	 *  step — or fold it into the open burst's step (see `beginBurst`). */
	run: (command: CoreCommand, label: string) => Promise<boolean>;
	/** Open a burst: every `run` until `settle` folds into ONE step (a keyboard nudge run, a drag). */
	beginBurst: () => void;
	/** Close the open burst, if any — Escape, blur, pointer-up. The next `run` starts a new step. */
	settle: () => void;
	/** One gesture, one step: every `run` inside `work` (a group drag, an arrange) folds together. */
	oneStep: (work: () => Promise<unknown>) => Promise<void>;
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

/** Commands that place tiles. The core cannot invert them from the state BEFORE (their handler
 *  mints the ids), so the app reads the placed ids off the state AFTER — ADR-029 §1. */
const PLACING = new Set(['scene.add-widget', 'scene.apply-template', 'scene.duplicate-widget']);

/**
 * The commands that undo `command`, in undo order, or `null` when it honestly cannot be undone.
 * A placing command is undone by destroying each tile it added; the destroy's own inverse is the
 * tombstone restore, so a redo brings back the SAME instances rather than fresh copies.
 */
export function inverseCommands(
	command: CoreCommand,
	before: CoreStateSlice,
	after: CoreStateSlice,
): CoreCommand[] | null {
	const built = buildWidgetInverse(command, before);
	if (built) return [built.command];
	if (command.type === 'scene.update-metadata') return backgroundInverse(command, before);
	if (!PLACING.has(command.type)) return null;
	const sceneId = (command.payload as { sceneId?: unknown } | undefined)?.sceneId;
	if (typeof sceneId !== 'string') return null;
	const was = before.scenes.scenes[sceneId];
	const now = after.scenes.scenes[sceneId];
	const existed = new Set(was?.widgets.map((w) => w.id) ?? []);
	const placed = (now?.widgets ?? []).filter((w) => !existed.has(w.id));
	if (!was || placed.length === 0) return null;
	const inverse: CoreCommand[] = placed.reverse().map((w) => ({
		type: 'scene.destroy-widget',
		actorId: command.actorId,
		payload: { sceneId, widgetInstanceId: w.id },
	}));
	// A template applied to an EMPTY scene brings its background too; put the old one back.
	if (now && now.visualSettings.background !== was.visualSettings.background)
		inverse.push(restoreBackground(command.actorId, sceneId, was.visualSettings));
	return inverse;
}

function restoreBackground(
	actorId: string,
	sceneId: string,
	{ background, accentColor }: { background: string; accentColor?: string },
): CoreCommand {
	return {
		type: 'scene.update-metadata',
		actorId,
		payload: { sceneId, visualSettings: { background, ...(accentColor ? { accentColor } : {}) } },
	};
}

/** Only the background restore this stack itself issues is invertible; any other metadata edit
 *  belongs to the scene's details panel, not to the layout history. */
function backgroundInverse(command: CoreCommand, before: CoreStateSlice): CoreCommand[] | null {
	const payload = command.payload as {
		sceneId?: unknown;
		visualSettings?: unknown;
		[key: string]: unknown;
	};
	const fields = Object.keys(payload ?? {}).filter((key) => key !== 'sceneId');
	if (typeof payload?.sceneId !== 'string' || fields.join() !== 'visualSettings') return null;
	const was = before.scenes.scenes[payload.sceneId];
	return was ? [restoreBackground(command.actorId, payload.sceneId, was.visualSettings)] : null;
}

/**
 * RC-CAN-8.1 — the undo step for ONE placing dispatch, read off the operation the core logged for it
 * (an add or a duplicate names its instance; a template appends its tiles last) and the state the
 * screen last saw (the background a template replaced). Never off a diff of the whole scene: another
 * placement queued in the runtime at the same time would be taken back with it. `null` for anything
 * else.
 */
function placementStep(
	op: SyncOperation,
	sceneId: string,
	seen: CoreStateSlice,
	after: CoreStateSlice,
): { command: CoreCommand; inverse: CoreCommand[]; label: string } | null {
	if (op.entityType !== 'scene' || op.entityId !== sceneId) return null;
	const now = after.scenes.scenes[sceneId];
	if (!now) return null;
	let placed: string[] = [];
	let label = 'Applied template';
	if (op.opType === 'scene.add-widget' || op.opType === 'scene.duplicate-widget') {
		const widget = op.value as {
			id?: unknown;
			type?: unknown;
			configuration?: { title?: unknown };
		} | null;
		if (typeof widget?.id !== 'string') return null;
		placed = [widget.id];
		const title =
			typeof widget.configuration?.title === 'string' && widget.configuration.title.trim()
				? widget.configuration.title
				: typeof widget.type === 'string'
					? (findWidgetDefinition(after.widgets, widget.type)?.displayName ?? widget.type)
					: 'tile';
		label = `Added ${title}`;
	} else if (op.opType === 'scene.apply-template') {
		const count = (op.value as { appliedWidgetCount?: unknown } | null)?.appliedWidgetCount;
		if (typeof count !== 'number' || count < 1) return null;
		placed = now.widgets.slice(-count).map((w) => w.id);
	} else return null;
	if (!placed.every((id) => now.widgets.some((w) => w.id === id))) return null;
	const command: CoreCommand = {
		type: op.opType,
		actorId: op.actorId,
		payload: { sceneId },
	} as CoreCommand;
	const inverse: CoreCommand[] = [...placed].reverse().map((id) => ({
		type: 'scene.destroy-widget',
		actorId: op.actorId,
		payload: { sceneId, widgetInstanceId: id },
	}));
	const was = seen.scenes.scenes[sceneId];
	if (
		was &&
		!was.widgets.some((w) => placed.includes(w.id)) &&
		was.visualSettings.background !== now.visualSettings.background
	)
		inverse.push(restoreBackground(op.actorId, sceneId, was.visualSettings));
	return { command, inverse, label };
}

/** A keyboard burst or one gesture, and the step it has written so far. */
interface Burst {
	entry: LayoutHistoryEntry | null;
}

/**
 * A placing command this hook has handed to the runtime and not yet seen signalled. `run` claims its
 * own (the runtime's signal then records it under the run's label and burst); undo and redo claim
 * the commands they replay, so their signal records nothing. A placement nobody claimed — the
 * palette's Add tile, the template picker — is a new action of its own.
 */
interface Claim {
	command: CoreCommand;
	label: string | null;
	burst: Burst | null;
}

/** Whether `op` is the operation `command` logs. Two identical adds are interchangeable, so the
 *  oldest claim of the same shape takes the first such operation. */
function claims(command: CoreCommand, op: SyncOperation): boolean {
	if (command.type !== op.opType || command.actorId !== op.actorId) return false;
	const payload = command.payload as {
		sceneId?: unknown;
		widget?: { type?: unknown };
		copyId?: unknown;
	};
	if (payload.sceneId !== op.entityId) return false;
	const placed = op.value as { id?: unknown; type?: unknown } | null;
	if (command.type === 'scene.add-widget') return payload.widget?.type === placed?.type;
	if (command.type === 'scene.duplicate-widget' && typeof payload.copyId === 'string')
		return payload.copyId === placed?.id;
	return true;
}

/** Move and resize overwrite their field outright, so within one step only the LAST command per
 *  widget matters — forward keeps the newest, inverse (in undo order) the oldest. */
function lastPerWidget(commands: readonly CoreCommand[]): CoreCommand[] {
	const keyOf = (command: CoreCommand) =>
		command.type === 'scene.move-widget' || command.type === 'scene.resize-widget'
			? `${command.type}:${(command.payload as { widgetInstanceId?: string }).widgetInstanceId}`
			: null;
	return commands.filter((command, index) => {
		const key = keyOf(command);
		return key === null || !commands.slice(index + 1).some((later) => keyOf(later) === key);
	});
}

/** Replay keys for a runtime without its own id source (a plain state holder in a test). */
let replaySeq = 0;

/** History replay is a new operation against the current revision, never an idempotent retry. */
function prepareWidgetCommand(
	command: CoreCommand,
	state: CoreStateSlice,
	newId: () => string,
): CoreCommand {
	if (command.type !== 'widget.dispatch-command') return command;
	const payload = command.payload as { sceneId: string; expectedRevision: number };
	return {
		...command,
		idempotencyKey: newId(),
		payload: {
			...payload,
			expectedRevision:
				state.scenes.scenes[payload.sceneId]?.ownership.revision ?? payload.expectedRevision,
		},
	};
}

export function useLayoutHistory(options: {
	/** The scene the stack belongs to. A change clears it. `null` disables recording. */
	sceneId: string | null;
	/** The live Core state, read the instant before (and after) each dispatch. The screen passes its
	 *  own `SceneRuntime` rather than the hook reaching for the context, so the stack can be
	 *  exercised against a plain state holder in a test. */
	runtime: {
		readonly state: CoreStateSlice;
		/** `SceneRuntime`'s "accepted local dispatch" signal. With it, tiles placed by a dispatch that
		 *  bypassed `run` (palette Add tile, template picker) still become one undo step. */
		onDispatched?: (listener: (ops: SyncOperation[], next: CoreStateSlice) => void) => () => void;
		/** Only this device's own placements are recorded — never a co-DM's or the assistant's. */
		readonly defaultActorId?: string;
		/** `SceneRuntime`'s id source, for the fresh idempotency key each widget-command replay needs. */
		newId?: () => string;
	};
	/** The screen's own guarded dispatch — it owns rejection and persist-failure messaging. */
	dispatch: (command: CoreCommand) => Promise<boolean>;
}): LayoutHistory {
	const { sceneId, dispatch, runtime } = options;
	const newId = useCallback(() => runtime.newId?.() ?? `history-replay-${++replaySeq}`, [runtime]);
	const [past, setPast] = useState<LayoutHistoryEntry[]>([]);
	const [future, setFuture] = useState<LayoutHistoryEntry[]>([]);
	const [announcement, setAnnouncement] = useState<LayoutAnnouncement | null>(null);
	// The stacks live in refs as the source of truth and mirror into state for rendering. Undo/redo
	// read them inside async callbacks, so they must not close over a stale render's array (the map
	// editor learned that the same way) — and `run` writes them the moment the core accepts, BEFORE
	// the re-render, so a Ctrl+Z that lands right behind an arrow-key nudge still finds the entry
	// instead of silently doing nothing.
	//
	// RC-CAN-8.1 — `run`, undo and redo go through ONE queue, so each reads the state its own
	// dispatch lands on (the runtime queues dispatches behind the vault persist: a nudge read the
	// instant its key went down would invert against a layout the previous nudge is about to
	// replace), and an undo waits for every run still in flight.
	const pastRef = useRef<LayoutHistoryEntry[]>([]);
	const futureRef = useRef<LayoutHistoryEntry[]>([]);
	const queueRef = useRef<Promise<unknown>>(Promise.resolve());
	const busyRef = useRef(false);
	const seqRef = useRef(0);
	// Counts recorded actions, so an undo or redo can tell that a new one landed while it replayed.
	const actionsRef = useRef(0);
	const claimsRef = useRef<Claim[]>([]);
	// RC-CAN-8.1 — the open burst. A `run` captures the burst open at the moment it is CALLED, so a
	// nudge still persisting when Escape or blur settles the burst folds into that burst's step rather
	// than becoming a step of its own. `entry` is the step the burst has written so far: only that
	// step may be extended; anything pushed over it ends the fold.
	const burstRef = useRef<Burst | null>(null);
	const commitPast = useCallback((next: LayoutHistoryEntry[]) => {
		pastRef.current = next;
		setPast(next);
	}, []);
	const commitFuture = useCallback((next: LayoutHistoryEntry[]) => {
		futureRef.current = next;
		setFuture(next);
	}, []);
	const queuedRef = useRef(0);
	const enqueue = useCallback(<T>(job: () => Promise<T>): Promise<T> => {
		// An idle queue starts the job NOW, so the core holds the edit the moment `run` is called.
		const idle = queuedRef.current === 0;
		queuedRef.current += 1;
		const task = (idle ? job() : queueRef.current.then(job, job)).finally(() => {
			queuedRef.current -= 1;
		});
		queueRef.current = task.catch(() => undefined);
		return task;
	}, []);
	const settle = useCallback(() => {
		burstRef.current = null;
	}, []);
	const beginBurst = useCallback(() => {
		burstRef.current ??= { entry: null };
	}, []);
	const oneStep = useCallback(
		async (work: () => Promise<unknown>) => {
			settle();
			beginBurst();
			try {
				await work();
			} finally {
				settle();
			}
		},
		[beginBurst, settle],
	);

	useEffect(() => {
		commitPast([]);
		commitFuture([]);
		setAnnouncement(null);
		settle();
	}, [sceneId, commitPast, commitFuture, settle]);

	const announce = useCallback((text: string) => {
		seqRef.current += 1;
		setAnnouncement({ text, seq: seqRef.current });
	}, []);

	/** Push one accepted command (with its inverse) — or fold it into the open burst's step. */
	const remember = useCallback(
		(command: CoreCommand, inverse: CoreCommand[], label: string, burst: Burst | null) => {
			const stack = pastRef.current;
			const top = stack[stack.length - 1];
			const open = burst?.entry ?? null;
			const folding = open !== null && top === open;
			const entry: LayoutHistoryEntry = folding
				? {
						forward: lastPerWidget([...open.forward, command]),
						inverse: lastPerWidget([...inverse, ...open.inverse]),
						label,
					}
				: { forward: [command], inverse, label };
			if (burst) burst.entry = entry;
			actionsRef.current += 1;
			commitPast([...(folding ? stack.slice(0, -1) : stack), entry].slice(-MAX_LAYOUT_HISTORY));
			// Any new action invalidates the redo branch — redoing onto a diverged layout would be
			// a different edit than the one the user reversed.
			commitFuture([]);
		},
		[commitFuture, commitPast],
	);

	const run = useCallback(
		(command: CoreCommand, label: string): Promise<boolean> => {
			// The burst is the one open when the edit was MADE, not when its turn in the queue comes.
			const burst = burstRef.current;
			return enqueue(async () => {
				if (sceneId && runtime.onDispatched && PLACING.has(command.type)) {
					// Which tiles this command placed is only known from the operation it logs: the
					// runtime's signal records the step, inside the runtime's own serialization.
					const claim: Claim = { command, label, burst };
					claimsRef.current.push(claim);
					try {
						return await dispatch(command);
					} finally {
						claimsRef.current = claimsRef.current.filter((c) => c !== claim);
					}
				}
				// Read the state BEFORE dispatching: every layout command overwrites its field outright,
				// so the value to restore only exists in the state the command was dispatched against.
				const stateBefore = runtime.state;
				const prepared = prepareWidgetCommand(command, stateBefore, newId);
				const ok = await dispatch(prepared);
				if (!ok) return false;
				if (!sceneId) return true;
				const inverse = inverseCommands(prepared, stateBefore, runtime.state);
				// Honestly not undoable (`scene.group-widgets` mints a group id no command can take
				// back): leave the stack alone rather than pushing a wrong inverse.
				if (inverse) remember(prepared, inverse, label, burst);
				return true;
			});
		},
		[dispatch, enqueue, newId, remember, runtime, sceneId],
	);

	// The state the screen last rendered: the runtime signals a dispatch before it re-renders, so
	// this is still the scene as it stood before a placement.
	const seenRef = useRef(runtime.state);
	seenRef.current = runtime.state;
	useEffect(() => {
		if (!sceneId || !runtime.onDispatched) return;
		return runtime.onDispatched((ops, next) => {
			for (const op of ops) {
				const claim = claimsRef.current.find((c) => claims(c.command, op));
				if (claim) claimsRef.current = claimsRef.current.filter((c) => c !== claim);
				// An undo/redo replay is not a new action; nor is a co-DM's or the assistant's.
				const foreign = !!runtime.defaultActorId && op.actorId !== runtime.defaultActorId;
				if (claim ? claim.label === null : foreign) continue;
				const step = placementStep(op, sceneId, seenRef.current, next);
				if (step)
					remember(
						claim?.command ?? step.command,
						step.inverse,
						claim?.label ?? step.label,
						claim?.burst ?? null,
					);
			}
			seenRef.current = next;
		});
	}, [remember, runtime, sceneId]);

	/** Dispatch `commands` in order. `inverse` is the exact undo of what ran (in undo order), or
	 *  `null` when some step could not be inverted against the state it ran on. */
	const replay = useCallback(
		async (
			commands: readonly CoreCommand[],
		): Promise<{ ok: boolean; inverse: CoreCommand[] | null }> => {
			let inverse: CoreCommand[] | null = [];
			for (const queued of commands) {
				const before = runtime.state;
				const command = prepareWidgetCommand(queued, before, newId);
				const claim: Claim = { command, label: null, burst: null };
				if (PLACING.has(command.type)) claimsRef.current.push(claim);
				try {
					if (!(await dispatch(command))) return { ok: false, inverse: null };
				} finally {
					claimsRef.current = claimsRef.current.filter((c) => c !== claim);
				}
				const step = inverseCommands(command, before, runtime.state);
				inverse = step && inverse ? [...step, ...inverse] : null;
			}
			return { ok: true, inverse };
		},
		[dispatch, newId, runtime],
	);

	/** Reverse the top step. Runs in the queue, after every edit made before it. */
	const undoTop = useCallback(async (): Promise<boolean> => {
		const entry = pastRef.current[pastRef.current.length - 1];
		if (!entry) return false;
		const actions = actionsRef.current;
		const { ok, inverse: redone } = await replay(entry.inverse);
		if (!ok) return false;
		// An edit made while the undo replayed (a palette add between two of a template's destroys)
		// is now on top: take out THIS entry, not whatever is last.
		commitPast(pastRef.current.filter((e) => e !== entry));
		// That edit also closed the redo branch, so only an undo nothing interrupted can be redone.
		// Re-derive the forward commands against the state the UNDO ran on, so a redo can itself
		// be undone exactly (revisions and neighbouring widgets have moved on) — and so the redo of
		// an add RESTORES the destroyed instances instead of placing fresh ones.
		if (actionsRef.current === actions)
			commitFuture(
				[
					...futureRef.current,
					{ forward: redone ?? entry.forward, inverse: entry.inverse, label: entry.label },
				].slice(-MAX_LAYOUT_HISTORY),
			);
		announce(`Undone: ${asPhrase(entry.label)}`);
		return true;
	}, [announce, commitFuture, commitPast, replay]);

	const redoTop = useCallback(async (): Promise<boolean> => {
		const entry = futureRef.current[futureRef.current.length - 1];
		if (!entry) return false;
		const { ok, inverse } = await replay(entry.forward);
		if (!ok) return false;
		commitFuture(futureRef.current.filter((e) => e !== entry));
		commitPast(
			[
				...pastRef.current,
				{ forward: entry.forward, inverse: inverse ?? entry.inverse, label: entry.label },
			].slice(-MAX_LAYOUT_HISTORY),
		);
		announce(`Redone: ${asPhrase(entry.label)}`);
		return true;
	}, [announce, commitFuture, commitPast, replay]);

	/** Undo/redo end the open burst, and refuse while another undo/redo is still replaying. */
	const step = useCallback(
		async (work: () => Promise<boolean>): Promise<boolean> => {
			if (busyRef.current) return false;
			busyRef.current = true;
			settle();
			try {
				return await enqueue(work);
			} finally {
				busyRef.current = false;
			}
		},
		[enqueue, settle],
	);
	const undo = useCallback(() => step(undoTop), [step, undoTop]);
	const redo = useCallback(() => step(redoTop), [step, redoTop]);

	return {
		run,
		beginBurst,
		settle,
		oneStep,
		undo,
		redo,
		canUndo: past.length > 0,
		canRedo: future.length > 0,
		undoLabel: past.length > 0 ? past[past.length - 1].label : null,
		redoLabel: future.length > 0 ? future[future.length - 1].label : null,
		announcement,
	};
}
