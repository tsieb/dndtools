<script lang="ts">
	import { notesState } from '$lib/stores/notes.svelte.js';
	import { vaultState } from '$lib/stores/vault.svelte.js';
	import { ui } from '$lib/stores/ui.svelte.js';
	import { goto } from '$app/navigation';
	import { formatRelativeDate } from '$lib/utils/date.js';

	interface Props {
		onnewnote: () => void;
	}

	let { onnewnote }: Props = $props();

	let recentNotes = $derived(
		notesState.activeNotes
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
			.slice(0, 8),
	);

	function navigateToNote(id: string): void {
		goto(`/notes/${id}`);
		if (ui.isMobile) {
			ui.sidebarOpen = false;
		}
	}
</script>

<aside
	class="h-full flex flex-col bg-surface-alt dark:bg-tavern-surface border-r border-border dark:border-tavern-border overflow-hidden
		{ui.isMobile ? 'fixed inset-y-0 left-0 z-40 w-[280px] shadow-xl' : ''}"
	style="width: {ui.isMobile ? '280px' : ui.sidebarWidth + 'px'}"
>
	<!-- Header -->
	<div class="p-3 border-b border-border dark:border-tavern-border">
		<button
			class="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-accent text-white hover:bg-accent-hover dark:bg-tavern-accent dark:text-tavern-bg dark:hover:bg-tavern-accent-hover text-sm font-medium transition-colors"
			onclick={onnewnote}
		>
			<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
			</svg>
			New Note
		</button>
	</div>

	<!-- Scrollable content -->
	<div class="flex-1 overflow-y-auto">
		<!-- Navigation -->
		<nav class="p-3">
			<a
				href="/"
				class="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-ink-muted dark:text-tavern-muted hover:bg-parchment dark:hover:bg-tavern-bg transition-colors"
			>
				Home
			</a>
			<a
				href="/notes"
				class="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-ink-muted dark:text-tavern-muted hover:bg-parchment dark:hover:bg-tavern-bg transition-colors"
			>
				All Notes ({vaultState.noteCount})
			</a>
			<a
				href="/search"
				class="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-ink-muted dark:text-tavern-muted hover:bg-parchment dark:hover:bg-tavern-bg transition-colors"
			>
				Search
			</a>
		</nav>

		<!-- Recent Notes -->
		<div class="px-3 pb-3">
			<h3
				class="text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint mb-2 px-2"
			>
				Recent
			</h3>
			<div class="space-y-0.5">
				{#each recentNotes as note}
					<button
						class="w-full text-left px-2 py-1.5 rounded-md text-sm truncate text-ink dark:text-tavern-text hover:bg-parchment dark:hover:bg-tavern-bg transition-colors"
						onclick={() => navigateToNote(note.id)}
						title={note.title}
					>
						{note.title}
					</button>
				{/each}
			</div>
		</div>

		<!-- Tags -->
		{#if vaultState.tagCounts.length > 0}
			<div class="px-3 pb-3">
				<h3
					class="text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint mb-2 px-2"
				>
					Tags
				</h3>
				<div class="flex flex-wrap gap-1 px-2">
					{#each vaultState.tagCounts.slice(0, 12) as tag}
						<a
							href="/notes?tag={encodeURIComponent(tag.name)}"
							class="px-2 py-0.5 text-xs rounded-full bg-accent-subtle dark:bg-tavern-accent-subtle text-accent dark:text-tavern-accent hover:bg-accent/20 dark:hover:bg-tavern-accent/20 transition-colors"
						>
							{tag.name}
							<span class="text-ink-faint dark:text-tavern-faint ml-0.5">{tag.count}</span>
						</a>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</aside>
