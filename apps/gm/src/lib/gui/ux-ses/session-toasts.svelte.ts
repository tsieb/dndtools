/**
 * UX-SES-017 — the session-tool ASYNC ACTION toast model (undo / retry / milestone).
 *
 * Every durable session-tool command follows the SES-010 async action model: optimistic update →
 * pending → success (silent or milestone toast) → failure (actionable error with Retry) → undo for
 * reversible commands (8-second window). This store is the single queue behind that model for the
 * Session route: components push typed toasts; `ToastStack.svelte` renders them.
 *
 * Policy (UX-SES-017 §spec):
 *   - `undo` toasts persist for 8 s and carry an Undo action (the inverse command).
 *   - `error` toasts persist for 10 s and carry a Retry action (re-dispatch of the same command).
 *   - `milestone` toasts (e.g. "Round N begins") auto-dismiss after 2 s, no action.
 *   - Newest first; the stack cap is enforced by the renderer per platform profile (3 / 2 visible),
 *     and the queue itself keeps at most {@link MAX_QUEUED} so older toasts retire as new ones land.
 *
 * Actor-safety: callers must pass viewer-filtered text only (the same contract as the live
 * announcer) — the store never sees raw models, so it cannot leak DM-only content.
 *
 * SSR/test-safe: timers are guarded; `dispose()` clears them.
 */

import { getContext, setContext } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';

export type SessionToastKind = 'undo' | 'error' | 'milestone';

export interface SessionToast {
	id: number;
	kind: SessionToastKind;
	message: string;
	/** Label of the action button (e.g. "Undo", "Retry"); null renders no action. */
	actionLabel: string | null;
	/** Invoked when the action button is pressed; the toast dismisses itself first. */
	onAction: (() => void | Promise<void>) | null;
}

/** Auto-dismiss windows per kind (UX-SES-017 §spec). */
const TTL_MS: Record<SessionToastKind, number> = {
	undo: 8000,
	error: 10_000,
	milestone: 2000,
};

/** Older toasts beyond this retire immediately when a new one lands. */
const MAX_QUEUED = 3;

export class SessionToastStore {
	/** Newest first. */
	toasts = $state<SessionToast[]>([]);
	#seq = 0;
	#timers = new SvelteMap<number, ReturnType<typeof setTimeout>>();

	/** Push a toast; returns its id. The newest toast is always first in the stack. */
	push(
		kind: SessionToastKind,
		message: string,
		action?: { label: string; run: () => void | Promise<void> },
	): number {
		this.#seq += 1;
		const id = this.#seq;
		const toast: SessionToast = {
			id,
			kind,
			message,
			actionLabel: action?.label ?? null,
			onAction: action?.run ?? null,
		};
		const next = [toast, ...this.toasts];
		// Retire the oldest beyond the queue cap (UX-SES-017 stacked-undo rule).
		for (const dropped of next.slice(MAX_QUEUED)) this.#clearTimer(dropped.id);
		this.toasts = next.slice(0, MAX_QUEUED);
		this.#schedule(id, TTL_MS[kind]);
		return id;
	}

	dismiss(id: number): void {
		this.#clearTimer(id);
		this.toasts = this.toasts.filter((toast) => toast.id !== id);
	}

	/** Run a toast's action (Undo / Retry), dismissing it first so it cannot fire twice. */
	async runAction(id: number): Promise<void> {
		const toast = this.toasts.find((candidate) => candidate.id === id);
		if (!toast?.onAction) return;
		this.dismiss(id);
		await toast.onAction();
	}

	#schedule(id: number, ms: number): void {
		if (typeof setTimeout === 'undefined') return;
		this.#timers.set(
			id,
			setTimeout(() => this.dismiss(id), ms),
		);
	}

	#clearTimer(id: number): void {
		const timer = this.#timers.get(id);
		if (timer !== undefined) clearTimeout(timer);
		this.#timers.delete(id);
	}

	/** Clear all toasts and timers (teardown). */
	dispose(): void {
		for (const id of [...this.#timers.keys()]) this.#clearTimer(id);
		this.toasts = [];
	}
}

const KEY = Symbol('dndtools:v2:session-toasts');

export function provideSessionToasts(store: SessionToastStore): SessionToastStore {
	setContext(KEY, store);
	return store;
}

/** Returns the toast store if mounted, else `null` (callers degrade gracefully). */
export function useSessionToasts(): SessionToastStore | null {
	return getContext<SessionToastStore | undefined>(KEY) ?? null;
}
