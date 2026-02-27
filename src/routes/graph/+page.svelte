<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { linksState } from '$lib/state/links.svelte.js';
	import { buildLinkGraphQualityReport } from '$lib/domain/link-graph-intelligence.js';
	import type { Note } from '$lib/types/note.js';

	interface GraphNode extends Note {
		inbound: number;
		outbound: number;
	}

	const SVG_WIDTH = 860;
	const SVG_HEIGHT = 540;
	const RING_RADIUS = 210;

	let query = $state('');
	let selectedFolder = $state('');
	let selectedTag = $state('');
	let hideIsolated = $state(true);

	let allActiveNotes = $derived(notesState.activeNotes);
	let folders = $derived(
		[...new Set(allActiveNotes.map((note) => String(note.folder)))].sort((a, b) =>
			a.localeCompare(b),
		),
	);
	let tags = $derived(
		[...new Set(allActiveNotes.flatMap((note) => note.tags))].sort((a, b) => a.localeCompare(b)),
	);
	let qualityReport = $derived.by(() =>
		buildLinkGraphQualityReport({
			notes: allActiveNotes,
			resolveTitle: (title) => notesState.resolveTitle(title),
		}),
	);

	function matchesFilters(note: Note): boolean {
		if (selectedFolder) {
			const folder = String(note.folder);
			if (!(folder === selectedFolder || folder.startsWith(`${selectedFolder}/`))) return false;
		}
		if (selectedTag && !note.tags.some((tag) => tag.toLowerCase() === selectedTag.toLowerCase())) {
			return false;
		}
		if (query.trim()) {
			const q = query.trim().toLowerCase();
			const haystack = `${note.title} ${note.tags.join(' ')} ${String(note.folder)}`.toLowerCase();
			if (!haystack.includes(q)) return false;
		}
		return true;
	}

	let graphNodes = $derived.by<GraphNode[]>(() => {
		const base = allActiveNotes.filter(matchesFilters);
		return base
			.map((note) => ({
				...note,
				inbound: linksState.getBacklinkCount(note.id),
				outbound: linksState.getForwardLinkCount(note.id),
			}))
			.filter((note) => (hideIsolated ? note.inbound + note.outbound > 0 : true))
			.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
	});

	let graphNodeIdSet = $derived(new Set(graphNodes.map((note) => String(note.id))));

	let graphEdges = $derived.by(() => {
		const edges: Array<{ sourceId: string; targetId: string }> = [];
		for (const note of graphNodes) {
			for (const targetId of linksState.getForwardLinkIds(note.id)) {
				if (!graphNodeIdSet.has(targetId)) continue;
				edges.push({ sourceId: String(note.id), targetId: targetId });
			}
		}
		return edges;
	});

	let nodePosition = $derived.by(() => {
		const centerX = SVG_WIDTH / 2;
		const centerY = SVG_HEIGHT / 2;
		const total = Math.max(1, graphNodes.length);
		const map = new SvelteMap<string, { x: number; y: number }>();
		for (let i = 0; i < graphNodes.length; i += 1) {
			const node = graphNodes[i]!;
			const angle = (Math.PI * 2 * i) / total - Math.PI / 2;
			map.set(String(node.id), {
				x: centerX + Math.cos(angle) * RING_RADIUS,
				y: centerY + Math.sin(angle) * RING_RADIUS,
			});
		}
		return map;
	});

	function openNote(id: string): void {
		void goto(resolve(`/notes/${id}`));
	}
</script>

<div class="mx-auto max-w-[1120px] p-6">
	<header class="mb-5">
		<h1
			class="text-2xl font-bold text-ink dark:text-tavern-text"
			style="font-family: var(--font-serif)"
		>
			Link Graph
		</h1>
		<p class="mt-1 text-sm text-ink-muted dark:text-tavern-muted">
			Explore note connectivity and identify weak spots in your vault graph.
		</p>
	</header>

	<section
		class="mb-4 grid gap-2 rounded-lg border border-border bg-surface p-3 dark:border-tavern-border dark:bg-tavern-surface md:grid-cols-4"
	>
		<input
			type="text"
			bind:value={query}
			placeholder="Filter notes..."
			class="rounded border border-border bg-surface-alt px-2 py-1.5 text-sm text-ink dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-text"
		/>
		<select
			bind:value={selectedFolder}
			class="rounded border border-border bg-surface-alt px-2 py-1.5 text-sm text-ink dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-text"
		>
			<option value="">All folders</option>
			{#each folders as folder (folder)}
				<option value={folder}>{folder}</option>
			{/each}
		</select>
		<select
			bind:value={selectedTag}
			class="rounded border border-border bg-surface-alt px-2 py-1.5 text-sm text-ink dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-text"
		>
			<option value="">All tags</option>
			{#each tags as tag (tag)}
				<option value={tag}>{tag}</option>
			{/each}
		</select>
		<label
			class="flex items-center gap-2 rounded border border-border bg-surface-alt px-2 py-1.5 text-sm text-ink dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-text"
		>
			<input type="checkbox" bind:checked={hideIsolated} />
			Hide isolated
		</label>
	</section>

	<section
		class="mb-5 rounded-lg border border-border bg-surface p-3 dark:border-tavern-border dark:bg-tavern-surface"
	>
		<div
			class="mb-2 flex flex-wrap items-center gap-3 text-xs text-ink-muted dark:text-tavern-muted"
		>
			<span>{graphNodes.length} nodes</span>
			<span>{graphEdges.length} edges</span>
			<span>{qualityReport.orphanNoteIds.length} orphans</span>
			<span>{qualityReport.deadLinks.length} dead links</span>
		</div>
		{#if graphNodes.length === 0}
			<p class="text-sm text-ink-muted dark:text-tavern-muted">
				No nodes match the active filters.
			</p>
		{:else}
			<div class="overflow-x-auto">
				<svg
					viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
					class="min-w-[820px] rounded border border-border bg-parchment dark:border-tavern-border dark:bg-tavern-bg"
					aria-label="Visual link graph"
				>
					{#each graphEdges as edge (edge.sourceId + '->' + edge.targetId)}
						{@const sourcePos = nodePosition.get(edge.sourceId)}
						{@const targetPos = nodePosition.get(edge.targetId)}
						{#if sourcePos && targetPos}
							<line
								x1={sourcePos.x}
								y1={sourcePos.y}
								x2={targetPos.x}
								y2={targetPos.y}
								stroke="currentColor"
								stroke-width="1"
								class="text-ink-faint/35 dark:text-tavern-faint/40"
							/>
						{/if}
					{/each}
					{#each graphNodes as node (node.id)}
						{@const pos = nodePosition.get(String(node.id))}
						{#if pos}
							<g
								role="button"
								tabindex="0"
								aria-label={node.title}
								onclick={() => openNote(node.id)}
								onkeydown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') openNote(node.id);
								}}
								class="cursor-pointer"
							>
								<circle
									cx={pos.x}
									cy={pos.y}
									r={Math.min(16, 6 + node.inbound + node.outbound)}
									class="fill-accent/35 stroke-accent dark:fill-tavern-accent/35 dark:stroke-tavern-accent"
									stroke-width="1.5"
								/>
								<text
									x={pos.x}
									y={pos.y + 30}
									text-anchor="middle"
									class="fill-ink text-[11px] dark:fill-tavern-text"
								>
									{node.title.length > 18 ? `${node.title.slice(0, 18)}...` : node.title}
								</text>
							</g>
						{/if}
					{/each}
				</svg>
			</div>
		{/if}
	</section>

	<section class="grid gap-4 md:grid-cols-3">
		<div
			class="rounded-lg border border-border bg-surface p-3 dark:border-tavern-border dark:bg-tavern-surface"
		>
			<h2 class="mb-2 text-sm font-semibold text-ink dark:text-tavern-text">Orphan Notes</h2>
			{#if qualityReport.orphanNoteIds.length === 0}
				<p class="text-xs text-ink-muted dark:text-tavern-muted">No orphan notes.</p>
			{:else}
				<ul class="space-y-1">
					{#each qualityReport.orphanNoteIds.slice(0, 12) as noteId (noteId)}
						{@const note = notesState.getNoteById(noteId)}
						{#if note}
							<li>
								<button
									type="button"
									onclick={() => openNote(note.id)}
									class="text-xs text-accent hover:underline dark:text-tavern-accent"
								>
									{note.title}
								</button>
							</li>
						{/if}
					{/each}
				</ul>
			{/if}
		</div>

		<div
			class="rounded-lg border border-border bg-surface p-3 dark:border-tavern-border dark:bg-tavern-surface"
		>
			<h2 class="mb-2 text-sm font-semibold text-ink dark:text-tavern-text">Dead Links</h2>
			{#if qualityReport.deadLinks.length === 0}
				<p class="text-xs text-ink-muted dark:text-tavern-muted">No dead links found.</p>
			{:else}
				<ul class="space-y-1.5">
					{#each qualityReport.deadLinks.slice(0, 8) as issue (issue.sourceId + issue.targetLabel)}
						<li class="text-xs text-ink-muted dark:text-tavern-muted">
							<span class="font-medium text-ink dark:text-tavern-text">{issue.sourceTitle}</span>
							: [[{issue.targetLabel}]] ({issue.count})
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<div
			class="rounded-lg border border-border bg-surface p-3 dark:border-tavern-border dark:bg-tavern-surface"
		>
			<h2 class="mb-2 text-sm font-semibold text-ink dark:text-tavern-text">High Centrality</h2>
			{#if qualityReport.highCentrality.length === 0}
				<p class="text-xs text-ink-muted dark:text-tavern-muted">No connected notes yet.</p>
			{:else}
				<ul class="space-y-1.5">
					{#each qualityReport.highCentrality as item (item.noteId)}
						<li class="text-xs text-ink-muted dark:text-tavern-muted">
							<button
								type="button"
								onclick={() => openNote(item.noteId)}
								class="text-accent hover:underline dark:text-tavern-accent"
							>
								{item.title}
							</button>
							<span class="ml-1">in {item.inbound} / out {item.outbound}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</section>
</div>
