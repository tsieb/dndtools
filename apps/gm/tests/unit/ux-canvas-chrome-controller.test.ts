import { describe, expect, it } from 'vitest';
import {
	CanvasManipulationController,
	type LayoutCommand,
	type ManipWidget,
} from '../../src/lib/gui/ux-canvas/manipulation-controller.svelte';
import type { WidgetBinding } from '@dndtools/core';

// UX-CANVAS-007/008/011: the controller's chrome ops — visibility change, collapse, and bind/unbind —
// each dispatch the SAME scene.configure-widget command and record a reversible undo entry. The fake
// host applies configuration + binding to a mutable widget so inverse commands compute from real state.

function makeHost(initial: ManipWidget[]) {
	const widgets: ManipWidget[] = initial.map((w) => ({ ...w, configuration: { ...w.configuration } }));
	const dispatched: LayoutCommand[] = [];
	const announcements: string[] = [];

	function apply(cmd: LayoutCommand) {
		const w = widgets.find((x) => x.id === cmd.payload.widgetInstanceId);
		if (!w || cmd.type !== 'scene.configure-widget') return;
		if ('configuration' in cmd.payload) {
			const cfg = cmd.payload.configuration as Record<string, unknown>;
			w.configuration = { ...cfg };
			if (cfg.visibility) w.visibility = cfg.visibility as ManipWidget['visibility'];
			w.collapsed = cfg.collapsed === true;
		}
		if ('binding' in cmd.payload) {
			w.binding = cmd.payload.binding as WidgetBinding | null;
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
		visibility: 'dm-only',
		collapsed: false,
		binding: null,
		bindingState: 'none',
		...over,
	};
}

const BINDING: WidgetBinding = {
	source: { entityType: 'character', entityId: 'char-mira', selector: 'character.hp' },
	mode: 'read',
	requiredCapability: 'viewer',
};

describe('visibility (UX-CANVAS-011)', () => {
	it('toggles dm-only → player-visible and is undoable, preserving other config', async () => {
		const { host, widgets, dispatched } = makeHost([
			widget('a', { configuration: { rotation: 30, visibility: 'dm-only' }, visibility: 'dm-only' }),
		]);
		const c = new CanvasManipulationController(host);
		await c.toggleVisibility('a');
		expect(widgets[0]!.visibility).toBe('player-visible');
		// The configure command preserved the existing rotation in configuration.
		expect((dispatched[0]!.payload.configuration as Record<string, unknown>).rotation).toBe(30);
		expect(c.undoLabel).toMatch(/Change visibility/);

		await c.undo();
		expect(widgets[0]!.visibility).toBe('dm-only');
	});

	it('is a no-op when already at the target visibility', async () => {
		const { host, dispatched } = makeHost([widget('a', { visibility: 'player-visible' })]);
		const c = new CanvasManipulationController(host);
		await c.setVisibility('a', 'player-visible');
		expect(dispatched).toHaveLength(0);
	});
});

describe('collapse (UX-CANVAS-007)', () => {
	it('collapses and expands, recording undo each way', async () => {
		const { host, widgets } = makeHost([widget('a')]);
		const c = new CanvasManipulationController(host);
		await c.toggleCollapse('a');
		expect(widgets[0]!.collapsed).toBe(true);
		await c.undo();
		expect(widgets[0]!.collapsed).toBe(false);
	});
});

describe('binding (UX-CANVAS-008)', () => {
	it('binds a widget and undo restores the prior (null) binding', async () => {
		const { host, widgets, dispatched, announcements } = makeHost([widget('a')]);
		const c = new CanvasManipulationController(host);
		await c.bind('a', BINDING, 'Mira');
		expect(widgets[0]!.binding).toEqual(BINDING);
		expect(dispatched[0]!.type).toBe('scene.configure-widget');
		expect(announcements.some((m) => m.includes('Mira'))).toBe(true);

		await c.undo();
		expect(widgets[0]!.binding).toBeNull();
	});

	it('unbinds a bound widget and undo restores the binding', async () => {
		const { host, widgets } = makeHost([widget('a', { binding: BINDING })]);
		const c = new CanvasManipulationController(host);
		await c.unbind('a');
		expect(widgets[0]!.binding).toBeNull();
		await c.undo();
		expect(widgets[0]!.binding).toEqual(BINDING);
	});

	it('does not unbind an already-unbound widget', async () => {
		const { host, dispatched } = makeHost([widget('a')]);
		const c = new CanvasManipulationController(host);
		await c.unbind('a');
		expect(dispatched).toHaveLength(0);
	});
});
