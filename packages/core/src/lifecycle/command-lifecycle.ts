import type { CoreCommand } from '../commands/types';

/**
 * PLAT-018: durable command lifecycle states.
 *
 * User-visible durable commands expose a standard set of lifecycle states so the GUI can
 * render pending/success/failure/retry/cancel/undo affordances consistently and never show
 * a partial UI success when the durable write fails (PLAT-018 AC1/AC3).
 *
 * The state machine itself is pure Processing-Core logic. The GUI dispatches transitions
 * and renders the resulting state; it does not invent its own per-command status flags.
 */

export type CommandLifecycleStatus =
	| 'draft' // user input accepted locally, not yet submitted; no durable op exists
	| 'pending' // submitted to the core, awaiting an accepted/rejected result
	| 'success' // accepted; durable operation appended
	| 'failure' // rejected or the durable write threw; nothing was committed
	| 'cancelled' // cancelled before commit; no durable operation appended
	| 'undone'; // a previously-successful command was reversed via its inverse command

/** The kinds of recovery a failed/successful command can offer the user. */
export type CommandRecoveryAction = 'retry' | 'undo' | 'none';

export interface CommandLifecycleState {
	commandType: CoreCommand['type'];
	status: CommandLifecycleStatus;
	/** Operation ids appended on success; empty otherwise. Drives undo eligibility. */
	operationIds: string[];
	/** Structured failure message for retry/recovery guidance (PLAT-018 AC1). */
	error: string | null;
	/** Number of submit attempts, so the GUI can label "Retry" vs first submit. */
	attempts: number;
	/** Whether this command type can be undone (see UNDOABLE_COMMAND_TYPES). */
	undoable: boolean;
}

/**
 * Command types whose contract supports undo. Undo is only honored where a deterministic
 * inverse command exists through the Processing Core command model (PLAT-018 AC2). We do
 * NOT fabricate undo for commands that cannot support it — e.g. recording a dice roll
 * (append-only history), starting/advancing a session workflow (a transition, not a
 * reversible edit), or applying a migration. Each entry maps the forward command to the
 * core command that reverses it.
 */
export const UNDOABLE_COMMAND_TYPES: Partial<Record<CoreCommand['type'], CoreCommand['type']>> = {
	// Adding a widget is undone by destroying that widget instance.
	'scene.add-widget': 'scene.destroy-widget',
	// RC-CAN-1.2: destroying a widget is undone by restoring it from its scene tombstone — same id,
	// same layout, same configuration and binding. Valid inside the 30-day retention window.
	'scene.destroy-widget': 'scene.restore-widget',
	// Projecting a player view is undone by revoking it.
	'session.project-player-view': 'session.revoke-player-view',
	// Installing a widget package is undone by removing it.
	'widget.package.install': 'widget.package.remove',
	// Enabling/disabling a package are mutual inverses.
	'widget.package.enable': 'widget.package.disable',
	'widget.package.disable': 'widget.package.enable',
	// MAP-003: a paint edit captures before+after content. Its inverse is the SAME set-content command
	// with before/after swapped (built by `buildInverseMapEditCommand`), so undo restores the exact
	// prior content. The forward and inverse share a command type because the operation is a content
	// replacement, not a distinct destructive op.
	'map.edit-layer': 'map.edit-layer',
	// MAP-021 — every mutating map command. The INVERSE COMMANDS are built by `buildMapInverse`
	// (`lifecycle/map-undo.ts`) from the command + the state BEFORE it applied; the undo STACK is
	// app-side, local, and never durable (see that module's header for why a co-DM must not be able to
	// undo your brush stroke from across the table).
	'map.add-features': 'map.remove-features',
	'map.update-features': 'map.update-features',
	'map.remove-features': 'map.add-features',
	// Generation/derivation and the layer lifecycle are undone at LAYER granularity: `map.restore-layers`
	// removes the layers they created and puts back the ones they replaced (with their content, their
	// order, and the POIs a generation planted).
	'map.generate': 'map.restore-layers',
	'map.derive-features': 'map.restore-layers',
	'map.create-layer': 'map.delete-layer',
	'map.duplicate-layer': 'map.delete-layer',
	'map.delete-layer': 'map.restore-layers',
	'map.rename-layer': 'map.rename-layer',
	'map.reorder-layer': 'map.reorder-layer',
	'map.lock-layer': 'map.lock-layer',
	'map.set-layer-visibility': 'map.set-layer-visibility',
	'map.set-layer-enabled': 'map.set-layer-enabled',
	'map.set-layer-opacity': 'map.set-layer-opacity',
	'map.set-layer-tags': 'map.set-layer-tags',
	'map.create-poi': 'map.delete-poi',
	'map.update-poi': 'map.update-poi',
	'map.delete-poi': 'map.create-poi',
	'map.create-route': 'map.delete-route',
	'map.update-route': 'map.update-route',
	'map.delete-route': 'map.create-route',
	'map.create-token': 'map.delete-token',
	'map.move-token': 'map.move-token',
	'map.update-token': 'map.update-token',
	'map.delete-token': 'map.create-token',
	'map.append-fog': 'map.remove-fog',
	'map.remove-fog': 'map.append-fog',
	'map.set-overlay-mode': 'map.set-overlay-mode',
	'map.configure-overlay': 'map.configure-overlay',
	'map.create-region': 'map.delete-region',
	'map.update-region': 'map.update-region',
	'map.delete-region': 'map.create-region',
	'map.set-scale': 'map.set-scale',
	'map.set-projection': 'map.set-projection',
	'map.update-metadata': 'map.update-metadata',
	// CONTENT-001: a soft-delete is undone by restoring the same item. The tombstone keeps the record, so
	// restore returns the exact prior content (no hidden prior revision re-exposed).
	'content.remove-item': 'content.restore-item',
};

export function isUndoableCommandType(type: CoreCommand['type']): boolean {
	return type in UNDOABLE_COMMAND_TYPES;
}

export function inverseCommandType(type: CoreCommand['type']): CoreCommand['type'] | null {
	return UNDOABLE_COMMAND_TYPES[type] ?? null;
}

export function createCommandLifecycle(commandType: CoreCommand['type']): CommandLifecycleState {
	return {
		commandType,
		status: 'draft',
		operationIds: [],
		error: null,
		attempts: 0,
		undoable: isUndoableCommandType(commandType),
	};
}

/** Transition to `pending` on submit/resubmit. Clears prior error and increments attempts. */
export function markPending(state: CommandLifecycleState): CommandLifecycleState {
	return { ...state, status: 'pending', error: null, attempts: state.attempts + 1 };
}

/**
 * Transition to `success` once the core accepts the command and the durable operation(s)
 * are committed. `operationIds` must be non-empty for a durable command; an empty list is
 * a programming error surfaced as a thrown invariant rather than a silent success.
 */
export function markSuccess(
	state: CommandLifecycleState,
	operationIds: string[],
): CommandLifecycleState {
	return { ...state, status: 'success', operationIds, error: null };
}

/**
 * Transition to `failure`. Pending state is cleared and no partial success is recorded
 * (PLAT-018 AC1). The error message carries retry/recovery guidance.
 */
export function markFailure(state: CommandLifecycleState, error: string): CommandLifecycleState {
	return { ...state, status: 'failure', error, operationIds: [] };
}

/**
 * Transition to `cancelled` before commit. Only valid from draft/pending; a committed
 * command must be undone, not cancelled. No durable operation is appended (PLAT-018 AC3).
 */
export function markCancelled(state: CommandLifecycleState): CommandLifecycleState {
	return { ...state, status: 'cancelled', error: null, operationIds: [] };
}

/** Transition a successful, undoable command to `undone`. */
export function markUndone(state: CommandLifecycleState): CommandLifecycleState {
	return { ...state, status: 'undone' };
}

/**
 * Whether the user may submit/retry from the current state. Retry is offered after a
 * failure; submit is offered from draft. Pending/success/cancelled/undone are terminal for
 * the submit affordance.
 */
export function canRetry(state: CommandLifecycleState): boolean {
	return state.status === 'failure' || state.status === 'draft';
}

/** Whether the user may cancel from the current state (only before commit). */
export function canCancel(state: CommandLifecycleState): boolean {
	return state.status === 'draft' || state.status === 'pending';
}

/** Whether the user may undo from the current state (committed + contract supports it). */
export function canUndo(state: CommandLifecycleState): boolean {
	return state.status === 'success' && state.undoable && state.operationIds.length > 0;
}

/** The recovery action the GUI should surface for the current lifecycle state. */
export function recoveryAction(state: CommandLifecycleState): CommandRecoveryAction {
	if (state.status === 'failure') return 'retry';
	if (canUndo(state)) return 'undo';
	return 'none';
}
