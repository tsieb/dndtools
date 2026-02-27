<script lang="ts">
	import type { PageData } from './$types';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { toastState } from '$lib/state/toast.svelte.js';
	import NoteViewer from '$lib/ui/viewer/NoteViewer.svelte';
	import NoteHeader from '$lib/ui/viewer/NoteHeader.svelte';
	import BacklinksPanel from '$lib/ui/viewer/BacklinksPanel.svelte';
	import RelatedNoteJumps from '$lib/ui/viewer/RelatedNoteJumps.svelte';
	import TableOfContents from '$lib/ui/viewer/TableOfContents.svelte';
	import ConfirmDialog from '$lib/ui/common/ConfirmDialog.svelte';
	import { ui } from '$lib/state/ui.svelte.js';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	let { data }: { data: PageData } = $props();
	let showDeleteConfirm = $state(false);
	let quickAdd = $state('');

	let note = $derived(notesState.getNoteById(data.noteId));

	$effect(() => {
		if (data.noteId) {
			notesState.setActive(data.noteId);
		}
	});

	async function handleDelete(): Promise<void> {
		showDeleteConfirm = false;
		const title = note?.title ?? 'Note';
		await notesState.deleteNote(data.noteId);
		toastState.success(`"${title}" moved to trash`);
		goto(resolve('/notes'));
	}

	async function handleQuickAdd(): Promise<void> {
		const text = quickAdd.trim();
		if (!note || !text) return;
		const prefix = note.content.trim().length > 0 ? '\n' : '';
		await notesState.updateNote(note.id, {
			content: `${note.content}${prefix}- ${text}`,
		});
		quickAdd = '';
		toastState.success('Added to note');
	}
</script>

{#if note}
	<div class="p-6">
		<div class="mx-auto mb-3 flex max-w-content justify-end">
			<button
				type="button"
				class="rounded-md px-2.5 py-1 text-xs text-ink-muted hover:bg-surface-alt dark:text-tavern-muted dark:hover:bg-tavern-surface-alt"
				onclick={() => void ui.setFocusReading(!ui.focusReading)}
				aria-pressed={ui.focusReading}
			>
				{ui.focusReading ? 'Exit Focus Reading' : 'Focus Reading'}
			</button>
		</div>
		<NoteHeader
			{note}
			onedit={() => goto(resolve(`/notes/${data.noteId}/edit`))}
			ondelete={() => (showDeleteConfirm = true)}
		/>
		<TableOfContents content={note.content} />
		<div
			class="max-w-content mx-auto mb-4 rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface p-3"
		>
			<div class="flex items-center gap-2">
				<input
					type="text"
					bind:value={quickAdd}
					placeholder="Quick add to this note..."
					class="flex-1 bg-transparent text-sm text-ink dark:text-tavern-text placeholder:text-ink-faint dark:placeholder:text-tavern-faint outline-none"
					onkeydown={(event) => {
						if (event.key === 'Enter') {
							event.preventDefault();
							void handleQuickAdd();
						}
					}}
				/>
				<button
					class="px-2.5 py-1.5 text-xs rounded-md bg-accent-subtle dark:bg-tavern-accent-subtle text-accent dark:text-tavern-accent hover:bg-accent/20 dark:hover:bg-tavern-accent/20"
					onclick={handleQuickAdd}
				>
					Add
				</button>
			</div>
		</div>
		<NoteViewer {note} />
		<RelatedNoteJumps noteId={data.noteId} />
		<BacklinksPanel noteId={data.noteId} />
	</div>

	<ConfirmDialog
		open={showDeleteConfirm}
		title="Delete Note"
		message={'Are you sure you want to delete "' + note.title + '"? It will be moved to trash.'}
		onconfirm={handleDelete}
		oncancel={() => (showDeleteConfirm = false)}
	/>
{:else}
	<div class="flex items-center justify-center h-full">
		<div class="text-center py-16">
			<p class="text-lg text-ink-muted dark:text-tavern-muted mb-2">Note not found</p>
			<a
				href={resolve('/notes')}
				class="text-accent dark:text-tavern-accent hover:text-accent-hover dark:hover:text-tavern-accent-hover text-sm"
			>
				Back to notes
			</a>
		</div>
	</div>
{/if}
