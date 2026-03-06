<script lang="ts">
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
				path: `${resolve('/atlas/maps')}?map=${encodeURIComponent(entry.mapId)}`,
				hasChildren: false,
				dimmed: noteIds.length === 0,
			};
		});
		return withChildren(base).slice(0, 120);
	});

	const activeMapId = $derived.by(() => {
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

<nav class="space-y-2 pb-2" aria-label="Local navigation: Atlas panel">
	<CollapsibleLocalNavSection section="atlas" sectionId="map-hierarchy" title="Map Hierarchy">
		<LocalNavTree
			ariaLabel="Atlas map hierarchy"
			emptyLabel="No map hierarchy yet"
			entries={mapTreeNodes}
			activeId={routeParts.path === '/atlas/maps' ? activeMapId : null}
			onselect={(entry) => navigateToPath(entry.path)}
		/>
	</CollapsibleLocalNavSection>
</nav>
