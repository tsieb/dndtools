<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { notesInMapScope } from '$lib/domain/map-atlas.js';
	import { searchService } from '$lib/domain/search.js';
	import {
		buildTemplateContext,
		getFolderScopedTemplateMatches,
		renderNoteTemplate,
		toNewNoteOverrides,
	} from '$lib/domain/template-automation.js';
	import { isNoteVisibleInPlayerMode } from '$lib/domain/visibility.js';
	import { showDesktopNativeContextMenu } from '$lib/platform/desktop/bridge.js';
	import { layoutState } from '$lib/state/layout.svelte.js';
	import { mapsState } from '$lib/state/maps.svelte.js';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { playerModeState } from '$lib/state/player-mode.svelte.js';
	import { settingsStorageState } from '$lib/state/settings-storage.svelte.js';
	import { templateLibraryState } from '$lib/state/template-library.svelte.js';
	import { toastState } from '$lib/state/toast.svelte.js';
	import { vaultState } from '$lib/state/vault.svelte.js';
	import { createFolderId, createNoteId, type NoteId } from '$lib/types/note.js';
	import type { NoteTemplate } from '$lib/types/template-library.js';
	import ConfirmDialog from '$lib/ui/common/ConfirmDialog.svelte';
	import NoteCard from '$lib/ui/common/NoteCard.svelte';
	import TemplateDialog from '$lib/ui/common/TemplateDialog.svelte';
	import Button from '$lib/ui/common/Button.svelte';
	import NoteViewer from '$lib/ui/viewer/NoteViewer.svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';

	let sortField = $state<'updatedAt' | 'title' | 'createdAt' | 'folder'>('updatedAt');
	let sortDir = $state<'asc' | 'desc'>('desc');
	let query = $state('');
	let templateDialogOpen = $state(false);
	let templateCandidates = $state<readonly NoteTemplate[]>([]);
	let quickDeleteNoteId = $state<NoteId | null>(null);
	let quickDeletePending = $state(false);

	let tagFilter = $derived(page.url.searchParams.get('tag'));
	let folderFilter = $derived(page.url.searchParams.get('folder'));
	let mapFilter = $derived(page.url.searchParams.get('mapId'));
	let createTitle = $derived(page.url.searchParams.get('create'));
	let handledCreateTitle = $state<string | null>(null);

	let normalizedQuery = $derived(query.trim());
	let modeScopedNotes = $derived.by(() =>
		playerModeState.enabled
			? notesState.activeNotes.filter((note) => isNoteVisibleInPlayerMode(note))
			: notesState.activeNotes,
	);
	let modeScopedPinnedNotes = $derived.by(() =>
		playerModeState.enabled
			? notesState.pinnedNotes.filter((note) => isNoteVisibleInPlayerMode(note))
			: notesState.pinnedNotes,
	);
	let searchResultIds = $derived.by<Set<string> | null>(() => {
		if (!normalizedQuery) return null;
		return new Set(searchService.search(normalizedQuery).map((result) => String(result.id)));
	});
	let mapScopedNotes = $derived.by(() => {
		if (!mapFilter) return modeScopedNotes;
		return notesInMapScope(modeScopedNotes, mapsState.maps, mapFilter);
	});

	let pinnedNotes = $derived.by(() => {
		return modeScopedPinnedNotes.filter((note) => {
			if (tagFilter && !note.tags.includes(tagFilter)) return false;
			if (folderFilter && note.folder !== folderFilter) return false;
			if (
				mapFilter &&
				!mapScopedNotes.some((candidate) => String(candidate.id) === String(note.id))
			) {
				return false;
			}
			return !searchResultIds || searchResultIds.has(String(note.id));
		});
	});

	let filteredNotes = $derived.by(() => {
		let notes = mapScopedNotes.filter((n) => !n.pinned);

		if (tagFilter) {
			notes = notes.filter((n) => n.tags.includes(tagFilter));
		}

		if (folderFilter) {
			notes = notes.filter((n) => n.folder === folderFilter);
		}

		if (searchResultIds) {
			notes = notes.filter((note) => searchResultIds.has(String(note.id)));
		}

		return [...notes].sort((a, b) => {
			const aVal = sortField === 'folder' ? String(a.folder) : String(a[sortField]);
			const bVal = sortField === 'folder' ? String(b.folder) : String(b[sortField]);
			const cmp =
				sortField === 'updatedAt' || sortField === 'createdAt'
					? aVal.localeCompare(bVal)
					: aVal.localeCompare(bVal, undefined, { sensitivity: 'base' });
			return sortDir === 'asc' ? cmp : -cmp;
		});
	});

	let folderOptions = $derived(
		(playerModeState.enabled
			? [...new Set(modeScopedNotes.map((note) => String(note.folder)))]
			: vaultState.folders.map((folder) => folder.id)
		)
			.filter((folder) => folder !== '/')
			.sort((a, b) => a.localeCompare(b)),
	);

	let totalCount = $derived(pinnedNotes.length + filteredNotes.length);
	let showListSkeleton = $derived(notesState.loading && notesState.notes.length === 0);
	let mapFilterLabel = $derived.by(() => {
		if (!mapFilter) return null;
		return mapsState.mapById[mapFilter]?.name ?? mapFilter;
	});
	let quickDeleteNote = $derived.by(() =>
		quickDeleteNoteId ? notesState.getNoteById(quickDeleteNoteId) : null,
	);
	let mediumSplitActive = $derived(layoutState.isMedium);
	let mediumSelectedNoteId = $derived(page.url.searchParams.get('note'));
	let mediumSelectedNote = $derived.by(() => {
		if (!mediumSplitActive || !mediumSelectedNoteId) return null;
		const selected = notesState.getActiveNoteById(createNoteId(mediumSelectedNoteId));
		if (!selected) return null;
		if (playerModeState.enabled && !isNoteVisibleInPlayerMode(selected)) return null;
		return selected;
	});

	function shouldAdvanceSessionCounter(templateId: string): boolean {
		return (
			templateId === 'session' || templateId === 'session-prep' || templateId === 'session-recap'
		);
	}

	function normalizeFolderContext(folder: string | null | undefined): string | null {
		if (!folder) return null;
		const normalized = folder.trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
		return normalized ? `/${normalized}` : '/';
	}

	async function createFromTemplate(
		template: NoteTemplate,
		folderOverride?: string,
	): Promise<void> {
		const [setting, worldCalendar] = await Promise.all([
			settingsStorageState.getTemplateContext(),
			settingsStorageState.getWorldCalendar(),
		]);
		const context = buildTemplateContext(setting, new Date(), { worldCalendar });
		const rendered = renderNoteTemplate(template, context, folderOverride);
		const note = await notesState.createNote(toNewNoteOverrides(rendered));
		if (shouldAdvanceSessionCounter(template.id)) {
			await settingsStorageState.saveTemplateContext({
				...setting,
				sessionNumber: context.sessionNumber + 1,
			});
		}
		goto(resolve(`/knowledge/notes/${note.id}/edit`));
	}

	async function handleNewNote(): Promise<void> {
		if (playerModeState.enabled) return;
		const title = createTitle ?? undefined;
		const folderContext = normalizeFolderContext(folderFilter);
		if (!title) {
			const matches = getFolderScopedTemplateMatches(templateLibraryState.templates, folderContext);
			if (matches.length === 1) {
				await createFromTemplate(matches[0]!, folderContext ?? undefined);
				return;
			}
			if (matches.length > 1) {
				templateCandidates = matches;
				templateDialogOpen = true;
				return;
			}
		}

		const note = await notesState.createNote({
			...(title ? { title } : {}),
			...(folderContext ? { folder: createFolderId(folderContext) } : {}),
		});
		goto(resolve(`/knowledge/notes/${note.id}/edit`));
	}

	async function handleTemplateCreate(
		template: NoteTemplate,
		folderOverride?: string,
	): Promise<void> {
		templateDialogOpen = false;
		await createFromTemplate(
			template,
			folderOverride ?? normalizeFolderContext(folderFilter) ?? undefined,
		);
	}

	$effect(() => {
		if (createTitle && handledCreateTitle !== createTitle) {
			handledCreateTitle = createTitle;
			void handleNewNote();
			return;
		}
		if (!createTitle) handledCreateTitle = null;
	});

	$effect(() => {
		if (!mapsState.loaded && !mapsState.loading) {
			void mapsState.loadAll();
		}
	});

	async function handleQuickPin(noteId: NoteId): Promise<void> {
		const pinned = await notesState.togglePin(noteId);
		if (pinned === null) return;
		toastState.success(pinned ? 'Note pinned' : 'Note unpinned');
	}

	function openNote(noteId: NoteId): void {
		if (mediumSplitActive) {
			const targetPath = resolve('/knowledge/notes');
			const searchParams = new SvelteURLSearchParams(page.url.searchParams);
			searchParams.set('note', String(noteId));
			searchParams.delete('create');
			const query = searchParams.toString();
			goto(query ? `${targetPath}?${query}` : targetPath, { keepFocus: true, noScroll: true });
			return;
		}
		goto(resolve(`/knowledge/notes/${noteId}`));
	}

	function clearMediumSelection(): void {
		if (!mediumSplitActive) return;
		const searchParams = new SvelteURLSearchParams(page.url.searchParams);
		searchParams.delete('note');
		const query = searchParams.toString();
		goto(query ? `${page.url.pathname}?${query}` : page.url.pathname, {
			replaceState: true,
			keepFocus: true,
			noScroll: true,
		});
	}

	function requestQuickDelete(noteId: NoteId): void {
		quickDeleteNoteId = noteId;
	}

	async function confirmQuickDelete(): Promise<void> {
		if (!quickDeleteNoteId || quickDeletePending) return;
		quickDeletePending = true;
		const deletingId = quickDeleteNoteId;
		const deletingTitle = notesState.getNoteById(deletingId)?.title ?? 'Note';
		try {
			await notesState.deleteNote(deletingId);
			toastState.success(`"${deletingTitle}" moved to trash`);
			quickDeleteNoteId = null;
		} finally {
			quickDeletePending = false;
		}
	}

	async function handleNoteContextRequest(noteId: NoteId, event: MouseEvent): Promise<void> {
		if (typeof window === 'undefined' || !window.dndtoolsDesktop) return;
		const note = notesState.getNoteById(noteId);
		if (!note) return;
		const availableFolders = [...new Set(['/', String(note.folder), ...folderOptions])].sort(
			(a, b) => a.localeCompare(b),
		);
		const result = await showDesktopNativeContextMenu({
			kind: 'note',
			noteId: String(note.id),
			noteTitle: note.title,
			pinned: note.pinned,
			folder: String(note.folder),
			availableFolders,
			x: Math.round(event.clientX),
			y: Math.round(event.clientY),
		});
		if (!result) return;

		if (result.action === 'open') {
			openNote(note.id);
			return;
		}
		if (result.action === 'toggle-pin') {
			await handleQuickPin(note.id);
			return;
		}
		if (result.action === 'delete') {
			requestQuickDelete(note.id);
			return;
		}
		if (result.action === 'move' && result.folder !== String(note.folder)) {
			await notesState.updateNote(note.id, { folder: createFolderId(result.folder) });
			toastState.success(
				`Moved "${note.title}" to ${result.folder === '/' ? 'Root' : result.folder}`,
			);
		}
	}
</script>

<div class={mediumSplitActive ? 'h-full min-h-0 p-4' : 'mx-auto max-w-content p-6'}>
	<div
		class={mediumSplitActive
			? 'grid h-full min-h-0 grid-cols-[minmax(17rem,38%)_minmax(0,1fr)] gap-4'
			: ''}
		data-testid={mediumSplitActive ? 'knowledge-medium-split' : undefined}
	>
		<section
			class={mediumSplitActive
				? 'min-h-0 overflow-y-auto rounded-lg border border-border bg-surface p-4 dark:border-tavern-border dark:bg-tavern-surface'
				: ''}
		>
			<div class="mb-6 flex items-center justify-between">
				<div>
					<h1
						class="text-2xl font-bold text-ink dark:text-tavern-text"
						style="font-family: var(--font-serif)"
					>
						{#if tagFilter}
							Notes tagged "{tagFilter}"
						{:else if playerModeState.enabled}
							Player Notes
						{:else}
							All Notes
						{/if}
					</h1>
					<p class="mt-1 text-sm text-ink-muted dark:text-tavern-muted">
						{totalCount}
						{totalCount === 1 ? 'note' : 'notes'}
					</p>
				</div>
				{#if !playerModeState.enabled}
					<Button variant="primary" onclick={handleNewNote}>New Note</Button>
				{/if}
			</div>

			<div class="mb-4 space-y-3">
				<div class="relative">
					<input
						type="text"
						bind:value={query}
						placeholder="Filter by title, content, tag, or file path"
						class="w-full rounded-md border border-border bg-surface py-2 pl-10 pr-3 text-sm text-ink placeholder:text-ink-faint dark:border-tavern-border dark:bg-tavern-surface dark:text-tavern-text dark:placeholder:text-tavern-faint"
					/>
					<svg
						class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint dark:text-tavern-faint"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
						/>
					</svg>
				</div>
				<div class="flex flex-wrap items-center gap-2 text-sm">
					<span class="text-ink-muted dark:text-tavern-muted">Sort:</span>
					<select
						bind:value={sortField}
						aria-label="Sort notes by"
						class="rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-ink dark:border-tavern-border dark:bg-tavern-surface dark:text-tavern-text"
					>
						<option value="updatedAt">Last modified</option>
						<option value="createdAt">Created</option>
						<option value="title">Title</option>
						<option value="folder">Folder</option>
					</select>
					<button
						class="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-surface-alt dark:border-tavern-border dark:bg-tavern-surface dark:text-tavern-muted dark:hover:bg-tavern-surface-alt"
						onclick={() => (sortDir = sortDir === 'asc' ? 'desc' : 'asc')}
						title="Toggle sort direction"
						aria-label="Sort {sortDir === 'asc' ? 'descending' : 'ascending'}"
					>
						{sortDir === 'asc' ? '\u2191' : '\u2193'}
					</button>
					<select
						aria-label="Filter notes by folder"
						onchange={(event) => {
							const value = event.currentTarget.value;
							const next = new URL(page.url);
							if (value) next.searchParams.set('folder', value);
							else next.searchParams.delete('folder');
							goto(next.pathname + next.search, { replaceState: true });
						}}
						value={folderFilter ?? ''}
						class="rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-ink dark:border-tavern-border dark:bg-tavern-surface dark:text-tavern-text"
					>
						<option value="">All folders</option>
						{#each folderOptions as folder (folder)}
							<option value={folder}>{folder}</option>
						{/each}
					</select>
					{#if tagFilter}
						<a
							href={resolve('/knowledge/notes')}
							class="ml-1 flex items-center gap-1 rounded-md bg-accent-subtle px-2.5 py-1 text-xs text-accent transition-colors hover:bg-accent/20 dark:bg-tavern-accent-subtle dark:text-tavern-accent dark:hover:bg-tavern-accent/20"
						>
							#{tagFilter}
							<span aria-hidden="true">&times;</span>
						</a>
					{/if}
					{#if folderFilter}
						<a
							href={resolve('/knowledge/notes')}
							class="flex items-center gap-1 rounded-md bg-surface-alt px-2.5 py-1 text-xs text-ink-muted transition-colors hover:text-ink dark:bg-tavern-surface-alt dark:text-tavern-muted dark:hover:text-tavern-text"
						>
							{folderFilter}
							<span aria-hidden="true">&times;</span>
						</a>
					{/if}
					{#if mapFilter}
						<a
							href={resolve('/knowledge/notes')}
							class="flex items-center gap-1 rounded-md bg-surface-alt px-2.5 py-1 text-xs text-ink-muted transition-colors hover:text-ink dark:bg-tavern-surface-alt dark:text-tavern-muted dark:hover:text-tavern-text"
						>
							Map: {mapFilterLabel}
							<span aria-hidden="true">&times;</span>
						</a>
					{/if}
				</div>
			</div>

			{#if pinnedNotes.length > 0}
				<div class="mb-6">
					<div class="mb-3 flex items-center gap-2">
						<svg
							class="h-3.5 w-3.5 text-accent dark:text-tavern-accent"
							fill="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
							/>
						</svg>
						<span
							class="text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint"
							>Pinned</span
						>
					</div>
					<div class="grid gap-3 {mediumSplitActive ? '' : 'sm:grid-cols-2'}">
						{#each pinnedNotes as note (note.id)}
							<NoteCard
								{note}
								onclick={(id) => openNote(id)}
								onpin={(id) => void handleQuickPin(id)}
								ondelete={requestQuickDelete}
								oncontextrequest={(id, event) => void handleNoteContextRequest(id, event)}
							/>
						{/each}
					</div>
				</div>
			{/if}

			{#if showListSkeleton}
				<div class="grid gap-3 {mediumSplitActive ? '' : 'sm:grid-cols-2'}">
					{#each Array(8) as _, i (`skeleton-${i}`)}
						<div
							class="rounded-lg border border-border/60 bg-surface p-4 dark:border-tavern-border/60 dark:bg-tavern-surface"
						>
							<div
								class="mb-3 h-5 w-2/3 animate-pulse rounded bg-border/50 dark:bg-tavern-border/50"
							></div>
							<div
								class="mb-2 h-3 w-full animate-pulse rounded bg-border/50 dark:bg-tavern-border/50"
							></div>
							<div
								class="mb-3 h-3 w-4/5 animate-pulse rounded bg-border/50 dark:bg-tavern-border/50"
							></div>
							<div class="flex gap-2">
								<div
									class="h-5 w-16 animate-pulse rounded-full bg-border/50 dark:bg-tavern-border/50"
								></div>
								<div
									class="h-5 w-20 animate-pulse rounded-full bg-border/50 dark:bg-tavern-border/50"
								></div>
							</div>
						</div>
					{/each}
				</div>
			{:else if filteredNotes.length > 0}
				<div class="grid gap-3 {mediumSplitActive ? '' : 'sm:grid-cols-2'}">
					{#each filteredNotes as note (note.id)}
						<NoteCard
							{note}
							onclick={(id) => openNote(id)}
							onpin={(id) => void handleQuickPin(id)}
							ondelete={requestQuickDelete}
							oncontextrequest={(id, event) => void handleNoteContextRequest(id, event)}
						/>
					{/each}
				</div>
			{:else if totalCount === 0}
				<div class="py-16 text-center">
					<p class="mb-4 text-ink-muted dark:text-tavern-muted">No notes yet.</p>
					<Button variant="primary" onclick={handleNewNote}>Create your first note</Button>
				</div>
			{:else}
				<div class="py-16 text-center">
					<p class="mb-2 text-ink-muted dark:text-tavern-muted">
						No notes match your current filters.
					</p>
					<a
						href={resolve('/knowledge/notes')}
						class="text-sm text-accent hover:underline dark:text-tavern-accent"
					>
						Clear filters
					</a>
				</div>
			{/if}

			<TemplateDialog
				open={templateDialogOpen}
				activeFolder={folderFilter}
				folderOverride={normalizeFolderContext(folderFilter)}
				templates={templateCandidates}
				onclose={() => (templateDialogOpen = false)}
				oncreate={handleTemplateCreate}
			/>
			<ConfirmDialog
				open={quickDeleteNoteId !== null}
				title="Delete Note"
				message={`Are you sure you want to delete "${quickDeleteNote?.title ?? 'this note'}"? It will be moved to trash.`}
				confirmText="Delete"
				confirmLoading={quickDeletePending}
				onconfirm={() => void confirmQuickDelete()}
				oncancel={() => {
					if (quickDeletePending) return;
					quickDeleteNoteId = null;
				}}
			/>
		</section>

		{#if mediumSplitActive}
			<aside
				class="min-h-0 overflow-hidden rounded-lg border border-border bg-surface dark:border-tavern-border dark:bg-tavern-surface"
				aria-label="Knowledge note preview"
				data-testid="knowledge-medium-detail"
			>
				{#if mediumSelectedNote}
					<div class="flex h-full min-h-0 flex-col">
						<div
							class="flex items-center justify-between gap-2 border-b border-border px-4 py-3 dark:border-tavern-border"
						>
							<div class="min-w-0">
								<p class="truncate text-sm font-semibold text-ink dark:text-tavern-text">
									{mediumSelectedNote.title}
								</p>
								<p class="truncate text-xs text-ink-muted dark:text-tavern-muted">
									{mediumSelectedNote.folder}
								</p>
							</div>
							<div class="flex items-center gap-1.5">
								{#if !playerModeState.enabled}
									<button
										type="button"
										class="rounded-md border border-border px-2 py-1 text-xs text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-surface-alt dark:border-tavern-border dark:text-tavern-muted dark:hover:bg-tavern-surface-alt"
										onclick={() => goto(resolve(`/knowledge/notes/${mediumSelectedNote.id}/edit`))}
									>
										Edit
									</button>
								{/if}
								<button
									type="button"
									class="rounded-md border border-border px-2 py-1 text-xs text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-surface-alt dark:border-tavern-border dark:text-tavern-muted dark:hover:bg-tavern-surface-alt"
									onclick={clearMediumSelection}
									aria-label="Clear selected note"
								>
									Close
								</button>
							</div>
						</div>
						<div class="knowledge-medium-note-pane min-h-0 flex-1 overflow-y-auto p-4">
							<NoteViewer note={mediumSelectedNote} />
						</div>
					</div>
				{:else}
					<div class="flex h-full items-center justify-center p-8 text-center">
						<div class="max-w-xs space-y-2">
							<p class="text-base font-semibold text-ink dark:text-tavern-text">
								Select a note to read it
							</p>
							<p class="text-sm text-ink-muted dark:text-tavern-muted">
								Choose a note from the list to preview its content here.
							</p>
						</div>
					</div>
				{/if}
			</aside>
		{/if}
	</div>
</div>

<style>
	:global(.knowledge-medium-note-pane .markdown-content) {
		max-width: none;
		margin: 0;
	}
</style>
