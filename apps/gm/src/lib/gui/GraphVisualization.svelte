<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		GRAPH_RELATIONSHIP_KINDS,
		getGraphVisualizationForActor,
		type GraphNodeKind,
		type GraphRelationshipKind,
		type GraphSourceKind,
		type GraphVizFilter,
		type GraphVizNode,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';
	import { useProfile } from '$lib/platform/platform-profile.svelte';

	// GRAPH-004 — the graph VISUALIZATION surface. The user views the actor's VISIBLE link graph (notes,
	// objects, maps, POIs + the edges between them) and FILTERS it by folder, tag, entity type, source,
	// relationship type, and visibility-safe search text. Everything rendered is the single computed,
	// actor-filtered model from `getGraphVisualizationForActor` (Architecture Contract 1 — the Processing
	// Core owns the graph; this GUI renders the model and navigates via existing links). The visualization
	// FAILS CLOSED: a player never sees a hidden/DM-only node, edge, label, facet, or a count that would
	// reveal hidden content, because the model omits them entirely.
	//
	// ACCESSIBILITY: the primary rendering is a keyboard-navigable, screen-reader-accessible TABLE of nodes
	// and their relationships (roles, captions, headers) — there is no pointer-only canvas. Each node row is
	// a real link to the note in the Knowledge section, so the whole graph is operable by keyboard alone.
	//
	// MOBILE (AC2): on a compact profile the filter controls collapse into a single `<details>` disclosure
	// (a simplified control surface) so the graph stays fully usable on a slim device without a wide control
	// strip that could shift the centered layout; the same filters, model, and table are used on every
	// profile (Contract 1 — same commands/results, density-reduced presentation).
	const runtime = useRuntime();
	const profile = useProfile();

	const KIND_LABELS: Record<GraphNodeKind, string> = {
		note: 'Note',
		object: 'Object',
		map: 'Map',
		poi: 'Map POI',
	};
	const SOURCE_LABELS: Record<string, string> = {
		'local-vault': 'Local',
		'obsidian-vault': 'Obsidian',
		'google-docs': 'Google Docs',
	};
	const RELATIONSHIP_LABELS: Record<GraphRelationshipKind, string> = {
		wikilink: 'Wikilink',
		'poi-link': 'Map POI link',
	};

	function sourceLabel(source: GraphSourceKind): string {
		return SOURCE_LABELS[source] ?? source;
	}

	// The filter is local UI state only (it never mutates durable state — Contract 1). An empty filter shows
	// the whole visible graph.
	let query = $state('');
	let folder = $state('');
	let selectedKinds = $state<GraphNodeKind[]>([]);
	let selectedSources = $state<GraphSourceKind[]>([]);
	let selectedRelationships = $state<GraphRelationshipKind[]>([]);
	let tagsText = $state('');

	function toggle<T>(list: T[], value: T): T[] {
		return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
	}

	function buildFilter(): GraphVizFilter {
		const tags = tagsText
			.split(',')
			.map((t) => t.trim())
			.filter((t) => t !== '');
		const filter: GraphVizFilter = {};
		if (query.trim()) filter.text = query.trim();
		if (folder.trim()) filter.folder = folder.trim();
		if (selectedKinds.length > 0) filter.kinds = [...selectedKinds];
		if (selectedSources.length > 0) filter.sources = [...selectedSources];
		if (selectedRelationships.length > 0) filter.relationships = [...selectedRelationships];
		if (tags.length > 0) filter.tags = tags;
		return filter;
	}

	// The single actor-filtered visualization model. Re-derived whenever the runtime state, active actor, or
	// any filter changes. The default local source id matches the runtime environment's source registration.
	const viz = $derived(
		getGraphVisualizationForActor(
			runtime.state.content,
			runtime.state.maps,
			runtime.state.session,
			runtime.state.permissions,
			runtime.activeActorId,
			'local-vault',
			buildFilter(),
		),
	);

	type Relation = { id: string; title: string; relationship: GraphRelationshipKind };

	// The visible relationships of each filtered node, computed from the filtered edge set (so the table's
	// relationship cells stay consistent with the relationship-type filter). Both endpoints are visible nodes.
	// Built as plain records (keyed by node id) — these are recomputed wholesale on each change, never mutated
	// reactively, so a plain object is the right local structure here.
	const titleById = $derived(Object.fromEntries(viz.nodes.map((node) => [node.id, node.title])));
	const linksToById = $derived.by<Record<string, Relation[]>>(() => {
		const map: Record<string, Relation[]> = {};
		for (const edge of viz.edges) {
			const title = titleById[edge.toId];
			if (title === undefined) continue;
			(map[edge.fromId] ??= []).push({ id: edge.toId, title, relationship: edge.relationship });
		}
		return map;
	});
	const linkedFromById = $derived.by<Record<string, Relation[]>>(() => {
		const map: Record<string, Relation[]> = {};
		for (const edge of viz.edges) {
			const title = titleById[edge.fromId];
			if (title === undefined) continue;
			(map[edge.toId] ??= []).push({ id: edge.fromId, title, relationship: edge.relationship });
		}
		return map;
	});

	function relationsFor(map: Record<string, Relation[]>, nodeId: string): Relation[] {
		return map[nodeId] ?? [];
	}

	function hasActiveFilter(): boolean {
		return (
			query.trim() !== '' ||
			folder.trim() !== '' ||
			selectedKinds.length > 0 ||
			selectedSources.length > 0 ||
			selectedRelationships.length > 0 ||
			tagsText.trim() !== ''
		);
	}

	function clearFilters(): void {
		query = '';
		folder = '';
		selectedKinds = [];
		selectedSources = [];
		selectedRelationships = [];
		tagsText = '';
	}

	// Navigate to a note/object node in the Knowledge section (the existing route + `?note=<id>` selection).
	// A map/POI node has no Knowledge route, so its title is shown without a navigable link. The Processing
	// Core re-checks visibility on open; this GUI only builds the URL (Contract 1).
	async function openNode(node: GraphVizNode): Promise<void> {
		if (node.kind !== 'note' && node.kind !== 'object') return;
		await goto(`/knowledge/?note=${encodeURIComponent(node.id)}`);
	}

	function isNavigable(kind: GraphNodeKind): boolean {
		return kind === 'note' || kind === 'object';
	}
</script>

<section data-testid="graph-visualization" aria-label="Graph visualization">
	<h2>Graph visualization</h2>
	<p class="meta">
		Explore the link graph for the content you can see — notes, objects, maps, and their relationships.
		Filter by folder, tag, entity type, source, relationship type, and text. Results, facets, and counts
		include only what your visibility permits.
	</p>

	{#if !runtime.loaded}
		<p class="meta" role="status" data-testid="graph-loading">Loading the graph…</p>
	{:else}
		<!-- AC2: on a compact profile the controls collapse into a single disclosure (a simplified control
		     surface). The same filter inputs drive the same model on every profile. -->
		{#snippet filters()}
			<form
				class="filters"
				data-testid="graph-filter-form"
				onsubmit={(event) => {
					event.preventDefault();
				}}
			>
				<label>
					Search text
					<input data-testid="graph-search" bind:value={query} autocomplete="off" />
				</label>
				<label>
					Folder
					<input data-testid="graph-folder" bind:value={folder} autocomplete="off" list="graph-folders" />
				</label>
				<datalist id="graph-folders">
					{#each viz.facets.folders as f (f)}
						<option value={f}></option>
					{/each}
				</datalist>
				<label>
					Tags (comma-separated)
					<input data-testid="graph-tags" bind:value={tagsText} autocomplete="off" />
				</label>
				<fieldset data-testid="graph-kinds">
					<legend class="meta">Entity type</legend>
					{#each viz.facets.kinds as kind (kind)}
						<label class="check">
							<input
								type="checkbox"
								data-testid={`graph-kind-${kind}`}
								checked={selectedKinds.includes(kind)}
								onchange={() => (selectedKinds = toggle(selectedKinds, kind))}
							/>
							{KIND_LABELS[kind]}
						</label>
					{/each}
				</fieldset>
				<fieldset data-testid="graph-sources">
					<legend class="meta">Source</legend>
					{#each viz.facets.sources as source (source)}
						<label class="check">
							<input
								type="checkbox"
								data-testid={`graph-source-${source}`}
								checked={selectedSources.includes(source)}
								onchange={() => (selectedSources = toggle(selectedSources, source))}
							/>
							{sourceLabel(source)}
						</label>
					{/each}
				</fieldset>
				<fieldset data-testid="graph-relationships">
					<legend class="meta">Relationship type</legend>
					{#each GRAPH_RELATIONSHIP_KINDS as relationship (relationship)}
						<label class="check">
							<input
								type="checkbox"
								data-testid={`graph-relationship-${relationship}`}
								checked={selectedRelationships.includes(relationship)}
								onchange={() => (selectedRelationships = toggle(selectedRelationships, relationship))}
							/>
							{RELATIONSHIP_LABELS[relationship]}
						</label>
					{/each}
				</fieldset>
				{#if hasActiveFilter()}
					<button type="button" data-testid="graph-clear-filters" onclick={clearFilters}>
						Clear filters
					</button>
				{/if}
			</form>
		{/snippet}

		{#if profile.isCompact}
			<details class="compact-filters" data-testid="graph-filters-compact">
				<summary data-testid="graph-filters-toggle">Filters</summary>
				{@render filters()}
			</details>
		{:else}
			{@render filters()}
		{/if}

		<p class="meta" data-testid="graph-count" role="status" aria-live="polite">
			Showing {viz.nodes.length} of {viz.totalVisibleNodes} visible node{viz.totalVisibleNodes === 1
				? ''
				: 's'}, {viz.edges.length} relationship{viz.edges.length === 1 ? '' : 's'}.
		</p>

		<!-- GRAPH-001 AC3 — a configured source that is not fully cached marks the graph partial; the GUI
		     signals it WITHOUT blocking the cached relationships above. The diagnostics carry no content. -->
		{#if viz.partial}
			<ul class="status-list" data-testid="graph-partial-status">
				{#each viz.sourceDiagnostics.filter((d) => d.status !== 'fresh') as diagnostic (diagnostic.sourceId)}
					<li class="meta" data-testid={`graph-source-status-${diagnostic.sourceId}`}>
						{sourceLabel(diagnostic.kind)}: {diagnostic.status}
					</li>
				{/each}
			</ul>
		{/if}

		{#if viz.totalVisibleNodes === 0}
			<p class="meta" data-testid="graph-empty">No graph content is visible to you yet.</p>
		{:else if viz.nodes.length === 0}
			<p class="meta" data-testid="graph-no-matches">No nodes match your filter.</p>
		{:else}
			<!-- The accessible, keyboard-navigable rendering of the graph: a table of nodes and their visible
			     relationships. Screen readers announce the caption, column headers, and each cell; every
			     note/object node is a real link, so the graph is fully operable without a pointer. -->
			<table class="graph-table" data-testid="graph-node-table">
				<caption class="visually-hidden">
					Visible graph nodes and their relationships. Each row is a node; the relationship columns list
					the visible nodes it links to and the visible nodes that link to it.
				</caption>
				<thead>
					<tr>
						<th scope="col">Node</th>
						<th scope="col">Type</th>
						<th scope="col">Folder</th>
						<th scope="col">Tags</th>
						<th scope="col">Source</th>
						<th scope="col">Links to</th>
						<th scope="col">Linked from</th>
					</tr>
				</thead>
				<tbody>
					{#each viz.nodes as node (node.id)}
						<tr data-testid={`graph-node-${node.id}`}>
							<th scope="row">
								{#if isNavigable(node.kind)}
									<button
										type="button"
										class="node-open"
										data-testid={`graph-open-${node.id}`}
										onclick={() => void openNode(node)}
									>
										{node.title}
									</button>
								{:else}
									<span data-testid={`graph-node-title-${node.id}`}>{node.title}</span>
								{/if}
							</th>
							<td data-testid={`graph-node-kind-${node.id}`}>{KIND_LABELS[node.kind]}</td>
							<td>{node.folder ?? '—'}</td>
							<td data-testid={`graph-node-tags-${node.id}`}>
								{node.tags.length > 0 ? node.tags.map((t) => `#${t}`).join(' ') : '—'}
							</td>
							<td>{sourceLabel(node.source)}</td>
							<td data-testid={`graph-node-links-to-${node.id}`}>
								{#if relationsFor(linksToById, node.id).length === 0}
									<span class="meta">—</span>
								{:else}
									<ul class="rel-list">
										{#each relationsFor(linksToById, node.id) as rel (`${rel.id}:${rel.relationship}`)}
											<li>
												{rel.title}
												<span class="meta">({RELATIONSHIP_LABELS[rel.relationship]})</span>
											</li>
										{/each}
									</ul>
								{/if}
							</td>
							<td data-testid={`graph-node-linked-from-${node.id}`}>
								{#if relationsFor(linkedFromById, node.id).length === 0}
									<span class="meta">—</span>
								{:else}
									<ul class="rel-list">
										{#each relationsFor(linkedFromById, node.id) as rel (`${rel.id}:${rel.relationship}`)}
											<li>
												{rel.title}
												<span class="meta">({RELATIONSHIP_LABELS[rel.relationship]})</span>
											</li>
										{/each}
									</ul>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	{/if}
</section>

<style>
	.meta {
		color: var(--color-text-muted, #666);
	}
	.filters {
		display: flex;
		flex-direction: column;
		gap: var(--space-1, 0.25rem);
		margin: var(--space-2, 0.5rem) 0;
	}
	.compact-filters {
		margin: var(--space-2, 0.5rem) 0;
	}
	.check {
		display: inline-flex;
		gap: var(--space-1, 0.25rem);
		align-items: center;
		margin-right: var(--space-2, 0.5rem);
	}
	.status-list,
	.rel-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}
	.graph-table {
		width: 100%;
		border-collapse: collapse;
		/* Keep the table from forcing the centered layout wider than the viewport on slim devices. */
		table-layout: fixed;
	}
	.graph-table th,
	.graph-table td {
		text-align: left;
		vertical-align: top;
		padding: var(--space-1, 0.25rem);
		border-bottom: 1px solid var(--color-border, #ddd);
		overflow-wrap: anywhere;
	}
	.node-open {
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
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
