<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { searchService, type SearchQueryResult, type SearchResult } from '$lib/domain/search.js';
	import { semanticSearchService } from '$lib/domain/semantic-search.js';
	import {
		DEFAULT_SEARCH_SCOPE,
		applySearchScopeToQuery,
		describeSearchScope,
		matchesSearchScope,
		normalizeSearchScope,
		parseSearchScopeFromParams,
		writeSearchScopeToParams,
		type SearchScope,
		type SearchScopeKind,
	} from '$lib/domain/search-scope.js';
	import { searchState } from '$lib/state/search.svelte.js';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { a11yAnnouncerState } from '$lib/state/a11y-announcer.svelte.js';
	import { playerModeState } from '$lib/state/player-mode.svelte.js';
	import { isNoteVisibleInPlayerMode } from '$lib/domain/visibility.js';
	import type { Note } from '$lib/types/note.js';
	import type { NoteId } from '$lib/types/note.js';
	import { formatRelativeDate } from '$lib/utils/date.js';
	import Icon from '$lib/ui/common/Icon.svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';

	type FacetKind = 'tag' | 'folder' | 'type' | 'date';
	type SearchSection = 'Knowledge' | 'Atlas' | 'Session' | 'Campaign' | 'Settings';

	interface DatePreset {
		id: string;
		label: string;
		description: string;
		windowMs: number;
	}

	interface SectionGroup {
		id: string;
		label: string;
		results: SearchResult[];
	}

	const SEARCH_DEBOUNCE_MS = 50;
	const DATE_PRESETS: DatePreset[] = [
		{
			id: '24h',
			label: '24h',
			description: 'Updated in the last day',
			windowMs: 24 * 60 * 60 * 1000,
		},
		{
			id: '7d',
			label: '7d',
			description: 'Updated in the last week',
			windowMs: 7 * 24 * 60 * 60 * 1000,
		},
		{
			id: '30d',
			label: '30d',
			description: 'Updated in the last month',
			windowMs: 30 * 24 * 60 * 60 * 1000,
		},
		{
			id: '90d',
			label: '90d',
			description: 'Updated in the last quarter',
			windowMs: 90 * 24 * 60 * 60 * 1000,
		},
	];

	let query = $state('');
	let response = $state<SearchQueryResult | null>(null);
	let searchTimeout: ReturnType<typeof setTimeout> | null = null;
	let searching = $state(false);
	let inputRef: HTMLInputElement | undefined = $state();
	let searchRunToken = 0;
	let searchRunError = $state<string | null>(null);

	let selectedTags = $state<string[]>([]);
	let selectedFolders = $state<string[]>([]);
	let selectedTypes = $state<string[]>([]);
	let selectedDatePresets = $state<string[]>([]);
	let facetsCollapsed = $state(false);
	let showCheatSheet = $state(false);

	let semanticEnabled = $state(false);
	let semanticReady = $state(false);
	let semanticChecking = $state(false);
	let semanticStatus = $state<string | null>(null);
	let semanticError = $state<string | null>(null);
	let semanticResultIds = $state<NoteId[]>([]);
	let lastUrlSignature = $state<string | null>(null);
	let searchScope = $state<SearchScope>({ ...DEFAULT_SEARCH_SCOPE });
	let collapsedSectionGroups = $state<Record<string, boolean>>({});

	let saving = $state(false);
	let saveError = $state<string | null>(null);
	let lastLiveMessage = $state('');

	let notesById = $derived(notesState.noteById);
	let scopeLabel = $derived(describeSearchScope(searchScope));
	let visibleNotes = $derived.by(() =>
		playerModeState.enabled
			? notesState.activeNotes.filter((note) => isNoteVisibleInPlayerMode(note))
			: notesState.activeNotes,
	);
	let folderScopeOptions = $derived.by(() => {
		const seen: Record<string, true> = {};
		const folders: string[] = [];
		for (const note of visibleNotes) {
			const folder = String(note.folder);
			if (seen[folder]) continue;
			seen[folder] = true;
			folders.push(folder);
		}
		return folders.sort((a, b) => a.localeCompare(b));
	});
	let typeScopeOptions = $derived.by(() => {
		const seen: Record<string, true> = {};
		const types: string[] = [];
		for (const note of visibleNotes) {
			const type = noteType(note);
			if (!type || seen[type]) continue;
			seen[type] = true;
			types.push(type);
		}
		return types.sort((a, b) => a.localeCompare(b));
	});

	$effect(() => {
		if (!searchState.loaded && !searchState.loading) {
			void searchState.loadSavedSearches();
		}
	});

	$effect(() => {
		void refreshSemanticAvailability();
	});

	$effect(() => {
		inputRef?.focus();
	});

	$effect(() => {
		const queryFromUrl = (page.url.searchParams.get('q') ?? '').trim();
		const scopeFromUrl = parseSearchScopeFromParams(page.url.searchParams);
		const signature = `${queryFromUrl}|${scopeFromUrl.kind}|${scopeFromUrl.value ?? ''}`;
		if (signature === lastUrlSignature) {
			return;
		}
		lastUrlSignature = signature;
		searchScope = scopeFromUrl;
		applyQuery(queryFromUrl, { syncUrl: false, clearFacets: true });
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

	function noteType(note: Note): string | null {
		const value = note.frontmatter.type;
		if (typeof value !== 'string') return null;
		const normalized = value.trim().toLowerCase();
		return normalized.length > 0 ? normalized : null;
	}

	function isSemanticOnly(id: NoteId): boolean {
		return semanticResultIds.includes(id);
	}

	function syncUrlState(nextQuery: string, nextScope: SearchScope): void {
		const params = new SvelteURLSearchParams(page.url.searchParams);
		const normalizedQuery = nextQuery.trim();
		if (normalizedQuery) {
			params.set('q', normalizedQuery);
		} else {
			params.delete('q');
		}
		writeSearchScopeToParams(params, nextScope);
		const nextSearch = params.toString();
		const nextPath = nextSearch ? `${page.url.pathname}?${nextSearch}` : page.url.pathname;
		const currentPath = `${page.url.pathname}${page.url.search}`;
		const signature = `${normalizedQuery}|${nextScope.kind}|${nextScope.value ?? ''}`;
		if (nextPath === currentPath && signature === lastUrlSignature) return;
		lastUrlSignature = signature;
		goto(nextPath, { replaceState: true, keepFocus: true, noScroll: true });
	}

	function clearFacetFilters(): void {
		selectedTags = [];
		selectedFolders = [];
		selectedTypes = [];
		selectedDatePresets = [];
	}

	async function refreshSemanticAvailability(force = false): Promise<void> {
		semanticChecking = true;
		try {
			const status = await semanticSearchService.getAvailability(force);
			semanticReady = status.enabled;
			semanticStatus = status.enabled
				? `Semantic model ready (${status.model})`
				: `Semantic search unavailable: ${status.reason ?? 'unknown reason'}`;
			if (!status.enabled) {
				semanticEnabled = false;
			}
		} catch (error) {
			semanticReady = false;
			semanticEnabled = false;
			semanticStatus = `Semantic search unavailable: ${error instanceof Error ? error.message : String(error)}`;
		} finally {
			semanticChecking = false;
		}
	}

	function applyQuery(
		nextQuery: string,
		options: {
			syncUrl?: boolean;
			clearFacets?: boolean;
		} = {},
	): void {
		const { syncUrl = false, clearFacets = true } = options;
		query = nextQuery;
		searchRunError = null;
		semanticError = null;
		semanticResultIds = [];
		if (clearFacets) {
			selectedTags = [];
			selectedFolders = [];
			selectedTypes = [];
			selectedDatePresets = [];
		}
		if (searchTimeout) {
			clearTimeout(searchTimeout);
			searchTimeout = null;
		}
		if (syncUrl) {
			syncUrlState(nextQuery, searchScope);
		}

		const normalized = nextQuery.trim();
		if (!normalized) {
			response = null;
			searching = false;
			return;
		}

		searching = true;
		searchRunToken += 1;
		const runToken = searchRunToken;
		const scopeSnapshot = normalizeSearchScope(searchScope);
		searchTimeout = setTimeout(() => {
			void runSearch(runToken, normalized, scopeSnapshot);
		}, SEARCH_DEBOUNCE_MS);
	}

	async function runSearch(
		runToken: number,
		normalizedQuery: string,
		scopeForRun: SearchScope,
	): Promise<void> {
		try {
			const scopedQuery = applySearchScopeToQuery(normalizedQuery, scopeForRun);
			const keyword = searchService.searchDetailed(scopedQuery);
			let mergedResults = keyword.results;
			let semanticIds: NoteId[] = [];

			if (semanticEnabled) {
				try {
					const semanticCandidateNotes = visibleNotes.filter((note) =>
						matchesSearchScope(
							{
								folder: String(note.folder),
								type: noteType(note),
							},
							scopeForRun,
						),
					);
					const semantic = await semanticSearchService.search({
						query: normalizedQuery,
						notes: semanticCandidateNotes,
						excludeIds: new Set(keyword.results.map((result) => String(result.id))),
						limit: 8,
					});
					if (runToken !== searchRunToken) return;
					const supplemental: SearchResult[] = [];
					for (const match of semantic) {
						const note = notesState.getActiveNoteById(match.id);
						if (!note) continue;
						if (playerModeState.enabled && !isNoteVisibleInPlayerMode(note)) continue;
						if (
							!matchesSearchScope(
								{
									folder: String(note.folder),
									type: noteType(note),
								},
								scopeForRun,
							)
						) {
							continue;
						}
						supplemental.push({
							id: note.id,
							title: note.title,
							folder: String(note.folder),
							filePath: note.filePath ?? null,
							score: match.score,
							snippet: note.content.slice(0, 200).replace(/\s+/g, ' ').trim(),
							anchor: null,
							tags: [...note.tags],
							type: noteType(note),
							updatedAt: note.updatedAt,
						});
					}
					mergedResults = [...keyword.results, ...supplemental];
					semanticIds = supplemental.map((entry) => entry.id);
					semanticError = null;
				} catch (error) {
					semanticError =
						error instanceof Error
							? `Semantic search failed: ${error.message}`
							: `Semantic search failed: ${String(error)}`;
				}
			}

			if (runToken !== searchRunToken) return;
			const visibleResults = mergedResults.filter((result) => {
				const note = notesById.get(result.id);
				if (!note) return false;
				if (playerModeState.enabled && !isNoteVisibleInPlayerMode(note)) {
					return false;
				}
				return matchesSearchScope(
					{
						folder: String(note.folder),
						type: noteType(note),
					},
					scopeForRun,
				);
			});
			response = {
				...keyword,
				results: visibleResults,
			};
			semanticResultIds = playerModeState.enabled
				? semanticIds.filter((id) => {
						const note = notesById.get(id);
						return !!note && isNoteVisibleInPlayerMode(note);
					})
				: semanticIds;
			searchRunError = null;
		} catch (error) {
			if (runToken !== searchRunToken) return;
			searchRunError =
				error instanceof Error
					? `Search failed: ${error.message}`
					: `Search failed: ${String(error)}`;
			response = null;
		} finally {
			if (runToken === searchRunToken) {
				searching = false;
				searchTimeout = null;
			}
		}
	}

	function handleInput(event: Event): void {
		applyQuery((event.target as HTMLInputElement).value, { syncUrl: true, clearFacets: true });
	}

	function setScopeKind(kind: SearchScopeKind): void {
		if (kind === 'all') {
			setSearchScope({ ...DEFAULT_SEARCH_SCOPE });
			return;
		}
		if (kind === 'folder') {
			setSearchScope({
				kind: 'folder',
				value:
					searchScope.kind === 'folder' && searchScope.value
						? searchScope.value
						: (folderScopeOptions[0] ?? '/'),
			});
			return;
		}
		setSearchScope({
			kind: 'type',
			value:
				searchScope.kind === 'type' && searchScope.value
					? searchScope.value
					: (typeScopeOptions[0] ?? 'npc'),
		});
	}

	function setSearchScope(nextScope: SearchScope): void {
		const normalized = normalizeSearchScope(nextScope);
		searchScope = normalized;
		syncUrlState(query, normalized);
		if (query.trim()) {
			applyQuery(query, { syncUrl: false, clearFacets: false });
		}
	}

	function toggleFilter(kind: FacetKind, value: string): void {
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
		if (kind === 'type') {
			selectedTypes = selectedTypes.includes(value)
				? selectedTypes.filter((entry) => entry !== value)
				: normalizeList([...selectedTypes, value]);
			return;
		}
		selectedDatePresets = selectedDatePresets.includes(value)
			? selectedDatePresets.filter((entry) => entry !== value)
			: normalizeList([...selectedDatePresets, value]);
	}

	function openResult(result: SearchResult, jumpToAnchor = false): void {
		const notePath = resolve('/knowledge/notes/[id]', { id: result.id });
		const target = jumpToAnchor && result.anchor ? `${notePath}#${result.anchor}` : notePath;
		goto(target);
	}

	async function saveCurrentSearch(): Promise<void> {
		if (!query.trim()) return;
		saving = true;
		saveError = null;
		try {
			const defaultName = query.trim().slice(0, 48);
			await searchState.saveSearch(defaultName, applySearchScopeToQuery(query.trim(), searchScope));
		} catch (error) {
			saveError = error instanceof Error ? error.message : String(error);
		} finally {
			saving = false;
		}
	}

	function datePresetThresholdMs(presetId: string): number | null {
		const preset = DATE_PRESETS.find((entry) => entry.id === presetId);
		if (!preset) return null;
		return Date.now() - preset.windowMs;
	}

	function passesDatePreset(result: SearchResult): boolean {
		if (selectedDatePresets.length === 0) return true;
		const updatedMs = Date.parse(result.updatedAt);
		if (Number.isNaN(updatedMs)) return false;
		return selectedDatePresets.some((presetId) => {
			const threshold = datePresetThresholdMs(presetId);
			return threshold !== null && updatedMs >= threshold;
		});
	}

	function matchesFacetFilters(
		result: SearchResult,
		options: {
			ignore?: FacetKind;
		} = {},
	): boolean {
		if (options.ignore !== 'tag' && selectedTags.length > 0) {
			const lower = result.tags.map((tag) => tag.toLowerCase());
			if (!selectedTags.some((tag) => lower.includes(tag.toLowerCase()))) {
				return false;
			}
		}
		if (options.ignore !== 'folder' && selectedFolders.length > 0) {
			if (!selectedFolders.includes(result.folder)) {
				return false;
			}
		}
		if (options.ignore !== 'type' && selectedTypes.length > 0) {
			if (!result.type || !selectedTypes.includes(result.type)) {
				return false;
			}
		}
		if (options.ignore !== 'date' && !passesDatePreset(result)) {
			return false;
		}
		return true;
	}

	function sortFacets(values: Record<string, number>): Array<{ value: string; count: number }> {
		return Object.entries(values)
			.map(([value, count]) => ({ value, count: count ?? 0 }))
			.sort((a, b) => {
				if (a.count !== b.count) return b.count - a.count;
				return a.value.localeCompare(b.value);
			});
	}

	function inferResultSection(result: SearchResult): SearchSection {
		const folder = result.folder.toLowerCase();
		const type = (result.type ?? '').toLowerCase();
		if (
			folder.startsWith('/atlas') ||
			folder.startsWith('/maps') ||
			type === 'location' ||
			type === 'map'
		) {
			return 'Atlas';
		}
		if (
			folder.startsWith('/session') ||
			type === 'encounter' ||
			type === 'combat' ||
			result.tags.some((tag) => tag.toLowerCase() === 'session')
		) {
			return 'Session';
		}
		if (
			folder.startsWith('/campaign') ||
			['npc', 'character', 'faction', 'quest', 'timeline_event'].includes(type)
		) {
			return 'Campaign';
		}
		if (folder.startsWith('/settings')) {
			return 'Settings';
		}
		return 'Knowledge';
	}

	function folderBreadcrumbParts(folder: string): string[] {
		const normalized = folder.trim().replace(/^\/+/, '');
		if (!normalized) {
			return ['Root'];
		}
		return ['Root', ...normalized.split('/').filter((segment) => segment.length > 0)];
	}

	function typeIconToken(type: string | null): string {
		if (!type) return 'NT';
		const normalized = type.trim().toUpperCase();
		if (normalized.length >= 2) return normalized.slice(0, 2);
		return `${normalized}T`;
	}

	function escapeRegex(value: string): string {
		return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	let filteredResults = $derived.by(() => {
		const results = response?.results ?? [];
		return results.filter((result) => matchesFacetFilters(result));
	});

	let groupedBySection = $derived.by<SectionGroup[]>(() => {
		const buckets: Record<SearchSection, SearchResult[]> = {
			Knowledge: [],
			Atlas: [],
			Session: [],
			Campaign: [],
			Settings: [],
		};
		for (const result of filteredResults) {
			const section = inferResultSection(result);
			buckets[section].push(result);
		}
		const order: SearchSection[] = ['Knowledge', 'Atlas', 'Session', 'Campaign', 'Settings'];
		const groups: SectionGroup[] = [];
		for (const section of order) {
			const entries = buckets[section];
			if (!entries || entries.length === 0) continue;
			groups.push({
				id: section.toLowerCase(),
				label: section,
				results: entries,
			});
		}
		return groups;
	});

	$effect(() => {
		const nextState: Record<string, boolean> = {};
		for (const group of groupedBySection) {
			nextState[group.id] = collapsedSectionGroups[group.id] ?? false;
		}
		collapsedSectionGroups = nextState;
	});

	let shouldGroupBySection = $derived(searchScope.kind === 'all' && groupedBySection.length > 1);

	let resultGroups = $derived.by<SectionGroup[]>(() => {
		if (shouldGroupBySection) return groupedBySection;
		if (filteredResults.length === 0) return [];
		return [{ id: 'results', label: 'Results', results: filteredResults }];
	});

	function toggleSectionGroup(groupId: string): void {
		collapsedSectionGroups = {
			...collapsedSectionGroups,
			[groupId]: !(collapsedSectionGroups[groupId] ?? false),
		};
	}

	let highlightTerms = $derived.by(() => {
		const parsed = response?.parsed;
		if (!parsed) return [] as string[];
		const terms = [...parsed.phrases, ...parsed.terms]
			.map((entry) => entry.trim())
			.filter((entry) => entry.length > 1)
			.sort((a, b) => b.length - a.length);
		return [...new Set(terms)].slice(0, 8);
	});

	function titleSegments(title: string): Array<{ text: string; match: boolean }> {
		if (highlightTerms.length === 0) {
			return [{ text: title, match: false }];
		}
		const pattern = highlightTerms.map((entry) => escapeRegex(entry)).join('|');
		if (!pattern) {
			return [{ text: title, match: false }];
		}
		const regex = new RegExp(`(${pattern})`, 'ig');
		const parts = title.split(regex).filter((part) => part.length > 0);
		return parts.map((part) => ({
			text: part,
			match: highlightTerms.some((term) => term.toLowerCase() === part.toLowerCase()),
		}));
	}

	let liveTagFacets = $derived.by(() => {
		const counts: Record<string, number> = {};
		for (const result of response?.results ?? []) {
			if (!matchesFacetFilters(result, { ignore: 'tag' })) continue;
			for (const tag of result.tags) {
				const normalized = tag.trim().toLowerCase();
				if (!normalized) continue;
				counts[normalized] = (counts[normalized] ?? 0) + 1;
			}
		}
		return sortFacets(counts);
	});

	let liveFolderFacets = $derived.by(() => {
		const counts: Record<string, number> = {};
		for (const result of response?.results ?? []) {
			if (!matchesFacetFilters(result, { ignore: 'folder' })) continue;
			counts[result.folder] = (counts[result.folder] ?? 0) + 1;
		}
		return sortFacets(counts);
	});

	let liveTypeFacets = $derived.by(() => {
		const counts: Record<string, number> = {};
		for (const result of response?.results ?? []) {
			if (!matchesFacetFilters(result, { ignore: 'type' })) continue;
			if (!result.type) continue;
			counts[result.type] = (counts[result.type] ?? 0) + 1;
		}
		return sortFacets(counts);
	});

	let liveDateFacets = $derived.by(() => {
		return DATE_PRESETS.map((preset) => {
			const threshold = Date.now() - preset.windowMs;
			let count = 0;
			for (const result of response?.results ?? []) {
				if (!matchesFacetFilters(result, { ignore: 'date' })) continue;
				const updatedMs = Date.parse(result.updatedAt);
				if (Number.isNaN(updatedMs)) continue;
				if (updatedMs >= threshold) {
					count += 1;
				}
			}
			return { ...preset, count };
		});
	});

	let operatorChips = $derived.by(() => {
		if (!response) return [] as string[];
		const parsed = response.parsed;
		return [
			...parsed.tagFilters.map((tag) => `tag:${tag}`),
			...(parsed.hasTagNoneFilter ? ['tag:none'] : []),
			...parsed.folderFilters.map((folder) => `folder:${folder}`),
			...parsed.typeFilters.map((type) => `type:${type}`),
			...parsed.linkFilters.map((link) => `links:[[${link}]]`),
			...parsed.updatedFilters.map((entry) => `updated:${entry.raw}`),
			...parsed.phrases.map((phrase) => `"${phrase}"`),
		];
	});

	let activeFacetChipCount = $derived(
		selectedTags.length +
			selectedFolders.length +
			selectedTypes.length +
			selectedDatePresets.length,
	);

	let telemetryLabel = $derived.by(() => {
		const telemetry = response?.telemetry;
		if (!telemetry) return null;
		return `Search ${telemetry.exceededBudget ? 'over budget' : 'within budget'}: ${telemetry.elapsedMs.toFixed(1)}ms (p95 ${telemetry.p95Ms.toFixed(1)}ms, avg ${telemetry.averageMs.toFixed(1)}ms)`;
	});

	$effect(() => {
		const normalizedQuery = query.trim();
		if (!normalizedQuery) {
			lastLiveMessage = '';
			return;
		}

		let message: string;
		if (searching) {
			message = `${scopeLabel}. Searching for ${normalizedQuery}.`;
		} else if (searchRunError) {
			message = searchRunError;
		} else {
			const resultCount = filteredResults.length;
			message = `${scopeLabel}. ${resultCount} ${resultCount === 1 ? 'result' : 'results'} for ${normalizedQuery}.`;
		}

		if (message === lastLiveMessage) return;
		lastLiveMessage = message;
		a11yAnnouncerState.announcePolite(message);
	});
</script>

<div class="p-6 max-w-[1120px] mx-auto">
	<div class="mb-5">
		<h1 class="text-2xl font-bold text-ink" style="font-family: var(--font-serif)">
			Search & Discovery
		</h1>
		<p class="text-sm text-ink-muted mt-1">
			Use operators like <code>tag:</code>, <code>folder:</code>, <code>type:</code>,
			<code>updated:</code>, <code>links:[[Note Title]]</code>, and quoted phrases.
		</p>
	</div>

	<div class="relative">
		<span class="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none">
			<Icon name="search" size="md" />
		</span>
		<input
			bind:this={inputRef}
			type="text"
			value={query}
			oninput={handleInput}
			placeholder="Search notes..."
			class="w-full pl-11 pr-36 py-3 rounded-lg border border-border bg-surface text-ink placeholder:text-ink-faint outline-none focus:border-accent text-base transition-colors"
		/>
		{#if query.trim()}
			<button
				type="button"
				class="absolute right-[86px] top-1/2 -translate-y-1/2 rounded-md border border-border bg-surface-alt px-2 py-1 text-xs text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:text-ink disabled:opacity-60"
				onclick={saveCurrentSearch}
				disabled={saving}
				aria-label="Save current search to collections"
				title="Save current search"
			>
				{saving ? 'Saving' : 'Save'}
			</button>
		{/if}
		<button
			type="button"
			class="absolute right-2.5 top-1/2 -translate-y-1/2 px-2 py-1 rounded-md border border-border text-xs text-ink-muted"
			aria-expanded={showCheatSheet}
			aria-controls="search-operator-cheatsheet"
			onclick={() => (showCheatSheet = !showCheatSheet)}
		>
			Operators
		</button>
	</div>

	<div class="mt-3 rounded-lg border border-border bg-surface/60 p-3">
		<p class="text-sm font-medium text-ink">{scopeLabel}</p>
		<div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
			<label for="search-scope-kind">Scope</label>
			<select
				id="search-scope-kind"
				aria-label="Search scope kind"
				value={searchScope.kind}
				onchange={(event) =>
					setScopeKind((event.target as HTMLSelectElement).value as SearchScopeKind)}
				class="rounded-md border border-border bg-surface px-2 py-1 text-xs"
			>
				<option value="all">All notes</option>
				<option value="folder">Folder</option>
				<option value="type">Type</option>
			</select>
			{#if searchScope.kind === 'folder'}
				<select
					aria-label="Search scope folder"
					value={searchScope.value ?? ''}
					onchange={(event) =>
						setSearchScope({ kind: 'folder', value: (event.target as HTMLSelectElement).value })}
					class="min-w-[180px] rounded-md border border-border bg-surface px-2 py-1 text-xs"
				>
					{#if folderScopeOptions.length === 0}
						<option value="/">/</option>
					{:else}
						{#each folderScopeOptions as folder (folder)}
							<option value={folder}>{folder}</option>
						{/each}
					{/if}
				</select>
			{:else if searchScope.kind === 'type'}
				<select
					aria-label="Search scope type"
					value={searchScope.value ?? ''}
					onchange={(event) =>
						setSearchScope({ kind: 'type', value: (event.target as HTMLSelectElement).value })}
					class="min-w-[140px] rounded-md border border-border bg-surface px-2 py-1 text-xs"
				>
					{#if typeScopeOptions.length === 0}
						<option value="npc">npc</option>
					{:else}
						{#each typeScopeOptions as type (type)}
							<option value={type}>{type}</option>
						{/each}
					{/if}
				</select>
			{/if}
			<span class="text-ink-faint">Scope is encoded in the URL query string.</span>
		</div>
	</div>

	{#if showCheatSheet}
		<div
			id="search-operator-cheatsheet"
			class="mt-2 rounded-md border border-border bg-surface-alt p-3 text-xs text-ink-muted"
		>
			<ul class="space-y-1 list-disc pl-4">
				<li><code>tag:session</code> notes with tag session</li>
				<li><code>folder:/campaign/npcs</code> notes under a folder path</li>
				<li><code>type:character</code> note frontmatter type</li>
				<li><code>updated:>=-7d</code> notes updated in last 7 days</li>
				<li><code>links:[[Sildar Hallwinter]]</code> notes linking to that note</li>
				<li><code>"goblin ambush"</code> exact phrase search</li>
			</ul>
		</div>
	{/if}

	<div class="flex flex-wrap items-center gap-2 mt-3" aria-live="polite">
		{#if searching}
			<span class="px-2 py-1 rounded-md text-xs bg-surface-alt text-ink-muted animate-pulse"
				>Searching...</span
			>
		{/if}
		{#if response}
			<span class="text-sm text-ink-muted">
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
		{#if semanticReady}
			<label
				class="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-border text-xs text-ink-muted"
			>
				<input type="checkbox" bind:checked={semanticEnabled} aria-label="Enable semantic search" />
				Semantic search
			</label>
		{:else if semanticStatus}
			<span class="text-xs text-ink-faint">{semanticStatus}</span>
		{/if}
		<button
			type="button"
			class="text-xs text-ink-muted hover:text-ink"
			disabled={semanticChecking}
			onclick={() => refreshSemanticAvailability(true)}
		>
			{semanticChecking ? 'Checking semantic...' : 'Refresh semantic status'}
		</button>
	</div>

	{#if semanticError}
		<div class="mt-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
			{semanticError}
		</div>
	{/if}
	{#if searchRunError}
		<div class="mt-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
			{searchRunError}
		</div>
	{/if}
	{#if saveError}
		<div class="mt-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
			{saveError}
		</div>
	{/if}

	{#if query.trim()}
		<div class="mt-4 grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
			<aside class="space-y-4">
				<section class="rounded-lg border border-border bg-surface/70 p-3">
					<div class="flex items-center justify-between gap-2 mb-2">
						<h2 class="text-sm font-semibold text-ink">Saved Searches</h2>
					</div>
					<p class="text-xs text-ink-faint">
						Use the Save button in the search bar to store the current query.
					</p>

					<div class="mt-3 space-y-1.5">
						{#if searchState.savedSearches.length > 0}
							{#each searchState.savedSearches as saved (saved.id)}
								<div class="flex gap-1.5 items-center">
									<button
										type="button"
										onclick={() => applyQuery(saved.query, { syncUrl: true, clearFacets: true })}
										class="flex-1 min-w-0 text-left px-2 py-1 rounded-md bg-surface-alt text-xs text-ink hover:border-accent border border-transparent"
										title={saved.query}
									>
										<div class="truncate">{saved.name}</div>
									</button>
									<button
										type="button"
										onclick={() => searchState.deleteSearch(saved.id)}
										class="px-2 py-1 rounded-md text-xs text-ink-muted hover:text-error"
										aria-label={`Delete saved search ${saved.name}`}
									>
										Delete
									</button>
								</div>
							{/each}
						{:else}
							<p class="text-xs text-ink-faint">No saved searches yet.</p>
						{/if}
					</div>
				</section>

				<section class="rounded-lg border border-border bg-surface/70 p-3">
					<h2 class="text-sm font-semibold text-ink mb-2">Smart Collections</h2>
					<div class="space-y-1.5">
						{#each searchState.smartCollections as collection (collection.id)}
							<button
								type="button"
								onclick={() => applyQuery(collection.query, { syncUrl: true, clearFacets: true })}
								class="w-full text-left px-2.5 py-2 rounded-md bg-surface-alt hover:border-accent border border-transparent"
							>
								<div class="text-xs font-medium text-ink">
									{collection.name}
								</div>
								<div class="text-xs text-ink-muted mt-0.5">
									{collection.description}
								</div>
							</button>
						{/each}
					</div>
				</section>

				{#if response}
					<section class="rounded-lg border border-border bg-surface/70 p-3 space-y-3">
						<div class="flex items-center justify-between">
							<button
								type="button"
								class="text-left text-sm font-semibold text-ink"
								onclick={() => (facetsCollapsed = !facetsCollapsed)}
								aria-expanded={!facetsCollapsed}
								aria-controls="search-facets-panel"
							>
								Facets {facetsCollapsed ? 'show' : 'hide'}
							</button>
							<button
								type="button"
								class="text-xs text-ink-muted hover:text-ink"
								onclick={clearFacetFilters}
								disabled={activeFacetChipCount === 0}>Clear</button
							>
						</div>

						{#if !facetsCollapsed}
							<div id="search-facets-panel" class="space-y-3">
								<div>
									<p class="text-xs uppercase tracking-wide text-ink-faint mb-1">Tags</p>
									<div class="flex flex-wrap gap-1.5">
										{#if liveTagFacets.length === 0}
											<span class="text-xs text-ink-faint">No tags</span>
										{:else}
											{#each liveTagFacets as facet (facet.value)}
												<button
													type="button"
													onclick={() => toggleFilter('tag', facet.value)}
													class="px-2 py-1 rounded-md text-xs border {selectedTags.includes(
														facet.value,
													)
														? 'border-accent bg-accent-subtle text-accent'
														: 'border-border text-ink-muted'}"
												>
													{facet.value} ({facet.count})
												</button>
											{/each}
										{/if}
									</div>
								</div>

								<div>
									<p class="text-xs uppercase tracking-wide text-ink-faint mb-1">Folders</p>
									<div class="flex flex-wrap gap-1.5">
										{#if liveFolderFacets.length === 0}
											<span class="text-xs text-ink-faint">No folders</span>
										{:else}
											{#each liveFolderFacets as facet (facet.value)}
												<button
													type="button"
													onclick={() => toggleFilter('folder', facet.value)}
													class="px-2 py-1 rounded-md text-xs border {selectedFolders.includes(
														facet.value,
													)
														? 'border-accent bg-accent-subtle text-accent'
														: 'border-border text-ink-muted'}"
												>
													{facet.value} ({facet.count})
												</button>
											{/each}
										{/if}
									</div>
								</div>

								<div>
									<p class="text-xs uppercase tracking-wide text-ink-faint mb-1">Types</p>
									<div class="flex flex-wrap gap-1.5">
										{#if liveTypeFacets.length === 0}
											<span class="text-xs text-ink-faint">No types</span>
										{:else}
											{#each liveTypeFacets as facet (facet.value)}
												<button
													type="button"
													onclick={() => toggleFilter('type', facet.value)}
													class="px-2 py-1 rounded-md text-xs border {selectedTypes.includes(
														facet.value,
													)
														? 'border-accent bg-accent-subtle text-accent'
														: 'border-border text-ink-muted'}"
												>
													{facet.value} ({facet.count})
												</button>
											{/each}
										{/if}
									</div>
								</div>

								<div>
									<p class="text-xs uppercase tracking-wide text-ink-faint mb-1">Updated</p>
									<div class="flex flex-wrap gap-1.5">
										{#each liveDateFacets as facet (facet.id)}
											<button
												type="button"
												title={facet.description}
												onclick={() => toggleFilter('date', facet.id)}
												class="px-2 py-1 rounded-md text-xs border {selectedDatePresets.includes(
													facet.id,
												)
													? 'border-accent bg-accent-subtle text-accent'
													: 'border-border text-ink-muted'}"
											>
												{facet.label} ({facet.count})
											</button>
										{/each}
									</div>
								</div>
							</div>
						{/if}
					</section>
				{/if}
			</aside>

			<section>
				<div class="flex flex-wrap gap-1.5 mb-3">
					{#each operatorChips as chip (chip)}
						<span class="px-2 py-1 rounded-md text-xs bg-surface-alt text-ink-muted">{chip}</span>
					{/each}
					{#each selectedTags as tag (tag)}
						<button
							type="button"
							onclick={() => toggleFilter('tag', tag)}
							class="px-2 py-1 rounded-md text-xs bg-accent-subtle text-accent"
						>
							tag:{tag} x
						</button>
					{/each}
					{#each selectedFolders as folder (folder)}
						<button
							type="button"
							onclick={() => toggleFilter('folder', folder)}
							class="px-2 py-1 rounded-md text-xs bg-accent-subtle text-accent"
						>
							folder:{folder} x
						</button>
					{/each}
					{#each selectedTypes as type (type)}
						<button
							type="button"
							onclick={() => toggleFilter('type', type)}
							class="px-2 py-1 rounded-md text-xs bg-accent-subtle text-accent"
						>
							type:{type} x
						</button>
					{/each}
					{#each selectedDatePresets as presetId (presetId)}
						<button
							type="button"
							onclick={() => toggleFilter('date', presetId)}
							class="px-2 py-1 rounded-md text-xs bg-accent-subtle text-accent"
						>
							updated:{presetId} x
						</button>
					{/each}
					{#if operatorChips.length > 0 || activeFacetChipCount > 0}
						<button
							type="button"
							onclick={() => {
								applyQuery('', { syncUrl: true, clearFacets: true });
								clearFacetFilters();
							}}
							class="px-2 py-1 rounded-md text-xs border border-border text-ink-muted"
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
					<div class="space-y-4">
						{#each resultGroups as group (group.id)}
							<div class="space-y-3">
								{#if shouldGroupBySection}
									<button
										type="button"
										class="flex w-full items-center justify-between rounded-md border border-border bg-surface-alt px-3 py-2 text-left text-sm font-semibold text-ink"
										onclick={() => toggleSectionGroup(group.id)}
										aria-expanded={!(collapsedSectionGroups[group.id] ?? false)}
									>
										<span>{group.label}</span>
										<span class="text-xs text-ink-muted">
											{group.results.length}
										</span>
									</button>
								{/if}
								{#if !shouldGroupBySection || !(collapsedSectionGroups[group.id] ?? false)}
									{#each group.results as result (result.id)}
										{@const note = notesById.get(result.id)}
										{@const semanticOnly = isSemanticOnly(result.id)}
										<div class="rounded-lg border border-border bg-surface p-3">
											<div class="flex items-start justify-between gap-2">
												<div>
													<button
														type="button"
														class="font-semibold text-ink hover:text-accent"
														onclick={() => openResult(result)}
													>
														{#each titleSegments(result.title) as segment, index (`${result.id}-segment-${index}`)}
															<span
																class={segment.match
																	? 'rounded-sm bg-warning/20 px-[1px] text-ink'
																	: ''}>{segment.text}</span
															>
														{/each}
													</button>
													<p class="mt-0.5 flex flex-wrap items-center text-xs text-ink-faint">
														{#each folderBreadcrumbParts(result.folder) as crumb, crumbIndex (`${result.id}-crumb-${crumbIndex}`)}
															{#if crumbIndex > 0}<span class="px-1">/</span>{/if}
															<span>{crumb}</span>
														{/each}
													</p>
												</div>
												<div class="text-right space-y-1">
													<div class="inline-flex items-center gap-1">
														<span
															class="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border text-2xs font-semibold text-ink-muted"
														>
															{typeIconToken(result.type)}
														</span>
														{#if result.type}
															<span class="text-xs text-ink-faint">{result.type}</span>
														{/if}
													</div>
													{#if semanticOnly}
														<span
															class="inline-block px-2 py-0.5 rounded-full text-xs bg-accent-subtle text-accent"
															>semantic</span
														>
													{/if}
													<div class="text-xs text-ink-faint">
														score {result.score.toFixed(2)}
													</div>
												</div>
											</div>
											{#if result.snippet}
												<p class="mt-2 text-sm text-ink-muted">
													{result.snippet}
												</p>
											{/if}
											<div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-faint">
												<span>{formatRelativeDate(result.updatedAt)}</span>
												{#if note && note.tags.length > 0}
													{#each note.tags.slice(0, 3) as tag (`${result.id}-tag-${tag}`)}
														<span
															class="rounded-md border border-border px-1.5 py-0.5 text-xs text-ink-muted"
															>#{tag}</span
														>
													{/each}
												{/if}
												{#if result.anchor}
													<button
														type="button"
														class="text-accent hover:underline"
														onclick={() => openResult(result, true)}
													>
														Jump to section
													</button>
												{/if}
											</div>
										</div>
									{/each}
								{/if}
							</div>
						{/each}
					</div>
				{:else if !searching}
					<div class="mt-10 text-center">
						<p class="text-ink-muted">No results for "{query}"</p>
						<p class="text-sm text-ink-faint mt-1">
							Try adjusting scope, operators, facet filters, or spelling.
						</p>
					</div>
				{/if}
			</section>
		</div>
	{:else}
		<div class="mt-8 rounded-lg border border-border bg-surface/70 p-5">
			<p class="text-ink-muted">Type to search across all notes and discover content faster.</p>
			<ul class="mt-3 space-y-1 text-sm text-ink-faint list-disc pl-5">
				<li><code>tag:session</code> notes tagged with session</li>
				<li><code>folder:/campaign/npcs</code> notes under a folder</li>
				<li><code>type:character</code> frontmatter note type</li>
				<li><code>updated:>=-7d</code> recently updated notes</li>
				<li><code>links:[[Sildar Hallwinter]]</code> notes linking to a note</li>
				<li><code>"goblin ambush"</code> exact phrase match</li>
			</ul>
		</div>
	{/if}
</div>
