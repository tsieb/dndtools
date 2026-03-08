<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import CollapsibleLocalNavSection from '$lib/ui/layout/local-nav/CollapsibleLocalNavSection.svelte';
	import LocalNavTree from '$lib/ui/layout/local-nav/LocalNavTree.svelte';
	import Icon from '$lib/ui/common/Icon.svelte';
	import type { LocalNavTreeEntry } from '$lib/ui/layout/local-nav/LocalNavTree.svelte';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { vaultState } from '$lib/state/vault.svelte.js';
	import { searchState } from '$lib/state/search.svelte.js';
	import { playerModeState } from '$lib/state/player-mode.svelte.js';
	import { mapsState } from '$lib/state/maps.svelte.js';
	import { navigationState } from '$lib/state/navigation.svelte.js';
	import { isNoteVisibleInPlayerMode } from '$lib/domain/visibility.js';
	import { mapDescendantIds, mapHierarchyEntries, noteMapIds } from '$lib/domain/map-atlas.js';
	import type { RecentNavigationItem } from '$lib/state/navigation.svelte.js';
	import { ui } from '$lib/state/ui.svelte.js';
	import { layoutState } from '$lib/state/layout.svelte.js';
	import { showDesktopNativeContextMenu } from '$lib/platform/desktop/bridge.js';

	type KnowledgeMode = 'browse' | 'recent' | 'saved';
	type TreeMode = 'folder' | 'map';

	interface TreeNode {
		id: string;
		label: string;
		depth: number;
		count: number;
		path: string;
		hasChildren: boolean;
		dimmed: boolean;
	}

	interface CollectionPill {
		id: string;
		name: string;
		query: string;
		scope: string;
		isSmart: boolean;
	}

	let knowledgeMode = $state<KnowledgeMode>('browse');
	let treeMode = $state<TreeMode>('folder');

	const activeRoute = $derived(navigationState.activeRoute);
	const routeParts = $derived.by(() => {
		const [path = '/knowledge', query = ''] = activeRoute.split('?');
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
	const modeScopedPinnedNotes = $derived.by(() =>
		playerModeState.enabled
			? notesState.pinnedNotes.filter((note) => isNoteVisibleInPlayerMode(note))
			: notesState.pinnedNotes,
	);
	const modeScopedTagCounts = $derived.by(() => {
		if (!playerModeState.enabled) return vaultState.tagCounts;
		const counts: Record<string, number> = {};
		for (const note of modeScopedNotes) {
			for (const tag of note.tags) {
				counts[tag] = (counts[tag] ?? 0) + 1;
			}
		}
		return Object.entries(counts)
			.map(([name, count]) => ({ name, count }))
			.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
	});
	const modeScopedFolderTree = $derived.by(() => {
		if (!playerModeState.enabled) {
			return vaultState.folders
				.filter((folder) => folder.id !== '/')
				.sort((a, b) => a.id.localeCompare(b.id))
				.map((folder) => ({
					id: folder.id,
					noteCount: folder.noteCount,
				}));
		}
		const counts: Record<string, number> = {};
		for (const note of modeScopedNotes) {
			const raw = String(note.folder);
			const normalized = raw.startsWith('/') ? raw : `/${raw}`;
			counts[normalized] = (counts[normalized] ?? 0) + 1;
		}
		return Object.entries(counts)
			.map(([id, noteCount]) => ({ id, noteCount }))
			.sort((a, b) => a.id.localeCompare(b.id));
	});

	const folderTreeNodes = $derived.by<TreeNode[]>(() => {
		const base = modeScopedFolderTree.map((folder) => {
			const parts = folder.id.split('/').filter(Boolean);
			const depth = Math.max(0, parts.length - 1);
			return {
				id: `folder:${folder.id}`,
				label: parts[parts.length - 1] ?? folder.id,
				depth,
				count: folder.noteCount,
				path: `${resolve('/knowledge/notes')}?folder=${encodeURIComponent(folder.id)}`,
				hasChildren: false,
				dimmed: folder.noteCount === 0,
			};
		});
		return withChildren(base).slice(0, 120);
	});

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
				path: `${resolve('/knowledge/notes')}?mapId=${encodeURIComponent(entry.mapId)}`,
				hasChildren: false,
				dimmed: noteIds.length === 0,
			};
		});
		return withChildren(base).slice(0, 120);
	});

	const recentNotes = $derived(
		modeScopedNotes
			.filter((note) => !note.pinned)
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
			.slice(0, 10),
	);
	const recentItems = $derived.by(() =>
		navigationState.recentItems
			.map((item) => toRecentRow(item))
			.filter((item): item is NonNullable<typeof item> => !!item)
			.slice(0, 10),
	);
	const pinnedNotes = $derived(modeScopedPinnedNotes.slice(0, 20));
	const collectionPills = $derived.by<CollectionPill[]>(() => {
		const saved = searchState.savedSearches.map((entry) => ({
			id: `saved:${entry.id}`,
			name: entry.name,
			query: entry.query,
			scope: inferSearchScope(entry.query),
			isSmart: false,
		}));
		const smart = searchState.smartCollections.map((entry) => ({
			id: `smart:${entry.id}`,
			name: entry.name,
			query: entry.query,
			scope: inferSearchScope(entry.query),
			isSmart: true,
		}));
		return [...saved, ...smart].slice(0, 16);
	});

	const activeFolderId = $derived.by(() => {
		const folder = routeParts.searchParams.get('folder');
		return folder ? `folder:${folder}` : null;
	});
	const activeMapId = $derived.by(() => {
		const mapId = routeParts.searchParams.get('mapId');
		return mapId ? `map:${mapId}` : null;
	});

	$effect(() => {
		if (!searchState.loaded && !searchState.loading) {
			void searchState.loadSavedSearches();
		}
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

	function noteIsActive(noteId: string): boolean {
		const base = resolve(`/knowledge/notes/${noteId}`);
		return routeParts.path === base || routeParts.path === `${base}/edit`;
	}

	function noteButtonClass(noteId: string): string {
		return noteIsActive(noteId)
			? 'border-l-2 border-accent bg-accent-subtle/70 pl-2 text-accent'
			: 'border-l-2 border-transparent';
	}

	function closeOnMobile(): void {
		if (layoutState.isCompact) {
			ui.sidebarOpen = false;
		}
	}

	function navigateToPath(path: string): void {
		goto(path);
		closeOnMobile();
	}

	function navigateToNote(id: string): void {
		navigateToPath(resolve(`/knowledge/notes/${id}`));
	}

	function openCollection(query: string): void {
		navigateToPath(`${resolve('/knowledge/search')}?q=${encodeURIComponent(query)}`);
	}

	function toRecentRow(item: RecentNavigationItem): {
		id: string;
		kind: RecentNavigationItem['kind'];
		title: string;
		subtitle: string;
		path: string;
	} | null {
		if (item.kind === 'note' || item.kind === 'entity') {
			const note = item.noteId ? notesState.getActiveNoteById(item.noteId) : null;
			if (!note) return null;
			if (playerModeState.enabled && !isNoteVisibleInPlayerMode(note)) return null;
			return {
				id: `${item.kind}:${String(note.id)}`,
				kind: item.kind,
				title: note.title,
				subtitle: item.kind === 'entity' ? 'Entity' : 'Note',
				path: resolve(`/knowledge/notes/${note.id}`),
			};
		}
		return {
			id: `map:${item.itemId}`,
			kind: 'map',
			title: item.label,
			subtitle: 'Map',
			path: item.path,
		};
	}

	function recentKindBadge(kind: RecentNavigationItem['kind']): string {
		if (kind === 'entity') return 'EN';
		if (kind === 'map') return 'MP';
		return 'NT';
	}

	function inferSearchScope(query: string): string {
		const normalized = query.trim().toLowerCase();
		const folderMatch = normalized.match(/\bfolder:([^\s]+)/);
		if (folderMatch?.[1]) return `Folder ${folderMatch[1]}`;
		const typeMatch = normalized.match(/\btype:([^\s]+)/);
		if (typeMatch?.[1]) return `Type ${typeMatch[1]}`;
		const tagMatch = normalized.match(/\btag:([^\s]+)/);
		if (tagMatch?.[1]) return `Tag ${tagMatch[1]}`;
		return 'All notes';
	}

	function activateTab(mode: KnowledgeMode): void {
		knowledgeMode = mode;
	}

	async function handleFolderContextRequest(
		entry: LocalNavTreeEntry,
		event: MouseEvent,
	): Promise<void> {
		if (typeof window === 'undefined' || !window.dndtoolsDesktop) return;
		if (!entry.id.startsWith('folder:')) return;
		const folder = entry.id.slice('folder:'.length) || '/';
		const result = await showDesktopNativeContextMenu({
			kind: 'folder',
			folder,
			x: Math.round(event.clientX),
			y: Math.round(event.clientY),
		});
		if (!result) return;
		if (result.action === 'open-folder') {
			navigateToPath(entry.path);
			return;
		}
		if (result.action === 'new-note') {
			navigateToPath(
				`${resolve('/knowledge/notes')}?folder=${encodeURIComponent(folder)}&create=${encodeURIComponent('New Note')}`,
			);
		}
	}

	function tabClass(mode: KnowledgeMode): string {
		return knowledgeMode === mode
			? 'bg-accent-subtle text-accent'
			: 'text-ink-muted hover:bg-surface-alt';
	}

	const browsePanelId = 'knowledge-panel-browse';
	const recentPanelId = 'knowledge-panel-recent';
	const savedPanelId = 'knowledge-panel-saved';
</script>

<nav class="space-y-2" aria-label="Local navigation: Knowledge panel">
	<div class="px-3 pt-2">
		<div
			class="grid grid-cols-3 gap-1 rounded-md border border-border bg-surface p-1"
			role="tablist"
			aria-label="Knowledge panel mode tabs"
		>
			<button
				id="knowledge-tab-browse"
				type="button"
				class="flex items-center justify-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors {tabClass(
					'browse',
				)}"
				role="tab"
				aria-selected={knowledgeMode === 'browse'}
				aria-controls={browsePanelId}
				tabindex={knowledgeMode === 'browse' ? 0 : -1}
				onclick={() => activateTab('browse')}
			>
				<Icon name="list" size="xs" />
				<span>Browse</span>
			</button>
			<button
				id="knowledge-tab-recent"
				type="button"
				class="flex items-center justify-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors {tabClass(
					'recent',
				)}"
				role="tab"
				aria-selected={knowledgeMode === 'recent'}
				aria-controls={recentPanelId}
				tabindex={knowledgeMode === 'recent' ? 0 : -1}
				onclick={() => activateTab('recent')}
			>
				<Icon name="clock" size="xs" />
				<span>Recent</span>
			</button>
			<button
				id="knowledge-tab-saved"
				type="button"
				class="flex items-center justify-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors {tabClass(
					'saved',
				)}"
				role="tab"
				aria-selected={knowledgeMode === 'saved'}
				aria-controls={savedPanelId}
				tabindex={knowledgeMode === 'saved' ? 0 : -1}
				onclick={() => activateTab('saved')}
			>
				<Icon name="bookmark" size="xs" />
				<span>Saved</span>
			</button>
		</div>
	</div>

	{#if knowledgeMode === 'browse'}
		<div id={browsePanelId} role="tabpanel" aria-labelledby="knowledge-tab-browse" class="pb-2">
			<CollapsibleLocalNavSection section="knowledge" sectionId="folder-tree" title="Folder Tree">
				<div class="mb-2 flex items-center justify-between px-2.5">
					<p class="text-xs uppercase tracking-wider text-ink-faint">
						{treeMode === 'folder' ? 'Folder hierarchy' : 'Map hierarchy'}
					</p>
					<button
						type="button"
						class="rounded border border-border px-1.5 py-0.5 text-2xs text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-surface-alt"
						onclick={() => (treeMode = treeMode === 'folder' ? 'map' : 'folder')}
					>
						{treeMode === 'folder' ? 'Map view' : 'Folder view'}
					</button>
				</div>
				{#if treeMode === 'folder'}
					<LocalNavTree
						ariaLabel="Knowledge folder tree"
						emptyLabel="No folders yet"
						entries={folderTreeNodes}
						activeId={routeParts.path === '/knowledge/notes' ? activeFolderId : null}
						onselect={(entry) => navigateToPath(entry.path)}
						oncontextrequest={(entry, event) => void handleFolderContextRequest(entry, event)}
					/>
				{:else}
					<LocalNavTree
						ariaLabel="Knowledge map hierarchy"
						emptyLabel="No map hierarchy yet"
						entries={mapTreeNodes}
						activeId={routeParts.path === '/knowledge/notes' ? activeMapId : null}
						onselect={(entry) => navigateToPath(entry.path)}
					/>
				{/if}
			</CollapsibleLocalNavSection>

			<CollapsibleLocalNavSection
				section="knowledge"
				sectionId="tags"
				title="Tags"
				defaultCollapsed={true}
			>
				{#if modeScopedTagCounts.length === 0}
					<p class="px-2.5 py-1.5 text-xs text-ink-faint">No tags yet</p>
				{:else}
					<div class="flex flex-wrap gap-1 px-2.5">
						{#each modeScopedTagCounts.slice(0, 18) as tag (tag.name)}
							<button
								type="button"
								class="sidebar-tag-pill inline-flex items-center rounded-full bg-accent-subtle px-2 py-0.5 text-xs text-accent transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-accent/20"
								onclick={() =>
									navigateToPath(
										`${resolve('/knowledge/notes')}?tag=${encodeURIComponent(tag.name)}`,
									)}
							>
								{tag.name}
								<span class="ml-0.5 opacity-60">{tag.count}</span>
							</button>
						{/each}
					</div>
				{/if}
			</CollapsibleLocalNavSection>
		</div>
	{:else if knowledgeMode === 'recent'}
		<div id={recentPanelId} role="tabpanel" aria-labelledby="knowledge-tab-recent" class="pb-2">
			<CollapsibleLocalNavSection section="knowledge" sectionId="recent-history" title="Recent">
				<div class="density-list">
					{#if recentItems.length === 0}
						<p class="px-2.5 py-1.5 text-xs text-ink-faint">No visit history yet</p>
					{:else}
						{#each recentItems as item (item.id)}
							<button
								type="button"
								class="flex w-full items-center gap-2 rounded-md border-l-2 border-transparent px-2.5 py-1.5 text-left text-sm text-ink transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-bg {activeRoute ===
								item.path
									? 'border-accent bg-accent-subtle/70 text-accent'
									: ''}"
								onclick={() => navigateToPath(item.path)}
								title={item.title}
							>
								<span
									class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-2xs font-semibold text-ink-faint"
									>{recentKindBadge(item.kind)}</span
								>
								<span class="min-w-0 flex-1 truncate">{item.title}</span>
								<span class="text-2xs uppercase text-ink-faint">{item.subtitle}</span>
							</button>
						{/each}
					{/if}
				</div>
			</CollapsibleLocalNavSection>

			<CollapsibleLocalNavSection
				section="knowledge"
				sectionId="recent-updated"
				title="Recently Updated"
			>
				<div class="density-list">
					{#if recentNotes.length === 0}
						<p class="px-2.5 py-1.5 text-xs text-ink-faint">No recently updated notes</p>
					{:else}
						{#each recentNotes as note (note.id)}
							<button
								type="button"
								class="w-full rounded-md px-2.5 py-1.5 text-left text-sm text-ink transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-bg {noteButtonClass(
									note.id,
								)}"
								onclick={() => navigateToNote(note.id)}
								title={note.title}
							>
								<span class="truncate">{note.title}</span>
							</button>
						{/each}
					{/if}
				</div>
			</CollapsibleLocalNavSection>
		</div>
	{:else}
		<div id={savedPanelId} role="tabpanel" aria-labelledby="knowledge-tab-saved" class="pb-2">
			<CollapsibleLocalNavSection section="knowledge" sectionId="pinned-notes" title="Pinned Notes">
				<div class="density-list">
					{#if pinnedNotes.length === 0}
						<p class="px-2.5 py-1.5 text-xs text-ink-faint">
							Pin notes to keep them in quick reach
						</p>
					{:else}
						{#each pinnedNotes as note (note.id)}
							<button
								type="button"
								class="w-full rounded-md px-2.5 py-1.5 text-left text-sm text-ink transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-bg {noteButtonClass(
									note.id,
								)}"
								onclick={() => navigateToNote(note.id)}
								title={note.title}
							>
								<span class="truncate">{note.title}</span>
							</button>
						{/each}
					{/if}
				</div>
			</CollapsibleLocalNavSection>

			<CollapsibleLocalNavSection
				section="knowledge"
				sectionId="collections"
				title="Collections"
				defaultCollapsed={true}
			>
				{#if collectionPills.length === 0}
					<p class="px-2.5 py-1.5 text-xs text-ink-faint">Save searches to create collections</p>
				{:else}
					<div class="flex flex-wrap gap-1.5 px-2.5">
						{#each collectionPills as collection (collection.id)}
							<button
								type="button"
								class="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-surface px-2 py-1 text-xs text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:border-accent hover:text-ink"
								onclick={() => openCollection(collection.query)}
								title={collection.query}
							>
								<span class="text-2xs" aria-hidden="true"
									>{collection.isSmart ? '\u2726' : '\u25CF'}</span
								>
								<span class="truncate">{collection.name}</span>
								<span
									class="rounded-full bg-surface-alt px-1 py-0.5 text-2xs uppercase text-ink-faint"
									>{collection.scope}</span
								>
							</button>
						{/each}
					</div>
				{/if}
			</CollapsibleLocalNavSection>
		</div>
	{/if}
</nav>
