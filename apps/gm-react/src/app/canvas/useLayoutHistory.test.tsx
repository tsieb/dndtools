// @vitest-environment jsdom

import { act, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	dispatchCommand,
	type CoreCommand,
	type CoreStateSlice,
	type SyncOperation,
} from '@dndtools/core';
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
function campaign(): {
	env: ReturnType<typeof makeEnvironment>;
	state: CoreStateSlice;
	sceneId: string;
	widgetId: string;
} {
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
	return { env, state, sceneId, widgetId };
}

/**
 * A stand-in for the screen: a mutable Core state, a guarded dispatch, and the hook on top. The
 * real guarded dispatch resolves only after the vault persist, while the core state changes at
 * once — `persist` lets a test hold that gap open.
 */
function harness(options: { persist?: () => Promise<void> } = {}) {
	// The campaign's own environment: a second one would mint ids that collide with the seed's.
	const start = campaign();
	const env = start.env;
	// Shaped like `SceneRuntime`: accepted dispatches are signalled with the operations they logged.
	const listeners = new Set<(ops: SyncOperation[], next: CoreStateSlice) => void>();
	const holder = {
		state: start.state,
		defaultActorId: DM_ACTOR.id,
		onDispatched(listener: (ops: SyncOperation[], next: CoreStateSlice) => void) {
			listeners.add(listener);
			return () => void listeners.delete(listener);
		},
	};
	// One queue, like `SceneRuntime.dispatch`: the state changes at once, the signal fires after the
	// persist, and the next dispatch waits for both.
	let tail: Promise<unknown> = Promise.resolve();
	const apply = (command: CoreCommand) => {
		const work = tail.then(async () => {
			const result = dispatchCommand(holder.state, env, command);
			if (result.status !== 'accepted') return result;
			const ops = result.nextState.sync.operations.slice(holder.state.sync.operations.length);
			holder.state = result.nextState;
			await options.persist?.();
			for (const listener of listeners) listener(ops, result.nextState);
			return result;
		});
		tail = work.catch(() => undefined);
		return work;
	};
	let api: LayoutHistory | null = null;

	function Probe({ scene }: { scene: string | null }) {
		const history = useLayoutHistory({
			sceneId: scene,
			runtime: holder,
			dispatch: async (command: CoreCommand) => (await apply(command)).status === 'accepted',
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
		/** Dispatch past the stack, as the palette and the template picker do, and let it settle. */
		async dispatchOutside(command: CoreCommand) {
			await act(async () => void accept(await apply(command)));
		},
		/** Queue a dispatch past the stack without waiting for it. */
		queueOutside: apply,
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

	it('an undo issued before the move has settled still reverses it', async () => {
		// A DM who nudges a widget with an arrow key and presses Ctrl+Z straight away used to find an
		// empty stack: the entry was only recorded once the dispatch had persisted AND the hook had
		// re-rendered, so the undo silently did nothing while the toolbar button, pressed a moment
		// later, worked. Undo now waits for the in-flight run and reads the stack it wrote.
		let release!: () => void;
		const persisted = new Promise<void>((resolve) => {
			release = resolve;
		});
		const t = harness({ persist: () => persisted });
		const startX = t.layout().x;
		let undone: Promise<boolean> = Promise.resolve(false);
		await act(async () => {
			const ran = t.history.run(
				{
					type: 'scene.move-widget',
					actorId: DM_ACTOR.id,
					payload: {
						sceneId: t.sceneId,
						widgetInstanceId: t.widgetId,
						x: startX + 20,
						y: t.layout().y,
					},
				},
				'Moved Timer',
			);
			// The core already holds the moved widget; the persist has not resolved yet.
			await vi.waitFor(() => expect(t.layout().x).toBe(startX + 20));
			undone = t.history.undo();
			release();
			await ran;
			await undone;
		});
		expect(await undone).toBe(true);
		expect(t.layout().x).toBe(startX);
		expect(t.history.announcement?.text).toBe('Undone: moved Timer');
		expect(t.history.canUndo).toBe(false);
		expect(t.history.canRedo).toBe(true);
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

describe('useLayoutHistory — RC-CAN-8.1 bursts and adds', () => {
	const moveTo = (t: ReturnType<typeof harness>, x: number, y: number): CoreCommand => ({
		type: 'scene.move-widget',
		actorId: DM_ACTOR.id,
		payload: { sceneId: t.sceneId, widgetInstanceId: t.widgetId, x, y },
	});

	it('folds a burst of nudges into one step, and the next burst starts another', async () => {
		const t = harness();
		const start = { x: t.layout().x, y: t.layout().y };
		await act(async () => {
			t.history.beginBurst();
			for (let i = 1; i <= 3; i += 1)
				await t.history.run(moveTo(t, start.x, start.y + i * 20), 'Moved Timer');
			t.history.settle();
		});
		// A second burst after Escape is its own step.
		await act(async () => {
			t.history.beginBurst();
			await t.history.run(moveTo(t, start.x + 20, start.y + 60), 'Moved Timer');
			t.history.settle();
		});

		await act(async () => {
			await t.history.undo();
		});
		expect({ x: t.layout().x, y: t.layout().y }).toEqual({ x: start.x, y: start.y + 60 });
		await act(async () => {
			await t.history.undo();
		});
		expect({ x: t.layout().x, y: t.layout().y }).toEqual(start);
		expect(t.history.canUndo).toBe(false);

		await act(async () => {
			await t.history.redo();
		});
		expect({ x: t.layout().x, y: t.layout().y }).toEqual({ x: start.x, y: start.y + 60 });
	});

	it('an undo in the middle of a burst ends it', async () => {
		const t = harness();
		const start = { x: t.layout().x, y: t.layout().y };
		await act(async () => {
			t.history.beginBurst();
			await t.history.run(moveTo(t, start.x, start.y + 20), 'Moved Timer');
			await t.history.undo();
			await t.history.run(moveTo(t, start.x, start.y + 40), 'Moved Timer');
		});
		// The run after the undo is a fresh step, not folded into the one already undone.
		await act(async () => {
			await t.history.undo();
		});
		expect({ x: t.layout().x, y: t.layout().y }).toEqual(start);
	});

	it('a nudge still persisting when Escape settles the burst folds into that burst', async () => {
		// Escape or blur can arrive while the last nudges are still queued behind the vault persist.
		// Each `run` belongs to the burst open when it was CALLED, so one Ctrl+Z still takes back the
		// whole burst instead of only its last two nudges.
		let release!: () => void;
		const persisted = new Promise<void>((resolve) => {
			release = resolve;
		});
		let hold = false;
		const t = harness({ persist: () => (hold ? persisted : Promise.resolve()) });
		const start = { x: t.layout().x, y: t.layout().y };
		await act(async () => {
			t.history.beginBurst();
			await t.history.run(moveTo(t, start.x, start.y + 20), 'Moved Timer');
		});
		await act(async () => {
			hold = true;
			const second = t.history.run(moveTo(t, start.x, start.y + 40), 'Moved Timer');
			const third = t.history.run(moveTo(t, start.x, start.y + 60), 'Moved Timer');
			t.history.settle();
			release();
			await Promise.all([second, third]);
		});
		await act(async () => {
			await t.history.undo();
		});
		expect({ x: t.layout().x, y: t.layout().y }).toEqual(start);
		expect(t.history.canUndo).toBe(false);
	});

	it('an undo right after Escape waits for every nudge still persisting', async () => {
		let release!: () => void;
		const persisted = new Promise<void>((resolve) => {
			release = resolve;
		});
		const t = harness({ persist: () => persisted });
		const start = { x: t.layout().x, y: t.layout().y };
		let undone: Promise<boolean> = Promise.resolve(false);
		await act(async () => {
			t.history.beginBurst();
			const runs = [1, 2, 3].map((i) =>
				t.history.run(moveTo(t, start.x, start.y + i * 20), 'Moved Timer'),
			);
			t.history.settle();
			undone = t.history.undo();
			release();
			await Promise.all([...runs, undone]);
		});
		expect(await undone).toBe(true);
		expect({ x: t.layout().x, y: t.layout().y }).toEqual(start);
		expect(t.history.canUndo).toBe(false);
	});

	it('an add through run is undoable, and its redo restores the same instance', async () => {
		const t = harness();
		const ids = () => t.holder.state.scenes.scenes[t.sceneId].widgets.map((w) => w.id);
		const before = ids();
		await act(async () => {
			await t.history.run(
				{
					type: 'scene.add-widget',
					actorId: DM_ACTOR.id,
					payload: {
						sceneId: t.sceneId,
						widget: {
							type: 'dice',
							version: '1.0.0',
							layout: { x: 24, y: 900, w: 240, h: 160 },
							configuration: {},
							localState: {},
							binding: null,
						},
					},
				},
				'Added Dice',
			);
		});
		const added = ids().filter((id) => !before.includes(id));
		expect(added).toHaveLength(1);
		// Signalled by the runtime AND returned to `run`: still exactly one step.
		await act(async () => {
			await t.history.undo();
		});
		expect(ids()).toEqual(before);
		expect(t.history.canUndo).toBe(false);
		await act(async () => {
			await t.history.redo();
		});
		expect(ids()).toContain(added[0]);
	});

	it('records a template applied past the stack, and takes all its tiles back in one step', async () => {
		const t = harness();
		const ids = () => t.holder.state.scenes.scenes[t.sceneId].widgets.map((w) => w.id);
		const before = ids();
		const command: CoreCommand = {
			type: 'scene.apply-template',
			actorId: DM_ACTOR.id,
			payload: { sceneId: t.sceneId, source: { kind: 'builtin', templateId: 'combat' } },
		};
		// The template picker dispatches straight to the runtime; the stack records it off the signal.
		await t.dispatchOutside(command);
		expect(ids().length).toBeGreaterThan(before.length + 1);
		expect(t.history.undoLabel).toBe('Applied template');

		await act(async () => {
			await t.history.undo();
		});
		expect(ids()).toEqual(before);
	});

	it('undoing a template on an empty scene puts the old background back too', async () => {
		const t = harness();
		const scene = () => t.holder.state.scenes.scenes[t.sceneId];
		for (const widget of [...scene().widgets])
			await t.dispatchOutside({
				type: 'scene.destroy-widget',
				actorId: DM_ACTOR.id,
				payload: { sceneId: t.sceneId, widgetInstanceId: widget.id },
			});
		const background = scene().visualSettings.background;
		const command: CoreCommand = {
			type: 'scene.apply-template',
			actorId: DM_ACTOR.id,
			payload: { sceneId: t.sceneId, source: { kind: 'builtin', templateId: 'combat' } },
		};
		await act(async () => {
			await t.history.run(command, 'Applied Combat scene');
		});
		expect(scene().visualSettings.background).toBe('dark');
		expect(background).not.toBe('dark');

		await act(async () => {
			await t.history.undo();
		});
		expect(scene().widgets).toHaveLength(0);
		expect(scene().visualSettings.background).toBe(background);
	});

	// RC-CAN-8.1 review: placements that wait behind the runtime's persist at the same time.
	const addDice = (sceneId: string): CoreCommand => ({
		type: 'scene.add-widget',
		actorId: DM_ACTOR.id,
		payload: {
			sceneId,
			widget: {
				type: 'dice',
				version: '1.0.0',
				layout: { x: 24, y: 900, w: 240, h: 160 },
				configuration: {},
				localState: {},
				binding: null,
			},
		},
	});

	it('a gallery add queued behind a palette add undoes only its own tile', async () => {
		let release!: () => void;
		const persisted = new Promise<void>((resolve) => {
			release = resolve;
		});
		let hold = true;
		const t = harness({ persist: () => (hold ? persisted : Promise.resolve()) });
		const ids = () => t.holder.state.scenes.scenes[t.sceneId].widgets.map((w) => w.id);
		const before = ids();
		await act(async () => {
			// An earlier write still persisting, then the palette's add, then the gallery's.
			const earlier = t.queueOutside(moveTo(t, 24, 64));
			const palette = t.queueOutside(addDice(t.sceneId));
			const gallery = t.history.run(addDice(t.sceneId), 'Added Dice');
			hold = false;
			release();
			await Promise.all([earlier, palette, gallery]);
		});
		const placed = ids().filter((id) => !before.includes(id));
		expect(placed).toHaveLength(2);

		await act(async () => {
			await t.history.undo();
		});
		expect(ids()).toEqual([...before, placed[0]]);
		await act(async () => {
			await t.history.undo();
		});
		expect(ids()).toEqual(before);
	});

	it('a palette add made while a template undo replays stays an undo step of its own', async () => {
		let release!: () => void;
		const persisted = new Promise<void>((resolve) => {
			release = resolve;
		});
		let hold = false;
		const t = harness({ persist: () => (hold ? persisted : Promise.resolve()) });
		const ids = () => t.holder.state.scenes.scenes[t.sceneId].widgets.map((w) => w.id);
		const before = ids();
		await act(async () => {
			await t.history.run(
				{
					type: 'scene.apply-template',
					actorId: DM_ACTOR.id,
					payload: { sceneId: t.sceneId, source: { kind: 'builtin', templateId: 'combat' } },
				},
				'Applied template',
			);
		});
		hold = true;
		let undone!: Promise<boolean>;
		let palette!: Promise<unknown>;
		await act(async () => {
			undone = t.history.undo();
			// Lands between two of the template's destroys.
			palette = t.queueOutside(addDice(t.sceneId));
			await Promise.resolve();
		});
		await act(async () => {
			hold = false;
			release();
			await Promise.all([undone, palette]);
		});
		expect(ids()).toHaveLength(before.length + 1);
		expect(t.history.undoLabel).toBe('Added Dice');
		// The add closed the redo branch: redoing the template onto it would be a different edit.
		expect(t.history.canRedo).toBe(false);
		await act(async () => {
			await t.history.undo();
		});
		expect(ids()).toEqual(before);
		expect(t.history.canUndo).toBe(false);
	});
});
