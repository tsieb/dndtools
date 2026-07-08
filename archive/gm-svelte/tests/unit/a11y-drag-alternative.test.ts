import { describe, expect, it } from 'vitest';
import {
	buildMoveCommand,
	directionDelta,
	DragController,
	nudge,
	shouldCommitPointer,
} from '../../src/lib/gui/a11y/drag-alternative';

// UX-A11Y-013 (WCAG 2.5.7): every drag has a keyboard/menu alternative that dispatches the IDENTICAL
// command. UX-A11Y-010 (WCAG 2.5.2): Escape / release-away cancels and restores the origin.

describe('directionDelta / nudge', () => {
	it('maps arrows to unit deltas and nudges by the coarse step', () => {
		expect(directionDelta('ArrowRight')).toEqual({ x: 1, y: 0 });
		expect(directionDelta('Enter')).toBeNull();
		expect(nudge({ x: 40, y: 40 }, 'ArrowRight', { step: 8 })).toEqual({ x: 48, y: 40 });
		expect(nudge({ x: 40, y: 40 }, 'ArrowUp', { step: 8 })).toEqual({ x: 40, y: 32 });
	});

	it('uses the fine step in fine mode (Shift+Ctrl+Arrow)', () => {
		expect(nudge({ x: 40, y: 40 }, 'ArrowRight', { step: 8, fineStep: 1, fine: true })).toEqual({
			x: 41,
			y: 40,
		});
	});

	it('returns null for non-direction keys', () => {
		expect(nudge({ x: 0, y: 0 }, 'a', { step: 8 })).toBeNull();
	});
});

describe('shouldCommitPointer (pointer cancellation, WCAG 2.5.2)', () => {
	it('commits only when released over the same target', () => {
		const a = {};
		const b = {};
		expect(shouldCommitPointer(a, a)).toBe(true);
		expect(shouldCommitPointer(a, b)).toBe(false);
		expect(shouldCommitPointer(null, null)).toBe(false);
	});
});

describe('DragController — one command for pointer AND keyboard', () => {
	it('keyboard nudge then commit produces the same MoveCommand a drag would', () => {
		const commands: unknown[] = [];
		const controller = new DragController({
			id: 'widget-1',
			origin: { x: 40, y: 40 },
			onCommit: (c) => commands.push(c),
		});
		controller.nudgeBy('ArrowRight', { step: 8 });
		controller.nudgeBy('ArrowRight', { step: 8 });
		const command = controller.commit();
		expect(command).toEqual(buildMoveCommand('widget-1', { x: 40, y: 40 }, { x: 56, y: 40 }));
		expect(commands).toHaveLength(1);
	});

	it('pointer moveTo then commit produces the equivalent command', () => {
		let committed: unknown = null;
		const controller = new DragController({
			id: 'widget-1',
			origin: { x: 40, y: 40 },
			onCommit: (c) => (committed = c),
		});
		controller.moveTo({ x: 56, y: 40 });
		controller.commit();
		expect(committed).toEqual(buildMoveCommand('widget-1', { x: 40, y: 40 }, { x: 56, y: 40 }));
	});

	it('cancel() restores the origin and emits no command (Escape during drag)', () => {
		let committed = false;
		const controller = new DragController({
			id: 'w',
			origin: { x: 10, y: 10 },
			onCommit: () => (committed = true),
		});
		controller.nudgeBy('ArrowRight', { step: 8 });
		expect(controller.current).toEqual({ x: 18, y: 10 });
		expect(controller.cancel()).toEqual({ x: 10, y: 10 });
		expect(controller.commit()).toBeNull();
		expect(committed).toBe(false);
	});

	it('a no-op move (back at origin) commits nothing', () => {
		let committed = false;
		const controller = new DragController({
			id: 'w',
			origin: { x: 10, y: 10 },
			onCommit: () => (committed = true),
		});
		controller.moveTo({ x: 10, y: 10 });
		expect(controller.commit()).toBeNull();
		expect(committed).toBe(false);
	});
});
