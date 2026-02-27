import { SvelteSet } from 'svelte/reactivity';
import type { NoteId } from '$lib/types/note.js';

interface NavigationEntry {
	path: string;
	label: string;
	noteId: NoteId | null;
	visitedAt: string;
}

interface NavigationContext {
	label: string;
	noteId?: NoteId;
}

class NavigationState {
	private readonly maxEntries = 120;
	entries = $state<NavigationEntry[]>([]);
	index = $state(-1);

	currentEntry = $derived(
		this.index >= 0 && this.index < this.entries.length ? (this.entries[this.index] ?? null) : null,
	);
	backEntry = $derived(this.index > 0 ? (this.entries[this.index - 1] ?? null) : null);
	forwardEntry = $derived(
		this.index >= 0 && this.index + 1 < this.entries.length
			? (this.entries[this.index + 1] ?? null)
			: null,
	);
	canGoBack = $derived(this.backEntry !== null);
	canGoForward = $derived(this.forwardEntry !== null);

	recentNoteIds = $derived.by(() => {
		const seen = new SvelteSet<string>();
		const ids: NoteId[] = [];
		for (let i = this.entries.length - 1; i >= 0; i -= 1) {
			const entry = this.entries[i];
			if (!entry?.noteId) continue;
			const id = String(entry.noteId);
			if (seen.has(id)) continue;
			seen.add(id);
			ids.push(entry.noteId);
			if (ids.length >= 20) break;
		}
		return ids;
	});

	record(path: string, context: NavigationContext): void {
		const normalizedPath = this.normalizePath(path);
		const label = context.label.trim() || normalizedPath;
		const noteId = context.noteId ?? null;
		const current = this.currentEntry;
		const now = new Date().toISOString();

		if (current?.path === normalizedPath) {
			this.updateCurrent({ label, noteId, visitedAt: now });
			return;
		}

		const previous = this.index > 0 ? (this.entries[this.index - 1] ?? null) : null;
		if (previous?.path === normalizedPath) {
			this.index -= 1;
			this.updateCurrent({ label, noteId, visitedAt: now });
			return;
		}

		const next = this.index >= 0 ? (this.entries[this.index + 1] ?? null) : null;
		if (next?.path === normalizedPath) {
			this.index += 1;
			this.updateCurrent({ label, noteId, visitedAt: now });
			return;
		}

		const truncated = this.index >= 0 ? this.entries.slice(0, this.index + 1) : [];
		const appended = [...truncated, { path: normalizedPath, label, noteId, visitedAt: now }];
		const overflow = Math.max(0, appended.length - this.maxEntries);
		this.entries = overflow > 0 ? appended.slice(overflow) : appended;
		this.index = this.entries.length - 1;
	}

	updateCurrentLabel(label: string): void {
		const normalized = label.trim();
		if (!normalized) return;
		this.updateCurrent({ label: normalized });
	}

	private updateCurrent(patch: Partial<NavigationEntry>): void {
		if (this.index < 0 || this.index >= this.entries.length) return;
		const nextEntries = [...this.entries];
		const current = nextEntries[this.index];
		if (!current) return;
		nextEntries[this.index] = { ...current, ...patch };
		this.entries = nextEntries;
	}

	private normalizePath(path: string): string {
		if (!path) return '/';
		return path.startsWith('/') ? path : `/${path}`;
	}
}

export const navigationState = new NavigationState();
