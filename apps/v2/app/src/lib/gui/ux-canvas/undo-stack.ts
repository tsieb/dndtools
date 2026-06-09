/**
 * Canvas undo/redo stack (UX-CANVAS-012). A per-canvas, in-memory history of reversible layout
 * operations. Each entry carries a human-readable label plus the core commands to REDO and to UNDO it —
 * the undo command is computed from the layout state BEFORE the operation, so undo dispatches an inverse
 * `scene.move-widget` / `scene.resize-widget` / `scene.layer-widget` / `scene.configure-widget` and the
 * processing core stays the single source of truth (no local shadow state). Pure data structure — no
 * DOM, no dispatch; the controller pops an entry and dispatches its commands.
 *
 * Per-user (UX-CANVAS-012 §Multi-user undo): the stack only contains operations pushed THROUGH it, i.e.
 * the local user's own operations. A remote collaborator's mutation never enters this stack, so a local
 * undo can only ever reverse the local user's own work (AC4).
 *
 * Bounded to {@link UNDO_LIMIT} steps (UX-CANVAS-012 §Undo: 50-step hard limit). Pushing a 51st entry
 * discards the oldest and trips {@link UndoStack.limitReached} so the surface can show the
 * "Undo limit reached" advisory at the stack boundary.
 */

export const UNDO_LIMIT = 50;

/** A reversible operation: its label and the command lists to apply for redo / undo. */
export interface UndoEntry<TCommand> {
	label: string;
	/** Commands that re-apply the operation (forward). Already dispatched once when pushed. */
	redo: TCommand[];
	/** Commands that reverse the operation, computed from the pre-operation state. */
	undo: TCommand[];
}

export class UndoStack<TCommand> {
	#undo: UndoEntry<TCommand>[] = [];
	#redo: UndoEntry<TCommand>[] = [];
	#limitReached = false;
	readonly #limit: number;

	constructor(limit: number = UNDO_LIMIT) {
		this.#limit = Math.max(1, limit);
	}

	get canUndo(): boolean {
		return this.#undo.length > 0;
	}

	get canRedo(): boolean {
		return this.#redo.length > 0;
	}

	get depth(): number {
		return this.#undo.length;
	}

	/** True once the stack has discarded an oldest entry to stay within the limit. */
	get limitReached(): boolean {
		return this.#limitReached;
	}

	/** Label of the entry the next undo would reverse (for the "Undo: …" tooltip / aria-label). */
	get nextUndoLabel(): string | null {
		return this.#undo[this.#undo.length - 1]?.label ?? null;
	}

	/** Label of the entry the next redo would re-apply. */
	get nextRedoLabel(): string | null {
		return this.#redo[this.#redo.length - 1]?.label ?? null;
	}

	/** Record a freshly-applied operation. Clears the redo stack (a new action forks history). */
	push(entry: UndoEntry<TCommand>): void {
		this.#undo.push(entry);
		this.#redo = [];
		if (this.#undo.length > this.#limit) {
			this.#undo.shift();
			this.#limitReached = true;
		}
	}

	/** Pop the most recent operation for undoing; moves it to the redo stack. */
	undo(): UndoEntry<TCommand> | null {
		const entry = this.#undo.pop();
		if (!entry) return null;
		this.#redo.push(entry);
		return entry;
	}

	/** Pop the most recently undone operation for redoing; moves it back to the undo stack. */
	redo(): UndoEntry<TCommand> | null {
		const entry = this.#redo.pop();
		if (!entry) return null;
		this.#undo.push(entry);
		return entry;
	}

	clear(): void {
		this.#undo = [];
		this.#redo = [];
		this.#limitReached = false;
	}
}

/** Polite announcement after an undo (UX-CANVAS-012: "Undone: Move widget Initiative Tracker"). */
export function undoneAnnouncement(label: string): string {
	return `Undone: ${label}.`;
}

/** Polite announcement after a redo. */
export function redoneAnnouncement(label: string): string {
	return `Redone: ${label}.`;
}
