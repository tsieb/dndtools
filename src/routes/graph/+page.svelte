<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { extractWikilinks } from '$lib/domain/link-extractor.js';
	import { buildLinkGraphQualityReport } from '$lib/domain/link-graph-intelligence.js';
	import { linksState } from '$lib/state/links.svelte.js';
	import { notesState } from '$lib/state/notes.svelte.js';
	import Button from '$lib/ui/common/Button.svelte';
	import type { Note } from '$lib/types/note.js';

	interface GraphNode extends Note {
		inbound: number;
		outbound: number;
		hubScore: number;
		matchesQuery: boolean;
	}

	interface WeightedEdge {
		sourceId: string;
		targetId: string;
		count: number;
	}

	const SVG_WIDTH = 940;
	const SVG_HEIGHT = 600;
	const BOUNDS_PADDING = 26;
	const TAG_COLORS = [
		'#5B8FF9',
		'#5AD8A6',
		'#F6BD16',
		'#E8684A',
		'#6DC8EC',
		'#9270CA',
		'#FF9D4D',
		'#269A99',
		'#FF99C3',
		'#7F8C8D',
	];
	const UNTAGGED_COLOR = '#8F95A3';

	let query = $state('');
	let selectedFolder = $state('');
	let selectedTag = $state('');
	let hideIsolated = $state(true);
	let selectedNodeId = $state('');

	let allActiveNotes = $derived(notesState.activeNotes);
	let noteById = $derived(notesState.activeNoteById);
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
		}),
	);
	let hubScoreById = $derived.by(() => {
		const map = new SvelteMap<string, number>();
		for (const hub of qualityReport.highCentrality) {
			map.set(String(hub.noteId), hub.betweenness);
		}
		return map;
	});

	function normalize(value: string): string {
		return value.trim().toLowerCase();
	}

	function matchesScopeFilters(note: Note): boolean {
		if (selectedFolder) {
			const folder = String(note.folder);
			if (!(folder === selectedFolder || folder.startsWith(`${selectedFolder}/`))) return false;
		}
		if (selectedTag && !note.tags.some((tag) => tag.toLowerCase() === selectedTag.toLowerCase())) {
			return false;
		}
		return true;
	}

	function noteMatchesQuery(note: Note): boolean {
		const q = normalize(query);
		if (!q) return true;
		const fields = `${note.title} ${String(note.folder)} ${note.tags.join(' ')}`.toLowerCase();
		return fields.includes(q);
	}

	function hashString(value: string): number {
		let hash = 0;
		for (let i = 0; i < value.length; i += 1) {
			hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
		}
		return hash;
	}

	function colorForTag(tag: string): string {
		if (!tag) return UNTAGGED_COLOR;
		return TAG_COLORS[hashString(tag) % TAG_COLORS.length] ?? UNTAGGED_COLOR;
	}

	let edgeWeights = $derived.by(() => {
		const activeIdSet = new Set(allActiveNotes.map((note) => String(note.id)));
		const counts = new SvelteMap<string, number>();

		for (const source of allActiveNotes) {
			for (const wl of extractWikilinks(source.content)) {
				let targetId: string | null;
				if (wl.targetIdHint) {
					targetId = activeIdSet.has(wl.targetIdHint) ? wl.targetIdHint : null;
				} else {
					const candidates = notesState.resolveTitleCandidates(wl.title);
					targetId = candidates.length === 1 ? candidates[0]!.id : null;
				}
				if (!targetId) continue;
				const key = `${source.id}->${targetId}`;
				counts.set(key, (counts.get(key) ?? 0) + 1);
			}
		}

		return counts;
	});

	let graphNodes = $derived.by<GraphNode[]>(() => {
		const scoped = allActiveNotes.filter(matchesScopeFilters);
		return scoped
			.map((note) => ({
				...note,
				inbound: linksState.getBacklinkCount(note.id),
				outbound: linksState.getForwardLinkCount(note.id),
				hubScore: hubScoreById.get(String(note.id)) ?? 0,
				matchesQuery: noteMatchesQuery(note),
			}))
			.filter((note) => (hideIsolated ? note.inbound + note.outbound > 0 : true))
			.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
	});

	let graphNodeIdSet = $derived(new Set(graphNodes.map((note) => String(note.id))));

	let graphEdges = $derived.by<WeightedEdge[]>(() => {
		const edges: WeightedEdge[] = [];
		for (const [key, count] of edgeWeights.entries()) {
			const [sourceId, targetId] = key.split('->');
			if (!sourceId || !targetId) continue;
			if (!graphNodeIdSet.has(sourceId) || !graphNodeIdSet.has(targetId)) continue;
			edges.push({ sourceId, targetId, count });
		}
		return edges.sort((a, b) => b.count - a.count);
	});

	let folderCenters = $derived.by(() => {
		const map = new SvelteMap<string, { x: number; y: number }>();
		const uniqueFolders = [...new Set(graphNodes.map((node) => String(node.folder)))];
		if (uniqueFolders.length === 0) return map;
		const radius = Math.min(SVG_WIDTH, SVG_HEIGHT) * 0.32;
		const centerX = SVG_WIDTH / 2;
		const centerY = SVG_HEIGHT / 2;
		for (let i = 0; i < uniqueFolders.length; i += 1) {
			const folder = uniqueFolders[i]!;
			const angle = (Math.PI * 2 * i) / uniqueFolders.length - Math.PI / 2;
			map.set(folder, {
				x: centerX + Math.cos(angle) * radius,
				y: centerY + Math.sin(angle) * radius,
			});
		}
		return map;
	});

	function simulateForceLayout(
		nodes: GraphNode[],
		edges: WeightedEdge[],
		centers: SvelteMap<string, { x: number; y: number }>,
	): SvelteMap<string, { x: number; y: number }> {
		const positions = new SvelteMap<string, { x: number; y: number }>();
		if (nodes.length === 0) return positions;

		const working = nodes.map((node) => {
			const center = centers.get(String(node.folder)) ?? { x: SVG_WIDTH / 2, y: SVG_HEIGHT / 2 };
			const jitterSeed = hashString(String(node.id));
			const jitterX = (jitterSeed % 80) - 40;
			const jitterY = ((jitterSeed / 97) % 80) - 40;
			return {
				id: String(node.id),
				x: center.x + jitterX,
				y: center.y + jitterY,
				vx: 0,
				vy: 0,
				radius: Math.min(26, 7 + node.inbound + node.outbound),
				folder: String(node.folder),
			};
		});

		const indexById = Object.fromEntries(working.map((node, index) => [node.id, index]));
		const steps = Math.min(200, Math.max(80, Math.round(120 + nodes.length * 0.2)));
		const repulsion = 2400;
		const damping = 0.84;
		const centerX = SVG_WIDTH / 2;
		const centerY = SVG_HEIGHT / 2;

		for (let step = 0; step < steps; step += 1) {
			for (let i = 0; i < working.length; i += 1) {
				for (let j = i + 1; j < working.length; j += 1) {
					const a = working[i]!;
					const b = working[j]!;
					let dx = a.x - b.x;
					let dy = a.y - b.y;
					const distSq = Math.max(40, dx * dx + dy * dy);
					const dist = Math.sqrt(distSq);
					dx /= dist;
					dy /= dist;
					const force = repulsion / distSq;
					a.vx += dx * force;
					a.vy += dy * force;
					b.vx -= dx * force;
					b.vy -= dy * force;
				}
			}

			for (const edge of edges) {
				const sourceIndex = indexById[edge.sourceId];
				const targetIndex = indexById[edge.targetId];
				if (sourceIndex === undefined || targetIndex === undefined) continue;
				const source = working[sourceIndex]!;
				const target = working[targetIndex]!;
				let dx = target.x - source.x;
				let dy = target.y - source.y;
				const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
				dx /= dist;
				dy /= dist;
				const idealLength = Math.max(50, 110 - edge.count * 7);
				const spring = (dist - idealLength) * 0.02;
				source.vx += dx * spring;
				source.vy += dy * spring;
				target.vx -= dx * spring;
				target.vy -= dy * spring;
			}

			for (const node of working) {
				const folderCenter = centers.get(node.folder) ?? { x: centerX, y: centerY };
				node.vx += (folderCenter.x - node.x) * 0.01;
				node.vy += (folderCenter.y - node.y) * 0.01;
				node.vx += (centerX - node.x) * 0.002;
				node.vy += (centerY - node.y) * 0.002;

				node.vx *= damping;
				node.vy *= damping;
				node.x += node.vx;
				node.y += node.vy;

				node.x = Math.max(BOUNDS_PADDING, Math.min(SVG_WIDTH - BOUNDS_PADDING, node.x));
				node.y = Math.max(BOUNDS_PADDING, Math.min(SVG_HEIGHT - BOUNDS_PADDING, node.y));
			}
		}

		for (const node of working) {
			positions.set(node.id, { x: node.x, y: node.y });
		}
		return positions;
	}

	let nodePositions = $derived.by(() => simulateForceLayout(graphNodes, graphEdges, folderCenters));

	$effect(() => {
		if (graphNodes.length === 0) {
			selectedNodeId = '';
			return;
		}
		if (!selectedNodeId || !graphNodeIdSet.has(selectedNodeId)) {
			selectedNodeId = String(graphNodes[0]!.id);
		}
	});

	let selectedNode = $derived.by(() => {
		if (!selectedNodeId) return null;
		return graphNodes.find((node) => String(node.id) === selectedNodeId) ?? null;
	});

	let selectedOutbound = $derived.by(() => {
		if (!selectedNode) return [] as Array<{ id: string; title: string }>;
		const linked = graphEdges
			.filter((edge) => edge.sourceId === String(selectedNode.id))
			.map((edge) => noteById.get(edge.targetId as Note['id']))
			.filter((note): note is Note => !!note)
			.map((note) => ({ id: String(note.id), title: note.title }));
		return linked.slice(0, 10);
	});

	let selectedInbound = $derived.by(() => {
		if (!selectedNode) return [] as Array<{ id: string; title: string }>;
		const linked = graphEdges
			.filter((edge) => edge.targetId === String(selectedNode.id))
			.map((edge) => noteById.get(edge.sourceId as Note['id']))
			.filter((note): note is Note => !!note)
			.map((note) => ({ id: String(note.id), title: note.title }));
		return linked.slice(0, 10);
	});

	function openNote(id: string): void {
		void goto(resolve(`/knowledge/notes/${id}`));
	}

	function previewText(content: string): string {
		const collapsed = content.replace(/\s+/g, ' ').trim();
		if (collapsed.length <= 220) return collapsed || 'No preview content.';
		return `${collapsed.slice(0, 220)}...`;
	}
</script>

<div class="mx-auto max-w-[1280px] p-6">
	<header class="mb-5">
		<h1 class="text-2xl font-bold text-ink" style="font-family: var(--font-serif)">Link Graph</h1>
		<p class="mt-1 text-sm text-ink-muted">
			Force-directed exploration of note relationships with folder clustering and weighted links.
		</p>
	</header>

	<section class="mb-4 grid gap-2 rounded-lg border border-border bg-surface p-3 md:grid-cols-4">
		<input
			type="text"
			bind:value={query}
			aria-label="Filter graph notes by text"
			placeholder="Highlight matching notes..."
			class="rounded border border-border bg-surface-alt px-2 py-1.5 text-sm text-ink"
		/>
		<select
			bind:value={selectedFolder}
			aria-label="Filter graph by folder"
			class="rounded border border-border bg-surface-alt px-2 py-1.5 text-sm text-ink"
		>
			<option value="">All folders</option>
			{#each folders as folder (folder)}
				<option value={folder}>{folder}</option>
			{/each}
		</select>
		<select
			bind:value={selectedTag}
			aria-label="Filter graph by tag"
			class="rounded border border-border bg-surface-alt px-2 py-1.5 text-sm text-ink"
		>
			<option value="">All tags</option>
			{#each tags as tag (tag)}
				<option value={tag}>{tag}</option>
			{/each}
		</select>
		<label
			class="flex items-center gap-2 rounded border border-border bg-surface-alt px-2 py-1.5 text-sm text-ink"
		>
			<input type="checkbox" bind:checked={hideIsolated} />
			Hide isolated
		</label>
	</section>

	<section class="mb-4 flex flex-wrap items-center gap-2 text-xs">
		{#each tags.slice(0, 8) as tag (tag)}
			<span class="rounded-full border border-border px-2 py-0.5 text-ink-muted">
				<span
					class="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle"
					style={`background:${colorForTag(tag)};`}
				></span>
				{tag}
			</span>
		{/each}
		{#if tags.length === 0}
			<span class="text-ink-muted">No tags found for color coding yet.</span>
		{/if}
	</section>

	<section class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
		<div class="rounded-lg border border-border bg-surface p-3">
			<div class="mb-2 flex flex-wrap items-center gap-3 text-xs text-ink-muted">
				<span>{graphNodes.length} nodes</span>
				<span>{graphEdges.length} edges</span>
				<span>{qualityReport.orphanNoteIds.length} orphans</span>
				<span>{qualityReport.highCentrality.length} hubs</span>
				<span>{qualityReport.totals.brokenLinks} broken</span>
				<span>{Math.round(qualityReport.totals.crossFolderLinkDensity * 100)}% cross-folder</span>
			</div>
			{#if graphNodes.length === 0}
				<p class="text-sm text-ink-muted">
					No nodes match the active folder/tag/isolation filters.
				</p>
			{:else}
				<div class="overflow-x-auto">
					<svg
						viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
						class="min-w-[900px] rounded border border-border bg-bg"
						aria-label="Visual link graph"
					>
						{#each graphEdges as edge (edge.sourceId + '->' + edge.targetId)}
							{@const sourcePos = nodePositions.get(edge.sourceId)}
							{@const targetPos = nodePositions.get(edge.targetId)}
							{#if sourcePos && targetPos}
								<line
									x1={sourcePos.x}
									y1={sourcePos.y}
									x2={targetPos.x}
									y2={targetPos.y}
									stroke="currentColor"
									stroke-width={Math.min(5, 1 + Math.log2(edge.count + 1))}
									class="text-ink-faint/35/45"
									opacity={Math.min(0.85, 0.3 + edge.count * 0.12)}
								/>
							{/if}
						{/each}

						{#each graphNodes as node (node.id)}
							{@const pos = nodePositions.get(String(node.id))}
							{#if pos}
								<g
									role="button"
									tabindex="0"
									aria-label={node.title}
									onclick={() => (selectedNodeId = String(node.id))}
									onkeydown={(event) => {
										if (event.key === 'Enter' || event.key === ' ') {
											selectedNodeId = String(node.id);
										}
									}}
									class="cursor-pointer"
									opacity={query.trim() && !node.matchesQuery ? 0.28 : 1}
								>
									<circle
										cx={pos.x}
										cy={pos.y}
										r={Math.min(22, 7 + node.inbound + node.outbound)}
										fill={colorForTag(node.tags[0] ?? '')}
										stroke={selectedNodeId === String(node.id) ? '#1f2937' : '#11182755'}
										stroke-width={selectedNodeId === String(node.id) ? 2.2 : 1.1}
									/>
									<text x={pos.x} y={pos.y + 28} text-anchor="middle" class="fill-ink text-xs">
										{node.title.length > 18 ? `${node.title.slice(0, 18)}...` : node.title}
									</text>
								</g>
							{/if}
						{/each}
					</svg>
				</div>
			{/if}
		</div>

		<aside class="rounded-lg border border-border bg-surface p-4">
			{#if !selectedNode}
				<p class="text-sm text-ink-muted">Select a node to inspect it.</p>
			{:else}
				<h2 class="text-sm font-semibold text-ink">{selectedNode.title}</h2>
				<p class="mt-1 text-xs text-ink-faint">
					{String(selectedNode.folder)}
				</p>
				<p class="mt-3 text-xs text-ink-muted">
					{previewText(selectedNode.content)}
				</p>

				<div class="mt-3 flex flex-wrap items-center gap-2 text-xs">
					<span class="rounded bg-surface-alt px-2 py-0.5">in {selectedNode.inbound}</span>
					<span class="rounded bg-surface-alt px-2 py-0.5">out {selectedNode.outbound}</span>
					{#if selectedNode.hubScore > 0}
						<span
							class="rounded bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200"
							>hub {selectedNode.hubScore.toFixed(3)}</span
						>
					{/if}
				</div>

				<div class="mt-3">
					<Button variant="secondary" size="sm" onclick={() => openNote(String(selectedNode.id))}>
						Open note
					</Button>
				</div>

				<div class="mt-4 space-y-3">
					<div>
						<p class="text-xs font-medium text-ink">Outbound</p>
						{#if selectedOutbound.length === 0}
							<p class="mt-1 text-xs text-ink-muted">No outbound links.</p>
						{:else}
							<ul class="mt-1 space-y-1">
								{#each selectedOutbound as entry (entry.id)}
									<li>
										<button
											type="button"
											class="text-xs text-accent hover:underline"
											onclick={() => (selectedNodeId = entry.id)}
										>
											{entry.title}
										</button>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
					<div>
						<p class="text-xs font-medium text-ink">Inbound</p>
						{#if selectedInbound.length === 0}
							<p class="mt-1 text-xs text-ink-muted">No inbound links.</p>
						{:else}
							<ul class="mt-1 space-y-1">
								{#each selectedInbound as entry (entry.id)}
									<li>
										<button
											type="button"
											class="text-xs text-accent hover:underline"
											onclick={() => (selectedNodeId = entry.id)}
										>
											{entry.title}
										</button>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				</div>
			{/if}
		</aside>
	</section>
</div>
