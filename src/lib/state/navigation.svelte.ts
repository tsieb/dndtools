import { SvelteSet } from 'svelte/reactivity';
import type { NoteId } from '$lib/types/note.js';

export type PrimarySection = 'knowledge' | 'atlas' | 'session' | 'campaign' | 'settings';
export type RecentNavigationKind = 'note' | 'entity' | 'map';

export interface PrimarySectionNavItem {
	id: PrimarySection;
	label: string;
	href: string;
	match: (pathname: string) => boolean;
}

export const PRIMARY_SECTION_NAV_ITEMS: readonly PrimarySectionNavItem[] = [
	{
		id: 'knowledge',
		label: 'Knowledge',
		href: '/knowledge',
		match: (pathname) => pathname.startsWith('/knowledge') || pathname === '/player',
	},
	{
		id: 'atlas',
		label: 'Atlas',
		href: '/atlas/maps',
		match: (pathname) => pathname.startsWith('/atlas'),
	},
	{
		id: 'session',
		label: 'Session',
		href: '/session/boards',
		match: (pathname) => pathname.startsWith('/session'),
	},
	{
		id: 'campaign',
		label: 'Campaign',
		href: '/campaign/timeline',
		match: (pathname) => pathname.startsWith('/campaign'),
	},
	{
		id: 'settings',
		label: 'Settings',
		href: '/settings',
		match: (pathname) => pathname.startsWith('/settings'),
	},
];

const SECTION_ROOT_PATHS = new Set([
	'/knowledge',
	'/atlas/maps',
	'/session/boards',
	'/campaign/timeline',
	'/settings',
]);

function toPathname(path: string): string {
	const normalized = path.startsWith('/') ? path : `/${path}`;
	const queryIndex = normalized.indexOf('?');
	return queryIndex >= 0 ? normalized.slice(0, queryIndex) : normalized;
}

function isSectionRootPath(path: string): boolean {
	return SECTION_ROOT_PATHS.has(toPathname(path));
}

export function primarySectionFromPath(path: string): PrimarySection {
	const pathname = toPathname(path);
	const match = PRIMARY_SECTION_NAV_ITEMS.find((item) => item.match(pathname));
	return match?.id ?? 'knowledge';
}

interface NavigationEntry {
	path: string;
	label: string;
	noteId: NoteId | null;
	recentKind: RecentNavigationKind | null;
	recentItemId: string | null;
	visitedAt: string;
}

interface NavigationContext {
	label: string;
	noteId?: NoteId;
	recentKind?: RecentNavigationKind;
	recentItemId?: string;
}

export interface RecentNavigationItem {
	kind: RecentNavigationKind;
	itemId: string;
	label: string;
	path: string;
	noteId: NoteId | null;
	visitedAt: string;
}

class NavigationState {
	private readonly maxEntries = 120;
	entries = $state<NavigationEntry[]>([]);
	index = $state(-1);
	activeRoute = $state('/knowledge');
	activeSection = $state<PrimarySection>('knowledge');

	currentEntry = $derived(
		this.index >= 0 && this.index < this.entries.length ? (this.entries[this.index] ?? null) : null,
	);
	backEntry = $derived(this.index > 0 ? (this.entries[this.index - 1] ?? null) : null);
	forwardEntry = $derived(
		this.index >= 0 && this.index + 1 < this.entries.length
			? (this.entries[this.index + 1] ?? null)
			: null,
	);
	canGoBack = $derived.by(() => {
		const current = this.currentEntry;
		const back = this.backEntry;
		if (!current || !back) return false;
		if (isSectionRootPath(current.path)) return false;
		return primarySectionFromPath(current.path) === primarySectionFromPath(back.path);
	});
	canGoForward = $derived.by(() => {
		const current = this.currentEntry;
		const forward = this.forwardEntry;
		if (!current || !forward) return false;
		if (isSectionRootPath(current.path)) return false;
		return primarySectionFromPath(current.path) === primarySectionFromPath(forward.path);
	});

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

	recentItems = $derived.by<RecentNavigationItem[]>(() => {
		const seen = new SvelteSet<string>();
		const items: RecentNavigationItem[] = [];
		for (let i = this.entries.length - 1; i >= 0; i -= 1) {
			const entry = this.entries[i];
			if (!entry) continue;
			const kind = entry.recentKind ?? (entry.noteId ? 'note' : null);
			if (!kind) continue;
			const itemId = entry.recentItemId ?? (entry.noteId ? String(entry.noteId) : null);
			if (!itemId) continue;
			const dedupeKey = `${kind}:${itemId}`;
			if (seen.has(dedupeKey)) continue;
			seen.add(dedupeKey);
			items.push({
				kind,
				itemId,
				label: entry.label,
				path: entry.path,
				noteId: entry.noteId,
				visitedAt: entry.visitedAt,
			});
			if (items.length >= 10) break;
		}
		return items;
	});

	record(path: string, context: NavigationContext): void {
		const normalizedPath = this.normalizePath(path);
		this.setActiveRoute(normalizedPath);
		const label = context.label.trim() || normalizedPath;
		const noteId = context.noteId ?? null;
		const recentKind = context.recentKind ?? (noteId ? 'note' : null);
		const recentItemId = context.recentItemId ?? (noteId ? String(noteId) : null);
		const current = this.currentEntry;
		const now = new Date().toISOString();

		if (current?.path === normalizedPath) {
			this.updateCurrent({
				label,
				noteId,
				recentKind,
				recentItemId,
				visitedAt: now,
			});
			return;
		}

		const previous = this.index > 0 ? (this.entries[this.index - 1] ?? null) : null;
		if (previous?.path === normalizedPath) {
			this.index -= 1;
			this.updateCurrent({
				label,
				noteId,
				recentKind,
				recentItemId,
				visitedAt: now,
			});
			return;
		}

		const next = this.index >= 0 ? (this.entries[this.index + 1] ?? null) : null;
		if (next?.path === normalizedPath) {
			this.index += 1;
			this.updateCurrent({
				label,
				noteId,
				recentKind,
				recentItemId,
				visitedAt: now,
			});
			return;
		}

		const truncated = this.index >= 0 ? this.entries.slice(0, this.index + 1) : [];
		const appended = [
			...truncated,
			{
				path: normalizedPath,
				label,
				noteId,
				recentKind,
				recentItemId,
				visitedAt: now,
			},
		];
		const overflow = Math.max(0, appended.length - this.maxEntries);
		this.entries = overflow > 0 ? appended.slice(overflow) : appended;
		this.index = this.entries.length - 1;
	}

	setActiveRoute(path: string): void {
		const normalizedPath = this.normalizePath(path);
		this.activeRoute = normalizedPath;
		this.activeSection = primarySectionFromPath(normalizedPath);
	}

	updateCurrentLabel(label: string): void {
		const normalized = label.trim();
		if (!normalized) return;
		this.updateCurrent({ label: normalized });
	}

	reset(path: string, context: NavigationContext): void {
		const normalizedPath = this.normalizePath(path);
		const now = new Date().toISOString();
		const label = context.label.trim() || normalizedPath;
		this.entries = [
			{
				path: normalizedPath,
				label,
				noteId: context.noteId ?? null,
				recentKind: context.recentKind ?? (context.noteId ? 'note' : null),
				recentItemId: context.recentItemId ?? (context.noteId ? String(context.noteId) : null),
				visitedAt: now,
			},
		];
		this.index = 0;
		this.setActiveRoute(normalizedPath);
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
