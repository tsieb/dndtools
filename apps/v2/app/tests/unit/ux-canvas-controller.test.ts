import { describe, expect, it } from 'vitest';
import {
	CanvasManipulationController,
	type LayoutCommand,
	type ManipWidget,
} from '../../src/lib/gui/ux-canvas/manipulation-controller.svelte';

// UX-CANVAS-002..012: the reactive controller wires the pure models to dispatch + undo. A fake host
// applies each command to a mutable widget list, so inverse commands compute from real pre-op state and
// multi-step undo→redo is exercised end-to-end. NO-LEAK: the host only exposes a filtered set.

function makeHost(initial: ManipWidget[]) {
	const widgets: ManipWidget[] = initial.map((w) => ({ ...w, configuration: { ...w.configuration } }));
	const dispatched: LayoutCommand[] = [];
	const announcements: string[] = [];

	function apply(cmd: LayoutCommand) {
		const w = widgets.find((x) => x.id === cmd.payload.widgetInstanceId);
		if (!w) return;
		if (cmd.type === 'scene.move-widget') {
			w.x = cmd.payload.x as number;
			w.y = cmd.payload.y as number;
		} else if (cmd.type === 'scene.resize-widget') {
			w.w = cmd.payload.w as number;
			w.h = cmd.payload.h as number;
		} else if (cmd.type === 'scene.layer-widget') {
			w.z = cmd.payload.z as number;
		} else if (cmd.type === 'scene.configure-widget') {
			const cfg = cmd.payload.configuration as Record<string, unknown>;
			w.configuration = { ...cfg };
			w.rotation = typeof cfg.rotation === 'number' ? cfg.rotation : 0;
		}
	}

	const host = {
		get sceneId() {
			return 'scene-1';
		},
		widgets: () => widgets,
		dispatch: async (commands: LayoutCommand[]) => {
			for (const c of commands) {
				dispatched.push(c);
				apply(c);
			}
			return true;
		},
		announce: (m: string) => announcements.push(m),
	};
	return { host, widgets, dispatched, announcements };
}

function widget(id: string, over: Partial<ManipWidget> = {}): ManipWidget {
	return {
		id,
		x: 0,
		y: 0,
		w: 200,
		h: 100,
		z: 0,
		type: 'note',
		label: `note ${id}`,
		rotation: 0,
		configuration: {},
		visibility: 'player-visible',
		collapsed: false,
		binding: null,
		bindingState: 'none',
		...over,
	};
}

describe('selection (UX-CANVAS-005)', () => {
	it('selects, toggles, selects-all and clears', () => {
		const { host } = makeHost([widget('a'), widget('b'), widget('c')]);
		const c = new CanvasManipulationController(host);
		c.select('a');
		expect([...c.selectedIds]).toEqual(['a']);
		c.select('b', 'toggle');
		expect([...c.selectedIds].sort()).toEqual(['a', 'b']);
		c.selectAll();
		expect(c.selectionCount).toBe(3);
		c.clearSelection();
		expect(c.selectionCount).toBe(0);
	});

	it('marquee selects fully-enclosed widgets', () => {
		const { host } = makeHost([widget('a', { x: 0, y: 0 }), widget('b', { x: 500, y: 500 })]);
		const c = new CanvasManipulationController(host);
		c.marquee({ x: -10, y: -10 }, { x: 300, y: 200 }, false);
		expect([...c.selectedIds]).toEqual(['a']);
	});
});

describe('move / resize / rotate dispatch the core command (UX-CANVAS-003/004)', () => {
	it('moveTo dispatches scene.move-widget with the new position', async () => {
		const { host, dispatched, widgets } = makeHost([widget('a')]);
		const c = new CanvasManipulationController(host);
		await c.moveTo('a', 40, 60);
		expect(dispatched.at(-1)).toEqual({ type: 'scene.move-widget', payload: { sceneId: 'scene-1', widgetInstanceId: 'a', x: 40, y: 60 } });
		expect(widgets[0]).toMatchObject({ x: 40, y: 60 });
	});

	it('resizeTo clamps below the minimum and dispatches scene.resize-widget', async () => {
		const { host, dispatched } = makeHost([widget('a')]);
		const c = new CanvasManipulationController(host);
		await c.resizeTo('a', 10, 10);
		expect(dispatched.at(-1)).toEqual({ type: 'scene.resize-widget', payload: { sceneId: 'scene-1', widgetInstanceId: 'a', w: 120, h: 80 } });
	});

	it('rotateTo persists a snapped rotation in configuration', async () => {
		const { host, dispatched, widgets } = makeHost([widget('a', { configuration: { visibility: 'player-visible' } })]);
		const c = new CanvasManipulationController(host);
		await c.rotateTo('a', 20); // snaps to 15
		expect(dispatched.at(-1)).toEqual({
			type: 'scene.configure-widget',
			payload: { sceneId: 'scene-1', widgetInstanceId: 'a', configuration: { visibility: 'player-visible', rotation: 15 } },
		});
		expect(widgets[0]?.rotation).toBe(15);
	});

	it('keyboard nudge moves the primary selection by the step size', async () => {
		const { host, widgets } = makeHost([widget('a', { x: 100, y: 100 })]);
		const c = new CanvasManipulationController(host);
		c.select('a');
		await c.nudge('right', 'nudge'); // 8 px
		expect(widgets[0]?.x).toBe(108);
		await c.nudge('down', 'large'); // 32 px
		expect(widgets[0]?.y).toBe(132);
	});
});

describe('z-order + align (UX-CANVAS-006/009)', () => {
	it('bring-to-front dispatches scene.layer-widget above the max', async () => {
		const { host, dispatched } = makeHost([widget('a', { z: 0 }), widget('b', { z: 1 })]);
		const c = new CanvasManipulationController(host);
		await c.zOrder('front', 'a');
		expect(dispatched.at(-1)).toEqual({ type: 'scene.layer-widget', payload: { sceneId: 'scene-1', widgetInstanceId: 'a', z: 2 } });
	});

	it('align left dispatches a move per changed widget as ONE undo entry', async () => {
		const { host, dispatched, widgets } = makeHost([widget('a', { x: 0 }), widget('b', { x: 200 })]);
		const c = new CanvasManipulationController(host);
		c.selectAll();
		await c.align('left');
		expect(widgets.every((w) => w.x === 0)).toBe(true);
		// One align = one undo entry; undo reverses every move.
		expect(c.historyDepth).toBe(1);
		const moveB = dispatched.find((d) => d.payload.widgetInstanceId === 'b');
		expect(moveB?.type).toBe('scene.move-widget');
	});
});

describe('undo / redo (UX-CANVAS-012)', () => {
	it('multi-step undo then redo restores the exact state', async () => {
		const { host, widgets } = makeHost([widget('a', { x: 0, y: 0 })]);
		const c = new CanvasManipulationController(host);
		await c.moveTo('a', 10, 0);
		await c.moveTo('a', 10, 20);
		expect(widgets[0]).toMatchObject({ x: 10, y: 20 });

		await c.undo();
		expect(widgets[0]).toMatchObject({ x: 10, y: 0 });
		await c.undo();
		expect(widgets[0]).toMatchObject({ x: 0, y: 0 });
		expect(c.canUndo).toBe(false);

		await c.redo();
		expect(widgets[0]).toMatchObject({ x: 10, y: 0 });
		await c.redo();
		expect(widgets[0]).toMatchObject({ x: 10, y: 20 });
		expect(c.canRedo).toBe(false);
	});

	it('exposes undo/redo labels for the toolbar tooltips', async () => {
		const { host } = makeHost([widget('a')]);
		const c = new CanvasManipulationController(host);
		await c.moveTo('a', 5, 5);
		expect(c.undoLabel).toBe('Move widget note a');
		await c.undo();
		expect(c.redoLabel).toBe('Move widget note a');
	});

	it('announces undone / redone operations', async () => {
		const { host, announcements } = makeHost([widget('a')]);
		const c = new CanvasManipulationController(host);
		await c.moveTo('a', 5, 5);
		await c.undo();
		expect(announcements.some((a) => a.startsWith('Undone: Move widget'))).toBe(true);
	});
});

describe('no-leak (actor safety)', () => {
	it('only ever operates on the supplied (filtered) widget set', () => {
		// The route passes the viewer-FILTERED list; a DM-only widget the player must not see is simply
		// absent, so select-all/marquee/bounds can never reference it.
		const { host } = makeHost([widget('visible-1'), widget('visible-2')]);
		const c = new CanvasManipulationController(host);
		c.selectAll();
		expect([...c.selectedIds].sort()).toEqual(['visible-1', 'visible-2']);
		c.marquee({ x: -1000, y: -1000 }, { x: 1000, y: 1000 }, false);
		expect([...c.selectedIds]).not.toContain('dm-only-secret');
	});

	it('drops a selected id that vanishes from the filtered set (reconcile)', () => {
		const initial = [widget('a'), widget('b')];
		const { host, widgets } = makeHost(initial);
		const c = new CanvasManipulationController(host);
		c.selectAll();
		// Simulate the actor switching to a player who can no longer see "b".
		widgets.splice(1, 1);
		c.reconcile();
		expect([...c.selectedIds]).toEqual(['a']);
	});
});
