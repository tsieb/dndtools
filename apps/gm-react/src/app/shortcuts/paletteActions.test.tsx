// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dispatchCommand, type CoreCommand, type CoreStateSlice } from '@dndtools/core';
import { DM_ACTOR, PLAYER_ACTOR, buildInitialState, makeEnvironment } from '@dndtools/core/testing';
import { useLayoutHistory, type LayoutHistory } from '../canvas/useLayoutHistory';
import { BOARD_TILE_SIZE } from '../board-helpers';
import { paletteActions, type PaletteContext } from './paletteActions';
import { registerCanvasSurface } from './registry';

/**
 * RC-CAN-8.1 — a palette "Add tile" is an undo step, sized like its seeded siblings.
 *
 * It used to dispatch `scene.add-widget` straight past the canvas's undo stack (so Ctrl+Z could not
 * take it back) at the definition's own 220×160, beside the board's 240×160 tiles. The palette here
 * is the real row builder, the stack the real hook, the Core a real one.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const env = makeEnvironment();
let root: Root;
let host: HTMLDivElement;
let unregister: () => void = () => {};

beforeEach(() => {
	host = document.createElement('div');
	document.body.appendChild(host);
	root = createRoot(host);
});
afterEach(() => {
	unregister();
	act(() => root.unmount());
	host.remove();
});

function board() {
	const holder: { state: CoreStateSlice } = { state: buildInitialState(DM_ACTOR, PLAYER_ACTOR) };
	const runtime = {
		get state() {
			return holder.state;
		},
		readOnly: false,
		defaultActorId: DM_ACTOR.id,
		async dispatch(command: CoreCommand) {
			const result = dispatchCommand(holder.state, env, command);
			if (result.status === 'accepted') holder.state = result.nextState;
			return result;
		},
	};
	const ensured = dispatchCommand(holder.state, env, {
		type: 'command-center.ensure-home',
		actorId: DM_ACTOR.id,
		payload: {},
	});
	if (ensured.status !== 'accepted') throw new Error('ensure-home rejected');
	holder.state = ensured.nextState;
	const sceneId = holder.state.commandCenter.homeSceneId!;
	let api: LayoutHistory | null = null;
	function Probe() {
		api = useLayoutHistory({
			sceneId,
			runtime: holder,
			dispatch: async (command) => (await runtime.dispatch(command)).status === 'accepted',
		});
		return null;
	}
	act(() => root.render(<Probe />));
	const history = () => api!;
	// What `/board` lends the palette while it is mounted.
	unregister = registerCanvasSurface({
		sceneId,
		policy: 'bounded',
		widgets: holder.state.scenes.scenes[sceneId].widgets.map((w) => ({ id: w.id, ...w.layout })),
		editable: true,
		editing: true,
		setEditing: () => {},
		canUndo: false,
		undoLabel: null,
		undo: () => void history().undo(),
		record: (command, stateBefore, label) => history().record(command, stateBefore, label),
	});
	const widgets = () => holder.state.scenes.scenes[sceneId].widgets;
	return { runtime, history, widgets };
}

function paletteRows(runtime: ReturnType<typeof board>['runtime'], needle: string) {
	const context = {
		runtime,
		actorId: DM_ACTOR.id,
		pathname: '/board',
		commandMode: true,
		needle,
		canvasPrefix: undefined,
		canvasSurface: null,
		remember: () => {},
		onClose: () => {},
		t: (key: string) => key,
		withQuery: (...extra: (string | undefined)[]) => extra.filter(Boolean).join(' '),
		matchesNeedle: () => true,
	} as unknown as PaletteContext;
	return paletteActions(context);
}

const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

describe('palette Add tile', () => {
	it('lands at the board tile size and is undone and redone by the canvas history', async () => {
		const { runtime, history, widgets } = board();
		const before = widgets().map((w) => w.id);
		const row = paletteRows(runtime, 'dice').find((r) => r.id === 'action:canvas.tile.add:dice');
		expect(row, 'the palette offers Add tile: Dice on /board').toBeDefined();

		act(() => row!.run());
		await settle();
		const added = widgets().find((w) => !before.includes(w.id));
		expect(added).toBeDefined();
		expect({ w: added!.layout.w, h: added!.layout.h }).toEqual(BOARD_TILE_SIZE);
		expect(history().canUndo).toBe(true);
		expect(history().undoLabel).toBe('Added Dice');

		await act(async () => {
			await history().undo();
		});
		expect(widgets().map((w) => w.id)).toEqual(before);
		expect(history().announcement?.text).toBe('Undone: added Dice');

		// Redo restores the SAME instance from its tombstone, not a fresh copy.
		await act(async () => {
			await history().redo();
		});
		expect(widgets().some((w) => w.id === added!.id)).toBe(true);
	});
});
