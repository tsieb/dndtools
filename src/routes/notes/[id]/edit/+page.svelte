<script lang="ts">
	import type { EditorView } from '@codemirror/view';
	import { notesState } from '$lib/stores/notes.svelte.js';
	import { editorState } from '$lib/stores/editor.svelte.js';
	import { toastState } from '$lib/stores/toast.svelte.js';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { createNoteId } from '$lib/types/note.js';
	import EditorToolbar from '$lib/components/editor/EditorToolbar.svelte';
	import ObjectEmbedMenu from '$lib/components/editor/ObjectEmbedMenu.svelte';
	import EditorStatusBar from '$lib/components/editor/EditorStatusBar.svelte';
	import Button from '$lib/components/common/Button.svelte';

	const noteId = $derived(createNoteId(page.params.id ?? ''));
	let note = $derived(notesState.getNoteById(noteId));
	let editorView = $state<EditorView | null>(null);

	interface SectionHeading {
		level: number;
		text: string;
		offset: number;
	}

	let sectionHeadings = $derived.by<SectionHeading[]>(() => {
		const headings: SectionHeading[] = [];
		let offset = 0;
		for (const line of editorState.content.split('\n')) {
			const match = line.match(/^(#{1,6})\s+(.+)$/);
			if (match && match[2]) {
				headings.push({
					level: match[1]!.length,
					text: match[2].trim(),
					offset,
				});
			}
			offset += line.length + 1;
		}
		return headings;
	});

	const EditorPromise = import('$lib/components/editor/CodeMirrorEditor.svelte');

	$effect(() => {
		if (note && editorState.noteId !== note.id) {
			editorState.load(note);
		}
	});

	// Ctrl+S to save
	function handleKeydown(event: KeyboardEvent): void {
		const mod = event.ctrlKey || event.metaKey;
		if (mod && event.key === 's') {
			event.preventDefault();
			editorState.save().then(() => {
				toastState.success('Note saved');
			});
		} else if (mod && event.key === 'Enter') {
			event.preventDefault();
			void handleDone();
		}
	}

	async function handleDone(): Promise<void> {
		if (editorState.dirty) {
			await editorState.save();
		}
		goto(resolve(`/notes/${noteId}`));
	}

	function handleViewReady(view: EditorView): void {
		editorView = view;
	}

	function insertAtCursor(value: string): void {
		if (!editorView) return;
		const selection = editorView.state.selection.main;
		editorView.dispatch({
			changes: { from: selection.from, to: selection.to, insert: value },
			selection: { anchor: selection.from + value.length },
			scrollIntoView: true,
		});
		editorView.focus();
	}

	function jumpToSection(offset: number): void {
		if (!editorView) return;
		editorView.dispatch({
			selection: { anchor: offset },
			scrollIntoView: true,
		});
		editorView.focus();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if note}
	<div class="p-6 max-w-content mx-auto">
		<div class="flex items-center justify-between mb-4">
			<Button variant="ghost" onclick={handleDone}>
				<svg class="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
				</svg>
				Done
			</Button>
			<div class="flex items-center gap-2">
				<button
					class="px-3 py-1.5 text-sm rounded-md text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors"
					onclick={() => {
						editorState.save().then(() => toastState.success('Note saved'));
					}}
					title="Save (Ctrl+S)"
				>
					Save
				</button>
			</div>
		</div>

		<input
			type="text"
			value={editorState.title}
			oninput={(e) => editorState.setTitle(e.currentTarget.value)}
			class="w-full text-2xl font-bold bg-transparent border-none outline-none text-ink dark:text-tavern-text placeholder:text-ink-faint dark:placeholder:text-tavern-faint mb-4"
			placeholder="Note title..."
		/>

		<EditorToolbar {editorView} />
		<ObjectEmbedMenu {editorView} />
		<div class="flex flex-wrap gap-2 mb-2">
			<button class="px-2 py-1 rounded-md text-xs bg-surface-alt dark:bg-tavern-surface-alt text-ink-muted dark:text-tavern-muted hover:text-ink dark:hover:text-tavern-text" onclick={() => insertAtCursor('- ')}>
				Bullet
			</button>
			<button class="px-2 py-1 rounded-md text-xs bg-surface-alt dark:bg-tavern-surface-alt text-ink-muted dark:text-tavern-muted hover:text-ink dark:hover:text-tavern-text" onclick={() => insertAtCursor('- [ ] ')}>
				Task
			</button>
			<button class="px-2 py-1 rounded-md text-xs bg-surface-alt dark:bg-tavern-surface-alt text-ink-muted dark:text-tavern-muted hover:text-ink dark:hover:text-tavern-text" onclick={() => insertAtCursor('## ')}>
				Section
			</button>
			<button class="px-2 py-1 rounded-md text-xs bg-surface-alt dark:bg-tavern-surface-alt text-ink-muted dark:text-tavern-muted hover:text-ink dark:hover:text-tavern-text" onclick={() => insertAtCursor('> [!note] ')}>
				Callout
			</button>
			<button class="px-2 py-1 rounded-md text-xs bg-surface-alt dark:bg-tavern-surface-alt text-ink-muted dark:text-tavern-muted hover:text-ink dark:hover:text-tavern-text" onclick={() => insertAtCursor(`\n- ${new Date().toISOString().slice(0, 10)}: `)}>
				Date Stamp
			</button>
		</div>

		{#if sectionHeadings.length > 0}
			<div class="mb-2 rounded-lg border border-border dark:border-tavern-border bg-surface-alt/60 dark:bg-tavern-surface-alt/60 p-2">
				<p class="text-xs uppercase tracking-wider text-ink-faint dark:text-tavern-faint mb-2">
					Section Navigator
				</p>
				<div class="flex flex-wrap gap-1.5">
					{#each sectionHeadings as heading (heading.offset)}
						<button
							class="px-2 py-1 rounded text-xs text-ink-muted dark:text-tavern-muted hover:bg-surface dark:hover:bg-tavern-surface hover:text-ink dark:hover:text-tavern-text"
							style="margin-left: {(heading.level - 1) * 0.4}rem"
							onclick={() => jumpToSection(heading.offset)}
						>
							{heading.text}
						</button>
					{/each}
				</div>
			</div>
		{/if}

		{#await EditorPromise}
			<div
				class="min-h-[400px] w-full border border-border dark:border-tavern-border rounded-lg bg-surface dark:bg-tavern-surface flex items-center justify-center"
			>
				<div class="text-center">
					<div class="inline-block w-5 h-5 border-2 border-accent/30 dark:border-tavern-accent/30 border-t-accent dark:border-t-tavern-accent rounded-full animate-spin mb-2"></div>
					<p class="text-ink-muted dark:text-tavern-muted text-sm">Loading editor...</p>
				</div>
			</div>
		{:then Editor}
			<Editor.default
				content={editorState.content}
				onchange={(v) => editorState.setContent(v)}
				onviewready={handleViewReady}
			/>
		{/await}

		<EditorStatusBar />
	</div>
{:else}
	<div class="flex items-center justify-center h-full">
		<div class="text-center py-16">
			<p class="text-lg text-ink-muted dark:text-tavern-muted mb-2">Note not found</p>
			<a href={resolve('/notes')} class="text-accent dark:text-tavern-accent hover:text-accent-hover dark:hover:text-tavern-accent-hover text-sm">
				Back to notes
			</a>
		</div>
	</div>
{/if}
