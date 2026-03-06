<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { playerModeState } from '$lib/state/player-mode.svelte.js';
	import type { NoteId } from '$lib/types/note.js';
	import {
		buildQuickReferenceEntityRecords,
		quickReferenceIconToken,
		searchQuickReferenceEntities,
	} from '$lib/domain/quick-reference.js';
	import SessionContextPanel from '$lib/ui/session/SessionContextPanel.svelte';
	import { isNoteVisibleInPlayerMode } from '$lib/domain/visibility.js';
	import { focusTrap } from '$lib/ui/a11y/focus-trap.js';

	interface Props {
		open: boolean;
		onclose: () => void;
		onopensplitview: (noteId: NoteId) => void;
	}

	let { open = $bindable(), onclose, onopensplitview }: Props = $props();
	let query = $state('');
	let selectedIndex = $state(0);
	let inputRef: HTMLInputElement | undefined = $state();

	let modeScopedNotes = $derived.by(() =>
		playerModeState.enabled
			? notesState.activeNotes.filter((note) => isNoteVisibleInPlayerMode(note))
			: notesState.activeNotes,
	);
	let entityRecords = $derived(buildQuickReferenceEntityRecords(modeScopedNotes));
	let results = $derived(searchQuickReferenceEntities(entityRecords, query, 12));

	$effect(() => {
		if (!open) return;
		query = '';
		selectedIndex = 0;
		setTimeout(() => inputRef?.focus(), 0);
	});

	$effect(() => {
		if (selectedIndex < results.length) return;
		selectedIndex = Math.max(0, results.length - 1);
	});

	function findNext(start: number, direction: 1 | -1): number {
		if (results.length === 0) return 0;
		return (start + direction + results.length) % results.length;
	}

	function openResult(noteId: NoteId): void {
		void goto(resolve(`/knowledge/notes/${noteId}`));
		onclose();
	}

	function openResultInSplit(noteId: NoteId): void {
		onopensplitview(noteId);
		onclose();
	}

	function handleBackdrop(event: MouseEvent): void {
		if (event.target === event.currentTarget) onclose();
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			selectedIndex = findNext(selectedIndex, 1);
			return;
		}
		if (event.key === 'ArrowUp') {
			event.preventDefault();
			selectedIndex = findNext(selectedIndex, -1);
			return;
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			onclose();
			return;
		}
		if (event.key === 'Enter' && results[selectedIndex]) {
			event.preventDefault();
			const result = results[selectedIndex];
			if (!result) return;
			if (event.ctrlKey || event.metaKey) {
				openResultInSplit(result.noteId);
				return;
			}
			openResult(result.noteId);
		}
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 bg-black/45 p-4 sm:p-6 flex items-start justify-center"
		role="dialog"
		aria-modal="true"
		aria-label="Quick reference overlay"
		use:focusTrap
		onclick={handleBackdrop}
		onkeydown={handleKeydown}
		tabindex="-1"
	>
		<section
			class="w-full max-w-5xl rounded-xl border border-border bg-surface/98 shadow-2xl overflow-hidden"
		>
			<header class="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
				<div>
					<h2 class="text-sm font-semibold text-ink">Quick Reference HUD</h2>
					<p class="text-xs text-ink-muted">Ctrl+Shift+Space toggles this overlay.</p>
				</div>
				<button
					type="button"
					class="px-2.5 py-1 rounded border border-border text-xs hover:bg-surface-alt"
					onclick={onclose}
				>
					Close
				</button>
			</header>

			<div class="grid lg:grid-cols-[19rem,1fr] gap-0 max-h-[82vh]">
				<div class="border-r border-border p-3 overflow-y-auto">
					<SessionContextPanel compact showAddControls={true} />
				</div>

				<div class="p-3 flex flex-col min-h-0">
					<div class="mb-2">
						<input
							bind:this={inputRef}
							bind:value={query}
							type="text"
							placeholder="Search entities (NPC, location, item, rule)..."
							class="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink"
							aria-label="Search quick reference entities"
						/>
					</div>

					{#if results.length === 0}
						<div
							class="flex-1 rounded border border-dashed border-border p-4 text-sm text-ink-muted"
						>
							No matching entities.
						</div>
					{:else}
						<ul class="flex-1 overflow-y-auto space-y-1.5" role="listbox">
							{#each results as result, index (result.noteId)}
								<li role="option" aria-selected={index === selectedIndex}>
									<div
										class="w-full rounded-md border px-3 py-2 transition-colors {index ===
										selectedIndex
											? 'border-accent/40 bg-accent-subtle'
											: 'border-border hover:bg-surface-alt'}"
									>
										<button
											type="button"
											class="w-full text-left"
											onclick={() => openResult(result.noteId)}
										>
											<div class="flex items-start gap-2">
												<span
													class="h-6 w-6 shrink-0 rounded-full border border-border bg-surface-alt text-xs font-semibold flex items-center justify-center text-ink-muted"
													aria-hidden="true"
												>
													{quickReferenceIconToken(result.type)}
												</span>
												<div class="min-w-0 flex-1">
													<div class="flex items-center justify-between gap-2">
														<p class="truncate text-sm font-medium text-ink">
															{result.title}
														</p>
														<p class="text-xs text-ink-faint shrink-0">
															{result.typeLabel}
														</p>
													</div>
													{#if result.keyStats.length > 0}
														<p class="mt-0.5 text-xs text-ink-muted truncate">
															{result.keyStats.join(' | ')}
														</p>
													{/if}
													{#if result.previewLines.length > 0}
														<p class="mt-1 text-xs text-ink-muted line-clamp-2">
															{result.previewLines.join(' ')}
														</p>
													{/if}
												</div>
											</div>
										</button>
										<div class="mt-2 flex items-center gap-1.5">
											<button
												type="button"
												class="rounded border border-border px-2 py-0.5 text-xs text-ink-muted hover:text-ink"
												onclick={() => openResultInSplit(result.noteId)}
											>
												Split
											</button>
										</div>
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			</div>
		</section>
	</div>
{/if}
