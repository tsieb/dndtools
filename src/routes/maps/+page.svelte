<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { mapsState } from '$lib/state/maps.svelte.js';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { objectsState } from '$lib/state/objects.svelte.js';
	import { playerModeState } from '$lib/state/player-mode.svelte.js';
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
	import { extractNotePreviewLines, objectPreviewLines } from '$lib/domain/map-pois.js';
	import { noteToVaultObject } from '$lib/domain/object-notes.js';
	import {
		createDefaultMapAnnotationLayers,
		DEFAULT_MAP_LAYER_ID,
		normalizeMapData,
		summarizeVaultObject,
	} from '$lib/domain/objects.js';
	import { generateVaultObjectId } from '$lib/utils/id.js';
	import { nowISO } from '$lib/utils/date.js';
	import { createFolderId, createNoteId, type Note } from '$lib/types/note.js';
	import type {
		MapAnnotationLayerColorTheme,
		MapAnnotationLayerData,
		MapObject,
		MapPoiCategory,
		MapPoiData,
		MapViewportData,
	} from '$lib/types/object.js';
	import MapCanvasViewer from '$lib/ui/maps/MapCanvasViewer.svelte';
	import QuickReferenceSplitView from '$lib/ui/search/QuickReferenceSplitView.svelte';
	import Modal from '$lib/ui/common/Modal.svelte';
	import NoteViewer from '$lib/ui/viewer/NoteViewer.svelte';

	const POI_CATEGORY_OPTIONS: readonly { value: MapPoiCategory; label: string }[] = [
		{ value: 'city', label: 'City' },
		{ value: 'dungeon', label: 'Dungeon' },
		{ value: 'landmark', label: 'Landmark' },
		{ value: 'structure', label: 'Structure' },
		{ value: 'secret', label: 'Secret' },
		{ value: 'encounter', label: 'Encounter' },
	];

	const LAYER_THEME_OPTIONS: readonly { value: MapAnnotationLayerColorTheme; label: string }[] = [
		{ value: 'amber', label: 'Amber' },
		{ value: 'emerald', label: 'Emerald' },
		{ value: 'azure', label: 'Azure' },
		{ value: 'rose', label: 'Rose' },
		{ value: 'violet', label: 'Violet' },
		{ value: 'slate', label: 'Slate' },
	];

	let mapAssetUrls = $state<Record<string, string | null>>({});
	let importing = $state(false);
	let saving = $state(false);

	const maps = $derived(mapsState.maps);
	const loading = $derived(mapsState.loading);
	const error = $derived(mapsState.error);
	const vaultObjectsById = $derived(objectsState.objectById);

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
	let editPoiMode = $state(false);
	let previewPlayerLayers = $state(false);
	let activeLayerFilter = $state<'all' | string>('all');
	let selectedPoiId = $state<string | null>(null);
	let newPoiLayerId = $state(DEFAULT_MAP_LAYER_ID);
	let draftLayers = $state<MapAnnotationLayerData[]>([]);
	let draftPois = $state<MapPoiData[]>([]);
	let poiHover = $state<{ id: string | null; clientX: number; clientY: number } | null>(null);
	let splitPaneNoteId = $state<string | null>(null);
	let modalNoteId = $state<string | null>(null);
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
	const noteById = $derived.by(() => {
		const index: Record<string, Note> = {};
		for (const note of notesState.activeNotes) {
			index[String(note.id)] = note;
		}
		return index;
	});
	const noteOptions = $derived.by(() =>
		[...notesState.activeNotes].sort((a, b) =>
			a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
		),
	);
	const objectOptions = $derived.by(() =>
		Object.values(vaultObjectsById)
			.filter((object) => object.type !== 'map')
			.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
	);
	const layerById = $derived.by(() => {
		const index: Record<string, MapAnnotationLayerData> = {};
		for (const layer of draftLayers) {
			index[layer.id] = layer;
		}
		return index;
	});
	const isPlayerFacingLayerFilter = $derived(playerModeState.enabled || previewPlayerLayers);
	const filteredDraftPois = $derived.by(() =>
		draftPois.filter((poi) => {
			const layer = poi.layerId ? layerById[poi.layerId] : undefined;
			if (layer && !layer.visible) return false;
			if (isPlayerFacingLayerFilter && layer && !layer.playerVisible) return false;
			if (activeLayerFilter !== 'all' && poi.layerId !== activeLayerFilter) return false;
			return true;
		}),
	);
	const queryPlacementPoi = $derived.by(() => {
		const queryMapId = page.url.searchParams.get('map');
		if (!queryMapId || !selectedMap || String(selectedMap.id) !== queryMapId) return null;
		const rawX = page.url.searchParams.get('x');
		const rawY = page.url.searchParams.get('y');
		if (!rawX || !rawY) return null;
		const x = Number.parseFloat(rawX);
		const y = Number.parseFloat(rawY);
		if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
		return {
			id: 'query-placement',
			label: 'Linked note position',
			category: 'landmark' as const,
			x: Math.min(1, Math.max(0, x)),
			y: Math.min(1, Math.max(0, y)),
			colorTheme: 'violet' as const,
		};
	});
	const viewerPois = $derived.by(() => {
		const fromMap = filteredDraftPois.map((poi) => ({
			id: poi.id,
			label: poi.label,
			category: poi.category,
			x: poi.x,
			y: poi.y,
			colorTheme: poi.layerId ? layerById[poi.layerId]?.colorTheme : undefined,
		}));
		if (queryPlacementPoi) fromMap.push(queryPlacementPoi);
		return fromMap;
	});
	const selectedPoi = $derived.by(() => draftPois.find((poi) => poi.id === selectedPoiId) ?? null);
	const hoveredPoi = $derived.by(() => {
		const hover = poiHover;
		if (!hover?.id) return null;
		return draftPois.find((poi) => poi.id === hover.id) ?? null;
	});
	const hoveredPoiLinkedNote = $derived.by(() =>
		hoveredPoi?.linkedNoteId ? (noteById[hoveredPoi.linkedNoteId] ?? null) : null,
	);
	const hoveredPoiLinkedObject = $derived.by(() =>
		hoveredPoi?.linkedObjectId ? (vaultObjectsById[hoveredPoi.linkedObjectId] ?? null) : null,
	);
	const hoveredPreviewLines = $derived.by(() => {
		if (hoveredPoiLinkedNote) return extractNotePreviewLines(hoveredPoiLinkedNote.content, 3);
		if (hoveredPoiLinkedObject) return objectPreviewLines(hoveredPoiLinkedObject);
		return [];
	});
	const splitPaneNote = $derived.by(() =>
		splitPaneNoteId ? (noteById[splitPaneNoteId] ?? null) : null,
	);
	const modalNote = $derived.by(() => (modalNoteId ? (noteById[modalNoteId] ?? null) : null));
	const poiCountsByCategory = $derived.by(() => {
		const counts: Record<string, number> = {};
		for (const poi of draftPois) {
			counts[poi.category] = (counts[poi.category] ?? 0) + 1;
		}
		return counts;
	});

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

	function generateMapAnnotationId(prefix: 'poi' | 'layer'): string {
		const random =
			typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
				? crypto.randomUUID().slice(0, 8)
				: Math.random().toString(36).slice(2, 10);
		return `${prefix}-${random}`;
	}

	function toLayerTheme(value: string): MapAnnotationLayerColorTheme {
		return LAYER_THEME_OPTIONS.some((entry) => entry.value === value)
			? (value as MapAnnotationLayerColorTheme)
			: 'amber';
	}

	function resolveLinkedNoteIdForPoi(poi: MapPoiData): string | null {
		if (poi.linkedNoteId && noteById[poi.linkedNoteId]) return poi.linkedNoteId;
		if (poi.linkedObjectId && noteById[poi.linkedObjectId]) return poi.linkedObjectId;
		return null;
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
		editPoiMode = false;
		previewPlayerLayers = false;
		activeLayerFilter = 'all';
		const baseLayers =
			map.data.layers?.length && map.data.layers.length > 0
				? map.data.layers.map((layer) => ({ ...layer }))
				: createDefaultMapAnnotationLayers();
		draftLayers = baseLayers;
		const fallbackLayerId = baseLayers[0]?.id ?? DEFAULT_MAP_LAYER_ID;
		draftPois = (map.data.pois ?? []).map((poi) => ({
			...poi,
			layerId:
				poi.layerId && baseLayers.some((layer) => layer.id === poi.layerId)
					? poi.layerId
					: fallbackLayerId,
			linkedNoteId: poi.linkedNoteId?.trim() || undefined,
			linkedObjectId: poi.linkedObjectId?.trim() || undefined,
		}));
		newPoiLayerId = fallbackLayerId;
		selectedPoiId = null;
		poiHover = null;
		splitPaneNoteId = null;
		modalNoteId = null;
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
					layers: draftLayers,
					pois: draftPois,
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
			await objectsState.loadAll();
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

	function updateLayer(
		layerId: string,
		updater: (layer: MapAnnotationLayerData) => MapAnnotationLayerData,
	): void {
		draftLayers = draftLayers.map((layer) => (layer.id === layerId ? updater(layer) : layer));
		markDirty();
	}

	function handleAddLayer(): void {
		const id = generateMapAnnotationId('layer');
		draftLayers = [
			...draftLayers,
			{
				id,
				name: `Layer ${draftLayers.length + 1}`,
				colorTheme: 'amber',
				visible: true,
				playerVisible: false,
			},
		];
		newPoiLayerId = id;
		markDirty();
	}

	function handleDeleteLayer(layerId: string): void {
		if (draftLayers.length <= 1) {
			toastState.error('At least one layer is required.');
			return;
		}
		const fallback = draftLayers.find((layer) => layer.id !== layerId)?.id;
		if (!fallback) return;
		draftLayers = draftLayers.filter((layer) => layer.id !== layerId);
		draftPois = draftPois.map((poi) =>
			poi.layerId === layerId ? { ...poi, layerId: fallback } : poi,
		);
		if (selectedPoi?.layerId === layerId && selectedPoiId) {
			draftPois = draftPois.map((poi) =>
				poi.id === selectedPoiId ? { ...poi, layerId: fallback } : poi,
			);
		}
		if (newPoiLayerId === layerId) {
			newPoiLayerId = fallback;
		}
		if (activeLayerFilter === layerId) {
			activeLayerFilter = 'all';
		}
		markDirty();
	}

	function handleMapClick(payload: {
		x: number;
		y: number;
		ctrlKey: boolean;
		metaKey: boolean;
		shiftKey: boolean;
	}): void {
		if (!editPoiMode || !selectedMap) return;
		const layerId = draftLayers.some((layer) => layer.id === newPoiLayerId)
			? newPoiLayerId
			: (draftLayers[0]?.id ?? DEFAULT_MAP_LAYER_ID);
		const nextPoi: MapPoiData = {
			id: generateMapAnnotationId('poi'),
			label: `POI ${draftPois.length + 1}`,
			category: 'landmark',
			x: payload.x,
			y: payload.y,
			layerId,
		};
		draftPois = [...draftPois, nextPoi];
		selectedPoiId = nextPoi.id;
		markDirty();
	}

	function handlePoiMove(payload: { id: string; x: number; y: number }): void {
		draftPois = draftPois.map((poi) =>
			poi.id === payload.id ? { ...poi, x: payload.x, y: payload.y } : poi,
		);
		markDirty();
	}

	function handlePoiHover(payload: { id: string | null; clientX: number; clientY: number }): void {
		poiHover = payload.id ? payload : null;
	}

	function handlePoiClick(payload: { id: string; ctrlKey: boolean; metaKey: boolean }): void {
		selectedPoiId = payload.id;
		const poi = draftPois.find((entry) => entry.id === payload.id);
		if (!poi) return;
		const noteId = resolveLinkedNoteIdForPoi(poi);
		if (!noteId) return;
		if (payload.ctrlKey || payload.metaKey) {
			modalNoteId = noteId;
			return;
		}
		splitPaneNoteId = noteId;
	}

	async function handleCreateNoteFromPoi(poiId: string): Promise<void> {
		if (!selectedMap) return;
		const poi = draftPois.find((entry) => entry.id === poiId);
		if (!poi) return;
		const existingTitles = new Set(notesState.activeNotes.map((note) => note.title.toLowerCase()));
		const baseTitle = poi.label.trim() || 'Map Location';
		let title = baseTitle;
		let suffix = 2;
		while (existingTitles.has(title.toLowerCase())) {
			title = `${baseTitle} ${suffix++}`;
		}
		const next = await notesState.createNote({
			title,
			folder: createFolderId('/locations'),
			tags: ['location'],
			frontmatter: {
				type: 'location',
				mapId: String(selectedMap.id),
				mapPoi: poi.id,
				mapPosition: {
					x: poi.x,
					y: poi.y,
					poiId: poi.id,
				},
			},
			content: `# ${title}\n\nLinked from map "${selectedMap.name}" (${poi.label}).`,
		});
		draftPois = draftPois.map((entry) =>
			entry.id === poi.id ? { ...entry, linkedNoteId: String(next.id) } : entry,
		);
		selectedPoiId = poi.id;
		markDirty();
		toastState.success('Created note from POI.');
		splitPaneNoteId = String(next.id);
	}

	function handleDeletePoi(poiId: string): void {
		draftPois = draftPois.filter((poi) => poi.id !== poiId);
		if (selectedPoiId === poiId) selectedPoiId = null;
		markDirty();
	}

	function updatePoi(poiId: string, updater: (poi: MapPoiData) => MapPoiData): void {
		draftPois = draftPois.map((poi) => (poi.id === poiId ? updater(poi) : poi));
		markDirty();
	}

	function selectedPoiCategory(value: string): MapPoiCategory {
		return POI_CATEGORY_OPTIONS.some((entry) => entry.value === value)
			? (value as MapPoiCategory)
			: 'landmark';
	}

	$effect(() => {
		void mapsState.loadAll();
	});

	$effect(() => {
		void objectsState.loadAll().catch((loadError) => {
			void reportRuntimeError({
				category: 'storage',
				code: 'MAP_VAULT_OBJECTS_LOAD_FAILED',
				error: loadError,
			});
		});
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
		const queryMapId = page.url.searchParams.get('map');
		if (!queryMapId) return;
		if (selectedMapId === queryMapId) return;
		if (!maps.some((entry) => String(entry.id) === queryMapId)) return;
		query = '';
		selectedTag = '';
		selectedAreaNoteId = '';
		selectedMapId = queryMapId;
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

	$effect(() => {
		if (!selectedMap) return;
		const queryMapId = page.url.searchParams.get('map');
		const queryPoiId = page.url.searchParams.get('poi');
		if (queryMapId !== String(selectedMap.id) || !queryPoiId) return;
		if (!draftPois.some((poi) => poi.id === queryPoiId)) return;
		selectedPoiId = queryPoiId;
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
				class="relative rounded-lg border border-border bg-surface p-3 dark:border-tavern-border dark:bg-tavern-surface"
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
						<button
							type="button"
							class="rounded border border-border px-2 py-1 text-ink-muted hover:bg-surface-alt dark:border-tavern-border dark:text-tavern-muted dark:hover:bg-tavern-surface-alt"
							onclick={() => {
								editPoiMode = !editPoiMode;
							}}
						>
							{editPoiMode ? 'Stop POI Placement' : 'Edit POIs'}
						</button>
						<label
							class="flex items-center gap-1.5 rounded border border-border px-2 py-1 dark:border-tavern-border"
						>
							<input type="checkbox" bind:checked={previewPlayerLayers} />
							Player layer preview
						</label>
						<select
							bind:value={activeLayerFilter}
							class="rounded border border-border bg-surface-alt px-2 py-1 text-[11px] text-ink dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-text"
							aria-label="Filter visible pins by layer"
						>
							<option value="all">All layers</option>
							{#each draftLayers as layer (layer.id)}
								<option value={layer.id}>{layer.name}</option>
							{/each}
						</select>
					</div>
					{#if scaleLabel}
						<p class="font-medium text-ink-muted dark:text-tavern-muted">{scaleLabel}</p>
					{/if}
				</div>
				{#if editPoiMode}
					<p class="mb-2 text-xs text-ink-faint dark:text-tavern-faint">
						Click the map to place a pin. Drag pins to reposition. Click a pin to edit details.
					</p>
				{/if}
				{#key `${selectedMap.id}:${viewerKey}`}
					<MapCanvasViewer
						src={selectedMapAssetUrl}
						alt={`${selectedMap.name} viewer`}
						grid={gridDraft}
						showGrid={runtimeShowGrid}
						editableGrid={editGridHandles}
						pois={viewerPois}
						poiEditable={editPoiMode}
						initialViewport={draftInitialViewport ?? undefined}
						ongridchange={handleGridChange}
						onviewportchange={handleViewportChange}
						onimageinfo={handleImageInfo}
						onmapclick={handleMapClick}
						onpoimove={handlePoiMove}
						onpoiclick={handlePoiClick}
						onpoihover={handlePoiHover}
					/>
				{/key}
				{#if poiHover && hoveredPoi}
					<div
						class="fixed z-40 w-72 rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-xl dark:border-tavern-border dark:bg-tavern-surface"
						style={`left:${poiHover.clientX + 10}px;top:${poiHover.clientY + 10}px;`}
						role="status"
						aria-live="polite"
					>
						<p class="font-semibold text-ink dark:text-tavern-text">{hoveredPoi.label}</p>
						<p class="mt-0.5 text-[11px] text-ink-faint dark:text-tavern-faint">
							{hoveredPoi.category}
						</p>
						{#if hoveredPreviewLines.length > 0}
							<div class="mt-2 space-y-1">
								{#each hoveredPreviewLines as line, index (`${hoveredPoi.id}-${index}`)}
									<p class="line-clamp-1 text-ink-muted dark:text-tavern-muted">{line}</p>
								{/each}
							</div>
						{:else}
							<button
								type="button"
								class="mt-2 rounded border border-border px-2 py-1 text-[11px] text-accent hover:bg-accent-subtle dark:border-tavern-border dark:text-tavern-accent dark:hover:bg-tavern-accent-subtle"
								onclick={() => void handleCreateNoteFromPoi(hoveredPoi.id)}
							>
								Create note from pin
							</button>
						{/if}
					</div>
				{/if}
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
						<p>Layers: {draftLayers.length}</p>
						<p>POIs: {draftPois.length}</p>
					</div>
					<div class="rounded border border-border p-2 dark:border-tavern-border">
						<div class="flex items-center justify-between">
							<h3 class="text-xs font-semibold text-ink dark:text-tavern-text">Layer System</h3>
							<button
								type="button"
								class="rounded border border-border px-2 py-0.5 text-[11px] text-ink-muted hover:bg-surface-alt dark:border-tavern-border dark:text-tavern-muted dark:hover:bg-tavern-surface-alt"
								onclick={handleAddLayer}
							>
								Add Layer
							</button>
						</div>
						<div class="mt-2 space-y-2">
							{#each draftLayers as layer (layer.id)}
								<div class="rounded border border-border p-2 dark:border-tavern-border">
									<input
										type="text"
										value={layer.name}
										oninput={(event) =>
											updateLayer(layer.id, (entry) => ({
												...entry,
												name: (event.currentTarget as HTMLInputElement).value,
											}))}
										class="w-full rounded border border-border bg-surface-alt px-2 py-1 text-xs text-ink dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-text"
									/>
									<div class="mt-1.5 grid grid-cols-2 gap-1.5">
										<select
											value={layer.colorTheme}
											onchange={(event) =>
												updateLayer(layer.id, (entry) => ({
													...entry,
													colorTheme: toLayerTheme(
														(event.currentTarget as HTMLSelectElement).value,
													),
												}))}
											class="rounded border border-border bg-surface-alt px-2 py-1 text-[11px] text-ink dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-text"
										>
											{#each LAYER_THEME_OPTIONS as option (option.value)}
												<option value={option.value}>{option.label}</option>
											{/each}
										</select>
										<button
											type="button"
											class="rounded border border-border px-2 py-1 text-[11px] text-error hover:bg-error/10 disabled:opacity-40 dark:border-tavern-border"
											disabled={draftLayers.length <= 1}
											onclick={() => handleDeleteLayer(layer.id)}
										>
											Delete
										</button>
									</div>
									<div
										class="mt-1.5 flex items-center gap-3 text-[11px] text-ink-muted dark:text-tavern-muted"
									>
										<label class="flex items-center gap-1">
											<input
												type="checkbox"
												checked={layer.visible}
												onchange={(event) =>
													updateLayer(layer.id, (entry) => ({
														...entry,
														visible: (event.currentTarget as HTMLInputElement).checked,
													}))}
											/>
											Visible
										</label>
										<label class="flex items-center gap-1">
											<input
												type="checkbox"
												checked={layer.playerVisible}
												onchange={(event) =>
													updateLayer(layer.id, (entry) => ({
														...entry,
														playerVisible: (event.currentTarget as HTMLInputElement).checked,
													}))}
											/>
											Player Visible
										</label>
									</div>
								</div>
							{/each}
						</div>
					</div>
					<div class="rounded border border-border p-2 dark:border-tavern-border">
						<h3 class="text-xs font-semibold text-ink dark:text-tavern-text">
							POI Pins by Category
						</h3>
						<div
							class="mt-1.5 grid grid-cols-2 gap-1 text-[11px] text-ink-muted dark:text-tavern-muted"
						>
							{#each POI_CATEGORY_OPTIONS as category (category.value)}
								<p>{category.label}: {poiCountsByCategory[category.value] ?? 0}</p>
							{/each}
						</div>
						<label class="mt-2 block text-[11px] text-ink-muted dark:text-tavern-muted">
							New pins default layer
							<select
								bind:value={newPoiLayerId}
								class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-xs text-ink dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-text"
							>
								{#each draftLayers as layer (layer.id)}
									<option value={layer.id}>{layer.name}</option>
								{/each}
							</select>
						</label>
					</div>
					<div class="rounded border border-border p-2 dark:border-tavern-border">
						<h3 class="text-xs font-semibold text-ink dark:text-tavern-text">Selected Pin</h3>
						{#if selectedPoi}
							<div class="mt-2 space-y-2">
								<label class="block text-[11px] text-ink-muted dark:text-tavern-muted">
									Label
									<input
										type="text"
										value={selectedPoi.label}
										oninput={(event) =>
											updatePoi(selectedPoi.id, (poi) => ({
												...poi,
												label: (event.currentTarget as HTMLInputElement).value,
											}))}
										class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-xs text-ink dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-text"
									/>
								</label>
								<div class="grid grid-cols-2 gap-2">
									<label class="text-[11px] text-ink-muted dark:text-tavern-muted">
										Category
										<select
											value={selectedPoi.category}
											onchange={(event) =>
												updatePoi(selectedPoi.id, (poi) => ({
													...poi,
													category: selectedPoiCategory(
														(event.currentTarget as HTMLSelectElement).value,
													),
												}))}
											class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-xs text-ink dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-text"
										>
											{#each POI_CATEGORY_OPTIONS as option (option.value)}
												<option value={option.value}>{option.label}</option>
											{/each}
										</select>
									</label>
									<label class="text-[11px] text-ink-muted dark:text-tavern-muted">
										Layer
										<select
											value={selectedPoi.layerId ?? ''}
											onchange={(event) =>
												updatePoi(selectedPoi.id, (poi) => ({
													...poi,
													layerId: (event.currentTarget as HTMLSelectElement).value || undefined,
												}))}
											class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-xs text-ink dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-text"
										>
											{#each draftLayers as layer (layer.id)}
												<option value={layer.id}>{layer.name}</option>
											{/each}
										</select>
									</label>
								</div>
								<label class="block text-[11px] text-ink-muted dark:text-tavern-muted">
									Linked note
									<select
										value={selectedPoi.linkedNoteId ?? ''}
										onchange={(event) =>
											updatePoi(selectedPoi.id, (poi) => ({
												...poi,
												linkedNoteId: (event.currentTarget as HTMLSelectElement).value || undefined,
											}))}
										class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-xs text-ink dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-text"
									>
										<option value="">None</option>
										{#each noteOptions as note (note.id)}
											<option value={String(note.id)}>{note.title}</option>
										{/each}
									</select>
								</label>
								<label class="block text-[11px] text-ink-muted dark:text-tavern-muted">
									Linked object
									<select
										value={selectedPoi.linkedObjectId ?? ''}
										onchange={(event) =>
											updatePoi(selectedPoi.id, (poi) => ({
												...poi,
												linkedObjectId:
													(event.currentTarget as HTMLSelectElement).value || undefined,
											}))}
										class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-xs text-ink dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-text"
									>
										<option value="">None</option>
										{#each objectOptions as object (object.id)}
											<option value={String(object.id)}>{object.name} ({object.type})</option>
										{/each}
									</select>
								</label>
								<p class="text-[11px] text-ink-faint dark:text-tavern-faint">
									Position: {selectedPoi.x.toFixed(3)}, {selectedPoi.y.toFixed(3)}
								</p>
								<div class="flex flex-wrap gap-1.5">
									{#if resolveLinkedNoteIdForPoi(selectedPoi)}
										<button
											type="button"
											class="rounded border border-border px-2 py-1 text-[11px] text-ink-muted hover:bg-surface-alt dark:border-tavern-border dark:text-tavern-muted dark:hover:bg-tavern-surface-alt"
											onclick={() =>
												void goto(resolve(`/notes/${resolveLinkedNoteIdForPoi(selectedPoi)}`))}
										>
											Open linked note
										</button>
									{:else}
										<button
											type="button"
											class="rounded border border-border px-2 py-1 text-[11px] text-accent hover:bg-accent-subtle dark:border-tavern-border dark:text-tavern-accent dark:hover:bg-tavern-accent-subtle"
											onclick={() => void handleCreateNoteFromPoi(selectedPoi.id)}
										>
											Create note
										</button>
									{/if}
									<button
										type="button"
										class="rounded border border-border px-2 py-1 text-[11px] text-error hover:bg-error/10 dark:border-tavern-border"
										onclick={() => handleDeletePoi(selectedPoi.id)}
									>
										Delete pin
									</button>
								</div>
							</div>
						{:else}
							<p class="mt-2 text-[11px] text-ink-muted dark:text-tavern-muted">
								Select a pin to edit links and metadata.
							</p>
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

{#if splitPaneNoteId && splitPaneNote}
	<QuickReferenceSplitView
		noteId={createNoteId(splitPaneNoteId)}
		onclose={() => (splitPaneNoteId = null)}
	/>
{/if}

<Modal open={!!modalNoteId} title="Linked Note" onclose={() => (modalNoteId = null)}>
	{#if modalNote}
		<NoteViewer note={modalNote} />
	{:else}
		<p class="text-sm text-ink-muted dark:text-tavern-muted">Linked note unavailable.</p>
	{/if}
</Modal>
