<script lang="ts">
	import type { MapGridData, MapPoiCategory, MapViewportData } from '$lib/types/object.js';
	import { SvelteMap } from 'svelte/reactivity';

	export interface MapViewerGridCell {
		x: number;
		y: number;
	}

	export interface MapViewerPoi {
		id: string;
		label: string;
		category: MapPoiCategory;
		x: number;
		y: number;
		colorTheme?: string;
		hidden?: boolean;
	}

	export type MapViewerHpTone = 'full' | 'mid' | 'low' | 'empty' | 'unknown';

	export interface MapViewerCombatToken {
		id: string;
		label: string;
		cellX: number;
		cellY: number;
		initials: string;
		imageUrl?: string;
		statusIcons?: string[];
		hpRatio?: number | null;
		hpTone?: MapViewerHpTone;
	}

	export interface MapViewerTemplateOverlay {
		id: string;
		cells: readonly MapViewerGridCell[];
		color?: string;
		stroke?: string;
	}

	export interface MapViewerPointerPayload {
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
	}

	interface Props {
		src: string | null;
		alt?: string;
		grid?: MapGridData;
		showGrid?: boolean;
		editableGrid?: boolean;
		pois?: readonly MapViewerPoi[];
		poiEditable?: boolean;
		combatTokens?: readonly MapViewerCombatToken[];
		activeCombatTokenId?: string | null;
		combatTokenEditable?: boolean;
		movementRangeCells?: readonly MapViewerGridCell[];
		pathCells?: readonly MapViewerGridCell[];
		difficultTerrainCells?: readonly MapViewerGridCell[];
		templateOverlays?: readonly MapViewerTemplateOverlay[];
		initialViewport?: MapViewportData;
		ongridchange?: (grid: MapGridData) => void;
		onviewportchange?: (viewport: MapViewportData) => void;
		onimageinfo?: (info: { width: number; height: number }) => void;
		onmapclick?: (payload: {
			x: number;
			y: number;
			ctrlKey: boolean;
			metaKey: boolean;
			shiftKey: boolean;
		}) => void;
		onpoiclick?: (payload: { id: string; ctrlKey: boolean; metaKey: boolean }) => void;
		onpoimove?: (payload: { id: string; x: number; y: number }) => void;
		onpoihover?: (payload: { id: string | null; clientX: number; clientY: number }) => void;
		oncombattokenclick?: (payload: { id: string; ctrlKey: boolean; metaKey: boolean }) => void;
		oncombattokendrop?: (payload: { id: string; cellX: number; cellY: number }) => void;
		onmappointerdown?: (payload: MapViewerPointerPayload) => void;
		onmappointermove?: (payload: MapViewerPointerPayload) => void;
		onmappointerup?: (payload: MapViewerPointerPayload) => void;
	}

	let {
		src,
		alt = 'Map asset',
		grid = undefined,
		showGrid = true,
		editableGrid = false,
		pois = [],
		poiEditable = false,
		combatTokens = [],
		activeCombatTokenId = null,
		combatTokenEditable = false,
		movementRangeCells = [],
		pathCells = [],
		difficultTerrainCells = [],
		templateOverlays = [],
		initialViewport = undefined,
		ongridchange,
		onviewportchange,
		onimageinfo,
		onmapclick,
		onpoiclick,
		onpoimove,
		onpoihover,
		oncombattokenclick,
		oncombattokendrop,
		onmappointerdown,
		onmappointermove,
		onmappointerup,
	}: Props = $props();

	let canvasEl = $state<HTMLCanvasElement | null>(null);
	let viewportEl = $state<HTMLDivElement | null>(null);
	let image = $state<HTMLImageElement | null>(null);
	let imageError = $state<string | null>(null);
	let loadingImage = $state(false);
	let viewport = $state<MapViewportData>({ zoom: 1, panX: 0, panY: 0 });
	let workingGrid = $state<MapGridData | undefined>(undefined);
	let pointerHint = $state('');
	let suppressPoiClickId = $state<string | null>(null);
	let suppressCombatTokenClickId = $state<string | null>(null);
	let clickCandidate: {
		pointerId: number;
		startX: number;
		startY: number;
		ctrlKey: boolean;
		metaKey: boolean;
		shiftKey: boolean;
		moved: boolean;
	} | null = null;

	let drawQueued = false;
	const activePointers = new SvelteMap<number, { x: number; y: number }>();
	let panDrag: {
		pointerId: number;
		startX: number;
		startY: number;
		startPanX: number;
		startPanY: number;
	} | null = null;
	let pinchGesture: {
		startDistance: number;
		startZoom: number;
		anchorX: number;
		anchorY: number;
	} | null = null;
	let gridDrag: {
		pointerId: number;
		handle: 'origin' | 'size';
	} | null = null;
	let poiDrag: {
		pointerId: number;
		poiId: string;
		startX: number;
		startY: number;
		moved: boolean;
	} | null = null;
	let combatTokenDrag: {
		pointerId: number;
		tokenId: string;
		startX: number;
		startY: number;
		moved: boolean;
	} | null = null;

	const MIN_ZOOM = 0.05;
	const MAX_ZOOM = 12;
	const POI_CLICK_DRAG_THRESHOLD = 4;
	const POI_CATEGORY_ICON: Record<MapPoiCategory, string> = {
		city: '\u25CF',
		dungeon: '\u25A0',
		landmark: '\u25C6',
		structure: '\u25B2',
		secret: '\u2736',
		encounter: '\u2694',
	};

	function clampZoom(value: number): number {
		return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
	}

	function mapFractionToLocalPoint(x: number, y: number): { x: number; y: number } | null {
		if (!image) return null;
		const zoom = Math.max(MIN_ZOOM, viewport.zoom);
		return {
			x: viewport.panX + x * image.width * zoom,
			y: viewport.panY + y * image.height * zoom,
		};
	}

	function localPointToMapFraction(
		localX: number,
		localY: number,
	): { x: number; y: number } | null {
		if (!image) return null;
		const zoom = Math.max(MIN_ZOOM, viewport.zoom);
		const imageX = (localX - viewport.panX) / zoom;
		const imageY = (localY - viewport.panY) / zoom;
		return {
			x: Math.min(1, Math.max(0, imageX / image.width)),
			y: Math.min(1, Math.max(0, imageY / image.height)),
		};
	}

	function imagePointToGridCell(imageX: number, imageY: number): MapViewerGridCell | null {
		if (!workingGrid) return null;
		if (workingGrid.type === 'square') {
			const cellX = Math.floor((imageX - workingGrid.originX) / Math.max(1, workingGrid.cellSize));
			const cellY = Math.floor((imageY - workingGrid.originY) / Math.max(1, workingGrid.cellSize));
			return { x: cellX, y: cellY };
		}
		const cellSize = Math.max(1, workingGrid.cellSize);
		const hexHeight = Math.sqrt(3) * (cellSize / 2);
		const row = Math.round((imageY - workingGrid.originY) / Math.max(0.001, hexHeight));
		const offsetX = row % 2 === 0 ? 0 : cellSize / 2;
		const col = Math.round((imageX - workingGrid.originX - offsetX) / cellSize);
		return { x: col, y: row };
	}

	function localPointToGridCell(localX: number, localY: number): MapViewerGridCell | null {
		if (!image || !workingGrid) return null;
		const zoom = Math.max(MIN_ZOOM, viewport.zoom);
		const imageX = (localX - viewport.panX) / zoom;
		const imageY = (localY - viewport.panY) / zoom;
		return imagePointToGridCell(imageX, imageY);
	}

	function gridCellToImagePoint(cell: MapViewerGridCell): { x: number; y: number } | null {
		if (!workingGrid) return null;
		if (workingGrid.type === 'square') {
			return {
				x: workingGrid.originX + (cell.x + 0.5) * workingGrid.cellSize,
				y: workingGrid.originY + (cell.y + 0.5) * workingGrid.cellSize,
			};
		}
		const cellSize = workingGrid.cellSize;
		const hexHeight = Math.sqrt(3) * (cellSize / 2);
		return {
			x: workingGrid.originX + cell.x * cellSize + (cell.y % 2 === 0 ? 0 : cellSize / 2),
			y: workingGrid.originY + cell.y * hexHeight,
		};
	}

	function gridCellToLocalPoint(cell: MapViewerGridCell): { x: number; y: number } | null {
		if (!workingGrid) return null;
		const imagePoint = gridCellToImagePoint(cell);
		if (!imagePoint) return null;
		const zoom = Math.max(MIN_ZOOM, viewport.zoom);
		return {
			x: viewport.panX + imagePoint.x * zoom,
			y: viewport.panY + imagePoint.y * zoom,
		};
	}

	function poiThemeColor(theme: string | undefined): string {
		switch (theme) {
			case 'emerald':
				return '#047857';
			case 'azure':
				return '#0c4a6e';
			case 'rose':
				return '#9f1239';
			case 'violet':
				return '#5b21b6';
			case 'slate':
				return '#334155';
			default:
				return '#9a3412';
		}
	}

	function hpToneColor(tone: MapViewerHpTone | undefined): string {
		switch (tone) {
			case 'full':
				return '#059669';
			case 'mid':
				return '#d97706';
			case 'low':
				return '#ea580c';
			case 'empty':
				return '#b91c1c';
			default:
				return '#64748b';
		}
	}

	function emitMapPointerCallback(
		event: PointerEvent,
		callback: ((payload: MapViewerPointerPayload) => void) | undefined,
	): void {
		if (!callback || !viewportEl) return;
		const rect = viewportEl.getBoundingClientRect();
		const localX = event.clientX - rect.left;
		const localY = event.clientY - rect.top;
		const fractions = localPointToMapFraction(localX, localY);
		if (!fractions) return;
		const cell = localPointToGridCell(localX, localY);
		callback({
			x: fractions.x,
			y: fractions.y,
			cellX: cell?.x ?? null,
			cellY: cell?.y ?? null,
			button: event.button,
			buttons: event.buttons,
			ctrlKey: event.ctrlKey,
			metaKey: event.metaKey,
			shiftKey: event.shiftKey,
			altKey: event.altKey,
		});
	}

	function queueDraw(): void {
		if (drawQueued) return;
		drawQueued = true;
		requestAnimationFrame(() => {
			drawQueued = false;
			drawScene();
		});
	}

	function setViewport(next: MapViewportData): void {
		viewport = {
			zoom: clampZoom(next.zoom),
			panX: next.panX,
			panY: next.panY,
		};
		onviewportchange?.(viewport);
		queueDraw();
	}

	function setZoomAt(nextZoom: number, anchorX: number, anchorY: number): void {
		const currentZoom = Math.max(MIN_ZOOM, viewport.zoom);
		const clamped = clampZoom(nextZoom);
		if (Math.abs(clamped - currentZoom) < 0.0001) return;
		const imageX = (anchorX - viewport.panX) / currentZoom;
		const imageY = (anchorY - viewport.panY) / currentZoom;
		setViewport({
			zoom: clamped,
			panX: anchorX - imageX * clamped,
			panY: anchorY - imageY * clamped,
		});
	}

	function fitToScreen(): void {
		if (!viewportEl || !image) return;
		const width = Math.max(1, viewportEl.clientWidth);
		const height = Math.max(1, viewportEl.clientHeight);
		const fitZoom = clampZoom(Math.min(width / image.width, height / image.height));
		setViewport({
			zoom: fitZoom,
			panX: (width - image.width * fitZoom) / 2,
			panY: (height - image.height * fitZoom) / 2,
		});
	}

	function setZoomPreset(preset: 'fit' | '100' | '200'): void {
		if (preset === 'fit') {
			fitToScreen();
			return;
		}
		if (!viewportEl) return;
		const anchorX = viewportEl.clientWidth / 2;
		const anchorY = viewportEl.clientHeight / 2;
		setZoomAt(preset === '100' ? 1 : 2, anchorX, anchorY);
	}

	function resolveHandleAtPoint(x: number, y: number): 'origin' | 'size' | null {
		if (!workingGrid || !showGrid || !editableGrid) return null;
		const originX = viewport.panX + workingGrid.originX * viewport.zoom;
		const originY = viewport.panY + workingGrid.originY * viewport.zoom;
		const sizeX = viewport.panX + (workingGrid.originX + workingGrid.cellSize) * viewport.zoom;
		const sizeY = originY;
		const radius = 12;
		const originDist = Math.hypot(x - originX, y - originY);
		if (originDist <= radius) return 'origin';
		const sizeDist = Math.hypot(x - sizeX, y - sizeY);
		if (sizeDist <= radius) return 'size';
		return null;
	}

	function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number): void {
		if (!workingGrid || !showGrid) return;
		const step = workingGrid.cellSize * viewport.zoom;
		if (!Number.isFinite(step) || step <= 1) return;

		const originX = viewport.panX + workingGrid.originX * viewport.zoom;
		const originY = viewport.panY + workingGrid.originY * viewport.zoom;

		ctx.save();
		ctx.strokeStyle = 'rgba(16, 89, 162, 0.62)';
		ctx.lineWidth = 1;

		if (workingGrid.type === 'square') {
			for (let x = originX; x <= width + step; x += step) {
				ctx.beginPath();
				ctx.moveTo(x, 0);
				ctx.lineTo(x, height);
				ctx.stroke();
			}
			for (let x = originX - step; x >= -step; x -= step) {
				ctx.beginPath();
				ctx.moveTo(x, 0);
				ctx.lineTo(x, height);
				ctx.stroke();
			}
			for (let y = originY; y <= height + step; y += step) {
				ctx.beginPath();
				ctx.moveTo(0, y);
				ctx.lineTo(width, y);
				ctx.stroke();
			}
			for (let y = originY - step; y >= -step; y -= step) {
				ctx.beginPath();
				ctx.moveTo(0, y);
				ctx.lineTo(width, y);
				ctx.stroke();
			}
		} else {
			const hexHeight = Math.sqrt(3) * (step / 2);
			const cols = Math.ceil(width / step) + 4;
			const rows = Math.ceil(height / hexHeight) + 4;
			for (let row = -2; row < rows; row += 1) {
				for (let col = -2; col < cols; col += 1) {
					const centerX = originX + col * step + (row % 2 === 0 ? 0 : step / 2);
					const centerY = originY + row * hexHeight;
					ctx.beginPath();
					for (let i = 0; i < 6; i += 1) {
						const angle = (Math.PI / 3) * i;
						const px = centerX + (step / 2) * Math.cos(angle);
						const py = centerY + (step / 2) * Math.sin(angle);
						if (i === 0) ctx.moveTo(px, py);
						else ctx.lineTo(px, py);
					}
					ctx.closePath();
					ctx.stroke();
				}
			}
		}

		if (editableGrid) {
			const sizeX = viewport.panX + (workingGrid.originX + workingGrid.cellSize) * viewport.zoom;
			ctx.fillStyle = 'rgba(16, 89, 162, 0.9)';
			ctx.beginPath();
			ctx.arc(originX, originY, 5, 0, Math.PI * 2);
			ctx.fill();
			ctx.beginPath();
			ctx.arc(sizeX, originY, 5, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.restore();
	}

	function drawCellShape(
		ctx: CanvasRenderingContext2D,
		localPoint: { x: number; y: number },
		cellSize: number,
		gridType: MapGridData['type'],
	): void {
		if (gridType === 'square') {
			const half = cellSize / 2;
			ctx.rect(localPoint.x - half, localPoint.y - half, cellSize, cellSize);
			return;
		}
		const radius = cellSize / 2;
		for (let i = 0; i < 6; i += 1) {
			const angle = (Math.PI / 3) * i;
			const px = localPoint.x + radius * Math.cos(angle);
			const py = localPoint.y + radius * Math.sin(angle);
			if (i === 0) ctx.moveTo(px, py);
			else ctx.lineTo(px, py);
		}
		ctx.closePath();
	}

	function drawGridCellOverlay(
		ctx: CanvasRenderingContext2D,
		cells: readonly MapViewerGridCell[],
		fillStyle: string,
		strokeStyle?: string,
	): void {
		if (!workingGrid || cells.length === 0) return;
		const zoom = Math.max(MIN_ZOOM, viewport.zoom);
		const localCellSize = workingGrid.cellSize * zoom;
		ctx.save();
		ctx.fillStyle = fillStyle;
		if (strokeStyle) {
			ctx.strokeStyle = strokeStyle;
			ctx.lineWidth = 1.2;
		}
		for (const cell of cells) {
			const local = gridCellToLocalPoint(cell);
			if (!local) continue;
			ctx.beginPath();
			drawCellShape(ctx, local, localCellSize, workingGrid.type);
			ctx.fill();
			if (strokeStyle) ctx.stroke();
		}
		ctx.restore();
	}

	function drawScene(): void {
		if (!canvasEl || !viewportEl) return;
		const rect = viewportEl.getBoundingClientRect();
		const cssWidth = Math.max(1, Math.floor(rect.width));
		const cssHeight = Math.max(1, Math.floor(rect.height));
		const dpr = Math.max(1, window.devicePixelRatio || 1);
		const targetWidth = Math.floor(cssWidth * dpr);
		const targetHeight = Math.floor(cssHeight * dpr);
		if (canvasEl.width !== targetWidth || canvasEl.height !== targetHeight) {
			canvasEl.width = targetWidth;
			canvasEl.height = targetHeight;
		}
		const ctx = canvasEl.getContext('2d');
		if (!ctx) return;

		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, cssWidth, cssHeight);
		ctx.fillStyle = '#0f172a08';
		ctx.fillRect(0, 0, cssWidth, cssHeight);

		if (image) {
			const zoom = Math.max(MIN_ZOOM, viewport.zoom);
			const sx = Math.max(0, -viewport.panX / zoom);
			const sy = Math.max(0, -viewport.panY / zoom);
			const sw = Math.min(image.width - sx, cssWidth / zoom + 1);
			const sh = Math.min(image.height - sy, cssHeight / zoom + 1);
			if (sw > 0 && sh > 0) {
				const dx = viewport.panX + sx * zoom;
				const dy = viewport.panY + sy * zoom;
				ctx.imageSmoothingEnabled = true;
				ctx.drawImage(image, sx, sy, sw, sh, dx, dy, sw * zoom, sh * zoom);
			}
		}

		drawGrid(ctx, cssWidth, cssHeight);
		drawGridCellOverlay(
			ctx,
			difficultTerrainCells,
			'rgba(120, 53, 15, 0.28)',
			'rgba(120,53,15,0.8)',
		);
		drawGridCellOverlay(ctx, movementRangeCells, 'rgba(5, 150, 105, 0.2)', 'rgba(5,150,105,0.65)');
		drawGridCellOverlay(ctx, pathCells, 'rgba(14, 116, 144, 0.22)', 'rgba(14,116,144,0.85)');
		for (const overlay of templateOverlays) {
			drawGridCellOverlay(
				ctx,
				overlay.cells,
				overlay.color ?? 'rgba(220, 38, 38, 0.2)',
				overlay.stroke ?? 'rgba(220, 38, 38, 0.75)',
			);
		}
	}

	function updateGridFromPointer(pointerX: number, pointerY: number): void {
		if (!workingGrid || !gridDrag) return;
		const imageX = (pointerX - viewport.panX) / Math.max(MIN_ZOOM, viewport.zoom);
		const imageY = (pointerY - viewport.panY) / Math.max(MIN_ZOOM, viewport.zoom);
		if (gridDrag.handle === 'origin') {
			workingGrid = {
				...workingGrid,
				originX: imageX,
				originY: imageY,
			};
		} else {
			workingGrid = {
				...workingGrid,
				cellSize: Math.max(4, imageX - workingGrid.originX),
			};
		}
		ongridchange?.(workingGrid);
		queueDraw();
	}

	function onPointerDown(event: PointerEvent): void {
		if (!viewportEl) return;
		viewportEl.focus();
		const rect = viewportEl.getBoundingClientRect();
		const localX = event.clientX - rect.left;
		const localY = event.clientY - rect.top;
		emitMapPointerCallback(event, onmappointerdown);
		activePointers.set(event.pointerId, { x: localX, y: localY });
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		clickCandidate = {
			pointerId: event.pointerId,
			startX: localX,
			startY: localY,
			ctrlKey: event.ctrlKey,
			metaKey: event.metaKey,
			shiftKey: event.shiftKey,
			moved: false,
		};

		const handle = resolveHandleAtPoint(localX, localY);
		if (handle) {
			gridDrag = { pointerId: event.pointerId, handle };
			pointerHint = handle === 'origin' ? 'Adjusting grid origin' : 'Adjusting grid size';
			return;
		}

		panDrag = {
			pointerId: event.pointerId,
			startX: localX,
			startY: localY,
			startPanX: viewport.panX,
			startPanY: viewport.panY,
		};
		pointerHint = 'Panning map';
	}

	function onPointerMove(event: PointerEvent): void {
		if (!viewportEl) return;
		const rect = viewportEl.getBoundingClientRect();
		const localX = event.clientX - rect.left;
		const localY = event.clientY - rect.top;
		emitMapPointerCallback(event, onmappointermove);
		if (
			clickCandidate &&
			clickCandidate.pointerId === event.pointerId &&
			Math.hypot(localX - clickCandidate.startX, localY - clickCandidate.startY) >
				POI_CLICK_DRAG_THRESHOLD
		) {
			clickCandidate = { ...clickCandidate, moved: true };
		}
		if (activePointers.has(event.pointerId)) {
			activePointers.set(event.pointerId, { x: localX, y: localY });
		}

		if (combatTokenDrag && combatTokenDrag.pointerId === event.pointerId) {
			if (
				Math.hypot(localX - combatTokenDrag.startX, localY - combatTokenDrag.startY) >
				POI_CLICK_DRAG_THRESHOLD
			) {
				combatTokenDrag = { ...combatTokenDrag, moved: true };
			}
			pointerHint = 'Moving token';
			return;
		}

		if (poiDrag && poiDrag.pointerId === event.pointerId) {
			if (Math.hypot(localX - poiDrag.startX, localY - poiDrag.startY) > POI_CLICK_DRAG_THRESHOLD) {
				poiDrag = { ...poiDrag, moved: true };
			}
			const fractions = localPointToMapFraction(localX, localY);
			if (fractions) {
				onpoimove?.({ id: poiDrag.poiId, x: fractions.x, y: fractions.y });
				pointerHint = 'Moving pin';
			}
			return;
		}

		if (gridDrag && gridDrag.pointerId === event.pointerId) {
			updateGridFromPointer(localX, localY);
			return;
		}

		if (activePointers.size === 2) {
			const pointers = [...activePointers.values()];
			const first = pointers[0];
			const second = pointers[1];
			if (!first || !second) return;
			const distance = Math.hypot(second.x - first.x, second.y - first.y);
			const anchorX = (first.x + second.x) / 2;
			const anchorY = (first.y + second.y) / 2;
			if (!pinchGesture) {
				pinchGesture = {
					startDistance: Math.max(1, distance),
					startZoom: viewport.zoom,
					anchorX,
					anchorY,
				};
				return;
			}
			const ratio = distance / Math.max(1, pinchGesture.startDistance);
			setZoomAt(pinchGesture.startZoom * ratio, anchorX, anchorY);
			return;
		}

		if (panDrag && panDrag.pointerId === event.pointerId) {
			setViewport({
				zoom: viewport.zoom,
				panX: panDrag.startPanX + (localX - panDrag.startX),
				panY: panDrag.startPanY + (localY - panDrag.startY),
			});
		}
	}

	function onPointerUp(event: PointerEvent): void {
		emitMapPointerCallback(event, onmappointerup);
		if (combatTokenDrag?.pointerId === event.pointerId) {
			if (viewportEl && combatTokenDrag.moved) {
				const rect = viewportEl.getBoundingClientRect();
				const localX = event.clientX - rect.left;
				const localY = event.clientY - rect.top;
				const cell = localPointToGridCell(localX, localY);
				if (cell) {
					oncombattokendrop?.({
						id: combatTokenDrag.tokenId,
						cellX: cell.x,
						cellY: cell.y,
					});
				}
				suppressCombatTokenClickId = combatTokenDrag.tokenId;
			}
			combatTokenDrag = null;
		}
		if (poiDrag?.pointerId === event.pointerId) {
			if (poiDrag.moved) {
				suppressPoiClickId = poiDrag.poiId;
			}
			poiDrag = null;
		}
		if (clickCandidate?.pointerId === event.pointerId && !clickCandidate.moved) {
			if (viewportEl) {
				const rect = viewportEl.getBoundingClientRect();
				const localX = event.clientX - rect.left;
				const localY = event.clientY - rect.top;
				const fractions = localPointToMapFraction(localX, localY);
				if (fractions) {
					onmapclick?.({
						x: fractions.x,
						y: fractions.y,
						ctrlKey: clickCandidate.ctrlKey,
						metaKey: clickCandidate.metaKey,
						shiftKey: clickCandidate.shiftKey,
					});
				}
			}
		}
		if (clickCandidate?.pointerId === event.pointerId) {
			clickCandidate = null;
		}
		activePointers.delete(event.pointerId);
		if (panDrag?.pointerId === event.pointerId) {
			panDrag = null;
		}
		if (gridDrag?.pointerId === event.pointerId) {
			gridDrag = null;
		}
		if (activePointers.size < 2) {
			pinchGesture = null;
		}
		pointerHint = '';
	}

	function handlePoiPointerDown(event: PointerEvent, poiId: string): void {
		event.stopPropagation();
		if (!poiEditable) return;
		if (!viewportEl) return;
		const rect = viewportEl.getBoundingClientRect();
		const localX = event.clientX - rect.left;
		const localY = event.clientY - rect.top;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		poiDrag = {
			pointerId: event.pointerId,
			poiId,
			startX: localX,
			startY: localY,
			moved: false,
		};
	}

	function emitPoiHover(poiId: string | null, event: MouseEvent | FocusEvent): void {
		if (!onpoihover) return;
		const target = event.currentTarget as HTMLElement | null;
		if (!target) return;
		const rect = target.getBoundingClientRect();
		onpoihover({
			id: poiId,
			clientX: rect.left + rect.width / 2,
			clientY: rect.top,
		});
	}

	function handlePoiClick(event: MouseEvent, poiId: string): void {
		event.stopPropagation();
		if (suppressPoiClickId === poiId) {
			suppressPoiClickId = null;
			return;
		}
		onpoiclick?.({ id: poiId, ctrlKey: event.ctrlKey, metaKey: event.metaKey });
	}

	function handleCombatTokenPointerDown(event: PointerEvent, tokenId: string): void {
		event.stopPropagation();
		if (!combatTokenEditable || !viewportEl) return;
		const rect = viewportEl.getBoundingClientRect();
		const localX = event.clientX - rect.left;
		const localY = event.clientY - rect.top;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		combatTokenDrag = {
			pointerId: event.pointerId,
			tokenId,
			startX: localX,
			startY: localY,
			moved: false,
		};
	}

	function handleCombatTokenClick(event: MouseEvent, tokenId: string): void {
		event.stopPropagation();
		if (suppressCombatTokenClickId === tokenId) {
			suppressCombatTokenClickId = null;
			return;
		}
		oncombattokenclick?.({ id: tokenId, ctrlKey: event.ctrlKey, metaKey: event.metaKey });
	}

	function onWheel(event: WheelEvent): void {
		if (!viewportEl) return;
		event.preventDefault();
		const rect = viewportEl.getBoundingClientRect();
		const localX = event.clientX - rect.left;
		const localY = event.clientY - rect.top;
		const factor = Math.exp(-event.deltaY * 0.0022);
		setZoomAt(viewport.zoom * factor, localX, localY);
	}

	function onKeyDown(event: KeyboardEvent): void {
		const step = 40;
		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			setViewport({ ...viewport, panX: viewport.panX + step });
			return;
		}
		if (event.key === 'ArrowRight') {
			event.preventDefault();
			setViewport({ ...viewport, panX: viewport.panX - step });
			return;
		}
		if (event.key === 'ArrowUp') {
			event.preventDefault();
			setViewport({ ...viewport, panY: viewport.panY + step });
			return;
		}
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			setViewport({ ...viewport, panY: viewport.panY - step });
			return;
		}
		if (event.key === '+' || event.key === '=') {
			event.preventDefault();
			if (!viewportEl) return;
			setZoomAt(viewport.zoom * 1.2, viewportEl.clientWidth / 2, viewportEl.clientHeight / 2);
			return;
		}
		if (event.key === '-' || event.key === '_') {
			event.preventDefault();
			if (!viewportEl) return;
			setZoomAt(viewport.zoom / 1.2, viewportEl.clientWidth / 2, viewportEl.clientHeight / 2);
			return;
		}
		if (event.key === '0') {
			event.preventDefault();
			fitToScreen();
		}
	}

	$effect(() => {
		workingGrid = grid ? { ...grid } : undefined;
		queueDraw();
	});

	$effect(() => {
		if (!initialViewport) return;
		setViewport({
			zoom: initialViewport.zoom,
			panX: initialViewport.panX,
			panY: initialViewport.panY,
		});
	});

	$effect(() => {
		if (!src) {
			image = null;
			imageError = null;
			loadingImage = false;
			queueDraw();
			return;
		}

		let stale = false;
		loadingImage = true;
		imageError = null;
		const nextImage = new Image();
		nextImage.decoding = 'async';
		nextImage.loading = 'eager';
		nextImage.onload = () => {
			if (stale) return;
			image = nextImage;
			loadingImage = false;
			onimageinfo?.({ width: nextImage.width, height: nextImage.height });
			if (!initialViewport) {
				fitToScreen();
			} else {
				queueDraw();
			}
		};
		nextImage.onerror = () => {
			if (stale) return;
			image = null;
			loadingImage = false;
			imageError = 'Unable to load map image.';
			queueDraw();
		};
		nextImage.src = src;
		return () => {
			stale = true;
		};
	});

	$effect(() => {
		queueDraw();
	});
</script>

<div
	class="flex h-full min-h-[340px] flex-col rounded-lg border border-border bg-surface dark:border-tavern-border dark:bg-tavern-surface"
>
	<div
		class="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-xs dark:border-tavern-border"
	>
		<div class="flex items-center gap-2">
			<button
				type="button"
				class="rounded border border-border px-2 py-1 text-ink-muted hover:bg-surface-alt dark:border-tavern-border dark:text-tavern-muted dark:hover:bg-tavern-surface-alt"
				onclick={() => setZoomPreset('fit')}
			>
				Fit
			</button>
			<button
				type="button"
				class="rounded border border-border px-2 py-1 text-ink-muted hover:bg-surface-alt dark:border-tavern-border dark:text-tavern-muted dark:hover:bg-tavern-surface-alt"
				onclick={() => setZoomPreset('100')}
			>
				100%
			</button>
			<button
				type="button"
				class="rounded border border-border px-2 py-1 text-ink-muted hover:bg-surface-alt dark:border-tavern-border dark:text-tavern-muted dark:hover:bg-tavern-surface-alt"
				onclick={() => setZoomPreset('200')}
			>
				200%
			</button>
		</div>
		<div class="flex items-center gap-2 text-ink-faint dark:text-tavern-faint">
			<span>{Math.round(viewport.zoom * 100)}%</span>
			{#if pointerHint}
				<span>{pointerHint}</span>
			{/if}
		</div>
	</div>

	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		bind:this={viewportEl}
		class="relative h-full min-h-[260px] flex-1 overflow-hidden bg-parchment/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:bg-tavern-bg/70 dark:focus-visible:ring-tavern-accent"
		tabindex="0"
		role="application"
		aria-label={alt}
		onwheel={onWheel}
		onkeydown={onKeyDown}
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={onPointerUp}
		onlostpointercapture={onPointerUp}
	>
		<canvas bind:this={canvasEl} class="absolute inset-0 h-full w-full"></canvas>
		{#if image && pois.length > 0}
			<div class="pointer-events-none absolute inset-0">
				{#each pois.filter((poi) => !poi.hidden) as poi (poi.id)}
					{@const point = mapFractionToLocalPoint(poi.x, poi.y)}
					{#if point}
						<button
							type="button"
							class="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/90 text-white shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
							style={`left:${point.x}px;top:${point.y}px;background:${poiThemeColor(poi.colorTheme)};width:24px;height:24px;`}
							aria-label={`${poi.label} (${poi.category})`}
							title={poi.label}
							onpointerdown={(event) => handlePoiPointerDown(event, poi.id)}
							onclick={(event) => handlePoiClick(event, poi.id)}
							onmouseenter={(event) => emitPoiHover(poi.id, event)}
							onmouseleave={(event) => emitPoiHover(null, event)}
							onfocus={(event) => emitPoiHover(poi.id, event)}
							onblur={(event) => emitPoiHover(null, event)}
						>
							<span class="text-xs leading-none">{POI_CATEGORY_ICON[poi.category]}</span>
						</button>
					{/if}
				{/each}
			</div>
		{/if}
		{#if image && combatTokens.length > 0}
			<div class="pointer-events-none absolute inset-0">
				{#each combatTokens as token (token.id)}
					{@const point = gridCellToLocalPoint({ x: token.cellX, y: token.cellY })}
					{#if point}
						<button
							type="button"
							class="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/90 {activeCombatTokenId ===
							token.id
								? 'z-30 scale-105'
								: 'z-20'}"
							style={`left:${point.x}px;top:${point.y}px;`}
							aria-label={token.label}
							title={token.label}
							onpointerdown={(event) => handleCombatTokenPointerDown(event, token.id)}
							onclick={(event) => handleCombatTokenClick(event, token.id)}
						>
							<div
								class="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border-2 border-white/90 bg-slate-800 text-xs font-semibold text-white shadow-lg"
							>
								{#if token.imageUrl}
									<img src={token.imageUrl} alt={token.label} class="h-full w-full object-cover" />
								{:else}
									<span>{token.initials}</span>
								{/if}
								{#if token.statusIcons && token.statusIcons.length > 0}
									<div
										class="absolute -right-1 -top-1 rounded bg-black/70 px-1 text-[9px] leading-4 text-white"
									>
										{token.statusIcons.join('')}
									</div>
								{/if}
							</div>
							{#if token.hpRatio !== null && token.hpRatio !== undefined}
								<div
									class="absolute left-1/2 top-[38px] h-1.5 w-10 -translate-x-1/2 overflow-hidden rounded bg-black/30"
								>
									<div
										class="h-full"
										style={`width:${Math.max(0, Math.min(100, token.hpRatio * 100))}%;background:${hpToneColor(token.hpTone)};`}
									></div>
								</div>
							{/if}
						</button>
					{/if}
				{/each}
			</div>
		{/if}
		{#if !src}
			<div
				class="absolute inset-0 flex items-center justify-center text-sm text-ink-muted dark:text-tavern-muted"
			>
				Select a map to view.
			</div>
		{:else if loadingImage}
			<div
				class="absolute inset-0 flex items-center justify-center text-sm text-ink-muted dark:text-tavern-muted"
			>
				Loading map image...
			</div>
		{:else if imageError}
			<div class="absolute inset-0 flex items-center justify-center text-sm text-error">
				{imageError}
			</div>
		{/if}
	</div>
</div>
