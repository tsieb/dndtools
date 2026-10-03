// @vitest-environment jsdom

import { act, useReducer, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	dispatchCommand,
	findWidgetDefinition,
	getSceneForActor,
	type CoreCommand,
	type CoreStateSlice,
} from '@dndtools/core';
import { DM_ACTOR, PLAYER_ACTOR, buildInitialState, makeEnvironment } from '@dndtools/core/testing';
import { I18nProvider } from '../i18n';
import { boardWidgetsOf, clampToColumns, payloadIndex } from './board-helpers';
import { useLayoutHistory, type LayoutHistory } from './canvas/useLayoutHistory';

/**
 * RC-CAN-8.1 — the canvas draws exactly what the history says.
 *
 * A drop the board CLAMPS (dragged past the right edge) commits a layout that differs from where
 * the pointer let go. The pointer draft used to be cleared only once it matched the committed
 * layout — which a clamped drop never does — so the frame stayed at the drop point, and an Undo then
 * rewound the core while the frame did not move. These run the real canvas against a real Core.
 */

const env = makeEnvironment();
const holder: { state: CoreStateSlice } = { state: buildInitialState(DM_ACTOR, PLAYER_ACTOR) };
const listeners = new Set<() => void>();
/** Shaped like `SceneRuntime`: dispatches take turns, each waiting out its vault persist. A test
 *  holds `persisting` open to keep the queue busy. */
let persisting: Promise<void> | null = null;
let turns: Promise<unknown> = Promise.resolve();
const runtimeRef = {
	get state() {
		return holder.state;
	},
	defaultActorId: DM_ACTOR.id,
	dispatch(command: CoreCommand) {
		const turn = turns.then(async () => {
			const result = dispatchCommand(holder.state, env, command);
			if (result.status === 'accepted') {
				holder.state = result.nextState;
				for (const listener of listeners) listener();
				await persisting;
			}
			return result;
		});
		turns = turn.catch(() => undefined);
		return turn;
	},
};

vi.mock('../runtime/RuntimeContext', () => ({
	useRuntime: () => runtimeRef,
	DEFAULT_DM_ACTOR_ID: 'dm-1',
}));
vi.mock('../platform/assetUrl', () => ({
	useAssetObjectUrl: () => null,
	createAssetObjectUrl: async () => null,
}));

const { SceneBoardCanvas } = await import('./SceneBoardCanvas');

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class NoopResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}

let root: Root;
let host: HTMLDivElement;
let history: LayoutHistory | null = null;

// jsdom has no layout: the tile-fit probe measures text ranges every frame.
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

beforeEach(async () => {
	vi.stubGlobal('ResizeObserver', NoopResizeObserver);
	holder.state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
	await runtimeRef.dispatch({
		type: 'command-center.ensure-home',
		actorId: DM_ACTOR.id,
		payload: {},
	});
	host = document.createElement('div');
	document.body.appendChild(host);
	root = createRoot(host);
});
afterEach(() => {
	act(() => root.unmount());
	host.remove();
	vi.unstubAllGlobals();
	history = null;
	persisting = null;
});

/** `/board` in miniature: the same widgets view-model, the same clamped `move`, the same stack. */
function Board() {
	const [, rerender] = useReducer((n: number) => n + 1, 0);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	listeners.clear();
	listeners.add(rerender);
	const sceneId = holder.state.commandCenter.homeSceneId!;
	const summary = getSceneForActor(
		holder.state.scenes,
		holder.state.permissions,
		DM_ACTOR.id,
		sceneId,
		{ widgetPackages: holder.state.widgets },
	);
	if ('kind' in summary) throw new Error('home scene unreadable');
	const widgets = boardWidgetsOf(
		holder.state.scenes.scenes[sceneId].widgets,
		payloadIndex(summary.widgets),
		(type) => findWidgetDefinition(holder.state.widgets, type) ?? null,
		{ includeUndelivered: true },
	);
	const dispatch = async (command: CoreCommand) =>
		(await runtimeRef.dispatch(command)).status === 'accepted';
	const stack = useLayoutHistory({ sceneId, runtime: holder, dispatch });
	history = stack;
	return (
		<SceneBoardCanvas
			widgets={widgets}
			policy="bounded"
			editing
			snap
			selectedId={selectedId}
			onSelect={setSelectedId}
			onMove={(id, x, y) => {
				const widget = widgets.find((w) => w.id === id)!;
				return stack.run(
					{
						type: 'scene.move-widget',
						actorId: DM_ACTOR.id,
						payload: { sceneId, widgetInstanceId: id, x: clampToColumns(x, widget.w), y },
					},
					`Moved ${widget.title}`,
				);
			}}
			onResize={() => {}}
			history={stack}
			zoomPreset="fit"
		/>
	);
}

function mount() {
	act(() =>
		root.render(
			<MemoryRouter>
				<I18nProvider>
					<Board />
				</I18nProvider>
			</MemoryRouter>,
		),
	);
}

const firstWidget = () => {
	const sceneId = holder.state.commandCenter.homeSceneId!;
	return holder.state.scenes.scenes[sceneId].widgets[0];
};
const frameOf = (id: string) => host.querySelector<HTMLElement>(`[data-testid="widget-${id}"]`)!;
/** The frame's painted transform: where it is drawn, and how big. */
const painted = (frame: HTMLElement) => ({
	x: parseFloat(frame.style.left),
	y: parseFloat(frame.style.top),
	w: parseFloat(frame.style.width),
});

function pointer(target: EventTarget, type: string, clientX: number, clientY: number) {
	target.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, clientX, clientY }));
}

/** Drag the frame's move overlay by `dx`, `dy` and let the commit settle. */
async function drag(id: string, dx: number, dy: number) {
	// The move overlay is the frame's only direct child with a grab cursor.
	const overlay = [...frameOf(id).children].find(
		(child) => (child as HTMLElement).style.cursor === 'grab',
	)!;
	await act(async () => {
		pointer(overlay, 'pointerdown', 100, 100);
		pointer(window, 'pointermove', 100 + dx / 2, 100 + dy / 2);
		pointer(window, 'pointermove', 100 + dx, 100 + dy);
	});
	await act(async () => {
		pointer(window, 'pointerup', 100 + dx, 100 + dy);
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

describe('SceneBoardCanvas draws the layout it receives', () => {
	it('a clamped drop lands on the committed layout, and Undo puts the frame back with the state', async () => {
		mount();
		const widget = firstWidget();
		const before = { x: widget.layout.x, y: widget.layout.y, w: widget.layout.w };
		expect(painted(frameOf(widget.id))).toEqual(before);

		await drag(widget.id, 4000, 0);
		const moved = firstWidget().layout;
		// The board clamped the drop onto its columns; the frame shows the commit, not the drop point.
		expect(moved.x).toBe(clampToColumns(before.x + 4000, before.w));
		expect(painted(frameOf(widget.id))).toEqual({ x: moved.x, y: moved.y, w: moved.w });

		await act(async () => {
			await history!.undo();
		});
		const undone = firstWidget().layout;
		expect({ x: undone.x, y: undone.y, w: undone.w }).toEqual(before);
		expect(painted(frameOf(widget.id))).toEqual(before);
	});

	it('Redo after an undone drag moves the frame with the state too', async () => {
		mount();
		const widget = firstWidget();
		await drag(widget.id, 4000, 40);
		const moved = { ...firstWidget().layout };
		await act(async () => {
			await history!.undo();
		});
		await act(async () => {
			await history!.redo();
		});
		expect(firstWidget().layout.x).toBe(moved.x);
		expect(painted(frameOf(widget.id))).toEqual({ x: moved.x, y: moved.y, w: moved.w });
	});

	it('a keyboard nudge run is one undo step, committed on Escape', async () => {
		mount();
		const widget = firstWidget();
		const before = { x: widget.layout.x, y: widget.layout.y };
		const frame = frameOf(widget.id);
		const key = (k: string, init: KeyboardEventInit = {}) =>
			act(async () => {
				frameOf(widget.id).dispatchEvent(
					new KeyboardEvent('keydown', { key: k, bubbles: true, ...init }),
				);
				await new Promise((resolve) => setTimeout(resolve, 0));
			});
		act(() => frame.focus());
		await key(' ');
		await key('ArrowDown');
		await key('ArrowDown');
		await key('ArrowDown');
		await key('Escape');
		expect(firstWidget().layout.y).toBe(before.y + 60);
		expect(history!.undoLabel).toMatch(/^Moved /);

		await key('z', { ctrlKey: true });
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		expect({ x: firstWidget().layout.x, y: firstWidget().layout.y }).toEqual(before);
		expect(history!.canUndo).toBe(false);
		expect(painted(frameOf(widget.id))).toMatchObject(before);
	});

	it('Escape while a group nudge is still persisting: one Ctrl+Z restores every tile', async () => {
		mount();
		const sceneId = holder.state.commandCenter.homeSceneId!;
		const [a, b] = holder.state.scenes.scenes[sceneId].widgets;
		const layoutOf = (id: string) => {
			const w = holder.state.scenes.scenes[sceneId].widgets.find((x) => x.id === id)!;
			return { x: w.layout.x, y: w.layout.y };
		};
		const before = { a: layoutOf(a.id), b: layoutOf(b.id) };
		const key = (id: string, k: string, init: KeyboardEventInit = {}) =>
			act(async () => {
				frameOf(id).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...init }));
				await new Promise((resolve) => setTimeout(resolve, 0));
			});
		act(() => frameOf(a.id).focus());
		await key(a.id, ' ');
		act(() => frameOf(b.id).focus());
		await key(b.id, ' ', { shiftKey: true });

		// The vault is slow: both tiles' moves of both presses are still queued when Escape lands.
		let release!: () => void;
		persisting = new Promise<void>((resolve) => {
			release = resolve;
		});
		await key(b.id, 'ArrowDown');
		await key(b.id, 'ArrowDown');
		await key(b.id, 'Escape');
		await act(async () => {
			release();
			await turns;
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		expect(layoutOf(a.id)).toEqual({ x: before.a.x, y: before.a.y + 40 });
		expect(layoutOf(b.id)).toEqual({ x: before.b.x, y: before.b.y + 40 });

		await key(b.id, 'z', { ctrlKey: true });
		await act(async () => {
			await turns;
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		expect(layoutOf(a.id)).toEqual(before.a);
		expect(layoutOf(b.id)).toEqual(before.b);
		expect(history!.canUndo).toBe(false);
		expect(painted(frameOf(a.id))).toMatchObject(before.a);
		expect(painted(frameOf(b.id))).toMatchObject(before.b);
	});
});
