<script lang="ts">
	import { notesState } from '$lib/state/notes.svelte.js';
	import { vaultState } from '$lib/state/vault.svelte.js';
	import { navigationState } from '$lib/state/navigation.svelte.js';
	import { onboardingState } from '$lib/state/onboarding.svelte.js';
	import { searchState } from '$lib/state/search.svelte.js';
	import { ui } from '$lib/state/ui.svelte.js';
	import { isVaultObjectNote } from '$lib/domain/object-notes.js';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	interface Props {
		onnewnote: () => void;
		ontemplate: () => void;
	}

	type SidebarMode = 'tree' | 'recent' | 'favorites' | 'campaign';

	let { onnewnote, ontemplate }: Props = $props();
	let mode = $state<SidebarMode>('tree');
	let showTags = $state(false);

	let pinnedNotes = $derived(notesState.pinnedNotes.slice(0, 20));
	let recentNotes = $derived(
		notesState.activeNotes
			.filter((note) => !note.pinned)
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
			.slice(0, 12),
	);
	let recentlyVisited = $derived.by(() =>
		navigationState.recentNoteIds
			.map((id) => notesState.getActiveNoteById(id))
			.filter((note) => !!note)
			.slice(0, 10),
	);
	let folderTreeEntries = $derived.by(() =>
		vaultState.folders
			.filter((folder) => folder.id !== '/')
			.sort((a, b) => a.id.localeCompare(b.id))
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
	let pinnedCampaignEntities = $derived.by(() =>
		notesState.pinnedNotes.filter((note) => isVaultObjectNote(note)).slice(0, 12),
	);
	let campaignEntities = $derived.by(() =>
		notesState.activeNotes
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

	$effect(() => {
		if (!searchState.loaded && !searchState.loading) {
			void searchState.loadSavedSearches();
		}
	});

	function navigateToNote(id: string): void {
		goto(resolve(`/notes/${id}`));
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
</script>

<aside
	class="h-full flex flex-col bg-surface-alt dark:bg-tavern-surface border-r border-border dark:border-tavern-border overflow-hidden
		{ui.isMobile ? 'fixed inset-y-0 left-0 z-40 w-[280px] shadow-xl animate-slide-in' : ''}"
	style="width: {ui.isMobile ? '280px' : ui.sidebarWidth + 'px'}"
>
	<div class="p-3 border-b border-border dark:border-tavern-border space-y-2">
		<button
			type="button"
			class="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-accent text-white hover:bg-accent-hover dark:bg-tavern-accent dark:text-tavern-bg dark:hover:bg-tavern-accent-hover text-sm font-medium transition-colors"
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
			class="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-md border border-border dark:border-tavern-border text-ink-muted dark:text-tavern-muted hover:bg-parchment dark:hover:bg-tavern-bg text-sm transition-colors"
			onclick={ontemplate}
			title="Create from template"
		>
			<span class="text-sm" aria-hidden="true">T</span>
			From Template
		</button>
	</div>

	<div class="flex-1 overflow-y-auto">
		<nav class="p-3 space-y-0.5">
			<a
				href={resolve('/')}
				class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-ink-muted dark:text-tavern-muted hover:bg-parchment dark:hover:bg-tavern-bg hover:text-ink dark:hover:text-tavern-text transition-colors"
			>
				Home
			</a>
			<a
				href={resolve('/notes')}
				class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-ink-muted dark:text-tavern-muted hover:bg-parchment dark:hover:bg-tavern-bg hover:text-ink dark:hover:text-tavern-text transition-colors"
			>
				All Notes
				<span class="ml-auto text-xs text-ink-faint dark:text-tavern-faint"
					>{vaultState.noteCount}</span
				>
			</a>
			<a
				href={resolve('/search')}
				class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-ink-muted dark:text-tavern-muted hover:bg-parchment dark:hover:bg-tavern-bg hover:text-ink dark:hover:text-tavern-text transition-colors"
			>
				Search
			</a>
			<a
				href={resolve('/graph')}
				class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-ink-muted dark:text-tavern-muted hover:bg-parchment dark:hover:bg-tavern-bg hover:text-ink dark:hover:text-tavern-text transition-colors"
			>
				Graph
			</a>
			<a
				href={resolve('/session-board')}
				class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-ink-muted dark:text-tavern-muted hover:bg-parchment dark:hover:bg-tavern-bg hover:text-ink dark:hover:text-tavern-text transition-colors"
			>
				Session Board
			</a>
		</nav>

		<div class="px-3 pb-2">
			<p
				class="text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint mb-1.5 px-2.5"
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
							class="w-full text-left px-2.5 py-1.5 rounded-md text-xs text-ink-muted dark:text-tavern-muted hover:bg-parchment dark:hover:bg-tavern-bg hover:text-ink dark:hover:text-tavern-text transition-colors truncate"
							title={collection.query}
							onclick={() =>
								navigateToPath(`${resolve('/search')}?q=${encodeURIComponent(collection.query)}`)}
						>
							{collection.name}
						</button>
					{/each}
				{/if}
			</div>
		</div>

		<div class="px-3 pb-2">
			<div
				class="grid grid-cols-2 gap-1 rounded-md border border-border dark:border-tavern-border p-1 bg-surface dark:bg-tavern-surface"
			>
				<button
					type="button"
					class="px-2 py-1 text-[11px] rounded {mode === 'tree'
						? 'bg-accent-subtle dark:bg-tavern-accent-subtle text-accent dark:text-tavern-accent'
						: 'text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt'}"
					onclick={() => (mode = 'tree')}
				>
					Tree
				</button>
				<button
					type="button"
					class="px-2 py-1 text-[11px] rounded {mode === 'recent'
						? 'bg-accent-subtle dark:bg-tavern-accent-subtle text-accent dark:text-tavern-accent'
						: 'text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt'}"
					onclick={() => (mode = 'recent')}
				>
					Recent
				</button>
				<button
					type="button"
					class="px-2 py-1 text-[11px] rounded {mode === 'favorites'
						? 'bg-accent-subtle dark:bg-tavern-accent-subtle text-accent dark:text-tavern-accent'
						: 'text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt'}"
					onclick={() => (mode = 'favorites')}
				>
					Favorites
				</button>
				<button
					type="button"
					class="px-2 py-1 text-[11px] rounded {mode === 'campaign'
						? 'bg-accent-subtle dark:bg-tavern-accent-subtle text-accent dark:text-tavern-accent'
						: 'text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt'}"
					onclick={() => (mode = 'campaign')}
				>
					Campaign
				</button>
			</div>
		</div>

		{#if mode === 'tree'}
			<div class="px-3 pb-2">
				<p
					class="text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint mb-1.5 px-2.5"
				>
					Folder Tree
				</p>
				<div class="space-y-0.5">
					{#if folderTreeEntries.length === 0}
						<p class="px-2.5 py-1.5 text-xs text-ink-faint dark:text-tavern-faint">
							No folders yet
						</p>
					{:else}
						{#each folderTreeEntries as folder (folder.id)}
							<button
								class="w-full text-left px-2.5 py-1.5 rounded-md text-xs text-ink-muted dark:text-tavern-muted hover:bg-parchment dark:hover:bg-tavern-bg hover:text-ink dark:hover:text-tavern-text transition-colors flex items-center gap-2"
								style="padding-left: {0.75 + folder.depth * 0.65}rem"
								onclick={() =>
									navigateToPath(`${resolve('/notes')}?folder=${encodeURIComponent(folder.id)}`)}
							>
								<span class="truncate">{folder.name}</span>
								<span class="ml-auto opacity-70">{folder.noteCount}</span>
							</button>
						{/each}
					{/if}
				</div>
			</div>

			{#if vaultState.tagCounts.length > 0}
				<div class="px-3 pb-3">
					<button
						type="button"
						class="flex items-center gap-1.5 w-full text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint mb-1.5 px-2.5 hover:text-ink-muted dark:hover:text-tavern-muted transition-colors"
						onclick={() => (showTags = !showTags)}
						aria-expanded={showTags}
						aria-controls="sidebar-section-tags"
					>
						<span class="text-[10px]">{showTags ? '\u25BC' : '\u25B6'}</span>
						Tags
					</button>
					{#if showTags}
						<div class="flex flex-wrap gap-1 px-2.5" id="sidebar-section-tags">
							{#each vaultState.tagCounts.slice(0, 18) as tag (tag.name)}
								<button
									class="px-2 py-0.5 text-xs rounded-full bg-accent-subtle dark:bg-tavern-accent-subtle text-accent dark:text-tavern-accent hover:bg-accent/20 dark:hover:bg-tavern-accent/20 transition-colors"
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
					class="text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint mb-1.5 px-2.5"
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
								class="w-full text-left px-2.5 py-1.5 rounded-md text-sm truncate text-ink dark:text-tavern-text hover:bg-parchment dark:hover:bg-tavern-bg transition-colors"
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
					class="text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint mb-1.5 px-2.5"
				>
					Recently Updated
				</p>
				<div class="space-y-0.5">
					{#each recentNotes as note (note.id)}
						<button
							class="w-full text-left px-2.5 py-1.5 rounded-md text-sm truncate text-ink dark:text-tavern-text hover:bg-parchment dark:hover:bg-tavern-bg transition-colors"
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
					class="text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint mb-1.5 px-2.5"
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
								class="w-full text-left px-2.5 py-1.5 rounded-md text-sm truncate text-ink dark:text-tavern-text hover:bg-parchment dark:hover:bg-tavern-bg transition-colors flex items-center gap-2"
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
					class="text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint mb-1.5 px-2.5"
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
								class="w-full text-left px-2.5 py-1.5 rounded-md text-sm truncate text-ink dark:text-tavern-text hover:bg-parchment dark:hover:bg-tavern-bg transition-colors"
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
					class="text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint mb-1.5 px-2.5"
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
								class="w-full text-left px-2.5 py-1.5 rounded-md text-sm truncate text-ink dark:text-tavern-text hover:bg-parchment dark:hover:bg-tavern-bg transition-colors"
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
			class="w-full text-left flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs text-ink-faint dark:text-tavern-faint hover:text-ink-muted dark:hover:text-tavern-muted transition-colors"
			onclick={reopenOnboarding}
		>
			Onboarding
		</button>
		<a
			href={resolve('/settings')}
			class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs text-ink-faint dark:text-tavern-faint hover:text-ink-muted dark:hover:text-tavern-muted transition-colors"
		>
			Settings
		</a>
	</div>
</aside>
