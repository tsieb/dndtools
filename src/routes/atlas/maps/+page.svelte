<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { mapsState } from '$lib/state/maps.svelte.js';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { sessionState } from '$lib/state/session-state.svelte.js';
	import { layoutState } from '$lib/state/layout.svelte.js';
	import { toastState } from '$lib/state/toast.svelte.js';
	import {
		importDesktopMapFromDialog,
		resolveDesktopMapAssetUrl,
	} from '$lib/platform/desktop/bridge.js';
	import { reportRuntimeError } from '$lib/runtime/diagnostics.js';
	import { filterMapObjects } from '$lib/domain/map-library.js';
	import { noteToVaultObject } from '$lib/domain/object-notes.js';
	import {
		createDefaultMapAnnotationLayers,
		normalizeMapData,
		summarizeVaultObject,
	} from '$lib/domain/objects.js';
	import { generateVaultObjectId } from '$lib/utils/id.js';
	import { nowISO } from '$lib/utils/date.js';
	import type { MapObject } from '$lib/types/object.js';
	import Card from '$lib/ui/common/Card.svelte';
	import EmptyState from '$lib/ui/common/EmptyState.svelte';
	import HelpTip from '$lib/ui/common/HelpTip.svelte';
	import Icon from '$lib/ui/common/Icon.svelte';

	let query = $state('');
	let selectedTag = $state('');
	let selectedAreaNoteId = $state('');
	let importing = $state(false);
	let previewMapId = $state<string | null>(null);
	let mapAssetUrls = $state<Record<string, string | null>>({});
	let loadedThumbnailIds = $state<Record<string, boolean>>({});
	let focusedCardIndex = $state(0);
	let browserFileInput = $state<HTMLInputElement | null>(null);

	const maps = $derived(mapsState.maps);
	const loading = $derived(mapsState.loading);
	const error = $derived(mapsState.error);
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

	const cardColumns = $derived.by(() => {
		if (typeof window === 'undefined') return 1;
		if (window.innerWidth >= 1536) return 4;
		if (window.innerWidth >= 1024) return 3;
		if (window.innerWidth >= 640) return 2;
		return 1;
	});

	$effect(() => {
		if (!mapsState.loaded && !mapsState.loading) {
			void mapsState.loadAll();
		}
	});

	$effect(() => {
		void refreshAssetUrls(maps).catch((loadError) => {
			void reportRuntimeError({
				category: 'storage',
				code: 'MAP_LIBRARY_ASSET_URL_RESOLVE_FAILED',
				error: loadError,
			});
		});
	});

	$effect(() => {
		const requestedPreviewMapId = page.url.searchParams.get('previewMap')?.trim() ?? '';
		if (!requestedPreviewMapId) {
			previewMapId = null;
			return;
		}
		previewMapId = maps.some((entry) => String(entry.id) === requestedPreviewMapId)
			? requestedPreviewMapId
			: null;
	});

	$effect(() => {
		const legacyMapId = page.url.searchParams.get('map')?.trim() ?? '';
		if (!legacyMapId) return;
		if (!maps.some((entry) => String(entry.id) === legacyMapId)) return;
		void goto(resolve(`/atlas/maps/${encodeURIComponent(legacyMapId)}`), {
			replaceState: true,
			noScroll: true,
		});
	});

	function areaLabelForMap(map: MapObject): string {
		const id = map.data.areaNoteId?.trim();
		if (!id) return 'Unlinked area';
		return areaLabelByNoteId[id] ?? id;
	}

	function isAbsoluteUrl(value: string): boolean {
		return /^(https?:\/\/|file:\/\/|data:|blob:)/i.test(value.trim());
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

	function clearFilters(): void {
		query = '';
		selectedTag = '';
		selectedAreaNoteId = '';
	}

	function toImportedMap(params: {
		name: string;
		filePath: string;
		mimeType?: string;
		byteSize?: number;
	}): MapObject {
		const now = nowISO();
		let object: MapObject = {
			id: generateVaultObjectId(),
			type: 'map',
			name: params.name.trim() || 'Imported Map',
			summary: '',
			tags: ['map'],
			visibility: 'dm_only',
			relationships: [],
			createdAt: now,
			updatedAt: now,
			data: normalizeMapData({
				filePath: params.filePath,
				mimeType: params.mimeType,
				byteSize: params.byteSize,
				layers: createDefaultMapAnnotationLayers(),
				pois: [],
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
		return object;
	}

	async function saveImportedMap(map: MapObject): Promise<void> {
		await mapsState.saveMap(map);
		await mapsState.loadAll();
		await goto(resolve(`/atlas/maps/${encodeURIComponent(String(map.id))}`));
		toastState.success('Map imported.');
	}

	function triggerBrowserFileImport(): void {
		browserFileInput?.click();
	}

	async function importBrowserMapFromUrl(): Promise<void> {
		if (typeof window === 'undefined') return;
		const raw = window.prompt('Paste an image URL for the map');
		const value = raw?.trim() ?? '';
		if (!value) return;
		if (!isAbsoluteUrl(value)) {
			toastState.error('Please enter a valid absolute URL.');
			return;
		}
		importing = true;
		try {
			const map = toImportedMap({
				name: value.split('/').pop() ?? 'Imported Map',
				filePath: value,
			});
			await saveImportedMap(map);
		} catch (errorValue) {
			toastState.error(`Failed to import map: ${String(errorValue)}`);
		} finally {
			importing = false;
		}
	}

	async function readFileAsDataUrl(file: File): Promise<string> {
		return await new Promise((resolveValue, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolveValue(typeof reader.result === 'string' ? reader.result : '');
			reader.onerror = () => reject(reader.error ?? new Error('Failed to read file.'));
			reader.readAsDataURL(file);
		});
	}

	async function handleBrowserFileSelected(event: Event): Promise<void> {
		const target = event.currentTarget as HTMLInputElement;
		const file = target.files?.[0] ?? null;
		target.value = '';
		if (!file) return;
		importing = true;
		try {
			const dataUrl = await readFileAsDataUrl(file);
			if (!dataUrl) {
				toastState.error('Failed to import map file.');
				return;
			}
			const map = toImportedMap({
				name: file.name.replace(/\.[^.]+$/, ''),
				filePath: dataUrl,
				mimeType: file.type,
				byteSize: file.size,
			});
			await saveImportedMap(map);
		} catch (errorValue) {
			toastState.error(`Failed to import map: ${String(errorValue)}`);
		} finally {
			importing = false;
		}
	}

	async function handleImportMap(): Promise<void> {
		if (!desktopAvailable) {
			triggerBrowserFileImport();
			return;
		}
		importing = true;
		try {
			const picked = await importDesktopMapFromDialog();
			if (picked.canceled) return;
			const map = toImportedMap({
				name: picked.name,
				filePath: picked.filePath,
				mimeType: picked.mimeType,
				byteSize: picked.byteSize,
			});
			await saveImportedMap(map);
		} catch (errorValue) {
			void reportRuntimeError({
				category: 'storage',
				code: 'MAP_IMPORT_FAILED',
				error: errorValue,
			});
			toastState.error(`Failed to import map: ${String(errorValue)}`);
		} finally {
			importing = false;
		}
	}

	async function openMap(mapId: string): Promise<void> {
		await goto(resolve(`/atlas/maps/${encodeURIComponent(mapId)}`));
	}

	async function setPreviewMap(mapId: string | null): Promise<void> {
		if (!layoutState.isExpanded) return;
		const url = new URL(page.url);
		if (mapId) {
			url.searchParams.set('previewMap', mapId);
		} else {
			url.searchParams.delete('previewMap');
		}
		await goto(`${url.pathname}${url.search}`, {
			replaceState: true,
			noScroll: true,
			keepFocus: true,
		});
	}

	function handleCardKeydown(event: KeyboardEvent, index: number): void {
		if (filteredMaps.length === 0) return;
		if (event.key === 'Enter') {
			event.preventDefault();
			void openMap(String(filteredMaps[index]!.id));
			return;
		}
		if (event.key === ' ') {
			event.preventDefault();
			void setPreviewMap(String(filteredMaps[index]!.id));
			return;
		}
		if (event.key === 'ArrowRight') {
			event.preventDefault();
			focusedCardIndex = Math.min(filteredMaps.length - 1, index + 1);
			return;
		}
		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			focusedCardIndex = Math.max(0, index - 1);
			return;
		}
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			focusedCardIndex = Math.min(filteredMaps.length - 1, index + cardColumns);
			return;
		}
		if (event.key === 'ArrowUp') {
			event.preventDefault();
			focusedCardIndex = Math.max(0, index - cardColumns);
		}
	}

	$effect(() => {
		if (focusedCardIndex < 0 || focusedCardIndex >= filteredMaps.length) {
			focusedCardIndex = 0;
		}
	});

	function markThumbnailLoaded(mapId: string): void {
		loadedThumbnailIds = {
			...loadedThumbnailIds,
			[mapId]: true,
		};
	}
</script>

<div class="mx-auto max-w-[1400px] p-6">
	<header class="mb-5 flex flex-wrap items-start justify-between gap-3">
		<div>
			<div class="flex items-center gap-2">
				<h1 class="text-2xl font-bold text-ink" style="font-family: var(--font-serif)">
					Map Library
				</h1>
				<HelpTip
					headline="Map objects"
					body="Map objects let you anchor notes to locations, dungeons, and regions so session context stays spatial and easy to navigate."
					learnMoreHref={resolve('/atlas/maps')}
					learnMoreLabel="Atlas overview"
				/>
			</div>
			<p class="mt-1 text-sm text-ink-muted">
				{filteredMaps.length} of {maps.length} map{maps.length === 1 ? '' : 's'}
			</p>
		</div>
		<div class="flex items-center gap-2">
			<button
				type="button"
				class="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white transition-[transform,colors] hover:bg-accent-hover active:scale-[0.97] active:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
				onclick={() => void handleImportMap()}
				disabled={importing}
			>
				{importing ? 'Importing...' : 'Import map'}
			</button>
			{#if !desktopAvailable}
				<button
					type="button"
					class="rounded-md border border-border px-3 py-2 text-sm text-ink-muted transition-[transform,colors] hover:bg-surface-alt active:scale-[0.97] active:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
					onclick={() => void importBrowserMapFromUrl()}
					disabled={importing}
				>
					Import from URL
				</button>
			{/if}
		</div>
	</header>

	<input
		bind:this={browserFileInput}
		type="file"
		accept="image/*"
		class="hidden"
		onchange={(event) => void handleBrowserFileSelected(event)}
	/>

	<section class="mb-4 grid gap-2 rounded-lg border border-border bg-surface p-3 md:grid-cols-4">
		<input
			type="text"
			bind:value={query}
			placeholder="Search maps by name, tags, area, or file path"
			aria-label="Search maps"
			class="rounded border border-border bg-surface-alt px-2 py-1.5 text-sm text-ink"
		/>
		<select
			bind:value={selectedTag}
			aria-label="Filter maps by tag"
			class="rounded border border-border bg-surface-alt px-2 py-1.5 text-sm text-ink"
		>
			<option value="">All tags</option>
			{#each tagOptions as tag (tag)}
				<option value={tag}>#{tag}</option>
			{/each}
		</select>
		<select
			bind:value={selectedAreaNoteId}
			aria-label="Filter maps by linked area"
			class="rounded border border-border bg-surface-alt px-2 py-1.5 text-sm text-ink"
		>
			<option value="">All areas</option>
			{#each areaOptions as area (area.id)}
				<option value={area.id}>{area.label}</option>
			{/each}
		</select>
		<button
			type="button"
			class="rounded border border-border px-3 py-1.5 text-sm text-ink-muted transition-[transform,colors] hover:bg-surface-alt active:scale-[0.97] active:brightness-95"
			onclick={clearFilters}
		>
			Clear filter
		</button>
	</section>

	{#if error}
		<div class="mb-4 rounded border border-error/40 bg-error/10 px-3 py-2 text-sm text-error">
			{error}
		</div>
	{/if}

	<section class="rounded-lg border border-border bg-surface p-4">
		{#if loading}
			<p class="text-sm text-ink-muted">Loading maps...</p>
		{:else if filteredMaps.length === 0}
			{#if maps.length === 0}
				<EmptyState
					class="min-h-0 px-0 py-4"
					illustration="atlas"
					headline="No maps yet"
					body="Maps anchor your world - import an image and pin notes to every location, dungeon, and city."
					primaryAction={{ label: 'Import your first map', onclick: handleImportMap }}
				>
					<div class="mt-2 flex items-center justify-center gap-2 text-accent">
						<Icon name="map" size="sm" />
						<span class="text-xs font-medium">Atlas map library</span>
					</div>
				</EmptyState>
			{:else}
				<EmptyState
					class="min-h-0 px-0 py-4"
					illustration="atlas"
					headline="No maps match this filter"
					primaryAction={{ label: 'Clear filter', onclick: clearFilters }}
				>
					<div class="mt-2 flex items-center justify-center gap-2 text-accent">
						<Icon name="map" size="sm" />
						<span class="text-xs font-medium">Adjust filters to continue</span>
					</div>
				</EmptyState>
			{/if}
		{:else}
			<ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" aria-label="Map gallery">
				{#each filteredMaps as map, index (map.id)}
					<li>
						<button
							type="button"
							class="group block h-full w-full rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-focus-ring {previewMapId ===
							String(map.id)
								? 'ring-2 ring-accent/40'
								: ''}"
							onclick={() => void openMap(String(map.id))}
							onfocus={() => {
								focusedCardIndex = index;
							}}
							onkeydown={(event) => handleCardKeydown(event, index)}
							tabindex={focusedCardIndex === index ? 0 : -1}
							aria-label={`Open map ${map.name}`}
						>
							<Card
								elevation="sm"
								padding="none"
								class="h-full overflow-hidden transition-[box-shadow,border-color] group-hover:shadow-md"
							>
								<div class="relative aspect-video overflow-hidden bg-surface-alt">
									{#if mapAssetUrls[String(map.id)]}
										<img
											src={mapAssetUrls[String(map.id)] ?? undefined}
											alt={map.name}
											loading="lazy"
											class="h-full w-full object-cover"
											onload={() => markThumbnailLoaded(String(map.id))}
										/>
										{#if !loadedThumbnailIds[String(map.id)]}
											<div class="absolute inset-0 animate-pulse bg-surface"></div>
										{/if}
									{:else}
										<div
											class="flex h-full items-center justify-center px-3 text-center text-xs text-ink-muted"
										>
											Preview unavailable
										</div>
									{/if}
									{#if sessionState.partyLocation?.mapId === String(map.id)}
										<span
											class="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-2xs font-semibold text-white"
										>
											<Icon name="pin" size="xs" />
											Party
										</span>
									{/if}
								</div>
								<div class="space-y-2 p-3">
									<p class="truncate text-base font-semibold text-ink">{map.name}</p>
									<p class="truncate text-xs text-ink-muted">{areaLabelForMap(map)}</p>
									<div class="flex flex-wrap gap-1.5">
										<span
											class="rounded-full border border-border bg-surface-alt px-2 py-0.5 text-2xs text-ink-faint"
										>
											{map.data.pois?.length ?? 0} POI{(map.data.pois?.length ?? 0) === 1
												? ''
												: 's'}
										</span>
										<span
											class="rounded-full border border-border bg-surface-alt px-2 py-0.5 text-2xs text-ink-faint"
										>
											{map.data.layers?.length ?? 1} layer{(map.data.layers?.length ?? 1) === 1
												? ''
												: 's'}
										</span>
									</div>
								</div>
							</Card>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>
