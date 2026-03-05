import { a11yAnnouncerState } from '$lib/state/a11y-announcer.svelte.js';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
	id: string;
	message: string;
	type: ToastType;
	duration: number;
}

let counter = 0;
const MAX_VISIBLE_TOASTS = 4;
const DEFAULT_TOAST_DURATIONS: Record<ToastType, number> = {
	success: 5000,
	info: 4000,
	error: 0,
	warning: 7000,
};

interface ToastTimer {
	timeoutId: ReturnType<typeof setTimeout> | null;
	startedAt: number;
	remaining: number;
}

class ToastState {
	toasts = $state<Toast[]>([]);
	private timers = new Map<string, ToastTimer>();

	add(
		message: string,
		type: Toast['type'] = 'info',
		duration: number = DEFAULT_TOAST_DURATIONS[type],
	): void {
		const id = `toast-${++counter}`;
		const toast: Toast = { id, message, type, duration };
		const nextToasts = [...this.toasts, toast];

		while (nextToasts.length > MAX_VISIBLE_TOASTS) {
			const removableIndex = nextToasts.findIndex(
				(entry) => entry.type === 'success' || entry.type === 'info',
			);
			if (removableIndex === -1) break;
			const [removed] = nextToasts.splice(removableIndex, 1);
			if (removed) {
				this.clearTimer(removed.id);
			}
		}

		this.toasts = nextToasts;
		if (type === 'error' || type === 'warning') {
			a11yAnnouncerState.announceAssertive(message);
		} else {
			a11yAnnouncerState.announcePolite(message);
		}

		if (duration > 0) {
			this.startTimer(id, duration);
		}
	}

	remove(id: string): void {
		this.clearTimer(id);
		this.toasts = this.toasts.filter((t) => t.id !== id);
	}

	pause(id: string): void {
		const timer = this.timers.get(id);
		if (!timer || timer.timeoutId === null) return;
		clearTimeout(timer.timeoutId);
		const elapsed = performance.now() - timer.startedAt;
		timer.remaining = Math.max(0, timer.remaining - elapsed);
		timer.timeoutId = null;
		this.timers.set(id, timer);
	}

	resume(id: string): void {
		const timer = this.timers.get(id);
		if (!timer || timer.timeoutId !== null) return;
		if (timer.remaining <= 0) {
			this.remove(id);
			return;
		}
		timer.startedAt = performance.now();
		timer.timeoutId = setTimeout(() => this.remove(id), timer.remaining);
		this.timers.set(id, timer);
	}

	private startTimer(id: string, duration: number): void {
		this.clearTimer(id);
		const timer: ToastTimer = {
			timeoutId: null,
			startedAt: performance.now(),
			remaining: duration,
		};
		timer.timeoutId = setTimeout(() => this.remove(id), duration);
		this.timers.set(id, timer);
	}

	private clearTimer(id: string): void {
		const existing = this.timers.get(id);
		if (existing && existing.timeoutId !== null) {
			clearTimeout(existing.timeoutId);
		}
		this.timers.delete(id);
	}

	success(message: string): void {
		this.add(message, 'success', DEFAULT_TOAST_DURATIONS.success);
	}

	error(message: string): void {
		this.add(message, 'error', DEFAULT_TOAST_DURATIONS.error);
	}

	info(message: string): void {
		this.add(message, 'info', DEFAULT_TOAST_DURATIONS.info);
	}

	warning(message: string): void {
		this.add(message, 'warning', DEFAULT_TOAST_DURATIONS.warning);
	}
}

export const toastState = new ToastState();
