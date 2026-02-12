<script lang="ts">
	import { notesState } from '$lib/stores/notes.svelte.js';
	import { editorState } from '$lib/stores/editor.svelte.js';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { createNoteId } from '$lib/types/note.js';
	import EditorToolbar from '$lib/components/editor/EditorToolbar.svelte';
	import EditorStatusBar from '$lib/components/editor/EditorStatusBar.svelte';
	import Button from '$lib/components/common/Button.svelte';

	const noteId = $derived(createNoteId(page.params.id ?? ''));
	let note = $derived(notesState.notes.find((n) => n.id === noteId));

	const EditorPromise = import('$lib/components/editor/CodeMirrorEditor.svelte');

	$effect(() => {
		if (note && editorState.noteId !== note.id) {
			editorState.load(note);
		}
	});

	async function handleDone(): Promise<void> {
		if (editorState.dirty) {
			await editorState.save();
		}
		goto(`/notes/${noteId}`);
	}

	function handleToolbarAction(_action: string): void {
		// Placeholder — toolbar actions would manipulate the CodeMirror view directly
	}
</script>

{#if note}
	<div class="p-6 max-w-content mx-auto">
		<div class="flex items-center justify-between mb-4">
			<Button variant="ghost" onclick={handleDone}>
				&larr; Done
			</Button>
		</div>

		<input
			type="text"
			value={editorState.title}
			oninput={(e) => editorState.setTitle(e.currentTarget.value)}
			class="w-full text-2xl font-bold bg-transparent border-none outline-none text-ink dark:text-tavern-text placeholder:text-ink-faint dark:placeholder:text-tavern-faint mb-4"
			placeholder="Note title..."
		/>

		<EditorToolbar onaction={handleToolbarAction} />

		{#await EditorPromise}
			<div
				class="min-h-[400px] w-full border border-border dark:border-tavern-border rounded-lg bg-surface dark:bg-tavern-surface flex items-center justify-center"
			>
				<p class="text-ink-muted dark:text-tavern-muted text-sm">Loading editor...</p>
			</div>
		{:then Editor}
			<Editor.default
				content={editorState.content}
				onchange={(v) => editorState.setContent(v)}
			/>
		{/await}

		<EditorStatusBar />
	</div>
{:else}
	<div class="flex items-center justify-center h-full">
		<p class="text-ink-muted dark:text-tavern-muted">Note not found</p>
	</div>
{/if}
