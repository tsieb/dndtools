<script lang="ts">
	import { notesState } from '$lib/state/notes.svelte.js';
	import { vaultState } from '$lib/state/vault.svelte.js';
	import { mapsState } from '$lib/state/maps.svelte.js';
	import { playerModeState } from '$lib/state/player-mode.svelte.js';
	import { settingsStorageState } from '$lib/state/settings-storage.svelte.js';
	import { templateLibraryState } from '$lib/state/template-library.svelte.js';
	import NoteCard from '$lib/ui/common/NoteCard.svelte';
	import TemplateDialog from '$lib/ui/common/TemplateDialog.svelte';
	import Button from '$lib/ui/common/Button.svelte';
	import { searchService } from '$lib/domain/search.js';
	import {
		buildTemplateContext,
		getFolderScopedTemplateMatches,
		renderNoteTemplate,
		toNewNoteOverrides,
	} from '$lib/domain/template-automation.js';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { createFolderId } from '$lib/types/note.js';
	import type { NoteTemplate } from '$lib/types/template-library.js';
	import { isNoteVisibleInPlayerMode } from '$lib/domain/visibility.js';
	import { notesInMapScope } from '$lib/domain/map-atlas.js';

	let sortField = $state<'updatedAt' | 'title' | 'createdAt' | 'folder'>('updatedAt');
	let sortDir = $state<'asc' | 'desc'>('desc');
	let query = $state('');
	let templateDialogOpen = $state(false);
	let templateCandidates = $state<readonly NoteTemplate[]>([]);

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
			notes = notes.filter((n) => n.tags.includes(tagFilter!));
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
	let mapFilterLabel = $derived.by(() => {
		if (!mapFilter) return null;
		return mapsState.mapById[mapFilter]?.name ?? mapFilter;
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
		goto(resolve(`/notes/${note.id}/edit`));
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
		goto(resolve(`/notes/${note.id}/edit`));
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
		void mapsState.loadAll();
	});
</script>

<div class="p-6 max-w-content mx-auto">
	<div class="flex items-center justify-between mb-6">
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
			<p class="text-sm text-ink-muted dark:text-tavern-muted mt-1">
				{totalCount}
				{totalCount === 1 ? 'note' : 'notes'}
			</p>
		</div>
		{#if !playerModeState.enabled}
			<Button variant="primary" onclick={handleNewNote}>New Note</Button>
		{/if}
	</div>

	<div class="space-y-3 mb-4">
		<div class="relative">
			<input
				type="text"
				bind:value={query}
				placeholder="Filter by title, content, tag, or file path"
				class="w-full pl-10 pr-3 py-2 rounded-md bg-surface dark:bg-tavern-surface border border-border dark:border-tavern-border text-sm text-ink dark:text-tavern-text placeholder:text-ink-faint dark:placeholder:text-tavern-faint"
			/>
			<svg
				class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint dark:text-tavern-faint"
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
		<div class="flex items-center gap-2 flex-wrap text-sm">
			<span class="text-ink-muted dark:text-tavern-muted">Sort:</span>
			<select
				bind:value={sortField}
				aria-label="Sort notes by"
				class="bg-surface dark:bg-tavern-surface border border-border dark:border-tavern-border rounded-md px-2.5 py-1.5 text-sm text-ink dark:text-tavern-text"
			>
				<option value="updatedAt">Last modified</option>
				<option value="createdAt">Created</option>
				<option value="title">Title</option>
				<option value="folder">Folder</option>
			</select>
			<button
				class="w-8 h-8 flex items-center justify-center rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors"
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
				class="bg-surface dark:bg-tavern-surface border border-border dark:border-tavern-border rounded-md px-2.5 py-1.5 text-sm text-ink dark:text-tavern-text"
			>
				<option value="">All folders</option>
				{#each folderOptions as folder (folder)}
					<option value={folder}>{folder}</option>
				{/each}
			</select>
			{#if tagFilter}
				<a
					href={resolve('/notes')}
					class="ml-1 px-2.5 py-1 rounded-md bg-accent-subtle dark:bg-tavern-accent-subtle text-accent dark:text-tavern-accent text-xs hover:bg-accent/20 dark:hover:bg-tavern-accent/20 transition-colors flex items-center gap-1"
				>
					#{tagFilter}
					<span aria-hidden="true">&times;</span>
				</a>
			{/if}
			{#if folderFilter}
				<a
					href={resolve('/notes')}
					class="px-2.5 py-1 rounded-md bg-surface-alt dark:bg-tavern-surface-alt text-ink-muted dark:text-tavern-muted text-xs hover:text-ink dark:hover:text-tavern-text transition-colors flex items-center gap-1"
				>
					{folderFilter}
					<span aria-hidden="true">&times;</span>
				</a>
			{/if}
			{#if mapFilter}
				<a
					href={resolve('/notes')}
					class="px-2.5 py-1 rounded-md bg-surface-alt dark:bg-tavern-surface-alt text-ink-muted dark:text-tavern-muted text-xs hover:text-ink dark:hover:text-tavern-text transition-colors flex items-center gap-1"
				>
					Map: {mapFilterLabel}
					<span aria-hidden="true">&times;</span>
				</a>
			{/if}
		</div>
	</div>

	<!-- Pinned notes -->
	{#if pinnedNotes.length > 0}
		<div class="mb-6">
			<div class="flex items-center gap-2 mb-3">
				<svg
					class="w-3.5 h-3.5 text-accent dark:text-tavern-accent"
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
			<div class="grid gap-3 sm:grid-cols-2">
				{#each pinnedNotes as note (note.id)}
					<NoteCard {note} onclick={(id) => goto(resolve(`/notes/${id}`))} />
				{/each}
			</div>
		</div>
	{/if}

	{#if filteredNotes.length > 0}
		<div class="grid gap-3 sm:grid-cols-2">
			{#each filteredNotes as note (note.id)}
				<NoteCard {note} onclick={(id) => goto(resolve(`/notes/${id}`))} />
			{/each}
		</div>
	{:else if totalCount === 0}
		<div class="text-center py-16">
			<div class="text-4xl mb-4" aria-hidden="true">📝</div>
			<p class="text-ink-muted dark:text-tavern-muted mb-4">No notes yet.</p>
			<Button variant="primary" onclick={handleNewNote}>Create your first note</Button>
		</div>
	{:else}
		<div class="text-center py-16">
			<p class="text-ink-muted dark:text-tavern-muted mb-2">No notes match your current filters.</p>
			<a
				href={resolve('/notes')}
				class="text-sm text-accent dark:text-tavern-accent hover:underline"
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
</div>
