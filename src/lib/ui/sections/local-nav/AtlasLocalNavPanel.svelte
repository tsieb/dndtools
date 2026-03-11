<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import CollapsibleLocalNavSection from '$lib/ui/layout/local-nav/CollapsibleLocalNavSection.svelte';
	import LocalNavTree from '$lib/ui/layout/local-nav/LocalNavTree.svelte';
	import { mapsState } from '$lib/state/maps.svelte.js';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { playerModeState } from '$lib/state/player-mode.svelte.js';
	import { navigationState } from '$lib/state/navigation.svelte.js';
	import { ui } from '$lib/state/ui.svelte.js';
	import { layoutState } from '$lib/state/layout.svelte.js';
	import { mapDescendantIds, mapHierarchyEntries, noteMapIds } from '$lib/domain/map-atlas.js';
	import { isNoteVisibleInPlayerMode } from '$lib/domain/visibility.js';

	interface TreeNode {
		id: string;
		label: string;
		depth: number;
		count: number;
		path: string;
		hasChildren: boolean;
		dimmed: boolean;
	}

	let filterQuery = $state('');

	const activeRoute = $derived(navigationState.activeRoute);
	const routeParts = $derived.by(() => {
		const [path = '/atlas/maps', query = ''] = activeRoute.split('?');
		return {
			path,
			searchParams: new URLSearchParams(query),
		};
	});

	const modeScopedNotes = $derived.by(() =>
		playerModeState.enabled
			? notesState.activeNotes.filter((note) => isNoteVisibleInPlayerMode(note))
			: notesState.activeNotes,
	);

	const mapTreeNodes = $derived.by<TreeNode[]>(() => {
		const hierarchy = mapHierarchyEntries(mapsState.maps);
		if (hierarchy.length === 0) return [];
		const noteIdsByMap: Record<string, string[]> = {};
		for (const note of modeScopedNotes) {
			for (const mapId of noteMapIds(note, mapsState.maps)) {
				const noteId = String(note.id);
				const bucket = noteIdsByMap[mapId] ?? [];
				if (!bucket.includes(noteId)) {
					bucket.push(noteId);
				}
				noteIdsByMap[mapId] = bucket;
			}
		}

		const byId: Record<string, (typeof hierarchy)[number]> = {};
		for (const entry of hierarchy) {
			byId[entry.mapId] = entry;
		}

		const base = hierarchy.map((entry) => {
			const noteIds: string[] = [];
			for (const scopedMapId of mapDescendantIds(entry.mapId, mapsState.maps)) {
				for (const noteId of noteIdsByMap[scopedMapId] ?? []) {
					if (!noteIds.includes(noteId)) {
						noteIds.push(noteId);
					}
				}
			}
			return {
				id: `map:${entry.mapId}`,
				label: entry.name,
				depth: entry.depth,
				count: noteIds.length,
				path: resolve(`/atlas/maps/${encodeURIComponent(entry.mapId)}`),
				hasChildren: false,
				dimmed: noteIds.length === 0,
			};
		});

		const query = filterQuery.trim().toLowerCase();
		if (!query) return withChildren(base).slice(0, 120);

		const includedMapIds = new SvelteSet<string>();
		for (const entry of hierarchy) {
			if (!entry.name.toLowerCase().includes(query)) continue;
			let cursor: string | null = entry.mapId;
			while (cursor) {
				includedMapIds.add(cursor);
				cursor = byId[cursor]?.parentMapId ?? null;
			}
		}

		const filtered = base.filter((entry) => includedMapIds.has(entry.id.replace('map:', '')));
		return withChildren(filtered).slice(0, 120);
	});

	const activeMapId = $derived.by(() => {
		const routeMatch = routeParts.path.match(/^\/atlas\/maps\/([^/]+)$/);
		if (routeMatch?.[1]) return `map:${decodeURIComponent(routeMatch[1])}`;
		const mapId = routeParts.searchParams.get('map');
		return mapId ? `map:${mapId}` : null;
	});

	$effect(() => {
		if (!mapsState.loaded && !mapsState.loading) {
			void mapsState.loadAll();
		}
	});

	function withChildren(nodes: TreeNode[]): TreeNode[] {
		const next = nodes.map((entry) => ({ ...entry }));
		for (let i = 0; i < next.length; i += 1) {
			const current = next[i];
			if (!current) continue;
			const following = next[i + 1];
			current.hasChildren = !!following && following.depth > current.depth;
		}
		return next;
	}

	function navigateToPath(path: string): void {
		goto(path);
		if (layoutState.isCompact) {
			ui.sidebarOpen = false;
		}
	}
</script>

<nav class="space-y-2 pb-2" aria-label="Atlas navigation">
	<CollapsibleLocalNavSection section="atlas" sectionId="map-hierarchy" title="Map Hierarchy">
		<div class="mb-2 px-1">
			<label class="sr-only" for="atlas-map-tree-filter">Filter maps</label>
			<input
				id="atlas-map-tree-filter"
				type="text"
				placeholder="Filter maps"
				aria-label="Filter maps"
				bind:value={filterQuery}
				class="w-full rounded border border-border bg-surface-alt px-2 py-1.5 text-xs text-ink"
			/>
		</div>
		<LocalNavTree
			ariaLabel="Atlas map hierarchy"
			emptyLabel={filterQuery.trim() ? 'No matching maps' : 'No map hierarchy yet'}
			entries={mapTreeNodes}
			activeId={activeMapId}
			highlightQuery={filterQuery}
			onselect={(entry) => navigateToPath(entry.path)}
		/>
	</CollapsibleLocalNavSection>
</nav>
