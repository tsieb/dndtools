<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { searchService, type SearchQueryResult, type SearchResult } from '$lib/domain/search.js';
	import { searchState } from '$lib/state/search.svelte.js';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { formatRelativeDate } from '$lib/utils/date.js';

	let query = $state('');
	let response = $state<SearchQueryResult | null>(null);
	let searchTimeout: ReturnType<typeof setTimeout> | null = null;
	let searching = $state(false);
	let inputRef: HTMLInputElement | undefined = $state();

	let selectedTags = $state<string[]>([]);
	let selectedFolders = $state<string[]>([]);
	let selectedTypes = $state<string[]>([]);

	let saveName = $state('');
	let saving = $state(false);
	let saveError = $state<string | null>(null);
	const SEARCH_DEBOUNCE_MS = 50;

	let notesById = $derived(notesState.noteById);

	$effect(() => {
		if (!searchState.loaded && !searchState.loading) {
			void searchState.loadSavedSearches();
		}
	});

	$effect(() => {
		inputRef?.focus();
	});

	$effect(() => {
		return () => {
			if (searchTimeout) {
				clearTimeout(searchTimeout);
			}
		};
	});

	function normalizeList(values: string[]): string[] {
		return [...new Set(values)].sort((a, b) => a.localeCompare(b));
	}

	function clearFacetFilters(): void {
		selectedTags = [];
		selectedFolders = [];
		selectedTypes = [];
	}

	function applyQuery(nextQuery: string): void {
		query = nextQuery;
		selectedTags = [];
		selectedFolders = [];
		selectedTypes = [];
		if (searchTimeout) {
			clearTimeout(searchTimeout);
			searchTimeout = null;
		}

		const normalized = nextQuery.trim();
		if (!normalized) {
			response = null;
			searching = false;
			return;
		}

		searching = true;
		searchTimeout = setTimeout(() => {
			response = searchService.searchDetailed(normalized);
			searching = false;
			searchTimeout = null;
		}, SEARCH_DEBOUNCE_MS);
	}

	function handleInput(event: Event): void {
		applyQuery((event.target as HTMLInputElement).value);
	}

	function toggleFilter(kind: 'tag' | 'folder' | 'type', value: string): void {
		if (kind === 'tag') {
			selectedTags = selectedTags.includes(value)
				? selectedTags.filter((entry) => entry !== value)
				: normalizeList([...selectedTags, value]);
			return;
		}
		if (kind === 'folder') {
			selectedFolders = selectedFolders.includes(value)
				? selectedFolders.filter((entry) => entry !== value)
				: normalizeList([...selectedFolders, value]);
			return;
		}
		selectedTypes = selectedTypes.includes(value)
			? selectedTypes.filter((entry) => entry !== value)
			: normalizeList([...selectedTypes, value]);
	}

	function openResult(result: SearchResult, jumpToAnchor = false): void {
		const notePath = resolve('/notes/[id]', { id: result.id });
		const target = jumpToAnchor && result.anchor ? `${notePath}#${result.anchor}` : notePath;
		goto(target);
	}

	async function saveCurrentSearch(): Promise<void> {
		if (!query.trim()) return;
		saving = true;
		saveError = null;
		try {
			const defaultName = query.trim().slice(0, 48);
			await searchState.saveSearch(saveName.trim() || defaultName, query.trim());
			saveName = '';
		} catch (error) {
			saveError = error instanceof Error ? error.message : String(error);
		} finally {
			saving = false;
		}
	}

	let filteredResults = $derived.by(() => {
		const results = response?.results ?? [];
		return results.filter((result) => {
			if (selectedTags.length > 0) {
				const lower = result.tags.map((tag) => tag.toLowerCase());
				if (!selectedTags.some((tag) => lower.includes(tag.toLowerCase()))) {
					return false;
				}
			}
			if (selectedFolders.length > 0) {
				if (!selectedFolders.includes(result.folder)) {
					return false;
				}
			}
			if (selectedTypes.length > 0) {
				if (!result.type || !selectedTypes.includes(result.type)) {
					return false;
				}
			}
			return true;
		});
	});

	let operatorChips = $derived.by(() => {
		if (!response) return [] as string[];
		const parsed = response.parsed;
		const chips = [
			...parsed.tagFilters.map((tag) => `tag:${tag}`),
			...(parsed.hasTagNoneFilter ? ['tag:none'] : []),
			...parsed.folderFilters.map((folder) => `folder:${folder}`),
			...parsed.typeFilters.map((type) => `type:${type}`),
			...parsed.updatedFilters.map((entry) => `updated:${entry.raw}`),
			...parsed.phrases.map((phrase) => `"${phrase}"`),
		];
		return chips;
	});

	let activeFacetChipCount = $derived(
		selectedTags.length + selectedFolders.length + selectedTypes.length,
	);

	let telemetryLabel = $derived.by(() => {
		const telemetry = response?.telemetry;
		if (!telemetry) return null;
		return `Search ${telemetry.exceededBudget ? 'over budget' : 'within budget'}: ${telemetry.elapsedMs.toFixed(1)}ms (p95 ${telemetry.p95Ms.toFixed(1)}ms, avg ${telemetry.averageMs.toFixed(1)}ms)`;
	});
</script>

<div class="p-6 max-w-[1120px] mx-auto">
	<div class="mb-5">
		<h1
			class="text-2xl font-bold text-ink dark:text-tavern-text"
			style="font-family: var(--font-serif)"
		>
			Search & Discovery
		</h1>
		<p class="text-sm text-ink-muted dark:text-tavern-muted mt-1">
			Use operators like <code>tag:</code>, <code>folder:</code>, <code>type:</code>,
			<code>updated:</code>, and quoted phrases.
		</p>
	</div>

	<div class="relative">
		<svg
			class="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-faint dark:text-tavern-faint pointer-events-none"
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
		<input
			bind:this={inputRef}
			type="text"
			value={query}
			oninput={handleInput}
			placeholder="Search notes..."
			class="w-full pl-11 pr-4 py-3 rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface text-ink dark:text-tavern-text placeholder:text-ink-faint dark:placeholder:text-tavern-faint outline-none focus:border-accent dark:focus:border-tavern-accent text-base transition-colors"
		/>
	</div>

	<div class="flex flex-wrap items-center gap-2 mt-3" aria-live="polite">
		{#if searching}
			<span
				class="px-2 py-1 rounded-md text-xs bg-surface-alt dark:bg-tavern-surface-alt text-ink-muted dark:text-tavern-muted animate-pulse"
				>Searching...</span
			>
		{/if}
		{#if response}
			<span class="text-sm text-ink-muted dark:text-tavern-muted">
				{filteredResults.length}
				{filteredResults.length === 1 ? 'result' : 'results'}
			</span>
			{#if telemetryLabel}
				<span
					class="px-2 py-1 rounded-md text-xs {response.telemetry.exceededBudget
						? 'bg-warning/15 text-warning'
						: 'bg-success/15 text-success'}"
				>
					{telemetryLabel}
				</span>
			{/if}
		{/if}
	</div>

	{#if query.trim()}
		<div class="mt-4 grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
			<aside class="space-y-4">
				<section
					class="rounded-lg border border-border dark:border-tavern-border bg-surface/70 dark:bg-tavern-surface/70 p-3"
				>
					<div class="flex items-center justify-between gap-2 mb-2">
						<h2 class="text-sm font-semibold text-ink dark:text-tavern-text">Saved Searches</h2>
					</div>
					<div class="flex gap-2">
						<input
							type="text"
							bind:value={saveName}
							placeholder="Name this search"
							class="flex-1 min-w-0 px-2.5 py-1.5 rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface text-xs text-ink dark:text-tavern-text"
						/>
						<button
							type="button"
							onclick={saveCurrentSearch}
							disabled={saving || !query.trim()}
							class="px-2.5 py-1.5 rounded-md text-xs bg-accent text-white disabled:opacity-60"
						>
							{saving ? 'Saving...' : 'Save'}
						</button>
					</div>
					{#if saveError}
						<p class="text-xs text-error mt-2">{saveError}</p>
					{/if}

					<div class="mt-3 space-y-1.5">
						{#if searchState.savedSearches.length > 0}
							{#each searchState.savedSearches as saved (saved.id)}
								<div class="flex gap-1.5 items-center">
									<button
										type="button"
										onclick={() => applyQuery(saved.query)}
										class="flex-1 min-w-0 text-left px-2 py-1 rounded-md bg-surface-alt dark:bg-tavern-surface-alt text-xs text-ink dark:text-tavern-text hover:border-accent border border-transparent"
										title={saved.query}
									>
										<div class="truncate">{saved.name}</div>
									</button>
									<button
										type="button"
										onclick={() => searchState.deleteSearch(saved.id)}
										class="px-2 py-1 rounded-md text-xs text-ink-muted dark:text-tavern-muted hover:text-error"
										aria-label={`Delete saved search ${saved.name}`}
									>
										Delete
									</button>
								</div>
							{/each}
						{:else}
							<p class="text-xs text-ink-faint dark:text-tavern-faint">No saved searches yet.</p>
						{/if}
					</div>
				</section>

				<section
					class="rounded-lg border border-border dark:border-tavern-border bg-surface/70 dark:bg-tavern-surface/70 p-3"
				>
					<h2 class="text-sm font-semibold text-ink dark:text-tavern-text mb-2">
						Smart Collections
					</h2>
					<div class="space-y-1.5">
						{#each searchState.smartCollections as collection (collection.id)}
							<button
								type="button"
								onclick={() => applyQuery(collection.query)}
								class="w-full text-left px-2.5 py-2 rounded-md bg-surface-alt dark:bg-tavern-surface-alt hover:border-accent border border-transparent"
							>
								<div class="text-xs font-medium text-ink dark:text-tavern-text">
									{collection.name}
								</div>
								<div class="text-[11px] text-ink-muted dark:text-tavern-muted mt-0.5">
									{collection.description}
								</div>
							</button>
						{/each}
					</div>
				</section>

				{#if response}
					<section
						class="rounded-lg border border-border dark:border-tavern-border bg-surface/70 dark:bg-tavern-surface/70 p-3 space-y-3"
					>
						<div class="flex items-center justify-between">
							<h2 class="text-sm font-semibold text-ink dark:text-tavern-text">Facets</h2>
							<button
								type="button"
								class="text-xs text-ink-muted dark:text-tavern-muted hover:text-ink dark:hover:text-tavern-text"
								onclick={clearFacetFilters}
								disabled={activeFacetChipCount === 0}>Clear</button
							>
						</div>

						<div>
							<p
								class="text-[11px] uppercase tracking-wide text-ink-faint dark:text-tavern-faint mb-1"
							>
								Tags
							</p>
							<div class="flex flex-wrap gap-1.5">
								{#if response.facets.tags.length === 0}
									<span class="text-xs text-ink-faint dark:text-tavern-faint">No tags</span>
								{:else}
									{#each response.facets.tags as facet (facet.value)}
										<button
											type="button"
											onclick={() => toggleFilter('tag', facet.value)}
											class="px-2 py-1 rounded-md text-xs border {selectedTags.includes(facet.value)
												? 'border-accent bg-accent-subtle text-accent dark:border-tavern-accent dark:bg-tavern-accent-subtle dark:text-tavern-accent'
												: 'border-border dark:border-tavern-border text-ink-muted dark:text-tavern-muted'}"
										>
											{facet.value} ({facet.count})
										</button>
									{/each}
								{/if}
							</div>
						</div>

						<div>
							<p
								class="text-[11px] uppercase tracking-wide text-ink-faint dark:text-tavern-faint mb-1"
							>
								Folders
							</p>
							<div class="flex flex-wrap gap-1.5">
								{#if response.facets.folders.length === 0}
									<span class="text-xs text-ink-faint dark:text-tavern-faint">No folders</span>
								{:else}
									{#each response.facets.folders as facet (facet.value)}
										<button
											type="button"
											onclick={() => toggleFilter('folder', facet.value)}
											class="px-2 py-1 rounded-md text-xs border {selectedFolders.includes(
												facet.value,
											)
												? 'border-accent bg-accent-subtle text-accent dark:border-tavern-accent dark:bg-tavern-accent-subtle dark:text-tavern-accent'
												: 'border-border dark:border-tavern-border text-ink-muted dark:text-tavern-muted'}"
										>
											{facet.value} ({facet.count})
										</button>
									{/each}
								{/if}
							</div>
						</div>

						<div>
							<p
								class="text-[11px] uppercase tracking-wide text-ink-faint dark:text-tavern-faint mb-1"
							>
								Types
							</p>
							<div class="flex flex-wrap gap-1.5">
								{#if response.facets.types.length === 0}
									<span class="text-xs text-ink-faint dark:text-tavern-faint">No types</span>
								{:else}
									{#each response.facets.types as facet (facet.value)}
										<button
											type="button"
											onclick={() => toggleFilter('type', facet.value)}
											class="px-2 py-1 rounded-md text-xs border {selectedTypes.includes(
												facet.value,
											)
												? 'border-accent bg-accent-subtle text-accent dark:border-tavern-accent dark:bg-tavern-accent-subtle dark:text-tavern-accent'
												: 'border-border dark:border-tavern-border text-ink-muted dark:text-tavern-muted'}"
										>
											{facet.value} ({facet.count})
										</button>
									{/each}
								{/if}
							</div>
						</div>
					</section>
				{/if}
			</aside>

			<section>
				<div class="flex flex-wrap gap-1.5 mb-3">
					{#each operatorChips as chip (chip)}
						<span
							class="px-2 py-1 rounded-md text-xs bg-surface-alt dark:bg-tavern-surface-alt text-ink-muted dark:text-tavern-muted"
							>{chip}</span
						>
					{/each}
					{#each selectedTags as tag (tag)}
						<button
							type="button"
							onclick={() => toggleFilter('tag', tag)}
							class="px-2 py-1 rounded-md text-xs bg-accent-subtle dark:bg-tavern-accent-subtle text-accent dark:text-tavern-accent"
						>
							tag:{tag} ×
						</button>
					{/each}
					{#each selectedFolders as folder (folder)}
						<button
							type="button"
							onclick={() => toggleFilter('folder', folder)}
							class="px-2 py-1 rounded-md text-xs bg-accent-subtle dark:bg-tavern-accent-subtle text-accent dark:text-tavern-accent"
						>
							folder:{folder} ×
						</button>
					{/each}
					{#each selectedTypes as type (type)}
						<button
							type="button"
							onclick={() => toggleFilter('type', type)}
							class="px-2 py-1 rounded-md text-xs bg-accent-subtle dark:bg-tavern-accent-subtle text-accent dark:text-tavern-accent"
						>
							type:{type} ×
						</button>
					{/each}
					{#if operatorChips.length > 0 || activeFacetChipCount > 0}
						<button
							type="button"
							onclick={() => {
								applyQuery('');
								clearFacetFilters();
							}}
							class="px-2 py-1 rounded-md text-xs border border-border dark:border-tavern-border text-ink-muted dark:text-tavern-muted"
						>
							Clear all filters
						</button>
					{/if}
				</div>

				{#if response?.parsed.operatorErrors.length}
					<div
						class="mb-3 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning"
					>
						{response.parsed.operatorErrors.join(' | ')}
					</div>
				{/if}

				{#if filteredResults.length > 0}
					<div class="space-y-3">
						{#each filteredResults as result (result.id)}
							{@const note = notesById.get(result.id)}
							<div
								class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface p-3"
							>
								<div class="flex items-start justify-between gap-2">
									<div>
										<button
											type="button"
											class="font-semibold text-ink dark:text-tavern-text hover:text-accent dark:hover:text-tavern-accent"
											onclick={() => openResult(result)}
										>
											{result.title}
										</button>
										<p class="text-xs text-ink-faint dark:text-tavern-faint mt-0.5">
											{result.filePath ?? result.folder}
										</p>
									</div>
									<span class="text-[11px] text-ink-faint dark:text-tavern-faint"
										>score {result.score.toFixed(1)}</span
									>
								</div>
								{#if result.snippet}
									<p class="mt-2 text-sm text-ink-muted dark:text-tavern-muted">{result.snippet}</p>
								{/if}
								<div
									class="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-faint dark:text-tavern-faint"
								>
									<span>{formatRelativeDate(result.updatedAt)}</span>
									{#if result.type}<span>{result.type}</span>{/if}
									{#if result.anchor}
										<button
											type="button"
											class="text-accent dark:text-tavern-accent hover:underline"
											onclick={() => openResult(result, true)}
										>
											Jump to section
										</button>
									{/if}
									{#if note && note.tags.length > 0}
										<span>#{note.tags.slice(0, 4).join(' #')}</span>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				{:else if !searching}
					<div class="mt-10 text-center">
						<p class="text-ink-muted dark:text-tavern-muted">No results for "{query}"</p>
						<p class="text-sm text-ink-faint dark:text-tavern-faint mt-1">
							Try adjusting operators, facet filters, or spelling.
						</p>
					</div>
				{/if}
			</section>
		</div>
	{:else}
		<div
			class="mt-8 rounded-lg border border-border dark:border-tavern-border bg-surface/70 dark:bg-tavern-surface/70 p-5"
		>
			<p class="text-ink-muted dark:text-tavern-muted">
				Type to search across all notes and discover content faster.
			</p>
			<ul class="mt-3 space-y-1 text-sm text-ink-faint dark:text-tavern-faint list-disc pl-5">
				<li><code>tag:session</code> notes tagged with session</li>
				<li><code>folder:/campaign/npcs</code> notes under a folder</li>
				<li><code>type:character</code> frontmatter note type</li>
				<li><code>updated:>=-7d</code> recently updated notes</li>
				<li><code>"goblin ambush"</code> exact phrase match</li>
			</ul>
		</div>
	{/if}
</div>
