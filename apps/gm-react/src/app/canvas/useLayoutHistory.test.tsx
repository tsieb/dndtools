// @vitest-environment jsdom

import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { CoreCommand } from '@dndtools/core';
import { DM_ACTOR } from '@dndtools/core/testing';
import { MAX_LAYOUT_HISTORY } from './useLayoutHistory';
import { harness, mountHarnessRoot } from './layoutHistoryHarness';

mountHarnessRoot();

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

describe('useLayoutHistory', () => {
	it('captures each pre-dispatch state when consecutive writes overlap persistence', async () => {
		const t = harness();
		const startX = t.layout().x;
		const move = (x: number): CoreCommand => ({
			type: 'scene.move-widget',
			actorId: DM_ACTOR.id,
			payload: { sceneId: t.sceneId, widgetInstanceId: t.widgetId, x, y: 0 },
		});
		await act(async () => {
			const first = t.history.run(move(startX + 10), 'First move');
			const second = t.history.run(move(startX + 20), 'Second move');
			expect(await first).toBe(true);
			expect(await second).toBe(true);
		});
		for (const x of [startX + 10, startX]) {
			await act(async () => {
				expect(await t.history.undo()).toBe(true);
			});
			expect(t.layout().x).toBe(x);
		}
	});

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
