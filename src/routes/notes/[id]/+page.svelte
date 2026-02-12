<script lang="ts">
	import type { PageData } from './$types';
	import { notesState } from '$lib/stores/notes.svelte.js';
	import NoteViewer from '$lib/components/viewer/NoteViewer.svelte';
	import NoteHeader from '$lib/components/viewer/NoteHeader.svelte';
	import BacklinksPanel from '$lib/components/viewer/BacklinksPanel.svelte';
	import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';
	import { goto } from '$app/navigation';

	let { data }: { data: PageData } = $props();
	let showDeleteConfirm = $state(false);

	let note = $derived(notesState.notes.find((n) => n.id === data.noteId));

	$effect(() => {
		if (data.noteId) {
			notesState.setActive(data.noteId);
		}
	});

	async function handleDelete(): Promise<void> {
		showDeleteConfirm = false;
		await notesState.deleteNote(data.noteId);
		goto('/notes');
	}
</script>

{#if note}
	<div class="p-6">
		<NoteHeader
			{note}
			onedit={() => goto(`/notes/${data.noteId}/edit`)}
			ondelete={() => (showDeleteConfirm = true)}
		/>
		<NoteViewer {note} />
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
		<div class="text-center">
			<p class="text-lg text-ink-muted dark:text-tavern-muted">Note not found</p>
			<a
				href="/notes"
				class="text-accent dark:text-tavern-accent hover:text-accent-hover mt-2 inline-block"
			>
				Back to notes
			</a>
		</div>
	</div>
{/if}
