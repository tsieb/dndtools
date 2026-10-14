// @vitest-environment jsdom

import { act } from 'react';
import { describe, expect, it } from 'vitest';
import type { CoreCommand } from '@dndtools/core';
import { DM_ACTOR } from '@dndtools/core/testing';
import { harness, mountHarnessRoot } from './layoutHistoryHarness';

mountHarnessRoot();

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
