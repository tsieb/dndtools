// @vitest-environment jsdom

import { act, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dispatchCommand, type CoreCommand, type CoreStateSlice } from '@dndtools/core';
import { DM_ACTOR, PLAYER_ACTOR, buildInitialState, makeEnvironment } from '@dndtools/core/testing';
import { MAX_LAYOUT_HISTORY, useLayoutHistory, type LayoutHistory } from './useLayoutHistory';

/**
 * RC-CAN-1.3 — the canvas undo stack, driven against a REAL Core.
 *
 * `dispatch` here is the same shape the two canvas screens pass (a guarded dispatch that returns
 * whether the command was accepted), and the state it mutates is the state the hook reads to build
 * each inverse. So these assertions are about the stack, not about a mock: an undo is a real
 * `dispatchCommand` of the core-built inverse, and the widget's layout is read back out of core.
 *
 * Resize lives here rather than in `canvas.spec.ts` because every widget that ships today is
 * `system` tier, and the canvas deliberately offers no resize control for those — there is no
 * pointer or keyboard path an end-to-end test could take to a `scene.resize-widget`.
 */

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
	host = document.createElement('div');
	document.body.appendChild(host);
	root = createRoot(host);
});
afterEach(() => {
	act(() => root.unmount());
	host.remove();
});

function accept(result: ReturnType<typeof dispatchCommand>): CoreStateSlice {
	if (result.status !== 'accepted') {
		throw new Error(`command rejected: ${JSON.stringify(result.rejection)}`);
	}
	return result.nextState;
}

/** A campaign whose home scene holds at least one widget. */
function campaign(): { state: CoreStateSlice; sceneId: string; widgetId: string } {
	const env = makeEnvironment();
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
	state = accept(
		dispatchCommand(state, env, {
			type: 'command-center.ensure-home',
			actorId: DM_ACTOR.id,
			payload: {},
		}),
	);
	const sceneId = state.commandCenter.homeSceneId as string;
	const widgetId = state.scenes.scenes[sceneId].widgets[0].id;
	return { state, sceneId, widgetId };
}

/** A stand-in for the screen: a mutable Core state, a guarded dispatch, and the hook on top. */
function harness() {
	const env = makeEnvironment();
	const start = campaign();
	const holder = { state: start.state };
	let api: LayoutHistory | null = null;

	function Probe({ scene }: { scene: string | null }) {
		const history = useLayoutHistory({
			sceneId: scene,
			runtime: holder,
			dispatch: async (command: CoreCommand) => {
				const result = dispatchCommand(holder.state, env, command);
				if (result.status !== 'accepted') return false;
				holder.state = result.nextState;
				return true;
			},
		});
		api = history;
		return null;
	}
	function Host() {
		const [scene, setScene] = useState<string | null>(start.sceneId);
		useEffect(() => {
			swap = setScene;
		}, []);
		return <Probe scene={scene} />;
	}
	let swap: ((next: string | null) => void) | null = null;

	act(() => root.render(<Host />));
	return {
		holder,
		sceneId: start.sceneId,
		widgetId: start.widgetId,
		get history(): LayoutHistory {
			if (!api) throw new Error('probe did not mount');
			return api;
		},
		layout: () =>
			holder.state.scenes.scenes[start.sceneId].widgets.find((w) => w.id === start.widgetId)!
				.layout,
		switchScene(next: string | null) {
			act(() => swap!(next));
		},
	};
}

describe('useLayoutHistory', () => {
	it('undoes a resize back to the exact size the widget had, and announces it', async () => {
		const t = harness();
		const before = { w: t.layout().w, h: t.layout().h };

		await act(async () => {
			await t.history.run(
				{
					type: 'scene.resize-widget',
					actorId: DM_ACTOR.id,
					payload: {
						sceneId: t.sceneId,
						widgetInstanceId: t.widgetId,
						w: before.w + 120,
						h: before.h + 80,
					},
				},
				'Resized Timer',
			);
		});
		expect(t.layout().w).toBe(before.w + 120);
		expect(t.history.canUndo).toBe(true);
		expect(t.history.undoLabel).toBe('Resized Timer');

		await act(async () => {
			await t.history.undo();
		});
		expect({ w: t.layout().w, h: t.layout().h }).toEqual(before);
		expect(t.history.announcement?.text).toBe('Undone: resized Timer');
		expect(t.history.canUndo).toBe(false);
		expect(t.history.canRedo).toBe(true);

		await act(async () => {
			await t.history.redo();
		});
		expect(t.layout().w).toBe(before.w + 120);
		expect(t.history.announcement?.text).toBe('Redone: resized Timer');
	});

	it('undoes a move, and re-announces when the same undo happens twice', async () => {
		const t = harness();
		const startX = t.layout().x;
		const move = (x: number): CoreCommand => ({
			type: 'scene.move-widget',
			actorId: DM_ACTOR.id,
			payload: { sceneId: t.sceneId, widgetInstanceId: t.widgetId, x, y: t.layout().y },
		});

		await act(async () => {
			await t.history.run(move(startX + 20), 'Moved Timer');
		});
		await act(async () => {
			await t.history.undo();
		});
		expect(t.layout().x).toBe(startX);
		const first = t.history.announcement;
		expect(first?.text).toBe('Undone: moved Timer');

		await act(async () => {
			await t.history.run(move(startX + 40), 'Moved Timer');
		});
		await act(async () => {
			await t.history.undo();
		});
		// Identical text: the sequence number is what makes the live region speak a second time.
		expect(t.history.announcement?.text).toBe('Undone: moved Timer');
		expect(t.history.announcement?.seq).toBeGreaterThan(first!.seq);
	});

	it('keeps at most 50 steps, dropping the oldest', async () => {
		const t = harness();
		const startX = t.layout().x;
		for (let i = 1; i <= MAX_LAYOUT_HISTORY + 5; i += 1) {
			await act(async () => {
				await t.history.run(
					{
						type: 'scene.move-widget',
						actorId: DM_ACTOR.id,
						payload: {
							sceneId: t.sceneId,
							widgetInstanceId: t.widgetId,
							x: startX + i * 10,
							y: t.layout().y,
						},
					},
					`Moved step ${i}`,
				);
			});
		}
		expect(t.history.undoLabel).toBe(`Moved step ${MAX_LAYOUT_HISTORY + 5}`);

		for (let i = 0; i < MAX_LAYOUT_HISTORY; i += 1) {
			await act(async () => {
				await t.history.undo();
			});
		}
		// Exactly 50 reversals were available; the first five moves are past the end of the stack, so
		// the widget stops at where step 5 left it rather than back at the start.
		expect(t.history.canUndo).toBe(false);
		expect(t.layout().x).toBe(startX + 5 * 10);
	});

	it('drops the stack when the canvas changes scene', async () => {
		const t = harness();
		await act(async () => {
			await t.history.run(
				{
					type: 'scene.move-widget',
					actorId: DM_ACTOR.id,
					payload: { sceneId: t.sceneId, widgetInstanceId: t.widgetId, x: 200, y: 200 },
				},
				'Moved Timer',
			);
		});
		expect(t.history.canUndo).toBe(true);

		// An inverse names a scene and an instance: carrying one across a scene switch would let Ctrl+Z
		// on the new scene dispatch against the old one.
		t.switchScene('scene-b');
		expect(t.history.canUndo).toBe(false);
		expect(t.history.canRedo).toBe(false);
		expect(t.history.announcement).toBeNull();
	});

	it('records nothing for a command the core refuses to invert', async () => {
		const t = harness();
		await act(async () => {
			await t.history.run(
				{
					type: 'scene.group-widgets',
					actorId: DM_ACTOR.id,
					payload: { sceneId: t.sceneId, widgetInstanceIds: [t.widgetId] },
				},
				'Grouped Timer',
			);
		});
		// `scene.group-widgets` mints a fresh group id, so no command can put the previous grouping
		// back. Pushing a wrong inverse would be worse than offering no undo.
		expect(t.history.canUndo).toBe(false);
	});
});
