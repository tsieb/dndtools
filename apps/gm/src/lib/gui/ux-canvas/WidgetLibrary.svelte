<script lang="ts">
	import Dialog from '$lib/gui/a11y/Dialog.svelte';
	import { buildLibrary, type LibraryEntry } from './widget-library';
	import type { PlatformProfileId } from '@dndtools/core';

	/**
	 * Widget library / insert flow (UX-CANVAS-002). A modal `role="dialog"` containing an auto-focused
	 * search field and a categorised `role="listbox"` of `role="option"` widgets. Selecting an available
	 * item calls `onplace(type)` so the host adds it to the canvas at the default size, centred and
	 * selected. Unavailable widgets (for the active profile) render at 40% opacity and cannot be chosen
	 * (CMD-005). Fully keyboard-operable: the dialog traps focus, the search filters live, and an item is
	 * placed with Enter/Space/click. No gesture or pointer-only path.
	 */
	interface Props {
		open: boolean;
		profile: PlatformProfileId;
		onplace: (type: string) => void;
		onclose?: () => void;
	}

	let { open = $bindable(), profile, onplace, onclose }: Props = $props();

	let search = $state('');
	let searchEl = $state<HTMLInputElement | null>(null);

	const library = $derived(buildLibrary(profile, { search }));
	const flatItems = $derived(library.groups.flatMap((g) => g.items));

	// UX-CANVAS-002 AC1: the search field receives focus when the library opens.
	$effect(() => {
		if (open && searchEl) searchEl.focus();
	});

	function place(entry: LibraryEntry) {
		if (!entry.available) return;
		onplace(entry.type);
		open = false;
		onclose?.();
	}

	function onItemKeydown(event: KeyboardEvent, entry: LibraryEntry, index: number) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			place(entry);
			return;
		}
		let next: number | null = null;
		if (event.key === 'ArrowDown') next = Math.min(flatItems.length - 1, index + 1);
		else if (event.key === 'ArrowUp') next = Math.max(0, index - 1);
		else if (event.key === 'Home') next = 0;
		else if (event.key === 'End') next = flatItems.length - 1;
		if (next === null) return;
		event.preventDefault();
		const target = document.querySelector<HTMLElement>(`[data-library-index="${next}"]`);
		target?.focus();
	}
</script>

<Dialog bind:open title="Widget library" testid="widget-library" {onclose}>
	<div class="library">
		<label class="library-search">
			<span class="sr-only">Search widgets by name or type</span>
			<input
				bind:this={searchEl}
				bind:value={search}
				type="search"
				placeholder="Search widgets"
				data-testid="widget-library-search"
				autocomplete="off"
			/>
		</label>

		{#if flatItems.length === 0}
			<p class="meta" data-testid="widget-library-empty">No widgets match "{search}".</p>
		{:else}
			<div class="library-groups" role="listbox" aria-label="Widget catalogue">
				{#each library.groups as group (group.category)}
					<div class="library-group" role="group" aria-label={group.category}>
						<p class="library-category">{group.category}</p>
						<div class="library-items">
							{#each group.items as entry (entry.type)}
								{@const index = flatItems.indexOf(entry)}
								<button
									type="button"
									role="option"
									aria-selected="false"
									aria-disabled={!entry.available}
									class="library-item"
									class:is-unavailable={!entry.available}
									data-testid={`widget-library-item-${entry.type}`}
									data-library-index={index}
									title={entry.unavailableReason ?? entry.label}
									tabindex={index === 0 ? 0 : -1}
									onclick={() => place(entry)}
									onkeydown={(e) => onItemKeydown(e, entry, index)}
								>
									<span class="library-thumb" aria-hidden="true">{entry.label.charAt(0)}</span>
									<span class="library-label">{entry.label}</span>
									{#if !entry.available}
										<span class="library-unavailable meta" data-testid={`widget-library-unavailable-${entry.type}`}>
											Unavailable
										</span>
									{/if}
								</button>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</Dialog>

<style>
	.library {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: min(304px, 80vw);
	}
	.library-search input {
		width: 100%;
		min-height: var(--touch-target-min);
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
		background: var(--color-surface-raised);
		color: var(--color-text-primary);
	}
	.library-groups {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		max-height: 50vh;
		overflow-y: auto;
	}
	.library-category {
		margin: 0 0 var(--space-1);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
		color: var(--color-text-tertiary);
	}
	.library-items {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--space-1);
	}
	.library-item {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--touch-target-min);
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface-raised);
		color: var(--color-text-primary);
		text-align: left;
		cursor: pointer;
	}
	.library-item:hover {
		background: var(--color-interactive-hover);
	}
	.library-item.is-unavailable {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.library-thumb {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: var(--radius-sm);
		background: var(--color-surface-sunken);
		font-weight: var(--font-weight-bold);
	}
	.library-label {
		flex: 1;
		font-size: var(--text-sm);
	}
	.library-unavailable {
		font-size: var(--text-2xs);
	}
	.meta {
		color: var(--color-text-tertiary);
		margin: 0;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
