import { describe, expect, it } from 'vitest';
import { UNDO_LIMIT, UndoStack, redoneAnnouncement, undoneAnnouncement } from '../../src/lib/gui/ux-canvas/undo-stack';

// UX-CANVAS-012: the per-canvas undo/redo stack — multi-step undo→redo, the 50-step cap, redo
// invalidation on a new action, and the labels for the announcements/tooltips.

interface Cmd {
	id: string;
	to: number;
}

function entry(id: string, from: number, to: number) {
	return { label: `Move ${id}`, redo: [{ id, to }], undo: [{ id, to: from }] };
}

describe('UndoStack', () => {
	it('reports availability and labels', () => {
		const stack = new UndoStack<Cmd>();
		expect(stack.canUndo).toBe(false);
		stack.push(entry('a', 0, 10));
		expect(stack.canUndo).toBe(true);
		expect(stack.nextUndoLabel).toBe('Move a');
		expect(stack.canRedo).toBe(false);
	});

	it('multi-step undo then redo restores order', () => {
		const stack = new UndoStack<Cmd>();
		stack.push(entry('a', 0, 10));
		stack.push(entry('a', 10, 30));

		const u1 = stack.undo();
		expect(u1?.undo).toEqual([{ id: 'a', to: 10 }]);
		const u2 = stack.undo();
		expect(u2?.undo).toEqual([{ id: 'a', to: 0 }]);
		expect(stack.canUndo).toBe(false);

		const r1 = stack.redo();
		expect(r1?.redo).toEqual([{ id: 'a', to: 10 }]);
		const r2 = stack.redo();
		expect(r2?.redo).toEqual([{ id: 'a', to: 30 }]);
		expect(stack.canRedo).toBe(false);
	});

	it('a new action after undo clears the redo stack (history forks)', () => {
		const stack = new UndoStack<Cmd>();
		stack.push(entry('a', 0, 10));
		stack.undo();
		expect(stack.canRedo).toBe(true);
		stack.push(entry('b', 0, 5));
		expect(stack.canRedo).toBe(false);
	});

	it('enforces the 50-step limit and trips limitReached', () => {
		const stack = new UndoStack<Cmd>();
		for (let i = 0; i < UNDO_LIMIT; i += 1) stack.push(entry('a', i, i + 1));
		expect(stack.limitReached).toBe(false);
		expect(stack.depth).toBe(UNDO_LIMIT);
		stack.push(entry('a', 99, 100)); // 51st
		expect(stack.limitReached).toBe(true);
		expect(stack.depth).toBe(UNDO_LIMIT);
		// Undoing all the way down reaches the boundary (the oldest step was discarded).
		let count = 0;
		while (stack.undo()) count += 1;
		expect(count).toBe(UNDO_LIMIT);
	});

	it('only contains entries pushed through it (per-user: no remote ops)', () => {
		// A remote collaborator's mutation never calls push(), so the stack can only reverse local work.
		const stack = new UndoStack<Cmd>();
		stack.push(entry('local', 0, 10));
		expect(stack.depth).toBe(1);
		expect(stack.nextUndoLabel).toBe('Move local');
	});
});

describe('announcements', () => {
	it('formats undone/redone text', () => {
		expect(undoneAnnouncement('Move widget Initiative Tracker')).toBe('Undone: Move widget Initiative Tracker.');
		expect(redoneAnnouncement('Resize widget Note')).toBe('Redone: Resize widget Note.');
	});
});
