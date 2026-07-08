import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionToastStore } from '../../src/lib/gui/ux-ses/session-toasts.svelte';

// UX-SES-017: the session-tool async action toast model — undo (8 s), error+Retry (10 s),
// milestone (2 s); newest first; the queue retires older toasts beyond the cap.

describe('SessionToastStore (UX-SES-017)', () => {
	let store: SessionToastStore;

	beforeEach(() => {
		vi.useFakeTimers();
		store = new SessionToastStore();
	});

	afterEach(() => {
		store.dispose();
		vi.useRealTimers();
	});

	it('stacks newest first and caps the queue at 3 (older toasts retire)', () => {
		store.push('undo', 'first');
		store.push('undo', 'second');
		store.push('undo', 'third');
		store.push('undo', 'fourth');
		expect(store.toasts.map((toast) => toast.message)).toEqual(['fourth', 'third', 'second']);
	});

	it('auto-dismisses per kind: milestone 2 s, undo 8 s, error 10 s', () => {
		store.push('milestone', 'Round 2 begins');
		store.push('undo', 'Goblin HP: 7 → 4. Undo?');
		store.push('error', 'Roll failed.');
		expect(store.toasts).toHaveLength(3);

		vi.advanceTimersByTime(2000);
		expect(store.toasts.map((toast) => toast.kind)).toEqual(['error', 'undo']);

		vi.advanceTimersByTime(6000); // t = 8 s
		expect(store.toasts.map((toast) => toast.kind)).toEqual(['error']);

		vi.advanceTimersByTime(2000); // t = 10 s
		expect(store.toasts).toHaveLength(0);
	});

	it('UX-SES-007: a warning (concentration-check) toast persists 4 s with no action', () => {
		store.push('warning', 'Concentration check! DC 11 for Ogre.');
		expect(store.toasts[0]).toMatchObject({
			kind: 'warning',
			actionLabel: null,
		});
		vi.advanceTimersByTime(3999);
		expect(store.toasts).toHaveLength(1);
		vi.advanceTimersByTime(1);
		expect(store.toasts).toHaveLength(0);
	});

	it('runAction dismisses the toast first and invokes the action exactly once', async () => {
		const run = vi.fn();
		const id = store.push('undo', 'undoable', { label: 'Undo', run });
		await store.runAction(id);
		expect(run).toHaveBeenCalledTimes(1);
		expect(store.toasts).toHaveLength(0);
		// A second invocation is a no-op (the toast is gone).
		await store.runAction(id);
		expect(run).toHaveBeenCalledTimes(1);
	});

	it('dismiss removes a specific toast and clears its timer; dispose clears everything', () => {
		const id = store.push('error', 'boom', { label: 'Retry', run: () => undefined });
		store.push('milestone', 'ok');
		store.dismiss(id);
		expect(store.toasts.map((toast) => toast.message)).toEqual(['ok']);
		store.dispose();
		expect(store.toasts).toHaveLength(0);
	});
});
