import {
	buildWidgetInverse,
	findWidgetDefinition,
	type CoreCommand,
	type CoreStateSlice,
	type SyncOperation,
} from '@dndtools/core';

import { englishCopy, type Translate } from './canvasCopy';

// RC-POL-1.2 — the undo stack's pure command helpers, out of `useLayoutHistory.ts`.

/**
 * One undo step. RC-CAN-8.1 made a step a LIST of commands, so the moves of one keyboard burst or one
 * group drag, and every tile a template places, come back with one Ctrl+Z. `forward` replays in
 * order; `inverse` is already in undo order (last command's inverse first).
 */
export interface LayoutHistoryEntry {
	forward: CoreCommand[];
	inverse: CoreCommand[];
	/** Past tense, widget named: "Moved Timer". Drives both the button title and the announcement. */
	label: string;
}

/** Commands that place tiles. The core cannot invert them from the state BEFORE (their handler
 *  mints the ids), so the app reads the placed ids off the state AFTER — ADR-029 §1. */
export const PLACING = new Set([
	'scene.add-widget',
	'scene.apply-template',
	'scene.duplicate-widget',
]);

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

export function restoreBackground(
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
export function backgroundInverse(
	command: CoreCommand,
	before: CoreStateSlice,
): CoreCommand[] | null {
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
export function placementStep(
	op: SyncOperation,
	sceneId: string,
	seen: CoreStateSlice,
	after: CoreStateSlice,
	t: Translate = englishCopy,
): { command: CoreCommand; inverse: CoreCommand[]; label: string } | null {
	if (op.entityType !== 'scene' || op.entityId !== sceneId) return null;
	const now = after.scenes.scenes[sceneId];
	if (!now) return null;
	let placed: string[] = [];
	let label = t('boardCanvas.step.appliedTemplate');
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
					: t('boardCanvas.step.tile');
		label = t('boardCanvas.step.added', { title });
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
export interface Burst {
	entry: LayoutHistoryEntry | null;
}

/**
 * A placing command this hook has handed to the runtime and not yet seen signalled. `run` claims its
 * own (the runtime's signal then records it under the run's label and burst); undo and redo claim
 * the commands they replay, so their signal records nothing. A placement nobody claimed — the
 * palette's Add tile, the template picker — is a new action of its own.
 */
export interface Claim {
	command: CoreCommand;
	label: string | null;
	burst: Burst | null;
}

/** Whether `op` is the operation `command` logs. Two identical adds are interchangeable, so the
 *  oldest claim of the same shape takes the first such operation. */
export function claims(command: CoreCommand, op: SyncOperation): boolean {
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
export function lastPerWidget(commands: readonly CoreCommand[]): CoreCommand[] {
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
export const nextReplayKey = () => `history-replay-${++replaySeq}`;

/** History replay is a new operation against the current revision, never an idempotent retry. */
export function prepareWidgetCommand(
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
