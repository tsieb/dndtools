<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		diagnoseSearchResult,
		getSavedSearchesForActor,
		getSearchIndexStatus,
		resolveSearchResultOpen,
		searchVaultForActor,
		type SearchContentType,
		type SearchFilter,
		type SearchHit,
		type SearchSourceId,
	} from '@dndtools/v2-core';
	import { useRuntime } from '$lib/state/runtime-context';

	// SRCH-003 / SRCH-004: the FILTERS + SAVED SEARCHES surface. The user filters search by source, content
	// type, tag, folder, and free text; the result lists the active filters + the matching VISIBLE hits, all
	// rendered from the single actor-filtered search query (SRCH-003). The DM additionally saves, pins, and
	// deletes named searches; the saved-search list re-runs each filter LIVE for the viewing actor, so a
	// player never sees a dm-only saved search NOR a result a saved search references that has since been
	// hidden (SRCH-004 AC2 / SRCH-003 AC4). This surface dispatches command intents for saved-search CRUD;
	// the AUTHORITATIVE visibility + DM-only authoring enforcement lives in the Processing Core (Contract 1).
	const runtime = useRuntime();

	const actor = $derived(runtime.state.permissions.actors[runtime.activeActorId] ?? null);
	const isDm = $derived(actor?.role === 'dm');

	const SOURCES: SearchSourceId[] = ['local-markdown', 'obsidian', 'google-docs'];
	const TYPES: SearchContentType[] = ['note', 'object', 'poi', 'handout', 'session-artifact'];
	const sourceLabels: Record<SearchSourceId, string> = {
		'local-markdown': 'Local',
		obsidian: 'Obsidian',
		'google-docs': 'Google Docs',
	};
	const typeLabels: Record<SearchContentType, string> = {
		note: 'Note',
		object: 'Object',
		poi: 'Map POI',
		handout: 'Handout',
		'session-artifact': 'Session artifact',
	};

	// Ad-hoc filter (local UI state only). An empty filter matches all visible artifacts.
	let query = $state('');
	let selectedSources = $state<SearchSourceId[]>([]);
	let selectedTypes = $state<SearchContentType[]>([]);
	let tagsText = $state('');
	let folder = $state('');

	function toggle<T>(list: T[], value: T): T[] {
		return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
	}

	function buildFilter(): SearchFilter {
		const tags = tagsText
			.split(',')
			.map((t) => t.trim())
			.filter((t) => t !== '');
		const filter: SearchFilter = {};
		if (query.trim()) filter.query = query.trim();
		if (selectedSources.length > 0) filter.sources = [...selectedSources];
		if (selectedTypes.length > 0) filter.contentTypes = [...selectedTypes];
		if (tags.length > 0) filter.tags = tags;
		if (folder.trim()) filter.folder = folder.trim();
		return filter;
	}

	const result = $derived(
		searchVaultForActor(
			runtime.state.content,
			runtime.state.maps,
			runtime.state.permissions,
			runtime.state.session,
			runtime.activeActorId,
			buildFilter(),
		),
	);

	// SRCH-009: the per-DOMAIN search-index FRESHNESS for the running actor, derived from the SAME
	// actor-filtered reads as search. With the local store as the index (no persisted snapshot here), every
	// visible domain is fresh; this surface shows any `stale`/`partial` domain so the user knows when cached
	// results may be behind a source that has advanced — WITHOUT blocking the results above.
	const indexStatus = $derived(
		getSearchIndexStatus(
			runtime.state.content,
			runtime.state.maps,
			runtime.state.permissions,
			runtime.state.session,
			runtime.activeActorId,
		),
	);

	// The saved searches visible to the running actor, each run LIVE. A dm-only saved search is absent for
	// a player (SRCH-004 AC2); each run re-evaluates for THIS actor (no stale leak — SRCH-003 AC4).
	const savedSearches = $derived(
		getSavedSearchesForActor(
			runtime.state.content,
			runtime.state.maps,
			runtime.state.permissions,
			runtime.state.session,
			runtime.activeActorId,
		),
	);

	let error = $state<string | null>(null);
	let saveName = $state('My search');
	let saveVisibility = $state<'dm-only' | 'player-visible'>('dm-only');

	// SRCH-008 — the DETERMINISTIC, id-normalized diagnostic fingerprint of the current result. Derived from
	// the SAME actor-filtered result, so it summarizes only visible hits (never a hidden hit/key/count). Shown
	// so a user/reviewer can inspect the ranking + a stable fingerprint that does not churn across fresh
	// fixtures (volatile ids are normalized to content-derived keys).
	const diagnostics = $derived(diagnoseSearchResult(result));
	let showDiagnostics = $state(false);

	// SRCH-007 — OPEN a chosen result into the right route/viewport/heading. The core re-checks visibility at
	// open time and maps the hit to a deep-link resolution; this GUI builds the URL (preserving the map/poi
	// params + x/y viewport focus, or the note heading hash) and navigates — it re-derives no visibility
	// (Architecture Contract 1). A now-hidden/now-deleted target resolves to `unavailable` and we surface that
	// generic message rather than opening anything (fail closed).
	async function openHit(hit: SearchHit): Promise<void> {
		error = null;
		const resolution = resolveSearchResultOpen(runtime.state, runtime.activeActorId, {
			type: hit.type,
			id: hit.id,
			mapId: hit.mapId,
			// SRCH-007 AC2 — carry the heading anchor from the body match so the note opens to the matched section.
			headingAnchor: hit.headingAnchor ?? null,
		});
		if (resolution.kind === 'unavailable') {
			error = resolution.message;
			return;
		}
		// SRCH-007 AC1 — a map/POI target preserves the map+poi params AND carries the viewport x/y focus.
		if (resolution.type === 'poi' && resolution.viewport) {
			const parts = [
				`map=${encodeURIComponent(resolution.viewport.mapId)}`,
				`x=${resolution.viewport.x}`,
				`y=${resolution.viewport.y}`,
			];
			if (resolution.selectionId) parts.push(`poi=${encodeURIComponent(resolution.selectionId)}`);
			await goto(`${resolution.route}?${parts.join('&')}`);
			return;
		}
		// SRCH-007 AC2 — a note/object target selects the note WITHIN the Knowledge section (carried as the
		// `note` param) and preserves the heading hash + scroll anchor when one resolved.
		if (resolution.type === 'note' || resolution.type === 'object') {
			const hash = resolution.hashAnchor ? `#${resolution.hashAnchor}` : '';
			await goto(`${resolution.route}?note=${encodeURIComponent(resolution.entityId)}${hash}`);
			return;
		}
		await goto(resolution.route);
	}

	async function dispatch(command: Parameters<typeof runtime.dispatch>[0]): Promise<boolean> {
		error = null;
		const outcome = await runtime.dispatch(command);
		if (outcome.status === 'rejected') {
			error = outcome.rejection.message;
			return false;
		}
		return true;
	}

	async function saveCurrentFilter(): Promise<void> {
		if (!saveName.trim()) {
			error = 'Enter a name for the saved search.';
			return;
		}
		await dispatch({
			type: 'content.create-saved-search',
			actorId: runtime.activeActorId,
			payload: {
				name: saveName.trim(),
				filter: buildFilter(),
				visibility: saveVisibility,
			},
		});
	}

	async function togglePinned(searchId: string, pinned: boolean): Promise<void> {
		await dispatch({
			type: 'content.pin-saved-search',
			actorId: runtime.activeActorId,
			payload: { searchId, pinned },
		});
	}

	async function deleteSaved(searchId: string): Promise<void> {
		await dispatch({
			type: 'content.delete-saved-search',
			actorId: runtime.activeActorId,
			payload: { searchId },
		});
	}
</script>

<section data-testid="saved-searches" aria-label="Filters and saved searches">
	<h2>Filters &amp; saved searches</h2>
	<p class="meta">
		Filter search by source, content type, tag, folder, and text. Results — and any count — include only
		what your visibility permits. The DM can save, pin, and delete searches for recurring workflows.
	</p>

	{#if error}
		<p class="error" role="alert" data-testid="saved-search-error">{error}</p>
	{/if}

	<form
		data-testid="search-filter-form"
		onsubmit={(event) => {
			event.preventDefault();
		}}
	>
		<label>
			Search text
			<input data-testid="search-query" bind:value={query} autocomplete="off" />
		</label>
		<fieldset data-testid="search-sources">
			<legend class="meta">Source</legend>
			{#each SOURCES as source (source)}
				<label class="check">
					<input
						type="checkbox"
						data-testid={`search-source-${source}`}
						checked={selectedSources.includes(source)}
						onchange={() => (selectedSources = toggle(selectedSources, source))}
					/>
					{sourceLabels[source]}
				</label>
			{/each}
		</fieldset>
		<fieldset data-testid="search-types">
			<legend class="meta">Content type</legend>
			{#each TYPES as type (type)}
				<label class="check">
					<input
						type="checkbox"
						data-testid={`search-type-${type}`}
						checked={selectedTypes.includes(type)}
						onchange={() => (selectedTypes = toggle(selectedTypes, type))}
					/>
					{typeLabels[type]}
				</label>
			{/each}
		</fieldset>
		<label>
			Tags (comma-separated)
			<input data-testid="search-tags" bind:value={tagsText} autocomplete="off" />
		</label>
		<label>
			Folder
			<input data-testid="search-folder" bind:value={folder} autocomplete="off" />
		</label>
	</form>

	<p class="meta" data-testid="search-count">
		{result.totalCount} matching result{result.totalCount === 1 ? '' : 's'}
	</p>

	{#if result.sourceStatus.some((s) => s.freshness !== 'fresh')}
		<ul class="status-list" data-testid="search-source-status">
			{#each result.sourceStatus.filter((s) => s.freshness !== 'fresh') as status (status.source)}
				<li data-testid={`search-source-status-${status.source}`}>
					<span class="meta">{sourceLabels[status.source]}: {status.freshness}</span>
				</li>
			{/each}
		</ul>
	{/if}

	{#if indexStatus.anyStale}
		<ul class="status-list" data-testid="search-index-freshness">
			<li class="meta">
				Some indexes may be behind. Showing cached results for: {indexStatus.staleDomains
					.map((d) => typeLabels[d])
					.join(', ')}.
			</li>
			{#each indexStatus.domains.filter((d) => d.status === 'stale' || d.status === 'partial') as domain (domain.domain)}
				<li data-testid={`search-index-freshness-${domain.domain}`}>
					<span class="meta">{typeLabels[domain.domain]}: {domain.status}</span>
				</li>
			{/each}
		</ul>
	{/if}

	{#if result.semanticAssist.state !== 'disabled'}
		<p class="meta" data-testid="search-semantic-status">
			{#if result.semanticAssist.state === 'unavailable'}
				Semantic search unavailable — showing deterministic results. {result.semanticAssist.reason}
			{:else if result.semanticAssist.reranked}
				Semantic ranking applied (deterministic order preserved for diagnostics).
			{:else}
				Semantic assist active (deterministic ranking unchanged).
			{/if}
		</p>
	{/if}

	{#if result.hits.length === 0}
		<p class="meta" data-testid="search-empty">No visible results match your filter.</p>
	{:else}
		<ol class="result-list" data-testid="search-results">
			{#each result.hits as hit (`${hit.type}:${hit.id}`)}
				<li data-testid={`search-result-${hit.type}-${hit.id}`}>
					<span class="meta">{typeLabels[hit.type]} · {sourceLabels[hit.source]}</span>
					<button
						type="button"
						class="open-result"
						data-testid={`search-open-${hit.type}-${hit.id}`}
						onclick={() => void openHit(hit)}
					>
						<strong>{hit.title}</strong>
					</button>
					{#if hit.snippet}
						<span class="snippet meta" data-testid={`search-snippet-${hit.type}-${hit.id}`}>
							{hit.snippet.text}
						</span>
					{/if}
					{#if hit.tags.length > 0}
						<span class="meta" data-testid={`search-tags-${hit.type}-${hit.id}`}>
							{hit.tags.map((t) => `#${t}`).join(' ')}
						</span>
					{/if}
					{#if hit.relationships.backlinks.length > 0}
						<span class="meta" data-testid={`search-backlinks-${hit.type}-${hit.id}`}>
							Linked from: {hit.relationships.backlinks.join(', ')}
						</span>
					{/if}
					{#if hit.relationships.dateRefs.length > 0}
						<span class="meta" data-testid={`search-dates-${hit.type}-${hit.id}`}>
							Dates: {hit.relationships.dateRefs.join(', ')}
						</span>
					{/if}
					{#if hit.relationships.folder}
						<span class="meta" data-testid={`search-folder-${hit.type}-${hit.id}`}>
							Folder: {hit.relationships.folder}
						</span>
					{/if}
					{#if hit.relationships.mapId}
						<span class="meta" data-testid={`search-map-${hit.type}-${hit.id}`}>
							Map: {hit.relationships.mapId}
						</span>
					{/if}
				</li>
			{/each}
		</ol>

		<!-- SRCH-008 — the DETERMINISTIC, id-normalized diagnostics for the current result. The fingerprint is
		     stable across fresh fixtures (volatile ids normalized to content-derived keys), and it summarizes
		     only the actor-visible hits — never a hidden hit, key, or count. -->
		<details class="diagnostics" data-testid="search-diagnostics">
			<summary
				data-testid="search-diagnostics-toggle"
				onclick={() => (showDiagnostics = !showDiagnostics)}
			>
				Search diagnostics
			</summary>
			<p class="meta" data-testid="search-diagnostics-fingerprint">
				Fingerprint: <code>{diagnostics.fingerprint}</code>
			</p>
			<ol class="diag-list">
				{#each diagnostics.hits as row (row.key)}
					<li data-testid={`search-diagnostic-${row.rank}`}>
						<span class="meta">
							#{row.rank} · {row.key} · score {row.score}
							(title {row.signals.title}, recency {row.signals.recency}, link {row.signals.link})
						</span>
					</li>
				{/each}
			</ol>
		</details>
	{/if}

	{#if isDm}
		<form
			class="save-form"
			data-testid="save-search-form"
			onsubmit={(event) => {
				event.preventDefault();
				void saveCurrentFilter();
			}}
		>
			<label>
				Save this filter as
				<input data-testid="save-search-name" bind:value={saveName} autocomplete="off" />
			</label>
			<label>
				Visibility
				<select data-testid="save-search-visibility" bind:value={saveVisibility}>
					<option value="dm-only">DM only</option>
					<option value="player-visible">Player-visible</option>
				</select>
			</label>
			<button type="submit" data-testid="save-search-submit">Save search</button>
		</form>
	{/if}

	<h3>Saved searches</h3>
	{#if savedSearches.length === 0}
		<p class="meta" data-testid="saved-search-empty">No saved searches you can see.</p>
	{:else}
		<ul class="saved-list" data-testid="saved-search-list">
			{#each savedSearches as saved (saved.id)}
				<li data-testid={`saved-search-${saved.id}`}>
					<strong data-testid={`saved-search-name-${saved.id}`}>{saved.name}</strong>
					<span class="meta" data-testid={`saved-search-visibility-${saved.id}`}>
						({saved.visibility})
					</span>
					<span class="meta" data-testid={`saved-search-result-count-${saved.id}`}>
						— {saved.result.totalCount} result{saved.result.totalCount === 1 ? '' : 's'}
					</span>
					{#if saved.pinned}
						<span class="meta" data-testid={`saved-search-pinned-${saved.id}`}>pinned</span>
					{/if}
					{#if isDm}
						<button
							type="button"
							data-testid={`saved-search-pin-${saved.id}`}
							onclick={() => void togglePinned(saved.id, !saved.pinned)}
						>
							{saved.pinned ? 'Unpin' : 'Pin'}
						</button>
						<button
							type="button"
							data-testid={`saved-search-delete-${saved.id}`}
							onclick={() => void deleteSaved(saved.id)}
						>
							Delete
						</button>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.error {
		color: var(--color-danger, #b00020);
	}
	.meta {
		color: var(--color-text-muted, #666);
	}
	.check {
		display: inline-flex;
		gap: var(--space-1, 0.25rem);
		align-items: center;
		margin-right: var(--space-2, 0.5rem);
	}
	.result-list,
	.saved-list,
	.status-list {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1, 0.25rem);
	}
	.result-list li {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}
	.snippet {
		font-style: italic;
	}
	.open-result {
		font: inherit;
		font-weight: 600;
		text-align: left;
		padding: 0;
		border: none;
		background: none;
		color: var(--color-link, #2563eb);
		cursor: pointer;
		text-decoration: underline;
	}
	.diagnostics {
		margin-top: var(--space-2, 0.5rem);
	}
	.diag-list {
		list-style: none;
		padding: 0;
		margin: var(--space-1, 0.25rem) 0 0;
	}
	.save-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-1, 0.25rem);
		margin: var(--space-2, 0.5rem) 0;
	}
</style>
