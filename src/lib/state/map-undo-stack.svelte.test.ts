import { describe, expect, it } from 'vitest';
import { MapUndoStack } from './map-undo-stack.svelte.js';

describe('MapUndoStack', () => {
	it('records operations and supports undo/redo order', () => {
		const stack = new MapUndoStack<number>(50);
		stack.record({ label: 'First', before: 0, after: 1 });
		stack.record({ label: 'Second', before: 1, after: 2 });

		expect(stack.canUndo).toBe(true);
		expect(stack.canRedo).toBe(false);

		const undo = stack.undo();
		expect(undo).toEqual({ label: 'Second', snapshot: 1 });
		expect(stack.canRedo).toBe(true);

		const redo = stack.redo();
		expect(redo).toEqual({ label: 'Second', snapshot: 2 });
		expect(stack.canUndo).toBe(true);
	});

	it('clears redo stack when a new operation is recorded', () => {
		const stack = new MapUndoStack<number>(50);
		stack.record({ label: 'First', before: 0, after: 1 });
		stack.record({ label: 'Second', before: 1, after: 2 });
		stack.undo();
		expect(stack.canRedo).toBe(true);

		stack.record({ label: 'Third', before: 1, after: 3 });
		expect(stack.canRedo).toBe(false);
	});

	it('enforces capacity by dropping oldest undo entries', () => {
		const stack = new MapUndoStack<number>(2);
		stack.record({ label: 'A', before: 0, after: 1 });
		stack.record({ label: 'B', before: 1, after: 2 });
		stack.record({ label: 'C', before: 2, after: 3 });

		const firstUndo = stack.undo();
		const secondUndo = stack.undo();
		const thirdUndo = stack.undo();

		expect(firstUndo).toEqual({ label: 'C', snapshot: 2 });
		expect(secondUndo).toEqual({ label: 'B', snapshot: 1 });
		expect(thirdUndo).toBeNull();
	});
});
