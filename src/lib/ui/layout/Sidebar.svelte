<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { vaultState } from '$lib/state/vault.svelte.js';
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
	import { worldCalendarState } from '$lib/state/world-calendar.svelte.js';

	interface Props {
		onnewnote: () => void;
		ondice: () => void;
		ontemplate: (folderOverride?: string) => void;
		onsetplayermode: (enabled: boolean) => void;
		presentation?: 'sidebar' | 'sheet';
	}

	type KnowledgeMode = 'browse' | 'recent' | 'saved';

	let {
		onnewnote,
		ondice,
		ontemplate,
		onsetplayermode,
		presentation = 'sidebar',
	}: Props = $props();
	let knowledgeMode = $state<KnowledgeMode>('browse');
	let showTags = $state(false);
	let treeViewMode = $state<'folder' | 'map'>('folder');
	let currentPath = $derived(navigationState.activeRoute.split('?')[0] ?? '/');
	let activeSection = $derived(navigationState.activeSection);

	const modeScopedNotes = $derived.by(() =>
		playerModeState.enabled
			? notesState.activeNotes.filter((note) => isNoteVisibleInPlayerMode(note))
			: notesState.activeNotes,
	);
	const modeScopedPinnedNotes = $derived.by(() =>
		playerModeState.enabled
			? notesState.pinnedNotes.filter((note) => isNoteVisibleInPlayerMode(note))
			: notesState.pinnedNotes,
	);
	const modeScopedTagCounts = $derived.by(() => {
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
	const modeScopedFolderTree = $derived.by(() => {
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
	const folderTreeEntries = $derived.by(() =>
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
	const mapTreeEntries = $derived.by(() => {
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
	const recentNotes = $derived(
		modeScopedNotes
			.filter((note) => !note.pinned)
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
			.slice(0, 12),
	);
	const recentlyVisited = $derived.by(() =>
		navigationState.recentNoteIds
			.map((id) => notesState.getActiveNoteById(id))
			.filter(
				(note): note is NonNullable<typeof note> =>
					!!note && (!playerModeState.enabled || isNoteVisibleInPlayerMode(note)),
			)
			.slice(0, 12),
	);
	const pinnedNotes = $derived(modeScopedPinnedNotes.slice(0, 20));
	const pinnedCampaignEntities = $derived.by(() =>
		modeScopedPinnedNotes.filter((note) => isVaultObjectNote(note)).slice(0, 12),
	);
	const campaignEntities = $derived.by(() =>
		modeScopedNotes
			.filter((note) => isVaultObjectNote(note))
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
			.slice(0, 12),
	);
	const sidebarCollections = $derived.by(() => {
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
	const openThreads = $derived.by(() =>
		buildOpenThreadsReport(modeScopedNotes, worldCalendarState.calendar),
	);

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

	function noteIsActive(noteId: string): boolean {
		const base = resolve(`/knowledge/notes/${noteId}`);
		return currentPath === base || currentPath === `${base}/edit`;
	}

	function noteButtonClass(noteId: string): string {
		return noteIsActive(noteId)
			? 'border-l-2 border-accent bg-accent-subtle/70 pl-2 text-accent dark:border-tavern-accent dark:bg-tavern-accent-subtle dark:text-tavern-accent'
			: 'border-l-2 border-transparent';
	}

	function sectionLinkClass(pathPrefix: string): string {
		return currentPath.startsWith(pathPrefix)
			? 'border-l-2 border-accent bg-accent-subtle/70 text-accent dark:border-tavern-accent dark:bg-tavern-accent-subtle dark:text-tavern-accent'
			: 'border-l-2 border-transparent text-ink-muted hover:bg-parchment hover:text-ink dark:text-tavern-muted dark:hover:bg-tavern-bg dark:hover:text-tavern-text';
	}

	function navigateToNote(id: string): void {
		goto(resolve(`/knowledge/notes/${id}`));
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

	function openDiceTray(): void {
		ondice();
		if (ui.isMobile) {
			ui.sidebarOpen = false;
		}
	}

	function reopenOnboarding(): void {
		void onboardingState.reopenChecklist();
		navigateToPath(resolve('/knowledge'));
	}
</script>

<aside
	class="h-full flex flex-col overflow-hidden border-r border-border bg-surface-alt dark:border-tavern-border dark:bg-tavern-surface
		{ui.isMobile && presentation === 'sidebar'
		? 'fixed inset-y-0 left-0 z-40 w-[280px] shadow-xl animate-slide-in'
		: ''}"
	style="width: {ui.isMobile && presentation === 'sidebar'
		? '280px'
		: presentation === 'sheet'
			? '100%'
			: ui.sidebarWidth + 'px'}"
>
	<div class="space-y-2 border-b border-border p-3 dark:border-tavern-border">
		{#if playerModeState.enabled}
			<p
				class="rounded-md border border-emerald-300/60 bg-emerald-50/80 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-900/25 dark:text-emerald-200"
			>
				Player Mode Active
			</p>
		{:else if activeSection === 'knowledge'}
			<button
				type="button"
				class="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-white transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-accent-hover dark:bg-tavern-accent dark:text-tavern-bg dark:hover:bg-tavern-accent-hover"
				onclick={onnewnote}
				title="Create a new note"
			>
				New Note
			</button>
			<button
				type="button"
				class="w-full rounded-md border border-border px-3 py-1.5 text-sm text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-parchment dark:border-tavern-border dark:text-tavern-muted dark:hover:bg-tavern-bg"
				onclick={() => ontemplate()}
				title="Create from template"
			>
				From Template
			</button>
		{/if}
	</div>

	{#if activeSection === 'knowledge'}
		<nav
			class="space-y-1 border-b border-border p-3 dark:border-tavern-border"
			aria-label="Local navigation: Knowledge panel"
		>
			<a
				href={resolve('/knowledge/notes')}
				class="flex items-center rounded-md px-2.5 py-1.5 text-sm transition-[transform,colors] active:scale-[0.97] active:brightness-95 {sectionLinkClass(
					'/knowledge/notes',
				)}"
			>
				All Notes
			</a>
			<a
				href={resolve('/knowledge/search')}
				class="flex items-center rounded-md px-2.5 py-1.5 text-sm transition-[transform,colors] active:scale-[0.97] active:brightness-95 {sectionLinkClass(
					'/knowledge/search',
				)}"
			>
				Search
			</a>
			{#if !playerModeState.enabled}
				<a
					href={resolve('/knowledge/graph')}
					class="flex items-center rounded-md px-2.5 py-1.5 text-sm transition-[transform,colors] active:scale-[0.97] active:brightness-95 {sectionLinkClass(
						'/knowledge/graph',
					)}"
				>
					Graph
				</a>
			{/if}
		</nav>
	{:else if activeSection === 'session'}
		<nav
			class="space-y-1 border-b border-border p-3 dark:border-tavern-border"
			aria-label="Local navigation: Session panel"
		>
			<a
				href={resolve('/session/combat')}
				class="flex items-center rounded-md px-2.5 py-1.5 text-sm transition-[transform,colors] active:scale-[0.97] active:brightness-95 {sectionLinkClass(
					'/session/combat',
				)}"
			>
				Combat
			</a>
			<a
				href={resolve('/session/encounter/new')}
				class="flex items-center rounded-md px-2.5 py-1.5 text-sm transition-[transform,colors] active:scale-[0.97] active:brightness-95 {sectionLinkClass(
					'/session/encounter',
				)}"
			>
				Encounter Builder
			</a>
			<button
				type="button"
				class="w-full rounded-md border border-border px-2.5 py-1.5 text-left text-sm text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-parchment dark:border-tavern-border dark:text-tavern-muted dark:hover:bg-tavern-bg"
				onclick={openDiceTray}
			>
				Dice Tray
			</button>
		</nav>
	{:else if activeSection === 'atlas'}
		<nav
			class="space-y-1 border-b border-border p-3 dark:border-tavern-border"
			aria-label="Local navigation: Atlas panel"
		>
			<p class="px-2.5 py-1 text-xs uppercase tracking-wider text-ink-faint dark:text-tavern-faint">
				Map Hierarchy
			</p>
		</nav>
	{:else if activeSection === 'campaign'}
		<nav
			class="space-y-1 border-b border-border p-3 dark:border-tavern-border"
			aria-label="Local navigation: Campaign panel"
		>
			<p class="px-2.5 py-1 text-xs uppercase tracking-wider text-ink-faint dark:text-tavern-faint">
				Campaign Entities
			</p>
		</nav>
	{:else}
		<nav
			class="space-y-1 border-b border-border p-3 dark:border-tavern-border"
			aria-label="Local navigation: Settings panel"
		>
			<p class="px-2.5 py-1 text-xs uppercase tracking-wider text-ink-faint dark:text-tavern-faint">
				Settings Context
			</p>
		</nav>
	{/if}

	<div class="sidebar-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
		{#if activeSection === 'knowledge'}
			<div class="px-3 pt-2 pb-2">
				<div
					class="grid grid-cols-3 gap-1 rounded-md border border-border bg-surface p-1 dark:border-tavern-border dark:bg-tavern-surface"
					role="tablist"
					aria-label="Knowledge local mode"
				>
					<button
						type="button"
						class="rounded px-2 py-1 text-[11px] {knowledgeMode === 'browse'
							? 'bg-accent-subtle font-medium text-accent dark:bg-tavern-accent-subtle dark:text-tavern-accent'
							: 'font-normal text-ink-muted hover:bg-surface-alt dark:text-tavern-muted dark:hover:bg-tavern-surface-alt'}"
						role="tab"
						aria-selected={knowledgeMode === 'browse'}
						onclick={() => (knowledgeMode = 'browse')}
					>
						Browse
					</button>
					<button
						type="button"
						class="rounded px-2 py-1 text-[11px] {knowledgeMode === 'recent'
							? 'bg-accent-subtle font-medium text-accent dark:bg-tavern-accent-subtle dark:text-tavern-accent'
							: 'font-normal text-ink-muted hover:bg-surface-alt dark:text-tavern-muted dark:hover:bg-tavern-surface-alt'}"
						role="tab"
						aria-selected={knowledgeMode === 'recent'}
						onclick={() => (knowledgeMode = 'recent')}
					>
						Recent
					</button>
					<button
						type="button"
						class="rounded px-2 py-1 text-[11px] {knowledgeMode === 'saved'
							? 'bg-accent-subtle font-medium text-accent dark:bg-tavern-accent-subtle dark:text-tavern-accent'
							: 'font-normal text-ink-muted hover:bg-surface-alt dark:text-tavern-muted dark:hover:bg-tavern-surface-alt'}"
						role="tab"
						aria-selected={knowledgeMode === 'saved'}
						onclick={() => (knowledgeMode = 'saved')}
					>
						Saved
					</button>
				</div>
			</div>

			{#if knowledgeMode === 'browse'}
				<div class="px-3 pb-2">
					<div class="mb-1.5 flex items-center justify-between px-2.5">
						<p
							class="text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint"
						>
							{treeViewMode === 'folder' ? 'Folder Tree' : 'Map Hierarchy'}
						</p>
						<button
							type="button"
							class="rounded border border-border px-1.5 py-0.5 text-[10px] transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-surface-alt dark:border-tavern-border dark:hover:bg-tavern-surface-alt {treeViewMode ===
							'folder'
								? 'font-medium text-accent dark:text-tavern-accent'
								: 'font-normal text-ink-faint dark:text-tavern-faint'}"
							onclick={() => (treeViewMode = treeViewMode === 'folder' ? 'map' : 'folder')}
						>
							{treeViewMode === 'folder' ? 'Map view' : 'Folder view'}
						</button>
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
										class="flex w-full items-center gap-2 rounded-md border-l-2 border-transparent px-2.5 py-1.5 text-left text-xs text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-parchment hover:text-ink dark:text-tavern-muted dark:hover:bg-tavern-bg dark:hover:text-tavern-text"
										style="padding-left: {0.75 + folder.depth * 0.75}rem"
										onclick={() =>
											navigateToPath(
												`${resolve('/knowledge/notes')}?folder=${encodeURIComponent(folder.id)}`,
											)}
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
									class="flex w-full items-center gap-2 rounded-md border-l-2 border-transparent px-2.5 py-1.5 text-left text-xs text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-parchment hover:text-ink dark:text-tavern-muted dark:hover:bg-tavern-bg dark:hover:text-tavern-text"
									style="padding-left: {0.75 + mapEntry.depth * 0.75}rem"
									onclick={() =>
										navigateToPath(
											`${resolve('/knowledge/notes')}?mapId=${encodeURIComponent(mapEntry.id)}`,
										)}
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
							class="mb-1.5 flex w-full items-center gap-1.5 px-2.5 text-xs font-semibold uppercase tracking-wider text-ink-faint transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:text-ink-muted dark:text-tavern-faint dark:hover:text-tavern-muted"
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
										class="rounded-full bg-accent-subtle px-2 py-0.5 text-xs text-accent transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-accent/20 dark:bg-tavern-accent-subtle dark:text-tavern-accent dark:hover:bg-tavern-accent/20"
										onclick={() =>
											navigateToPath(
												`${resolve('/knowledge/notes')}?tag=${encodeURIComponent(tag.name)}`,
											)}
									>
										{tag.name}
										<span class="ml-0.5 opacity-60">{tag.count}</span>
									</button>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			{:else if knowledgeMode === 'recent'}
				<div class="px-3 pb-2">
					<p
						class="mb-1.5 px-2.5 text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint"
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
									class="w-full rounded-md px-2.5 py-1.5 text-left text-sm text-ink transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-parchment dark:text-tavern-text dark:hover:bg-tavern-bg {noteButtonClass(
										note.id,
									)}"
									onclick={() => navigateToNote(note.id)}
									title={note.title}
								>
									<span class="truncate">{note.title}</span>
								</button>
							{/each}
						{/if}
					</div>
				</div>
				<div class="px-3 pb-3">
					<p
						class="mb-1.5 px-2.5 text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint"
					>
						Recently Updated
					</p>
					<div class="space-y-0.5">
						{#if recentNotes.length === 0}
							<p class="px-2.5 py-1.5 text-xs text-ink-faint dark:text-tavern-faint">
								No recently updated notes
							</p>
						{:else}
							{#each recentNotes as note (note.id)}
								<button
									type="button"
									class="w-full rounded-md px-2.5 py-1.5 text-left text-sm text-ink transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-parchment dark:text-tavern-text dark:hover:bg-tavern-bg {noteButtonClass(
										note.id,
									)}"
									onclick={() => navigateToNote(note.id)}
									title={note.title}
								>
									<span class="truncate">{note.title}</span>
								</button>
							{/each}
						{/if}
					</div>
				</div>
			{:else}
				<div class="px-3 pb-2">
					<p
						class="mb-1.5 px-2.5 text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint"
					>
						Pinned Notes
					</p>
					<div class="space-y-0.5">
						{#if pinnedNotes.length === 0}
							<p class="px-2.5 py-1.5 text-xs text-ink-faint dark:text-tavern-faint">
								Pin notes to keep them in quick reach
							</p>
						{:else}
							{#each pinnedNotes as note (note.id)}
								<button
									type="button"
									class="w-full rounded-md px-2.5 py-1.5 text-left text-sm text-ink transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-parchment dark:text-tavern-text dark:hover:bg-tavern-bg {noteButtonClass(
										note.id,
									)}"
									onclick={() => navigateToNote(note.id)}
									title={note.title}
								>
									<span class="truncate">{note.title}</span>
								</button>
							{/each}
						{/if}
					</div>
				</div>
				<div class="px-3 pb-3">
					<p
						class="mb-1.5 px-2.5 text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint"
					>
						Collections
					</p>
					<div class="space-y-0.5">
						{#if sidebarCollections.length === 0}
							<p class="px-2.5 py-1.5 text-xs text-ink-faint dark:text-tavern-faint">
								Save searches to create collections
							</p>
						{:else}
							{#each sidebarCollections as collection (collection.id)}
								<button
									type="button"
									class="w-full rounded-md border-l-2 border-transparent px-2.5 py-1.5 text-left text-xs text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-parchment hover:text-ink dark:text-tavern-muted dark:hover:bg-tavern-bg dark:hover:text-tavern-text"
									title={collection.name}
									onclick={() =>
										navigateToPath(
											`${resolve('/knowledge/search')}?q=${encodeURIComponent(collection.query)}`,
										)}
								>
									{collection.name}
								</button>
							{/each}
						{/if}
					</div>
				</div>
			{/if}
		{:else if activeSection === 'atlas'}
			<div class="px-3 pb-3 pt-2">
				<div class="space-y-0.5">
					{#if mapTreeEntries.length === 0}
						<p class="px-2.5 py-1.5 text-xs text-ink-faint dark:text-tavern-faint">
							No map hierarchy yet
						</p>
					{:else}
						{#each mapTreeEntries as mapEntry (mapEntry.id)}
							<button
								type="button"
								class="flex w-full items-center gap-2 rounded-md border-l-2 border-transparent px-2.5 py-1.5 text-left text-xs text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-parchment hover:text-ink dark:text-tavern-muted dark:hover:bg-tavern-bg dark:hover:text-tavern-text"
								style="padding-left: {0.75 + mapEntry.depth * 0.75}rem"
								onclick={() =>
									navigateToPath(
										`${resolve('/atlas/maps')}?mapId=${encodeURIComponent(mapEntry.id)}`,
									)}
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
		{:else if activeSection === 'session'}
			<div class="px-3 pb-3 pt-2">
				{#if playerModeState.enabled}
					<p
						class="rounded-md border border-emerald-300/60 bg-emerald-50/80 px-3 py-2 text-xs font-medium text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-900/25 dark:text-emerald-200"
					>
						Player Mode Active. DM-only session context is hidden.
					</p>
				{:else}
					<div class="space-y-3">
						<div
							class="rounded-md border border-border bg-surface p-2 dark:border-tavern-border dark:bg-tavern-surface"
						>
							<p class="text-xs uppercase tracking-wider text-ink-faint dark:text-tavern-faint">
								Open Threads
							</p>
							<p class="mt-1 text-xs text-ink-muted dark:text-tavern-muted">
								Quests {openThreads.totals.quests} · NPCs {openThreads.totals.npcs} · Timeline {openThreads
									.totals.timelineEvents}
							</p>
						</div>
						<button
							type="button"
							class="w-full rounded-md border border-border px-2.5 py-1.5 text-left text-sm text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-parchment dark:border-tavern-border dark:text-tavern-muted dark:hover:bg-tavern-bg"
							onclick={openDiceTray}
						>
							Open Dice Tray
						</button>
					</div>
				{/if}
			</div>
		{:else if activeSection === 'campaign'}
			<div class="px-3 pb-2 pt-2">
				<p
					class="mb-1.5 px-2.5 text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint"
				>
					Pinned Entities
				</p>
				<div class="space-y-0.5">
					{#if pinnedCampaignEntities.length === 0}
						<p class="px-2.5 py-1.5 text-xs text-ink-faint dark:text-tavern-faint">
							Pin object notes for campaign quick access
						</p>
					{:else}
						{#each pinnedCampaignEntities as note (note.id)}
							<button
								type="button"
								class="w-full rounded-md px-2.5 py-1.5 text-left text-sm text-ink transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-parchment dark:text-tavern-text dark:hover:bg-tavern-bg {noteButtonClass(
									note.id,
								)}"
								onclick={() => navigateToNote(note.id)}
								title={note.title}
							>
								<span class="truncate">{note.title}</span>
							</button>
						{/each}
					{/if}
				</div>
			</div>
			<div class="px-3 pb-3">
				<p
					class="mb-1.5 px-2.5 text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint"
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
								class="w-full rounded-md px-2.5 py-1.5 text-left text-sm text-ink transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-parchment dark:text-tavern-text dark:hover:bg-tavern-bg {noteButtonClass(
									note.id,
								)}"
								onclick={() => navigateToNote(note.id)}
								title={note.title}
							>
								<span class="truncate">{note.title}</span>
							</button>
						{/each}
					{/if}
				</div>
			</div>
		{:else}
			<div class="px-3 pb-3 pt-2">
				<p
					class="rounded-md border border-border bg-surface p-3 text-xs text-ink-muted dark:border-tavern-border dark:bg-tavern-surface dark:text-tavern-muted"
				>
					Settings does not have section-local navigation.
				</p>
			</div>
		{/if}
	</div>

	<div class="border-t border-border px-3 py-2 dark:border-tavern-border">
		<div
			class="mb-2 rounded-md border border-border p-1 dark:border-tavern-border"
			role="group"
			aria-label="Persona switcher"
		>
			<div class="grid grid-cols-2 gap-1">
				<button
					type="button"
					class="rounded-full px-2.5 py-1 text-xs font-semibold transition-[transform,colors] active:scale-[0.97] active:brightness-95 {playerModeState.enabled
						? 'border border-border text-ink-muted hover:bg-surface-alt dark:border-tavern-border dark:text-tavern-muted dark:hover:bg-tavern-surface-alt'
						: 'bg-accent text-white dark:bg-tavern-accent dark:text-tavern-bg'}"
					aria-pressed={!playerModeState.enabled}
					onclick={() => onsetplayermode(false)}
				>
					DM
				</button>
				<button
					type="button"
					class="rounded-full px-2.5 py-1 text-xs font-semibold transition-[transform,colors] active:scale-[0.97] active:brightness-95 {playerModeState.enabled
						? 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950'
						: 'border border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900/30'}"
					aria-pressed={playerModeState.enabled}
					onclick={() => onsetplayermode(true)}
				>
					Player
				</button>
			</div>
		</div>
		<button
			type="button"
			class="w-full rounded-md px-2.5 py-1.5 text-left text-xs text-ink-faint transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:text-ink-muted dark:text-tavern-faint dark:hover:text-tavern-muted"
			onclick={reopenOnboarding}
		>
			Onboarding
		</button>
	</div>
</aside>
