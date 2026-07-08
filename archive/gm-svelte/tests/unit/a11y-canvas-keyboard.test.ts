import { describe, expect, it } from 'vitest';
import {
	arrowDirection,
	beginLink,
	buildCanvasMoveCommand,
	buildResizeCommand,
	cancelLink,
	completeLink,
	emptyCanvasAnnouncement,
	enterActionMode,
	exitActionMode,
	extendSelection,
	focusWidget,
	initialCanvasState,
	keyboardMove,
	keyboardResize,
	layerOrderIndex,
	linkAnnouncement,
	moveAnnouncement,
	nearestInDirection,
	positionDescription,
	resizeAnnouncement,
	selectAll,
	selectLinkTarget,
	type SpatialWidget,
} from '../../src/lib/gui/a11y/canvas-keyboard';

// UX-A11Y-003: the canvas keyboard model — spatial selection, action mode, move/resize/link, and the
// announcement strings. The geometry delegates to the shared drag-alternative so keyboard == drag.

const widgets: SpatialWidget[] = [
	{ id: 'center', x: 100, y: 100, w: 20, h: 20 },
	{ id: 'right', x: 200, y: 100, w: 20, h: 20 },
	{ id: 'left', x: 0, y: 100, w: 20, h: 20 },
	{ id: 'up', x: 100, y: 0, w: 20, h: 20 },
	{ id: 'down', x: 100, y: 200, w: 20, h: 20 },
	{ id: 'far-right', x: 400, y: 100, w: 20, h: 20 },
];

describe('canvas keyboard — arrowDirection', () => {
	it('maps arrow keys to directions and ignores others', () => {
		expect(arrowDirection('ArrowUp')).toBe('up');
		expect(arrowDirection('ArrowDown')).toBe('down');
		expect(arrowDirection('ArrowLeft')).toBe('left');
		expect(arrowDirection('ArrowRight')).toBe('right');
		expect(arrowDirection('Enter')).toBeNull();
	});
});

describe('canvas keyboard — nearestInDirection (spatial nav)', () => {
	it('finds the nearest neighbour in each direction', () => {
		expect(nearestInDirection(widgets, 'center', 'right')).toBe('right');
		expect(nearestInDirection(widgets, 'center', 'left')).toBe('left');
		expect(nearestInDirection(widgets, 'center', 'up')).toBe('up');
		expect(nearestInDirection(widgets, 'center', 'down')).toBe('down');
	});

	it('picks the closer of two candidates in the same direction', () => {
		// both `right` (x200) and `far-right` (x400) are to the right; the nearer wins
		expect(nearestInDirection(widgets, 'center', 'right')).toBe('right');
	});

	it('returns null when no widget lies in the direction', () => {
		expect(nearestInDirection(widgets, 'far-right', 'right')).toBeNull();
		expect(nearestInDirection(widgets, 'up', 'up')).toBeNull();
	});

	it('returns null for an unknown source', () => {
		expect(nearestInDirection(widgets, 'nope', 'right')).toBeNull();
	});
});

describe('canvas keyboard — layerOrderIndex (Tab/Home/End)', () => {
	it('Tab moves forward and wraps', () => {
		expect(layerOrderIndex('Tab', false, 0, 3)).toBe(1);
		expect(layerOrderIndex('Tab', false, 2, 3)).toBe(0);
	});

	it('Shift+Tab moves backward and wraps', () => {
		expect(layerOrderIndex('Tab', true, 1, 3)).toBe(0);
		expect(layerOrderIndex('Tab', true, 0, 3)).toBe(2);
	});

	it('Home/End jump to the ends; other keys are not traversal', () => {
		expect(layerOrderIndex('Home', false, 2, 3)).toBe(0);
		expect(layerOrderIndex('End', false, 0, 3)).toBe(2);
		expect(layerOrderIndex('Enter', false, 0, 3)).toBeNull();
		expect(layerOrderIndex('Tab', false, 0, 0)).toBeNull();
	});
});

describe('canvas keyboard — mode + selection state machine', () => {
	it('enters and exits action mode keeping focus', () => {
		const spatial = initialCanvasState('center');
		const action = enterActionMode(spatial);
		expect(action.mode).toBe('action');
		expect(action.focusedId).toBe('center');
		const back = exitActionMode(action);
		expect(back.mode).toBe('spatial');
		expect(back.focusedId).toBe('center');
	});

	it('does not enter action mode with nothing focused', () => {
		expect(enterActionMode(initialCanvasState(null)).mode).toBe('spatial');
	});

	it('focusWidget single-selects; extendSelection multi-selects', () => {
		let state = focusWidget(initialCanvasState('center'), 'right');
		expect(state.focusedId).toBe('right');
		expect(state.selectedIds).toEqual(['right']);
		state = extendSelection(state, 'left');
		expect(state.focusedId).toBe('left');
		expect([...state.selectedIds].sort()).toEqual(['left', 'right']);
		// extending with an already-selected id does not duplicate it
		state = extendSelection(state, 'left');
		expect(state.selectedIds.filter((id) => id === 'left')).toHaveLength(1);
	});

	it('selectAll selects every id and keeps a valid focus', () => {
		const state = selectAll(initialCanvasState('center'), ['a', 'b', 'c']);
		expect([...state.selectedIds]).toEqual(['a', 'b', 'c']);
		expect(state.focusedId).toBe('a'); // focus falls to first when current is not in the set
		expect(selectAll(initialCanvasState(null), []).focusedId).toBeNull();
	});
});

describe('canvas keyboard — move (drag alternative parity)', () => {
	it('nudges by the grid step / fine step and builds the same MoveCommand shape', () => {
		expect(keyboardMove({ x: 40, y: 40 }, 'ArrowRight', { step: 8 })).toEqual({ x: 48, y: 40 });
		expect(keyboardMove({ x: 40, y: 40 }, 'ArrowUp', { step: 8, fine: true, fineStep: 1 })).toEqual({
			x: 40,
			y: 39,
		});
		expect(keyboardMove({ x: 40, y: 40 }, 'Enter', { step: 8 })).toBeNull();
		const command = buildCanvasMoveCommand('w1', { x: 40, y: 40 }, { x: 48, y: 40 });
		expect(command).toEqual({ kind: 'move', id: 'w1', from: { x: 40, y: 40 }, to: { x: 48, y: 40 } });
	});
});

describe('canvas keyboard — resize', () => {
	it('grows/shrinks by the snap step and clamps to a 1x1 minimum', () => {
		expect(keyboardResize({ w: 240, h: 160 }, 'ArrowRight', { step: 8 })).toEqual({ w: 248, h: 160 });
		expect(keyboardResize({ w: 240, h: 160 }, 'ArrowUp', { step: 8 })).toEqual({ w: 240, h: 152 });
		expect(keyboardResize({ w: 4, h: 4 }, 'ArrowLeft', { step: 8 })).toEqual({ w: 1, h: 4 });
		expect(keyboardResize({ w: 4, h: 4 }, 'Enter', { step: 8 })).toBeNull();
	});

	it('builds a resize command shape', () => {
		expect(buildResizeCommand('w1', { w: 240, h: 160 }, { w: 248, h: 160 })).toEqual({
			kind: 'resize',
			id: 'w1',
			from: { w: 240, h: 160 },
			to: { w: 248, h: 160 },
		});
	});
});

describe('canvas keyboard — link operation', () => {
	it('begins, selects a target, and completes a link command', () => {
		let op = beginLink('source');
		expect(op.phase).toBe('selecting');
		op = selectLinkTarget(op, 'target');
		const result = completeLink(op);
		expect(result?.command).toEqual({ kind: 'link', sourceId: 'source', targetId: 'target' });
		expect(result?.next.phase).toBe('idle');
	});

	it('does not complete a self-link or a link with no target', () => {
		expect(completeLink(beginLink('source'))).toBeNull();
		expect(completeLink(selectLinkTarget(beginLink('source'), 'source'))).toBeNull();
	});

	it('cancel resets the operation to idle', () => {
		expect(cancelLink()).toEqual({ phase: 'idle', sourceId: null, targetId: null });
		// selecting a target after cancel is a no-op
		expect(selectLinkTarget(cancelLink(), 'x').phase).toBe('idle');
	});
});

describe('canvas keyboard — announcements', () => {
	it('describes position, move, resize, link, and empty canvas', () => {
		expect(positionDescription(1, 6)).toBe('item 2 of 6');
		expect(moveAnnouncement('Note widget', { x: 48.4, y: 40 })).toBe('Note widget moved to 48, 40.');
		expect(resizeAnnouncement('Map widget', { w: 248, h: 160 })).toBe(
			'Map widget resized to 248 by 160.',
		);
		expect(linkAnnouncement('Note widget', 'Map widget')).toBe(
			'Link from Note widget to Map widget created.',
		);
		expect(emptyCanvasAnnouncement()).toBe('Canvas empty — use the toolbar to add a widget.');
	});
});
