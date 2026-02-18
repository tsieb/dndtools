<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { searchService } from '$lib/services/search.js';
	import { notesState } from '$lib/stores/notes.svelte.js';

	interface Props {
		open: boolean;
		onclose: () => void;
	}

	let { open = $bindable(), onclose }: Props = $props();
	let query = $state('');
	let selectedIndex = $state(0);
	let inputRef: HTMLInputElement | undefined = $state();

	let results = $derived.by(() => {
		if (!query.trim()) {
			return [...notesState.activeNotes]
				.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
				.slice(0, 10)
				.map((n) => ({
					id: n.id,
					title: n.title,
					folder: n.folder,
					filePath: n.filePath ?? null,
					score: 0,
				}));
		}
		return searchService.search(query).slice(0, 10);
	});

	$effect(() => {
		if (open) {
			query = '';
			selectedIndex = 0;
			setTimeout(() => inputRef?.focus(), 0);
		}
	});

	function navigate(id: string): void {
		goto(resolve(`/notes/${id}`));
		onclose();
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			selectedIndex = Math.max(selectedIndex - 1, 0);
		} else if (event.key === 'Enter' && results[selectedIndex]) {
			event.preventDefault();
			navigate(results[selectedIndex]!.id);
		} else if (event.key === 'Escape') {
			onclose();
		}
	}

	function handleBackdrop(event: MouseEvent): void {
		if (event.target === event.currentTarget) onclose();
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/50"
		role="dialog"
		aria-modal="true"
		aria-label="Quick switcher"
		onclick={handleBackdrop}
		onkeydown={handleKeydown}
		tabindex="-1"
	>
		<div
			class="bg-surface dark:bg-tavern-surface rounded-lg shadow-xl border border-border dark:border-tavern-border w-full max-w-md mx-4 overflow-hidden"
		>
			<div class="p-3 border-b border-border dark:border-tavern-border">
				<input
					bind:this={inputRef}
					bind:value={query}
					type="text"
					placeholder="Search notes..."
					class="w-full bg-transparent text-ink dark:text-tavern-text placeholder:text-ink-faint dark:placeholder:text-tavern-faint outline-none text-base"
					role="combobox"
					aria-label="Search notes"
					aria-expanded={results.length > 0}
					aria-controls="quick-switcher-list"
					aria-activedescendant={results[selectedIndex] ? `qs-item-${selectedIndex}` : undefined}
				/>
			</div>

			{#if results.length > 0}
				<ul class="max-h-[40vh] overflow-y-auto py-1" role="listbox" id="quick-switcher-list">
					{#each results as result, i (result.id)}
						<li role="option" aria-selected={i === selectedIndex} id={`qs-item-${i}`}>
							<button
								type="button"
								class="w-full text-left px-3 py-2 flex flex-col transition-colors
									{i === selectedIndex
									? 'bg-accent-subtle dark:bg-tavern-accent-subtle'
									: 'hover:bg-surface-alt dark:hover:bg-tavern-surface-alt'}"
								onclick={() => navigate(result.id)}
								title={result.title}
							>
								<span class="text-sm font-medium text-ink dark:text-tavern-text truncate">
									{result.title}
								</span>
								{#if result.filePath || (result.folder && result.folder !== '/')}
									<span class="text-xs text-ink-muted dark:text-tavern-muted truncate">
										{result.filePath ?? result.folder}
									</span>
								{/if}
							</button>
						</li>
					{/each}
				</ul>
			{:else if query.trim()}
				<div class="px-3 py-6 text-center text-sm text-ink-muted dark:text-tavern-muted">
					No notes found
				</div>
			{/if}

			<div
				class="px-3 py-2 border-t border-border dark:border-tavern-border text-xs text-ink-faint dark:text-tavern-faint flex gap-3"
			>
				<span><kbd class="font-mono">↑↓</kbd> navigate</span>
				<span><kbd class="font-mono">↵</kbd> open</span>
				<span><kbd class="font-mono">esc</kbd> close</span>
			</div>
		</div>
	</div>
{/if}
