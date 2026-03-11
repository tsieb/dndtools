<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { mapsState } from '$lib/state/maps.svelte.js';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { objectsState } from '$lib/state/objects.svelte.js';
	import { sessionBoardsState } from '$lib/state/session-boards.svelte.js';
	import { playerModeState } from '$lib/state/player-mode.svelte.js';
	import { sessionState } from '$lib/state/session-state.svelte.js';
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
	import {
		mapBreadcrumbs,
		mapHierarchyEntries,
		mapIndexById,
		resolvePoiLinkedMapId,
	} from '$lib/domain/map-atlas.js';
	import {
		estimateTravelTimeForRoute,
		formatScaledDistance,
		summarizeRouteDistance,
	} from '$lib/domain/map-routes.js';
	import { extractNotePreviewLines, objectPreviewLines } from '$lib/domain/map-pois.js';
	import {
		appendMapHistory,
		autoPlaceCombatTokens,
		cellsForTemplate,
		conditionIconsForCombatant,
		findShortestPath,
		gridCellKey,
		hpBarToneForCombatant,
		movementSquaresForCombatant,
		normalizeTemplateInput,
		rangeProfileForCombatant,
		reachableCells,
		type GridCell,
	} from '$lib/domain/combat-map.js';
	import {
		appendFogPolygonOperation,
		countFogPolygonsByMode,
		createDefaultMapFogState,
		normalizeMapFogState,
		normalizeLassoPoints,
		polygonFromCircle,
		polygonFromRectangle,
		revealBoundsFromFogState,
	} from '$lib/domain/map-fog.js';
	import { noteToVaultObject } from '$lib/domain/object-notes.js';
	import { createDefaultCombatMapState, normalizeCombatState } from '$lib/domain/combat-tracker.js';
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
		MapRouteData,
		MapRouteStyle,
		MapViewportData,
	} from '$lib/types/object.js';
	import type {
		MapFogBrushShape,
		MapFogOperationMode,
		MapFogPoint,
		MapFogPolygonOperation,
		MapFogState,
	} from '$lib/types/map-fog.js';
	import type {
		SessionBoardCombatMapTemplate,
		SessionBoardCombatState,
		SessionBoardCombatTile,
		SessionBoardId,
	} from '$lib/types/session-board.js';
	import CombatTrackerTile from '$lib/ui/board/CombatTrackerTile.svelte';
	import EmptyState from '$lib/ui/common/EmptyState.svelte';
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

	const TEMPLATE_SHAPE_OPTIONS: readonly {
		value: SessionBoardCombatMapTemplate['shape'];
		label: string;
	}[] = [
		{ value: 'sphere', label: 'Sphere' },
		{ value: 'cone', label: 'Cone (60deg)' },
		{ value: 'line', label: 'Line' },
		{ value: 'cube', label: 'Cube' },
	];

	const FOG_TOOL_OPTIONS: readonly { value: MapFogBrushShape; label: string }[] = [
		{ value: 'circle', label: 'Brush' },
		{ value: 'rectangle', label: 'Rectangle' },
		{ value: 'polygon', label: 'Lasso' },
	];
	const FOG_MODE_OPTIONS: readonly { value: MapFogOperationMode; label: string }[] = [
		{ value: 'reveal', label: 'Reveal' },
		{ value: 'refog', label: 'Re-fog' },
	];
	const MAP_FOG_CHANNEL = 'dndtools.map-fog.v1';
	const MAP_PARTY_LOCATION_CHANNEL = 'dndtools.map-party-location.v1';

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
	let draftParentMapId = $state('');
	let draftParentPoiId = $state('');
	let draftRoutes = $state<MapRouteData[]>([]);
	let dirty = $state(false);
	let draftSourceKey = $state<string | null>(null);
	let reportedLoadError = $state<string | null>(null);
	let combatModeEnabled = $state(false);
	let selectedBoardId = $state<SessionBoardId | null>(null);
	let selectedCombatTileId = $state<string | null>(null);
	let terrainPaintMode = $state(false);
	let terrainEraseMode = $state(false);
	let terrainPainting = $state(false);
	let templatePlacementMode = $state(false);
	let templateDragOriginCell = $state<GridCell | null>(null);
	let templatePreviewTargetCell = $state<GridCell | null>(null);
	let templateShape = $state<SessionBoardCombatMapTemplate['shape']>('sphere');
	let templateRadiusSquares = $state(4);
	let templateLineLengthSquares = $state(6);
	let templateLineWidthSquares = $state(1);
	let pathPreviewCells = $state<GridCell[]>([]);
	let lastCombatMapSyncKey = $state<string | null>(null);
	let savingCombatMap = $state(false);
	let combatPersistQueue: Promise<void> = Promise.resolve();
	let fogEditingEnabled = $state(false);
	let fogTool = $state<MapFogBrushShape>('circle');
	let fogMode = $state<MapFogOperationMode>('reveal');
	let fogBrushRadius = $state(0.06);
	let fogPainting = $state(false);
	let fogDragStart = $state<MapFogPoint | null>(null);
	let fogDragCurrent = $state<MapFogPoint | null>(null);
	let fogLassoPoints = $state<MapFogPoint[]>([]);
	let fogColorTheme = $state<MapFogState['colorTheme']>('smoky_gray');
	let fogFreeExplore = $state(false);
	let fogAnimationOperation = $state<MapFogPolygonOperation | null>(null);
	let remoteFogStateOverride = $state<MapFogState | null>(null);
	let fogBroadcastChannel = $state<BroadcastChannel | null>(null);
	let partyBroadcastChannel = $state<BroadcastChannel | null>(null);
	let fogChannelPeerId = $state(
		typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
			? crypto.randomUUID()
			: `fog-peer-${Math.random().toString(36).slice(2, 10)}`,
	);
	let lastFogStateSyncKey = $state<string | null>(null);
	let remoteFogScopeKey = $state<string | null>(null);
	let lastFogSnapshotRequestKey = $state<string | null>(null);
	let lastFogMapLinkKey = $state<string | null>(null);
	let routeEditMode = $state(false);
	let selectedRouteId = $state<string | null>(null);
	let newRouteName = $state('New Route');
	let newRouteStyle = $state<MapRouteStyle>('straight');
	let mapContextMenu = $state<{ clientX: number; clientY: number; x: number; y: number } | null>(
		null,
	);
	let lastPartyLocationBroadcastKey = $state<string | null>(null);

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
	const requestedMapId = $derived.by(() => {
		const queryMapId = page.url.searchParams.get('map')?.trim() ?? '';
		if (queryMapId) return queryMapId;
		const routeMatch = page.url.pathname.match(/^\/atlas\/maps\/([^/]+)$/);
		const routeMapId = routeMatch?.[1]?.trim() ?? '';
		if (routeMapId) return decodeURIComponent(routeMapId);
		return null;
	});
	const viewerMode = $derived.by(() => /^\/atlas\/maps\/[^/]+$/.test(page.url.pathname));

	const selectedMap = $derived.by(
		() => filteredMaps.find((entry) => String(entry.id) === selectedMapId) ?? null,
	);
	const mapById = $derived.by(() => mapIndexById(maps));
	const mapHierarchy = $derived.by(() => mapHierarchyEntries(maps));
	const selectedMapBreadcrumbs = $derived.by(() =>
		selectedMap ? mapBreadcrumbs(String(selectedMap.id), maps) : [],
	);
	const selectedParentMap = $derived.by(() =>
		draftParentMapId ? (mapById[draftParentMapId] ?? null) : null,
	);
	const parentPoiOptions = $derived.by(() => selectedParentMap?.data.pois ?? []);

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
		Object.values(vaultObjectsById).sort((a, b) =>
			a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
		),
	);
	const layerById = $derived.by(() => {
		const index: Record<string, MapAnnotationLayerData> = {};
		for (const layer of draftLayers) {
			index[layer.id] = layer;
		}
		return index;
	});
	const routeById = $derived.by(() => {
		const index: Record<string, MapRouteData> = {};
		for (const route of draftRoutes) {
			index[route.id] = route;
		}
		return index;
	});
	const selectedRoute = $derived.by(() =>
		selectedRouteId ? (routeById[selectedRouteId] ?? null) : null,
	);
	const routeSummaries = $derived.by(() => {
		if (!selectedMap) return [] as Array<{ route: MapRouteData; label: string }>;
		return draftRoutes.map((route) => {
			const summary = summarizeRouteDistance(route, {
				width: draftImageSize?.width ?? selectedMap.data.width,
				height: draftImageSize?.height ?? selectedMap.data.height,
				grid: gridDraft,
				scale: draftScaleEnabled
					? {
							unitsPerGridSquare: Number.parseFloat(draftScaleUnits) || 5,
							unitLabel: draftScaleUnitLabel,
						}
					: undefined,
			});
			const pieces: string[] = [];
			if (summary.gridSquares !== null) {
				pieces.push(`${summary.gridSquares.toFixed(2)} sq`);
			}
			if (summary.scaledDistance !== null && summary.unitLabel) {
				pieces.push(formatScaledDistance(summary.scaledDistance, summary.unitLabel));
			}
			return {
				route,
				label: pieces.join(' | ') || 'Distance unavailable',
			};
		});
	});
	const partyLocation = $derived(sessionState.partyLocation);
	const partyMarker = $derived.by(() => {
		if (!partyLocation || !selectedMap) return null;
		if (partyLocation.mapId !== String(selectedMap.id)) return null;
		return {
			x: partyLocation.x,
			y: partyLocation.y,
			label: 'Party',
		};
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
		if (!requestedMapId || !selectedMap || String(selectedMap.id) !== requestedMapId) return null;
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
		if (playerModeState.enabled) return [];
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
	const boards = $derived(sessionBoardsState.boards);
	const selectedBoard = $derived.by(
		() =>
			boards.find((board) => board.id === selectedBoardId) ??
			sessionBoardsState.activeBoard ??
			null,
	);
	const combatTiles = $derived.by(
		() =>
			(selectedBoard?.tiles.filter((tile) => tile.type === 'combat') as SessionBoardCombatTile[]) ??
			[],
	);
	const selectedCombatTile = $derived.by(
		() => combatTiles.find((tile) => tile.id === selectedCombatTileId) ?? combatTiles[0] ?? null,
	);
	const selectedCombat = $derived.by(() =>
		selectedCombatTile ? normalizeCombatState(selectedCombatTile.combat) : null,
	);
	const selectedEncounterLocationId = $derived.by(() => {
		if (!selectedBoard?.sessionContext?.items?.length) return null;
		return (
			selectedBoard.sessionContext.items.find((item) => item.category === 'location')?.noteId ??
			null
		);
	});
	const mapLinkedToEncounterLocation = $derived.by(() => {
		if (!selectedMap || !selectedEncounterLocationId) return false;
		return (selectedMap.data.areaNoteId?.trim() ?? '') === selectedEncounterLocationId;
	});
	const combatMapState = $derived.by(
		() => selectedCombat?.mapState ?? createDefaultCombatMapState(),
	);
	const activeFogState = $derived.by<MapFogState>(
		() => combatMapState.fogState ?? createDefaultMapFogState(),
	);
	const persistedFogFallback = $derived.by(
		() => selectedMap?.data.lastSessionFog?.fogState ?? null,
	);
	const effectiveFogState = $derived.by<MapFogState>(() =>
		playerModeState.enabled && remoteFogStateOverride
			? remoteFogStateOverride
			: playerModeState.enabled && activeFogState.polygons.length === 0 && persistedFogFallback
				? persistedFogFallback
				: activeFogState,
	);
	const fogPolygonCounts = $derived.by(() => countFogPolygonsByMode(effectiveFogState));
	const fogRevealBounds = $derived.by(() => revealBoundsFromFogState(effectiveFogState));
	const activeCombatant = $derived.by(
		() =>
			selectedCombat?.combatants.find((entry) => entry.id === selectedCombat.activeCombatantId) ??
			null,
	);
	const selectedCombatToken = $derived.by(() => {
		const requestedId =
			combatMapState.selectedCombatantId ?? selectedCombat?.activeCombatantId ?? null;
		if (!requestedId) return null;
		return combatMapState.tokens.find((token) => token.combatantId === requestedId) ?? null;
	});
	const movementBudgetSquares = $derived.by(() =>
		activeCombatant
			? movementSquaresForCombatant(
					activeCombatant,
					Math.max(1, Number.parseFloat(draftScaleUnits) || 5),
				)
			: 0,
	);
	const selectedRangeProfile = $derived.by(() =>
		activeCombatant
			? rangeProfileForCombatant(
					activeCombatant,
					Math.max(1, Number.parseFloat(draftScaleUnits) || 5),
				)
			: null,
	);
	const blockedCellKeys = $derived.by(() => {
		const blocked: string[] = [];
		for (const token of combatMapState.tokens) {
			if (selectedCombatToken && token.combatantId === selectedCombatToken.combatantId) continue;
			blocked.push(gridCellKey({ x: token.x, y: token.y }));
		}
		return blocked;
	});
	const difficultTerrainCellKeys = $derived.by(() =>
		combatMapState.difficultTerrain.map((cell) => gridCellKey(cell)),
	);
	const movementRangeCells = $derived.by(() => {
		if (!combatModeEnabled || !selectedCombatToken || !selectedCombat || !selectedMap?.data.grid)
			return [];
		return reachableCells(
			{ x: selectedCombatToken.x, y: selectedCombatToken.y },
			movementBudgetSquares,
			{
				gridType: gridDraft.type,
				blocked: new Set(blockedCellKeys),
				difficultTerrain: new Set(difficultTerrainCellKeys),
			},
		).map((entry) => entry.cell);
	});
	const templateOverlays = $derived.by(() => {
		if (!combatModeEnabled || !selectedMap?.data.grid) return [];
		return combatMapState.templates.map((template) => ({
			id: template.id,
			cells: cellsForTemplate(template, gridDraft.type),
			color:
				template.shape === 'cone'
					? 'rgba(251, 146, 60, 0.18)'
					: template.shape === 'line'
						? 'rgba(56, 189, 248, 0.18)'
						: template.shape === 'cube'
							? 'rgba(168, 85, 247, 0.18)'
							: 'rgba(239, 68, 68, 0.18)',
			stroke:
				template.shape === 'cone'
					? 'rgba(249, 115, 22, 0.85)'
					: template.shape === 'line'
						? 'rgba(14, 116, 144, 0.85)'
						: template.shape === 'cube'
							? 'rgba(109, 40, 217, 0.85)'
							: 'rgba(220, 38, 38, 0.85)',
		}));
	});
	const templatePreviewOverlay = $derived.by(() => {
		if (!templateDragOriginCell || !templatePreviewTargetCell || !selectedMap?.data.grid)
			return null;
		const preview = normalizeTemplateInput({
			shape: templateShape,
			originX: templateDragOriginCell.x,
			originY: templateDragOriginCell.y,
			targetX: templatePreviewTargetCell.x,
			targetY: templatePreviewTargetCell.y,
			radiusSquares: templateRadiusSquares,
			lengthSquares: templateLineLengthSquares,
			widthSquares: templateLineWidthSquares,
		});
		return {
			id: 'template-preview',
			cells: cellsForTemplate(preview, gridDraft.type),
			color: 'rgba(16, 185, 129, 0.15)',
			stroke: 'rgba(16, 185, 129, 0.8)',
		};
	});
	const combinedTemplateOverlays = $derived.by(() => {
		const overlays = [...templateOverlays];
		if (templatePreviewOverlay) overlays.push(templatePreviewOverlay);
		return overlays;
	});
	const combatViewerTokens = $derived.by(() => {
		if (playerModeState.enabled) return [];
		if (!selectedCombat) return [];
		const combatantsById = new Map(selectedCombat.combatants.map((entry) => [entry.id, entry]));
		return combatMapState.tokens
			.map((token) => {
				const combatant = combatantsById.get(token.combatantId);
				if (!combatant) return null;
				const hpRatio =
					combatant.currentHp !== null && combatant.maxHp !== null && combatant.maxHp > 0
						? Math.max(0, Math.min(1, combatant.currentHp / combatant.maxHp))
						: null;
				return {
					id: token.combatantId,
					label: combatant.name,
					cellX: token.x,
					cellY: token.y,
					initials: token.initials || combatant.name.slice(0, 2).toUpperCase(),
					imageUrl: token.imageUrl,
					statusIcons: conditionIconsForCombatant(combatant),
					hpRatio,
					hpTone: hpBarToneForCombatant(combatant),
				};
			})
			.filter((token): token is NonNullable<typeof token> => !!token);
	});

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
		draftParentMapId = map.data.parentMapId ?? '';
		draftParentPoiId = map.data.parentPoiId ?? '';
		draftRoutes = (map.data.routes ?? []).map((route) => ({
			...route,
			waypoints: route.waypoints.map((waypoint) => ({ ...waypoint })),
		}));
		selectedRouteId = draftRoutes[0]?.id ?? null;
		routeEditMode = false;
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

	function learnAboutAtlasSystem(): void {
		toastState.info(
			'Atlas maps let you pin notes to geography, connect linked locations, and reveal regions to players.',
		);
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
					parentMapId: draftParentMapId || undefined,
					parentPoiId: draftParentPoiId || undefined,
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
					routes: draftRoutes,
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

	function mapFractionToGridCell(x: number, y: number): GridCell | null {
		const grid = selectedMap?.data.grid;
		if (!grid || !draftImageSize) return null;
		const imageX = x * draftImageSize.width;
		const imageY = y * draftImageSize.height;
		if (grid.type === 'square') {
			return {
				x: Math.floor((imageX - grid.originX) / Math.max(1, grid.cellSize)),
				y: Math.floor((imageY - grid.originY) / Math.max(1, grid.cellSize)),
			};
		}
		const hexHeight = Math.sqrt(3) * (grid.cellSize / 2);
		const row = Math.round((imageY - grid.originY) / Math.max(0.001, hexHeight));
		const offsetX = row % 2 === 0 ? 0 : grid.cellSize / 2;
		const col = Math.round((imageX - grid.originX - offsetX) / Math.max(1, grid.cellSize));
		return { x: col, y: row };
	}

	function handleMapClick(payload: {
		x: number;
		y: number;
		ctrlKey: boolean;
		metaKey: boolean;
		shiftKey: boolean;
	}): void {
		mapContextMenu = null;
		if (isFogEditingContextReady()) return;
		if (routeEditMode) {
			if (!selectedRoute) {
				const routeId = generateMapAnnotationId('layer').replace('layer-', 'route-');
				upsertRoute({
					id: routeId,
					name: newRouteName.trim() || `Route ${draftRoutes.length + 1}`,
					style: newRouteStyle,
					waypoints: [{ x: payload.x, y: payload.y }],
				});
				return;
			}
			const updated: MapRouteData = {
				...selectedRoute,
				style: selectedRoute.style ?? newRouteStyle,
				waypoints: [...selectedRoute.waypoints, { x: payload.x, y: payload.y }],
			};
			upsertRoute(updated);
			return;
		}
		if (combatModeEnabled && selectedCombat && selectedMap?.data.grid) {
			if (templatePlacementMode || terrainPaintMode) return;
			const cell = mapFractionToGridCell(payload.x, payload.y);
			if (cell && selectedCombatToken) {
				const path = findShortestPath(
					{ x: selectedCombatToken.x, y: selectedCombatToken.y },
					cell,
					{
						gridType: gridDraft.type,
						blocked: new Set(blockedCellKeys),
						difficultTerrain: new Set(difficultTerrainCellKeys),
					},
				);
				pathPreviewCells = path?.cells ?? [];
				if (!path) {
					toastState.info('No route to the selected square.');
				}
			}
			return;
		}

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
		mapContextMenu = null;
		selectedPoiId = payload.id;
		const poi = draftPois.find((entry) => entry.id === payload.id);
		if (!poi) return;
		const childMapId = mapLinkedFromPoi(poi);
		if (childMapId) {
			selectMapById(childMapId);
			return;
		}
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

	function selectMapById(mapId: string | null): void {
		if (!mapId) return;
		if (!maps.some((entry) => String(entry.id) === mapId)) return;
		selectedMapId = mapId;
		void goto(resolve(`/atlas/maps/${encodeURIComponent(mapId)}`), {
			replaceState: true,
			noScroll: true,
		});
	}

	function mapLinkedFromPoi(poi: MapPoiData): string | null {
		return resolvePoiLinkedMapId(poi, mapById);
	}

	function upsertRoute(route: MapRouteData): void {
		const existing = draftRoutes.find((entry) => entry.id === route.id);
		if (existing) {
			draftRoutes = draftRoutes.map((entry) => (entry.id === route.id ? route : entry));
		} else {
			draftRoutes = [...draftRoutes, route];
		}
		selectedRouteId = route.id;
		markDirty();
	}

	function handleCreateRoute(): void {
		const routeId = generateMapAnnotationId('layer').replace('layer-', 'route-');
		const route: MapRouteData = {
			id: routeId,
			name: newRouteName.trim() || `Route ${draftRoutes.length + 1}`,
			style: newRouteStyle,
			waypoints: [],
		};
		upsertRoute(route);
		routeEditMode = true;
	}

	function handleDeleteRoute(routeId: string): void {
		draftRoutes = draftRoutes.filter((route) => route.id !== routeId);
		if (selectedRouteId === routeId) {
			selectedRouteId = draftRoutes[0]?.id ?? null;
		}
		markDirty();
	}

	function handleClearRouteWaypoints(routeId: string): void {
		draftRoutes = draftRoutes.map((route) =>
			route.id === routeId ? { ...route, waypoints: [] } : route,
		);
		markDirty();
	}

	async function handleMarkPartyLocation(location: {
		x: number;
		y: number;
		poiId?: string;
		source: 'poi' | 'point';
	}): Promise<void> {
		if (!selectedMap) return;
		mapContextMenu = null;
		await sessionState.setPartyLocation({
			mapId: String(selectedMap.id),
			x: location.x,
			y: location.y,
			poiId: location.poiId,
			source: location.source,
			updatedAt: nowISO(),
		});
		toastState.success('Party location updated.');
	}

	function createCombatMapId(prefix: string): string {
		if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
			return `${prefix}-${crypto.randomUUID().slice(0, 10)}`;
		}
		return `${prefix}-${Math.random().toString(36).slice(2, 12)}`;
	}

	type FogChannelMessage =
		| {
				kind: 'fog_update';
				peerId: string;
				boardId: string;
				tileId: string;
				mapId: string;
				fogState: MapFogState;
				operation?: MapFogPolygonOperation;
				issuedAt: string;
		  }
		| {
				kind: 'fog_snapshot_request';
				peerId: string;
				boardId: string;
				tileId: string;
				mapId: string;
		  };

	type PartyLocationChannelMessage = {
		kind: 'party_location_update';
		peerId: string;
		location: {
			mapId: string;
			x: number;
			y: number;
			poiId?: string;
			source: 'poi' | 'point';
			updatedAt: string;
		} | null;
	};

	function queueCombatPersist(nextCombat: SessionBoardCombatState): void {
		if (!selectedBoard || !selectedCombatTile) return;
		const boardId = selectedBoard.id;
		const tileId = selectedCombatTile.id;
		const normalized = normalizeCombatState(nextCombat);
		savingCombatMap = true;
		combatPersistQueue = combatPersistQueue
			.then(async () => {
				await sessionBoardsState.updateTile(boardId, tileId, { combat: normalized });
			})
			.catch((saveError) => {
				void reportRuntimeError({
					category: 'storage',
					code: 'COMBAT_MAP_STATE_SAVE_FAILED',
					error: saveError,
				});
				toastState.error(`Failed to save combat map changes: ${String(saveError)}`);
			})
			.finally(() => {
				savingCombatMap = false;
			});
	}

	function appendCombatMapHistoryEntry(
		mapState: SessionBoardCombatState['mapState'],
		kind: 'movement' | 'status' | 'terrain' | 'template' | 'sync' | 'fog',
		message: string,
		combatantId?: string,
	): SessionBoardCombatState['mapState'] {
		return appendMapHistory(
			mapState,
			{
				at: nowISO(),
				kind,
				message,
				combatantId,
			},
			() => createCombatMapId('map-history'),
		);
	}

	function postFogChannelMessage(message: FogChannelMessage): void {
		if (!message.boardId || !message.tileId || !message.mapId) return;
		fogBroadcastChannel?.postMessage(message);
	}

	function postPartyLocationMessage(location: PartyLocationChannelMessage['location']): void {
		partyBroadcastChannel?.postMessage({
			kind: 'party_location_update',
			peerId: fogChannelPeerId,
			location,
		} satisfies PartyLocationChannelMessage);
	}

	function handlePartyLocationMessage(raw: unknown): void {
		if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return;
		const message = raw as Partial<PartyLocationChannelMessage>;
		if (message.kind !== 'party_location_update') return;
		if (typeof message.peerId !== 'string' || message.peerId === fogChannelPeerId) return;
		const location = message.location;
		void sessionState.setPartyLocation(
			location
				? {
						mapId: location.mapId,
						x: location.x,
						y: location.y,
						poiId: location.poiId,
						source: location.source === 'poi' ? 'poi' : 'point',
						updatedAt: location.updatedAt,
					}
				: null,
		);
	}

	function maybePlayRevealCue(operation: MapFogPolygonOperation): void {
		if (operation.mode !== 'reveal') return;
		if (typeof window === 'undefined') return;
		const atmosphere = (
			window as Window & {
				dndtoolsAtmosphere?: { active?: boolean; playCue?: (cue: string) => void };
			}
		).dndtoolsAtmosphere;
		if (atmosphere?.active && typeof atmosphere.playCue === 'function') {
			atmosphere.playCue('reveal');
		}
		window.dispatchEvent(
			new CustomEvent('dndtools:map-reveal', {
				detail: {
					operationId: operation.id,
					mapId: selectedMap ? String(selectedMap.id) : null,
				},
			}),
		);
	}

	function setFogConfig(next: Partial<Pick<MapFogState, 'colorTheme' | 'freeExplore'>>): void {
		if (!selectedCombat) return;
		const currentFog = combatMapState.fogState ?? createDefaultMapFogState();
		if (
			(next.colorTheme === undefined || next.colorTheme === currentFog.colorTheme) &&
			(next.freeExplore === undefined || next.freeExplore === currentFog.freeExplore)
		) {
			return;
		}
		const updatedAt = nowISO();
		const nextFogState: MapFogState = {
			...currentFog,
			...next,
			updatedAt,
		};
		const nextMapState = appendCombatMapHistoryEntry(
			{
				...combatMapState,
				fogState: nextFogState,
			},
			'fog',
			`Fog settings updated (${nextFogState.colorTheme}, free explore ${
				nextFogState.freeExplore ? 'on' : 'off'
			}).`,
		);
		queueCombatPersist({
			...selectedCombat,
			mapState: nextMapState,
		});
		postFogChannelMessage({
			kind: 'fog_update',
			peerId: fogChannelPeerId,
			boardId: String(selectedBoard?.id ?? ''),
			tileId: selectedCombatTile?.id ?? '',
			mapId: selectedMap ? String(selectedMap.id) : '',
			fogState: nextFogState,
			issuedAt: updatedAt,
		});
	}

	function applyFogPolygonOperation(operation: MapFogPolygonOperation): void {
		if (!selectedCombat) return;
		const updatedAt = nowISO();
		const nextFogState = appendFogPolygonOperation(
			combatMapState.fogState,
			{
				id: operation.id,
				mode: operation.mode,
				shape: operation.shape,
				points: operation.points,
				createdAt: operation.createdAt,
			},
			updatedAt,
		);
		nextFogState.colorTheme = fogColorTheme;
		nextFogState.freeExplore = fogFreeExplore;
		const message =
			operation.mode === 'reveal'
				? `Revealed ${operation.shape} area (${operation.points.length} points).`
				: `Re-fogged ${operation.shape} area (${operation.points.length} points).`;
		const nextMapState = appendCombatMapHistoryEntry(
			{
				...combatMapState,
				fogState: nextFogState,
			},
			'fog',
			message,
		);
		queueCombatPersist({
			...selectedCombat,
			mapState: nextMapState,
		});
		if (operation.mode === 'reveal') {
			maybePlayRevealCue(operation);
		}
		postFogChannelMessage({
			kind: 'fog_update',
			peerId: fogChannelPeerId,
			boardId: String(selectedBoard?.id ?? ''),
			tileId: selectedCombatTile?.id ?? '',
			mapId: selectedMap ? String(selectedMap.id) : '',
			fogState: nextFogState,
			operation,
			issuedAt: updatedAt,
		});
	}

	function clearFogOperations(): void {
		if (!selectedCombat) return;
		const updatedAt = nowISO();
		const nextFogState: MapFogState = {
			...(combatMapState.fogState ?? createDefaultMapFogState()),
			polygons: [],
			colorTheme: fogColorTheme,
			freeExplore: fogFreeExplore,
			updatedAt,
		};
		const nextMapState = appendCombatMapHistoryEntry(
			{
				...combatMapState,
				fogState: nextFogState,
			},
			'fog',
			'Cleared all fog reveal/refog operations.',
		);
		queueCombatPersist({
			...selectedCombat,
			mapState: nextMapState,
		});
		postFogChannelMessage({
			kind: 'fog_update',
			peerId: fogChannelPeerId,
			boardId: String(selectedBoard?.id ?? ''),
			tileId: selectedCombatTile?.id ?? '',
			mapId: selectedMap ? String(selectedMap.id) : '',
			fogState: nextFogState,
			issuedAt: updatedAt,
		});
	}

	function isFogMessageInScope(message: {
		boardId: string;
		tileId: string;
		mapId: string;
	}): boolean {
		if (!selectedBoard || !selectedCombatTile || !selectedMap) return false;
		return (
			message.boardId === String(selectedBoard.id) &&
			message.tileId === selectedCombatTile.id &&
			message.mapId === String(selectedMap.id)
		);
	}

	function handleFogChannelMessage(raw: unknown): void {
		if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return;
		const message = raw as Partial<FogChannelMessage>;
		if (!message.kind || typeof message.peerId !== 'string') return;
		if (message.peerId === fogChannelPeerId) return;

		if (
			message.kind === 'fog_snapshot_request' &&
			!playerModeState.enabled &&
			typeof message.boardId === 'string' &&
			typeof message.tileId === 'string' &&
			typeof message.mapId === 'string' &&
			isFogMessageInScope({
				boardId: message.boardId,
				tileId: message.tileId,
				mapId: message.mapId,
			})
		) {
			postFogChannelMessage({
				kind: 'fog_update',
				peerId: fogChannelPeerId,
				boardId: message.boardId,
				tileId: message.tileId,
				mapId: message.mapId,
				fogState: activeFogState,
				issuedAt: nowISO(),
			});
			return;
		}

		if (
			message.kind !== 'fog_update' ||
			typeof message.boardId !== 'string' ||
			typeof message.tileId !== 'string' ||
			typeof message.mapId !== 'string' ||
			!isFogMessageInScope({
				boardId: message.boardId,
				tileId: message.tileId,
				mapId: message.mapId,
			})
		) {
			return;
		}
		const normalizedState = normalizeMapFogState(message.fogState);
		if (!normalizedState) return;
		remoteFogStateOverride = normalizedState;
		const operation = message.operation;
		if (operation?.mode === 'reveal') {
			fogAnimationOperation = operation;
		}
	}

	function appendStatusChangeHistory(
		previous: SessionBoardCombatState,
		next: SessionBoardCombatState,
	): SessionBoardCombatState['mapState'] {
		let mapState = next.mapState;
		const previousById = new Map(previous.combatants.map((entry) => [entry.id, entry]));
		for (const combatant of next.combatants) {
			const before = previousById.get(combatant.id);
			if (!before) continue;
			if (before.currentHp !== combatant.currentHp) {
				mapState = appendCombatMapHistoryEntry(
					mapState,
					'status',
					`${combatant.name} HP ${before.currentHp ?? 'n/a'} -> ${combatant.currentHp ?? 'n/a'}`,
					combatant.id,
				);
			}
			const previousOutcome = before.outcome;
			if (previousOutcome !== combatant.outcome) {
				mapState = appendCombatMapHistoryEntry(
					mapState,
					'status',
					`${combatant.name} outcome changed to ${combatant.outcome}`,
					combatant.id,
				);
			}
			const beforeConditions = before.conditions
				.map((entry) => entry.toLowerCase())
				.sort()
				.join('|');
			const afterConditions = combatant.conditions
				.map((entry) => entry.toLowerCase())
				.sort()
				.join('|');
			if (beforeConditions !== afterConditions) {
				mapState = appendCombatMapHistoryEntry(
					mapState,
					'status',
					`${combatant.name} conditions: ${
						combatant.conditions.length > 0 ? combatant.conditions.join(', ') : 'none'
					}`,
					combatant.id,
				);
			}
		}
		return mapState;
	}

	function buildAutoSyncedMapState(
		baseCombat: SessionBoardCombatState,
	): SessionBoardCombatState['mapState'] {
		let mapState = baseCombat.mapState ?? createDefaultCombatMapState();
		const linkedMapId =
			mapLinkedToEncounterLocation && selectedMap ? String(selectedMap.id) : mapState.mapId;
		const shouldAutoPlaceTokens =
			!!linkedMapId && mapLinkedToEncounterLocation && baseCombat.combatants.length > 0;
		const nextTokens = shouldAutoPlaceTokens
			? autoPlaceCombatTokens(baseCombat.combatants, mapState.tokens)
			: mapState.tokens.filter((token) =>
					baseCombat.combatants.some((combatant) => combatant.id === token.combatantId),
				);
		if (
			nextTokens.length !== mapState.tokens.length ||
			nextTokens.some(
				(token, index) =>
					mapState.tokens[index]?.combatantId !== token.combatantId ||
					mapState.tokens[index]?.x !== token.x ||
					mapState.tokens[index]?.y !== token.y,
			)
		) {
			mapState = appendCombatMapHistoryEntry(
				{
					...mapState,
					tokens: nextTokens,
				},
				'sync',
				'Combatants synchronized to map tokens.',
			);
		} else if (linkedMapId !== mapState.mapId) {
			mapState = appendCombatMapHistoryEntry(
				{
					...mapState,
					mapId: linkedMapId,
				},
				'sync',
				'Active combat map link updated.',
			);
		}
		return {
			...mapState,
			mapId: linkedMapId ?? null,
			selectedCombatantId: baseCombat.activeCombatantId ?? mapState.selectedCombatantId ?? null,
		};
	}

	function ensureCombatMapSynchronized(): void {
		if (!combatModeEnabled || !selectedCombat || !selectedCombatTile) return;
		const syncKey = [
			selectedCombatTile.id,
			selectedMap ? String(selectedMap.id) : 'no-map',
			selectedCombat.combatants.length,
			selectedCombat.combatants.map((entry) => entry.id).join('|'),
			selectedCombat.mapState.tokens.length,
			selectedCombat.activeCombatantId ?? '',
			mapLinkedToEncounterLocation ? 'linked' : 'unlinked',
		].join(':');
		if (syncKey === lastCombatMapSyncKey) return;
		lastCombatMapSyncKey = syncKey;
		const nextMapState = buildAutoSyncedMapState(selectedCombat);
		const next = normalizeCombatState({
			...selectedCombat,
			mapState: nextMapState,
		});
		if (JSON.stringify(next.mapState) !== JSON.stringify(selectedCombat.mapState)) {
			queueCombatPersist(next);
		}
	}

	function handleCombatTrackerUpdate(nextCombatState: SessionBoardCombatState): void {
		if (!selectedCombat) return;
		const normalizedNext = normalizeCombatState(nextCombatState);
		const mapState = appendStatusChangeHistory(selectedCombat, normalizedNext);
		queueCombatPersist({
			...normalizedNext,
			mapState: {
				...mapState,
				selectedCombatantId: normalizedNext.activeCombatantId ?? mapState.selectedCombatantId,
				templates:
					normalizedNext.endedAt && normalizedNext.endedAt !== selectedCombat.endedAt
						? []
						: mapState.templates,
			},
		});
	}

	function setTerrainCell(cell: GridCell, difficult: boolean): void {
		if (!selectedCombat) return;
		const key = gridCellKey(cell);
		const current = new Set(combatMapState.difficultTerrain.map((entry) => gridCellKey(entry)));
		const alreadySet = current.has(key);
		if ((difficult && alreadySet) || (!difficult && !alreadySet)) return;
		let nextTerrain = combatMapState.difficultTerrain;
		if (difficult) {
			nextTerrain = [...nextTerrain, cell];
		} else {
			nextTerrain = nextTerrain.filter((entry) => gridCellKey(entry) !== key);
		}
		const nextMapState = appendCombatMapHistoryEntry(
			{
				...combatMapState,
				difficultTerrain: nextTerrain,
			},
			'terrain',
			`${difficult ? 'Marked' : 'Cleared'} difficult terrain at (${cell.x}, ${cell.y}).`,
		);
		queueCombatPersist({
			...selectedCombat,
			mapState: nextMapState,
		});
	}

	function handleCombatTokenClick(payload: {
		id: string;
		ctrlKey: boolean;
		metaKey: boolean;
	}): void {
		if (!selectedCombat) return;
		const nextMapState = {
			...combatMapState,
			selectedCombatantId: payload.id,
		};
		queueCombatPersist({
			...selectedCombat,
			activeCombatantId: payload.id,
			mapState: nextMapState,
		});
	}

	function handleCombatTokenDrop(payload: { id: string; cellX: number; cellY: number }): void {
		if (!selectedCombat) return;
		const token = combatMapState.tokens.find((entry) => entry.combatantId === payload.id);
		if (!token) return;
		const start = { x: token.x, y: token.y };
		const target = { x: payload.cellX, y: payload.cellY };
		const path = findShortestPath(start, target, {
			gridType: gridDraft.type,
			blocked: new Set(
				combatMapState.tokens
					.filter((entry) => entry.combatantId !== payload.id)
					.map((entry) => gridCellKey({ x: entry.x, y: entry.y })),
			),
			difficultTerrain: new Set(difficultTerrainCellKeys),
		});
		if (!path) {
			toastState.error('No valid path to destination square.');
			return;
		}
		const budget = activeCombatant ? movementSquaresForCombatant(activeCombatant) : 0;
		if (budget > 0 && path.cost > budget) {
			toastState.error(`Movement exceeds speed (${path.cost} > ${budget} squares).`);
			return;
		}
		pathPreviewCells = path.cells;
		const nextTokens = combatMapState.tokens.map((entry) =>
			entry.combatantId === payload.id ? { ...entry, x: target.x, y: target.y } : entry,
		);
		const label =
			selectedCombat.combatants.find((entry) => entry.id === payload.id)?.name ?? payload.id;
		const nextMapState = appendCombatMapHistoryEntry(
			{
				...combatMapState,
				tokens: nextTokens,
				selectedCombatantId: payload.id,
			},
			'movement',
			`${label} moved to (${target.x}, ${target.y}) using ${path.cost} squares.`,
			payload.id,
		);
		queueCombatPersist({
			...selectedCombat,
			activeCombatantId: payload.id,
			mapState: nextMapState,
		});
	}

	function beginTemplateDrag(cell: GridCell): void {
		templateDragOriginCell = cell;
		templatePreviewTargetCell = cell;
	}

	function finalizeTemplateDrag(): void {
		if (!selectedCombat || !templateDragOriginCell || !templatePreviewTargetCell) return;
		const nextTemplate = normalizeTemplateInput({
			id: createCombatMapId('template'),
			shape: templateShape,
			originX: templateDragOriginCell.x,
			originY: templateDragOriginCell.y,
			targetX: templatePreviewTargetCell.x,
			targetY: templatePreviewTargetCell.y,
			radiusSquares: templateRadiusSquares,
			lengthSquares: templateLineLengthSquares,
			widthSquares: templateLineWidthSquares,
			createdAt: nowISO(),
		});
		const nextMapState = appendCombatMapHistoryEntry(
			{
				...combatMapState,
				templates: [...combatMapState.templates, nextTemplate],
			},
			'template',
			`Placed ${templateShape} template from (${nextTemplate.originX}, ${nextTemplate.originY}) to (${nextTemplate.targetX}, ${nextTemplate.targetY}).`,
		);
		queueCombatPersist({
			...selectedCombat,
			mapState: nextMapState,
		});
		templateDragOriginCell = null;
		templatePreviewTargetCell = null;
	}

	function removeTemplate(templateId: string): void {
		if (!selectedCombat) return;
		const existing = combatMapState.templates.find((entry) => entry.id === templateId);
		if (!existing) return;
		const nextMapState = appendCombatMapHistoryEntry(
			{
				...combatMapState,
				templates: combatMapState.templates.filter((entry) => entry.id !== templateId),
			},
			'template',
			`Removed ${existing.shape} template.`,
		);
		queueCombatPersist({
			...selectedCombat,
			mapState: nextMapState,
		});
	}

	function clearAllTemplates(): void {
		if (!selectedCombat || combatMapState.templates.length === 0) return;
		const nextMapState = appendCombatMapHistoryEntry(
			{
				...combatMapState,
				templates: [],
			},
			'template',
			'Cleared all AoE templates.',
		);
		queueCombatPersist({
			...selectedCombat,
			mapState: nextMapState,
		});
	}

	function isFogEditingContextReady(): boolean {
		return fogEditingEnabled && !!selectedCombat && !!selectedMap;
	}

	function commitFogPolygon(shape: MapFogBrushShape, points: MapFogPoint[]): void {
		const normalizedPoints = normalizeLassoPoints(points, 0.0015);
		if (normalizedPoints.length < 3) return;
		const operation: MapFogPolygonOperation = {
			id: createCombatMapId('fog-op'),
			mode: fogMode,
			shape,
			points: normalizedPoints,
			createdAt: nowISO(),
		};
		applyFogPolygonOperation(operation);
	}

	function handleFogPointerDown(point: MapFogPoint): void {
		if (!isFogEditingContextReady()) return;
		if (fogTool === 'circle') {
			fogPainting = true;
			fogDragCurrent = point;
			commitFogPolygon('circle', polygonFromCircle(point, fogBrushRadius, 18));
			return;
		}
		if (fogTool === 'rectangle') {
			fogPainting = true;
			fogDragStart = point;
			fogDragCurrent = point;
			return;
		}
		fogPainting = true;
		fogLassoPoints = [point];
	}

	function handleFogPointerMove(point: MapFogPoint): void {
		if (!isFogEditingContextReady() || !fogPainting) return;
		if (fogTool === 'circle') {
			const previous = fogDragCurrent;
			fogDragCurrent = point;
			if (!previous) {
				commitFogPolygon('circle', polygonFromCircle(point, fogBrushRadius, 18));
				return;
			}
			if (Math.hypot(point.x - previous.x, point.y - previous.y) < fogBrushRadius * 0.35) return;
			commitFogPolygon('circle', polygonFromCircle(point, fogBrushRadius, 18));
			return;
		}
		if (fogTool === 'rectangle') {
			fogDragCurrent = point;
			return;
		}
		fogLassoPoints = [...fogLassoPoints, point];
	}

	function handleFogPointerUp(point: MapFogPoint): void {
		if (!isFogEditingContextReady()) return;
		if (fogTool === 'rectangle' && fogDragStart) {
			const polygon = polygonFromRectangle(fogDragStart, point);
			commitFogPolygon('rectangle', polygon);
		}
		if (fogTool === 'polygon' && fogLassoPoints.length > 2) {
			commitFogPolygon('polygon', [...fogLassoPoints, point]);
		}
		fogPainting = false;
		fogDragStart = null;
		fogDragCurrent = null;
		fogLassoPoints = [];
	}

	function handleMapPointerDown(payload: {
		x: number;
		y: number;
		cellX: number | null;
		cellY: number | null;
		button: number;
		buttons: number;
		ctrlKey: boolean;
		metaKey: boolean;
		shiftKey: boolean;
		altKey: boolean;
	}): void {
		if (isFogEditingContextReady()) {
			if (payload.button !== 0) return;
			handleFogPointerDown({ x: payload.x, y: payload.y });
			return;
		}
		if (!combatModeEnabled || payload.cellX === null || payload.cellY === null) return;
		const cell = { x: payload.cellX, y: payload.cellY };
		if (templatePlacementMode) {
			beginTemplateDrag(cell);
			return;
		}
		if (terrainPaintMode) {
			terrainPainting = true;
			setTerrainCell(cell, !terrainEraseMode);
		}
	}

	function handleMapPointerMove(payload: {
		x: number;
		y: number;
		cellX: number | null;
		cellY: number | null;
		button: number;
		buttons: number;
		ctrlKey: boolean;
		metaKey: boolean;
		shiftKey: boolean;
		altKey: boolean;
	}): void {
		if (isFogEditingContextReady()) {
			handleFogPointerMove({ x: payload.x, y: payload.y });
			return;
		}
		if (!combatModeEnabled || payload.cellX === null || payload.cellY === null) return;
		const cell = { x: payload.cellX, y: payload.cellY };
		if (templatePlacementMode && templateDragOriginCell) {
			templatePreviewTargetCell = cell;
			return;
		}
		if (terrainPaintMode && terrainPainting) {
			setTerrainCell(cell, !terrainEraseMode);
		}
	}

	function handleMapPointerUp(payload: {
		x: number;
		y: number;
		cellX: number | null;
		cellY: number | null;
		button: number;
		buttons: number;
		ctrlKey: boolean;
		metaKey: boolean;
		shiftKey: boolean;
		altKey: boolean;
	}): void {
		if (isFogEditingContextReady()) {
			handleFogPointerUp({ x: payload.x, y: payload.y });
			return;
		}
		if (templatePlacementMode && templateDragOriginCell) {
			if (payload.cellX !== null && payload.cellY !== null) {
				templatePreviewTargetCell = { x: payload.cellX, y: payload.cellY };
			}
			finalizeTemplateDrag();
		}
		terrainPainting = false;
	}

	function handleMapContextMenu(payload: {
		x: number;
		y: number;
		cellX: number | null;
		cellY: number | null;
		clientX: number;
		clientY: number;
	}): void {
		if (playerModeState.enabled || !selectedMap) return;
		mapContextMenu = {
			clientX: payload.clientX,
			clientY: payload.clientY,
			x: payload.x,
			y: payload.y,
		};
	}

	$effect(() => {
		if (sessionBoardsState.boards.length === 0 && !sessionBoardsState.loading) {
			void sessionBoardsState.loadAll();
		}
	});

	$effect(() => {
		if (selectedBoardId && boards.some((board) => board.id === selectedBoardId)) return;
		selectedBoardId = sessionBoardsState.activeBoard?.id ?? boards[0]?.id ?? null;
	});

	$effect(() => {
		if (selectedBoardId) sessionBoardsState.setActiveBoard(selectedBoardId);
	});

	$effect(() => {
		if (selectedCombatTileId && combatTiles.some((tile) => tile.id === selectedCombatTileId))
			return;
		selectedCombatTileId = combatTiles[0]?.id ?? null;
	});

	$effect(() => {
		if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
		const channel = new BroadcastChannel(MAP_FOG_CHANNEL);
		channel.onmessage = (event: MessageEvent<unknown>) => {
			handleFogChannelMessage(event.data);
		};
		fogBroadcastChannel = channel;
		return () => {
			channel.close();
			if (fogBroadcastChannel === channel) {
				fogBroadcastChannel = null;
			}
		};
	});

	$effect(() => {
		if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
		const channel = new BroadcastChannel(MAP_PARTY_LOCATION_CHANNEL);
		channel.onmessage = (event: MessageEvent<unknown>) => {
			handlePartyLocationMessage(event.data);
		};
		partyBroadcastChannel = channel;
		return () => {
			channel.close();
			if (partyBroadcastChannel === channel) {
				partyBroadcastChannel = null;
			}
		};
	});

	$effect(() => {
		if (!sessionState.loaded && !sessionState.loading) {
			void sessionState.load();
		}
	});

	$effect(() => {
		const location = partyLocation;
		const key = location
			? `${location.mapId}:${location.x.toFixed(5)}:${location.y.toFixed(5)}:${location.updatedAt}`
			: 'none';
		if (key === lastPartyLocationBroadcastKey) return;
		lastPartyLocationBroadcastKey = key;
		postPartyLocationMessage(
			location
				? {
						mapId: location.mapId,
						x: location.x,
						y: location.y,
						poiId: location.poiId,
						source: location.source,
						updatedAt: location.updatedAt,
					}
				: null,
		);
	});

	$effect(() => {
		if (!playerModeState.enabled) {
			remoteFogStateOverride = null;
			remoteFogScopeKey = null;
			return;
		}
		if (!selectedBoard || !selectedCombatTile || !selectedMap) return;
		const key = `${selectedBoard.id}:${selectedCombatTile.id}:${selectedMap.id}`;
		if (remoteFogScopeKey !== key) {
			remoteFogStateOverride = null;
			remoteFogScopeKey = key;
			lastFogSnapshotRequestKey = null;
		}
		if (!fogBroadcastChannel) return;
		if (lastFogSnapshotRequestKey === key) return;
		lastFogSnapshotRequestKey = key;
		postFogChannelMessage({
			kind: 'fog_snapshot_request',
			peerId: fogChannelPeerId,
			boardId: String(selectedBoard.id),
			tileId: selectedCombatTile.id,
			mapId: String(selectedMap.id),
		});
	});

	$effect(() => {
		if (!selectedCombat || !selectedCombatTile || !selectedMap) return;
		if (combatMapState.fogState) return;
		const initializedFog = createDefaultMapFogState();
		const nextMapState = appendCombatMapHistoryEntry(
			{
				...combatMapState,
				fogState: initializedFog,
			},
			'fog',
			'Initialized fog-of-war state for map session.',
		);
		queueCombatPersist({
			...selectedCombat,
			mapState: nextMapState,
		});
	});

	$effect(() => {
		if (!selectedCombatTile || !selectedMap) return;
		const key = `${selectedCombatTile.id}:${String(selectedMap.id)}:${activeFogState.updatedAt}:${activeFogState.polygons.length}`;
		if (lastFogStateSyncKey === key) return;
		lastFogStateSyncKey = key;
		fogColorTheme = activeFogState.colorTheme;
		fogFreeExplore = activeFogState.freeExplore;
	});

	$effect(() => {
		if (!combatModeEnabled) {
			pathPreviewCells = [];
			templateDragOriginCell = null;
			templatePreviewTargetCell = null;
			terrainPainting = false;
			return;
		}
		ensureCombatMapSynchronized();
	});

	$effect(() => {
		if (!fogEditingEnabled || !selectedCombat || !selectedMap) {
			lastFogMapLinkKey = null;
			return;
		}
		const mapId = String(selectedMap.id);
		if (combatMapState.mapId === mapId) return;
		const key = `${selectedCombatTile?.id ?? 'no-tile'}:${mapId}`;
		if (lastFogMapLinkKey === key) return;
		lastFogMapLinkKey = key;
		queueCombatPersist({
			...selectedCombat,
			mapState: appendCombatMapHistoryEntry(
				{
					...combatMapState,
					mapId,
				},
				'fog',
				'Fog editing linked to active map.',
			),
		});
	});

	$effect(() => {
		if (!playerModeState.enabled) return;
		fogEditingEnabled = false;
		editPoiMode = false;
		routeEditMode = false;
		editGridHandles = false;
		terrainPaintMode = false;
		templatePlacementMode = false;
		mapContextMenu = null;
	});

	$effect(() => {
		if (!selectedCombat?.endedAt) return;
		if (!combatMapState.templates.length) return;
		queueCombatPersist({
			...selectedCombat,
			mapState: {
				...combatMapState,
				templates: [],
			},
		});
	});

	$effect(() => {
		if (!selectedCombatToken) {
			pathPreviewCells = [];
			return;
		}
	});

	$effect(() => {
		if (!mapsState.loaded && !mapsState.loading) {
			void mapsState.loadAll();
		}
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
		if (viewerMode) {
			const forcedId = requestedMapId?.trim() ?? '';
			selectedMapId =
				forcedId && maps.some((entry) => String(entry.id) === forcedId) ? forcedId : null;
			return;
		}
		if (playerModeState.enabled) {
			const partyMapId = partyLocation?.mapId ?? null;
			if (partyMapId && maps.some((entry) => String(entry.id) === partyMapId)) {
				selectedMapId = partyMapId;
				return;
			}
			const playerMapId = selectedCombat?.mapState.mapId ?? null;
			if (playerMapId && maps.some((entry) => String(entry.id) === playerMapId)) {
				selectedMapId = playerMapId;
				return;
			}
			if (requestedMapId && maps.some((entry) => String(entry.id) === requestedMapId)) {
				selectedMapId = requestedMapId;
				return;
			}
			selectedMapId = null;
			return;
		}
		const partyMapId = partyLocation?.mapId ?? null;
		if (partyMapId && maps.some((entry) => String(entry.id) === partyMapId) && !selectedMapId) {
			selectedMapId = partyMapId;
			return;
		}
		if (filteredMaps.length === 0) {
			selectedMapId = null;
			return;
		}
		if (!selectedMapId || !filteredMaps.some((entry) => String(entry.id) === selectedMapId)) {
			selectedMapId = String(filteredMaps[0]!.id);
		}
	});

	$effect(() => {
		if (viewerMode) return;
		if (playerModeState.enabled) return;
		if (!requestedMapId) return;
		if (selectedMapId === requestedMapId) return;
		if (!maps.some((entry) => String(entry.id) === requestedMapId)) return;
		query = '';
		selectedTag = '';
		selectedAreaNoteId = '';
		selectedMapId = requestedMapId;
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
		const queryPoiId = page.url.searchParams.get('poi');
		if (requestedMapId !== String(selectedMap.id) || !queryPoiId) return;
		if (!draftPois.some((poi) => poi.id === queryPoiId)) return;
		selectedPoiId = queryPoiId;
	});

	$effect(() => {
		if (typeof window === 'undefined') return;
		const onWindowKeyDown = (event: KeyboardEvent): void => {
			if (event.key !== 'Escape') return;
			if (
				event.target instanceof HTMLElement &&
				(event.target.tagName === 'INPUT' ||
					event.target.tagName === 'TEXTAREA' ||
					event.target.tagName === 'SELECT' ||
					event.target.isContentEditable)
			) {
				return;
			}
			if (mapContextMenu) {
				mapContextMenu = null;
				return;
			}
			if (selectedMap?.data.parentMapId) {
				event.preventDefault();
				selectMapById(selectedMap.data.parentMapId);
			}
		};
		const onWindowPointerDown = (): void => {
			if (mapContextMenu) mapContextMenu = null;
		};
		window.addEventListener('keydown', onWindowKeyDown);
		window.addEventListener('pointerdown', onWindowPointerDown);
		return () => {
			window.removeEventListener('keydown', onWindowKeyDown);
			window.removeEventListener('pointerdown', onWindowPointerDown);
		};
	});
</script>

<div class="mx-auto max-w-[1400px] p-6">
	{#if !viewerMode}
		<header class="mb-5 flex flex-wrap items-start justify-between gap-3">
			<div>
				<h1 class="text-2xl font-bold text-ink" style="font-family: var(--font-serif)">
					Map Library
				</h1>
				<p class="mt-1 text-sm text-ink-muted">
					{#if playerModeState.enabled}
						Player map view with fog-of-war enforcement
					{:else}
						{filteredMaps.length} of {maps.length} map{maps.length === 1 ? '' : 's'}
					{/if}
				</p>
			</div>
			{#if !playerModeState.enabled}
				<button
					type="button"
					class="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60 transition-[transform,colors] active:scale-[0.97] active:brightness-95"
					onclick={() => void handleImportMap()}
					disabled={!desktopAvailable || importing}
				>
					{importing ? 'Importing...' : 'Import Map'}
				</button>
			{/if}
		</header>
	{/if}

	{#if !playerModeState.enabled && !viewerMode}
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
				class="rounded border border-border px-3 py-1.5 text-sm text-ink-muted hover:bg-surface-alt"
				onclick={() => {
					query = '';
					selectedTag = '';
					selectedAreaNoteId = '';
				}}
			>
				Reset filters
			</button>
		</section>
	{/if}

	{#if error}
		<div class="mb-4 rounded border border-error/40 bg-error/10 px-3 py-2 text-sm text-error">
			{error}
		</div>
	{/if}

	{#if !playerModeState.enabled && !viewerMode}
		<section class="rounded-lg border border-border bg-surface p-4">
			<h2 class="text-sm font-semibold text-ink">Library</h2>
			{#if loading}
				<p class="mt-2 text-sm text-ink-muted">Loading maps...</p>
			{:else if filteredMaps.length === 0}
				{#if maps.length === 0}
					<EmptyState
						class="min-h-0 px-0 py-4"
						illustration="atlas"
						headline="No maps yet"
						body="Maps let you place notes on visual geography - pin NPCs to locations, reveal regions to players."
						primaryAction={{ label: 'Add your first map', onclick: handleImportMap }}
						secondaryAction={{
							label: 'Learn about the Atlas system',
							onclick: learnAboutAtlasSystem,
						}}
					/>
				{:else}
					<p class="mt-2 text-sm text-ink-muted">No maps match the active filters.</p>
				{/if}
			{:else}
				<ul class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
					{#each filteredMaps as map (map.id)}
						<li>
							<button
								type="button"
								class="group w-full overflow-hidden rounded-md border text-left transition-colors {selectedMapId ===
								String(map.id)
									? 'border-accent bg-accent-subtle/40'
									: 'border-border bg-surface-alt hover:border-accent/60'}"
								onclick={() => (selectedMapId = String(map.id))}
							>
								<div class="aspect-[4/3] overflow-hidden bg-parchment/70">
									{#if mapAssetUrls[String(map.id)]}
										<img
											src={mapAssetUrls[String(map.id)] ?? undefined}
											alt={map.name}
											loading="lazy"
											class="h-full w-full object-cover transition-transform duration-medium group-hover:scale-[1.02]"
										/>
									{:else}
										<div
											class="flex h-full items-center justify-center px-3 text-center text-xs text-ink-muted"
										>
											Preview unavailable
										</div>
									{/if}
								</div>
								<div class="space-y-1 p-2.5">
									<p class="truncate text-sm font-medium text-ink">
										{map.name}
									</p>
									<p class="truncate text-xs text-ink-faint">
										{areaLabelForMap(map)}
									</p>
									<div class="flex flex-wrap gap-1">
										{#each map.tags.slice(0, 3) as tag (tag)}
											<span class="rounded bg-surface px-1.5 py-0.5 text-2xs text-ink-faint">
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
	{/if}

	{#if viewerMode && !loading && !selectedMap}
		<section class="rounded-lg border border-border bg-surface p-4">
			<EmptyState
				class="min-h-0 px-0 py-4"
				illustration="atlas"
				headline="Map not found"
				body="This map could not be found. It may have been deleted or moved."
				primaryAction={{ label: 'Back to maps', onclick: () => goto(resolve('/atlas/maps')) }}
			/>
		</section>
	{/if}

	{#if selectedMap}
		<section
			class="mt-4 grid gap-4 {playerModeState.enabled ? '' : 'xl:grid-cols-[minmax(0,1fr)_360px]'}"
		>
			<div class="relative rounded-lg border border-border bg-surface p-3">
				{#if selectedMapBreadcrumbs.length > 0}
					<nav
						class="mb-2 flex flex-wrap items-center gap-1 text-xs text-ink-muted"
						aria-label="Contextual navigation: Map hierarchy breadcrumbs"
					>
						{#each selectedMapBreadcrumbs as crumb, index (crumb.mapId)}
							{#if index > 0}
								<span aria-hidden="true">&rarr;</span>
							{/if}
							{#if index < selectedMapBreadcrumbs.length - 1}
								<button
									type="button"
									class="rounded px-1 py-0.5 hover:bg-surface-alt"
									onclick={() => selectMapById(crumb.mapId)}
								>
									{crumb.name}
								</button>
							{:else}
								<span class="rounded bg-surface-alt px-1.5 py-0.5">
									{crumb.name}
								</span>
							{/if}
						{/each}
					</nav>
				{/if}
				<div class="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
					{#if !playerModeState.enabled}
						<div class="flex flex-wrap items-center gap-2">
							<button
								type="button"
								class="rounded border border-border px-2 py-1 text-ink-muted hover:bg-surface-alt"
								onclick={() => {
									runtimeShowGrid = !runtimeShowGrid;
								}}
							>
								{runtimeShowGrid ? 'Hide Grid Overlay' : 'Show Grid Overlay'}
							</button>
							<button
								type="button"
								class="rounded border border-border px-2 py-1 text-ink-muted hover:bg-surface-alt"
								onclick={() => {
									editGridHandles = !editGridHandles;
									runtimeShowGrid = true;
								}}
							>
								{editGridHandles ? 'Stop Grid Alignment' : 'Align Grid'}
							</button>
							<button
								type="button"
								class="rounded border border-border px-2 py-1 text-ink-muted hover:bg-surface-alt"
								onclick={() => {
									editPoiMode = !editPoiMode;
								}}
							>
								{editPoiMode ? 'Stop POI Placement' : 'Edit POIs'}
							</button>
							<button
								type="button"
								class="rounded border border-border px-2 py-1 text-ink-muted hover:bg-surface-alt"
								onclick={() => {
									routeEditMode = !routeEditMode;
								}}
							>
								{routeEditMode ? 'Stop Route Editing' : 'Edit Travel Routes'}
							</button>
							<button
								type="button"
								class="rounded border border-border px-2 py-1 text-ink-muted hover:bg-surface-alt disabled:opacity-55"
								disabled={!selectedMap.data.grid || !selectedCombatTile}
								onclick={() => {
									combatModeEnabled = !combatModeEnabled;
									editPoiMode = combatModeEnabled ? false : editPoiMode;
								}}
							>
								{combatModeEnabled ? 'Exit Combat Mode' : 'Combat Mode'}
							</button>
							<button
								type="button"
								class="rounded border border-border px-2 py-1 text-ink-muted hover:bg-surface-alt disabled:opacity-55"
								disabled={!selectedCombatTile}
								onclick={() => {
									fogEditingEnabled = !fogEditingEnabled;
									combatModeEnabled = false;
								}}
							>
								{fogEditingEnabled ? 'Stop Fog Tools' : 'Fog of War Tools'}
							</button>
							<label class="flex items-center gap-1.5 rounded border border-border px-2 py-1">
								<input type="checkbox" bind:checked={previewPlayerLayers} />
								Player layer preview
							</label>
							<select
								bind:value={activeLayerFilter}
								class="rounded border border-border bg-surface-alt px-2 py-1 text-xs text-ink"
								aria-label="Filter visible pins by layer"
							>
								<option value="all">All layers</option>
								{#each draftLayers as layer (layer.id)}
									<option value={layer.id}>{layer.name}</option>
								{/each}
							</select>
						</div>
					{:else}
						<p class="text-ink-muted">Player view: unrevealed map areas remain hidden.</p>
					{/if}
					{#if partyLocation}
						<p class="text-ink-faint">
							Party at {partyLocation.x.toFixed(3)}, {partyLocation.y.toFixed(3)}
						</p>
					{/if}
					{#if scaleLabel}
						<p class="font-medium text-ink-muted">{scaleLabel}</p>
					{/if}
				</div>
				{#if selectedCombatTile}
					<div
						class="mb-2 flex flex-wrap items-center gap-2 rounded border border-border/70 px-2 py-2 text-xs"
					>
						<label class="text-ink-muted">
							Board
							<select
								class="ml-1 rounded border border-border bg-surface-alt px-1.5 py-0.5 text-xs"
								bind:value={selectedBoardId}
							>
								{#each boards as board (board.id)}
									<option value={board.id}>{board.name}</option>
								{/each}
							</select>
						</label>
						<label class="text-ink-muted">
							Combat Tile
							<select
								class="ml-1 rounded border border-border bg-surface-alt px-1.5 py-0.5 text-xs"
								bind:value={selectedCombatTileId}
							>
								{#each combatTiles as tile (tile.id)}
									<option value={tile.id}>{tile.id}</option>
								{/each}
							</select>
						</label>
						{#if !playerModeState.enabled}
							<label class="text-ink-muted">
								Tool
								<select
									class="ml-1 rounded border border-border bg-surface-alt px-1.5 py-0.5"
									bind:value={fogTool}
									disabled={!fogEditingEnabled}
								>
									{#each FOG_TOOL_OPTIONS as option (option.value)}
										<option value={option.value}>{option.label}</option>
									{/each}
								</select>
							</label>
							<label class="text-ink-muted">
								Mode
								<select
									class="ml-1 rounded border border-border bg-surface-alt px-1.5 py-0.5"
									bind:value={fogMode}
									disabled={!fogEditingEnabled}
								>
									{#each FOG_MODE_OPTIONS as option (option.value)}
										<option value={option.value}>{option.label}</option>
									{/each}
								</select>
							</label>
							<label class="text-ink-muted">
								Brush Radius
								<input
									type="range"
									min="0.01"
									max="0.2"
									step="0.005"
									bind:value={fogBrushRadius}
									disabled={!fogEditingEnabled || fogTool !== 'circle'}
								/>
							</label>
							<label class="text-ink-muted">
								Fog Color
								<select
									class="ml-1 rounded border border-border bg-surface-alt px-1.5 py-0.5"
									bind:value={fogColorTheme}
									onchange={() => setFogConfig({ colorTheme: fogColorTheme })}
								>
									<option value="smoky_gray">Smoky Gray</option>
									<option value="black">Black</option>
								</select>
							</label>
							<label class="inline-flex items-center gap-1 text-ink-muted">
								<input
									type="checkbox"
									bind:checked={fogFreeExplore}
									onchange={() => setFogConfig({ freeExplore: fogFreeExplore })}
								/>
								Player free explore
							</label>
							<button
								type="button"
								class="rounded border border-border px-2 py-0.5 text-ink-muted hover:bg-surface-alt"
								onclick={clearFogOperations}
							>
								Clear Fog Ops
							</button>
						{:else}
							<span class="text-ink-muted">
								Free explore: {effectiveFogState.freeExplore ? 'enabled' : 'disabled'}
							</span>
							<span class="text-ink-faint">
								Revealed zones: {fogPolygonCounts.reveal}
							</span>
							{#if fogRevealBounds}
								<span class="text-ink-faint">
									Reveal bounds: {(fogRevealBounds.maxX - fogRevealBounds.minX).toFixed(2)} x
									{(fogRevealBounds.maxY - fogRevealBounds.minY).toFixed(2)}
								</span>
							{/if}
						{/if}
					</div>
				{/if}
				{#if combatModeEnabled}
					<div
						class="mb-2 flex flex-wrap items-center gap-2 rounded border border-border/70 px-2 py-2 text-xs"
					>
						<span class="text-ink-muted">
							{mapLinkedToEncounterLocation
								? 'Map is linked to the encounter location.'
								: 'Map is not linked to the active encounter location.'}
						</span>
						{#if activeCombatant}
							<span class="rounded bg-surface-alt px-1.5 py-0.5 text-ink">
								Move {movementBudgetSquares} sq
							</span>
							{#if selectedRangeProfile}
								<span class="rounded bg-surface-alt px-1.5 py-0.5 text-ink">
									Range {selectedRangeProfile.squares} sq ({selectedRangeProfile.label})
								</span>
							{/if}
						{/if}
					</div>
					<div
						class="mb-2 flex flex-wrap items-center gap-2 rounded border border-border/70 px-2 py-2 text-xs"
					>
						<label class="inline-flex items-center gap-1 text-ink-muted">
							<input type="checkbox" bind:checked={terrainPaintMode} />
							Paint Difficult Terrain
						</label>
						<label class="inline-flex items-center gap-1 text-ink-muted">
							<input type="checkbox" bind:checked={terrainEraseMode} disabled={!terrainPaintMode} />
							Erase mode
						</label>
						<label class="inline-flex items-center gap-1 text-ink-muted">
							<input type="checkbox" bind:checked={templatePlacementMode} />
							Template Drag Placement
						</label>
						<label class="text-ink-muted">
							Template
							<select
								class="ml-1 rounded border border-border bg-surface-alt px-1.5 py-0.5"
								bind:value={templateShape}
							>
								{#each TEMPLATE_SHAPE_OPTIONS as option (option.value)}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>
						</label>
						<label class="text-ink-muted">
							Radius
							<input
								type="number"
								min="1"
								max="30"
								class="ml-1 w-14 rounded border border-border bg-surface-alt px-1.5 py-0.5"
								bind:value={templateRadiusSquares}
								disabled={templateShape === 'line'}
							/>
						</label>
						<label class="text-ink-muted">
							Line L
							<input
								type="number"
								min="1"
								max="60"
								class="ml-1 w-14 rounded border border-border bg-surface-alt px-1.5 py-0.5"
								bind:value={templateLineLengthSquares}
								disabled={templateShape !== 'line'}
							/>
						</label>
						<label class="text-ink-muted">
							Line W
							<input
								type="number"
								min="1"
								max="10"
								class="ml-1 w-14 rounded border border-border bg-surface-alt px-1.5 py-0.5"
								bind:value={templateLineWidthSquares}
								disabled={templateShape !== 'line'}
							/>
						</label>
						<button
							type="button"
							class="rounded border border-border px-2 py-0.5 text-ink-muted hover:bg-surface-alt"
							onclick={clearAllTemplates}
							disabled={combatMapState.templates.length === 0}
						>
							Clear Templates
						</button>
						{#if savingCombatMap}
							<span class="text-ink-faint">Saving combat map...</span>
						{/if}
					</div>
					{#if combatMapState.templates.length > 0}
						<div class="mb-2 flex flex-wrap items-center gap-1">
							{#each combatMapState.templates as template (template.id)}
								<button
									type="button"
									class="rounded border border-border px-2 py-0.5 text-xs text-ink-muted hover:bg-surface-alt"
									onclick={() => removeTemplate(template.id)}
								>
									{template.shape} @{template.originX},{template.originY} x
								</button>
							{/each}
						</div>
					{/if}
				{/if}
				{#if editPoiMode}
					<p class="mb-2 text-xs text-ink-faint">
						Click the map to place a pin. Drag pins to reposition. Click a pin to edit details.
					</p>
				{/if}
				{#if routeEditMode}
					<p class="mb-2 text-xs text-ink-faint">
						Route edit mode: click the map to add waypoints to the selected route.
					</p>
				{/if}
				{#if fogEditingEnabled}
					<p class="mb-2 text-xs text-ink-faint">
						Fog tools active. Paint reveal or re-fog shapes directly on the map.
					</p>
				{/if}
				{#if selectedMap.data.parentMapId}
					<p class="mb-2 text-xs text-ink-faint">Press Escape to navigate up to parent map.</p>
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
						combatTokens={combatModeEnabled ? combatViewerTokens : []}
						activeCombatTokenId={combatModeEnabled
							? (selectedCombatToken?.combatantId ?? selectedCombat?.activeCombatantId ?? null)
							: null}
						combatTokenEditable={combatModeEnabled}
						movementRangeCells={combatModeEnabled ? movementRangeCells : []}
						pathCells={combatModeEnabled ? pathPreviewCells : []}
						difficultTerrainCells={combatModeEnabled ? combatMapState.difficultTerrain : []}
						templateOverlays={combatModeEnabled ? combinedTemplateOverlays : []}
						routes={draftRoutes}
						activeRouteId={selectedRouteId}
						{partyMarker}
						fogEnabled={!!selectedCombatTile ||
							playerModeState.enabled ||
							!!selectedMap.data.lastSessionFog}
						fogState={effectiveFogState}
						fogFeatherPx={5}
						fogPlayerEnforced={playerModeState.enabled}
						fogAnimationOperation={playerModeState.enabled ? fogAnimationOperation : null}
						fogAnimationDurationMs={800}
						navigationLocked={fogEditingEnabled}
						initialViewport={draftInitialViewport ?? undefined}
						ongridchange={handleGridChange}
						onviewportchange={handleViewportChange}
						onimageinfo={handleImageInfo}
						onmapclick={handleMapClick}
						onpoimove={handlePoiMove}
						onpoiclick={handlePoiClick}
						onpoihover={handlePoiHover}
						oncombattokenclick={handleCombatTokenClick}
						oncombattokendrop={handleCombatTokenDrop}
						onmappointerdown={handleMapPointerDown}
						onmappointermove={handleMapPointerMove}
						onmappointerup={handleMapPointerUp}
						onmapcontextmenu={handleMapContextMenu}
					/>
				{/key}
				{#if poiHover && hoveredPoi}
					<div
						class="fixed z-40 w-72 rounded-md border border-border bg-surface-elevated px-3 py-2 text-xs shadow-lg"
						style={`left:${poiHover.clientX + 10}px;top:${poiHover.clientY + 10}px;`}
						role="status"
						aria-live="polite"
					>
						<p class="font-semibold text-ink">{hoveredPoi.label}</p>
						<p class="mt-0.5 text-xs text-ink-faint">
							{hoveredPoi.category}
						</p>
						{#if hoveredPreviewLines.length > 0}
							<div class="mt-2 space-y-1">
								{#each hoveredPreviewLines as line, index (`${hoveredPoi.id}-${index}`)}
									<p class="line-clamp-1 text-ink-muted">{line}</p>
								{/each}
							</div>
						{:else}
							<button
								type="button"
								class="mt-2 rounded border border-border px-2 py-1 text-xs text-accent hover:bg-accent-subtle"
								onclick={() => void handleCreateNoteFromPoi(hoveredPoi.id)}
							>
								Create note from pin
							</button>
						{/if}
					</div>
				{/if}
				{#if mapContextMenu}
					{@const contextMenu = mapContextMenu}
					<div
						class="fixed z-40 min-w-40 rounded-md border border-border bg-surface-elevated p-1 shadow-lg"
						style={`left:${contextMenu.clientX}px;top:${contextMenu.clientY}px;`}
						role="menu"
						aria-label="Map context menu"
						tabindex="-1"
						onpointerdown={(event) => event.stopPropagation()}
					>
						<button
							type="button"
							class="w-full rounded px-2 py-1 text-left text-xs text-ink hover:bg-surface-alt"
							onclick={() =>
								void handleMarkPartyLocation({
									x: contextMenu.x,
									y: contextMenu.y,
									source: 'point',
								})}
						>
							Mark party here
						</button>
					</div>
				{/if}
			</div>

			{#if !playerModeState.enabled}
				<aside class="rounded-lg border border-border bg-surface p-3">
					{#if combatModeEnabled}
						<div class="mb-3 space-y-2">
							<h2 class="text-sm font-semibold text-ink">Combat Tracker Sync</h2>
							{#if selectedCombatTile}
								<div class="h-[420px] min-h-[320px]">
									<CombatTrackerTile
										tile={selectedCombatTile}
										standalone
										onselect={() => undefined}
										onupdate={handleCombatTrackerUpdate}
									/>
								</div>
							{:else}
								<p class="text-xs text-ink-muted">
									Select a board and combat tile to enable map-tracker synchronization.
								</p>
							{/if}
						</div>
					{/if}
					<h2 class="text-sm font-semibold text-ink">Map Metadata</h2>
					<div class="mt-3 space-y-2.5">
						<label class="block text-xs text-ink-muted">
							Name
							<input
								type="text"
								bind:value={draftName}
								oninput={markDirty}
								class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1.5 text-sm text-ink"
							/>
						</label>
						<label class="block text-xs text-ink-muted">
							Tags (comma-separated)
							<input
								type="text"
								bind:value={draftTags}
								oninput={markDirty}
								class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1.5 text-sm text-ink"
							/>
						</label>
						<label class="block text-xs text-ink-muted">
							Linked Area (location note)
							<select
								bind:value={draftAreaNoteId}
								onchange={markDirty}
								class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1.5 text-sm text-ink"
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
								class="text-xs text-accent hover:underline"
								onclick={() => void goto(resolve(`/knowledge/notes/${draftAreaNoteId}`))}
							>
								Open linked location note
							</button>
						{/if}
						<label class="block text-xs text-ink-muted">
							Parent map
							<select
								bind:value={draftParentMapId}
								onchange={() => {
									if (
										draftParentPoiId &&
										!parentPoiOptions.some((poi) => poi.id === draftParentPoiId)
									) {
										draftParentPoiId = '';
									}
									markDirty();
								}}
								class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1.5 text-sm text-ink"
							>
								<option value="">None (root map)</option>
								{#each mapHierarchy as entry (entry.mapId)}
									{#if entry.mapId !== String(selectedMap.id)}
										<option value={entry.mapId}>{'..'.repeat(entry.depth)} {entry.name}</option>
									{/if}
								{/each}
							</select>
						</label>
						<label class="block text-xs text-ink-muted">
							Location on parent (POI)
							<select
								bind:value={draftParentPoiId}
								onchange={markDirty}
								disabled={!draftParentMapId}
								class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1.5 text-sm text-ink disabled:opacity-60"
							>
								<option value="">None selected</option>
								{#each parentPoiOptions as poi (poi.id)}
									<option value={poi.id}>{poi.label}</option>
								{/each}
							</select>
						</label>
						<label
							class="flex items-center gap-2 rounded border border-border px-2 py-1.5 text-xs text-ink-muted"
						>
							<input type="checkbox" bind:checked={draftScaleEnabled} onchange={markDirty} />
							Enable scale label
						</label>
						{#if draftScaleEnabled}
							<div class="grid grid-cols-2 gap-2">
								<label class="text-xs text-ink-muted">
									Units per square
									<input
										type="number"
										min="0.01"
										step="0.01"
										bind:value={draftScaleUnits}
										oninput={markDirty}
										class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1.5 text-sm text-ink"
									/>
								</label>
								<label class="text-xs text-ink-muted">
									Unit label
									<input
										type="text"
										bind:value={draftScaleUnitLabel}
										oninput={markDirty}
										class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1.5 text-sm text-ink"
									/>
								</label>
							</div>
						{/if}
						<div class="grid grid-cols-2 gap-2">
							<label class="text-xs text-ink-muted">
								Grid type
								<select
									bind:value={draftGridType}
									onchange={markDirty}
									class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1.5 text-sm text-ink"
								>
									<option value="square">Square</option>
									<option value="hex">Hex</option>
								</select>
							</label>
							<label class="text-xs text-ink-muted">
								Cell size (px)
								<input
									type="number"
									min="4"
									step="1"
									bind:value={draftGridCellSize}
									oninput={markDirty}
									class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1.5 text-sm text-ink"
								/>
							</label>
							<label class="text-xs text-ink-muted">
								Origin X
								<input
									type="number"
									step="0.1"
									bind:value={draftGridOriginX}
									oninput={markDirty}
									class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1.5 text-sm text-ink"
								/>
							</label>
							<label class="text-xs text-ink-muted">
								Origin Y
								<input
									type="number"
									step="0.1"
									bind:value={draftGridOriginY}
									oninput={markDirty}
									class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1.5 text-sm text-ink"
								/>
							</label>
						</div>
						<label
							class="flex items-center gap-2 rounded border border-border px-2 py-1.5 text-xs text-ink-muted"
						>
							<input type="checkbox" bind:checked={draftGridVisible} onchange={markDirty} />
							Show grid by default
						</label>
						<div
							class="rounded border border-border bg-surface-alt px-2 py-1.5 text-xs text-ink-faint"
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
						<div class="rounded border border-border p-2">
							<div class="flex items-center justify-between">
								<h3 class="text-xs font-semibold text-ink">Layer System</h3>
								<button
									type="button"
									class="rounded border border-border px-2 py-0.5 text-xs text-ink-muted hover:bg-surface-alt"
									onclick={handleAddLayer}
								>
									Add Layer
								</button>
							</div>
							<div class="mt-2 space-y-2">
								{#each draftLayers as layer (layer.id)}
									<div class="rounded border border-border p-2">
										<input
											type="text"
											value={layer.name}
											oninput={(event) =>
												updateLayer(layer.id, (entry) => ({
													...entry,
													name: (event.currentTarget as HTMLInputElement).value,
												}))}
											class="w-full rounded border border-border bg-surface-alt px-2 py-1 text-xs text-ink"
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
												class="rounded border border-border bg-surface-alt px-2 py-1 text-xs text-ink"
											>
												{#each LAYER_THEME_OPTIONS as option (option.value)}
													<option value={option.value}>{option.label}</option>
												{/each}
											</select>
											<button
												type="button"
												class="rounded border border-border px-2 py-1 text-xs text-error hover:bg-error/10 disabled:opacity-40"
												disabled={draftLayers.length <= 1}
												onclick={() => handleDeleteLayer(layer.id)}
											>
												Delete
											</button>
										</div>
										<div class="mt-1.5 flex items-center gap-3 text-xs text-ink-muted">
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
						<div class="rounded border border-border p-2">
							<h3 class="text-xs font-semibold text-ink">POI Pins by Category</h3>
							<div class="mt-1.5 grid grid-cols-2 gap-1 text-xs text-ink-muted">
								{#each POI_CATEGORY_OPTIONS as category (category.value)}
									<p>{category.label}: {poiCountsByCategory[category.value] ?? 0}</p>
								{/each}
							</div>
							<label class="mt-2 block text-xs text-ink-muted">
								New pins default layer
								<select
									bind:value={newPoiLayerId}
									class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-xs text-ink"
								>
									{#each draftLayers as layer (layer.id)}
										<option value={layer.id}>{layer.name}</option>
									{/each}
								</select>
							</label>
						</div>
						<div class="rounded border border-border p-2">
							<div class="flex items-center justify-between">
								<h3 class="text-xs font-semibold text-ink">Travel Routes</h3>
								<button
									type="button"
									class="rounded border border-border px-2 py-0.5 text-xs text-ink-muted hover:bg-surface-alt"
									onclick={handleCreateRoute}
								>
									Add Route
								</button>
							</div>
							<div class="mt-2 grid grid-cols-2 gap-2">
								<label class="text-xs text-ink-muted">
									Route name
									<input
										type="text"
										bind:value={newRouteName}
										class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-xs text-ink"
									/>
								</label>
								<label class="text-xs text-ink-muted">
									Style
									<select
										bind:value={newRouteStyle}
										class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-xs text-ink"
									>
										<option value="straight">Straight</option>
										<option value="curved">Curved</option>
									</select>
								</label>
							</div>
							{#if draftRoutes.length === 0}
								<p class="mt-2 text-xs text-ink-faint">
									No routes yet. Create one, then click map waypoints.
								</p>
							{:else}
								<div class="mt-2 space-y-1.5">
									{#each routeSummaries as entry (entry.route.id)}
										<div
											class="rounded border border-border p-1.5 {selectedRouteId === entry.route.id
												? 'bg-accent-subtle/40'
												: ''}"
										>
											<button
												type="button"
												class="w-full text-left text-xs font-medium text-ink"
												onclick={() => (selectedRouteId = entry.route.id)}
											>
												{entry.route.name}
											</button>
											<p class="text-xs text-ink-faint">{entry.label}</p>
											<div class="mt-1 flex flex-wrap gap-1">
												<button
													type="button"
													class="rounded border border-border px-1.5 py-0.5 text-2xs text-ink-muted hover:bg-surface-alt"
													onclick={() => handleClearRouteWaypoints(entry.route.id)}
												>
													Clear points
												</button>
												<button
													type="button"
													class="rounded border border-border px-1.5 py-0.5 text-2xs text-error hover:bg-error/10"
													onclick={() => handleDeleteRoute(entry.route.id)}
												>
													Delete
												</button>
											</div>
										</div>
									{/each}
								</div>
							{/if}
							{#if selectedRoute}
								<p class="mt-2 text-xs text-ink-faint">
									Editing: {selectedRoute.name} ({selectedRoute.waypoints.length} waypoint{selectedRoute
										.waypoints.length === 1
										? ''
										: 's'})
								</p>
								{#if selectedMap}
									{@const estimate = estimateTravelTimeForRoute(selectedRoute, {
										width: draftImageSize?.width ?? selectedMap.data.width,
										height: draftImageSize?.height ?? selectedMap.data.height,
										grid: gridDraft,
										scale: draftScaleEnabled
											? {
													unitsPerGridSquare: Number.parseFloat(draftScaleUnits) || 5,
													unitLabel: draftScaleUnitLabel,
												}
											: undefined,
									})}
									{#if estimate}
										<p class="mt-1 text-xs text-ink-faint">
											Travel (5e): slow {estimate.pace.slow.hours.toFixed(2)}h | normal
											{estimate.pace.normal.hours.toFixed(2)}h | fast
											{estimate.pace.fast.hours.toFixed(2)}h
										</p>
									{/if}
								{/if}
							{/if}
						</div>
						<div class="rounded border border-border p-2">
							<h3 class="text-xs font-semibold text-ink">Selected Pin</h3>
							{#if selectedPoi}
								<div class="mt-2 space-y-2">
									<label class="block text-xs text-ink-muted">
										Label
										<input
											type="text"
											value={selectedPoi.label}
											oninput={(event) =>
												updatePoi(selectedPoi.id, (poi) => ({
													...poi,
													label: (event.currentTarget as HTMLInputElement).value,
												}))}
											class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-xs text-ink"
										/>
									</label>
									<div class="grid grid-cols-2 gap-2">
										<label class="text-xs text-ink-muted">
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
												class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-xs text-ink"
											>
												{#each POI_CATEGORY_OPTIONS as option (option.value)}
													<option value={option.value}>{option.label}</option>
												{/each}
											</select>
										</label>
										<label class="text-xs text-ink-muted">
											Layer
											<select
												value={selectedPoi.layerId ?? ''}
												onchange={(event) =>
													updatePoi(selectedPoi.id, (poi) => ({
														...poi,
														layerId: (event.currentTarget as HTMLSelectElement).value || undefined,
													}))}
												class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-xs text-ink"
											>
												{#each draftLayers as layer (layer.id)}
													<option value={layer.id}>{layer.name}</option>
												{/each}
											</select>
										</label>
									</div>
									<label class="block text-xs text-ink-muted">
										Linked note
										<select
											value={selectedPoi.linkedNoteId ?? ''}
											onchange={(event) =>
												updatePoi(selectedPoi.id, (poi) => ({
													...poi,
													linkedNoteId:
														(event.currentTarget as HTMLSelectElement).value || undefined,
												}))}
											class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-xs text-ink"
										>
											<option value="">None</option>
											{#each noteOptions as note (note.id)}
												<option value={String(note.id)}>{note.title}</option>
											{/each}
										</select>
									</label>
									<label class="block text-xs text-ink-muted">
										Linked object
										<select
											value={selectedPoi.linkedObjectId ?? ''}
											onchange={(event) =>
												updatePoi(selectedPoi.id, (poi) => ({
													...poi,
													linkedObjectId:
														(event.currentTarget as HTMLSelectElement).value || undefined,
												}))}
											class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-xs text-ink"
										>
											<option value="">None</option>
											{#each objectOptions as object (object.id)}
												<option value={String(object.id)}>{object.name} ({object.type})</option>
											{/each}
										</select>
									</label>
									<p class="text-xs text-ink-faint">
										Position: {selectedPoi.x.toFixed(3)}, {selectedPoi.y.toFixed(3)}
									</p>
									<div class="flex flex-wrap gap-1.5">
										<button
											type="button"
											class="rounded border border-border px-2 py-1 text-xs text-ink-muted hover:bg-surface-alt"
											onclick={() =>
												void handleMarkPartyLocation({
													x: selectedPoi.x,
													y: selectedPoi.y,
													poiId: selectedPoi.id,
													source: 'poi',
												})}
										>
											Mark party here
										</button>
										{#if resolveLinkedNoteIdForPoi(selectedPoi)}
											<button
												type="button"
												class="rounded border border-border px-2 py-1 text-xs text-ink-muted hover:bg-surface-alt"
												onclick={() =>
													void goto(
														resolve(`/knowledge/notes/${resolveLinkedNoteIdForPoi(selectedPoi)}`),
													)}
											>
												Open linked note
											</button>
										{:else}
											<button
												type="button"
												class="rounded border border-border px-2 py-1 text-xs text-accent hover:bg-accent-subtle"
												onclick={() => void handleCreateNoteFromPoi(selectedPoi.id)}
											>
												Create note
											</button>
										{/if}
										<button
											type="button"
											class="rounded border border-border px-2 py-1 text-xs text-error hover:bg-error/10"
											onclick={() => handleDeletePoi(selectedPoi.id)}
										>
											Delete pin
										</button>
									</div>
								</div>
							{:else}
								<p class="mt-2 text-xs text-ink-muted">Select a pin to edit links and metadata.</p>
							{/if}
						</div>
						{#if combatModeEnabled && selectedCombat}
							<div class="rounded border border-border p-2">
								<h3 class="text-xs font-semibold text-ink">Session Event Log</h3>
								{#if selectedCombat.mapState.history.length === 0}
									<p class="mt-1 text-xs text-ink-muted">No map session events yet.</p>
								{:else}
									<ul class="mt-1 max-h-36 space-y-1 overflow-auto text-xs text-ink-muted">
										{#each [...selectedCombat.mapState.history]
											.slice(-8)
											.reverse() as entry (entry.id)}
											<li class="rounded bg-surface-alt px-1.5 py-1">
												<p class="font-medium text-ink">{entry.kind}</p>
												<p>{entry.message}</p>
											</li>
										{/each}
									</ul>
								{/if}
							</div>
						{/if}
					</div>
					<div class="mt-3 flex items-center gap-2">
						<button
							type="button"
							class="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60 transition-[transform,colors] active:scale-[0.97] active:brightness-95"
							disabled={!dirty || saving}
							onclick={() => void handleSave()}
						>
							{saving ? 'Saving...' : 'Save Map'}
						</button>
						<button
							type="button"
							class="rounded-md border border-border px-3 py-1.5 text-xs text-ink-muted hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-60 transition-[transform,colors] active:scale-[0.97] active:brightness-95"
							disabled={!dirty || saving}
							onclick={discardDraft}
						>
							Discard
						</button>
					</div>
				</aside>
			{/if}
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
		<p class="text-sm text-ink-muted">Linked note unavailable.</p>
	{/if}
</Modal>
