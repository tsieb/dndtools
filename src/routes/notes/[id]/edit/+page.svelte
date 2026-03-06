<script lang="ts">
	import type { EditorView } from '@codemirror/view';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { createNoteId } from '$lib/types/note.js';
	import type { Note } from '$lib/types/note.js';
	import type { TimelineEventObject } from '$lib/types/object.js';
	import { noteToVaultObject } from '$lib/domain/object-notes.js';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { playerModeState } from '$lib/state/player-mode.svelte.js';
	import { editorState } from '$lib/state/editor.svelte.js';
	import { editorPreferencesState } from '$lib/state/editor-preferences.svelte.js';
	import { layoutState } from '$lib/state/layout.svelte.js';
	import { mobileKeyboardState } from '$lib/state/mobile-keyboard.svelte.js';
	import { toastState } from '$lib/state/toast.svelte.js';
	import {
		extractFrontmatter,
		stringifyFrontmatter,
		upsertFrontmatter,
	} from '$lib/markdown/frontmatter.js';
	import {
		analyzeLinkIssues,
		disambiguateWikilinkTarget,
		renameWikilinkTarget,
	} from '$lib/domain/unresolved-links.js';
	import {
		getSessionTimelineEventId,
		isSessionNote,
		SESSION_TIMELINE_LINK_KEYS,
	} from '$lib/domain/session-timeline.js';
	import Button from '$lib/ui/common/Button.svelte';
	import EditorToolbar from '$lib/ui/editor/EditorToolbar.svelte';
	import EditorInsertMenu from '$lib/ui/editor/EditorInsertMenu.svelte';
	import EditorStatusBar from '$lib/ui/editor/EditorStatusBar.svelte';
	import ObjectEmbedMenu from '$lib/ui/editor/ObjectEmbedMenu.svelte';
	import EditorPreviewPane from '$lib/ui/editor/EditorPreviewPane.svelte';
	import MetadataEditor from '$lib/ui/editor/MetadataEditor.svelte';
	import ObjectStructuredEditor from '$lib/ui/editor/ObjectStructuredEditor.svelte';
	import UnresolvedLinksPanel from '$lib/ui/editor/UnresolvedLinksPanel.svelte';
	import { isNoteVisibleInPlayerMode } from '$lib/domain/visibility.js';

	const EditorPromise = import('$lib/ui/editor/CodeMirrorEditor.svelte');
	type TimelineEventCandidate = { note: Note; object: TimelineEventObject };

	const noteId = $derived(createNoteId(page.params.id ?? ''));
	let rawNote = $derived(notesState.getNoteById(noteId));
	let note = $derived.by(() => {
		if (!rawNote) return null;
		if (!playerModeState.enabled) return rawNote;
		return isNoteVisibleInPlayerMode(rawNote) ? rawNote : null;
	});
	let editorView = $state<EditorView | null>(null);
	let editorScrollEl = $state<HTMLElement | null>(null);
	let previewScrollEl = $state<HTMLDivElement | null>(null);
	let syncingFrom = $state<'editor' | 'preview' | null>(null);

	let frontmatter = $derived(extractFrontmatter(editorState.content).frontmatter);
	let linkIssues = $derived(analyzeLinkIssues(editorState.content, notesState.activeNotes));
	let unresolved = $derived(linkIssues.unresolved);
	let ambiguous = $derived(linkIssues.ambiguous);
	let wikilinkHighlights = $derived.by<
		Array<{ from: number; to: number; kind: 'unresolved' | 'ambiguous' }>
	>(() => [
		...unresolved.flatMap((entry) =>
			entry.ranges.map((range) => ({ ...range, kind: 'unresolved' as const })),
		),
		...ambiguous.flatMap((entry) =>
			entry.ranges.map((range) => ({ ...range, kind: 'ambiguous' as const })),
		),
	]);
	let editorSettings = $derived(editorPreferencesState.settings);
	let timelineEventCandidates = $derived.by<TimelineEventCandidate[]>(() => {
		const candidates: TimelineEventCandidate[] = [];
		for (const entry of notesState.activeNotes) {
			const object = noteToVaultObject(entry);
			if (!object || object.type !== 'timeline_event') continue;
			candidates.push({ note: entry, object });
		}
		candidates.sort((a, b) => b.note.updatedAt.localeCompare(a.note.updatedAt));
		return candidates;
	});
	let linkedTimelineEventId = $derived(getSessionTimelineEventId(frontmatter));
	let linkedTimelineEvent = $derived.by(
		() =>
			timelineEventCandidates.find((entry) => String(entry.note.id) === linkedTimelineEventId) ??
			null,
	);
	let sessionTimelineEligible = $derived(
		note ? isSessionNote({ tags: note.tags, frontmatter }) : false,
	);
	let editorSettingsKey = $derived(
		JSON.stringify({
			fontSize: editorSettings.fontSize,
			lineHeight: editorSettings.lineHeight,
			wordWrap: editorSettings.wordWrap,
		}),
	);
	let dockEditorToolbar = $derived(layoutState.isCompact && mobileKeyboardState.keyboardOpen);

	$effect(() => {
		if (note && editorState.noteId !== note.id) {
			editorState.load(note);
		}
	});

	$effect(() => {
		if (!editorScrollEl || !previewScrollEl) return;
		const editorEl = editorScrollEl;
		const previewEl = previewScrollEl;

		const sync = (source: HTMLElement, target: HTMLElement, origin: 'editor' | 'preview') => {
			if (syncingFrom && syncingFrom !== origin) return;
			const sourceMax = source.scrollHeight - source.clientHeight;
			const targetMax = target.scrollHeight - target.clientHeight;
			if (sourceMax <= 0 || targetMax <= 0) return;

			syncingFrom = origin;
			target.scrollTop = (source.scrollTop / sourceMax) * targetMax;
			requestAnimationFrame(() => {
				if (syncingFrom === origin) syncingFrom = null;
			});
		};

		const onEditorScroll = () => sync(editorEl, previewEl, 'editor');
		const onPreviewScroll = () => sync(previewEl, editorEl, 'preview');

		editorEl.addEventListener('scroll', onEditorScroll);
		previewEl.addEventListener('scroll', onPreviewScroll);
		return () => {
			editorEl.removeEventListener('scroll', onEditorScroll);
			previewEl.removeEventListener('scroll', onPreviewScroll);
		};
	});

	function handleKeydown(event: KeyboardEvent): void {
		const mod = event.ctrlKey || event.metaKey;
		if (mod && event.key === 's') {
			event.preventDefault();
			void editorState.save().then(() => {
				toastState.success('Note saved');
			});
			return;
		}
		if (mod && event.key === 'Enter') {
			event.preventDefault();
			void handleDone();
		}
	}

	async function handleDone(): Promise<void> {
		if (editorState.dirty) {
			await editorState.save();
		}
		if (notesState.discardDraftIfUntouched(noteId)) {
			goto(resolve('/knowledge/notes'));
			return;
		}
		goto(resolve(`/knowledge/notes/${noteId}`));
	}

	function handleViewReady(view: EditorView): void {
		editorView = view;
	}

	function handleMetadataApply(updates: Record<string, unknown>): void {
		editorState.setContent(upsertFrontmatter(editorState.content, updates));
		toastState.success('Metadata updated');
	}

	function replaceFrontmatter(nextFrontmatter: Record<string, unknown>): void {
		const parsed = extractFrontmatter(editorState.content);
		const frontmatterBlock = stringifyFrontmatter(nextFrontmatter);
		editorState.setContent(frontmatterBlock ? `${frontmatterBlock}${parsed.body}` : parsed.body);
	}

	function linkTimelineEvent(eventId: string): void {
		if (!eventId.trim()) return;
		const parsed = extractFrontmatter(editorState.content);
		const nextFrontmatter: Record<string, unknown> = {
			...parsed.frontmatter,
			timelineEventId: eventId,
		};
		for (const key of SESSION_TIMELINE_LINK_KEYS) {
			if (key === 'timelineEventId') continue;
			if (key in nextFrontmatter) delete nextFrontmatter[key];
		}
		replaceFrontmatter(nextFrontmatter);
		toastState.success('Linked session note to timeline event');
	}

	function clearTimelineEventLink(): void {
		const parsed = extractFrontmatter(editorState.content);
		const nextFrontmatter: Record<string, unknown> = { ...parsed.frontmatter };
		for (const key of SESSION_TIMELINE_LINK_KEYS) {
			if (key in nextFrontmatter) delete nextFrontmatter[key];
		}
		replaceFrontmatter(nextFrontmatter);
		toastState.success('Removed timeline linkage');
	}

	async function createUnresolvedNote(title: string): Promise<void> {
		const existing = notesState.resolveTitle(title);
		if (existing) {
			toastState.success(`"${title}" already exists`);
			return;
		}
		await notesState.createNote({
			title,
			content: `# ${title}\n`,
		});
		toastState.success(`Created "${title}"`);
	}

	async function createAllUnresolvedNotes(): Promise<void> {
		for (const entry of unresolved.filter((candidate) => candidate.targetKind === 'title')) {
			await createUnresolvedNote(entry.title);
		}
	}

	function applyRename(from: string, to: string): void {
		if (!to.trim()) return;
		editorState.setContent(renameWikilinkTarget(editorState.content, from, to));
	}

	function applyDisambiguation(from: string, targetId: string, displayTitle: string): void {
		if (!targetId.trim()) return;
		editorState.setContent(
			disambiguateWikilinkTarget(editorState.content, from, targetId, displayTitle),
		);
	}

	async function updateEditorSetting(
		updates: Partial<typeof editorPreferencesState.settings>,
	): Promise<void> {
		await editorPreferencesState.update(updates);
	}

	async function handleObjectReloaded(): Promise<void> {
		await notesState.loadAll();
		const refreshed = notesState.getNoteById(noteId);
		if (!refreshed) return;
		editorState.load(refreshed);
		toastState.success('Object note synchronized');
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if note && !playerModeState.enabled}
	<div class="mx-auto max-w-[1200px] p-6">
		<h1 class="sr-only">Edit {note.title}</h1>
		<div class="mb-4 flex items-center justify-between">
			<Button variant="ghost" onclick={handleDone}>
				<svg
					class="mr-1 h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
				</svg>
				Done
			</Button>
			<div class="flex items-center gap-2">
				<button
					class="rounded-md px-3 py-1.5 text-sm text-ink-muted transition-colors hover:bg-surface-alt dark:text-tavern-muted dark:hover:bg-tavern-surface-alt"
					title="Save (Ctrl+S)"
					onclick={() => {
						void editorState.save().then(() => toastState.success('Note saved'));
					}}
				>
					Save
				</button>
			</div>
		</div>

		<input
			type="text"
			value={editorState.title}
			oninput={(event) => editorState.setTitle(event.currentTarget.value)}
			class="mb-4 w-full border-none bg-transparent text-2xl font-bold text-ink outline-none placeholder:text-ink-faint dark:text-tavern-text dark:placeholder:text-tavern-faint"
			placeholder="Note title..."
		/>

		<section
			class="mb-3 rounded-lg border border-border bg-surface p-3 dark:border-tavern-border dark:bg-tavern-surface"
		>
			<h2
				class="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint"
			>
				Editor Defaults (Vault)
			</h2>
			<div class="grid gap-2 md:grid-cols-5">
				<label class="text-xs text-ink-muted dark:text-tavern-muted">
					Font
					<input
						type="number"
						min="12"
						max="24"
						value={editorSettings.fontSize}
						onchange={(event) =>
							updateEditorSetting({
								fontSize: Number((event.currentTarget as HTMLInputElement).value),
							})}
						class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-text"
					/>
				</label>
				<label class="text-xs text-ink-muted dark:text-tavern-muted">
					Line Wrap
					<select
						value={String(editorSettings.wordWrap)}
						onchange={(event) =>
							updateEditorSetting({
								wordWrap: (event.currentTarget as HTMLSelectElement).value === 'true',
							})}
						class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-text"
					>
						<option value="true">Enabled</option>
						<option value="false">Off</option>
					</select>
				</label>
				<label class="text-xs text-ink-muted dark:text-tavern-muted">
					Vim
					<select
						value={String(editorSettings.vimMode)}
						onchange={(event) =>
							updateEditorSetting({
								vimMode: (event.currentTarget as HTMLSelectElement).value === 'true',
							})}
						class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-text"
					>
						<option value="false">Disabled</option>
						<option value="true">Enabled</option>
					</select>
				</label>
				<label class="text-xs text-ink-muted dark:text-tavern-muted">
					Toolbar
					<select
						value={editorSettings.toolbarDensity}
						onchange={(event) =>
							updateEditorSetting({
								toolbarDensity: (event.currentTarget as HTMLSelectElement).value as
									| 'compact'
									| 'comfortable',
							})}
						class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-text"
					>
						<option value="comfortable">Comfortable</option>
						<option value="compact">Compact</option>
					</select>
				</label>
				<label class="text-xs text-ink-muted dark:text-tavern-muted">
					Split Pane
					<select
						value={String(editorSettings.splitPane)}
						onchange={(event) =>
							updateEditorSetting({
								splitPane: (event.currentTarget as HTMLSelectElement).value === 'true',
							})}
						class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-text"
					>
						<option value="true">Editor + Preview</option>
						<option value="false">Editor Only</option>
					</select>
				</label>
			</div>
			<p class="mt-2 text-xs text-ink-faint dark:text-tavern-faint">
				Vim mode preference is stored now; full keybinding support is planned.
			</p>
		</section>

		<MetadataEditor {frontmatter} onapply={handleMetadataApply} />
		{#if sessionTimelineEligible}
			<section
				class="mb-3 rounded-lg border border-border bg-surface p-3 dark:border-tavern-border dark:bg-tavern-surface"
			>
				<h2
					class="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint"
				>
					Session Timeline Link
				</h2>
				<p class="text-xs text-ink-muted dark:text-tavern-muted">
					Session notes can link to timeline events. If no link exists, saving auto-creates one from
					this note's world date metadata.
				</p>
				<div class="mt-2 flex flex-wrap items-center gap-2">
					<select
						aria-label="Link session note to existing timeline event"
						class="min-w-[220px] rounded border border-border bg-surface-alt px-2 py-1.5 text-sm text-ink dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-text"
						value={linkedTimelineEventId ?? ''}
						onchange={(event) =>
							linkTimelineEvent((event.currentTarget as HTMLSelectElement).value)}
					>
						<option value="">Link to existing timeline event...</option>
						{#each timelineEventCandidates as candidate (candidate.note.id)}
							<option value={candidate.note.id}>{candidate.note.title}</option>
						{/each}
					</select>
					{#if linkedTimelineEventId}
						<button
							type="button"
							class="rounded border border-border px-2 py-1 text-xs text-ink-muted hover:bg-surface-alt dark:border-tavern-border dark:text-tavern-muted dark:hover:bg-tavern-surface-alt"
							onclick={clearTimelineEventLink}
						>
							Clear link
						</button>
					{/if}
				</div>
				{#if linkedTimelineEvent}
					<p class="mt-2 text-xs text-ink-muted dark:text-tavern-muted">
						Linked event:
						<a
							href={resolve(`/knowledge/notes/${linkedTimelineEvent.note.id}`)}
							class="text-accent hover:underline dark:text-tavern-accent"
						>
							{linkedTimelineEvent.note.title}
						</a>
					</p>
				{/if}
			</section>
		{/if}
		<ObjectStructuredEditor {note} onreloaded={handleObjectReloaded} />
		<UnresolvedLinksPanel
			{unresolved}
			{ambiguous}
			oncreateone={(title) => void createUnresolvedNote(title)}
			oncreateall={() => void createAllUnresolvedNotes()}
			onrename={applyRename}
			ondisambiguate={applyDisambiguation}
		/>

		<div
			class="editor-toolbar-shell {dockEditorToolbar ? 'editor-toolbar-shell--docked' : ''}"
			data-testid="mobile-editor-toolbar"
		>
			<EditorToolbar {editorView} density={editorSettings.toolbarDensity} />
		</div>
		{#if dockEditorToolbar}
			<div class="h-14" aria-hidden="true"></div>
		{/if}
		<EditorInsertMenu {editorView} />
		<ObjectEmbedMenu {editorView} />

		<div
			class={`grid gap-3 ${editorSettings.splitPane ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}
		>
			<div class="min-h-[500px]">
				{#await EditorPromise}
					<div
						class="flex min-h-[500px] w-full items-center justify-center rounded-lg border border-border bg-surface dark:border-tavern-border dark:bg-tavern-surface"
					>
						<div class="text-center">
							<div
								class="mb-2 inline-block h-5 w-5 animate-spin rounded-full border-2 border-accent/30 border-t-accent dark:border-tavern-accent/30 dark:border-t-tavern-accent"
							></div>
							<p class="text-sm text-ink-muted dark:text-tavern-muted">Loading editor...</p>
						</div>
					</div>
				{:then Editor}
					{#key editorSettingsKey}
						<Editor.default
							content={editorState.content}
							onchange={(value) => editorState.setContent(value)}
							onviewready={handleViewReady}
							onscrollready={(element: HTMLElement) => (editorScrollEl = element)}
							settings={editorSettings}
							{wikilinkHighlights}
						/>
					{/key}
				{/await}
			</div>

			{#if editorSettings.splitPane}
				<div class="min-h-[500px]">
					<EditorPreviewPane
						content={editorState.content}
						oncontainerready={(element) => (previewScrollEl = element)}
					/>
				</div>
			{/if}
		</div>

		<EditorStatusBar />
	</div>
{:else}
	<div class="flex h-full items-center justify-center">
		<div class="py-16 text-center">
			<p class="mb-2 text-lg text-ink-muted dark:text-tavern-muted">
				{playerModeState.enabled ? 'Editing is disabled in player mode.' : 'Note not found'}
			</p>
			<a
				href={resolve(playerModeState.enabled ? '/player' : '/knowledge/notes')}
				class="text-sm text-accent hover:text-accent-hover dark:text-tavern-accent dark:hover:text-tavern-accent-hover"
			>
				{playerModeState.enabled ? 'Back to player view' : 'Back to notes'}
			</a>
		</div>
	</div>
{/if}

<style>
	.editor-toolbar-shell {
		position: relative;
	}

	.editor-toolbar-shell--docked {
		position: fixed;
		left: 0.75rem;
		right: 0.75rem;
		bottom: calc(var(--dndtools-keyboard-inset, 0px) + 0.35rem);
		z-index: 35;
		padding-top: 0.25rem;
		background: color-mix(in srgb, var(--color-surface) 86%, transparent);
		border-radius: 0.75rem;
	}

	:global(html.dark) .editor-toolbar-shell--docked {
		background: color-mix(in srgb, var(--color-tavern-surface) 88%, transparent);
	}
</style>
