<script lang="ts">
	import { notesState } from '$lib/state/notes.svelte.js';
	import { vaultState } from '$lib/state/vault.svelte.js';
	import { linksState } from '$lib/state/links.svelte.js';
	import { navigationState } from '$lib/state/navigation.svelte.js';
	import { onboardingState } from '$lib/state/onboarding.svelte.js';
	import { searchState } from '$lib/state/search.svelte.js';
	import { ui } from '$lib/state/ui.svelte.js';
	import { playerModeState } from '$lib/state/player-mode.svelte.js';
	import { mapsState } from '$lib/state/maps.svelte.js';
	import { isVaultObjectNote } from '$lib/domain/object-notes.js';
	import { mapDescendantIds, mapHierarchyEntries, noteMapIds } from '$lib/domain/map-atlas.js';
	import { buildOpenThreadsReport } from '$lib/domain/open-threads.js';
	import { isNoteVisibleInPlayerMode } from '$lib/domain/visibility.js';
	import WorldCalendarReference from '$lib/ui/calendar/WorldCalendarReference.svelte';
	import SessionContextPanel from '$lib/ui/session/SessionContextPanel.svelte';
	import { worldCalendarState } from '$lib/state/world-calendar.svelte.js';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';

	interface Props {
		onnewnote: () => void;
		ondice: () => void;
		ontemplate: (folderOverride?: string) => void;
		presentation?: 'sidebar' | 'sheet';
	}

	type SidebarMode = 'tree' | 'recent' | 'favorites' | 'campaign';

	let { onnewnote, ondice, ontemplate, presentation = 'sidebar' }: Props = $props();
	let mode = $state<SidebarMode>('tree');
	let showTags = $state(false);
	let treeViewMode = $state<'folder' | 'map'>('folder');
	let folderContextMenu = $state<{ folderId: string; x: number; y: number } | null>(null);
	let folderContextMenuEl = $state<HTMLElement | null>(null);
	let reselectedNoteId = $state<string | null>(null);
	let reselectedNoteTimer = $state<ReturnType<typeof setTimeout> | null>(null);
	let currentPath = $derived(page.url.pathname);

	let modeScopedNotes = $derived.by(() =>
		playerModeState.enabled
			? notesState.activeNotes.filter((note) => isNoteVisibleInPlayerMode(note))
			: notesState.activeNotes,
	);
	let modeScopedPinnedNotes = $derived.by(() =>
		playerModeState.enabled
			? notesState.pinnedNotes.filter((note) => isNoteVisibleInPlayerMode(note))
			: notesState.pinnedNotes,
	);
	let modeScopedTagCounts = $derived.by(() => {
		if (!playerModeState.enabled) return vaultState.tagCounts;
		const counts: Record<string, number> = {};
		for (const note of modeScopedNotes) {
			for (const tag of note.tags) {
				counts[tag] = (counts[tag] ?? 0) + 1;
			}
		}
		return Object.entries(counts)
			.map(([name, count]) => ({ name, count }))
			.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
	});
	let modeScopedNoteCount = $derived(modeScopedNotes.length);
	let modeScopedFolderTree = $derived.by(() => {
		if (!playerModeState.enabled) {
			return vaultState.folders
				.filter((folder) => folder.id !== '/')
				.sort((a, b) => a.id.localeCompare(b.id))
				.map((folder) => ({
					id: folder.id,
					noteCount: folder.noteCount,
				}));
		}
		const counts: Record<string, number> = {};
		for (const note of modeScopedNotes) {
			const raw = String(note.folder);
			const normalized = raw.startsWith('/') ? raw : `/${raw}`;
			counts[normalized] = (counts[normalized] ?? 0) + 1;
		}
		return Object.entries(counts)
			.map(([id, noteCount]) => ({ id, noteCount }))
			.sort((a, b) => a.id.localeCompare(b.id));
	});

	let pinnedNotes = $derived(modeScopedPinnedNotes.slice(0, 20));
	let recentNotes = $derived(
		modeScopedNotes
			.filter((note) => !note.pinned)
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
			.slice(0, 12),
	);
	let recentlyVisited = $derived.by(() =>
		navigationState.recentNoteIds
			.map((id) => notesState.getActiveNoteById(id))
			.filter(
				(note): note is NonNullable<typeof note> =>
					!!note && (!playerModeState.enabled || isNoteVisibleInPlayerMode(note)),
			)
			.slice(0, 10),
	);
	let folderTreeEntries = $derived.by(() =>
		modeScopedFolderTree
			.map((folder) => {
				const parts = folder.id.split('/').filter(Boolean);
				return {
					id: folder.id,
					name: parts[parts.length - 1] ?? folder.id,
					depth: Math.max(0, parts.length - 1),
					noteCount: folder.noteCount,
				};
			})
			.slice(0, 60),
	);
	let mapTreeEntries = $derived.by(() => {
		const hierarchy = mapHierarchyEntries(mapsState.maps);
		if (hierarchy.length === 0) return [];
		const noteIdsByMap: Record<string, string[]> = {};
		for (const note of modeScopedNotes) {
			for (const mapId of noteMapIds(note, mapsState.maps)) {
				const noteId = String(note.id);
				const bucket = noteIdsByMap[mapId] ?? [];
				if (!bucket.includes(noteId)) {
					bucket.push(noteId);
				}
				noteIdsByMap[mapId] = bucket;
			}
		}
		return hierarchy.map((entry) => {
			const noteIds: string[] = [];
			for (const scopedMapId of mapDescendantIds(entry.mapId, mapsState.maps)) {
				for (const noteId of noteIdsByMap[scopedMapId] ?? []) {
					if (!noteIds.includes(noteId)) {
						noteIds.push(noteId);
					}
				}
			}
			return {
				id: entry.mapId,
				name: entry.name,
				depth: entry.depth,
				noteCount: noteIds.length,
			};
		});
	});
	let pinnedCampaignEntities = $derived.by(() =>
		modeScopedPinnedNotes.filter((note) => isVaultObjectNote(note)).slice(0, 12),
	);
	let campaignEntities = $derived.by(() =>
		modeScopedNotes
			.filter((note) => isVaultObjectNote(note))
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
			.slice(0, 12),
	);
	let sidebarCollections = $derived.by(() => {
		const saved = searchState.savedSearches.map((entry) => ({
			id: `saved:${entry.id}`,
			name: entry.name,
			query: entry.query,
		}));
		const smart = searchState.smartCollections.map((entry) => ({
			id: `smart:${entry.id}`,
			name: entry.name,
			query: entry.query,
		}));
		return [...saved, ...smart].slice(0, 10);
	});
	let orphanBadgeCount = $derived(linksState.getOrphanNoteIds().length);
	let hubBadgeCount = $derived(linksState.getHubNoteIds().length);
	let openThreads = $derived.by(() =>
		buildOpenThreadsReport(modeScopedNotes, worldCalendarState.calendar),
	);
	let openThreadItems = $derived.by(() => {
		const combined: Array<{
			id: string;
			noteId: string;
			label: string;
			type: 'Quest' | 'NPC' | 'Timeline';
		}> = [];
		for (const entry of openThreads.quests.slice(0, 4)) {
			combined.push({
				id: `quest:${entry.objectId}`,
				noteId: entry.noteId,
				label: entry.title,
				type: 'Quest',
			});
		}
		for (const entry of openThreads.npcs.slice(0, 4)) {
			combined.push({
				id: `npc:${entry.objectId}`,
				noteId: entry.noteId,
				label: entry.title,
				type: 'NPC',
			});
		}
		for (const entry of openThreads.timelineEvents.slice(0, 4)) {
			combined.push({
				id: `timeline:${entry.objectId}`,
				noteId: entry.noteId,
				label: entry.title,
				type: 'Timeline',
			});
		}
		return combined.slice(0, 8);
	});

	$effect(() => {
		if (!searchState.loaded && !searchState.loading) {
			void searchState.loadSavedSearches();
		}
	});

	$effect(() => {
		if (!mapsState.loaded && !mapsState.loading) {
			void mapsState.loadAll();
		}
	});

	$effect(() => {
		return () => {
			if (reselectedNoteTimer) clearTimeout(reselectedNoteTimer);
		};
	});

	function triggerReselectedNoteFeedback(id: string): void {
		reselectedNoteId = id;
		if (reselectedNoteTimer) clearTimeout(reselectedNoteTimer);
		reselectedNoteTimer = setTimeout(() => {
			reselectedNoteId = null;
			reselectedNoteTimer = null;
		}, 700);
		if (typeof document !== 'undefined') {
			const main = document.getElementById('main-content');
			if (main instanceof HTMLElement) {
				main.scrollTo({ top: 0, behavior: 'smooth' });
			}
		}
	}

	$effect(() => {
		if (!folderContextMenu || typeof window === 'undefined') return;
		const close = (event?: Event): void => {
			if (event?.target instanceof Node && folderContextMenuEl?.contains(event.target)) {
				return;
			}
			folderContextMenu = null;
		};
		const closeOnEscape = (event: KeyboardEvent): void => {
			if (event.key === 'Escape') close();
		};
		window.addEventListener('mousedown', close);
		window.addEventListener('keydown', closeOnEscape);
		window.addEventListener('resize', close);
		window.addEventListener('scroll', close, true);
		return () => {
			window.removeEventListener('mousedown', close);
			window.removeEventListener('keydown', closeOnEscape);
			window.removeEventListener('resize', close);
			window.removeEventListener('scroll', close, true);
		};
	});

	function navigateToNote(id: string): void {
		const targetPath = resolve(`/notes/${id}`);
		if (currentPath === targetPath || currentPath === `${targetPath}/edit`) {
			triggerReselectedNoteFeedback(id);
			if (ui.isMobile) {
				ui.sidebarOpen = false;
			}
			return;
		}
		goto(targetPath);
		if (ui.isMobile) {
			ui.sidebarOpen = false;
		}
	}

	function navigateToPath(path: string): void {
		goto(path);
		if (ui.isMobile) {
			ui.sidebarOpen = false;
		}
	}

	function reopenOnboarding(): void {
		void onboardingState.reopenChecklist();
		navigateToPath(resolve('/'));
	}

	function openDiceTray(): void {
		ondice();
		if (ui.isMobile) {
			ui.sidebarOpen = false;
		}
	}

	function openFolderContextMenu(folderId: string, x: number, y: number): void {
		if (playerModeState.enabled) return;
		folderContextMenu = { folderId, x, y };
	}

	function handleFolderContextMenu(event: MouseEvent, folderId: string): void {
		event.preventDefault();
		event.stopPropagation();
		openFolderContextMenu(folderId, event.clientX, event.clientY);
	}

	function handleFolderContextKeydown(event: KeyboardEvent, folderId: string): void {
		if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
			event.preventDefault();
			const target = event.currentTarget as HTMLElement | null;
			if (!target) return;
			const rect = target.getBoundingClientRect();
			openFolderContextMenu(folderId, rect.left + rect.width / 2, rect.bottom + 4);
		}
	}

	function createFromTemplateInFolder(folderId: string): void {
		if (playerModeState.enabled) return;
		folderContextMenu = null;
		ontemplate(folderId);
	}
</script>

<aside
	class="h-full flex flex-col bg-surface-alt dark:bg-tavern-surface border-r border-border dark:border-tavern-border overflow-hidden
		{ui.isMobile && presentation === 'sidebar'
		? 'fixed inset-y-0 left-0 z-40 w-[280px] shadow-xl animate-slide-in'
		: ''}"
	style="width: {ui.isMobile && presentation === 'sidebar'
		? '280px'
		: presentation === 'sheet'
			? '100%'
			: ui.sidebarWidth + 'px'}"
>
	<div class="p-3 border-b border-border dark:border-tavern-border space-y-2 flex-shrink-0">
		{#if playerModeState.enabled}
			<p
				class="rounded-md border border-emerald-300/50 bg-emerald-50/70 px-3 py-2 text-xs font-medium text-emerald-800 dark:border-emerald-700/50 dark:bg-emerald-900/25 dark:text-emerald-200"
			>
				Player mode is active. DM-only notes are hidden.
			</p>
		{:else}
			<button
				type="button"
				class="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-accent text-white hover:bg-accent-hover dark:bg-tavern-accent dark:text-tavern-bg dark:hover:bg-tavern-accent-hover text-sm font-medium transition-[transform,colors] active:scale-[0.97] active:brightness-95"
				onclick={onnewnote}
				title="Create a new note"
			>
				<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
				</svg>
				New Note
			</button>
			<button
				type="button"
				class="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-md border border-border dark:border-tavern-border text-ink-muted dark:text-tavern-muted hover:bg-parchment dark:hover:bg-tavern-bg text-sm transition-[transform,colors] active:scale-[0.97] active:brightness-95"
				onclick={() => ontemplate()}
				title="Create from template"
			>
				<span class="text-sm" aria-hidden="true">T</span>
				From Template
			</button>
			<button
				type="button"
				class="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-md border border-border dark:border-tavern-border text-ink-muted dark:text-tavern-muted hover:bg-parchment dark:hover:bg-tavern-bg text-sm transition-[transform,colors] active:scale-[0.97] active:brightness-95"
				onclick={openDiceTray}
				title="Roll dice"
			>
				Dice Tray
			</button>
		{/if}
	</div>

	<nav class="p-3 space-y-0.5 border-b border-border dark:border-tavern-border flex-shrink-0">
		<a
			href={resolve('/')}
			class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-ink-muted dark:text-tavern-muted hover:bg-parchment dark:hover:bg-tavern-bg hover:text-ink dark:hover:text-tavern-text transition-[transform,colors] active:scale-[0.97] active:brightness-95"
		>
			Home
		</a>
		<a
			href={resolve('/player')}
			class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm {playerModeState.enabled
				? 'bg-emerald-100/70 text-emerald-800 dark:bg-emerald-900/25 dark:text-emerald-200'
				: 'text-ink-muted dark:text-tavern-muted hover:bg-parchment dark:hover:bg-tavern-bg hover:text-ink dark:hover:text-tavern-text'} transition-[transform,colors] active:scale-[0.97] active:brightness-95"
		>
			Player View
		</a>
		<a
			href={resolve('/notes')}
			class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-ink-muted dark:text-tavern-muted hover:bg-parchment dark:hover:bg-tavern-bg hover:text-ink dark:hover:text-tavern-text transition-[transform,colors] active:scale-[0.97] active:brightness-95"
		>
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"
				/>
				<path stroke-linecap="round" stroke-linejoin="round" d="M14 3v5h5" />
			</svg>
			All Notes
			<span class="ml-auto text-xs text-ink-faint dark:text-tavern-faint"
				>{modeScopedNoteCount}</span
			>
		</a>
		<a
			href={resolve('/search')}
			class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-ink-muted dark:text-tavern-muted hover:bg-parchment dark:hover:bg-tavern-bg hover:text-ink dark:hover:text-tavern-text transition-[transform,colors] active:scale-[0.97] active:brightness-95"
		>
			Search
		</a>
		{#if !playerModeState.enabled}
			<a
				href={resolve('/graph')}
				class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-ink-muted dark:text-tavern-muted hover:bg-parchment dark:hover:bg-tavern-bg hover:text-ink dark:hover:text-tavern-text transition-[transform,colors] active:scale-[0.97] active:brightness-95"
			>
				Graph
				{#if orphanBadgeCount > 0 || hubBadgeCount > 0}
					<span class="ml-auto flex items-center gap-1">
						{#if orphanBadgeCount > 0}
							<span
								class="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-900/50 dark:text-rose-200"
								title={`${orphanBadgeCount} orphan note${orphanBadgeCount === 1 ? '' : 's'}`}
							>
								O {orphanBadgeCount}
							</span>
						{/if}
						{#if hubBadgeCount > 0}
							<span
								class="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/50 dark:text-amber-200"
								title={`${hubBadgeCount} hub note${hubBadgeCount === 1 ? '' : 's'}`}
							>
								H {hubBadgeCount}
							</span>
						{/if}
					</span>
				{/if}
			</a>
			<a
				href={resolve('/maps')}
				class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-ink-muted dark:text-tavern-muted hover:bg-parchment dark:hover:bg-tavern-bg hover:text-ink dark:hover:text-tavern-text transition-[transform,colors] active:scale-[0.97] active:brightness-95"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6z"
					/>
				</svg>
				Maps
			</a>
			<a
				href={resolve('/timeline')}
				class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-ink-muted dark:text-tavern-muted hover:bg-parchment dark:hover:bg-tavern-bg hover:text-ink dark:hover:text-tavern-text transition-[transform,colors] active:scale-[0.97] active:brightness-95"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M4 12h16" />
					<circle cx="7" cy="12" r="1.5" fill="currentColor" stroke="none" />
					<circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
					<circle cx="17" cy="12" r="1.5" fill="currentColor" stroke="none" />
				</svg>
				Timeline
			</a>
			<a
				href={resolve('/session-board')}
				class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-ink-muted dark:text-tavern-muted hover:bg-parchment dark:hover:bg-tavern-bg hover:text-ink dark:hover:text-tavern-text transition-[transform,colors] active:scale-[0.97] active:brightness-95"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<rect x="4" y="4" width="7" height="7" rx="1" />
					<rect x="13" y="4" width="7" height="7" rx="1" />
					<rect x="4" y="13" width="7" height="7" rx="1" />
					<rect x="13" y="13" width="7" height="7" rx="1" />
				</svg>
				Session Board
			</a>
			<a
				href={resolve('/encounter/new')}
				class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-ink-muted dark:text-tavern-muted hover:bg-parchment dark:hover:bg-tavern-bg hover:text-ink dark:hover:text-tavern-text transition-[transform,colors] active:scale-[0.97] active:brightness-95"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M8 4l8 8M16 4l-8 8M5 13l6 6M19 13l-6 6"
					/>
				</svg>
				Encounter Builder
			</a>
			<a
				href={resolve('/combat')}
				class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-ink-muted dark:text-tavern-muted hover:bg-parchment dark:hover:bg-tavern-bg hover:text-ink dark:hover:text-tavern-text transition-[transform,colors] active:scale-[0.97] active:brightness-95"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M13 2L3 14h7l-1 8 10-12h-7z" />
				</svg>
				Combat
			</a>
			<button
				type="button"
				class="w-full text-left flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-ink-muted dark:text-tavern-muted hover:bg-parchment dark:hover:bg-tavern-bg hover:text-ink dark:hover:text-tavern-text transition-[transform,colors] active:scale-[0.97] active:brightness-95"
				onclick={openDiceTray}
			>
				<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M5 5h14v14H5z" />
					<circle cx="9" cy="9" r="1" fill="currentColor" stroke="none" />
					<circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
					<circle cx="15" cy="15" r="1" fill="currentColor" stroke="none" />
				</svg>
				Dice Tray
			</button>
		{/if}
	</nav>

	<div class="sidebar-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
		<div class="px-3 pt-2 pb-2">
			<div
				class="grid grid-cols-2 gap-1 rounded-md border border-border dark:border-tavern-border p-1 bg-surface dark:bg-tavern-surface"
			>
				<button
					type="button"
					class="px-2 py-1 text-[11px] rounded {mode === 'tree'
						? 'bg-accent-subtle dark:bg-tavern-accent-subtle text-accent dark:text-tavern-accent font-medium'
						: 'text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt font-normal'}"
					onclick={() => (mode = 'tree')}
				>
					Tree
				</button>
				<button
					type="button"
					class="px-2 py-1 text-[11px] rounded {mode === 'recent'
						? 'bg-accent-subtle dark:bg-tavern-accent-subtle text-accent dark:text-tavern-accent font-medium'
						: 'text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt font-normal'}"
					onclick={() => (mode = 'recent')}
				>
					Recent
				</button>
				<button
					type="button"
					class="px-2 py-1 text-[11px] rounded {mode === 'favorites'
						? 'bg-accent-subtle dark:bg-tavern-accent-subtle text-accent dark:text-tavern-accent font-medium'
						: 'text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt font-normal'}"
					onclick={() => (mode = 'favorites')}
				>
					Favorites
				</button>
				<button
					type="button"
					class="px-2 py-1 text-[11px] rounded {mode === 'campaign'
						? 'bg-accent-subtle dark:bg-tavern-accent-subtle text-accent dark:text-tavern-accent font-medium'
						: 'text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt font-normal'}"
					onclick={() => (mode = 'campaign')}
				>
					Campaign
				</button>
			</div>
		</div>

		{#if !playerModeState.enabled}
			<div class="px-3 pb-2">
				<p
					class="text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint cursor-default mb-1.5 px-2.5"
				>
					Open Threads
				</p>
				<div
					class="rounded-md border border-border dark:border-tavern-border p-2 bg-surface dark:bg-tavern-surface space-y-1.5"
				>
					<div
						class="flex items-center justify-between text-[11px] text-ink-faint dark:text-tavern-faint"
					>
						<span>Quests {openThreads.totals.quests}</span>
						<span>NPCs {openThreads.totals.npcs}</span>
						<span>Timeline {openThreads.totals.timelineEvents}</span>
					</div>
					{#if openThreadItems.length === 0}
						<p class="text-xs text-ink-muted dark:text-tavern-muted px-1 py-0.5">
							No open threads detected.
						</p>
					{:else}
						<ul class="space-y-0.5">
							{#each openThreadItems as thread (thread.id)}
								<li>
									<button
										type="button"
										class="w-full text-left rounded px-2 py-1 text-xs text-ink dark:text-tavern-text hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-[transform,colors] active:scale-[0.97] active:brightness-95 {reselectedNoteId ===
										thread.noteId
											? 'bg-accent-subtle dark:bg-tavern-accent-subtle text-accent dark:text-tavern-accent'
											: ''}"
										onclick={() => navigateToNote(thread.noteId)}
										title={thread.label}
									>
										<span class="opacity-70">{thread.type}:</span>
										<span class="truncate">{thread.label}</span>
									</button>
								</li>
							{/each}
						</ul>
						<a
							href={resolve('/timeline')}
							class="inline-block px-2 text-xs text-accent hover:underline dark:text-tavern-accent"
						>
							Open timeline view
						</a>
					{/if}
				</div>
			</div>

			<div class="px-3 pb-2">
				<WorldCalendarReference notes={modeScopedNotes} title="Calendar" collapsible compact />
			</div>
		{/if}

		{#if !playerModeState.enabled}
			<div class="px-3 pb-2">
				<SessionContextPanel />
			</div>
		{/if}

		<div class="px-3 pb-2">
			<p
				class="text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint cursor-default mb-1.5 px-2.5"
			>
				Collections
			</p>
			<div class="space-y-0.5">
				{#if sidebarCollections.length === 0}
					<p class="px-2.5 py-1.5 text-xs text-ink-faint dark:text-tavern-faint">
						Save searches to pin collections
					</p>
				{:else}
					{#each sidebarCollections as collection (collection.id)}
						<button
							type="button"
							class="w-full text-left px-2.5 py-1.5 rounded-md text-xs text-ink-muted dark:text-tavern-muted hover:bg-parchment dark:hover:bg-tavern-bg hover:text-ink dark:hover:text-tavern-text transition-[transform,colors] active:scale-[0.97] active:brightness-95 truncate"
							title={collection.name}
							onclick={() =>
								navigateToPath(`${resolve('/search')}?q=${encodeURIComponent(collection.query)}`)}
						>
							{collection.name}
						</button>
					{/each}
				{/if}
			</div>
		</div>

		{#if mode === 'tree'}
			<div class="px-3 pb-2">
				<div class="mb-1.5 flex items-center justify-between px-2.5">
					<p
						class="text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint cursor-default"
					>
						{treeViewMode === 'folder' ? 'Folder Tree' : 'Map Hierarchy'}
					</p>
					{#if !playerModeState.enabled}
						<button
							type="button"
							class="rounded border border-border px-1.5 py-0.5 text-[10px] hover:bg-surface-alt dark:border-tavern-border dark:hover:bg-tavern-surface-alt transition-[transform,colors] active:scale-[0.97] active:brightness-95 {treeViewMode ===
							'folder'
								? 'text-accent dark:text-tavern-accent font-medium'
								: 'text-ink-faint dark:text-tavern-faint font-normal'}"
							onclick={() => (treeViewMode = treeViewMode === 'folder' ? 'map' : 'folder')}
						>
							{treeViewMode === 'folder' ? 'Map view' : 'Folder view'}
						</button>
					{/if}
				</div>
				<div class="space-y-0.5">
					{#if treeViewMode === 'folder'}
						{#if folderTreeEntries.length === 0}
							<p class="px-2.5 py-1.5 text-xs text-ink-faint dark:text-tavern-faint">
								No folders yet
							</p>
						{:else}
							{#each folderTreeEntries as folder (folder.id)}
								<button
									type="button"
									class="w-full text-left px-2.5 py-1.5 rounded-md text-xs text-ink-muted dark:text-tavern-muted hover:bg-parchment dark:hover:bg-tavern-bg hover:text-ink dark:hover:text-tavern-text transition-[transform,colors] active:scale-[0.97] active:brightness-95 flex items-center gap-2"
									style="padding-left: {0.75 + folder.depth * 0.75}rem"
									onclick={() =>
										navigateToPath(`${resolve('/notes')}?folder=${encodeURIComponent(folder.id)}`)}
									oncontextmenu={(event) => handleFolderContextMenu(event, folder.id)}
									onkeydown={(event) => handleFolderContextKeydown(event, folder.id)}
									title={folder.id}
								>
									<span class="truncate">{folder.name}</span>
									<span class="ml-auto text-[11px] text-ink-faint dark:text-tavern-faint"
										>({folder.noteCount})</span
									>
								</button>
							{/each}
						{/if}
					{:else if mapTreeEntries.length === 0}
						<p class="px-2.5 py-1.5 text-xs text-ink-faint dark:text-tavern-faint">
							No map hierarchy yet
						</p>
					{:else}
						{#each mapTreeEntries as mapEntry (mapEntry.id)}
							<button
								type="button"
								class="w-full text-left px-2.5 py-1.5 rounded-md text-xs text-ink-muted dark:text-tavern-muted hover:bg-parchment dark:hover:bg-tavern-bg hover:text-ink dark:hover:text-tavern-text transition-[transform,colors] active:scale-[0.97] active:brightness-95 flex items-center gap-2"
								style="padding-left: {0.75 + mapEntry.depth * 0.75}rem"
								onclick={() =>
									navigateToPath(`${resolve('/notes')}?mapId=${encodeURIComponent(mapEntry.id)}`)}
								title={mapEntry.name}
							>
								<span class="truncate">{mapEntry.name}</span>
								<span class="ml-auto text-[11px] text-ink-faint dark:text-tavern-faint"
									>({mapEntry.noteCount})</span
								>
							</button>
						{/each}
					{/if}
				</div>
			</div>

			{#if modeScopedTagCounts.length > 0}
				<div class="px-3 pb-3">
					<button
						type="button"
						class="flex items-center gap-1.5 w-full text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint mb-1.5 px-2.5 hover:text-ink-muted dark:hover:text-tavern-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95"
						onclick={() => (showTags = !showTags)}
						aria-expanded={showTags}
						aria-controls="sidebar-section-tags"
					>
						<span class="text-[10px]">{showTags ? '\u25BC' : '\u25B6'}</span>
						Tags
					</button>
					{#if showTags}
						<div class="flex flex-wrap gap-1 px-2.5" id="sidebar-section-tags">
							{#each modeScopedTagCounts.slice(0, 18) as tag (tag.name)}
								<button
									type="button"
									class="px-2 py-0.5 text-xs rounded-full bg-accent-subtle dark:bg-tavern-accent-subtle text-accent dark:text-tavern-accent hover:bg-accent/20 dark:hover:bg-tavern-accent/20 transition-[transform,colors] active:scale-[0.97] active:brightness-95"
									onclick={() =>
										navigateToPath(`${resolve('/notes')}?tag=${encodeURIComponent(tag.name)}`)}
								>
									{tag.name}
									<span class="opacity-60 ml-0.5">{tag.count}</span>
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		{:else if mode === 'recent'}
			<div class="px-3 pb-2">
				<p
					class="text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint cursor-default mb-1.5 px-2.5"
				>
					Recently Visited
				</p>
				<div class="space-y-0.5">
					{#if recentlyVisited.length === 0}
						<p class="px-2.5 py-1.5 text-xs text-ink-faint dark:text-tavern-faint">
							No visit history yet
						</p>
					{:else}
						{#each recentlyVisited as note (note.id)}
							<button
								type="button"
								class="w-full text-left px-2.5 py-1.5 rounded-md text-sm truncate text-ink dark:text-tavern-text hover:bg-parchment dark:hover:bg-tavern-bg transition-[transform,colors] active:scale-[0.97] active:brightness-95 {reselectedNoteId ===
								note.id
									? 'bg-accent-subtle dark:bg-tavern-accent-subtle text-accent dark:text-tavern-accent'
									: ''}"
								onclick={() => navigateToNote(note.id)}
								title={note.title}
							>
								{note.title}
							</button>
						{/each}
					{/if}
				</div>
			</div>
			<div class="px-3 pb-3">
				<p
					class="text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint cursor-default mb-1.5 px-2.5"
				>
					Recently Updated
				</p>
				<div class="space-y-0.5">
					{#each recentNotes as note (note.id)}
						<button
							type="button"
							class="w-full text-left px-2.5 py-1.5 rounded-md text-sm truncate text-ink dark:text-tavern-text hover:bg-parchment dark:hover:bg-tavern-bg transition-[transform,colors] active:scale-[0.97] active:brightness-95 {reselectedNoteId ===
							note.id
								? 'bg-accent-subtle dark:bg-tavern-accent-subtle text-accent dark:text-tavern-accent'
								: ''}"
							onclick={() => navigateToNote(note.id)}
							title={note.title}
						>
							{note.title}
						</button>
					{/each}
				</div>
			</div>
		{:else if mode === 'favorites'}
			<div class="px-3 pb-3">
				<p
					class="text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint cursor-default mb-1.5 px-2.5"
				>
					Favorites
				</p>
				<div class="space-y-0.5">
					{#if pinnedNotes.length === 0}
						<p class="px-2.5 py-1.5 text-xs text-ink-faint dark:text-tavern-faint">
							Pin notes to surface favorites
						</p>
					{:else}
						{#each pinnedNotes as note (note.id)}
							<button
								type="button"
								class="w-full text-left px-2.5 py-1.5 rounded-md text-sm truncate text-ink dark:text-tavern-text hover:bg-parchment dark:hover:bg-tavern-bg transition-[transform,colors] active:scale-[0.97] active:brightness-95 flex items-center gap-2 {reselectedNoteId ===
								note.id
									? 'bg-accent-subtle dark:bg-tavern-accent-subtle text-accent dark:text-tavern-accent'
									: ''}"
								onclick={() => navigateToNote(note.id)}
								title={note.title}
							>
								<span class="text-accent dark:text-tavern-accent" aria-hidden="true">*</span>
								<span class="truncate">{note.title}</span>
							</button>
						{/each}
					{/if}
				</div>
			</div>
		{:else}
			<div class="px-3 pb-2">
				<p
					class="text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint cursor-default mb-1.5 px-2.5"
				>
					Pinned Campaign Entities
				</p>
				<div class="space-y-0.5">
					{#if pinnedCampaignEntities.length === 0}
						<p class="px-2.5 py-1.5 text-xs text-ink-faint dark:text-tavern-faint">
							Pin object notes to keep campaign-critical entities in reach
						</p>
					{:else}
						{#each pinnedCampaignEntities as note (note.id)}
							<button
								type="button"
								class="w-full text-left px-2.5 py-1.5 rounded-md text-sm truncate text-ink dark:text-tavern-text hover:bg-parchment dark:hover:bg-tavern-bg transition-[transform,colors] active:scale-[0.97] active:brightness-95 {reselectedNoteId ===
								note.id
									? 'bg-accent-subtle dark:bg-tavern-accent-subtle text-accent dark:text-tavern-accent'
									: ''}"
								onclick={() => navigateToNote(note.id)}
								title={note.title}
							>
								{note.title}
							</button>
						{/each}
					{/if}
				</div>
			</div>

			<div class="px-3 pb-3">
				<p
					class="text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint cursor-default mb-1.5 px-2.5"
				>
					Recent Entities
				</p>
				<div class="space-y-0.5">
					{#if campaignEntities.length === 0}
						<p class="px-2.5 py-1.5 text-xs text-ink-faint dark:text-tavern-faint">
							No object notes yet
						</p>
					{:else}
						{#each campaignEntities as note (note.id)}
							<button
								type="button"
								class="w-full text-left px-2.5 py-1.5 rounded-md text-sm truncate text-ink dark:text-tavern-text hover:bg-parchment dark:hover:bg-tavern-bg transition-[transform,colors] active:scale-[0.97] active:brightness-95 {reselectedNoteId ===
								note.id
									? 'bg-accent-subtle dark:bg-tavern-accent-subtle text-accent dark:text-tavern-accent'
									: ''}"
								onclick={() => navigateToNote(note.id)}
								title={note.title}
							>
								{note.title}
							</button>
						{/each}
					{/if}
				</div>
			</div>
		{/if}
	</div>

	<div class="px-3 py-2 border-t border-border dark:border-tavern-border">
		<button
			type="button"
			class="w-full text-left flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs text-ink-faint dark:text-tavern-faint hover:text-ink-muted dark:hover:text-tavern-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95"
			onclick={reopenOnboarding}
		>
			Onboarding
		</button>
		<a
			href={resolve('/settings')}
			class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs text-ink-faint dark:text-tavern-faint hover:text-ink-muted dark:hover:text-tavern-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95"
		>
			Settings
		</a>
	</div>

	{#if folderContextMenu}
		<div
			class="fixed z-50 min-w-44 rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface shadow-lg p-1"
			style="left: {folderContextMenu.x}px; top: {folderContextMenu.y}px;"
			role="menu"
			aria-label="Folder actions"
			bind:this={folderContextMenuEl}
		>
			<button
				type="button"
				class="w-full text-left rounded px-2.5 py-1.5 text-xs text-ink dark:text-tavern-text hover:bg-surface-alt dark:hover:bg-tavern-surface-alt"
				onclick={() => folderContextMenu && createFromTemplateInFolder(folderContextMenu.folderId)}
				role="menuitem"
			>
				Create from template here
			</button>
		</div>
	{/if}
</aside>
