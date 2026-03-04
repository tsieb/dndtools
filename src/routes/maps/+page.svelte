<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { mapsState } from '$lib/state/maps.svelte.js';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { toastState } from '$lib/state/toast.svelte.js';
	import {
		importDesktopMapFromDialog,
		resolveDesktopMapAssetUrl,
	} from '$lib/platform/desktop/bridge.js';
	import { reportRuntimeError } from '$lib/runtime/diagnostics.js';
	import {
		filterMapObjects,
		formatMapScaleLabel,
		normalizeMapTagInput,
	} from '$lib/domain/map-library.js';
	import { noteToVaultObject } from '$lib/domain/object-notes.js';
	import { normalizeMapData, summarizeVaultObject } from '$lib/domain/objects.js';
	import { generateVaultObjectId } from '$lib/utils/id.js';
	import { nowISO } from '$lib/utils/date.js';
	import type { MapObject, MapViewportData } from '$lib/types/object.js';
	import MapCanvasViewer from '$lib/ui/maps/MapCanvasViewer.svelte';

	let mapAssetUrls = $state<Record<string, string | null>>({});
	let importing = $state(false);
	let saving = $state(false);

	const maps = $derived(mapsState.maps);
	const loading = $derived(mapsState.loading);
	const error = $derived(mapsState.error);

	let query = $state('');
	let selectedTag = $state('');
	let selectedAreaNoteId = $state('');
	let selectedMapId = $state<string | null>(null);
	let viewerKey = $state(0);

	let draftName = $state('');
	let draftTags = $state('');
	let draftAreaNoteId = $state('');
	let draftScaleEnabled = $state(false);
	let draftScaleUnits = $state('5');
	let draftScaleUnitLabel = $state('ft');
	let draftGridType = $state<'square' | 'hex'>('square');
	let draftGridCellSize = $state('70');
	let draftGridOriginX = $state('0');
	let draftGridOriginY = $state('0');
	let draftGridVisible = $state(true);
	let runtimeShowGrid = $state(true);
	let editGridHandles = $state(false);
	let draftInitialViewport = $state<MapViewportData | null>(null);
	let draftImageSize = $state<{ width: number; height: number } | null>(null);
	let dirty = $state(false);
	let draftSourceKey = $state<string | null>(null);
	let reportedLoadError = $state<string | null>(null);

	const desktopAvailable = $derived(
		typeof window !== 'undefined' && typeof window.dndtoolsDesktop !== 'undefined',
	);

	const locationNotes = $derived.by(() =>
		notesState.activeNotes
			.filter((note) => noteToVaultObject(note)?.type === 'location')
			.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })),
	);

	const areaLabelByNoteId = $derived.by(() => {
		const labels: Record<string, string> = {};
		for (const note of locationNotes) {
			labels[String(note.id)] = note.title;
		}
		return labels;
	});

	const tagOptions = $derived.by(() =>
		[...new Set(maps.flatMap((map) => map.tags.map((tag) => tag.trim()).filter(Boolean)))].sort(
			(a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }),
		),
	);

	const areaOptions = $derived.by(() =>
		[...new Set(maps.map((map) => map.data.areaNoteId?.trim() ?? '').filter(Boolean))]
			.map((id) => ({
				id,
				label: areaLabelByNoteId[id] ?? id,
			}))
			.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })),
	);

	const filteredMaps = $derived.by(() =>
		filterMapObjects(
			maps,
			{
				query,
				tag: selectedTag || undefined,
				areaNoteId: selectedAreaNoteId || undefined,
			},
			areaLabelByNoteId,
		),
	);

	const selectedMap = $derived.by(
		() => filteredMaps.find((entry) => String(entry.id) === selectedMapId) ?? null,
	);

	const selectedMapAssetUrl = $derived.by(() =>
		selectedMap ? (mapAssetUrls[String(selectedMap.id)] ?? null) : null,
	);

	const gridDraft = $derived.by(() => ({
		type: draftGridType,
		visible: draftGridVisible,
		originX: Number.parseFloat(draftGridOriginX) || 0,
		originY: Number.parseFloat(draftGridOriginY) || 0,
		cellSize: Math.max(4, Number.parseFloat(draftGridCellSize) || 70),
	}));

	const scaleLabel = $derived.by(() =>
		draftScaleEnabled
			? formatMapScaleLabel({
					unitsPerGridSquare: Number.parseFloat(draftScaleUnits) || 0,
					unitLabel: draftScaleUnitLabel,
				})
			: null,
	);

	function isAbsoluteUrl(value: string): boolean {
		return /^(https?:\/\/|file:\/\/|data:|blob:)/i.test(value.trim());
	}

	function markDirty(): void {
		dirty = true;
	}

	function areaLabelForMap(map: MapObject): string {
		const id = map.data.areaNoteId?.trim();
		if (!id) return 'Unlinked';
		return areaLabelByNoteId[id] ?? id;
	}

	function resetDraftFromSelectedMap(map: MapObject): void {
		draftName = map.name;
		draftTags = map.tags.join(', ');
		draftAreaNoteId = map.data.areaNoteId ?? '';
		draftScaleEnabled = !!map.data.scale;
		draftScaleUnits = map.data.scale?.unitsPerGridSquare
			? String(map.data.scale.unitsPerGridSquare)
			: '5';
		draftScaleUnitLabel = map.data.scale?.unitLabel ?? 'ft';
		draftGridType = map.data.grid?.type ?? 'square';
		draftGridCellSize = map.data.grid?.cellSize ? String(map.data.grid.cellSize) : '70';
		draftGridOriginX = map.data.grid?.originX ? String(map.data.grid.originX) : '0';
		draftGridOriginY = map.data.grid?.originY ? String(map.data.grid.originY) : '0';
		draftGridVisible = map.data.grid?.visible ?? true;
		runtimeShowGrid = draftGridVisible;
		editGridHandles = false;
		draftInitialViewport = map.data.initialViewport
			? { ...map.data.initialViewport }
			: { zoom: 1, panX: 0, panY: 0 };
		draftImageSize =
			map.data.width && map.data.height ? { width: map.data.width, height: map.data.height } : null;
		dirty = false;
		viewerKey += 1;
	}

	async function resolveAssetUrl(filePath: string): Promise<string | null> {
		const normalized = filePath.trim();
		if (!normalized) return null;
		if (isAbsoluteUrl(normalized)) return normalized;
		if (desktopAvailable) {
			try {
				return await resolveDesktopMapAssetUrl(normalized);
			} catch {
				return null;
			}
		}
		return null;
	}

	async function refreshAssetUrls(nextMaps: readonly MapObject[]): Promise<void> {
		const entries = await Promise.all(
			nextMaps.map(
				async (map) => [String(map.id), await resolveAssetUrl(map.data.filePath)] as const,
			),
		);
		mapAssetUrls = Object.fromEntries(entries);
	}

	async function handleImportMap(): Promise<void> {
		if (!desktopAvailable) {
			toastState.error('Map import requires desktop mode.');
			return;
		}
		importing = true;
		try {
			const picked = await importDesktopMapFromDialog();
			if (picked.canceled) return;
			const now = nowISO();
			let object: MapObject = {
				id: generateVaultObjectId(),
				type: 'map',
				name: picked.name.trim() || 'Imported Map',
				summary: '',
				tags: ['map'],
				visibility: 'dm_only',
				relationships: [],
				createdAt: now,
				updatedAt: now,
				data: normalizeMapData({
					filePath: picked.filePath,
					mimeType: picked.mimeType,
					byteSize: picked.byteSize,
					scale: {
						unitsPerGridSquare: 5,
						unitLabel: 'ft',
					},
					grid: {
						type: 'square',
						visible: true,
						originX: 0,
						originY: 0,
						cellSize: 70,
					},
					initialViewport: {
						zoom: 1,
						panX: 0,
						panY: 0,
					},
				}),
			};
			object = {
				...object,
				summary: summarizeVaultObject(object) || 'Imported map asset',
			};
			await mapsState.saveMap(object);
			await mapsState.loadAll();
			selectedMapId = String(object.id);
			toastState.success('Map imported.');
		} catch (importError) {
			void reportRuntimeError({
				category: 'storage',
				code: 'MAP_IMPORT_FAILED',
				error: importError,
			});
			toastState.error(`Failed to import map: ${String(importError)}`);
		} finally {
			importing = false;
		}
	}

	function handleGridChange(next: {
		type: 'square' | 'hex';
		visible: boolean;
		originX: number;
		originY: number;
		cellSize: number;
	}): void {
		draftGridType = next.type;
		draftGridVisible = next.visible;
		draftGridCellSize = String(next.cellSize);
		draftGridOriginX = String(next.originX);
		draftGridOriginY = String(next.originY);
		markDirty();
	}

	function handleViewportChange(next: MapViewportData): void {
		draftInitialViewport = {
			zoom: next.zoom,
			panX: next.panX,
			panY: next.panY,
		};
		markDirty();
	}

	function handleImageInfo(info: { width: number; height: number }): void {
		draftImageSize = info;
		if (!selectedMap) return;
		if (selectedMap.data.width !== info.width || selectedMap.data.height !== info.height) {
			markDirty();
		}
	}

	async function handleSave(): Promise<void> {
		if (!selectedMap || saving) return;
		saving = true;
		try {
			const tags = normalizeMapTagInput(draftTags);
			let updated: MapObject = {
				...selectedMap,
				name: draftName.trim() || selectedMap.name,
				tags: tags.length > 0 ? tags : ['map'],
				updatedAt: nowISO(),
				data: normalizeMapData({
					...selectedMap.data,
					areaNoteId: draftAreaNoteId || undefined,
					width: draftImageSize?.width ?? selectedMap.data.width,
					height: draftImageSize?.height ?? selectedMap.data.height,
					scale: draftScaleEnabled
						? {
								unitsPerGridSquare: Number.parseFloat(draftScaleUnits) || 5,
								unitLabel: draftScaleUnitLabel.trim() || 'ft',
							}
						: undefined,
					grid: {
						type: draftGridType,
						visible: draftGridVisible,
						originX: Number.parseFloat(draftGridOriginX) || 0,
						originY: Number.parseFloat(draftGridOriginY) || 0,
						cellSize: Math.max(4, Number.parseFloat(draftGridCellSize) || 70),
					},
					initialViewport: draftInitialViewport ?? selectedMap.data.initialViewport,
				}),
				summary: '',
			};
			updated = {
				...updated,
				summary: summarizeVaultObject(updated) || selectedMap.summary || 'Map asset',
			};
			await mapsState.saveMap(updated);
			await mapsState.loadAll();
			selectedMapId = String(updated.id);
			toastState.success('Map saved.');
		} catch (saveError) {
			void reportRuntimeError({
				category: 'storage',
				code: 'MAP_SAVE_FAILED',
				error: saveError,
			});
			toastState.error(`Failed to save map: ${String(saveError)}`);
		} finally {
			saving = false;
		}
	}

	function discardDraft(): void {
		if (!selectedMap) return;
		resetDraftFromSelectedMap(selectedMap);
	}

	$effect(() => {
		void mapsState.loadAll();
	});

	$effect(() => {
		if (!error || error === reportedLoadError) return;
		reportedLoadError = error;
		void reportRuntimeError({
			category: 'storage',
			code: 'MAP_LIBRARY_LOAD_FAILED',
			error,
		});
	});

	$effect(() => {
		const activeMaps = maps;
		void refreshAssetUrls(activeMaps).catch((loadError) => {
			void reportRuntimeError({
				category: 'storage',
				code: 'MAP_LIBRARY_ASSET_URL_RESOLVE_FAILED',
				error: loadError,
			});
		});
	});

	$effect(() => {
		if (filteredMaps.length === 0) {
			selectedMapId = null;
			return;
		}
		if (!selectedMapId || !filteredMaps.some((entry) => String(entry.id) === selectedMapId)) {
			selectedMapId = String(filteredMaps[0]!.id);
		}
	});

	$effect(() => {
		const map = selectedMap;
		if (!map) {
			draftSourceKey = null;
			return;
		}
		const nextKey = `${map.id}:${map.updatedAt}`;
		if (nextKey === draftSourceKey) return;
		draftSourceKey = nextKey;
		resetDraftFromSelectedMap(map);
	});
</script>

<div class="mx-auto max-w-[1400px] p-6">
	<header class="mb-5 flex flex-wrap items-start justify-between gap-3">
		<div>
			<h1
				class="text-2xl font-bold text-ink dark:text-tavern-text"
				style="font-family: var(--font-serif)"
			>
				Map Library
			</h1>
			<p class="mt-1 text-sm text-ink-muted dark:text-tavern-muted">
				{filteredMaps.length} of {maps.length} map{maps.length === 1 ? '' : 's'}
			</p>
		</div>
		<button
			type="button"
			class="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60 dark:bg-tavern-accent dark:text-tavern-bg dark:hover:bg-tavern-accent-hover"
			onclick={() => void handleImportMap()}
			disabled={!desktopAvailable || importing}
			title={desktopAvailable ? 'Import a map image into the vault' : 'Desktop mode required'}
		>
			{importing ? 'Importing...' : 'Import Map'}
		</button>
	</header>

	<section
		class="mb-4 grid gap-2 rounded-lg border border-border bg-surface p-3 dark:border-tavern-border dark:bg-tavern-surface md:grid-cols-4"
	>
		<input
			type="text"
			bind:value={query}
			placeholder="Search maps by name, tags, area, or file path"
			aria-label="Search maps"
			class="rounded border border-border bg-surface-alt px-2 py-1.5 text-sm text-ink dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-text"
		/>
		<select
			bind:value={selectedTag}
			aria-label="Filter maps by tag"
			class="rounded border border-border bg-surface-alt px-2 py-1.5 text-sm text-ink dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-text"
		>
			<option value="">All tags</option>
			{#each tagOptions as tag (tag)}
				<option value={tag}>#{tag}</option>
			{/each}
		</select>
		<select
			bind:value={selectedAreaNoteId}
			aria-label="Filter maps by linked area"
			class="rounded border border-border bg-surface-alt px-2 py-1.5 text-sm text-ink dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-text"
		>
			<option value="">All areas</option>
			{#each areaOptions as area (area.id)}
				<option value={area.id}>{area.label}</option>
			{/each}
		</select>
		<button
			type="button"
			class="rounded border border-border px-3 py-1.5 text-sm text-ink-muted hover:bg-surface-alt dark:border-tavern-border dark:text-tavern-muted dark:hover:bg-tavern-surface-alt"
			onclick={() => {
				query = '';
				selectedTag = '';
				selectedAreaNoteId = '';
			}}
		>
			Reset filters
		</button>
	</section>

	{#if error}
		<div
			class="mb-4 rounded border border-error/40 bg-error/10 px-3 py-2 text-sm text-error dark:border-error/50"
		>
			{error}
		</div>
	{/if}

	<section
		class="rounded-lg border border-border bg-surface p-4 dark:border-tavern-border dark:bg-tavern-surface"
	>
		<h2 class="text-sm font-semibold text-ink dark:text-tavern-text">Library</h2>
		{#if loading}
			<p class="mt-2 text-sm text-ink-muted dark:text-tavern-muted">Loading maps...</p>
		{:else if filteredMaps.length === 0}
			<p class="mt-2 text-sm text-ink-muted dark:text-tavern-muted">
				{maps.length === 0
					? 'No maps in the vault yet. Import your first map image.'
					: 'No maps match the active filters.'}
			</p>
		{:else}
			<ul class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
				{#each filteredMaps as map (map.id)}
					<li>
						<button
							type="button"
							class="group w-full overflow-hidden rounded-md border text-left transition-colors {selectedMapId ===
							String(map.id)
								? 'border-accent bg-accent-subtle/40 dark:border-tavern-accent dark:bg-tavern-accent-subtle/40'
								: 'border-border bg-surface-alt hover:border-accent/60 dark:border-tavern-border dark:bg-tavern-surface-alt dark:hover:border-tavern-accent/70'}"
							onclick={() => (selectedMapId = String(map.id))}
						>
							<div class="aspect-[4/3] overflow-hidden bg-parchment/70 dark:bg-tavern-bg/70">
								{#if mapAssetUrls[String(map.id)]}
									<img
										src={mapAssetUrls[String(map.id)] ?? undefined}
										alt={map.name}
										loading="lazy"
										class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
									/>
								{:else}
									<div
										class="flex h-full items-center justify-center px-3 text-center text-xs text-ink-muted dark:text-tavern-muted"
									>
										Preview unavailable
									</div>
								{/if}
							</div>
							<div class="space-y-1 p-2.5">
								<p class="truncate text-sm font-medium text-ink dark:text-tavern-text">
									{map.name}
								</p>
								<p class="truncate text-[11px] text-ink-faint dark:text-tavern-faint">
									{areaLabelForMap(map)}
								</p>
								<div class="flex flex-wrap gap-1">
									{#each map.tags.slice(0, 3) as tag (tag)}
										<span
											class="rounded bg-surface px-1.5 py-0.5 text-[10px] text-ink-faint dark:bg-tavern-surface dark:text-tavern-faint"
										>
											#{tag}
										</span>
									{/each}
								</div>
							</div>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	{#if selectedMap}
		<section class="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
			<div
				class="rounded-lg border border-border bg-surface p-3 dark:border-tavern-border dark:bg-tavern-surface"
			>
				<div class="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
					<div class="flex flex-wrap items-center gap-2">
						<button
							type="button"
							class="rounded border border-border px-2 py-1 text-ink-muted hover:bg-surface-alt dark:border-tavern-border dark:text-tavern-muted dark:hover:bg-tavern-surface-alt"
							onclick={() => {
								runtimeShowGrid = !runtimeShowGrid;
							}}
						>
							{runtimeShowGrid ? 'Hide Grid Overlay' : 'Show Grid Overlay'}
						</button>
						<button
							type="button"
							class="rounded border border-border px-2 py-1 text-ink-muted hover:bg-surface-alt dark:border-tavern-border dark:text-tavern-muted dark:hover:bg-tavern-surface-alt"
							onclick={() => {
								editGridHandles = !editGridHandles;
								runtimeShowGrid = true;
							}}
						>
							{editGridHandles ? 'Stop Grid Alignment' : 'Align Grid'}
						</button>
					</div>
					{#if scaleLabel}
						<p class="font-medium text-ink-muted dark:text-tavern-muted">{scaleLabel}</p>
					{/if}
				</div>
				{#key `${selectedMap.id}:${viewerKey}`}
					<MapCanvasViewer
						src={selectedMapAssetUrl}
						alt={`${selectedMap.name} viewer`}
						grid={gridDraft}
						showGrid={runtimeShowGrid}
						editableGrid={editGridHandles}
						initialViewport={draftInitialViewport ?? undefined}
						ongridchange={handleGridChange}
						onviewportchange={handleViewportChange}
						onimageinfo={handleImageInfo}
					/>
				{/key}
			</div>

			<aside
				class="rounded-lg border border-border bg-surface p-3 dark:border-tavern-border dark:bg-tavern-surface"
			>
				<h2 class="text-sm font-semibold text-ink dark:text-tavern-text">Map Metadata</h2>
				<div class="mt-3 space-y-2.5">
					<label class="block text-xs text-ink-muted dark:text-tavern-muted">
						Name
						<input
							type="text"
							bind:value={draftName}
							oninput={markDirty}
							class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1.5 text-sm text-ink dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-text"
						/>
					</label>
					<label class="block text-xs text-ink-muted dark:text-tavern-muted">
						Tags (comma-separated)
						<input
							type="text"
							bind:value={draftTags}
							oninput={markDirty}
							class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1.5 text-sm text-ink dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-text"
						/>
					</label>
					<label class="block text-xs text-ink-muted dark:text-tavern-muted">
						Linked Area (location note)
						<select
							bind:value={draftAreaNoteId}
							onchange={markDirty}
							class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1.5 text-sm text-ink dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-text"
						>
							<option value="">Unlinked</option>
							{#if draftAreaNoteId && !locationNotes.some((note) => String(note.id) === draftAreaNoteId)}
								<option value={draftAreaNoteId}>{draftAreaNoteId}</option>
							{/if}
							{#each locationNotes as note (note.id)}
								<option value={String(note.id)}>{note.title}</option>
							{/each}
						</select>
					</label>
					{#if draftAreaNoteId}
						<button
							type="button"
							class="text-xs text-accent hover:underline dark:text-tavern-accent"
							onclick={() => void goto(resolve(`/notes/${draftAreaNoteId}`))}
						>
							Open linked location note
						</button>
					{/if}
					<label
						class="flex items-center gap-2 rounded border border-border px-2 py-1.5 text-xs text-ink-muted dark:border-tavern-border dark:text-tavern-muted"
					>
						<input type="checkbox" bind:checked={draftScaleEnabled} onchange={markDirty} />
						Enable scale label
					</label>
					{#if draftScaleEnabled}
						<div class="grid grid-cols-2 gap-2">
							<label class="text-xs text-ink-muted dark:text-tavern-muted">
								Units per square
								<input
									type="number"
									min="0.01"
									step="0.01"
									bind:value={draftScaleUnits}
									oninput={markDirty}
									class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1.5 text-sm text-ink dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-text"
								/>
							</label>
							<label class="text-xs text-ink-muted dark:text-tavern-muted">
								Unit label
								<input
									type="text"
									bind:value={draftScaleUnitLabel}
									oninput={markDirty}
									class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1.5 text-sm text-ink dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-text"
								/>
							</label>
						</div>
					{/if}
					<div class="grid grid-cols-2 gap-2">
						<label class="text-xs text-ink-muted dark:text-tavern-muted">
							Grid type
							<select
								bind:value={draftGridType}
								onchange={markDirty}
								class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1.5 text-sm text-ink dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-text"
							>
								<option value="square">Square</option>
								<option value="hex">Hex</option>
							</select>
						</label>
						<label class="text-xs text-ink-muted dark:text-tavern-muted">
							Cell size (px)
							<input
								type="number"
								min="4"
								step="1"
								bind:value={draftGridCellSize}
								oninput={markDirty}
								class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1.5 text-sm text-ink dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-text"
							/>
						</label>
						<label class="text-xs text-ink-muted dark:text-tavern-muted">
							Origin X
							<input
								type="number"
								step="0.1"
								bind:value={draftGridOriginX}
								oninput={markDirty}
								class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1.5 text-sm text-ink dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-text"
							/>
						</label>
						<label class="text-xs text-ink-muted dark:text-tavern-muted">
							Origin Y
							<input
								type="number"
								step="0.1"
								bind:value={draftGridOriginY}
								oninput={markDirty}
								class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1.5 text-sm text-ink dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-text"
							/>
						</label>
					</div>
					<label
						class="flex items-center gap-2 rounded border border-border px-2 py-1.5 text-xs text-ink-muted dark:border-tavern-border dark:text-tavern-muted"
					>
						<input type="checkbox" bind:checked={draftGridVisible} onchange={markDirty} />
						Show grid by default
					</label>
					<div
						class="rounded border border-border bg-surface-alt px-2 py-1.5 text-[11px] text-ink-faint dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-faint"
					>
						<p class="truncate">File: {selectedMap.data.filePath || 'Missing path'}</p>
						{#if selectedMap.data.byteSize}
							<p>Size: {(selectedMap.data.byteSize / 1024 / 1024).toFixed(2)} MB</p>
						{/if}
						{#if draftImageSize}
							<p>Dimensions: {draftImageSize.width} x {draftImageSize.height}</p>
						{/if}
					</div>
				</div>
				<div class="mt-3 flex items-center gap-2">
					<button
						type="button"
						class="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60 dark:bg-tavern-accent dark:text-tavern-bg dark:hover:bg-tavern-accent-hover"
						disabled={!dirty || saving}
						onclick={() => void handleSave()}
					>
						{saving ? 'Saving...' : 'Save Map'}
					</button>
					<button
						type="button"
						class="rounded-md border border-border px-3 py-1.5 text-xs text-ink-muted hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-60 dark:border-tavern-border dark:text-tavern-muted dark:hover:bg-tavern-surface-alt"
						disabled={!dirty || saving}
						onclick={discardDraft}
					>
						Discard
					</button>
				</div>
			</aside>
		</section>
	{/if}
</div>
