/**
 * Drag-alternative primitive (UX-A11Y-013 WCAG 2.5.7, UX-A11Y-010 pointer cancellation WCAG 2.5.2).
 *
 * Every drag operation in the product (canvas widget move/resize, map pin reposition, initiative
 * reorder) is a convenience shortcut over a discrete command. This module is the shared adapter that
 * guarantees the keyboard/menu alternative dispatches the IDENTICAL command the pointer drag does
 * (UX-A11Y-013 AC1/AC2 — "the processing core receives the same command as the drag gesture") and
 * that an in-progress drag can be cancelled with Escape, restoring the element to its origin
 * (UX-A11Y-010 AC4). Pointer-cancellation (WCAG 2.5.2): a drag only commits when the pointer is
 * released over the target, not when dragged away.
 *
 * Pure — no DOM. Both the pointer handler and the keyboard handler call `moveTo`/`commit`, so there
 * is one code path to the core command and no drag-only gate (AP-6).
 */

export interface Vec2 {
	x: number;
	y: number;
}

/** Arrow → unit delta. Returns the zero vector's null for non-direction keys. */
export function directionDelta(key: string): Vec2 | null {
	switch (key) {
		case 'ArrowLeft':
			return { x: -1, y: 0 };
		case 'ArrowRight':
			return { x: 1, y: 0 };
		case 'ArrowUp':
			return { x: 0, y: -1 };
		case 'ArrowDown':
			return { x: 0, y: 1 };
		default:
			return null;
	}
}

export interface NudgeOptions {
	/** Coarse step (grid snap), e.g. 8px. */
	step: number;
	/** Fine step used when `fine` is true, e.g. 1px (Shift+Ctrl+Arrow). Defaults to 1. */
	fineStep?: number;
	/** Whether fine mode is active (the Shift modifier in §6.3 move map). */
	fine?: boolean;
}

/**
 * Keyboard alternative to a drag-move: return the new position after an Arrow nudge, or `null` when
 * the key is not a direction key. This is the same target a pointer drag would produce; both feed
 * {@link buildMoveCommand}.
 */
export function nudge(position: Vec2, key: string, options: NudgeOptions): Vec2 | null {
	const delta = directionDelta(key);
	if (!delta) return null;
	const step = options.fine ? (options.fineStep ?? 1) : options.step;
	return { x: position.x + delta.x * step, y: position.y + delta.y * step };
}

export interface MoveCommand {
	kind: 'move';
	id: string;
	from: Vec2;
	to: Vec2;
}

/** The single command builder both the drag gesture and the keyboard/menu alternative call. */
export function buildMoveCommand(id: string, from: Vec2, to: Vec2): MoveCommand {
	return { kind: 'move', id, from, to };
}

/**
 * Pointer-cancellation predicate (WCAG 2.5.2): a pointer drag commits only when the up-target is the
 * same element the down-target was. A release elsewhere (dragged away / off the control) cancels.
 */
export function shouldCommitPointer(downTarget: unknown, upTarget: unknown): boolean {
	return downTarget != null && downTarget === upTarget;
}

export interface DragControllerOptions {
	id: string;
	origin: Vec2;
	/** Called with the resolved command when a move commits — the ONE path to the core command. */
	onCommit: (command: MoveCommand) => void;
}

/**
 * Shared move controller used by BOTH the pointer drag and the keyboard alternative. Pointer code
 * calls `moveTo` during drag then `commit()`; keyboard code calls `nudgeBy` then `commit()`. Escape
 * (or a pointer release away from target) calls `cancel()`, restoring the origin and emitting no
 * command. Guarantees one command shape regardless of input modality (UX-A11Y-013).
 */
export class DragController {
	readonly id: string;
	readonly origin: Vec2;
	#current: Vec2;
	#committed = false;
	readonly #onCommit: (command: MoveCommand) => void;

	constructor(options: DragControllerOptions) {
		this.id = options.id;
		this.origin = { ...options.origin };
		this.#current = { ...options.origin };
		this.#onCommit = options.onCommit;
	}

	get current(): Vec2 {
		return { ...this.#current };
	}

	/** Pointer drag: set the live position (no command yet). */
	moveTo(position: Vec2): void {
		this.#current = { ...position };
	}

	/** Keyboard alternative: nudge the live position by one Arrow step. Returns false for non-keys. */
	nudgeBy(key: string, options: NudgeOptions): boolean {
		const next = nudge(this.#current, key, options);
		if (!next) return false;
		this.#current = next;
		return true;
	}

	/** Commit the current position as a move command (the same shape for pointer or keyboard). */
	commit(): MoveCommand | null {
		if (this.#committed) return null;
		if (this.#current.x === this.origin.x && this.#current.y === this.origin.y) return null;
		this.#committed = true;
		const command = buildMoveCommand(this.id, this.origin, this.#current);
		this.#onCommit(command);
		return command;
	}

	/** Cancel: restore the origin, emit nothing (Escape during drag / pointer released away). */
	cancel(): Vec2 {
		this.#current = { ...this.origin };
		this.#committed = true;
		return this.current;
	}
}
