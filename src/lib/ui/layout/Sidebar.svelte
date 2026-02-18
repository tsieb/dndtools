<script lang="ts">
	import { notesState } from '$lib/state/notes.svelte.js';
	import { vaultState } from '$lib/state/vault.svelte.js';
	import { ui } from '$lib/state/ui.svelte.js';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	interface Props {
		onnewnote: () => void;
		ontemplate: () => void;
	}

	let { onnewnote, ontemplate }: Props = $props();
	let showRecent = $state(true);
	let showPinned = $state(true);
	let showFolders = $state(true);
	let showTags = $state(true);

	let pinnedNotes = $derived(notesState.pinnedNotes);

	let recentNotes = $derived(
		notesState.activeNotes
			.filter((n) => !n.pinned)
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
			.slice(0, 8),
	);

	let folderNotes = $derived(
		vaultState.folders
			.filter((folder) => folder.id !== '/')
			.sort((a, b) => a.id.localeCompare(b.id))
			.slice(0, 20),
	);

	function navigateToNote(id: string): void {
		goto(resolve(`/notes/${id}`));
		if (ui.isMobile) {
			ui.sidebarOpen = false;
		}
	}
</script>

<aside
	class="h-full flex flex-col bg-surface-alt dark:bg-tavern-surface border-r border-border dark:border-tavern-border overflow-hidden
		{ui.isMobile ? 'fixed inset-y-0 left-0 z-40 w-[280px] shadow-xl animate-slide-in' : ''}"
	style="width: {ui.isMobile ? '280px' : ui.sidebarWidth + 'px'}"
>
	<!-- Header -->
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
			<span class="text-sm" aria-hidden="true">📜</span>
			From Template
		</button>
	</div>

	<!-- Scrollable content -->
	<div class="flex-1 overflow-y-auto">
		<!-- Navigation -->
		<nav class="p-3 space-y-0.5">
			<a
				href={resolve('/')}
				class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-ink-muted dark:text-tavern-muted hover:bg-parchment dark:hover:bg-tavern-bg hover:text-ink dark:hover:text-tavern-text transition-colors"
			>
				<svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4" />
				</svg>
				Home
			</a>
			<a
				href={resolve('/notes')}
				class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-ink-muted dark:text-tavern-muted hover:bg-parchment dark:hover:bg-tavern-bg hover:text-ink dark:hover:text-tavern-text transition-colors"
			>
				<svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
				</svg>
				All Notes
				<span class="ml-auto text-xs text-ink-faint dark:text-tavern-faint">{vaultState.noteCount}</span>
			</a>
			<a
				href={resolve('/search')}
				class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-ink-muted dark:text-tavern-muted hover:bg-parchment dark:hover:bg-tavern-bg hover:text-ink dark:hover:text-tavern-text transition-colors"
			>
				<svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
				</svg>
				Search
			</a>
			<a
				href={resolve('/session-board')}
				class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-ink-muted dark:text-tavern-muted hover:bg-parchment dark:hover:bg-tavern-bg hover:text-ink dark:hover:text-tavern-text transition-colors"
			>
				<svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M4 4h7v7H4V4zm9 0h7v4h-7V4zM4 13h4v7H4v-7zm6 0h10v7H10v-7z" />
				</svg>
				Session Board
			</a>
		</nav>

		<!-- Pinned Notes -->
		{#if pinnedNotes.length > 0}
			<div class="px-3 pb-2">
				<button
					type="button"
					class="flex items-center gap-1.5 w-full text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint mb-1.5 px-2.5 hover:text-ink-muted dark:hover:text-tavern-muted transition-colors"
					onclick={() => (showPinned = !showPinned)}
					aria-expanded={showPinned}
					aria-controls="sidebar-section-pinned"
					title={showPinned ? 'Collapse pinned notes' : 'Expand pinned notes'}
				>
					<span class="text-[10px]">{showPinned ? '\u25BC' : '\u25B6'}</span>
					Pinned
				</button>
				{#if showPinned}
					<div class="space-y-0.5" id="sidebar-section-pinned">
						{#each pinnedNotes as note (note.id)}
							<button
								class="w-full text-left px-2.5 py-1.5 rounded-md text-sm truncate text-ink dark:text-tavern-text hover:bg-parchment dark:hover:bg-tavern-bg transition-colors flex items-center gap-2"
								onclick={() => navigateToNote(note.id)}
								title={note.title}
							>
								<svg class="w-3 h-3 shrink-0 text-accent dark:text-tavern-accent" fill="currentColor" viewBox="0 0 24 24">
									<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
								</svg>
								<span class="truncate">{note.title}</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<!-- Recent Notes -->
		<div class="px-3 pb-2">
			<button
				type="button"
				class="flex items-center gap-1.5 w-full text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint mb-1.5 px-2.5 hover:text-ink-muted dark:hover:text-tavern-muted transition-colors"
				onclick={() => (showRecent = !showRecent)}
				aria-expanded={showRecent}
				aria-controls="sidebar-section-recent"
				title={showRecent ? 'Collapse recent notes' : 'Expand recent notes'}
			>
				<span class="text-[10px]">{showRecent ? '\u25BC' : '\u25B6'}</span>
				Recent
			</button>
			{#if showRecent}
				<div class="space-y-0.5" id="sidebar-section-recent">
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
			{/if}
		</div>

		<!-- Folder Paths -->
		{#if folderNotes.length > 0}
			<div class="px-3 pb-2">
				<button
					type="button"
					class="flex items-center gap-1.5 w-full text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint mb-1.5 px-2.5 hover:text-ink-muted dark:hover:text-tavern-muted transition-colors"
					onclick={() => (showFolders = !showFolders)}
					aria-expanded={showFolders}
					aria-controls="sidebar-section-folders"
					title={showFolders ? 'Collapse folders' : 'Expand folders'}
				>
					<span class="text-[10px]">{showFolders ? '\u25BC' : '\u25B6'}</span>
					Folders
				</button>
				{#if showFolders}
					<div class="space-y-0.5" id="sidebar-section-folders">
						{#each folderNotes as folder (folder.id)}
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
							<a
								href={`/notes?folder=${encodeURIComponent(folder.id)}`}
								class="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-ink-muted dark:text-tavern-muted hover:bg-parchment dark:hover:bg-tavern-bg hover:text-ink dark:hover:text-tavern-text transition-colors"
								title={folder.id}
							>
								<span class="truncate font-mono">{folder.id}</span>
								<span class="ml-auto opacity-70">{folder.noteCount}</span>
							</a>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<!-- Tags -->
		{#if vaultState.tagCounts.length > 0}
			<div class="px-3 pb-3">
				<button
					type="button"
					class="flex items-center gap-1.5 w-full text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint mb-1.5 px-2.5 hover:text-ink-muted dark:hover:text-tavern-muted transition-colors"
					onclick={() => (showTags = !showTags)}
					aria-expanded={showTags}
					aria-controls="sidebar-section-tags"
					title={showTags ? 'Collapse tags' : 'Expand tags'}
				>
					<span class="text-[10px]">{showTags ? '\u25BC' : '\u25B6'}</span>
					Tags
				</button>
				{#if showTags}
					<div class="flex flex-wrap gap-1 px-2.5" id="sidebar-section-tags">
						{#each vaultState.tagCounts.slice(0, 15) as tag (tag.name)}
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
							<a
								href={`/notes?tag=${encodeURIComponent(tag.name)}`}
								class="px-2 py-0.5 text-xs rounded-full bg-accent-subtle dark:bg-tavern-accent-subtle text-accent dark:text-tavern-accent hover:bg-accent/20 dark:hover:bg-tavern-accent/20 transition-colors"
							>
								{tag.name}
								<span class="opacity-60 ml-0.5">{tag.count}</span>
							</a>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Footer -->
	<div class="px-3 py-2 border-t border-border dark:border-tavern-border">
		<a
			href={resolve('/settings')}
			class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs text-ink-faint dark:text-tavern-faint hover:text-ink-muted dark:hover:text-tavern-muted transition-colors"
		>
			<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
				<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
			</svg>
			Settings
		</a>
	</div>
</aside>
