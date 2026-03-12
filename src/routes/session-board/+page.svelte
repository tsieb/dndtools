<script lang="ts">
	import { nanoid } from 'nanoid';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import SessionBoardTileCard from '$lib/ui/board/SessionBoardTile.svelte';
	import SessionBoardTimerTile from '$lib/ui/board/SessionBoardTimerTile.svelte';
	import CombatTrackerTile from '$lib/ui/board/CombatTrackerTile.svelte';
	import EncounterBuilderTile from '$lib/ui/board/EncounterBuilderTile.svelte';
	import DiceTrayTile from '$lib/ui/board/DiceTrayTile.svelte';
	import GeneratorTile from '$lib/ui/board/GeneratorTile.svelte';
	import HandoutLibraryTile from '$lib/ui/board/HandoutLibraryTile.svelte';
	import WorldCalendarReference from '$lib/ui/calendar/WorldCalendarReference.svelte';
	import SessionMissionControl from '$lib/ui/session/SessionMissionControl.svelte';
	import SessionPrepPanel from '$lib/ui/session/SessionPrepPanel.svelte';
	import EmptyState from '$lib/ui/common/EmptyState.svelte';
	import Button from '$lib/ui/common/Button.svelte';
	import Icon from '$lib/ui/common/Icon.svelte';
	import Popover from '$lib/ui/common/Popover.svelte';
	import Sheet from '$lib/ui/common/Sheet.svelte';
	import ConfirmDialog from '$lib/ui/common/ConfirmDialog.svelte';
	import { focusTrap } from '$lib/actions/focus-trap.js';
	import {
		DEFAULT_SESSION_BOARD_LAYOUT,
		TILE_TYPE_METADATA,
		repackSessionBoardTiles,
		resolveSessionBoardTileType,
	} from '$lib/domain/session-board.js';
	import {
		loadSessionPrepViewModel,
		type SessionPrepViewModel,
	} from '$lib/domain/session-prep-workflow.js';
	import { createDefaultCombatState } from '$lib/domain/combat-tracker.js';
	import { renderMarkdown } from '$lib/markdown/pipeline.js';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { sessionBoardsState } from '$lib/state/session-boards.svelte.js';
	import { sessionModeState } from '$lib/state/session-mode.svelte.js';
	import { toastState } from '$lib/state/toast.svelte.js';
	import type { NoteId } from '$lib/types/note.js';
	import type {
		SessionBoard,
		SessionBoardNoteTile,
		SessionBoardCombatTile as SessionBoardCombatTileModel,
		SessionBoardEncounterTile as SessionBoardEncounterTileModel,
		SessionBoardDiceTile as SessionBoardDiceTileModel,
		SessionBoardGeneratorTile as SessionBoardGeneratorTileModel,
		SessionBoardHandoutTile as SessionBoardHandoutTileModel,
		SessionBoardTile,
		SessionBoardTimerTile as SessionBoardTimerTileModel,
	} from '$lib/types/session-board.js';

	const DEFAULT_LAYOUT = DEFAULT_SESSION_BOARD_LAYOUT;
	const CELL_WIDTH = 160;
	type BoardZoomPreset = 'fit' | 'comfortable' | 'detail';
	const BOARD_ZOOM_PRESET_ORDER: readonly BoardZoomPreset[] = ['fit', 'comfortable', 'detail'];
	const MIN_FIT_ZOOM = 0.5;
	const FIT_PADDING_PX = 48;
	const TILE_SIZE_PRESETS: ReadonlyArray<{ label: string; w: number; h: number }> = [
		{ label: 'Small', w: 2, h: 1 },
		{ label: 'Medium', w: 3, h: 2 },
		{ label: 'Large', w: 4, h: 3 },
	];

	let newBoardName = $state('Session Board');
	let newBoardDescription = $state('');
	let createTemplateId = $state('');
	let noteQuery = $state('');
	let boardNameDraft = $state('');
	let boardDescriptionDraft = $state('');
	let applyTemplateId = $state('');
	let saveTemplateName = $state('');
	let saveTemplateDescription = $state('');
	let mode = $state<'view' | 'edit'>('view');
	let selectedTileId = $state<string | null>(null);
	let overlayNoteId = $state<NoteId | null>(null);
	let overlayHtml = $state('');
	let overlayContentEl = $state<HTMLDivElement | null>(null);
	let boardViewportEl = $state<HTMLDivElement | null>(null);
	let draftPositions = $state<Record<string, { x: number; y: number }>>({});
	let drag = $state<{
		tileId: string;
		pointerId: number;
		startX: number;
		startY: number;
		originX: number;
		originY: number;
	} | null>(null);
	let pan = $state<{
		pointerId: number;
		startX: number;
		startY: number;
		scrollLeft: number;
		scrollTop: number;
		moved: boolean;
	} | null>(null);
	let zoomPreset = $state<BoardZoomPreset>('fit');
	let viewportSize = $state<{ width: number; height: number }>({ width: 0, height: 0 });
	let lastBoardId = $state<string | null>(null);
	let suggestionKey = $state('');
	let sessionPrep = $state<SessionPrepViewModel | null>(null);
	let sessionPrepLoading = $state(false);
	let sessionPrepError = $state<string | null>(null);
	let lastSessionPrepKey = $state('');
	let tileMenuTileId = $state<string | null>(null);
	let tileMenuButtonEl = $state<HTMLElement | null>(null);
	let resizeModeTileId = $state<string | null>(null);
	let resizeDraftSize = $state<{ w: number; h: number } | null>(null);
	let resizeAnnouncement = $state('');
	let resizeDrag = $state<{
		tileId: string;
		pointerId: number;
		startX: number;
		startY: number;
		startW: number;
		startH: number;
		dragged: boolean;
	} | null>(null);
	let removeConfirmTileId = $state<string | null>(null);
	let noteAssignTileId = $state<string | null>(null);
	let noteAssignQuery = $state('');
	let tileCreationSheetOpen = $state(false);
	let keyboardFocusedTileId = $state<string | null>(null);
	let keyboardMoveTileId = $state<string | null>(null);
	let keyboardMoveOrigin = $state<{ x: number; y: number } | null>(null);
	let keyboardMoveAnnouncement = $state('');
	let overflowFlashTileIds = $state<Record<string, true>>({});
	let overflowCorrectionCount = $state(0);
	let overflowBannerDismissedBoardVersion = $state<string | null>(null);
	let lastOverflowBoardVersion = $state<string | null>(null);
	let overflowFlashTimers = $state<Record<string, number>>({});

	type RenderedTileEntry =
		| { tile: SessionBoardTile; kind: 'calendar'; x: number; y: number }
		| { tile: SessionBoardTimerTileModel; kind: 'timer'; x: number; y: number }
		| { tile: SessionBoardCombatTileModel; kind: 'combat'; x: number; y: number }
		| { tile: SessionBoardEncounterTileModel; kind: 'encounter'; x: number; y: number }
		| { tile: SessionBoardDiceTileModel; kind: 'dice'; x: number; y: number }
		| { tile: SessionBoardGeneratorTileModel; kind: 'generator'; x: number; y: number }
		| { tile: SessionBoardHandoutTileModel; kind: 'handouts'; x: number; y: number }
		| { tile: SessionBoardNoteTile; kind: 'note_slot'; x: number; y: number }
		| {
				tile: SessionBoardNoteTile;
				kind: 'note';
				note: (typeof notesState.activeNotes)[number];
				x: number;
				y: number;
		  };

	let activeBoard = $derived(sessionBoardsState.activeBoard);
	let isBoardSessionActive = $derived.by(
		() =>
			sessionModeState.isActive &&
			!!activeBoard &&
			sessionModeState.activeSession?.sessionBoardId === String(activeBoard.id),
	);
	let activeNotesById = $derived(notesState.activeNoteById);
	let boardTemplates = $derived(sessionBoardsState.templates);
	let layout = $derived.by(() => ({
		columns: activeBoard?.layout?.columns ?? DEFAULT_LAYOUT.columns,
		rowHeight: activeBoard?.layout?.rowHeight ?? DEFAULT_LAYOUT.rowHeight,
		minRows: activeBoard?.layout?.minRows ?? DEFAULT_LAYOUT.minRows,
		gap: activeBoard?.layout?.gap ?? DEFAULT_LAYOUT.gap,
	}));
	let selectedTile = $derived.by(
		() => activeBoard?.tiles.find((t) => t.id === selectedTileId) ?? null,
	);
	let selectedNoteTile = $derived.by(() =>
		selectedTile && (selectedTile.type ?? 'note') === 'note'
			? (selectedTile as SessionBoardNoteTile)
			: null,
	);
	let tileMenuTile = $derived.by(() =>
		tileMenuTileId
			? (activeBoard?.tiles.find((entry) => entry.id === tileMenuTileId) ?? null)
			: null,
	);
	let noteAssignTile = $derived.by(() =>
		noteAssignTileId
			? (activeBoard?.tiles.find((entry) => entry.id === noteAssignTileId) ?? null)
			: null,
	);
	let overlayNote = $derived(overlayNoteId ? (activeNotesById.get(overlayNoteId) ?? null) : null);
	let tileFocusOrder = $derived.by(() =>
		renderedTiles
			.map((entry) => entry.tile.id)
			.filter((id, index, values) => values.indexOf(id) === index),
	);
	let boardEditVersion = $derived.by(() =>
		activeBoard ? `${activeBoard.id}:${activeBoard.updatedAt}` : null,
	);
	let hasColumnOverflow = $derived.by(() =>
		(activeBoard?.tiles ?? []).some((tile) => tile.x + tile.w > layout.columns),
	);
	let showOverflowBanner = $derived.by(
		() =>
			mode === 'edit' &&
			(hasColumnOverflow || overflowCorrectionCount > 0) &&
			boardEditVersion !== overflowBannerDismissedBoardVersion,
	);
	let zoom = $derived.by(() => {
		if (zoomPreset === 'comfortable') return 1;
		if (zoomPreset === 'detail') return 1.5;
		const fitX = (viewportSize.width - FIT_PADDING_PX) / Math.max(1, canvas.width);
		const fitY = (viewportSize.height - FIT_PADDING_PX) / Math.max(1, canvas.height);
		const fit = Math.min(1, fitX, fitY);
		if (!Number.isFinite(fit)) return 1;
		return Math.max(MIN_FIT_ZOOM, fit);
	});
	let zoomPercent = $derived(Math.round(zoom * 100));

	let availableNotes = $derived.by(() => {
		const used = new Set(
			(activeBoard?.tiles ?? [])
				.filter((tile): tile is SessionBoardTile & { noteId: NoteId } => !!tile.noteId)
				.map((tile) => tile.noteId),
		);
		const q = noteQuery.trim().toLowerCase();
		const base = notesState.activeNotes.filter((n) => !used.has(n.id));
		if (!q) return base.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 40);
		return base
			.map((note) => {
				const title = note.title.toLowerCase();
				let score = -1;
				if (title === q) score = 500;
				else if (title.startsWith(q)) score = 400;
				else if (title.includes(q)) score = 300;
				else {
					const tagMatches = note.tags.filter((tag) => tag.toLowerCase().includes(q)).length;
					if (tagMatches > 0) score = 120 + tagMatches * 10;
				}
				return { note, score };
			})
			.filter((e) => e.score >= 0)
			.sort((a, b) => b.score - a.score || b.note.updatedAt.localeCompare(a.note.updatedAt))
			.slice(0, 40)
			.map((e) => e.note);
	});

	let noteAssignOptions = $derived.by(() => {
		const q = noteAssignQuery.trim().toLowerCase();
		const base = notesState.activeNotes;
		if (!q) return base.slice(0, 60);
		return base
			.filter((note) => {
				if (note.title.toLowerCase().includes(q)) return true;
				return note.tags.some((tag) => tag.toLowerCase().includes(q));
			})
			.slice(0, 60);
	});

	let renderedTiles = $derived.by(() => {
		if (!activeBoard) return [] as RenderedTileEntry[];
		const entries: RenderedTileEntry[] = [];
		for (const tile of activeBoard.tiles) {
			const draft = draftPositions[tile.id];
			if (tile.type === 'calendar') {
				entries.push({ tile, kind: 'calendar', x: draft?.x ?? tile.x, y: draft?.y ?? tile.y });
				continue;
			}
			if (tile.type === 'timer') {
				entries.push({ tile, kind: 'timer', x: draft?.x ?? tile.x, y: draft?.y ?? tile.y });
				continue;
			}
			if (tile.type === 'combat') {
				entries.push({ tile, kind: 'combat', x: draft?.x ?? tile.x, y: draft?.y ?? tile.y });
				continue;
			}
			if (tile.type === 'encounter') {
				entries.push({ tile, kind: 'encounter', x: draft?.x ?? tile.x, y: draft?.y ?? tile.y });
				continue;
			}
			if (tile.type === 'dice') {
				entries.push({ tile, kind: 'dice', x: draft?.x ?? tile.x, y: draft?.y ?? tile.y });
				continue;
			}
			if (tile.type === 'generator') {
				entries.push({ tile, kind: 'generator', x: draft?.x ?? tile.x, y: draft?.y ?? tile.y });
				continue;
			}
			if (tile.type === 'handouts') {
				entries.push({ tile, kind: 'handouts', x: draft?.x ?? tile.x, y: draft?.y ?? tile.y });
				continue;
			}
			if (!tile.noteId) {
				entries.push({ tile, kind: 'note_slot', x: draft?.x ?? tile.x, y: draft?.y ?? tile.y });
				continue;
			}
			const note = activeNotesById.get(tile.noteId);
			if (!note) {
				entries.push({ tile, kind: 'note_slot', x: draft?.x ?? tile.x, y: draft?.y ?? tile.y });
				continue;
			}
			entries.push({ tile, kind: 'note', note, x: draft?.x ?? tile.x, y: draft?.y ?? tile.y });
		}
		return entries.sort((a, b) => a.y - b.y || a.x - b.x || a.tile.id.localeCompare(b.tile.id));
	});

	let canvas = $derived.by(() => {
		const rows = Math.max(layout.minRows, ...renderedTiles.map((t) => t.y + t.tile.h));
		return {
			width: layout.columns * CELL_WIDTH + Math.max(0, layout.columns - 1) * layout.gap,
			height: rows * layout.rowHeight + Math.max(0, rows - 1) * layout.gap,
		};
	});

	$effect(() => {
		if (sessionBoardsState.boards.length === 0 && !sessionBoardsState.loading)
			void sessionBoardsState.loadAll();
	});

	$effect(() => {
		if (!activeBoard) {
			selectedTileId = null;
			lastBoardId = null;
			suggestionKey = '';
			keyboardFocusedTileId = null;
			keyboardMoveTileId = null;
			keyboardMoveOrigin = null;
			overflowCorrectionCount = 0;
			overflowBannerDismissedBoardVersion = null;
			lastOverflowBoardVersion = null;
			return;
		}
		if (activeBoard.id !== lastBoardId) {
			boardNameDraft = activeBoard.name;
			boardDescriptionDraft = activeBoard.description;
			saveTemplateName = `${activeBoard.name} Layout`;
			saveTemplateDescription = activeBoard.description;
			applyTemplateId = '';
			selectedTileId = null;
			tileMenuTileId = null;
			resizeModeTileId = null;
			resizeDraftSize = null;
			removeConfirmTileId = null;
			noteAssignTileId = null;
			draftPositions = {};
			zoomPreset = 'fit';
			keyboardFocusedTileId = null;
			keyboardMoveTileId = null;
			keyboardMoveOrigin = null;
			keyboardMoveAnnouncement = '';
			overflowFlashTileIds = {};
			overflowCorrectionCount = 0;
			overflowBannerDismissedBoardVersion = null;
			lastOverflowBoardVersion = null;
			lastBoardId = activeBoard.id;
			requestAnimationFrame(() => {
				if (!boardViewportEl) return;
				boardViewportEl.scrollLeft = 0;
				boardViewportEl.scrollTop = 0;
			});
		}
		if (selectedTileId && !activeBoard.tiles.some((tile) => tile.id === selectedTileId)) {
			selectedTileId = null;
		}
		const key = `${activeBoard.id}:${[...new Set(activeBoard.tiles.map((t) => t.noteId ?? t.type ?? 'none'))].sort().join('|')}`;
		if (key !== suggestionKey) {
			suggestionKey = key;
			void sessionBoardsState.suggestForBoard(activeBoard.id, 10);
		}
	});

	$effect(() => {
		if (mode !== 'view') return;
		selectedTileId = null;
		tileMenuTileId = null;
		resizeModeTileId = null;
		resizeDraftSize = null;
		removeConfirmTileId = null;
		noteAssignTileId = null;
		keyboardMoveTileId = null;
		keyboardMoveOrigin = null;
		keyboardMoveAnnouncement = '';
		tileCreationSheetOpen = false;
	});

	$effect(() => {
		const boardId = activeBoard ? String(activeBoard.id) : null;
		const nextKey = `${mode}|${sessionModeState.mode}|${boardId ?? 'none'}|${notesState.activeNotes.length}|${activeBoard?.handoutHistory?.length ?? 0}`;
		if (mode !== 'view' || sessionModeState.mode !== 'idle') {
			lastSessionPrepKey = '';
			sessionPrep = null;
			sessionPrepError = null;
			sessionPrepLoading = false;
			return;
		}
		if (nextKey === lastSessionPrepKey) return;
		lastSessionPrepKey = nextKey;
		void refreshSessionPrep(boardId);
	});

	$effect(() => {
		if (!activeBoard || !sessionModeState.isActive) return;
		if (sessionModeState.activeSession?.sessionBoardId !== String(activeBoard.id)) return;
		const nextSceneId = activeBoard.activeSceneId ?? null;
		if ((sessionModeState.activeSession?.sceneId ?? null) === nextSceneId) return;
		void sessionModeState.setSceneId(activeBoard.activeSceneId ?? null);
	});

	$effect(() => {
		if (!isBoardSessionActive) return;
		if (mode === 'edit') {
			mode = 'view';
		}
	});

	$effect(() => {
		if (!boardViewportEl) return;
		const viewportEl = boardViewportEl;
		const syncViewportSize = (): void => {
			viewportSize = {
				width: viewportEl.clientWidth,
				height: viewportEl.clientHeight,
			};
		};
		syncViewportSize();
		const observer = new ResizeObserver(() => {
			syncViewportSize();
		});
		observer.observe(viewportEl);
		return () => observer.disconnect();
	});

	$effect(() => {
		if (boardEditVersion === lastOverflowBoardVersion) return;
		overflowCorrectionCount = 0;
		overflowBannerDismissedBoardVersion = null;
		lastOverflowBoardVersion = boardEditVersion;
	});

	$effect(() => {
		if (!overlayNote) {
			overlayHtml = '';
			return;
		}
		let stale = false;
		void renderMarkdown(overlayNote.content, {
			resolveLink: (title) => {
				const id = notesState.resolveTitle(title);
				return id
					? { href: `/knowledge/notes/${id}`, exists: true }
					: { href: `/knowledge/notes?create=${encodeURIComponent(title)}`, exists: false };
			},
		}).then((result) => {
			if (!stale) overlayHtml = result;
		});
		return () => {
			stale = true;
		};
	});

	$effect(() => {
		if (!drag && !pan && !resizeDrag) return;
		function move(event: PointerEvent): void {
			if (drag && activeBoard && event.pointerId === drag.pointerId) {
				const activeDrag = drag;
				const dx = Math.round(
					(event.clientX - activeDrag.startX) / ((CELL_WIDTH + layout.gap) * zoom),
				);
				const dy = Math.round(
					(event.clientY - activeDrag.startY) / ((layout.rowHeight + layout.gap) * zoom),
				);
				const tile = activeBoard.tiles.find((t) => t.id === activeDrag.tileId);
				if (!tile) return;
				const w = Math.max(2, Math.min(layout.columns, tile.w));
				const attemptedX = activeDrag.originX + dx;
				const clampedX = Math.max(0, Math.min(layout.columns - w, attemptedX));
				if (clampedX !== attemptedX) triggerOverflowFlash(activeDrag.tileId);
				draftPositions = {
					...draftPositions,
					[activeDrag.tileId]: {
						x: clampedX,
						y: Math.max(0, activeDrag.originY + dy),
					},
				};
				return;
			}
			if (pan && boardViewportEl && event.pointerId === pan.pointerId) {
				boardViewportEl.scrollLeft = pan.scrollLeft - (event.clientX - pan.startX);
				boardViewportEl.scrollTop = pan.scrollTop - (event.clientY - pan.startY);
				if (
					!pan.moved &&
					(Math.abs(event.clientX - pan.startX) > 3 || Math.abs(event.clientY - pan.startY) > 3)
				) {
					pan = { ...pan, moved: true };
				}
			}
			if (resizeDrag && activeBoard && event.pointerId === resizeDrag.pointerId) {
				const activeResize = resizeDrag;
				const dx = Math.round(
					(event.clientX - activeResize.startX) / ((CELL_WIDTH + layout.gap) * zoom),
				);
				const dy = Math.round(
					(event.clientY - activeResize.startY) / ((layout.rowHeight + layout.gap) * zoom),
				);
				const tile = activeBoard.tiles.find((entry) => entry.id === activeResize.tileId);
				if (!tile) return;
				const nextW = Math.max(2, Math.min(layout.columns, activeResize.startW + dx));
				const nextH = Math.max(1, Math.min(8, activeResize.startH + dy));
				const clampedW = Math.min(nextW, layout.columns - tile.x);
				resizeDraftSize = { w: clampedW, h: nextH };
				if (!activeResize.dragged && (Math.abs(dx) > 0 || Math.abs(dy) > 0)) {
					resizeDrag = { ...activeResize, dragged: true };
				}
			}
		}
		function up(event: PointerEvent): void {
			if (drag && activeBoard && event.pointerId === drag.pointerId) {
				const activeDrag = drag;
				const tile = activeBoard.tiles.find((t) => t.id === activeDrag.tileId);
				const next = draftPositions[activeDrag.tileId];
				if (tile && next && (tile.x !== next.x || tile.y !== next.y)) {
					void sessionBoardsState.updateTile(activeBoard.id, activeDrag.tileId, next);
				}
				const rem = { ...draftPositions };
				delete rem[activeDrag.tileId];
				draftPositions = rem;
				drag = null;
			}
			if (pan && event.pointerId === pan.pointerId) pan = null;
			if (resizeDrag && activeBoard && event.pointerId === resizeDrag.pointerId) {
				const activeResize = resizeDrag;
				const tile = activeBoard.tiles.find((entry) => entry.id === activeResize.tileId);
				const draft = resizeDraftSize;
				if (tile && draft && (tile.w !== draft.w || tile.h !== draft.h)) {
					void sessionBoardsState.updateTile(activeBoard.id, tile.id, { w: draft.w, h: draft.h });
				}
				if (!activeResize.dragged && tile) {
					const presetIndex = TILE_SIZE_PRESETS.findIndex(
						(entry) => entry.w === tile.w && entry.h === tile.h,
					);
					const nextPreset = TILE_SIZE_PRESETS[(presetIndex + 1) % TILE_SIZE_PRESETS.length]!;
					void sessionBoardsState.updateTile(activeBoard.id, tile.id, {
						w: Math.min(nextPreset.w, Math.max(2, layout.columns - tile.x)),
						h: Math.max(1, nextPreset.h),
					});
				}
				resizeDrag = null;
				resizeDraftSize = null;
			}
		}
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
		window.addEventListener('pointercancel', up);
		return () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
			window.removeEventListener('pointercancel', up);
		};
	});

	function tileStyle(tile: SessionBoardTile, x: number, y: number): string {
		const sizeOverride =
			(resizeModeTileId === tile.id || resizeDrag?.tileId === tile.id) && resizeDraftSize
				? resizeDraftSize
				: null;
		const widthUnits = sizeOverride?.w ?? tile.w;
		const heightUnits = sizeOverride?.h ?? tile.h;
		const left = x * (CELL_WIDTH + layout.gap);
		const top = y * (layout.rowHeight + layout.gap);
		const width = widthUnits * CELL_WIDTH + Math.max(0, widthUnits - 1) * layout.gap;
		const height = heightUnits * layout.rowHeight + Math.max(0, heightUnits - 1) * layout.gap;
		return `left:${left}px;top:${top}px;width:${width}px;height:${height}px;min-height:0;`;
	}

	function patternStyle(board: SessionBoard): string {
		if (board.style?.backgroundPattern === 'grid') {
			return `background-image: linear-gradient(to right, rgba(32,32,32,0.16) 1px, transparent 1px), linear-gradient(to bottom, rgba(32,32,32,0.16) 1px, transparent 1px); background-size: ${CELL_WIDTH + layout.gap}px ${layout.rowHeight + layout.gap}px;`;
		}
		if (board.style?.backgroundPattern === 'dots') {
			return 'background-image: radial-gradient(rgba(32,32,32,0.28) 1.2px, transparent 1.2px); background-size: 22px 22px;';
		}
		return '';
	}

	function applyZoomPreset(nextPreset: BoardZoomPreset): void {
		if (zoomPreset === nextPreset) return;
		if (!boardViewportEl) {
			zoomPreset = nextPreset;
			return;
		}
		const viewport = boardViewportEl;
		const previousZoom = zoom;
		const centerX = viewport.scrollLeft + viewport.clientWidth / 2;
		const centerY = viewport.scrollTop + viewport.clientHeight / 2;
		zoomPreset = nextPreset;
		requestAnimationFrame(() => {
			if (!boardViewportEl) return;
			if (nextPreset === 'fit') {
				boardViewportEl.scrollLeft = 0;
				boardViewportEl.scrollTop = 0;
				return;
			}
			const boardCenterX = centerX / Math.max(0.0001, previousZoom);
			const boardCenterY = centerY / Math.max(0.0001, previousZoom);
			boardViewportEl.scrollLeft = boardCenterX * zoom - boardViewportEl.clientWidth / 2;
			boardViewportEl.scrollTop = boardCenterY * zoom - boardViewportEl.clientHeight / 2;
		});
	}

	function cycleZoomPreset(direction: -1 | 1): void {
		const currentIndex = BOARD_ZOOM_PRESET_ORDER.indexOf(zoomPreset);
		const nextIndex =
			(currentIndex + direction + BOARD_ZOOM_PRESET_ORDER.length) % BOARD_ZOOM_PRESET_ORDER.length;
		const nextPreset = BOARD_ZOOM_PRESET_ORDER[nextIndex] ?? 'fit';
		applyZoomPreset(nextPreset);
	}

	async function createBoard(): Promise<void> {
		await sessionBoardsState.createBoard(
			newBoardName,
			newBoardDescription,
			createTemplateId || undefined,
		);
		newBoardName = 'Session Board';
		newBoardDescription = '';
		createTemplateId = '';
	}

	async function startSessionFromEmptyState(): Promise<void> {
		const board =
			activeBoard ??
			sessionBoardsState.boards[0] ??
			(await sessionBoardsState.createBoard('Session Board'));
		sessionBoardsState.setActiveBoard(board.id);
		await sessionModeState.startSession({
			sessionBoardId: board.id,
			sceneId: board.activeSceneId ?? null,
		});
		mode = 'view';
	}

	function learnAboutSessionBoardsFromEmptyState(): void {
		mode = 'edit';
		toastState.info(
			'Session boards organize scenes, references, initiative, and handouts for live play.',
		);
	}

	async function saveBoard(): Promise<void> {
		if (!activeBoard) return;
		await sessionBoardsState.updateBoard(activeBoard.id, {
			name: boardNameDraft,
			description: boardDescriptionDraft,
		});
	}
	async function updateLayout(updates: Partial<SessionBoard['layout']>): Promise<void> {
		if (!activeBoard) return;
		await sessionBoardsState.updateBoard(activeBoard.id, {
			layout: { ...(activeBoard.layout ?? DEFAULT_LAYOUT), ...updates },
		});
	}
	async function updateStyle(updates: Partial<SessionBoard['style']>): Promise<void> {
		if (!activeBoard) return;
		await sessionBoardsState.updateBoard(activeBoard.id, {
			style: { ...(activeBoard.style ?? {}), ...updates },
		});
	}
	async function addNote(noteId: NoteId): Promise<void> {
		if (!activeBoard) return;
		await sessionBoardsState.addNoteToBoard(activeBoard.id, noteId);
	}
	async function addCalendarTile(): Promise<void> {
		if (!activeBoard) return;
		await sessionBoardsState.addCalendarTile(activeBoard.id);
	}
	async function addTimerTile(): Promise<void> {
		if (!activeBoard) return;
		await sessionBoardsState.addTimerTile(activeBoard.id);
	}
	async function addDiceTile(): Promise<void> {
		if (!activeBoard) return;
		await sessionBoardsState.addDiceTile(activeBoard.id);
	}
	async function addGeneratorTile(): Promise<void> {
		if (!activeBoard) return;
		await sessionBoardsState.addGeneratorTile(activeBoard.id);
	}
	async function addCombatTile(): Promise<void> {
		if (!activeBoard) return;
		await sessionBoardsState.addCombatTile(activeBoard.id);
	}
	async function addEncounterTile(): Promise<void> {
		if (!activeBoard) return;
		await sessionBoardsState.addEncounterTile(activeBoard.id);
	}
	async function addHandoutTile(): Promise<void> {
		if (!activeBoard) return;
		await sessionBoardsState.addHandoutTile(activeBoard.id);
	}
	async function applyTemplate(): Promise<void> {
		if (!activeBoard || !applyTemplateId) return;
		await sessionBoardsState.applyTemplateToBoard(activeBoard.id, applyTemplateId);
	}
	async function saveCurrentLayoutAsTemplate(): Promise<void> {
		if (!activeBoard) return;
		await sessionBoardsState.saveTemplateFromBoard(
			activeBoard.id,
			saveTemplateName,
			saveTemplateDescription,
		);
	}
	async function deleteTemplate(templateId: string): Promise<void> {
		if (!templateId) return;
		await sessionBoardsState.deleteTemplate(templateId);
		if (createTemplateId === templateId) createTemplateId = '';
		if (applyTemplateId === templateId) applyTemplateId = '';
	}
	async function removeTile(tileId: string): Promise<void> {
		if (!activeBoard) return;
		await sessionBoardsState.removeTile(activeBoard.id, tileId);
		if (selectedTileId === tileId) selectedTileId = null;
		if (keyboardFocusedTileId === tileId) keyboardFocusedTileId = null;
		if (keyboardMoveTileId === tileId) {
			keyboardMoveTileId = null;
			keyboardMoveOrigin = null;
			keyboardMoveAnnouncement = '';
		}
	}
	async function updateSelected(updates: Partial<SessionBoardTile>): Promise<void> {
		if (!activeBoard || !selectedTileId) return;
		const currentTile = activeBoard.tiles.find((tile) => tile.id === selectedTileId);
		if (currentTile) {
			const attemptedX = updates.x ?? currentTile.x;
			const attemptedW = updates.w ?? currentTile.w;
			if (attemptedX + attemptedW > layout.columns) triggerOverflowFlash(currentTile.id);
		}
		await sessionBoardsState.updateTile(activeBoard.id, selectedTileId, updates);
	}

	function tileLabel(tile: SessionBoardTile): string {
		const tileType = resolveSessionBoardTileType(tile);
		if (tileType === 'note' && tile.noteId) {
			const note = activeNotesById.get(tile.noteId);
			if (note) return note.title;
		}
		return TILE_TYPE_METADATA[tileType].label;
	}

	function tileAccentStyle(tile: SessionBoardTile): string {
		const tileType = resolveSessionBoardTileType(tile);
		return `--tile-accent: var(${TILE_TYPE_METADATA[tileType].colorToken}); border-color: var(--tile-accent);`;
	}

	function prefersReducedMotion(): boolean {
		return (
			typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
		);
	}

	function clearDraftPosition(tileId: string): void {
		const next = { ...draftPositions };
		delete next[tileId];
		draftPositions = next;
	}

	function triggerOverflowFlash(tileId: string): void {
		overflowCorrectionCount += 1;
		if (prefersReducedMotion()) return;
		overflowFlashTileIds = { ...overflowFlashTileIds, [tileId]: true };
		const existingTimer = overflowFlashTimers[tileId];
		if (existingTimer) window.clearTimeout(existingTimer);
		const timer = window.setTimeout(() => {
			const next = { ...overflowFlashTileIds };
			delete next[tileId];
			overflowFlashTileIds = next;
			const nextTimers = { ...overflowFlashTimers };
			delete nextTimers[tileId];
			overflowFlashTimers = nextTimers;
		}, 150);
		overflowFlashTimers = {
			...overflowFlashTimers,
			[tileId]: timer,
		};
	}

	function resolveTileIdFromNode(node: EventTarget | null): string | null {
		const element = node instanceof HTMLElement ? node : null;
		return element?.closest<HTMLElement>('[data-board-tile-id]')?.dataset.boardTileId ?? null;
	}

	function isTextInputTarget(node: EventTarget | null): boolean {
		const element = node instanceof HTMLElement ? node : null;
		if (!element) return false;
		if (element.isContentEditable) return true;
		return !!element.closest('input,textarea,select,[contenteditable="true"]');
	}

	function getBoardTileElement(tileId: string): HTMLElement | null {
		const selector = `[data-board-tile-id="${tileId}"] [data-board-tile="true"]`;
		return boardViewportEl?.querySelector<HTMLElement>(selector) ?? null;
	}

	function focusBoardTile(tileId: string): void {
		const tileEl = getBoardTileElement(tileId);
		if (!tileEl) return;
		tileEl.focus();
		keyboardFocusedTileId = tileId;
		selectedTileId = tileId;
	}

	function focusRelativeTile(direction: -1 | 1, fromTileId: string | null): void {
		if (tileFocusOrder.length === 0) return;
		const currentIndex = fromTileId ? tileFocusOrder.indexOf(fromTileId) : -1;
		const nextIndex =
			currentIndex < 0
				? direction > 0
					? 0
					: tileFocusOrder.length - 1
				: (currentIndex + direction + tileFocusOrder.length) % tileFocusOrder.length;
		const nextTileId = tileFocusOrder[nextIndex];
		if (!nextTileId) return;
		focusBoardTile(nextTileId);
	}

	function focusTileInteractiveContent(tileId: string): void {
		const tileElement = getBoardTileElement(tileId);
		if (!tileElement) return;
		const focusTargets = [
			...tileElement.querySelectorAll<HTMLElement>(
				'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
			),
		].filter((element) => element !== tileElement);
		const firstTarget = focusTargets[0];
		if (!firstTarget) return;
		firstTarget.focus();
	}

	function startKeyboardTileMove(tileId: string): void {
		if (!activeBoard || mode !== 'edit') return;
		const tile = activeBoard.tiles.find((entry) => entry.id === tileId);
		if (!tile) return;
		const position = draftPositions[tileId] ?? { x: tile.x, y: tile.y };
		keyboardMoveTileId = tileId;
		keyboardMoveOrigin = { x: position.x, y: position.y };
		draftPositions = {
			...draftPositions,
			[tileId]: position,
		};
		keyboardMoveAnnouncement = `Tile at column ${position.x + 1}, row ${position.y + 1}`;
	}

	function moveKeyboardTile(tileId: string, dx: number, dy: number): void {
		if (!activeBoard) return;
		const tile = activeBoard.tiles.find((entry) => entry.id === tileId);
		if (!tile) return;
		const position = draftPositions[tileId] ?? { x: tile.x, y: tile.y };
		const attemptedX = position.x + dx;
		const maxX = Math.max(0, layout.columns - tile.w);
		const nextX = Math.max(0, Math.min(maxX, attemptedX));
		if (attemptedX !== nextX) triggerOverflowFlash(tile.id);
		const nextY = Math.max(0, position.y + dy);
		draftPositions = {
			...draftPositions,
			[tileId]: { x: nextX, y: nextY },
		};
		keyboardMoveAnnouncement = `Tile at column ${nextX + 1}, row ${nextY + 1}`;
	}

	function commitKeyboardTileMove(): void {
		if (!activeBoard || !keyboardMoveTileId || !keyboardMoveOrigin) return;
		const tile = activeBoard.tiles.find((entry) => entry.id === keyboardMoveTileId);
		const position = draftPositions[keyboardMoveTileId];
		if (tile && position && (tile.x !== position.x || tile.y !== position.y)) {
			void sessionBoardsState.updateTile(activeBoard.id, keyboardMoveTileId, position);
		}
		clearDraftPosition(keyboardMoveTileId);
		keyboardMoveTileId = null;
		keyboardMoveOrigin = null;
	}

	function cancelKeyboardTileMove(): void {
		if (!keyboardMoveTileId || !keyboardMoveOrigin) {
			keyboardMoveTileId = null;
			keyboardMoveOrigin = null;
			return;
		}
		const tileId = keyboardMoveTileId;
		draftPositions = {
			...draftPositions,
			[tileId]: keyboardMoveOrigin,
		};
		clearDraftPosition(tileId);
		keyboardMoveTileId = null;
		keyboardMoveOrigin = null;
		keyboardMoveAnnouncement = '';
	}

	function openTileCreationSheet(): void {
		if (!activeBoard || mode !== 'edit') return;
		tileCreationSheetOpen = true;
	}

	async function addTileFromSheet(
		type: 'calendar' | 'timer' | 'combat' | 'encounter' | 'dice' | 'generator' | 'handouts',
	): Promise<void> {
		if (!activeBoard || mode !== 'edit') return;
		if (type === 'calendar') await addCalendarTile();
		else if (type === 'timer') await addTimerTile();
		else if (type === 'combat') await addCombatTile();
		else if (type === 'encounter') await addEncounterTile();
		else if (type === 'dice') await addDiceTile();
		else if (type === 'generator') await addGeneratorTile();
		else await addHandoutTile();
		tileCreationSheetOpen = false;
	}

	async function fixOverflowLayout(): Promise<void> {
		if (!activeBoard) return;
		const repacked = repackSessionBoardTiles(activeBoard.tiles, layout.columns);
		await sessionBoardsState.updateBoard(activeBoard.id, { tiles: repacked });
		overflowCorrectionCount = 0;
	}

	function handleViewportFocusIn(event: FocusEvent): void {
		const tileId = resolveTileIdFromNode(event.target);
		if (tileId) keyboardFocusedTileId = tileId;
	}

	function handleViewportKeydown(event: KeyboardEvent): void {
		if (isTextInputTarget(event.target)) return;
		const eventTarget = event.target instanceof HTMLElement ? event.target : null;
		const activeElement = document.activeElement as HTMLElement | null;
		const keyTarget = eventTarget ?? activeElement;
		const focusedTileId =
			resolveTileIdFromNode(keyTarget) ??
			resolveTileIdFromNode(activeElement) ??
			keyboardFocusedTileId;
		const isTileRootFocused = !!keyTarget?.matches('[data-board-tile="true"]');
		const isViewportFocused = keyTarget === boardViewportEl || activeElement === boardViewportEl;

		if (event.key === '+' || event.key === '=') {
			event.preventDefault();
			cycleZoomPreset(1);
			return;
		}
		if (event.key === '-' || event.key === '_') {
			event.preventDefault();
			cycleZoomPreset(-1);
			return;
		}
		if (event.key === '0') {
			event.preventDefault();
			applyZoomPreset('fit');
			return;
		}
		if (event.key === '1') {
			event.preventDefault();
			applyZoomPreset('comfortable');
			return;
		}
		if (event.key === '2') {
			event.preventDefault();
			applyZoomPreset('detail');
			return;
		}

		if (event.key === 'Tab' && (isViewportFocused || isTileRootFocused)) {
			event.preventDefault();
			focusRelativeTile(event.shiftKey ? -1 : 1, focusedTileId);
			return;
		}

		if (keyboardMoveTileId) {
			if (event.key === 'Escape') {
				event.preventDefault();
				cancelKeyboardTileMove();
				return;
			}
			if (event.key === 'Enter') {
				event.preventDefault();
				commitKeyboardTileMove();
				return;
			}
			if (event.key === 'ArrowLeft') {
				event.preventDefault();
				moveKeyboardTile(keyboardMoveTileId, -1, 0);
				return;
			}
			if (event.key === 'ArrowRight') {
				event.preventDefault();
				moveKeyboardTile(keyboardMoveTileId, 1, 0);
				return;
			}
			if (event.key === 'ArrowUp') {
				event.preventDefault();
				moveKeyboardTile(keyboardMoveTileId, 0, -1);
				return;
			}
			if (event.key === 'ArrowDown') {
				event.preventDefault();
				moveKeyboardTile(keyboardMoveTileId, 0, 1);
				return;
			}
		}

		if ((event.key === 'a' || event.key === 'A') && mode === 'edit') {
			if (isViewportFocused || isTileRootFocused) {
				event.preventDefault();
				openTileCreationSheet();
			}
			return;
		}

		if (event.key === 'Delete' && mode === 'edit' && focusedTileId) {
			if (isViewportFocused || isTileRootFocused) {
				event.preventDefault();
				removeConfirmTileId = focusedTileId;
			}
			return;
		}

		if (
			(event.key === ' ' || event.key === 'Space' || event.key === 'Spacebar') &&
			mode === 'edit' &&
			focusedTileId
		) {
			if (isTileRootFocused) {
				event.preventDefault();
				startKeyboardTileMove(focusedTileId);
			}
			return;
		}

		if (event.key === 'Enter' && focusedTileId && isTileRootFocused) {
			event.preventDefault();
			focusTileInteractiveContent(focusedTileId);
		}
	}

	function openTileMenu(tileId: string, buttonEl: HTMLElement | null): void {
		selectedTileId = tileId;
		tileMenuTileId = tileId;
		tileMenuButtonEl = buttonEl;
	}

	function closeTileMenu(): void {
		tileMenuTileId = null;
	}

	function duplicateTile(tileId: string): void {
		if (!activeBoard) return;
		const tile = activeBoard.tiles.find((entry) => entry.id === tileId);
		if (!tile) return;
		const nextTile: SessionBoardTile = {
			...tile,
			id: nanoid(10),
			x: Math.min(Math.max(0, tile.x + 1), Math.max(0, layout.columns - tile.w)),
			y: Math.max(0, tile.y + 1),
		};
		void sessionBoardsState.updateBoard(activeBoard.id, {
			tiles: [...activeBoard.tiles, nextTile],
		});
		selectedTileId = nextTile.id;
	}

	function openResizeMode(tileId: string): void {
		if (!activeBoard) return;
		const tile = activeBoard.tiles.find((entry) => entry.id === tileId);
		if (!tile) return;
		resizeModeTileId = tileId;
		resizeDraftSize = { w: tile.w, h: tile.h };
		resizeAnnouncement = `Tile size: ${tile.w} wide, ${tile.h} tall.`;
		closeTileMenu();
	}

	function applyResize(tileId: string, width: number, height: number): void {
		if (!activeBoard) return;
		const tile = activeBoard.tiles.find((entry) => entry.id === tileId);
		if (!tile) return;
		const nextWidth = Math.min(layout.columns - tile.x, Math.max(2, width));
		const nextHeight = Math.max(1, Math.min(8, height));
		resizeDraftSize = { w: nextWidth, h: nextHeight };
		resizeAnnouncement = `Tile size: ${nextWidth} wide, ${nextHeight} tall.`;
	}

	function saveResizeMode(): void {
		if (!activeBoard || !resizeModeTileId || !resizeDraftSize) return;
		void sessionBoardsState.updateTile(activeBoard.id, resizeModeTileId, {
			w: resizeDraftSize.w,
			h: resizeDraftSize.h,
		});
		resizeModeTileId = null;
		resizeDraftSize = null;
	}

	function cancelResizeMode(): void {
		resizeModeTileId = null;
		resizeDraftSize = null;
	}

	function startResizeDrag(tileId: string, event: PointerEvent): void {
		if (mode !== 'edit' || !activeBoard || event.button !== 0) return;
		const tile = activeBoard.tiles.find((entry) => entry.id === tileId);
		if (!tile) return;
		event.preventDefault();
		event.stopPropagation();
		selectedTileId = tileId;
		resizeDrag = {
			tileId,
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			startW: tile.w,
			startH: tile.h,
			dragged: false,
		};
		resizeDraftSize = { w: tile.w, h: tile.h };
	}

	function assignNoteToTile(tileId: string, noteId: NoteId): void {
		if (!activeBoard) return;
		void sessionBoardsState.updateTile(activeBoard.id, tileId, { noteId });
		noteAssignTileId = null;
		noteAssignQuery = '';
	}

	function clearTileNote(tileId: string): void {
		if (!activeBoard) return;
		void sessionBoardsState.updateTile(activeBoard.id, tileId, { noteId: undefined });
	}

	function setTileDepth(tileId: string, previewDepth: 'title' | 'summary' | 'full'): void {
		if (!activeBoard) return;
		void sessionBoardsState.updateTile(activeBoard.id, tileId, { previewDepth });
		closeTileMenu();
	}

	function handleTileMenuKeydown(event: KeyboardEvent): void {
		const menu = event.currentTarget as HTMLElement | null;
		if (!menu) return;
		const menuItems = [...menu.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')];
		if (menuItems.length === 0) return;
		const currentIndex = menuItems.findIndex((item) => item === document.activeElement);
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			const next = menuItems[(currentIndex + 1 + menuItems.length) % menuItems.length]!;
			next.focus();
			return;
		}
		if (event.key === 'ArrowUp') {
			event.preventDefault();
			const next = menuItems[(currentIndex - 1 + menuItems.length) % menuItems.length]!;
			next.focus();
			return;
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			closeTileMenu();
			tileMenuButtonEl?.focus();
		}
	}

	function startTileDrag(
		tileId: string,
		event: PointerEvent,
		options?: { ignoreInteractiveTarget?: boolean },
	): void {
		if (mode !== 'edit' || !activeBoard || event.button !== 0) return;
		const target = event.target as HTMLElement;
		if (!options?.ignoreInteractiveTarget && target.closest('a,button,input,textarea,select,label'))
			return;
		event.preventDefault();
		event.stopPropagation();
		const tile = activeBoard.tiles.find((t) => t.id === tileId);
		if (!tile) return;
		const p = draftPositions[tile.id] ?? { x: tile.x, y: tile.y };
		drag = {
			tileId,
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			originX: p.x,
			originY: p.y,
		};
	}

	function startPan(event: PointerEvent): void {
		if (!boardViewportEl) return;
		const isMiddleMouse = event.pointerType === 'mouse' && event.button === 1;
		if (!isMiddleMouse) return;
		event.preventDefault();
		pan = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			scrollLeft: boardViewportEl.scrollLeft,
			scrollTop: boardViewportEl.scrollTop,
			moved: false,
		};
	}

	function handleBoardSelectChange(event: Event): void {
		const boardId = (event.currentTarget as HTMLSelectElement).value;
		if (!boardId) return;
		sessionBoardsState.setActiveBoard(boardId as SessionBoard['id']);
	}

	async function refreshSessionPrep(boardId: string | null): Promise<void> {
		if (mode !== 'view' || sessionModeState.mode !== 'idle') return;
		sessionPrepLoading = true;
		sessionPrepError = null;
		try {
			sessionPrep = await loadSessionPrepViewModel({ boardId });
		} catch (error) {
			sessionPrepError = String(error);
		} finally {
			sessionPrepLoading = false;
		}
	}

	function openSessionPrepNote(noteId: string): void {
		void goto(resolve(`/knowledge/notes/${noteId}`), { state: { label: 'Session prep' } });
	}

	function onNumberChange(event: Event, fallback: number, cb: (v: number) => void): void {
		const v = Number((event.currentTarget as HTMLInputElement).value);
		cb(Number.isFinite(v) ? v : fallback);
	}

	function handleOverlayClick(event: MouseEvent): void {
		const link = (event.target as HTMLElement).closest('a');
		const href = link?.getAttribute('href');
		if (!href?.startsWith('/')) return;
		event.preventDefault();
		overlayNoteId = null;
		void goto(href);
	}

	$effect(() => {
		if (!overlayContentEl) return;
		overlayContentEl.addEventListener('click', handleOverlayClick);
		return () => overlayContentEl?.removeEventListener('click', handleOverlayClick);
	});

	$effect(() => {
		if (!tileMenuTileId) return;
		requestAnimationFrame(() => {
			const firstItem = document.querySelector<HTMLButtonElement>('button[role="menuitem"]');
			firstItem?.focus();
		});
	});

	$effect(() => {
		if (!resizeModeTileId) return;
		function onKeydown(event: KeyboardEvent): void {
			if (!activeBoard || !resizeModeTileId) return;
			const tile = activeBoard.tiles.find((entry) => entry.id === resizeModeTileId);
			if (!tile) return;
			if (event.key === 'Escape') {
				event.preventDefault();
				cancelResizeMode();
				return;
			}
			if (event.key === 'Enter') {
				event.preventDefault();
				saveResizeMode();
				return;
			}
			const source = resizeDraftSize ?? { w: tile.w, h: tile.h };
			if (event.key === 'ArrowLeft') {
				event.preventDefault();
				applyResize(tile.id, source.w - 1, source.h);
				return;
			}
			if (event.key === 'ArrowRight') {
				event.preventDefault();
				applyResize(tile.id, source.w + 1, source.h);
				return;
			}
			if (event.key === 'ArrowUp') {
				event.preventDefault();
				applyResize(tile.id, source.w, source.h - 1);
				return;
			}
			if (event.key === 'ArrowDown') {
				event.preventDefault();
				applyResize(tile.id, source.w, source.h + 1);
			}
		}
		window.addEventListener('keydown', onKeydown);
		return () => window.removeEventListener('keydown', onKeydown);
	});

	$effect(() => {
		return () => {
			for (const timer of Object.values(overflowFlashTimers)) {
				window.clearTimeout(timer);
			}
			overflowFlashTimers = {};
		};
	});
</script>

<section aria-label="Session board" class="h-full min-h-0 box-border overflow-hidden p-4">
	<h1 class="sr-only">Session Board</h1>
	<div
		class="grid h-full min-h-0 gap-4 overflow-hidden {mode === 'edit' && !isBoardSessionActive
			? 'xl:grid-cols-[330px_minmax(0,1fr)]'
			: 'grid-cols-1'}"
	>
		{#if mode === 'edit' && !isBoardSessionActive}
			<aside
				class="h-full min-h-0 rounded-xl border border-border-strong/60 bg-surface/98 shadow-sm overflow-hidden flex flex-col"
			>
				<div class="px-4 py-3 border-b border-border">
					<h2 class="text-xl font-bold text-ink" style="font-family: var(--font-serif)">
						Session Board
					</h2>
					<p class="text-xs text-ink-muted mt-1">
						Keep your most useful session notes in one quickly readable workspace.
					</p>
				</div>

				<div class="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
					<section class="rounded-lg border border-border bg-surface p-3">
						<h2 class="text-sm font-semibold text-ink mb-2">Create Board</h2>
						<input
							type="text"
							bind:value={newBoardName}
							class="w-full mb-2 px-2.5 py-1.5 rounded-md border border-border bg-surface-alt text-sm"
							placeholder="Board name"
						/>
						<textarea
							bind:value={newBoardDescription}
							rows="2"
							class="w-full mb-2 px-2.5 py-1.5 rounded-md border border-border bg-surface-alt text-sm"
							placeholder="Short purpose"
						></textarea>
						<label class="block text-xs text-ink-muted mb-2">
							Template
							<select
								bind:value={createTemplateId}
								class="mt-1 w-full px-2.5 py-1.5 rounded-md border border-border bg-surface-alt text-sm"
							>
								<option value="">Blank board</option>
								{#each boardTemplates as template (template.id)}
									<option value={template.id}>{template.name}</option>
								{/each}
							</select>
						</label>
						<button
							class="w-full px-3 py-1.5 rounded-md bg-accent hover:bg-accent-hover text-white text-sm transition-colors"
							onclick={createBoard}>Create Session Board</button
						>
					</section>

					<section class="rounded-lg border border-border bg-surface p-3">
						<h2 class="text-sm font-semibold text-ink mb-2">Boards</h2>
						<div class="space-y-1 max-h-56 overflow-y-auto pr-1">
							{#if sessionBoardsState.boards.length === 0}
								<EmptyState
									class="min-h-0 px-0 py-1"
									illustration="session"
									headline="Your sessions start here"
									body="Create a session board to begin organizing live-play controls."
									primaryAction={{ label: 'Start a session', onclick: startSessionFromEmptyState }}
									secondaryAction={{
										label: 'Learn about session boards',
										onclick: learnAboutSessionBoardsFromEmptyState,
									}}
								/>
							{:else}
								{#each sessionBoardsState.boards as board (board.id)}
									<button
										class="w-full text-left px-2.5 py-1.5 rounded-md border text-sm transition-colors {activeBoard?.id ===
										board.id
											? 'border-accent/45 bg-accent-subtle text-ink'
											: 'border-border/45 text-ink-muted hover:text-ink hover:bg-surface-alt/70'}"
										onclick={() => sessionBoardsState.setActiveBoard(board.id)}
									>
										<div class="truncate">{board.name}</div>
										<div class="text-xs opacity-70">{board.tiles.length} tiles</div>
									</button>
								{/each}
							{/if}
						</div>
					</section>

					<section class="rounded-lg border border-border bg-surface p-3 space-y-2">
						<h2 class="text-sm font-semibold text-ink">Board Templates</h2>
						<p class="text-xs text-ink-muted">
							Use built-in layouts for common scenes or save your own reusable board setup.
						</p>
						{#if activeBoard}
							<label class="block text-xs text-ink-muted">
								Apply template
								<select
									bind:value={applyTemplateId}
									class="mt-1 w-full px-2.5 py-1.5 rounded-md border border-border bg-surface-alt text-sm"
								>
									<option value="">Select template</option>
									{#each boardTemplates as template (template.id)}
										<option value={template.id}>{template.name}</option>
									{/each}
								</select>
							</label>
							<button
								class="w-full px-2.5 py-1.5 rounded-md border border-border text-xs hover:bg-surface-alt transition-colors disabled:opacity-60"
								onclick={applyTemplate}
								disabled={!applyTemplateId}
							>
								Apply Template To Current Board
							</button>

							<div class="pt-2 border-t border-border/70 space-y-2">
								<input
									type="text"
									bind:value={saveTemplateName}
									class="w-full px-2.5 py-1.5 rounded-md border border-border bg-surface-alt text-sm"
									placeholder="Template name"
								/>
								<textarea
									bind:value={saveTemplateDescription}
									rows="2"
									class="w-full px-2.5 py-1.5 rounded-md border border-border bg-surface-alt text-sm"
									placeholder="Template description"
								></textarea>
								<button
									class="w-full px-2.5 py-1.5 rounded-md border border-border text-xs hover:bg-surface-alt transition-colors"
									onclick={saveCurrentLayoutAsTemplate}
								>
									Save Current Layout As Template
								</button>
							</div>
						{/if}

						<div class="max-h-36 overflow-y-auto pr-1 space-y-1">
							{#if boardTemplates.length === 0}
								<p class="text-xs text-ink-faint">No templates available.</p>
							{:else}
								{#each boardTemplates as template (template.id)}
									<div class="rounded border border-border/60 px-2 py-1.5">
										<div class="flex items-center justify-between gap-2">
											<div class="truncate text-xs font-medium text-ink">
												{template.name}
											</div>
											{#if !template.builtIn}
												<button
													class="text-xs px-1.5 py-0.5 rounded border border-error/40 text-error hover:bg-error/5 transition-colors"
													onclick={() => void deleteTemplate(template.id)}
												>
													Delete
												</button>
											{/if}
										</div>
										<div class="text-xs text-ink-faint truncate">
											{template.description || `${template.tiles.length} tiles`}
										</div>
									</div>
								{/each}
							{/if}
						</div>
					</section>

					{#if activeBoard}
						<section class="rounded-lg border border-border bg-surface p-3 space-y-2">
							<h2 class="text-sm font-semibold text-ink">Add Tiles and Notes</h2>
							<button
								class="w-full px-2.5 py-1.5 rounded-md border border-border bg-surface-alt text-xs text-ink hover:bg-surface transition-colors"
								onclick={addCalendarTile}
							>
								Add Calendar Tile
							</button>
							<button
								class="w-full px-2.5 py-1.5 rounded-md border border-border bg-surface-alt text-xs text-ink hover:bg-surface transition-colors"
								onclick={addTimerTile}
							>
								Add Timer Tile
							</button>
							<button
								class="w-full px-2.5 py-1.5 rounded-md border border-border bg-surface-alt text-xs text-ink hover:bg-surface transition-colors"
								onclick={addCombatTile}
							>
								Add Combat Tracker Tile
							</button>
							<button
								class="w-full px-2.5 py-1.5 rounded-md border border-border bg-surface-alt text-xs text-ink hover:bg-surface transition-colors"
								onclick={addEncounterTile}
							>
								Add Encounter Builder Tile
							</button>
							<button
								class="w-full px-2.5 py-1.5 rounded-md border border-border bg-surface-alt text-xs text-ink hover:bg-surface transition-colors"
								onclick={addDiceTile}
							>
								Add Dice Tray Tile
							</button>
							<button
								class="w-full px-2.5 py-1.5 rounded-md border border-border bg-surface-alt text-xs text-ink hover:bg-surface transition-colors"
								onclick={addGeneratorTile}
							>
								Add Generator Tile
							</button>
							<button
								class="w-full px-2.5 py-1.5 rounded-md border border-border bg-surface-alt text-xs text-ink hover:bg-surface transition-colors"
								onclick={addHandoutTile}
							>
								Add Handout Library Tile
							</button>
							<input
								type="text"
								bind:value={noteQuery}
								class="w-full px-2.5 py-1.5 rounded-md border border-border bg-surface-alt text-sm"
								placeholder="Search notes (titles first, tags second)"
							/>
							<div class="space-y-1 max-h-44 overflow-y-auto pr-1">
								{#if availableNotes.length === 0}
									<p class="text-xs text-ink-faint">No matching notes.</p>
								{:else}
									{#each availableNotes as note (note.id)}
										<button
											class="w-full text-left px-2 py-1.5 rounded-md text-sm border border-transparent hover:border-border hover:bg-surface-alt/70 transition-colors"
											onclick={() => addNote(note.id)}
										>
											<div class="truncate">{note.title}</div>
											{#if note.tags.length > 0}
												<div class="text-xs text-ink-faint truncate">
													#{note.tags.slice(0, 3).join(' #')}
												</div>
											{/if}
										</button>
									{/each}
								{/if}
							</div>
						</section>

						<section class="rounded-lg border border-border bg-surface p-3">
							<div class="flex items-center justify-between mb-2">
								<h2 class="text-sm font-semibold text-ink">Related Suggestions</h2>
								<button
									class="text-xs px-2 py-1 rounded border border-border hover:bg-surface-alt transition-colors"
									onclick={() => void sessionBoardsState.suggestForBoard(activeBoard.id, 10)}
									>Refresh</button
								>
							</div>
							<div class="space-y-1 max-h-44 overflow-y-auto pr-1">
								{#if sessionBoardsState.suggestionsLoading}
									<p class="text-xs text-ink-faint">Finding related notes...</p>
								{:else if sessionBoardsState.suggestions.length === 0}
									<p class="text-xs text-ink-faint">Add notes to get suggestions.</p>
								{:else}
									{#each sessionBoardsState.suggestions as suggestion (suggestion.noteId)}
										{@const note = activeNotesById.get(suggestion.noteId)}
										{#if note}
											<button
												class="w-full text-left px-2 py-1.5 rounded-md text-sm border border-transparent hover:border-border hover:bg-surface-alt/70 transition-colors"
												onclick={() => addNote(note.id)}
											>
												<div class="flex items-center justify-between gap-2">
													<span class="truncate">{note.title}</span>
													<span class="text-xs">score {suggestion.score}</span>
												</div>
											</button>
										{/if}
									{/each}
								{/if}
							</div>
						</section>

						<section class="rounded-lg border border-border bg-surface p-3">
							<h2 class="text-sm font-semibold text-ink mb-2">Interaction</h2>
							<ul class="space-y-1 text-xs text-ink-muted">
								<li>Scroll vertically and horizontally to navigate the board.</li>
								<li>Middle-mouse drag pans the board without selecting tiles.</li>
								<li>
									Use <span class="font-mono">0 / 1 / 2</span> or
									<span class="font-mono">+ / -</span> for zoom presets.
								</li>
							</ul>
						</section>
					{/if}
				</div>
			</aside>
		{/if}

		<section
			class="h-full min-h-0 rounded-xl border border-border-strong/60 bg-surface/95 shadow-sm overflow-hidden flex flex-col"
		>
			{#if !activeBoard}
				{#if sessionBoardsState.boards.length === 0 && !sessionModeState.isActive}
					<EmptyState
						illustration="session"
						headline="Your sessions start here"
						body="Session boards are your live-play command center - scenes, NPCs, initiative, and handouts in one view."
						primaryAction={{ label: 'Start a session', onclick: startSessionFromEmptyState }}
						secondaryAction={{
							label: 'Learn about session boards',
							onclick: learnAboutSessionBoardsFromEmptyState,
						}}
					/>
				{:else if sessionBoardsState.boards.length === 0}
					<EmptyState
						illustration="session"
						headline="Your sessions start here"
						body="Create a session board to begin organizing live-play controls."
						primaryAction={{ label: 'Start a session', onclick: startSessionFromEmptyState }}
						secondaryAction={{
							label: 'Learn about session boards',
							onclick: learnAboutSessionBoardsFromEmptyState,
						}}
					/>
				{:else}
					<div class="h-full flex items-center justify-center text-center px-6">
						<div class="max-w-md">
							<p class="text-base font-semibold text-ink">Create or select a board to begin.</p>
							<p class="text-sm text-ink-muted mt-1">
								Session boards are designed for quick reference during sessions.
							</p>
							{#if mode === 'view'}
								<button
									class="mt-3 px-3 py-1.5 rounded-md text-sm border border-border hover:bg-surface-alt transition-colors"
									onclick={() => (mode = 'edit')}>Enter Edit Mode</button
								>
							{/if}
						</div>
					</div>
				{/if}
			{:else}
				<div
					class="shrink-0 border-b border-border bg-surface/97 backdrop-blur px-3 py-3 {mode ===
					'edit'
						? 'space-y-3'
						: ''}"
				>
					{#if mode === 'edit'}
						<div class="flex flex-wrap items-start gap-2">
							<input
								type="text"
								bind:value={boardNameDraft}
								class="min-w-[220px] flex-1 px-2.5 py-1.5 rounded-md border border-border bg-surface-alt text-sm"
							/>
							<input
								type="text"
								bind:value={boardDescriptionDraft}
								class="min-w-[220px] flex-[2] px-2.5 py-1.5 rounded-md border border-border bg-surface-alt text-sm"
								placeholder="Board description"
							/>
							<button
								class="px-3 py-1.5 rounded-md text-sm border border-border hover:bg-surface-alt transition-colors"
								onclick={saveBoard}>Save</button
							>
						</div>
					{/if}

					<div class="flex flex-wrap items-center gap-2">
						{#if mode === 'view'}
							<select
								aria-label="Select active session board"
								class="min-w-[220px] max-w-[420px] truncate px-2.5 py-1.5 rounded-md border border-border bg-surface-alt text-sm"
								value={activeBoard.id}
								onchange={handleBoardSelectChange}
							>
								{#each sessionBoardsState.boards as board (board.id)}
									<option value={board.id}>{board.name}</option>
								{/each}
							</select>
						{/if}
						{#if isBoardSessionActive}
							<span
								class="rounded-full border border-accent/45 bg-accent-subtle px-2.5 py-1 text-xs font-semibold text-accent"
							>
								Session Active
							</span>
						{:else}
							<div class="flex items-center gap-1">
								<button
									class="px-3 py-1.5 text-xs rounded border transition-colors {mode === 'view'
										? 'bg-accent text-white border-transparent'
										: 'border-border hover:bg-surface-alt'}"
									onclick={() => (mode = 'view')}>View</button
								>
								<button
									class="px-3 py-1.5 text-xs rounded border transition-colors {mode === 'edit'
										? 'bg-accent text-white border-transparent'
										: 'border-border hover:bg-surface-alt'}"
									onclick={() => (mode = 'edit')}>Edit</button
								>
							</div>
						{/if}
						{#if mode === 'edit'}
							<span class="text-xs text-ink-muted hidden lg:inline"
								>Edit mode: drag, resize, style, and position tiles.</span
							>
						{/if}

						{#if mode === 'edit'}
							<div class="ml-auto flex items-center gap-2">
								<Button size="sm" variant="secondary" icon="plus" onclick={openTileCreationSheet}
									>Add tile</Button
								>
								<div
									class="flex items-center gap-1 rounded-md border border-border bg-surface-alt/80 p-1"
								>
									<Button
										size="sm"
										variant={zoomPreset === 'fit' ? 'primary' : 'ghost'}
										onclick={() => applyZoomPreset('fit')}
										ariaPressed={zoomPreset === 'fit'}
									>
										Fit
									</Button>
									<Button
										size="sm"
										variant={zoomPreset === 'comfortable' ? 'primary' : 'ghost'}
										onclick={() => applyZoomPreset('comfortable')}
										ariaPressed={zoomPreset === 'comfortable'}
									>
										Comfortable
									</Button>
									<Button
										size="sm"
										variant={zoomPreset === 'detail' ? 'primary' : 'ghost'}
										onclick={() => applyZoomPreset('detail')}
										ariaPressed={zoomPreset === 'detail'}
									>
										Detail
									</Button>
								</div>
								<span class="min-w-12 text-right text-xs font-semibold text-ink"
									>{zoomPercent}%</span
								>
							</div>
						{/if}
					</div>

					{#if showOverflowBanner}
						<div
							class="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-amber-600/35 bg-amber-500/10 px-3 py-2 text-xs text-ink"
						>
							<span>
								Some tiles extend beyond the visible board width. Drag them back or reduce their
								width.
							</span>
							<Button size="sm" variant="secondary" onclick={() => void fixOverflowLayout()}
								>Fix layout</Button
							>
							<Button
								size="sm"
								variant="ghost"
								icon="x"
								ariaLabel="Dismiss overflow warning"
								onclick={() => {
									overflowBannerDismissedBoardVersion = boardEditVersion;
								}}
							/>
						</div>
					{/if}

					{#if mode === 'view' && sessionModeState.mode === 'idle'}
						<div class="mt-3">
							<SessionPrepPanel
								prep={sessionPrep}
								loading={sessionPrepLoading}
								error={sessionPrepError}
								onopennote={openSessionPrepNote}
								onrefresh={() =>
									void refreshSessionPrep(activeBoard ? String(activeBoard.id) : null)}
							/>
						</div>
					{/if}

					{#if mode === 'edit'}
						<details class="rounded-md border border-border bg-surface-alt/60 p-2.5">
							<summary class="cursor-pointer list-none select-none text-xs font-semibold text-ink">
								Advanced board and tile options
							</summary>
							<div class="mt-2 space-y-2">
								<div class="grid gap-2 md:grid-cols-4">
									<label class="text-xs"
										>Columns<input
											type="number"
											min="8"
											max="32"
											value={layout.columns}
											onchange={(e) =>
												onNumberChange(e, layout.columns, (v) => void updateLayout({ columns: v }))}
											class="mt-1 w-full px-2 py-1 rounded border border-border bg-surface"
										/></label
									>
									<label class="text-xs"
										>Row Height<input
											type="number"
											min="70"
											max="220"
											value={layout.rowHeight}
											onchange={(e) =>
												onNumberChange(
													e,
													layout.rowHeight,
													(v) => void updateLayout({ rowHeight: v }),
												)}
											class="mt-1 w-full px-2 py-1 rounded border border-border bg-surface"
										/></label
									>
									<label class="text-xs"
										>Min Rows<input
											type="number"
											min="6"
											max="240"
											value={layout.minRows}
											onchange={(e) =>
												onNumberChange(e, layout.minRows, (v) => void updateLayout({ minRows: v }))}
											class="mt-1 w-full px-2 py-1 rounded border border-border bg-surface"
										/></label
									>
									<label class="text-xs"
										>Gap<input
											type="number"
											min="0"
											max="28"
											value={layout.gap}
											onchange={(e) =>
												onNumberChange(e, layout.gap, (v) => void updateLayout({ gap: v }))}
											class="mt-1 w-full px-2 py-1 rounded border border-border bg-surface"
										/></label
									>
								</div>

								<div class="grid gap-2 md:grid-cols-4">
									<label class="text-xs"
										>Board Color<input
											type="color"
											value={activeBoard.style?.backgroundColor ?? '#f5f5f5'}
											onchange={(e) =>
												void updateStyle({
													backgroundColor: (e.currentTarget as HTMLInputElement).value,
												})}
											class="mt-1 h-9 w-full rounded border border-border"
										/></label
									>
									<label class="text-xs"
										>Pattern<select
											value={activeBoard.style?.backgroundPattern ?? 'none'}
											onchange={(e) =>
												void updateStyle({
													backgroundPattern: (e.currentTarget as HTMLSelectElement).value as
														| 'none'
														| 'grid'
														| 'dots',
												})}
											class="mt-1 h-9 w-full rounded border border-border px-2 bg-surface"
											><option value="none">None</option><option value="grid">Grid</option><option
												value="dots">Dots</option
											></select
										></label
									>
									<label class="text-xs"
										>Section Tint<input
											type="color"
											value={activeBoard.style?.sectionTintColor ?? '#7c3aed'}
											onchange={(e) =>
												void updateStyle({
													sectionTintColor: (e.currentTarget as HTMLInputElement).value,
												})}
											class="mt-1 h-9 w-full rounded border border-border"
										/></label
									>
									<label class="text-xs"
										>Section Opacity<input
											type="range"
											min="0"
											max="0.75"
											step="0.05"
											value={activeBoard.style?.sectionTintOpacity ?? 0}
											oninput={(e) =>
												void updateStyle({
													sectionTintOpacity: Number((e.currentTarget as HTMLInputElement).value),
												})}
											class="mt-2 w-full"
										/></label
									>
								</div>

								<div class="rounded border border-border bg-surface p-2">
									{#if selectedTile}
										<div class="grid gap-2 md:grid-cols-4 xl:grid-cols-8">
											<label class="text-xs"
												>X<input
													type="number"
													value={selectedTile.x}
													onchange={(e) =>
														onNumberChange(e, selectedTile.x, (v) => void updateSelected({ x: v }))}
													class="mt-1 w-full px-2 py-1 rounded border border-border"
												/></label
											>
											<label class="text-xs"
												>Y<input
													type="number"
													value={selectedTile.y}
													onchange={(e) =>
														onNumberChange(e, selectedTile.y, (v) => void updateSelected({ y: v }))}
													class="mt-1 w-full px-2 py-1 rounded border border-border"
												/></label
											>
											<label class="text-xs"
												>W<input
													type="number"
													min="2"
													max={layout.columns}
													value={selectedTile.w}
													onchange={(e) =>
														onNumberChange(e, selectedTile.w, (v) => void updateSelected({ w: v }))}
													class="mt-1 w-full px-2 py-1 rounded border border-border"
												/></label
											>
											<label class="text-xs"
												>H<input
													type="number"
													min="1"
													max="8"
													value={selectedTile.h}
													onchange={(e) =>
														onNumberChange(e, selectedTile.h, (v) => void updateSelected({ h: v }))}
													class="mt-1 w-full px-2 py-1 rounded border border-border"
												/></label
											>
											{#if selectedNoteTile}
												<label class="text-xs"
													>Preview<select
														value={selectedNoteTile.previewDepth ?? 'summary'}
														onchange={(e) =>
															void updateSelected({
																previewDepth: (e.currentTarget as HTMLSelectElement).value as
																	| 'title'
																	| 'summary'
																	| 'full',
															})}
														class="mt-1 h-9 w-full rounded border border-border px-2 bg-surface"
														><option value="title">Title only</option><option value="summary"
															>Summary</option
														><option value="full">Full</option></select
													></label
												>
											{/if}
											<label class="text-xs"
												>Tile Bg<input
													type="color"
													value={selectedTile.style?.backgroundColor ?? '#ffffff'}
													onchange={(e) =>
														void updateSelected({
															style: {
																...(selectedTile.style ?? {}),
																backgroundColor: (e.currentTarget as HTMLInputElement).value,
															},
														})}
													class="mt-1 h-9 w-full rounded border border-border"
												/></label
											>
											<label class="text-xs"
												>Border<input
													type="color"
													value={selectedTile.style?.borderColor ?? '#7f8c8d'}
													onchange={(e) =>
														void updateSelected({
															style: {
																...(selectedTile.style ?? {}),
																borderColor: (e.currentTarget as HTMLInputElement).value,
															},
														})}
													class="mt-1 h-9 w-full rounded border border-border"
												/></label
											>
											<label class="text-xs"
												>Width<input
													type="number"
													min="0"
													max="8"
													value={selectedTile.style?.borderWidth ?? 1}
													onchange={(e) =>
														onNumberChange(
															e,
															selectedTile.style?.borderWidth ?? 1,
															(v) =>
																void updateSelected({
																	style: { ...(selectedTile.style ?? {}), borderWidth: v },
																}),
														)}
													class="mt-1 w-full px-2 py-1 rounded border border-border"
												/></label
											>
											<label class="text-xs"
												>Scale<input
													type="number"
													min="0.5"
													max="2.5"
													step="0.05"
													value={selectedTile.style?.scale ?? 1}
													onchange={(e) =>
														onNumberChange(
															e,
															selectedTile.style?.scale ?? 1,
															(v) =>
																void updateSelected({
																	style: { ...(selectedTile.style ?? {}), scale: v },
																}),
														)}
													class="mt-1 w-full px-2 py-1 rounded border border-border"
												/></label
											>
											<button
												class="h-9 mt-5 px-2 rounded border border-error/40 text-error hover:bg-error/5 transition-colors"
												onclick={() => void removeTile(selectedTile.id)}>Remove Tile</button
											>
										</div>
									{:else}
										<p class="text-xs text-ink-faint">Select a tile to edit it.</p>
									{/if}
								</div>
							</div>
						</details>
					{/if}
				</div>

				{#if mode === 'view'}
					<SessionMissionControl
						board={activeBoard}
						active={isBoardSessionActive}
						onrequestedit={() => (mode = 'edit')}
					/>
				{:else if renderedTiles.length === 0}
					<div class="h-full flex items-center justify-center text-sm text-ink-muted">
						{mode === 'edit'
							? 'Add notes from the left panel to populate this board.'
							: 'This board has no tiles yet.'}
					</div>
				{:else}
					<div class="flex-1 min-h-0 p-3">
						<div
							class="h-full min-h-0 rounded-lg border border-border/70 bg-surface-alt/70 overflow-hidden flex flex-col"
						>
							{#if mode === 'edit'}
								<div
									class="px-3 py-2 border-b border-border/80 text-xs text-ink-muted flex items-center justify-between gap-2"
								>
									<span>Scroll to navigate. Middle-mouse drag pans quickly.</span>
									<span class="hidden md:inline">Use 0/1/2 or +/- for zoom presets.</span>
								</div>
							{/if}
							<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
							<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
							<div
								class="relative flex-1 min-h-0 overflow-auto"
								role="application"
								aria-label="Session board canvas"
								onpointerdown={startPan}
								onfocusin={handleViewportFocusIn}
								onkeydown={handleViewportKeydown}
								bind:this={boardViewportEl}
								tabindex="0"
							>
								<div
									class="relative m-3"
									style="width: {canvas.width * zoom}px; height: {canvas.height * zoom}px;"
								>
									<div
										class="absolute left-0 top-0 origin-top-left"
										style="width: {canvas.width}px; height: {canvas.height}px; transform: scale({zoom}); background-color: {activeBoard
											.style?.backgroundColor ?? ''};"
									>
										<div
											class="absolute inset-0 pointer-events-none"
											style={patternStyle(activeBoard)}
										></div>
										{#each renderedTiles as entry (entry.tile.id)}
											{@const tile = entry.tile}
											<div
												class="absolute group"
												style={tileStyle(tile, entry.x, entry.y)}
												data-board-tile-id={tile.id}
											>
												{#if keyboardFocusedTileId === tile.id}
													<div
														class="pointer-events-none absolute inset-0 z-40 rounded-lg border-2"
														style="border-color: var(--color-focus-ring);"
													></div>
												{/if}
												{#if overflowFlashTileIds[tile.id]}
													<div
														class="pointer-events-none absolute inset-0 z-40 rounded-lg border-2 border-error"
													></div>
												{/if}
												{#if mode === 'edit'}
													<div class="pointer-events-none absolute right-2 top-2 z-40">
														<button
															type="button"
															class="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface/95 text-ink-muted shadow-sm transition-opacity hover:bg-surface-alt md:opacity-0 md:group-hover:opacity-100"
															aria-label={`Tile options for ${tileLabel(tile)}`}
															aria-haspopup="menu"
															aria-expanded={tileMenuTileId === tile.id}
															onclick={(event) =>
																openTileMenu(tile.id, event.currentTarget as HTMLElement)}
														>
															<Icon name="ellipsis" size="sm" />
														</button>
													</div>
													<button
														type="button"
														class="absolute bottom-2 right-2 z-40 inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface/95 text-ink-faint shadow-sm hover:bg-surface-alt"
														aria-label={`Resize ${tileLabel(tile)}`}
														onpointerdown={(event) => startResizeDrag(tile.id, event)}
													>
														<Icon name="x" size="sm" />
													</button>
												{/if}
												{#if resizeModeTileId === tile.id}
													<div
														class="pointer-events-none absolute inset-0 z-30 rounded-lg border-2 border-dashed"
														style={tileAccentStyle(tile)}
													></div>
												{/if}
												{#if entry.kind === 'note' && entry.note}
													{@const note = entry.note}
													<SessionBoardTileCard
														{tile}
														{note}
														selected={mode === 'edit' && selectedTileId === tile.id}
														editable={mode === 'edit'}
														showDepthBadge={mode === 'edit'}
														scrollable={selectedTileId === tile.id}
														tintColor={activeBoard.style?.sectionTintColor ?? '#7c3aed'}
														tintOpacity={activeBoard.style?.sectionTintOpacity ?? 0}
														onopen={() => (overlayNoteId = note.id)}
														onselect={() => {
															if (mode === 'edit') selectedTileId = tile.id;
															else overlayNoteId = note.id;
														}}
														ondragstart={(event) => startTileDrag(tile.id, event)}
													/>
												{:else if entry.kind === 'timer'}
													<SessionBoardTimerTile
														tile={entry.tile}
														selected={mode === 'edit' && selectedTileId === tile.id}
														editable={mode === 'edit'}
														onselect={() => {
															if (mode === 'edit') selectedTileId = tile.id;
														}}
														onupdate={(timer) => {
															if (!activeBoard) return;
															void sessionBoardsState.updateTile(activeBoard.id, tile.id, {
																timer,
															});
														}}
														ondragstart={(event) => startTileDrag(tile.id, event)}
													/>
												{:else if entry.kind === 'combat'}
													<CombatTrackerTile
														tile={entry.tile}
														selected={mode === 'edit' && selectedTileId === tile.id}
														editable={mode === 'edit'}
														onselect={() => {
															if (mode === 'edit') selectedTileId = tile.id;
														}}
														onupdate={(combat) => {
															if (!activeBoard) return;
															void sessionBoardsState.updateTile(activeBoard.id, tile.id, {
																combat,
															});
														}}
														ondragstart={(event) => startTileDrag(tile.id, event)}
													/>
												{:else if entry.kind === 'encounter'}
													<EncounterBuilderTile
														tile={entry.tile}
														selected={mode === 'edit' && selectedTileId === tile.id}
														editable={mode === 'edit'}
														onselect={() => {
															if (mode === 'edit') selectedTileId = tile.id;
														}}
														onupdate={(encounter) => {
															if (!activeBoard) return;
															void sessionBoardsState.updateTile(activeBoard.id, tile.id, {
																encounter,
															});
														}}
														ondragstart={(event) => startTileDrag(tile.id, event)}
													/>
												{:else if entry.kind === 'dice'}
													<DiceTrayTile
														tile={entry.tile}
														selected={mode === 'edit' && selectedTileId === tile.id}
														editable={mode === 'edit'}
														onselect={() => {
															if (mode === 'edit') selectedTileId = tile.id;
														}}
														ondragstart={(event) => startTileDrag(tile.id, event)}
													/>
												{:else if entry.kind === 'generator'}
													<GeneratorTile
														tile={entry.tile}
														selected={mode === 'edit' && selectedTileId === tile.id}
														editable={mode === 'edit'}
														onselect={() => {
															if (mode === 'edit') selectedTileId = tile.id;
														}}
														ondragstart={(event: PointerEvent) => startTileDrag(tile.id, event)}
													/>
												{:else if entry.kind === 'handouts'}
													<HandoutLibraryTile
														tile={entry.tile}
														selected={mode === 'edit' && selectedTileId === tile.id}
														editable={mode === 'edit'}
														onselect={() => {
															if (mode === 'edit') selectedTileId = tile.id;
														}}
														ondragstart={(event) => startTileDrag(tile.id, event)}
													/>
												{:else if entry.kind === 'note_slot'}
													<div
														class="relative h-full rounded-lg border border-dashed border-border bg-surface/90 flex flex-col"
														style="--tile-accent: var({TILE_TYPE_METADATA.note.colorToken});"
														role="button"
														tabindex="0"
														aria-label={`Session board tile: ${tileLabel(tile)}`}
														aria-pressed={mode === 'edit' && selectedTileId === tile.id}
														data-board-tile="true"
														onfocus={() => {
															keyboardFocusedTileId = tile.id;
														}}
														onclick={(event) => {
															const target = event.target as HTMLElement;
															if (target.closest('a,button,input,textarea,select,label')) return;
															if (mode === 'edit') selectedTileId = tile.id;
														}}
														onkeydown={(event) => {
															if (event.key !== 'Enter' && event.key !== ' ') return;
															event.preventDefault();
															if (mode === 'edit') selectedTileId = tile.id;
														}}
													>
														{#if mode === 'edit'}
															<button
																type="button"
																class="absolute inset-0 z-10 cursor-move bg-transparent"
																aria-label="Drag note slot tile"
																onpointerdown={(event) => {
																	selectedTileId = tile.id;
																	startTileDrag(tile.id, event, {
																		ignoreInteractiveTarget: true,
																	});
																}}
															></button>
														{/if}
														<header
															class="h-8 border-b border-border border-l-4 px-2.5 pr-3 flex items-center gap-2"
															style="border-left-color: var(--tile-accent);"
														>
															<Icon
																name={TILE_TYPE_METADATA.note.iconName}
																size="sm"
																color="var(--tile-accent)"
															/>
															<div class="font-semibold text-sm text-ink">
																{TILE_TYPE_METADATA.note.label}
															</div>
														</header>
														<div
															class="relative z-20 h-full flex flex-col justify-center gap-2 text-center p-3"
														>
															<div class="text-xs font-semibold text-ink">Empty note slot</div>
															<div class="text-xs text-ink-muted">
																Use Add Notes to assign a note to this tile.
															</div>
														</div>
													</div>
												{:else}
													<div
														class="relative h-full rounded-lg border border-border bg-surface flex flex-col"
														style="--tile-accent: var({TILE_TYPE_METADATA.calendar.colorToken});"
														role="button"
														tabindex="0"
														aria-label={`Session board tile: ${tileLabel(tile)}`}
														aria-pressed={mode === 'edit' && selectedTileId === tile.id}
														data-board-tile="true"
														onfocus={() => {
															keyboardFocusedTileId = tile.id;
														}}
														onclick={(event) => {
															const target = event.target as HTMLElement;
															if (target.closest('a,button,input,textarea,select,label')) return;
															if (mode === 'edit') selectedTileId = tile.id;
														}}
														onkeydown={(event) => {
															if (event.key !== 'Enter' && event.key !== ' ') return;
															event.preventDefault();
															if (mode === 'edit') selectedTileId = tile.id;
														}}
													>
														{#if mode === 'edit'}
															<button
																type="button"
																class="absolute inset-0 z-10 cursor-move bg-transparent"
																aria-label="Drag calendar tile"
																onpointerdown={(event) => {
																	selectedTileId = tile.id;
																	startTileDrag(tile.id, event, {
																		ignoreInteractiveTarget: true,
																	});
																}}
															></button>
														{/if}
														<header
															class="h-8 border-b border-border border-l-4 px-2.5 pr-3 flex items-center gap-2"
															style="border-left-color: var(--tile-accent);"
														>
															<Icon
																name={TILE_TYPE_METADATA.calendar.iconName}
																size="sm"
																color="var(--tile-accent)"
															/>
															<div class="font-semibold text-sm text-ink">
																{TILE_TYPE_METADATA.calendar.label}
															</div>
														</header>
														<div class="flex-1 min-h-0 p-2">
															<WorldCalendarReference
																notes={notesState.activeNotes}
																title="Calendar Reference"
																collapsible={true}
															/>
														</div>
													</div>
												{/if}
											</div>
										{/each}
									</div>
								</div>
							</div>
						</div>
					</div>
				{/if}
			{/if}
		</section>
	</div>
</section>

<Sheet
	open={tileCreationSheetOpen}
	title="Add tile"
	onclose={() => (tileCreationSheetOpen = false)}
>
	<div class="space-y-3">
		<p class="text-xs text-ink-muted">
			Create a new tile and place it at the next open board position.
		</p>
		<div class="grid gap-2 sm:grid-cols-2">
			<Button
				variant="secondary"
				size="sm"
				icon="calendar"
				onclick={() => void addTileFromSheet('calendar')}>Calendar</Button
			>
			<Button
				variant="secondary"
				size="sm"
				icon="clock"
				onclick={() => void addTileFromSheet('timer')}>Timer</Button
			>
			<Button
				variant="secondary"
				size="sm"
				icon="swords"
				onclick={() => void addTileFromSheet('combat')}>Combat tracker</Button
			>
			<Button
				variant="secondary"
				size="sm"
				icon="shield"
				onclick={() => void addTileFromSheet('encounter')}>Encounter builder</Button
			>
			<Button
				variant="secondary"
				size="sm"
				icon="dice-5"
				onclick={() => void addTileFromSheet('dice')}>Dice tray</Button
			>
			<Button
				variant="secondary"
				size="sm"
				icon="wand-2"
				onclick={() => void addTileFromSheet('generator')}>Generator</Button
			>
			<Button
				variant="secondary"
				size="sm"
				icon="file-text"
				onclick={() => void addTileFromSheet('handouts')}>Handouts</Button
			>
		</div>
	</div>
</Sheet>

{#if tileMenuTile && tileMenuButtonEl}
	<Popover open={true} onclose={closeTileMenu} anchor={tileMenuButtonEl} class="min-w-64 p-1">
		<ul
			role="menu"
			aria-label={`Tile options for ${tileLabel(tileMenuTile)}`}
			class="space-y-1"
			onkeydown={handleTileMenuKeydown}
		>
			<li role="none">
				<button
					type="button"
					role="menuitem"
					class="w-full rounded px-2 py-1.5 text-left text-xs text-ink hover:bg-surface-alt"
					onclick={() => {
						startKeyboardTileMove(tileMenuTile.id);
						closeTileMenu();
					}}
				>
					Move tile
				</button>
			</li>
			<li role="none">
				<button
					type="button"
					role="menuitem"
					class="w-full rounded px-2 py-1.5 text-left text-xs text-ink hover:bg-surface-alt"
					onclick={() => openResizeMode(tileMenuTile.id)}
				>
					Resize tile
				</button>
			</li>
			<li role="none">
				<button
					type="button"
					role="menuitem"
					class="w-full rounded px-2 py-1.5 text-left text-xs text-ink hover:bg-surface-alt"
					onclick={() => {
						duplicateTile(tileMenuTile.id);
						closeTileMenu();
					}}
				>
					Duplicate tile
				</button>
			</li>
			<li role="none">
				<button
					type="button"
					role="menuitem"
					class="w-full rounded px-2 py-1.5 text-left text-xs text-error hover:bg-error/10"
					onclick={() => {
						removeConfirmTileId = tileMenuTile.id;
						closeTileMenu();
					}}
				>
					Remove tile
				</button>
			</li>
			{#if resolveSessionBoardTileType(tileMenuTile) === 'note'}
				<li role="none"><div class="my-1 border-t border-border/70"></div></li>
				<li role="none">
					<button
						type="button"
						role="menuitem"
						class="w-full rounded px-2 py-1.5 text-left text-xs text-ink hover:bg-surface-alt"
						onclick={() => {
							if (tileMenuTile.noteId)
								void goto(resolve(`/knowledge/notes/${tileMenuTile.noteId}`), {
									state: { label: tileLabel(tileMenuTile) },
								});
							closeTileMenu();
						}}
					>
						Open note
					</button>
				</li>
				<li role="none">
					<button
						type="button"
						role="menuitem"
						class="w-full rounded px-2 py-1.5 text-left text-xs text-ink hover:bg-surface-alt"
						onclick={() => {
							noteAssignTileId = tileMenuTile.id;
							noteAssignQuery = '';
							closeTileMenu();
						}}
					>
						Change note
					</button>
				</li>
				<li role="none" class="px-2 py-1 text-2xs font-semibold text-ink-faint">Content depth</li>
				<li role="none" class="space-y-1 px-2 pb-1">
					{#each [{ key: 'title', label: 'Title only' }, { key: 'summary', label: 'Summary' }, { key: 'full', label: 'Full' }] as depthOption (depthOption.key)}
						<label class="flex items-center gap-2 text-xs text-ink">
							<input
								type="radio"
								name={`tile-depth-${tileMenuTile.id}`}
								checked={(tileMenuTile.previewDepth ?? 'summary') === depthOption.key}
								onchange={() =>
									setTileDepth(tileMenuTile.id, depthOption.key as 'title' | 'summary' | 'full')}
							/>
							<span>{depthOption.label}</span>
						</label>
					{/each}
				</li>
			{/if}
			{#if resolveSessionBoardTileType(tileMenuTile) === 'combat'}
				<li role="none"><div class="my-1 border-t border-border/70"></div></li>
				<li role="none">
					<button
						type="button"
						role="menuitem"
						class="w-full rounded px-2 py-1.5 text-left text-xs text-ink hover:bg-surface-alt"
						onclick={() => {
							if (!activeBoard) return;
							void sessionBoardsState.updateTile(activeBoard.id, tileMenuTile.id, {
								combat: createDefaultCombatState(),
							});
							closeTileMenu();
						}}
					>
						Reset combat
					</button>
				</li>
				<li role="none">
					<button
						type="button"
						role="menuitem"
						class="w-full rounded px-2 py-1.5 text-left text-xs text-ink hover:bg-surface-alt"
						onclick={() => {
							toastState.info('Encounter log export is available inside the combat tile.');
							closeTileMenu();
						}}
					>
						Export encounter log
					</button>
				</li>
			{/if}
		</ul>
	</Popover>
{/if}

<ConfirmDialog
	open={!!removeConfirmTileId}
	title="Remove tile?"
	message="This tile will be removed from the board."
	confirmText="Remove tile"
	oncancel={() => (removeConfirmTileId = null)}
	onconfirm={() => {
		if (!removeConfirmTileId) return;
		void removeTile(removeConfirmTileId);
		removeConfirmTileId = null;
	}}
/>

{#if noteAssignTile}
	<div class="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
		<div
			class="w-full max-w-2xl max-h-[80vh] rounded-lg border border-border bg-surface-elevated shadow-lg flex flex-col"
			role="dialog"
			aria-modal="true"
			aria-label="Change note"
			use:focusTrap
		>
			<div class="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
				<h2 class="text-sm font-semibold text-ink">Choose note</h2>
				<button
					type="button"
					class="rounded border border-border px-2 py-1 text-xs hover:bg-surface-alt"
					onclick={() => {
						noteAssignTileId = null;
						noteAssignQuery = '';
					}}
				>
					Close
				</button>
			</div>
			<div class="p-3 space-y-2 overflow-hidden flex-1 min-h-0">
				<input
					type="text"
					bind:value={noteAssignQuery}
					class="w-full rounded border border-border bg-surface px-2.5 py-1.5 text-sm"
					placeholder="Search notes"
				/>
				<div class="min-h-0 flex-1 overflow-y-auto rounded border border-border/70 p-1 space-y-1">
					{#if noteAssignOptions.length === 0}
						<div class="px-2 py-2 text-xs text-ink-faint">No matching notes.</div>
					{:else}
						{#each noteAssignOptions as note (note.id)}
							<button
								type="button"
								class="w-full rounded border border-transparent px-2 py-1.5 text-left text-sm hover:border-border hover:bg-surface-alt"
								onclick={() => assignNoteToTile(noteAssignTile.id, note.id)}
							>
								<div class="truncate text-ink">{note.title}</div>
								{#if note.tags.length > 0}
									<div class="truncate text-2xs text-ink-faint">
										#{note.tags.slice(0, 3).join(' #')}
									</div>
								{/if}
							</button>
						{/each}
					{/if}
				</div>
				{#if resolveSessionBoardTileType(noteAssignTile) === 'note' && noteAssignTile.noteId}
					<button
						type="button"
						class="self-start rounded border border-border px-2 py-1 text-xs text-ink-muted hover:bg-surface-alt"
						onclick={() => clearTileNote(noteAssignTile.id)}
					>
						Clear assigned note
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}

<div class="sr-only" aria-live="polite">{resizeAnnouncement}</div>
<div class="sr-only" aria-live="assertive">{keyboardMoveAnnouncement}</div>

{#if overlayNote}
	<div
		class="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4"
		role="dialog"
		aria-modal="true"
		aria-label="Session board note preview"
		use:focusTrap
	>
		<div
			class="w-full max-w-5xl max-h-[85vh] rounded-lg border border-border bg-surface-elevated shadow-lg flex flex-col"
		>
			<div class="px-4 py-3 border-b border-border flex items-center gap-2">
				<h2 class="text-base font-semibold truncate flex-1">{overlayNote.title}</h2>
				<button
					class="px-2.5 py-1 rounded text-xs border border-border"
					onclick={() => {
						overlayNoteId = null;
						void goto(resolve(`/knowledge/notes/${overlayNote.id}`), {
							state: { label: overlayNote.title },
						});
					}}>View in Knowledge</button
				>
				<button
					class="px-2.5 py-1 rounded text-xs border border-border"
					onclick={() => (overlayNoteId = null)}>Close</button
				>
			</div>
			<div class="p-4 overflow-y-auto min-h-0">
				<div class="markdown-content" role="document" bind:this={overlayContentEl}>
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html overlayHtml}
				</div>
			</div>
		</div>
	</div>
{/if}
