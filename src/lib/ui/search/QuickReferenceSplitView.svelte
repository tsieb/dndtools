<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { renderMarkdown } from '$lib/markdown/pipeline.js';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { playerModeState } from '$lib/state/player-mode.svelte.js';
	import type { NoteId } from '$lib/types/note.js';
	import { isNoteVisibleInPlayerMode } from '$lib/domain/visibility.js';

	interface Props {
		noteId: NoteId;
		onclose: () => void;
	}

	let { noteId, onclose }: Props = $props();
	let note = $derived.by(() => {
		const resolved = notesState.getActiveNoteById(noteId) ?? notesState.getNoteById(noteId);
		if (!resolved) return null;
		if (!playerModeState.enabled) return resolved;
		return isNoteVisibleInPlayerMode(resolved) ? resolved : null;
	});
	let html = $state('');
	let contentEl = $state<HTMLDivElement | null>(null);

	$effect(() => {
		if (!note) {
			html = '';
			return;
		}
		let stale = false;
		void renderMarkdown(note.content, {
			resolveLink: (title) => {
				const id = notesState.resolveTitle(title);
				if (id && playerModeState.enabled) {
					const target = notesState.getActiveNoteById(id);
					if (!target || !isNoteVisibleInPlayerMode(target)) {
						return { href: `/notes?create=${encodeURIComponent(title)}`, exists: false };
					}
				}
				return id
					? { href: `/notes/${id}`, exists: true }
					: { href: `/notes?create=${encodeURIComponent(title)}`, exists: false };
			},
		}).then((rendered) => {
			if (!stale) html = rendered;
		});
		return () => {
			stale = true;
		};
	});

	function handleOverlayClick(event: MouseEvent): void {
		const target = event.target as HTMLElement;
		const link = target.closest('a');
		if (!link) return;
		const href = link.getAttribute('href');
		if (!href || !href.startsWith('/')) return;
		event.preventDefault();
		void goto(href);
	}

	$effect(() => {
		if (!contentEl) return;
		const element = contentEl;
		element.addEventListener('click', handleOverlayClick);
		return () => element.removeEventListener('click', handleOverlayClick);
	});
</script>

<div
	class="fixed right-0 top-0 z-50 h-screen w-full max-w-[38rem] border-l border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface shadow-2xl flex flex-col"
	role="dialog"
	aria-modal="false"
	aria-label="Split quick reference"
>
	<div
		class="px-4 py-3 border-b border-border dark:border-tavern-border flex items-center gap-2 min-w-0"
	>
		<div class="min-w-0 flex-1">
			<p class="text-[11px] uppercase tracking-wider text-ink-faint dark:text-tavern-faint">
				Split Quick Reference
			</p>
			<p class="text-sm font-semibold truncate text-ink dark:text-tavern-text">
				{note?.title ?? 'Missing note'}
			</p>
		</div>
		{#if note}
			<button
				type="button"
				class="px-2 py-1 rounded text-xs border border-border dark:border-tavern-border hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors"
				onclick={() => void goto(resolve(`/notes/${note.id}`))}
			>
				Open
			</button>
		{/if}
		<button
			type="button"
			class="px-2 py-1 rounded text-xs border border-border dark:border-tavern-border hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors"
			onclick={onclose}
		>
			Close
		</button>
	</div>

	<div class="flex-1 overflow-y-auto p-4" bind:this={contentEl}>
		{#if note}
			<div class="markdown-content max-w-none" role="document">
				<!-- Content is sanitized by renderMarkdown before injecting HTML. -->
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html html}
			</div>
		{:else}
			<p class="text-sm text-ink-muted dark:text-tavern-muted">
				The referenced note is unavailable.
			</p>
		{/if}
	</div>
</div>
